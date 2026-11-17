import { phaseOf } from '@/lib/earningsWeek';
import type { ScorecardRow } from '@/lib/earnings/earningsScorecard';
import type { RowImplied } from '@/lib/earnings/earningsImplied';

export type CalendarImplied = RowImplied & { reported?: true; actualPct?: number; within?: boolean; frozen?: true };
type Row = { ticker: string; date: string; hour?: string | null; implied?: RowImplied | null };

/** 채점표에 포함된 같은 이벤트의 예상값만 사용한다. */
export function reportedImplied(row: Row, score: ScorecardRow | undefined, nowMs: number): CalendarImplied | null {
  if (phaseOf(row.date, row.hour || '', nowMs) !== 'done' || !score
    || score.ticker !== row.ticker.toUpperCase() || score.date !== row.date || score.hour !== row.hour) return null;
  return { pct: score.expectedPct, expiry: score.basis.expectedExpiry ?? '', basis: null,
    session: score.basis.expectedSession, reported: true, actualPct: score.actualPct, within: !score.beyond };
}

/**
 * 발표 완료 행: 채점표 행이 있으면 그 값(채점 결과 포함) · 아직 채점 전이면 «발표 전 예상» 고정값(frozen — 키 «티커|발표일», 없으면 null).
 *   [11/18] 예전엔 채점 전 완료 행이 비었다(NVDA 발표 다음 날 정규장 마감까지 «—»).
 */
export function attachReportedImplied<R extends Row>(rows: R[], scores: readonly ScorecardRow[], nowMs: number, frozen?: ReadonlyMap<string, CalendarImplied>): Array<R & { implied: CalendarImplied | null }> {
  const byEvent = new Map(scores.map((score) => [`${score.ticker}|${score.date}|${score.hour}`, score]));
  return rows.map((row) => ({ ...row, implied: phaseOf(row.date, row.hour || '', nowMs) === 'done'
    ? reportedImplied(row, byEvent.get(`${row.ticker.toUpperCase()}|${row.date}|${row.hour}`), nowMs) ?? frozen?.get(`${row.ticker.toUpperCase()}|${row.date}`) ?? null
    : row.implied ?? null }));
}
