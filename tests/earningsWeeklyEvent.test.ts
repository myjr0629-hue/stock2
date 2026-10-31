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
    let [r] = await IMS.readImpliedMoveRows([request]);
    assert.equal(r.impliedMovePct, 8.6); assert.equal(r.method, 'monthly');
    assert.equal(calls.length, 0); assert.equal(writes.length, 0);
    const pack = await EIS.buildImpliedPack([{ ticker: 'BA', date: request.after, hour: 'bmo' }], NOW, { probeMonthly: true });
    const ba = EI.impliedForRow({ ticker: 'BA', date: request.after, hour: 'bmo' }, pack, NOW)!;
    assert.equal(ba.pct, 6.2); assert.equal(ba.expiry, '2026-10-30'); assert.equal(ba.method, 'weekly');
    assert.equal(EI.impliedBasisText(ba, 'ko'), '10/30 만기 · 10/9 세션');
    assert.equal(calls.length, 3, `list + weekly chain + realtime greeks (one page each): ${calls.join(', ')}`);
    assert.ok(!calls.some(p => p.includes(`/BA/${post}/`)));
    console.log('✓ BA monthly 8.6% → actual 10/30 weekly 6.2%; method survives pack and row; existing copy unchanged');
    const before = calls.length, beforeWrites = writes.length;
    [r] = await IMS.readImpliedMoveRows([request]);
    assert.equal(r.impliedMovePct, 6.2); assert.equal(r.method, 'weekly');
    await IMS.readImpliedMoveRows([request], '2026-10-12', { probeMonthly: true });
    assert.equal(calls.length, before); assert.equal(writes.length, beforeWrites);
    console.log('✓ read-only caller and hourly reuse: supplier calls 0, writes 0');
    const read = async (ticker: string) => (await IMS.readImpliedMoveRows([{ ...request, ticker }], '2026-10-12', { probeMonthly: true }))[0];
    let count = calls.length;
    r = await read('NOWEEK');
    const expected = Math.round(Math.sqrt(0.35 ** 2 * 42 / 365 - 0.2 ** 2 * 41 / 365) * 1000) / 10;
    assert.equal(r.impliedMovePct, expected); assert.equal(r.method, 'event-split'); assert.equal(r.expiry, post);
    assert.equal(r.straddle, 8.6, 'raw observed straddle is retained separately from the event percentage');
    assert.equal(r.straddlePct, 8.6, '분리 전 ATM 기준값을 별도 보존');
    assert.equal(calls.length - count, 5, 'list + post/pre chain + each greeks, one page each');
    console.log(`✓ no weekly: same-session pre/post EOD IV → event-split ${expected}%, 5 supplier calls`);
    for (const ticker of ['MISSING', 'MIXED', 'ONESIDE', 'ZERO']) {
      r = await read(ticker);
      assert.equal(r.method, 'monthly', ticker); assert.equal(r.impliedMovePct, 8.6, ticker); assert.equal(r.expiry, post);
    }
    r = await read('BADWEEK');
    assert.equal(r.impliedMovePct, null, 'missing first weekly quote must not use a later monthly expiry');
    console.log('✓ missing IV / mixed sessions / one-sided pre / zero variance retain monthly; missing first weekly quote stays null');
    // 관문 10201038: 같은 만기의 과거 EOD 관측이 최신 구조 값을 덮어쓰면 안 된다.
    const liveNow = Date.parse('2026-10-20T15:00:00Z');
    Date.now = () => liveNow;
    const expiry = '2026-10-23';
    const freshRequest = { ticker: 'FRESH', after: '2026-10-22', timing: 'bmo' as const };
    const observation = (pct: number, basis: 'live' | 'eod', session: string | null, asOf: number | null = null): EarningsMove => ({
      def: 'atm-straddle-mid/1' as const, pct, straddle: pct, strike: 100, expiry,
      callPrice: pct / 2, putPrice: pct / 2, spot: 100, basis, session, chainDate: session, asOf,
    });
    const latest = observation(7.8, 'live', '2026-10-20', liveNow);
    const compare = async (existing: EarningsMove | null, cached: EarningsMove | null) => {
      store.set('structure:v2:FRESH', { timestamp: liveNow, data: {
        ticker: 'FRESH', options_status: 'OK', expiration: existing?.expiry ?? expiry,
        availableExpirations: [existing?.expiry ?? expiry], underlyingPrice: 100, impliedMove: existing,
      } });
      // checkedAt is the cache-read time, not the option observation time.
      store.set('earnings:event-probe:v3:FRESH:2026-10-22:same', { im: cached, checkedAt: liveNow });
      return (await IMS.readImpliedMoveRows([freshRequest]))[0];
    };
    const noCalls = calls.length, noWrites = writes.length;
    const oldEod = observation(4.2, 'eod', '2026-10-19');
    r = await compare(latest, oldEod);
    assert.equal(r.impliedMovePct, 7.8, '10/20 live 7.8% must survive 10/19 EOD 4.2% at the same 10/23 expiry');
    assert.equal(r.source, 'structure'); assert.equal(r.basis, 'live');
    assert.equal(r.session, '2026-10-20'); assert.equal(r.asOf, liveNow);
    r = await compare(observation(6.4, 'eod', '2026-10-20'), oldEod);
    assert.equal(r.impliedMovePct, 6.4, 'older EOD session must not replace newer EOD');
    r = await compare(latest, observation(4.2, 'live', '2026-10-20', liveNow - 60_000));
    assert.equal(r.impliedMovePct, 7.8, 'older quote in the same session must not replace newer quote');
    r = await compare({ ...latest, asOf: liveNow - 60_000 }, observation(8.1, 'live', '2026-10-20', liveNow));
    assert.equal(r.impliedMovePct, 8.1, 'newer quote in the same session may replace');
    r = await compare(latest, observation(4.2, 'live', '2026-10-20'));
    assert.equal(r.impliedMovePct, 7.8, 'missing quote time must not displace a known newer quote');
    r = await compare(oldEod, observation(8.1, 'live', '2026-10-20', liveNow));
    assert.equal(r.impliedMovePct, 8.1, 'newer session may replace an older EOD observation');
    r = await compare(latest, observation(6.4, 'eod', '2026-10-20'));
    assert.equal(r.impliedMovePct, 6.4, 'same-session final EOD supersedes intraday');
    r = await compare(observation(6.4, 'eod', '2026-10-20'), latest);
    assert.equal(r.impliedMovePct, 6.4, 'intraday quote must not displace same-session final EOD');
    r = await compare({ ...latest, expiry: post }, oldEod);
    assert.equal(r.impliedMovePct, 4.2); assert.equal(r.expiry, expiry, 'earlier event weekly expiry still takes priority');
    r = await compare(latest, { ...oldEod, expiry: post });
    assert.equal(r.impliedMovePct, 7.8, 'later monthly expiry cannot replace the nearest event expiry');
    store.set('structure:v2:FRESH', { timestamp: liveNow, data: {
      ticker: 'FRESH', options_status: 'OK', expiration: expiry,
      availableExpirations: [expiry, post], underlyingPrice: 100, impliedMove: latest,
    } });
    store.set('earnings:event-probe:v3:FRESH:2026-10-22:same', { im: { ...oldEod, expiry: post }, checkedAt: liveNow });
    r = (await IMS.readImpliedMoveRows([freshRequest]))[0];
    assert.equal(r.expiry, expiry, 'known first expiry must beat a cached later monthly observation');
    r = await compare(null, oldEod);
    assert.equal(r.impliedMovePct, 4.2, 'real cached observation still fills a missing structure value');
    r = await compare(latest, null);
    assert.equal(r.impliedMovePct, 7.8, 'missing cache must not erase the structure observation');
    r = await compare(null, null);
    assert.equal(r.impliedMovePct, null, 'missing observations stay null, never zero');
    const monthly = { ...observation(8.6, 'eod', '2026-10-19'), expiry: post };
    r = await compare(monthly, { ...monthly, method: 'event-split', eventMovePct: 5.1 });
    assert.equal(r.impliedMovePct, 5.1); assert.equal(r.method, 'event-split', 'same-session EOD can carry an event split');
    assert.equal(calls.length, noCalls); assert.equal(writes.length, noWrites);
    console.log('✓ same-expiry session/quote freshness: 14 regression and boundary cases; supplier calls 0, writes 0');
    console.log('earningsWeeklyEvent: 23 scenarios passed');
  } finally { Date.now = realNow; }
})().catch(e => { console.error(e); process.exit(1); });
