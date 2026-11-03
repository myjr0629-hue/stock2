import { phaseOf } from '@/lib/earningsWeek';
import type { ScorecardRow } from '@/lib/earnings/earningsScorecard';
import type { RowImplied } from '@/lib/earnings/earningsImplied';

export type CalendarImplied = RowImplied & { reported?: true };
type Row = { ticker: string; date: string; hour?: string | null; implied?: RowImplied | null };

/** 채점표에 포함된 같은 이벤트의 예상값만 사용한다. */
export function reportedImplied(row: Row, score: ScorecardRow | undefined, nowMs: number): CalendarImplied | null {
  if (phaseOf(row.date, row.hour || '', nowMs) !== 'done' || !score
    || score.ticker !== row.ticker.toUpperCase() || score.date !== row.date || score.hour !== row.hour) return null;
  return { pct: score.expectedPct, expiry: score.basis.expectedExpiry ?? '', basis: null,
    session: score.basis.expectedSession, reported: true };
}

export function attachReportedImplied<R extends Row>(rows: R[], scores: readonly ScorecardRow[], nowMs: number): Array<R & { implied: CalendarImplied | null }> {
  const byEvent = new Map(scores.map((score) => [`${score.ticker}|${score.date}|${score.hour}`, score]));
  return rows.map((row) => ({ ...row, implied: phaseOf(row.date, row.hour || '', nowMs) === 'done'
    ? reportedImplied(row, byEvent.get(`${row.ticker.toUpperCase()}|${row.date}|${row.hour}`), nowMs) : row.implied ?? null }));
}
