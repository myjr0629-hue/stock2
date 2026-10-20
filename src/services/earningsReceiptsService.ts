import { cache } from 'react';
import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { selectWeekEntries } from '@/lib/earningsWeek';
import { actualsKey } from '@/lib/earnings/earningsActuals';
import { scorecardWeekEnd } from '@/lib/earnings/earningsScorecard';
import { buildEarningsReceipts } from '@/lib/earnings/earningsReceipts';
import { mgetFromCache } from '@/services/redisClient';

/** 기존 기록만 MGET. 크론·벤더·보강·쓰기 호출 없음. SSR 메타/본문은 요청 안에서 공유. */
export const readEarningsReceipts = cache(async (week: string) => {
  const entries = selectWeekEntries(CONFIRMED_EARNINGS, week, scorecardWeekEnd(week));
  const now = Date.now();
  if (!entries.length) return buildEarningsReceipts(week, CONFIRMED_EARNINGS, [], now);
  try {
    const values = await mgetFromCache<unknown>(entries.map((c) => actualsKey(c.ticker, c.date)));
    return buildEarningsReceipts(week, CONFIRMED_EARNINGS, values, now);
  } catch {
    return buildEarningsReceipts(week, CONFIRMED_EARNINGS, [], now, true);
  }
});
