// ============================================================================
// 구조 판본 «사전 갱신» 전용 Intrinio 호출 관문 (2026-10-13)
// ----------------------------------------------------------------------------
// 왜: 구조 판본 사전 갱신(/api/cron/structure-warm)은 종목당 Intrinio 를 13~28번 부른다(실측 XOM 14 · NVDA 21 · SPY 28).
//   Intrinio 계약은 분당 2,000콜(ACCESS-RUNBOOK)이고 화면·수집 Lambda 와 나눠 쓴다 — 예열이 그 한도를 태우면 사용자 화면이 «빈 응답»을 받는다
//   (9/4 사고: 초과분은 4xx 가 아니라 빈 응답으로 온다). 그래서 예열의 호출만 이 관문을 지난다:
//     · 호출 시작 간격(초당 상한) · 동시 호출 수 · 429/빈 응답/연속 오류가 나면 물러섰다 다시(백오프) · 계속 나면 중단(나머지는 기존 SWR 에 남긴다).
// 어떻게: AsyncLocalStorage — `runInWarmGate(gate, fn)` 안에서 시작된 비동기 흐름만 관문을 본다. 사용자 경로(저장소 없음)의 callIntrinio 는
//   한 줄도 달라지지 않는다(intrinioClient 의 callIntrinio 가 `warmGateStore.getStore()` 가 있을 때만 enter/leave 를 부른다).
// 순수에 가깝게: 시계·잠자기를 주입할 수 있어 시험이 실제 시간을 기다리지 않는다.
// ============================================================================
import { AsyncLocalStorage } from 'node:async_hooks';

export type WarmGateOpts = {
  /** 호출 «시작»의 초당 상한 */
  maxPerSec: number;
  /** 동시에 날아가 있는 호출 수 상한 */
  maxConcurrent: number;
  /** 429·빈 응답 «사건» 뒤 쉬는 시간(ms) — 사건 n번째는 [n-1] (넘치면 마지막 값) */
  backoffMs: number[];
  /** 사건이 이만큼 쌓이면 관문을 닫는다(나머지는 기존 SWR) */
  maxIncidents: number;
  /** 연속 오류(5xx·네트워크·타임아웃)가 이만큼이면 사건 하나로 센다 */
  errorStreakIncident?: number;
  /** 연속 «빈 응답»이 이만큼이면 사건 하나로 센다(예산 초과의 지문 — 한 번의 빈 응답은 실제로 빈 결과일 수 있다: 실시간 그릭스가 없는 종목의 contracts: []) */
  emptyStreakIncident?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type WarmGateStats = {
  /** 실제로 벤더로 나간 호출 수(캐시 적중·합치기는 세지 않는다) */
  calls: number;
  status429: number;
  empties: number;
  errors: number;
  incidents: number;
  /** 백오프로 쉰 시간 합(ms) */
  pausedMs: number;
  aborted: boolean;
};

export class WarmGateAborted extends Error {
  constructor() { super('warm-gate-aborted'); this.name = 'WarmGateAborted'; }
}

export type WarmGate = {
  enter(): Promise<void>;
  leave(r: { status: number; empty: boolean }): void;
  /** 닫혔는가(사건이 maxIncidents 에 닿음 또는 수동 close) */
  readonly aborted: boolean;
  close(): void;
  stats(): WarmGateStats;
};

export const warmGateStore = new AsyncLocalStorage<WarmGate>();

/** fn 안(과 거기서 시작된 비동기)의 callIntrinio 만 이 관문을 지난다. */
export function runInWarmGate<T>(gate: WarmGate, fn: () => Promise<T>): Promise<T> {
  return warmGateStore.run(gate, fn);
}

export function createWarmGate(o: WarmGateOpts): WarmGate {
  const now = o.now ?? (() => Date.now());
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const minGapBase = 1000 / Math.max(0.1, o.maxPerSec);
  const streakAt = o.errorStreakIncident ?? 5;
  const emptyAt = o.emptyStreakIncident ?? 3;
  let emptyStreak = 0;
  let gap = minGapBase;            // 사건이 날 때마다 두 배로 늘린다(속도를 줄여 다시)
  let nextStartAt = 0;             // 다음 호출을 시작해도 되는 가장 이른 시각
  let pauseUntil = 0;
  let inflight = 0;
  let errStreak = 0;
  let closed = false;
  const waiters: Array<() => void> = [];
  const st: WarmGateStats = { calls: 0, status429: 0, empties: 0, errors: 0, incidents: 0, pausedMs: 0, aborted: false };

  const incident = () => {
    st.incidents++;
    const b = o.backoffMs[Math.min(st.incidents - 1, o.backoffMs.length - 1)] ?? 15000;
    pauseUntil = Math.max(pauseUntil, now() + b);
    gap = Math.min(gap * 2, 4000);
    if (st.incidents >= o.maxIncidents) { closed = true; st.aborted = true; wakeAll(); }
  };
  const wakeAll = () => { while (waiters.length) waiters.shift()!(); };

  return {
    get aborted() { return closed; },
    close() { closed = true; st.aborted = true; wakeAll(); },
    stats: () => ({ ...st }),
    async enter() {
      if (closed) throw new WarmGateAborted();
      // 동시성 슬롯
      while (inflight >= o.maxConcurrent) {
        await new Promise<void>((r) => waiters.push(r));
        if (closed) throw new WarmGateAborted();
      }
      inflight++;
      try {
        // 백오프 중이면 기다린다
        for (;;) {
          if (closed) throw new WarmGateAborted();
          const t = now();
          const wait = Math.max(pauseUntil - t, nextStartAt - t);
          if (wait <= 0) break;
          if (pauseUntil > t) st.pausedMs += Math.min(wait, pauseUntil - t);
          await sleep(wait);
        }
        nextStartAt = now() + gap;
      } catch (e) {
        inflight--;
        const w = waiters.shift(); if (w) w();
        throw e;
      }
    },
    leave(r) {
      inflight = Math.max(0, inflight - 1);
      st.calls++;
      if (r.status === 429) { st.status429++; errStreak = 0; emptyStreak = 0; incident(); }
      else if (r.status >= 200 && r.status < 300 && r.empty) {
        st.empties++; errStreak = 0; emptyStreak++;
        if (emptyStreak >= emptyAt) { emptyStreak = 0; incident(); }
      }
      else if (r.status === 0 || r.status >= 500 || r.status === 408 || r.status === 425) {
        st.errors++; errStreak++;
        if (errStreak >= streakAt) { errStreak = 0; incident(); }
      } else { errStreak = 0; if (r.status >= 200 && r.status < 300) emptyStreak = 0; }
      const w = waiters.shift(); if (w) w();
    },
  };
}
