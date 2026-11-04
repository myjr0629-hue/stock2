import assert from 'node:assert/strict';
import { calendarReaction, calendarScorecardSummary, calendarScorecardWeek } from '../src/lib/earnings/calendarScorecardDisplay';
import { RECEIPT_COPY } from '../src/lib/earnings/earningsReceiptsCopy';

const base = { pct: 4, expiry: '', basis: null, session: '' };
assert.equal(calendarReaction({ ...base, reported: true, actualPct: 0, within: true }), '+0.0%');
assert.equal(calendarReaction({ ...base, reported: true, actualPct: -5.25, within: false }), '−5.3%');
assert.equal(calendarReaction({ ...base, reported: true }), null);
assert.equal(calendarReaction({ ...base, actualPct: 3, within: true }), null);
assert.equal(calendarReaction(null), null);
assert.equal(calendarScorecardWeek('2026-11-08'), '2026-11-02');
assert.deepEqual(calendarScorecardSummary({ week: '2026-11-02', summary: { n: 4, withinCount: 3 } }, '2026-11-02'), { n: 4, withinCount: 3 });
assert.equal(calendarScorecardSummary({ week: '2026-11-02', summary: { n: 1, withinCount: 2 } }, '2026-11-02'), null);
assert.equal(calendarScorecardSummary({ week: '2026-10-26', summary: { n: 4, withinCount: 3 } }, '2026-11-02'), null);
assert.equal(calendarScorecardSummary({ week: '2026-11-02', summary: { n: 0, withinCount: 0 } }, '2026-11-02'), null);
for (const locale of ['ko', 'en', 'ja'] as const) {
  const copy = RECEIPT_COPY[locale];
  assert.ok(copy.scorecardSummary(4, 3).includes('4'));
  assert.ok(copy.scorecardSummary(4, 3).includes('3'));
  assert.ok(copy.columns[2] && copy.within && copy.outside && copy.methods[5]);
}
console.log('calendar scorecard display: ok');

// 관문 11041001 — 반올림(0.05 올림)
{
  const { calendarReaction } = require('../src/lib/earnings/calendarScorecardDisplay');
  const a = require('node:assert/strict');
  a.equal(calendarReaction({ reported: true, actualPct: 1.15, within: true } as any), '+1.2%');
  a.equal(calendarReaction({ reported: true, actualPct: -2.55, within: true } as any), '−2.6%');
  a.equal(calendarReaction({ reported: true, actualPct: -1.8976, within: true } as any), '−1.9%');
  console.log('반올림 시험 통과');
}
