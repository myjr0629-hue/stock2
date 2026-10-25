import type { NextRequest } from 'next/server';
import { giftStore, type GiftStore } from './server';
import { BUMP_LUA, validEvent, validClientEvent, funnelKey, field, kstDay } from './funnel.cjs';
import { FUNNEL_LIMITS, createFunnelAdmission, funnelBuckets } from './funnelGuard';

type Lane = 'client' | 'server';
type LaneState = {
  day: string; pending: Map<string, number>; inflight: boolean; inflightAt: number;
  lastCall: number; calls: number; capped: string; gen: number; admission: ReturnType<typeof createFunnelAdmission>;
};
const realSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * 요청은 «인스턴스 메모리 묶음»에 1을 더할 뿐 Upstash 를 호출하지 않는다.
 * 레인별로 한 번에 EVAL 1개만 날고(in-flight 1), 간격 flushMs·인스턴스 일일 instanceCalls 를 넘지 않는다.
 * Redis 쪽 _calls 천장에 닿아 -1 을 받으면 그 인스턴스는 당일 그 레인 호출 0.
 * → 위조 요청이 몇 건이든, 인스턴스가 몇 개든 하루 EVAL ≤ calls + 인스턴스 수(레인별).
 * 시계·저장소·대기 주입은 오프라인 다중 인스턴스 시험용. 운영은 아래 싱글턴만 사용.
 */
export function createGiftFunnelRecorder(store: () => GiftStore | null = giftStore, now = Date.now, sleep = realSleep) {
  const fresh = (): LaneState => ({ day: '', pending: new Map(), inflight: false, inflightAt: 0, lastCall: -Infinity, calls: 0, capped: '', gen: 0, admission: createFunnelAdmission() });
  // 클라이언트 위조가 서버 확정 단계의 몫·호출을 소진하지 못하게 레인을 분리한다.
  const lanes: Record<Lane, LaneState> = { client: fresh(), server: fresh() };

  const drain = async (lane: Lane, gen: number): Promise<void> => {
    const st = lanes[lane];
    try {
      for (let round = 0; round < FUNNEL_LIMITS.chain; round++) {
        const wait = st.lastCall + FUNNEL_LIMITS.flushMs - now();
        if (wait > 0) await sleep(Math.min(wait, FUNNEL_LIMITS.flushMs));
        const day = st.day;
        if (st.gen !== gen || !st.pending.size || st.capped === day || st.calls >= FUNNEL_LIMITS.instanceCalls) break;
        const batch = [...st.pending];
        st.pending = new Map();
        const db = store();
        if (!db) break;
        st.calls++; st.lastCall = now(); st.inflightAt = st.lastCall;
        const expires = Math.floor(Date.parse(`${day}T00:00:00+09:00`) / 1000) + FUNNEL_LIMITS.retentionDays * 86400;
        let result: unknown;
        try {
          result = await db.eval(BUMP_LUA, [funnelKey(day, process.env.VERCEL_ENV === 'production')],
            [expires, lane, FUNNEL_LIMITS.day, FUNNEL_LIMITS.calls, ...batch.flat()]);
        } catch { break; } // 계측 실패가 응답·배정을 바꾸지 않는다. 재시도하지 않는다(묶음은 버린다).
        // 전역 천장 도달: 당일 이 레인은 메모리 적재·호출 모두 0.
        if (result === -1) { st.capped = day; st.pending.clear(); break; }
      }
    } finally { if (st.gen === gen) st.inflight = false; } // 교대된 옛 작업은 새 작업의 표식을 지우지 않는다.
  };

  return (req: NextRequest, stage: string, surface: string, platform: string, detail = 'all'): (() => Promise<void>) | null => {
    try {
      const lane: Lane = ['open', 'redeem', 'claim', 'issue'].includes(stage) ? 'server' : 'client';
      if (!(lane === 'client' ? validClientEvent : validEvent)(stage, surface, platform, detail)) return null;
      // 운영 차단 스위치: GIFT_FUNNEL_CLIENT=0 이면 클라이언트 레인은 메모리 적재·호출 모두 0(서버 지점만 집계).
      if (lane === 'client' && process.env.GIFT_FUNNEL_CLIENT === '0') return null;
      const st = lanes[lane];
      const at = now(), day = kstDay(at);
      // KST 자정: 묶음·인스턴스 호출 수를 새 날로. 서버 시각의 오늘 키 하나만 쓴다(요청에서 날짜를 받지 않는다).
      if (st.day !== day) { st.day = day; st.pending = new Map(); st.calls = 0; }
      if (st.capped === day || st.calls >= FUNNEL_LIMITS.instanceCalls) return null;
      const buckets = funnelBuckets(req, day);
      if (!buckets || !st.admission(...buckets, day, at)) return null;
      const name = field(stage, surface, platform, detail);
      if (!st.pending.has(name) && st.pending.size >= FUNNEL_LIMITS.batchFields) return null;
      st.pending.set(name, (st.pending.get(name) || 0) + 1);
      // 이미 날고 있는 배출 작업이 이 몫까지 이어서 가져간다. 멈춘 작업(staleMs)만 교대한다.
      if (st.inflight && at - st.inflightAt < FUNNEL_LIMITS.staleMs) return null;
      st.inflight = true; st.inflightAt = at;
      const gen = ++st.gen;
      return () => drain(lane, gen);
    } catch { return null; } // 계측 준비 오류도 기존 서버 응답을 바꾸지 않는다.
  };
}
export const giftFunnelTask = createGiftFunnelRecorder();
