import type { NextRequest } from 'next/server';
import { giftStore, type GiftStore } from './server';
import { BUMP_LUA, validEvent, validClientEvent, funnelKey, field, kstDay } from './funnel.cjs';
import { FUNNEL_LIMITS, createFunnelAdmission, funnelBuckets } from './funnelGuard';

/** 시계·저장소 주입은 오프라인 대량/다중 인스턴스 시험용. 운영은 아래 싱글턴만 사용. */
export function createGiftFunnelRecorder(store: () => GiftStore | null = giftStore, now = Date.now) {
  // 클라이언트가 서버 확정 단계의 몫을 소진하지 못하게 분리한다.
  const admission = { client: createFunnelAdmission(), server: createFunnelAdmission() };
  const capped = { client: '', server: '' };
  return (req: NextRequest, stage: string, surface: string, platform: string, detail = 'all') => {
    try {
      const lane = ['open', 'redeem', 'claim', 'issue'].includes(stage) ? 'server' : 'client';
      if (!(lane === 'client' ? validClientEvent : validEvent)(stage, surface, platform, detail)) return null;
      const at = now(), day = kstDay(at);
      if (capped[lane] === day) return null;
      const buckets = funnelBuckets(req, day);
      if (!buckets || !admission[lane](...buckets, day, at)) return null;
      // 서버 시각의 오늘 키 하나만. 날짜/식별자/필드명을 요청에서 받지 않는다.
      const expires = Math.floor(Date.parse(`${day}T00:00:00+09:00`) / 1000) + FUNNEL_LIMITS.retentionDays * 86400;
      return async (): Promise<void> => {
        try {
          const result = await store()?.eval(BUMP_LUA, [funnelKey(day, process.env.VERCEL_ENV === 'production')],
            [field(stage, surface, platform, detail), expires, lane, FUNNEL_LIMITS.day,
              Math.floor(at / 60000), ...buckets, FUNNEL_LIMITS.ipMinute, FUNNEL_LIMITS.deviceMinute]);
          // 공유 예산 소진을 본 프로세스는 당일 추가 EVAL도 보내지 않는다.
          if (result === -1) capped[lane] = day;
        } catch { /* 계측 실패가 응답·배정을 바꾸지 않는다. 재시도하지 않는다. */ }
      };
    } catch { return null; } // 계측 준비 오류도 기존 서버 응답을 바꾸지 않는다.
  };
}
export const giftFunnelTask = createGiftFunnelRecorder();
