import { addDaysYmd, phaseOf, weekdayOfYmd } from '@/lib/earningsWeek';
import { attachReportedImplied } from '@/lib/earnings/calendarReportedImplied';
import { isScorecardWeek, type ScorecardRow } from '@/lib/earnings/earningsScorecard';
import { readEarningsScorecard } from '@/services/earningsScorecardService';
import type { RowImplied } from '@/lib/earnings/earningsImplied';

/** 발표 완료 행은 채점표가 채택한 이벤트만 사용한다. 읽기에 실패한 주는 null이다. */
export async function attachCalendarReportedImplied<R extends { ticker: string; date: string; hour?: string | null; implied?: RowImplied | null }>(rows: R[], nowMs = Date.now()) {
  const weeks = new Set<string>();
  for (const row of rows) {
    if (phaseOf(row.date, row.hour || '', nowMs) !== 'done' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const weekday = weekdayOfYmd(row.date);
    if (!Number.isFinite(weekday)) continue;
    const week = addDaysYmd(row.date, -((weekday + 6) % 7));
    if (isScorecardWeek(week)) weeks.add(week);
  }
  const results = await Promise.all([...weeks].map(async (week): Promise<ScorecardRow[]> => {
    try { return (await readEarningsScorecard(week, nowMs)).rows; } catch { return []; }
  }));
  return attachReportedImplied(rows, results.flat(), nowMs);
}
