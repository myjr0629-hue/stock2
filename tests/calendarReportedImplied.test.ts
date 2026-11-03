import assert from 'node:assert/strict';
import { attachReportedImplied, reportedImplied } from '../src/lib/earnings/calendarReportedImplied';
import { impliedBasisText } from '../src/lib/earnings/earningsImplied';

const now = Date.parse('2026-11-03T22:00:00Z');
const row = { ticker: 'AAPL', date: '2026-11-02', hour: 'amc', implied: null };
const record = { v: 1, ticker: 'AAPL', date: '2026-11-02', hour: 'amc', at: now,
  actual: { pct: 2, baseDate: '2026-11-02', reactDate: '2026-11-03', baseClose: 100, reactClose: 102, at: now - 1000 },
  expected: { pct: 7.7, method: 'event-split', straddlePct: 8.6, expiry: '2026-11-06', session: '2026-11-02', basis: 'eod', capturedAt: now - 86400000, src: 'page' } };
const upcoming = { ticker: 'AMD', date: '2026-11-04', hour: 'amc', implied: { pct: 9.1, expiry: '2026-11-06', basis: 'live' as const, session: '2026-11-02' } };

async function test() {
  const path = require.resolve('../src/services/redisClient');
  let stored: unknown = record;
  let fail = false;
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {
    mgetFromCache: async (keys: string[]) => {
      if (fail) throw new Error('unavailable');
      return keys.map((key) => key === 'earnings:actuals:v1:AAPL:2026-11-02' ? stored : null);
    },
  } } as NodeModule;
  const { readEarningsScorecard } = require('../src/services/earningsScorecardService');
  const { attachCalendarReportedImplied } = require('../src/services/calendarReportedImpliedService');
  const score = (await readEarningsScorecard('2026-11-02', now)).rows.find((r: { ticker: string }) => r.ticker === 'AAPL');
  assert.ok(score);
  assert.equal(score.expectedPct, 8.6);
  const result = await attachCalendarReportedImplied([row, upcoming], now);
  assert.equal(result[0].implied?.pct, score.expectedPct);
  assert.equal(impliedBasisText(result[0].implied, 'ko'), '11/6 만기 · 11/2 세션');
  assert.deepEqual(result[1], upcoming);
  assert.equal(reportedImplied({ ...row, hour: 'bmo' }, score, now), null);
  assert.equal(reportedImplied(row, undefined, now), null);
  assert.deepEqual(attachReportedImplied([upcoming], [score], now), [upcoming]);
  stored = { ...record, actual: null };
  assert.equal((await attachCalendarReportedImplied([row], now))[0].implied, null);
  stored = { ...record, expected: { ...record.expected, straddlePct: null } };
  assert.equal((await attachCalendarReportedImplied([row], now))[0].implied, null);
  stored = record;
  assert.equal((await attachCalendarReportedImplied([{ ...row, ticker: 'FAKE' }], now))[0].implied, null);
  fail = true;
  assert.equal((await attachCalendarReportedImplied([row], now))[0].implied, null);
  console.log('calendar reported implied: ok');
}
void test().catch((e) => { console.error(e); process.exitCode = 1; });
