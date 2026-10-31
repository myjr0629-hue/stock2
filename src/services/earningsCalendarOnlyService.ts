// ============================================================================
// [2026-10-31 T40] 앱 실적 캘린더(?scope=calendar)의 «캘린더 전용 대형주 행» — 덧붙이기·예상 변동폭 읽기
//   목록·범위는 lib/earningsCalendarOnly.ts 머리말. 라우트(/api/market/earnings-calendar)가 scope=calendar 일 때만 부른다.
//   공통 행·캘린더 캐시·변동폭 묶음(earnings:implied:v1)·브리프 크론 대상은 그대로다.
// ============================================================================

import { earningsCalendarUniverse } from '@/services/earningsCalendarService';
import { buildImpliedPack } from '@/services/earningsImpliedService';
import { attachImplied, type ImpliedPack } from '@/lib/earnings/earningsImplied';
import { CONFIRMED_EARNINGS, type ConfirmedEarnings } from '@/lib/earningsConfirmed';
import { CALENDAR_ONLY_EARNINGS, calendarOnlyEntries, withCalendarOnlyRows } from '@/lib/earningsCalendarOnly';
import { etDateOf } from '@/lib/marketCalendar';

/** 공통 행(덮기 끝난 것)에 캘린더 전용 행을 덧붙인다. 실패하면 덧붙이지 않는다(기존 응답 그대로). */
export function calendarOnlyAddition(raw: any[], nowMs: number = Date.now(), list: readonly ConfirmedEarnings[] = CALENDAR_ONLY_EARNINGS): { rows: any[]; extra: any[] } {
  try {
    const { rows, added } = withCalendarOnlyRows(raw, etDateOf(nowMs), calendarOnlyEntries(earningsCalendarUniverse(), CONFIRMED_EARNINGS, list));
    if (!added.length) return { rows: raw, extra: [] };
    const addedSet = new Set(added);
    return { rows, extra: rows.filter((x) => addedSet.has(x.ticker)) };
  } catch {
    return { rows: raw, extra: [] };
  }
}

/**
 * 캘린더 전용 행의 예상 변동폭 — «저장본에 있으면». 같은 문(buildImpliedPack → readImpliedMoveRows)을 월간 조회 없이(probeMonthly 끔)
 *   Redis 읽기로만 돈다(공급사 호출 0 · 저장 0). 인스턴스 메모 5분 · 1.5초 상한 · 실패 = 값 없음(«—»).
 */
const EXTRA_IMPLIED_TTL_MS = 5 * 60_000;
let memo: { at: number; key: string; pack: ImpliedPack } | null = null;
/** 시험용 */
export function _resetCalendarOnlyImpliedMemo(): void { memo = null; }

export async function attachCalendarOnlyImplied(extra: any[]): Promise<{ rows: any[]; count: number }> {
  if (!extra.length) return { rows: [], count: 0 };
  try {
    const now = Date.now();
    const key = `${etDateOf(now)}|${extra.map((x) => `${x.ticker}|${x.date}|${x.hour || ''}`).join(',')}`;
    let pack = memo && memo.key === key && now - memo.at < EXTRA_IMPLIED_TTL_MS ? memo.pack : null;
    if (!pack) {
      // probeMonthly 를 넘기지 않는다 = 월간 조회(공급사) 없음. 저장(setInCache)도 하지 않는다.
      pack = await buildImpliedPack(extra.map((x) => ({ ticker: x.ticker, date: x.date, hour: x.hour })), now, { deadlineMs: now + 1_500 });
      memo = { at: now, key, pack };
    }
    const m = attachImplied(extra, pack);
    return { rows: m.rows, count: m.count };
  } catch {
    return { rows: extra.map((r) => ({ ...r, implied: null })), count: 0 };
  }
}
