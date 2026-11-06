// signum-xs-paper regression — isolated DynamoDB / Redis / Intrinio fixtures,
// fixed clock, no network, no real writes.  Run: node scripts/verify/xs-paper-regression.js
//
// Covers the 2026-11-05 incident (weekly kill over names held in 3 tranches →
// duplicate TRADE keys → BatchWrite ValidationException → day lost) and the
// persistence contract that replaced it: one all-or-nothing transaction per
// day, idempotent retries, backfill only for the vendor's current session.
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;

// ── fixed clock ─────────────────────────────────────────────────────────────
const RealDate = Date;
let NOW = RealDate.parse('2026-11-06T01:30:00Z');   // UTC 11/06 · ET 11/05 20:30 (the backfill window)
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}
global.Date = FakeDate;

// ── DynamoDB mock (conditions evaluated for the expressions the engine uses) ─
class Command { constructor(input) { this.input = input; } }
class GetCommand extends Command {} class BatchGetCommand extends Command {} class ScanCommand extends Command {} class TransactWriteCommand extends Command {}
class BatchWriteCommand extends Command {}
let db, txns, failTxn, scans;
const key = x => JSON.stringify([x.pk, x.sk]);
function condOk(put) {
  const cur = db.get(key(put.Item));
  const c = put.ConditionExpression;
  if (!c) return true;
  if (c === 'attribute_not_exists(pk)') return !cur;
  if (c === 'lastRun = :last') return !!cur && cur.lastRun === put.ExpressionAttributeValues[':last'];
  if (c.startsWith('attribute_not_exists(lastRun)')) return !!cur && (cur.lastRun == null);
  throw new Error('unexpected condition ' + c);
}
const client = { async send(cmd) {
  if (cmd instanceof GetCommand) return { Item: structuredClone(db.get(key(cmd.input.Key))) };
  if (cmd instanceof ScanCommand) { scans++; return { Items: [] }; }
  if (cmd instanceof BatchGetCommand) {
    const [table, request] = Object.entries(cmd.input.RequestItems)[0];
    const rows = table === 'signum-xs-history'
      ? request.Keys.map(({ ticker, date }) => ({ ticker, date, close: 20, mcap: 2e10, xsScore: ticker === 'NEWA' ? 97 : 80 }))
      : [];   // alpha-history carries no OHLC since 08-28 (as in production)
    return { Responses: { [table]: rows } };
  }
  if (cmd instanceof BatchWriteCommand) throw new Error('engine must not BatchWrite the journal any more');
  if (cmd instanceof TransactWriteCommand) {
    const puts = cmd.input.TransactItems.map(x => x.Put);
    assert.ok(puts.length <= 100, 'transaction over 100 items');
    const keys = puts.map(p => key(p.Item));
    if (new Set(keys).size !== keys.length) { const e = new Error('Transaction request cannot include multiple operations on one item'); e.name = 'ValidationException'; throw e; }
    if (failTxn) { failTxn = false; const e = new Error('injected transaction failure'); e.name = 'InternalServerError'; throw e; }
    if (!puts.every(condOk)) { const e = new Error('Transaction cancelled — ConditionalCheckFailed'); e.name = 'TransactionCanceledException'; throw e; }
    txns.push(puts.map(p => p.Item));
    for (const p of puts) db.set(key(p.Item), structuredClone(p.Item));
    return {};
  }
  throw Error('unexpected command');
} };
Module._load = function (id, parent, main) {
  if (id === '@aws-sdk/client-dynamodb') return { DynamoDBClient: class {} };
  if (id === '@aws-sdk/lib-dynamodb') return { DynamoDBDocumentClient: { from: () => client }, GetCommand, BatchGetCommand, BatchWriteCommand, ScanCommand, TransactWriteCommand };
  return originalLoad.call(this, id, parent, main);
};

// ── Redis + Intrinio mock ────────────────────────────────────────────────────
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.fixture.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.INTRINIO_API_KEY = 'fixture';
process.env.INTRINIO_BASE_URL = 'https://intrinio.fixture.invalid';
let redis, redisFail, quotes, xsCacheDate;
global.fetch = async (url, options = {}) => {
  url = String(url);
  if (url.startsWith('https://redis.fixture.invalid')) {
    if (options.method === 'POST') {
      if (redisFail) { redisFail = false; return { ok: false, json: async () => ({ error: 'down' }) }; }
      for (const [cmd, k, v] of JSON.parse(options.body)) if (cmd === 'SET') redis.set(k, JSON.parse(v));
      return { ok: true, json: async () => [{ result: 'OK' }] };
    }
    const k = decodeURIComponent(url.split('/get/')[1]);
    if (k === 'cache:xs:scores') return { ok: true, json: async () => ({ result: JSON.stringify({ date: xsCacheDate, scores: { NEWA: 97, AAA: 80, SPY: 0 } }) }) };
    return { ok: true, json: async () => ({ result: redis.has(k) ? JSON.stringify(redis.get(k)) : null }) };
  }
  if (url.startsWith('https://intrinio.fixture.invalid')) {
    const t = decodeURIComponent(url.split('/securities/')[1].split('/')[0]);
    const q = quotes[t];
    if (!q) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, json: async () => q };
  }
  throw new Error('unexpected fetch ' + url);
};
const session = (etDay, open, close) => ({ last_time: `${etDay}T20:55:00-05:00`, open_price: open, close_price: close, market_volume: 1e6 });

const engine = require('../lambda-xs-paper/index.js');
const { tradeKey, assertUniqueKeys, weekdaysBetween } = engine.__test;
const quiet = async fn => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const run = ev => quiet(() => engine.handler(ev));

// ── 11/5 replica: 3 tranches of SGHC/TTD/SMR/PRMB, WBD stale ×3, 11/4 orders ─
const D = '2026-11-05';
function fixture({ lastRun = '2026-11-04', weekStartNav = 1326.9977, posOverride, extraOrders = [] } = {}) {
  NOW = RealDate.parse('2026-11-06T01:30:00Z');
  db = new Map(); txns = []; failTxn = false; scans = 0; redis = new Map(); redisFail = false; xsCacheDate = D;
  const pos = posOverride || [
    ...['PRMB', 'SGHC', 'TTD', 'SMR', 'PTON'].map(t => ({ t, qty: 2, entryPx: 10, entryDate: '2026-11-02', tradingDaysHeld: 2 })),
    ...['PRMB', 'SGHC', 'TTD', 'SMR'].map(t => ({ t, qty: 2, entryPx: 10, entryDate: '2026-11-03', tradingDaysHeld: 1 })),
    ...['PRMB', 'SGHC', 'TTD', 'SMR'].map(t => ({ t, qty: 2, entryPx: 10, entryDate: '2026-11-04', tradingDaysHeld: 0 })),
    { t: 'WBD', qty: 1.34, entryPx: 30.95, entryDate: '2026-10-05', tradingDaysHeld: 22 },
    { t: 'WBD', qty: 1.35, entryPx: 30.95, entryDate: '2026-10-02', tradingDaysHeld: 23 },
    { t: 'WBD', qty: 1.34, entryPx: 30.95, entryDate: '2026-10-01', tradingDaysHeld: 24 },
  ];
  const orders = [...['SGHC', 'TTD', 'SMR', 'XPEV'], ...extraOrders].map(t => ({ t, side: 'BUY', usd: 20, created: lastRun, filled: false }));
  for (const item of [
    { pk: 'STATE', sk: '_CURRENT_', cash: -113.5, halted: false, haltReason: null, weekId: '2026-W45', weekStartNav, lastRun },
    { pk: 'POS', sk: '_OPEN_', list: pos },
    { pk: 'ORDERS', sk: lastRun, orders },
    { pk: 'NAV', sk: lastRun, nav: 1360.22, tradingDay: true },
  ]) db.set(key(item), structuredClone(item));
  quotes = { SPY: session(D, 765.54, 733) };
  for (const t of ['PRMB', 'SGHC', 'TTD', 'SMR', 'PTON', 'XPEV', 'NEWA', 'AAA']) quotes[t] = session(D, 10, 8);   // −20% day
  // WBD: vendor's last session is 10/05 (stale, as in production)
  quotes.WBD = { last_time: '2026-10-05T23:43:35Z', open_price: 30.94, close_price: 30.95, market_volume: 0 };
}
const trades = () => [...db.values()].filter(x => x.pk === 'TRADE');
const st = () => db.get(key({ pk: 'STATE', sk: '_CURRENT_' }));
const snapshot = () => JSON.stringify([...db.entries()].sort());

(async () => {
  // unit: key helpers
  { const seen = new Map(); const p = { t: 'SGHC', entryDate: '2026-11-03' };
    assert.equal(tradeKey(D, p, true, seen), '2026-11-05#SGHC#KILL#2026-11-03#0');
    assert.equal(tradeKey(D, p, true, seen), '2026-11-05#SGHC#KILL#2026-11-03#1');
    assert.equal(tradeKey(D, p, false, seen), '2026-11-05#SGHC#2026-11-03#0');
    assert.throws(() => assertUniqueKeys([{ pk: 'TRADE', sk: 'a' }, { pk: 'TRADE', sk: 'a' }]), /duplicate journal keys/);
    assert.deepEqual(weekdaysBetween('2026-11-04', '2026-11-05'), []);
    assert.deepEqual(weekdaysBetween('2026-11-03', '2026-11-05'), ['2026-11-04']);
    assert.deepEqual(weekdaysBetween('2026-10-30', '2026-11-02'), []);
    console.log('PASS unit: tranche-sequenced keys, duplicate guard, weekday gap'); }

  // DRY first: no writes at all
  fixture(); const before = snapshot();
  const dry = JSON.parse((await run({ date: D, dry: true })).body);
  assert.equal(dry.dry, true); assert.equal(dry.halted, true); assert.equal(txns.length, 0); assert.equal(snapshot(), before); assert.equal(redis.size, 0);
  console.log('PASS DRY backfill: kill computed, nothing written');

  // 11/5 backfill: kill over 3 tranches → one transaction, unique keys
  fixture();
  const r = JSON.parse((await run({ date: D })).body);
  assert.equal(txns.length, 1);
  assert.equal(r.halted, true); assert.equal(r.tradingDay, true);
  const tr = trades();
  assert.equal(new Set(tr.map(key)).size, tr.length);
  // 5 normal exits (11/02 tranche) + kill: 4 (11/03) + 4 (11/04) + 4 filled 11/05 orders + 3 WBD = 15
  assert.equal(tr.filter(t => !t.kill).length, 5);
  assert.equal(tr.filter(t => t.kill).length, 15);
  assert.equal(tr.filter(t => t.t === 'SGHC').length, 4);   // 11/02 exit + 11/03, 11/04, 11/05 kill
  assert.ok(tr.some(t => t.sk === '2026-11-05#SGHC#KILL#2026-11-05#0'));
  assert.ok(tr.filter(t => t.t === 'WBD').every(t => t.kill && t.exitPx === 30.95));   // stale WBD: scheduled fallback (entryPx), unchanged
  assert.equal(st().lastRun, D); assert.equal(st().halted, true); assert.match(st().haltReason, /weekly kill/);
  assert.equal(db.get(key({ pk: 'POS', sk: '_OPEN_' })).list.length, 0);
  assert.ok(db.get(key({ pk: 'NAV', sk: D })).tradingDay);
  assert.ok(db.get(key({ pk: 'ORDERS', sk: '2026-11-04' })).orders.every(o => o.filled));
  assert.equal(redis.get('cache:xs:paper').date, D); assert.equal(redis.get('cache:xs:paper').halted, true);
  { const n = db.get(key({ pk: 'NAV', sk: D })); assert.equal(n.posValue, 0); assert.equal(n.nav, n.cash); }
  assert.equal(scans, 0, 'cache universe is the backfill date → no table scan');
  console.log(`PASS 11/5 backfill: ${tr.length} trades (kill ${tr.filter(t => t.kill).length}) unique, one transaction, STATE/NAV/POS/ORDERS/cache consistent`);

  // retry after commit → no re-apply, cache re-published
  const committed = snapshot(); redis.delete('cache:xs:paper');
  const again = JSON.parse((await run({ date: D })).body);
  assert.equal(again.skipped, true); assert.equal(txns.length, 1); assert.equal(snapshot(), committed);
  assert.equal(redis.get('cache:xs:paper').date, D);
  console.log('PASS retry after commit: skipped, journal untouched, cache re-published');

  // transaction failure → nothing written; retry (with moved prices) commits once, same keys
  fixture(); const pre = snapshot(); failTxn = true;
  await assert.rejects(run({ date: D }), /injected transaction failure/);
  assert.equal(snapshot(), pre); assert.equal(trades().length, 0);
  quotes.SGHC = session(D, 10, 7.5);
  await run({ date: D });
  assert.equal(txns.length, 1); assert.equal(trades().length, 20); assert.equal(st().lastRun, D);
  assert.equal(trades().find(t => t.sk === '2026-11-05#SGHC#KILL#2026-11-03#0').exitPx, 7.5);
  console.log('PASS failed attempt leaves nothing; retry commits exactly once');

  // concurrent run committed first → STATE condition cancels the second, nothing double-written
  fixture(); { const s = st(); s.lastRun = '2026-11-05'; db.set(key(s), s); }
  const res = JSON.parse((await run({ date: D })).body); assert.equal(res.skipped, true);
  fixture(); { const orig = client.send; let raced = false;
    client.send = async function (cmd) { if (cmd instanceof TransactWriteCommand && !raced) { raced = true; const s = st(); s.lastRun = D; db.set(key(s), s); } return orig.call(this, cmd); };
    await assert.rejects(run({ date: D }), /TransactionCanceled|ConditionalCheckFailed/);
    client.send = orig; }
  assert.equal(trades().length, 0);
  console.log('PASS concurrent run: STATE condition cancels the loser, no TRADE rows');

  // backfill refusals — explicit error, nothing written
  fixture({ posOverride: [{ t: 'PRMB', qty: 1, entryPx: 10, entryDate: '2026-11-04', tradingDaysHeld: 0 }, { t: 'GONE', qty: 1, entryPx: 10, entryDate: '2026-11-04', tradingDaysHeld: 0 }] });
  let p0 = snapshot(); await assert.rejects(run({ date: D }), /no vendor session for GONE/); assert.equal(snapshot(), p0);
  fixture(); delete quotes.SPY; p0 = snapshot(); await assert.rejects(run({ date: D }), /no vendor session for SPY/); assert.equal(snapshot(), p0);
  fixture({ extraOrders: ['NOPE'] }); p0 = snapshot(); await assert.rejects(run({ date: D }), /NOPE\(order\)/); assert.equal(snapshot(), p0);
  fixture({ lastRun: '2026-11-03' }); p0 = snapshot(); await assert.rejects(run({ date: D }), /unprocessed weekday\(s\) 2026-11-04/); assert.equal(snapshot(), p0);
  fixture({ lastRun: '2026-11-03' }); p0 = snapshot(); await assert.rejects(run({ date: '2026-11-04' }), /no price source/); assert.equal(snapshot(), p0);
  fixture(); db.set(key({ pk: 'NAV', sk: D }), { pk: 'NAV', sk: D, tradingDay: true }); await assert.rejects(run({ date: D }), /NAV already exists/);
  fixture(); await assert.rejects(run({ date: '2026-11-03' }), /before STATE.lastRun/);
  for (const date of ['2026-02-30', 'bad', '9999-01-01']) await assert.rejects(run({ date }), /Invalid or future/);
  console.log('PASS backfill refusals: missing vendor session (SPY/position/order), weekday gap, past session, existing NAV, rewind, invalid dates');

  // backfill reads the XS universe exactly like the scheduled run (cache date), never refuses on it, never scans
  fixture({ weekStartNav: 1 }); xsCacheDate = '2026-11-04';
  await run({ date: D }); assert.equal(scans, 0); assert.equal(redis.get('cache:xs:paper').xsDate, '2026-11-04'); assert.equal(st().lastRun, D);
  assert.ok(db.get(key({ pk: 'ORDERS', sk: D })).orders.some(o => o.t === 'NEWA'));
  console.log('PASS backfill uses the scheduled XS source (cache date) — no refusal, no scan');

  // holiday in between (journaled tradingDay:false) is not a gap; a missing weekday is
  fixture({ lastRun: '2026-11-03' }); db.set(key({ pk: 'NAV', sk: '2026-11-04' }), { pk: 'NAV', sk: '2026-11-04', tradingDay: false });
  await run({ date: D }); assert.equal(st().lastRun, D);
  console.log('PASS holiday NAV row (tradingDay:false) between lastRun and backfill date is accepted');

  // scheduled run (no event.date) 11/06 22:40Z: normal exits, new orders, cache failure → retry repairs
  fixture({ weekStartNav: 1 });
  NOW = RealDate.parse('2026-11-06T22:40:00Z'); xsCacheDate = '2026-11-06';
  { const s = st(); s.lastRun = D; db.set(key(s), s); const o = db.get(key({ pk: 'ORDERS', sk: '2026-11-04' })); db.set(key({ pk: 'ORDERS', sk: D }), { ...o, sk: D }); }
  for (const t of Object.keys(quotes)) if (t !== 'WBD') quotes[t] = session('2026-11-06', 10, 11);
  redisFail = true;
  await assert.rejects(run({}), /cache:xs:paper write failed/);
  assert.equal(st().lastRun, '2026-11-06'); assert.equal(txns.length, 1);
  const live = trades(); assert.equal(new Set(live.map(key)).size, live.length); assert.ok(live.every(t => !t.kill && /^2026-11-06#[A-Z]+#\d{4}-\d{2}-\d{2}#\d+$/.test(t.sk)));
  assert.ok(db.get(key({ pk: 'ORDERS', sk: '2026-11-06' })).orders.some(o => o.t === 'NEWA'));
  await run({}); assert.equal(redis.get('cache:xs:paper').date, '2026-11-06'); assert.equal(txns.length, 1);
  // undated async retry after UTC midnight (ET still 11/06 evening) → same session, skip, no 11/07 row
  NOW = RealDate.parse('2026-11-07T00:30:00Z'); redis.delete('cache:xs:paper');
  const late = JSON.parse((await run({})).body);
  assert.equal(late.date, '2026-11-06'); assert.equal(late.skipped, true); assert.equal(txns.length, 1);
  assert.equal(db.has(key({ pk: 'NAV', sk: '2026-11-07' })), false); assert.equal(redis.get('cache:xs:paper').date, '2026-11-06');
  console.log('PASS scheduled run: atomic commit, deterministic keys, cache failure → retry (incl. past UTC midnight) re-publishes without re-applying');

  // day larger than one transaction → explicit error, nothing written
  fixture({ posOverride: Array.from({ length: 120 }, (_, n) => ({ t: 'PRMB', qty: 1, entryPx: 10, entryDate: '2026-11-04', tradingDaysHeld: 0, n })) });
  p0 = snapshot(); await assert.rejects(run({ date: D }), /> 100 \(one transaction\)/); assert.equal(snapshot(), p0);
  console.log('PASS >100 journal items refused before any write');
})().catch(e => { console.error(e); process.exitCode = 1; });
