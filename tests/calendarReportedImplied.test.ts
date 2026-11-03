import assert from 'node:assert/strict';
import { attachReportedImplied, reportedImplied } from '../src/lib/earnings/calendarReportedImplied';
import { impliedBasisText } from '../src/lib/earnings/earningsImplied';

const now = Date.parse('2026-11-03T04:00:00Z');
const row = { ticker: 'AAPL', date: '2026-11-02', hour: 'amc', implied: null };
const record = { v: 1, ticker: 'AAPL', date: '2026-11-02', hour: 'amc', at: now, actual: null,
  expected: { pct: 4.6, method: 'weekly', expiry: '2026-11-06', session: '2026-11-02', basis: 'eod', capturedAt: now - 1000, src: 'page' } };
const value = reportedImplied(row, record, now);
assert.deepEqual(value, { pct: 4.6, expiry: '2026-11-06', basis: 'eod', session: '2026-11-02', reported: true });
assert.equal(impliedBasisText(value, 'ko'), '11/6 만기 · 11/2 세션');
const upcoming = { ticker: 'AMD', date: '2026-11-03', hour: 'amc', implied: { pct: 9.1, expiry: '2026-11-06', basis: 'live' as const, session: '2026-11-02' } };
assert.deepEqual(attachReportedImplied([row, upcoming], [record, null], now), [{ ...row, implied: value }, upcoming]);
assert.equal(reportedImplied(row, null, now), null);
assert.equal(reportedImplied(row, { ...record, hour: 'bmo' }, now), null);
assert.equal(reportedImplied(row, { ...record, expected: { ...record.expected, session: '2026-11-03' } }, now), null);
assert.equal(reportedImplied(row, { ...record, expected: { ...record.expected, method: 'event-split', straddlePct: null } }, now), null);
assert.deepEqual(reportedImplied(row, { ...record, expected: { ...record.expected, expiry: null } }, now)?.expiry, '');
console.log('calendar reported implied: ok');

async function serviceTest() {
  const path = require.resolve('../src/services/redisClient');
  let keys: string[] = [];
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {
    mgetFromCache: async (requested: string[]) => { keys = requested; return [record]; },
  } } as NodeModule;
  const { attachCalendarReportedImplied } = require('../src/services/calendarReportedImpliedService');
  const result = await attachCalendarReportedImplied([row, upcoming], now);
  assert.deepEqual(keys, ['earnings:actuals:v1:AAPL:2026-11-02']);
  assert.deepEqual(result, [{ ...row, implied: value }, upcoming]);
  console.log('calendar reported service: ok');
}
void serviceTest().catch((e) => { console.error(e); process.exitCode = 1; });
