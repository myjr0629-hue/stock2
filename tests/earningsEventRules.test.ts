import assert from 'node:assert/strict';
import { atmStraddleImpliedMove, eodQuoteRows } from '../src/lib/impliedMove';
import { expiryMethod, splitMonthlyEvent } from '../src/lib/earnings/eventMove';
import { mergeImpliedPacks, type ImpliedPack } from '../src/lib/earnings/earningsImplied';
const NOW = Date.parse('2026-10-12T15:00:00Z');
const makeRows = (expiry: string, iv: number | null = 0.2, session = '2026-10-09') => ['call', 'put'].map(type => ({
  details: { expiration_date: expiry, strike_price: 100, contract_type: type },
  last_quote: { bid: 1, ask: 1.2 }, _intrinio: { date: session, eod: { iv } },
}));
const realNow = Date.now; Date.now = () => NOW;
try {
  const postRows = makeRows('2026-11-20', 0.3);
  const post = atmStraddleImpliedMove(eodQuoteRows(postRows), 100, { expiry: '2026-11-20', chainDate: '2026-10-09' })!;
  const pre = makeRows('2026-10-16');
  assert.equal(splitMonthlyEvent(post, postRows, [], '2026-10-28').method, 'monthly');
  assert.equal(splitMonthlyEvent(post, makeRows('2026-11-20', null), pre, '2026-10-28').method, 'monthly');
  assert.equal(splitMonthlyEvent(post, postRows, pre, '2026-10-16', false).method, 'event-split', 'Friday AMC expiry precedes release');
  assert.equal(splitMonthlyEvent(post, postRows, pre, '2026-10-16', true).method, 'monthly', 'Friday BMO expiry includes release; cannot be pre-event');
  assert.equal(splitMonthlyEvent(post, postRows, makeRows('2026-10-09'), '2026-10-28').method, 'monthly');
  assert.equal(splitMonthlyEvent({ ...post, session: '2026-10-29' }, postRows, pre, '2026-10-28').method, 'monthly');
  assert.equal(expiryMethod('2026-06-18'), 'monthly', 'Juneteenth shifts standard monthly expiry');
  assert.equal(expiryMethod('2026-10-30'), 'weekly');
  const prev: ImpliedPack = { v: 1, at: NOW - 1000, day: '2026-10-12', cells: {
    'X|2026-10-28': { p: 4.2, e: '2026-11-20', b: 'eod', s: '2026-10-09', r: null, method: 'event-split' },
  } };
  const fresh: ImpliedPack = { v: 1, at: NOW, day: '2026-10-12', cells: {
    'X|2026-10-28': { p: null, e: null, b: null, s: null, r: 'read_failed' },
  } };
  assert.equal(mergeImpliedPacks(fresh, prev, NOW).cells['X|2026-10-28'].method, 'event-split');
  console.log('earningsEventRules: 9 boundary assertions passed');
} finally { Date.now = realNow; }
