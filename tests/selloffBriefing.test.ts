import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { currentSelloff, readSelloffMacro, selloffPreviewParam, selloffBrief, SELLOFF_COPY, scorecardWeek, type SelloffMacro } from '../src/lib/selloffBriefing';
const now = Date.parse('2026-11-02T15:00:00Z');
const cash = (changePct: number, sessionDate = '2026-10-30', asOf = '2026-10-30T20:00:00Z') => ({ changePct, sessionDate, asOf, price: 100 });
const factor = (chgPct: number, marketTime = '2026-10-30T20:00:00Z') => ({ chgPct, marketTime, status: 'OK', source: 'YAHOO' });
test('four exact thresholds and just inside each boundary', () => {
  const make = (i: number, value: number): SelloffMacro => i === 0 ? { indexBasis: { cash: { spx: cash(value) } } } : i === 1 ? { indexBasis: { cash: { ndx: cash(value) } } } : { factors: { [i === 2 ? 'sox' : 'vix']: factor(value) } };
  [-1.5, -2, -3, 10].forEach((v, i) => { assert.ok(selloffBrief(make(i, v), now)); assert.equal(selloffBrief(make(i, v + (i === 3 ? -0.01 : 0.01)), now), null); });
});
test('missing, mismatched, intraday, future, and unavailable values do not trigger', () => {
  assert.equal(selloffBrief(null, now), null);
  assert.equal(selloffBrief({ indexBasis: { cash: { spx: cash(-5, '2026-11-02', '2026-11-02T14:59:00Z') } }, factors: { sox: factor(-5, '2026-10-29T20:00:00Z') } }, now), null);
  assert.equal(selloffBrief({ indexBasis: { cash: { spx: cash(-5, '2026-10-30', '2026-10-30T19:00:00Z') } }, factors: { vix: { ...factor(20), status: 'UNAVAILABLE' } } }, now), null);
  assert.equal(selloffBrief({ factors: { vix: factor(20, '2026-11-02T21:00:00Z') } }, now), null);
  assert.equal(selloffBrief({ indexBasis: { cash: { spx: cash(-5, '2026-10-29') } }, factors: { sox: factor(-3) } }, now)?.chips.length, 1);
});
test('three locales provide all card labels and week starts Monday', () => {
  for (const loc of ['ko', 'en', 'ja'] as const) for (const text of Object.values(SELLOFF_COPY[loc])) assert.ok(text.length > 0);
  assert.equal(scorecardWeek('2026-10-30'), '2026-10-26');
});
test('card only requests the scorecard and does not subscribe to earnings calendar', () => {
  const source = readFileSync('src/app/[locale]/app-view/dash/SelloffCard.tsx', 'utf8');
  assert.doesNotMatch(source, /watchEarningsCalendar|earningsCalendarData|crossBriefUrl|t\.mine/);
  assert.deepEqual([...source.matchAll(/fetch\(`([^`]+)`/g)].map(m => m[1].split('?')[0]), ['/api/earnings/scorecard']);
});
test('failed macro response clears card and prior session expires at next close', async () => {
  const macro = { indexBasis: { cash: { spx: cash(-5) } } };
  const success = await readSelloffMacro({ status: 'fulfilled', value: new Response(JSON.stringify(macro)) }, now);
  assert.ok(success.brief);
  for (const result of [
    { status: 'rejected', reason: new Error('network') } as const,
    { status: 'fulfilled', value: new Response('', { status: 503 }) } as const,
    { status: 'fulfilled', value: new Response('invalid json') } as const,
  ]) assert.equal((await readSelloffMacro(result, now)).brief, null);
  assert.equal(currentSelloff(success.brief, now)?.date, '2026-10-30');
  assert.equal(currentSelloff(success.brief, Date.parse('2026-11-02T21:00:00Z')), null);
  assert.equal(selloffBrief(macro, Date.parse('2026-11-02T21:00:00Z')), null);
});
test('preview query is ignored in production for on and off', () => {
  for (const value of ['on', 'off']) {
    assert.equal(selloffPreviewParam(`?selloffPreview=${value}`, 'production'), null);
    assert.equal(selloffPreviewParam(`?selloffPreview=${value}`, 'development'), value);
  }
});
