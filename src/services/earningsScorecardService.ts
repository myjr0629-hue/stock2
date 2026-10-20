import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { selectWeekEntries } from '@/lib/earningsWeek';
import { actualsKey, parseRecord } from '@/lib/earnings/earningsActuals';
import { aggregateScorecard, scorecardWeekEnd } from '@/lib/earnings/earningsScorecard';
import { mgetFromCache } from '@/services/redisClient';

/** 기존 채우기 크론과 동일한 확정 목록·키·파서. MGET 1회, 벤더 0회, 쓰기 0회. */
export async function readEarningsScorecard(week: string, nowMs = Date.now()) {
  const entries = selectWeekEntries(CONFIRMED_EARNINGS, week, scorecardWeekEnd(week))
    .filter((e) => e.hour === 'bmo' || e.hour === 'amc');
  const values = await mgetFromCache<unknown>(entries.map((e) => actualsKey(e.ticker, e.date)));
  const records = entries.flatMap((entry, i) => {
    const r = parseRecord(values[i]);
    return r && r.ticker === entry.ticker.toUpperCase() && r.date === entry.date && r.hour === entry.hour ? [r] : [];
  });
  return aggregateScorecard(week, records, nowMs);
}
