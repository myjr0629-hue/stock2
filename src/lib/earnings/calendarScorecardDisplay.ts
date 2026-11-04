import { addDaysYmd, weekdayOfYmd } from '@/lib/earningsWeek';
import type { CalendarImplied } from './calendarReportedImplied';

export function calendarScorecardWeek(date: string): string {
  return addDaysYmd(date, -((weekdayOfYmd(date) + 6) % 7));
}

export function calendarScorecardSummary(data: unknown, week: string): { n: number; withinCount: number } | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as { week?: unknown; summary?: { n?: unknown; withinCount?: unknown } };
  const n = value.summary?.n, within = value.summary?.withinCount;
  if (value.week !== week || typeof n !== 'number' || !Number.isInteger(n) || n < 0
    || typeof within !== 'number' || !Number.isInteger(within) || within < 0 || within > n) return null;
  return { n, withinCount: within };
}

export function calendarReaction(implied: CalendarImplied | null | undefined): string | null {
  if (implied?.reported !== true || typeof implied.actualPct !== 'number' || !Number.isFinite(implied.actualPct)
    || typeof implied.within !== 'boolean') return null;
  return `${implied.actualPct >= 0 ? '+' : '−'}${Math.abs(implied.actualPct).toFixed(1)}%`;
}
