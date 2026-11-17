import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { selectWeekEntries } from '@/lib/earningsWeek';
import { actualsKey, parseRecord } from '@/lib/earnings/earningsActuals';
import { aggregateScorecard, scorecardWeekEnd } from '@/lib/earnings/earningsScorecard';
import { applyFrozenToRecord } from '@/lib/earnings/frozenExpected';
import { impliedRowKey } from '@/lib/earnings/earningsImplied';
import { mgetFromCacheStrict } from '@/services/redisClient';
import { readFrozenRecords } from '@/services/frozenExpectedService';

/**
 * 기존 채우기 크론과 동일한 확정 목록·키·파서. MGET 1회(+ 고정 기록 MGET 1회), 벤더 0회, 쓰기 0회.
 * [11/18] 예상값은 «발표 전 예상» 고정 기록(발표 알림·캘린더와 같은 숫자)을 같은 정의일 때 입힌다 — lib/earnings/frozenExpected.applyFrozenToRecord.
 */
export async function readEarningsScorecard(week: string, nowMs = Date.now()) {
  const entries = selectWeekEntries(CONFIRMED_EARNINGS, week, scorecardWeekEnd(week))
    .filter((e) => e.hour === 'bmo' || e.hour === 'amc');
  const [values, frozen] = await Promise.all([
    mgetFromCacheStrict<unknown>(entries.map((e) => actualsKey(e.ticker, e.date))),
    readFrozenRecords(entries, nowMs).catch(() => new Map()),
  ]);
  const records = entries.flatMap((entry, i) => {
    const raw = applyFrozenToRecord(values[i], frozen.get(impliedRowKey(entry.ticker, entry.date)));
    const r = parseRecord(raw);
    return r && r.ticker === entry.ticker.toUpperCase() && r.date === entry.date && r.hour === entry.hour ? [r] : [];
  });
  return aggregateScorecard(week, records, nowMs);
}
