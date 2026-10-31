// ============================================================================
// 앱 실적 캘린더의 «옵션 반영 변동폭» 묶음 — 만들기·읽기 (2026-10-12)
//
// 왜 «묶음»인가: 캘린더는 160여 행이다. 행마다 구조 사본 2키 + 수집기 체인 1키(0~35 DTE, 큰 값)를 사용자 요청마다 읽으면
//   요청 하나가 수 MB 를 읽는다. 그래서 같은 문(readImpliedMoveRows — 웹 /earnings-week·GET /api/options/implied-move 와
//   같은 저장본·같은 규칙)으로 «응답 뒤»나 크론에서 한 번 읽어, 행마다 숫자 다섯 개만 남긴 작은 묶음(약 10KB)을 둔다.
//   사용자 경로는 이 묶음 GET 한 번뿐이다.
//
// 구조 재계산 0 · AI 0. 일반 읽기는 묶음 GET 하나. 갱신 때만 45일 내 결측 행의 월간 체인을 기존 Intrinio 어댑터로 조회한다.
// 월간 판독값/실패 확인은 종목·만기별 1시간 재사용하며 기존 TTL 캐시(EC2 우선, 장애 시 공통 폴백)에 36시간 저장한다.
// 갱신: 장중 5분 · 그 밖 60분 · ET 날짜가 바뀌면 바로(lib/earnings/earningsImplied.impliedPackStale).
//   여러 인스턴스가 동시에 만들지 않게 단일 Upstash SET NX EX 90초 잠금(실패 시 갱신 안 함).
// ============================================================================

import { getFromCache, setInCache } from '@/services/redisClient';
import { acquireEarningsImpliedLock } from '@/services/earningsImpliedLock';
import { readImpliedMoveRows } from '@/services/impliedMoveService';
import { etDateString } from '@/lib/impliedMove';
import { etDateOf } from '@/lib/marketCalendar';
import {
  EARNINGS_IMPLIED_KEY, impliedPackWorthSaving, impliedRowKey, mergeImpliedPacks, timingOfHour, type ImpliedCell, type ImpliedPack,
} from '@/lib/earnings/earningsImplied';

import { withinImpliedDeadline, IMPLIED_REFRESH_BUDGET_MS, IMPLIED_SAVE_RESERVE_MS } from '@/lib/earnings/impliedDeadline';
import { newBgCtx, runWithBg } from '@/lib/intrinioBackground';

const TTL_SEC = 36 * 3600;
/** 한 번에 읽는 종목 수 — readImpliedMoveRows 한 번 = 구조 mget(2키×N) + 필요 시 체인 mget(1키×N) */
const CHUNK = 12;
const CONCURRENCY = 3;

export async function readImpliedPack(): Promise<ImpliedPack | null> {
  try {
    const p = await getFromCache<ImpliedPack>(EARNINGS_IMPLIED_KEY);
    return p && p.v === 1 && p.cells ? p : null;
  } catch {
    return null;
  }
}

/** 행 목록 → 묶음(저장하지 않는다). 순서·중복은 상관없다. */
export async function buildImpliedPack(
  rows: Array<{ ticker: string; date: string; hour?: string | null }>,
  nowMs: number = Date.now(),
  opts: { probeMonthly?: boolean; deadlineMs?: number } = {},
): Promise<ImpliedPack> {
  const deadlineMs = opts.deadlineMs ?? (opts.probeMonthly ? Date.now() + IMPLIED_REFRESH_BUDGET_MS - IMPLIED_SAVE_RESERVE_MS : undefined);
  const today = etDateString(nowMs);
  const seen = new Set<string>();
  const reqs: Array<{ key: string; ticker: string; after: string; timing: ReturnType<typeof timingOfHour> }> = [];
  for (const r of rows) {
    if (!r?.ticker || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || ''))) continue;
    if (r.date < today) continue;
    const key = impliedRowKey(r.ticker, r.date);
    if (seen.has(key)) continue;
    seen.add(key);
    reqs.push({ key, ticker: String(r.ticker).toUpperCase(), after: r.date, timing: timingOfHour(r.hour) });
  }
  // Include unprocessed rows so the merge can retain their dated last-good values.
  const cells: Record<string, ImpliedCell> = Object.fromEntries(reqs.map(c => [c.key, { p: null, e: null, b: null, s: null, r: 'read_failed' }]));
  const chunks: typeof reqs[] = [];
  for (let i = 0; i < reqs.length; i += CHUNK) chunks.push(reqs.slice(i, i + CHUNK));
  let ci = 0;
  // [관문 10200755 ②③] 월간 조회(공급사 호출)는 «배경 갱신 흐름»으로 묶는다 — 첫 429 에서 이 흐름의 나머지 벤더 호출을
  //   보내지 않고(tripOn429·재시도 없음), 시간 예산이 끝나는 순간에도 관문을 닫아 그 뒤로 새 호출이 시작되지 않게 한다
  //   (이미 떠난 요청의 다음 페이지·그릭스 호출 포함). 저장본 읽기(Redis)는 그대로 계속한다.
  //   바깥 흐름의 표식은 건드리지 않는다 — 이 갱신만의 새 표식(안쪽 run 이 바깥을 가린다).
  const bg = opts.probeMonthly ? newBgCtx('earnings:implied-refresh', { noRetry429: true, tripOn429: true }) : null;
  const closeAt = bg && deadlineMs != null ? setTimeout(() => { bg.tripped = true; }, Math.max(0, deadlineMs - Date.now())) : null;
  const work = () => Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
    while (ci < chunks.length) {
      if (deadlineMs != null && Date.now() >= deadlineMs) break;
      const chunk = chunks[ci++];
      let out: Awaited<ReturnType<typeof readImpliedMoveRows>> = [];
      try {
        out = await readImpliedMoveRows(chunk.map((c) => ({ ticker: c.ticker, after: c.after, timing: c.timing })), today, { ...opts, deadlineMs, withFirstExpiry: true });
      } catch {
        out = [];
      }
      chunk.forEach((c, i) => {
        const r = out[i];
        cells[c.key] = r
          ? { p: r.impliedMovePct, e: r.impliedMovePct != null ? r.expiry : null, b: r.basis, s: r.session, r: r.reason, method: r.method ?? null,
            ...(r.eventMovePct != null ? { eventMovePct: r.eventMovePct } : {}),
            ...(typeof r.firstExpiry === 'string' ? { f: r.firstExpiry } : {}) }
          : { p: null, e: null, b: null, s: null, r: 'read_failed' };
      });
    }
  }));
  try {
    if (bg) await runWithBg(bg, work); else await work();
  } finally {
    if (closeAt) clearTimeout(closeAt);
    // 이 묶음이 끝난 뒤 남은 비동기(시간 초과로 버린 조회)도 새 벤더 호출을 시작하지 않는다.
    if (bg) bg.tripped = true;
  }
  return { v: 1, at: nowMs, day: etDateOf(nowMs), cells };
}

/** 잠금을 얻으면 만들어 저장한다. 잠금을 못 얻으면 아무것도 안 한다(다른 인스턴스가 만드는 중). */
export async function refreshImpliedPack(
  rows: Array<{ ticker: string; date: string; hour?: string | null }>,
  opts: { force?: boolean; deadlineMs?: number } = {},
): Promise<{ ok: boolean; skipped?: 'locked' | 'deadline'; ms: number; withValue?: number; total?: number; carried?: number }> {
  const t0 = Date.now();
  const deadlineMs = Math.min(opts.deadlineMs ?? Infinity, t0 + IMPLIED_REFRESH_BUDGET_MS);
  const workDeadline = deadlineMs - IMPLIED_SAVE_RESERVE_MS;
  if (t0 >= workDeadline) return { ok: false, skipped: 'deadline', ms: 0 };
  // force requests a refresh, never permission to bypass another worker's lease.
  const acquired = await acquireEarningsImpliedLock(workDeadline);
  if (!acquired) return { ok: false, skipped: Date.now() >= workDeadline ? 'deadline' : 'locked', ms: Date.now() - t0 };
  if (Date.now() >= workDeadline) return { ok: false, skipped: 'deadline', ms: Date.now() - t0 };
  // 장중엔 조용한 종목의 구조 저장본이 비는 때가 있다(요청 때만 다시 계산) — 그 칸은 직전 묶음 값을 세션 꼬리표와 함께 잇는다(mergeImpliedPacks)
  const [fresh, prev] = await Promise.all([buildImpliedPack(rows, t0, { probeMonthly: true, deadlineMs: workDeadline }), withinImpliedDeadline(() => readImpliedPack(), workDeadline).catch(() => null)]);
  const pack = mergeImpliedPacks(fresh, prev, Date.now(), rows);
  const vals = Object.values(pack.cells);
  // 값이 하나도 없으면(레디스 읽기 실패면 모든 칸이 no_snapshot 이 된다) 저장하지 않는다 — 마지막 정상 묶음을 지킨다.
  //   지난 값은 붙일 때 만기·발표 완료로 다시 거른다(impliedForRow).
  const withValue = vals.filter((c) => c.p != null).length;
  // [10/31] 값이 없어도 «첫 만기를 확인한 칸»이 있으면 저장한다 — 더 이른 첫 만기가 확인돼 직전 값(뒤 만기)을 거절한 결과를
  //   버리고 옛 묶음을 남기면 그 뒤 만기 값이 계속 보인다(관문 10311211 ①). 첫 만기 확인도 값도 없으면(읽기 실패) 저장하지 않는다.
  if (!impliedPackWorthSaving(pack)) return { ok: false, ms: Date.now() - t0, withValue: 0, total: vals.length };
  const saved = await withinImpliedDeadline(() => setInCache(EARNINGS_IMPLIED_KEY, pack, TTL_SEC), deadlineMs).catch(() => false);
  return { ok: saved, ms: Date.now() - t0, withValue, total: vals.length, carried: vals.filter((c) => c.k === 1).length };
}
