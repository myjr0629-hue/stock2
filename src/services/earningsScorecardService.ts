import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { selectWeekEntries } from '@/lib/earningsWeek';
import { actualsKey, parseRecord } from '@/lib/earnings/earningsActuals';
import { aggregateScorecard, scorecardWeekEnd } from '@/lib/earnings/earningsScorecard';
import { applyFrozenToRecord } from '@/lib/earnings/frozenExpected';
import { impliedRowKey } from '@/lib/earnings/earningsImplied';
import { mgetFromCacheStrict } from '@/services/redisClient';
import { readFrozenExpected } from '@/services/frozenExpectedService';

/**
 * 기존 채우기 크론과 동일한 확정 목록·키·파서. MGET 1회(+ 고정 기록 MGET 1회 · 발표 6일 안이면 Upstash 알림 키 MGET 1회), 벤더 0회, 쓰기 0회.
 * [11/18] 예상값은 «발표 전 예상» 고정 기록(발표 알림·캘린더와 같은 숫자)을 같은 정의일 때 입힌다 — lib/earnings/frozenExpected.applyFrozenToRecord.
 */
export async function readEarningsScorecard(week: string, nowMs = Date.now()) {
  const entries = selectWeekEntries(CONFIRMED_EARNINGS, week, scorecardWeekEnd(week))
    .filter((e) => e.hour === 'bmo' || e.hour === 'amc');
  const [values, frozen] = await Promise.all([
    mgetFromCacheStrict<unknown>(entries.map((e) => actualsKey(e.ticker, e.date))),
    // 고정 기록 + (발표 6일 안이면) 발표 알림 값 — 캘린더·종목 페이지와 같은 읽기(실적 반응 기록 예비는 이미 이 기록이라 끈다 · 쓰기 0)
    readFrozenExpected(entries, nowMs, { actuals: false, persist: false }).catch(() => new Map()),
  ]);
  const records = entries.flatMap((entry, i) => {
    const raw = applyFrozenToRecord(values[i], frozen.get(impliedRowKey(entry.ticker, entry.date)));
    const r = parseRecord(raw);
    return r && r.ticker === entry.ticker.toUpperCase() && r.date === entry.date && r.hour === entry.hour ? [r] : [];
  });
  return aggregateScorecard(week, records, nowMs);
}
