import { phaseOf } from '@/lib/earningsWeek';
import { atmReceiptExpectedPct, expectedEligible, parseRecord } from '@/lib/earnings/earningsActuals';
import type { RowImplied } from '@/lib/earnings/earningsImplied';

export type CalendarImplied = RowImplied & { reported?: true };
type Row = { ticker: string; date: string; hour?: string | null; implied?: RowImplied | null };

/** 채점표와 같은 기록·ATM 정의·발표 전 세션만 사용한다. */
export function reportedImplied(row: Row, raw: unknown, nowMs: number): CalendarImplied | null {
  if (phaseOf(row.date, row.hour || '', nowMs) !== 'done') return null;
  const r = parseRecord(raw);
  if (!r || r.ticker !== row.ticker.toUpperCase() || r.date !== row.date || r.hour !== row.hour || !r.expected) return null;
  const e = r.expected;
  const pct = atmReceiptExpectedPct(e);
  if (pct == null || !expectedEligible(r, e.session) || !(e.capturedAt > 0 && e.capturedAt <= nowMs)) return null;
  return { pct, expiry: e.expiry ?? '', basis: e.basis, session: e.session, reported: true };
}

export function attachReportedImplied<R extends Row>(rows: R[], values: readonly unknown[], nowMs: number): Array<R & { implied: CalendarImplied | null }> {
  return rows.map((row, i) => ({ ...row, implied: phaseOf(row.date, row.hour || '', nowMs) === 'done'
    ? reportedImplied(row, values[i], nowMs) : row.implied ?? null }));
}
