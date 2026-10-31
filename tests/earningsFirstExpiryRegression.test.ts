import assert from 'node:assert/strict';
import type { EarningsMove } from '../src/lib/earnings/eventMove';

// Entire network is mocked, including cache writes. No credentials or external I/O.
process.env.EC2_REDIS_PROXY_KEY = 'fixture';
process.env.INTRINIO_API_KEY = 'fixture';
const store = new Map<string, any>();
const calls: string[] = [];
const writes: string[] = [];
const NOW = Date.parse('2026-10-12T15:00:00Z');
const session = '2026-10-09';
const post = '2026-11-20';
const pre = '2026-10-16';
function contracts(ticker: string, expiry: string) {
  const isPre = expiry === pre;
  const isWeekly = expiry === '2026-10-30';
  return ['call', 'put'].map((type, i) => ({
    option: { code: `${ticker}${expiry}${type}`, expiration: expiry, strike: 100, type },
    prices: { date: ticker === 'MIXED' && isPre ? '2026-10-08' : session,
      close_bid: ticker === 'ONESIDE' && isPre && i === 0 ? 0 : (isPre ? 0.9 : isWeekly ? 3 : 4.2),
      close_ask: isPre ? 1.1 : isWeekly ? 3.2 : 4.4,
      implied_volatility: ticker === 'MISSING' && isPre ? null : ticker === 'ZERO' && isPre ? 0.9 : isPre ? 0.2 : 0.35 },
  }));
}
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (u.hostname.includes('intrinio')) {
    calls.push(u.pathname);
    const bits = u.pathname.split('/');
    const ticker = bits[3];
    if (u.pathname.includes('/expirations/')) return Response.json({ expirations:
      ticker === 'BA' || ticker === 'BADWEEK' ? [pre, '2026-10-30', post] : [pre, post] });
    if (u.pathname.includes('/chain/')) {
      const expiry = bits[4];
      return Response.json({ chain: ticker === 'BADWEEK' && expiry === '2026-10-30' ? [] : contracts(ticker, expiry) });
    }
    return Response.json({ contracts: [{ option: { code: 'unrelated' }, greeks: {} }] });
  }
  if (u.pathname === '/get') return Response.json({ result: store.get(u.searchParams.get('key') || '') ?? null });
  if (u.pathname === '/mget') return Response.json({ results: (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent).map(k => store.get(k) ?? null) });
  if (u.pathname === '/set' && init?.method === 'POST') {
    const b = JSON.parse(init.body || '{}'); store.set(b.key, b.value); writes.push(b.key);
    return Response.json({ ok: true });
  }
  throw new Error(`Unmocked endpoint: ${u.hostname}${u.pathname}`);
};
const IMS = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const EIS = require('../src/services/earningsImpliedService') as typeof import('../src/services/earningsImpliedService');
const EI = require('../src/lib/earnings/earningsImplied') as typeof import('../src/lib/earnings/earningsImplied');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');
const tickers = ['BA', 'NOWEEK', 'MISSING', 'MIXED', 'ONESIDE', 'ZERO', 'BADWEEK'];
function seed() {
  RC._resetEcBreakerForTest();
  store.set('intrinio:eod:snapshot', { date: session, rows: tickers.map(t => [t, 0, 0, 0, 100, 0, 0, 0]) });
  for (const ticker of tickers) {
    store.set(`structure:v2:${ticker}`, { timestamp: NOW - 1000, data: {
      ticker, options_status: 'OK', expiration: pre, availableExpirations: [pre, post], chainDate: session,
      underlyingPrice: 100, impliedMove: null,
    } });
    // Reproduce the already non-null monthly result. It must not suppress collection.
    store.set(`polygon:snapshot:probe:${ticker}`, { greeksSource: 'eod', chainDates: { [post]: session },
      probeResults: contracts(ticker, post).map(c => ({ details: { expiration_date: post, strike_price: 100, contract_type: c.option.type },
        last_quote: { bid: c.prices.close_bid, ask: c.prices.close_ask }, _intrinio: { date: session, eod: { iv: c.prices.implied_volatility } } })) });
  }
}
(async () => {
  const realNow = Date.now; Date.now = () => NOW;
  try {
    seed();
    const request = { ticker: 'BA', after: '2026-10-28', timing: 'bmo' as const };
    // Structure and probe contain only 11/20; the vendor has 10/30 too.
    let [row] = await IMS.readImpliedMoveRows([request]);
    assert.equal(row.impliedMovePct, null);
    assert.equal(calls.length, 0);
    const oldKey = 'earnings:event-probe:v3:BA:2026-10-28:same';
    const old = { def: 'atm-straddle-mid/1', pct: 8.6, straddle: 8.6, strike: 100, expiry: post,
      callPrice: 4.3, putPrice: 4.3, spot: 100, basis: 'eod', session, chainDate: session, asOf: null };
    store.set(oldKey, { im: old, checkedAt: NOW });
    const AS = require('../src/services/earningsActualsService') as typeof import('../src/services/earningsActualsService');
    const matchingKey = 'earnings:event-probe:v3:BA:2026-10-12:same';
    store.set(matchingKey, { im: old, checkedAt: NOW });
    const matching = { ticker: 'BA', date: '2026-10-12', hour: 'bmo' as const };
    assert.equal(await AS.readEarningsObservation(matching, false), null, 'even a matching base-session legacy observation is unverified');
    const matchingResult = await AS.readEarningsObservation(matching, true, NOW + 20000);
    assert.equal(matchingResult?.expiry, '2026-10-16');
    assert.equal(matchingResult?.session, '2026-10-09');
    const c = { ticker: 'BA', date: '2026-10-28', hour: 'bmo' as const };
    assert.equal(await AS.readEarningsObservation(c, false), null, 'old matching-session observation is unverified');
    const collected = await AS.readEarningsObservation(c, true, NOW + 20000);
    assert.equal(collected?.expiry, '2026-10-30');
    assert.equal(collected?.session, session);
    assert.equal((store.get(oldKey) as any).im.expiry, post, 'receipt does not write shared old observation');
    row = (await IMS.readImpliedMoveRows([request], '2026-10-12', { probeMonthly: true }))[0];
    assert.equal(row.expiry, '2026-10-30');
    assert.equal(row.impliedMovePct, 6.2);
    const previous = { v: 1 as const, at: NOW, day: '2026-10-12', cells: { 'BA|2026-10-28': { p: 8.6, e: post, b: 'eod' as const, s: session, r: null } } };
    for (const reason of ['no_snapshot', 'read_failed', 'no_expiry_after', 'no_straddle', 'first_expiry_unavailable']) {
      const next = { ...previous, cells: { 'BA|2026-10-28': { p: null, e: null, b: null, s: null, r: reason } } };
      assert.equal(EI.mergeImpliedPacks(next, previous, NOW).cells['BA|2026-10-28'].p, null);
    }
    const A = require('../src/lib/earnings/earningsActuals') as typeof import('../src/lib/earnings/earningsActuals');
    const rec = { v: 1, ticker: 'BA', date: c.date, hour: c.hour, expected: { ...old, capturedAt: NOW, src: 'page' }, actual: null, at: NOW };
    assert.equal(A.parseRecord(rec)?.expected, null);
    assert.equal(A.parseRecord({ ...rec, expected: { ...rec.expected, firstExpiryVerified: true } })?.expected?.expiry, post);
    store.set('earnings:implied:v1', previous);
    assert.equal(await EIS.readImpliedPack(), null, 'legacy pack must not be served');
    console.log('first expiry: partial snapshots, receipt, pack and legacy data passed');
  } finally { Date.now = realNow; }
})().catch(e => { console.error(e); process.exit(1); });
