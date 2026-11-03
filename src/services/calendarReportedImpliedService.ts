import { phaseOf } from '@/lib/earningsWeek';
import { actualsKey } from '@/lib/earnings/earningsActuals';
import { attachReportedImplied } from '@/lib/earnings/calendarReportedImplied';
import { mgetFromCache } from '@/services/redisClient';
import type { RowImplied } from '@/lib/earnings/earningsImplied';

/** 발표 완료 행의 저장 기록만 읽는다. 실패 시 기존 null을 유지한다. */
export async function attachCalendarReportedImplied<R extends { ticker: string; date: string; hour?: string | null; implied?: RowImplied | null }>(rows: R[], nowMs = Date.now()) {
  const done = rows.map((r, i) => ({ r, i })).filter(({ r }) => phaseOf(r.date, r.hour || '', nowMs) === 'done' && (r.hour === 'amc' || r.hour === 'bmo'));
  if (!done.length) return rows;
  try {
    const records = await mgetFromCache<unknown>(done.map(({ r }) => actualsKey(r.ticker, r.date)));
    const values: unknown[] = [];
    done.forEach(({ i }, n) => { values[i] = records[n]; });
    return attachReportedImplied(rows, values, nowMs);
  } catch { return rows; }
}
