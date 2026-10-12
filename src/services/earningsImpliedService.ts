// ============================================================================
// 앱 실적 캘린더의 «옵션 반영 변동폭» 묶음 — 만들기·읽기 (2026-10-12)
//
// 왜 «묶음»인가: 캘린더는 160여 행이다. 행마다 구조 사본 2키 + 수집기 체인 1키(0~35 DTE, 큰 값)를 사용자 요청마다 읽으면
//   요청 하나가 수 MB 를 읽는다. 그래서 같은 문(readImpliedMoveRows — 웹 /earnings-week·GET /api/options/implied-move 와
//   같은 저장본·같은 규칙)으로 «응답 뒤»나 크론에서 한 번 읽어, 행마다 숫자 다섯 개만 남긴 작은 묶음(약 10KB)을 둔다.
//   사용자 경로는 이 묶음 GET 한 번뿐이다.
//
// ⛔ 벤더 호출 0 · 구조 재계산 0 · AI 0. 쓰기는 묶음 1키(EC2 레디스 전용 — TTL 이 있고 복제 접두사 밖).
// 갱신: 장중 5분 · 그 밖 60분 · ET 날짜가 바뀌면 바로(lib/earnings/earningsImplied.impliedPackStale).
//   여러 인스턴스가 동시에 만들지 않게 90초 잠금.
// ============================================================================

import { getFromCache, setInCache } from '@/services/redisClient';
import { readImpliedMoveRows } from '@/services/impliedMoveService';
import { etDateString } from '@/lib/impliedMove';
import { etDateOf } from '@/lib/marketCalendar';
import {
  EARNINGS_IMPLIED_KEY, impliedRowKey, timingOfHour, type ImpliedCell, type ImpliedPack,
} from '@/lib/earnings/earningsImplied';

const LOCK_KEY = `${EARNINGS_IMPLIED_KEY}:lock`;
const LOCK_SEC = 90;
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
): Promise<ImpliedPack> {
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
  const cells: Record<string, ImpliedCell> = {};
  const chunks: typeof reqs[] = [];
  for (let i = 0; i < reqs.length; i += CHUNK) chunks.push(reqs.slice(i, i + CHUNK));
  let ci = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
    while (ci < chunks.length) {
      const chunk = chunks[ci++];
      let out: Awaited<ReturnType<typeof readImpliedMoveRows>> = [];
      try {
        out = await readImpliedMoveRows(chunk.map((c) => ({ ticker: c.ticker, after: c.after, timing: c.timing })), today);
      } catch {
        out = [];
      }
      chunk.forEach((c, i) => {
        const r = out[i];
        cells[c.key] = r
          ? { p: r.impliedMovePct, e: r.impliedMovePct != null ? r.expiry : null, b: r.basis, s: r.session, r: r.reason }
          : { p: null, e: null, b: null, s: null, r: 'read_failed' };
      });
    }
  }));
  return { v: 1, at: nowMs, day: etDateOf(nowMs), cells };
}

/** 잠금을 얻으면 만들어 저장한다. 잠금을 못 얻으면 아무것도 안 한다(다른 인스턴스가 만드는 중). */
export async function refreshImpliedPack(
  rows: Array<{ ticker: string; date: string; hour?: string | null }>,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; skipped?: 'locked'; ms: number; withValue?: number; total?: number }> {
  const t0 = Date.now();
  if (!opts.force) {
    const held = await getFromCache<any>(LOCK_KEY).catch(() => null);
    if (held) return { ok: false, skipped: 'locked', ms: Date.now() - t0 };
  }
  await setInCache(LOCK_KEY, { at: t0 }, LOCK_SEC).catch(() => false);
  const pack = await buildImpliedPack(rows, t0);
  const vals = Object.values(pack.cells);
  // 값이 하나도 없으면(레디스 읽기 실패면 모든 칸이 no_snapshot 이 된다) 저장하지 않는다 — 마지막 정상 묶음을 지킨다.
  //   지난 값은 붙일 때 만기·발표 완료로 다시 거른다(impliedForRow).
  const withValue = vals.filter((c) => c.p != null).length;
  if (!withValue) return { ok: false, ms: Date.now() - t0, withValue: 0, total: vals.length };
  await setInCache(EARNINGS_IMPLIED_KEY, pack, TTL_SEC).catch(() => false);
  return { ok: true, ms: Date.now() - t0, withValue, total: vals.length };
}
