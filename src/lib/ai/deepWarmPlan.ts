/**
 * 딥 분석 예열(/api/cron/ai-warm) «계획» — 순수 함수 (2026-10-12, 대표 승인 REPORT §3 ④)
 *
 * 무엇: 장중 평일, 인기 종목 상위 20개의 딥 분석(Sonnet 5.5)을 «개장 직후»에 미리 만들어 둔다.
 *   처음 여는 종목은 광고 30초 + 생성 23초(p50)를 기다렸다(INTERNAL-MEASURE §2.5). 예열된 종목은 캐시 읽기(1초 안)로 뜬다.
 * 상한: Sonnet 일일 상한(llmLadder DeepAnalysis.sonnet.dailyCapUsd, $3.5 · UTC 날짜)의 «50%»까지만 쓴다 —
 *   오늘 Sonnet 사용액(사용자 + 예열)이 50%에 닿으면 예열은 멈춘다. 나머지 50%는 언제나 사용자 몫이다.
 * 라운드: 뉴욕 09:35(개장 직후)·10:35 — 한국 22:35·23:35(서머타임). 라운드마다 하루 한 번. 캐시가 살아 있는 종목은 부르지 않는다.
 */
import { PREWARM_TICKERS } from '@/lib/ai/creditPacing';

/** 인기 종목 상위 20 — 크레딧 조절기·내 종목 AI 한 줄 예열과 같은 목록의 앞 20개(앱 칩 순서 NVDA·TSLA·AAPL…) */
export const DEEP_WARM_TICKERS: readonly string[] = PREWARM_TICKERS.slice(0, 20);

/** 예열이 쓸 수 있는 몫 — 일일 상한 대비 */
export const DEEP_WARM_SHARE = 0.5;
/** 생성 한 번의 예상 비용($) — Sonnet 5.5 딥 분석 실측 호출당 $0.054(llmLadder 주석) + 여유 */
export const DEEP_WARM_EST_CALL_USD = 0.06;
/** 동시에 만드는 수 — 라우트 하나가 23초 안팎이라 3개씩 */
export const DEEP_WARM_CONCURRENCY = 3;

export interface WarmRound { id: string; fromMin: number; toMin: number }
/** 라운드 창(뉴욕 시각, 분) — 창 안의 첫 크론이 라운드를 돈다 */
export const DEEP_WARM_ROUNDS: readonly WarmRound[] = [
  { id: 'open', fromMin: 9 * 60 + 35, toMin: 10 * 60 + 30 },
  { id: 'r2', fromMin: 10 * 60 + 35, toMin: 11 * 60 + 30 },
];

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
export function etMinutes(nowMs: number): number {
  const p = ET.formatToParts(new Date(nowMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return g('hour') * 60 + g('minute');
}

/** 지금 돌 라운드(이미 돈 라운드는 빼고) — 없으면 null */
export function dueRound(nowMs: number, done: ReadonlySet<string>): WarmRound | null {
  const m = etMinutes(nowMs);
  return DEEP_WARM_ROUNDS.find((r) => m >= r.fromMin && m < r.toMin && !done.has(r.id)) ?? null;
}

/** 오늘 Sonnet 사용액 spent($), 날아가는 생성 inflight 개일 때 하나 더 만들어도 되나 — 예열 몫(상한×50%) 안에서만 */
export function warmBudgetAllows(spentUsd: number, capUsd: number, inflight = 0): boolean {
  if (!(capUsd > 0)) return false;
  if (!Number.isFinite(spentUsd)) return false;   // 사용액을 못 읽으면 돌지 않는다(사용자 몫을 지키는 쪽으로)
  const spent = spentUsd > 0 ? spentUsd : 0;
  return spent + (inflight + 1) * DEEP_WARM_EST_CALL_USD <= capUsd * DEEP_WARM_SHARE + 1e-9;
}

/** 저장된 딥 분석(신뢰 경로 v3)이 «아직 쓸 만한가» — 있고, 이 나이(기본 25분)보다 어리면 부르지 않는다 */
export function warmCacheFresh(cached: any, nowMs: number, maxAgeMs = 25 * 60_000): boolean {
  if (!cached || cached.trust !== 1 || !cached.tpl) return false;
  const at = Date.parse(String(cached.generatedAt || ''));
  return Number.isFinite(at) && nowMs - at >= 0 && nowMs - at < maxAgeMs;
}
