// ============================================================================
// 구조 판본 «사전 갱신» 계획 — 순수 함수(네트워크·Redis 없음). 시험: tests/structureWarm.test.ts
// ----------------------------------------------------------------------------
// 무엇을: 공급사(Intrinio)가 새 옵션 EOD 레코드(장 마감 약 45분 뒤)를 내보낸 뒤, 상위 종목의 `structure:v2:{T}` 판본을 미리 다시 계산한다.
//   (실측 10/12 12시 ET 첫 요청: 인기 57종목 중 17%·무작위 68종목 중 71%가 12시간 넘게 낡은 판본, 12%·31%는 공급사 최신보다 한 레코드 뒤 — 보고서 LEVELS-AUDIT-2026-10-13 §4 D1)
// 왜 이 모양인가:
//   · 사용자 경로는 건드리지 않는다 — 크론이 «응답 뒤 갱신과 같은 계산»을 미리 돌릴 뿐이다(동기 계산 없음).
//   · 대상은 «새 레코드가 필요한 판본»만(공급사 최신 날짜보다 체인 날짜가 이른 것 · 날짜 없는 판본은 레코드 공표 시각보다 먼저 만든 것).
//   · 호출량은 호출 관문(lib/intrinioWarmGate)이 막는다: 초당 2콜·동시 1콜(= 분당 120콜 = 계약 2,000콜/분의 6%). 429·빈 응답이 나면 물러서고, 계속 나면 멈춰 나머지는 기존 SWR 에 남긴다.
//   · 사용자 요청 우선(10/13 긴급): 직전 1분에 사용자 경로(그 밖 호출)가 429 를 받았으면 실행하지 않고, 도는 중이면 즉시 멈춘다(lib/intrinioMeter).
//   · 시각: 애프터마켓이 끝난 뒤(20:05 ET)부터 프리마켓 전(07:00 ET)까지만 — 미국 정규장·시간외 중에는 돌지 않는다.
//   · 단일 실행: Redis 잠금(SET NX EX) — 이미 돌고 있으면 건너뛴다.
//   · 끄는 스위치: Redis 키 `structure-warm:off` 하나(값이 있으면 꺼짐).
// ============================================================================
import { etWallToMs } from '@/lib/earningsWeek';
import { etMinutesOf, etLastClosedSessionDate } from '@/lib/marketCalendar';

/** 있으면 사전 갱신이 꺼진다(어떤 값이든). 끄기: SET structure-warm:off 1 · 켜기: DEL structure-warm:off */
export const WARM_OFF_KEY = 'structure-warm:off';
/** 마지막 실행 요약(상태 확인·측정용, 3일) */
export const WARM_LAST_KEY = 'structure-warm:last';
/** 공급사 날짜별 상태 { tries: { [ticker]: 시도 횟수 } } (3일) */
export const warmStateKey = (vendorEod: string) => `structure-warm:state:${vendorEod}`;
export const WARM_STATE_TTL_SEC = 3 * 24 * 3600;

/** structure-build 가 굽는 조각(종목별 총 미결제약정 oi 포함) — 인기 순위의 한 입력. app/api/cron/structure-build 의 partKey 와 같은 키여야 한다(시험이 대조). */
export const WARM_PART_KEY = (i: number) => `structure:part:v2:${i}`;
export const WARM_PARTS = 8;

export const WARM_TARGETS = 300;
/** 호출 관문 설정 — 초당 2콜 · 동시 1콜 · 사건(429/빈 응답 연속/오류 연속) 뒤 15초→30초→60초 쉼 · 사건 3번이면 중단
 *  (10/13 긴급: 4콜·동시 2 → 2콜·동시 1. 분당 120콜 = 계약 2,000콜/분의 6%. 300종목 완주 약 48분, 실행당 약 20종목이라 15분 간격 14번 안팎) */
export const WARM_RATE_PER_SEC = 2;
export const WARM_CONCURRENCY = 1;
export const WARM_BACKOFF_MS = [15_000, 30_000, 60_000];
export const WARM_MAX_INCIDENTS = 3;
/** 한 번의 실행이 새 종목을 시작하는 시간(라우트 maxDuration 300초 — 진행 중 종목이 백오프 60초를 만나도 끝나도록 100초 남긴다) · 종목 수 상한 */
export const WARM_RUN_BUDGET_MS = 200_000;
export const WARM_MAX_PER_RUN = 40;
/** 같은 공급사 날짜에 한 종목을 이만큼까지만 다시 시도한다(공급사가 그 종목만 늦은 경우 헛호출 상한) */
export const WARM_MAX_TRIES = 2;
/** 공급사 EOD 레코드가 «확실히 올라온» 뉴욕 시각 — 날짜 없는 판본이 이 시각보다 먼저 만들어졌으면 새 레코드를 못 본 것이다.
 *  관측: 10/9 레코드가 10/9 16:45:48 ET 에 처음 저장됐고(levels:vendor-eod) Intrinio 스냅샷 목록의 시각은 16:05 ET 다. */
export const WARM_READY_ET = '16:50';

/** 인기·검색·내 종목이 몰리는 ETF — 서버는 검색·내 종목 열람을 세지 않아(워치리스트는 기기 안 저장) 고정으로 앞에 둔다 */
export const WARM_PINNED = ['SPY', 'QQQ', 'IWM', 'DIA', 'SMH', 'XLK', 'XLF', 'XLE', 'TLT', 'GLD', 'SLV', 'TQQQ', 'SOXL'];

const TICKER = /^[A-Z][A-Z0-9.]{0,6}$/;
const clean = (t: unknown): string | null => { const s = String(t ?? '').toUpperCase().trim(); return TICKER.test(s) ? s : null; };

export type WarmInfo = {
  hasVersion: boolean;
  chainDate: string | null;
  timestamp: number | null;
  status: string | null;
  usable: boolean;
  legacy: boolean;
};

/** 공급사 EOD 날짜 D 의 레코드가 «확실히 올라온» 시각(ms). 모양이 틀리면 null. */
export function warmReadyAtMs(vendorEod: string): number | null {
  return etWallToMs(String(vendorEod).slice(0, 10), WARM_READY_ET);
}

/**
 * 이 판본에 공급사 새 레코드(vendorEod)가 필요한가.
 *  · 판본이 없거나 쓸 수 없거나(만기 지남) 옛 모양이면 필요.
 *  · 옵션 없음(NO_MARKET)은 새 레코드가 있어도 값이 없으니 필요 없음(기존 3분 재확인이 맡는다).
 *  · 체인 날짜가 있으면 vendorEod 보다 이를 때. 날짜가 없으면(옛 수집기 프로브) 레코드 공표 시각보다 먼저 만든 판본일 때.
 */
export function needsWarm(info: WarmInfo | undefined | null, vendorEod: string, readyAtMs: number | null): boolean {
  if (!info) return true;
  if (!info.hasVersion || !info.usable || info.legacy) return true;
  if (info.status === 'NO_MARKET') return false;
  const d = String(vendorEod).slice(0, 10);
  if (info.chainDate) return info.chainDate < d;
  if (readyAtMs == null) return false;
  return info.timestamp == null || info.timestamp < readyAtMs;
}

export type WarmDemandInput = {
  /** 실제 열람 수요(딥 분석 열람 최근 7일, 하루 0.8배 감쇠) — 점수 높은 순 */
  demand: Array<{ ticker: string; score: number }>;
  /** 종목별 총 미결제약정(structure-build 조각) */
  oi: Map<string, number>;
  /** 핵심 종목(data/stock_universe_us300.json) */
  core: string[];
  pinned: string[];
};

/**
 * 사전 갱신 대상 우선순위 — 고정 ETF → 실제 열람 수요 → 핵심 종목(미결제약정 큰 순) → 그 밖(미결제약정 큰 순). 중복 없이 n 개.
 * (검색·내 종목 열람 집계는 서버에 없다 — 워치리스트는 기기 안에 저장된다. 집계가 생기면 demand 에 합치면 된다.)
 */
export function buildWarmTargets(inp: WarmDemandInput, n = WARM_TARGETS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (t: unknown) => { const T = clean(t); if (T && !seen.has(T)) { seen.add(T); out.push(T); } };
  const oi = (t: string) => inp.oi.get(t) ?? -1;
  for (const t of inp.pinned) push(t);
  for (const d of [...inp.demand].sort((a, b) => b.score - a.score || (a.ticker < b.ticker ? -1 : 1))) push(d.ticker);
  const coreSet = new Set(inp.core.map(clean).filter(Boolean) as string[]);
  const coreSorted = [...coreSet].sort((a, b) => oi(b) - oi(a) || (a < b ? -1 : 1));
  for (const t of coreSorted) push(t);
  const rest = [...inp.oi.keys()].filter((t) => !coreSet.has(t)).sort((a, b) => oi(b) - oi(a) || (a < b ? -1 : 1));
  for (const t of rest) push(t);
  return out.slice(0, Math.max(0, n));
}

export type WarmBatch = {
  /** 새 레코드가 필요한 종목 전부(우선순위 순) */
  needing: string[];
  /** 이번 실행에서 갱신할 종목(needing 앞부분, 시도 횟수 상한을 넘은 종목 제외) */
  batch: string[];
  /** 시도 상한에 걸려 건너뛴 종목 */
  exhausted: string[];
};

export function pickWarmBatch(
  order: string[],
  infos: Map<string, WarmInfo>,
  vendorEod: string,
  readyAtMs: number | null,
  tries: Record<string, number>,
  opts: { maxTries?: number; maxPerRun?: number } = {},
): WarmBatch {
  const maxTries = opts.maxTries ?? WARM_MAX_TRIES;
  const maxPerRun = opts.maxPerRun ?? WARM_MAX_PER_RUN;
  const needing = order.filter((t) => needsWarm(infos.get(t), vendorEod, readyAtMs));
  const exhausted = needing.filter((t) => (tries[t] ?? 0) >= maxTries);
  const ex = new Set(exhausted);
  const batch = needing.filter((t) => !ex.has(t)).slice(0, Math.max(0, maxPerRun));
  return { needing, batch, exhausted };
}

export type WarmOutcome = 'ok' | 'behind' | 'fail' | 'skip';

/**
 * 갱신 한 건의 결과 분류.
 *  ok = 저장됐고 체인 날짜가 vendorEod 이상(또는 날짜 없음) · behind = 저장됐지만 공급사가 그 종목만 아직 새 레코드를 안 냄 ·
 *  fail = 저장 안 됨/오류 · skip = 다른 요청이 방금 갱신 중(시도로 세지 않는다).
 */
export function classifyWarmResult(r: { outcome: string; chainDate: string | null }, vendorEod: string): WarmOutcome {
  if (r.outcome === 'skipped-lock') return 'skip';
  if (r.outcome !== 'stored') return 'fail';
  if (r.chainDate && r.chainDate < String(vendorEod).slice(0, 10)) return 'behind';
  return 'ok';
}

/** 시도 횟수 갱신(순수) — fail·behind 만 센다. */
export function bumpTries(tries: Record<string, number>, ticker: string, outcome: WarmOutcome): Record<string, number> {
  if (outcome !== 'fail' && outcome !== 'behind') return tries;
  return { ...tries, [ticker]: (tries[ticker] ?? 0) + 1 };
}

/** structure-build 조각 행들에서 종목별 총 미결제약정을 뽑는다(여러 조각 합침, 큰 값 우선). */
export function oiMapFromParts(parts: Array<{ rows?: Array<{ t?: unknown; oi?: unknown }> } | null | undefined>): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of parts) for (const r of p?.rows || []) {
    const T = clean(r?.t); const v = Number(r?.oi);
    if (T && Number.isFinite(v) && v > 0 && v > (m.get(T) ?? 0)) m.set(T, v);
  }
  return m;
}

// ── 실행 시각 창 (10/13 긴급) ────────────────────────────────────────────
/** 창이 열리는 뉴욕 시각 — 애프터마켓(~20:00 ET)이 끝난 5분 뒤 */
export const WARM_WINDOW_OPEN_ET_MIN = 20 * 60 + 5;
/** 창이 닫히는 뉴욕 시각 — 프리마켓(04:00~) 한복판이 되기 전 07:00 ET */
export const WARM_WINDOW_CLOSE_ET_MIN = 7 * 60;

/** 지금이 사전 갱신을 돌려도 되는 때인가 — 20:05 ET ~ 다음 날 07:00 ET (서머타임/표준시는 ET 시계가 알아서). 정규장·시간외에는 false. */
export function warmWindowOpen(ms: number): boolean {
  const m = etMinutesOf(ms);
  return m >= WARM_WINDOW_OPEN_ET_MIN || m < WARM_WINDOW_CLOSE_ET_MIN;
}

/** 이 시각에 «공급사가 이미 내보냈어야 하는» 가장 늦은 EOD 날짜 = 마지막으로 끝난 정규장 날짜 */
export function expectedVendorDate(ms: number): string {
  return etLastClosedSessionDate(ms);
}

/** 오늘 끝났다는 표식 — 이 값이 expectedVendorDate 와 같으면 공급사에 아무것도 묻지 않고 건너뛴다 */
export const WARM_DONE_KEY = 'structure-warm:done';
