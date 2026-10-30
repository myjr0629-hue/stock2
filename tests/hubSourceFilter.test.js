// 실제 허브의 주식 체결 처리 함수를 분리해 네트워크 없이 상태와 방송을 검증한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../scripts/ec2-price-ws.js'), 'utf8');
const start = source.indexOf('const regularSessionFormatter =');
const end = source.indexOf('\nfunction throttledBroadcast(', start);
assert.ok(start >= 0 && end > start);
const code = source.slice(start, end) + '\nthis.handleTradeUpdate = handleTradeUpdate;';

function run(rx, eventMs, ticker = 'TEST') {
  const broadcasts = [];
  const liveTicks = new Map(), latestPrices = new Map(), staleDropped = new Map(), lastAcceptedTradeMs = new Map();
  class Clock extends Date { static now() { return rx; } }
  const context = { Date: Clock, Intl, Object, Number, Math, liveTicks, latestPrices, staleDropped, lastAcceptedTradeMs,
    tickerSubscribers: new Map([[ticker, new Set()]]), subscribedOnPolygon: new Set(), serverJoined: new Set(),
    normalizeTradeMs: x => x, markPolygonDataReceived() {}, checkAndRefreshPrevClose() {},
    getETDateString: () => '2026-10-13', throttledBroadcast: (...args) => broadcasts.push(args) };
  vm.runInNewContext(code, context);
  context.handleTradeUpdate({ sym: ticker, p: 100, s: 1, t: eventMs, _intrinio: true });
  return { liveTicks, latestPrices, staleDropped, lastAcceptedTradeMs, broadcasts, context };
}
// 허브의 고정 날짜가 저장소 휴장일 판정과 2026–2027 평일 전체에서 일치한다.
const ts = require('typescript');
const holidaySource = fs.readFileSync(require('node:path').join(__dirname, '../src/services/marketDaySSOT.ts'), 'utf8');
const holidayModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(holidaySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: holidayModule.exports, Date, Intl, Set });
const holidayContext = run(Date.parse('2026-10-13T15:00:00Z'), 0).context;
for (let day = Date.parse('2026-01-01T12:00:00Z'); day < Date.parse('2028-01-01T12:00:00Z'); day += 86_400_000) {
  const date = new Date(day), weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) continue;
  const iso = date.toISOString().slice(0, 10);
  const middayET = Date.parse(`${iso}T17:00:00Z`);
  assert.equal(holidayContext.isRegularSession(middayET), !holidayModule.exports.isUSMarketHolidayET(iso), iso);
}
const regular = Date.parse('2026-10-13T15:00:00Z');
const premarket = Date.parse('2026-10-13T13:00:00Z');
let r = run(regular, regular - 900_000);
assert.equal(r.liveTicks.size, 0); assert.equal(r.latestPrices.size, 0); assert.equal(r.broadcasts.length, 0);
assert.equal(r.staleDropped.get('TEST'), 1);
r.context.handleTradeUpdate({ sym: 'TEST', p: 100, t: regular - 900_000, _intrinio: true });
assert.equal(r.staleDropped.get('TEST'), 2);
for (const [rx, lag] of [[regular, 30_000], [regular, 90_000], [premarket, 900_000],
  [Date.parse('2026-09-07T15:00:00Z'), 900_000], [Date.parse('2027-03-26T15:00:00Z'), 900_000],
  [Date.parse('2026-10-13T20:00:00Z'), 900_000], [Date.parse('2026-10-17T15:00:00Z'), 900_000]]) {
  r = run(rx, rx - lag);
  assert.equal(r.liveTicks.size, 1); assert.equal(r.latestPrices.size, 1); assert.equal(r.broadcasts.length, 1);
  assert.equal(r.staleDropped.size, 0);
}
r = run(regular, 0);
assert.equal(r.liveTicks.size, 1); assert.equal(r.broadcasts.length, 1);
r = run(regular, regular - 90_001);
assert.equal(r.staleDropped.get('TEST'), 1); assert.equal(r.broadcasts.length, 0);
for (const [ts, removed] of [[regular - 90_001, true], [regular - 90_000, false], [regular - 1_000, false], [0, true]]) {
  r.latestPrices.set('TEST', { price: 100, ts });
  r.context.handleTradeUpdate({ sym: 'TEST', p: 100, t: regular - 900_000 });
  assert.equal('price' in r.latestPrices.get('TEST'), !removed);
}
// 이전 종가와 조회 상태는 보존하고 이후 정상 체결에서 등락률을 계산한다.
r.latestPrices.set('TEST', { price: 100, ts: regular - 900_000, prevClose: 80,
  prevCloseDate: '2026-10-13', isFetchingPrevClose: true, receivedAt: regular - 900_000 });
r.context.handleTradeUpdate({ sym: 'TEST', p: 100, t: regular - 900_000 });
assert.equal(r.latestPrices.get('TEST').prevClose, 80);
assert.equal(r.latestPrices.get('TEST').prevCloseDate, '2026-10-13');
assert.equal(r.latestPrices.get('TEST').isFetchingPrevClose, true);
assert.equal('receivedAt' in r.latestPrices.get('TEST'), false);
r.context.handleTradeUpdate({ sym: 'TEST', p: 100, t: regular });
assert.equal(r.latestPrices.get('TEST').changePct, 25);

// 실제 폴백과 REST 응답을 네트워크 없이 실행한다.
(async () => {
const fallbackStart = source.indexOf('async function pollRestFallback()');
const fallbackEnd = source.indexOf('// ══════════════════════════════════════════════════════════════\n// STARTUP', fallbackStart);
assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart);
let now = regular, calls = [], pending = null;
class FallbackClock extends Date { static now() { return now; } }
const tickers = new Map(Array.from({length: 101}, (_, i) => [`T${i}`, new Set()]));
const fallback = { Date: FallbackClock, Intl, Object, Number, Math, Array, Set, console,
  tickerSubscribers: tickers, lastAcceptedTradeMs: new Map(), restFallbackActive: false,
  restFallbackTimer: null, lastPolygonDataTs: regular, REST_FALLBACK_CHECK_MS: 10_000,
  REST_POLL_INTERVAL_MS: 15_000, REST_MAX_TICKERS_PER_POLL: 20,
  lastRestPollStarted: -Infinity, restPollInFlight: false, restLastPolled: new Map(), restNextPollTimer: null,
  setInterval: () => 1, clearInterval() {},
  fetchSnapshotREST: batch => { calls.push({at: now, batch: [...batch]}); return new Promise(resolve => { pending = resolve; }); } };
vm.runInNewContext(source.slice(start, source.indexOf('\nfunction handleTradeUpdate', start)) +
  source.slice(fallbackStart, fallbackEnd), fallback);
const first = fallback.pollRestFallback();
now += 15_000;
await fallback.pollRestFallback(); // An unfinished batch cannot overlap.
assert.equal(calls.length, 1);
now = regular; pending(); await first;
for (let second = 0; second < 60; second++) {
  now = regular + second * 1000;
  const promise = fallback.pollRestFallback();
  if (pending) { const resolve = pending; pending = null; resolve(); }
  await promise;
}
assert.equal(calls.reduce((n, c) => n + c.batch.length, 0), 80);
assert.equal(new Set(calls.flatMap(c => c.batch)).size, 80);
assert.ok(calls.every(c => c.batch.length <= 20));
now = regular + 60_000;
const next = fallback.pollRestFallback(); pending(); await next;
assert.ok(calls.at(-1).batch.includes('T80'));

const restStart = source.indexOf('async function fetchSnapshotREST(');
const restEnd = source.indexOf('// REST fallback polling loop', restStart);
const sessionCode = source.slice(start, source.indexOf('\nfunction handleTradeUpdate', start));
const realConst = name => Number(source.match(new RegExp(`const ${name} = ([\\d_]+)`))[1].replace(/_/g, ''));
const REST_CONCURRENCY = realConst('REST_CONCURRENCY'), REST_REQUEST_TIMEOUT_MS = realConst('REST_REQUEST_TIMEOUT_MS');
const pendingResponses = []; let active = 0, peak = 0; const broadcasts = [];
const response = v => pendingResponses.shift()(v); // 먼저 보낸 요청부터 응답
const cache = new Map(), restStale = new Map();
const base = now - 50_000; // 정규장 안의 신선한 체결 시각 기준
const rest = { INTRINIO_API_KEY: 'test', latestPrices: cache, staleDropped: restStale, Date: FallbackClock, Intl, Object, Number, Math, Set, console,
  REST_REQUEST_TIMEOUT_MS, REST_CONCURRENCY, normalizeTradeMs: x => x || 0, getETDateString: () => '2026-10-13',
  httpsGet: () => { active++; peak = Math.max(peak, active); return new Promise(resolve => { pendingResponses.push(v => { active--; resolve(v); }); }); },
  broadcastPrice: (...args) => broadcasts.push(args) };
vm.runInNewContext(sessionCode + source.slice(restStart, restEnd), rest);
const request = rest.fetchSnapshotREST(['A', 'B']);
cache.set('A', {price: 110, ts: base + 200, prevClose: 90, prevCloseDate: '2026-10-13'});
response({last_price: 100, last_time: base + 100, eod_close_price: 90});
await new Promise(resolve => setImmediate(resolve));
assert.equal(cache.get('A').price, 110); assert.equal(broadcasts.length, 0);
response({last_price: 120, last_time: base + 300, eod_close_price: 100}); await request;
assert.equal(peak, 2); assert.ok(peak <= REST_CONCURRENCY); assert.equal(cache.get('B').price, 120);
const equal = rest.fetchSnapshotREST(['A']); response({last_price: 90, last_time: base + 200, eod_close_price: 90}); await equal;
assert.equal(cache.get('A').price, 110); assert.equal(broadcasts.length, 1);
const newer = rest.fetchSnapshotREST(['A']); response({last_price: 110, last_time: base + 201, eod_close_price: 90}); await newer;
assert.equal(cache.get('A').ts, base + 201); assert.equal(broadcasts.length, 2);

// 시나리오 1: 정규장에 REST 가 15분 전 체결을 주면 캐시가 없어도, WS 지연 체결로 가격이 지워진 캐시여도 저장·방송하지 않는다.
const fifteen = now - 900_000;
cache.clear(); broadcasts.length = 0;
let req = rest.fetchSnapshotREST(['NEW']); response({last_price: 50, last_time: fifteen, eod_close_price: 49}); await req;
assert.equal('price' in cache.get('NEW'), false); assert.equal(cache.get('NEW').prevClose, 49); // 가격은 버리고 prevClose 만
assert.equal(broadcasts.length, 0); assert.equal(restStale.get('NEW'), 1);
// 90초 경계: 정확히 90초 전은 채택, 90초+1ms 는 거부
req = rest.fetchSnapshotREST(['EDGE']); response({last_price: 50, last_time: now - 90_001, eod_close_price: 49}); await req;
assert.equal('price' in cache.get('EDGE'), false);
req = rest.fetchSnapshotREST(['EDGE']); response({last_price: 50, last_time: now - 90_000, eod_close_price: 49}); await req;
assert.equal(cache.get('EDGE').price, 50); broadcasts.length = 0;
// 실제 WS 처리 함수로 지연 체결을 버려 가격을 지운 캐시를 만든다.
const ws = run(now, now - 900_000, 'OLD');
ws.latestPrices.set('OLD', { price: 70, ts: now - 120_000, prevClose: 60, prevCloseDate: '2026-10-13' });
ws.context.handleTradeUpdate({ sym: 'OLD', p: 71, t: now - 900_000, _intrinio: true });
const wiped = ws.latestPrices.get('OLD');
assert.equal('price' in wiped, false); assert.equal('ts' in wiped, false);
assert.equal(wiped.prevClose, 60); assert.equal(wiped.lastTradeTs, now - 120_000);
cache.set('OLD', wiped);
req = rest.fetchSnapshotREST(['OLD']); response({last_price: 65, last_time: fifteen, eod_close_price: 60}); await req;
assert.equal('price' in cache.get('OLD'), false); assert.equal(broadcasts.length, 0);
// 장외(프리마켓)에는 기존처럼 지연 체결도 채택하되, 보존한 마지막 채택 시각보다 과거면 역행하지 않는다.
const savedNow = now; now = premarket;
cache.set('PRE', { prevClose: 60, lastTradeTs: premarket - 600_000 });
req = rest.fetchSnapshotREST(['PRE']); response({last_price: 61, last_time: premarket - 900_000}); await req;
assert.equal('price' in cache.get('PRE'), false); assert.equal(broadcasts.length, 0);
req = rest.fetchSnapshotREST(['PRE']); response({last_price: 62, last_time: premarket - 300_000}); await req;
assert.equal(cache.get('PRE').price, 62); assert.equal(broadcasts.length, 1);
now = savedNow; broadcasts.length = 0;

// 정규장 시각 없는 가격은 캐시 상태와 관계없이 버리고 종가 정정만 반영한다.
cache.clear(); broadcasts.length = 0;
cache.set('NT', { prevClose: 98, prevCloseDate: '2026-10-13' }); // 전일 종가 조회가 만든 빈 항목
req = rest.fetchSnapshotREST(['NT']); response({last_price: 101, eod_close_price: 98}); await req;
assert.equal('price' in cache.get('NT'), false); assert.equal(broadcasts.length, 0);
req = rest.fetchSnapshotREST(['NO_TIME']); response({last_price: 101}); await req;
assert.equal(cache.has('NO_TIME'), false); assert.equal(broadcasts.length, 0);
// 정규장 «종가만» 응답(체결 가격·시각 없음)은 prevClose 갱신에만 쓰고 가격으로 저장·방송하지 않는다.
req = rest.fetchSnapshotREST(['EOD']); response({eod_close_price: 97}); await req;
assert.equal('price' in cache.get('EOD'), false); assert.equal(cache.get('EOD').prevClose, 97); assert.equal(broadcasts.length, 0);
cache.set('EOD2', { price: 99, ts: now - 200_000, prevClose: 90, volume: 5 });
req = rest.fetchSnapshotREST(['EOD2']); response({eod_close_price: 97}); await req;
assert.equal(cache.get('EOD2').prevClose, 97); assert.equal(cache.get('EOD2').price, 99); assert.equal(broadcasts.length, 0);
// 장외 «종가만»은 기존 동작(종가를 eod_close 가격으로 저장·방송).
{ const saved = now; now = premarket;
  req = rest.fetchSnapshotREST(['OFF']); response({eod_close_price: 96}); await req;
  assert.equal(cache.get('OFF').price, 96); assert.equal(cache.get('OFF').priceBasis, 'eod_close'); assert.equal(broadcasts.length, 1);
  req = rest.fetchSnapshotREST(['OFF_TRADE']); response({last_price: 101}); await req;
  assert.equal(cache.get('OFF_TRADE').price, 101); assert.equal(cache.get('OFF_TRADE').ts, 0);
  assert.equal(cache.get('OFF_TRADE').changePct, 0); assert.equal(broadcasts.at(-1)[2], 0);
  cache.set('OFF_CACHED', { prevClose: 80, prevCloseDate: '2026-10-13' });
  req = rest.fetchSnapshotREST(['OFF_CACHED']); response({last_price: 100}); await req;
  assert.equal(cache.get('OFF_CACHED').changePct, 0); assert.equal(cache.get('OFF_CACHED').prevClose, 0);
  now = saved; broadcasts.length = 0; }
cache.set('FRESH', { price: 100, ts: now - 10_000, prevClose: 98 });
req = rest.fetchSnapshotREST(['FRESH']); response({last_price: 105}); await req;
assert.equal(cache.get('FRESH').price, 100); assert.equal(broadcasts.length, 0);
cache.set('AGED', { price: 100, ts: now - 200_000, prevClose: 98 });
req = rest.fetchSnapshotREST(['AGED']); response({last_price: 105, eod_close_price: 95}); await req;
assert.equal(cache.get('AGED').price, 100); assert.equal(cache.get('AGED').prevClose, 95); assert.equal(cache.get('AGED').changePct, 5.26); assert.equal(broadcasts.length, 0);
broadcasts.length = 0;

// 응답 종가가 없거나 0 이하이면 오늘 날짜 캐시만 기준으로 사용한다.
for (const [i, prev] of [undefined, 0, -1].entries()) {
  const key = `BASE${i}`;
  cache.set(key, { prevClose: 80, prevCloseDate: '2026-10-12' });
  req = rest.fetchSnapshotREST([key]); response({last_price: 100, last_time: now - 1_000, eod_close_price: prev}); await req;
  assert.equal(cache.get(key).price, undefined); assert.equal(cache.get(key).prevClose, 80);
  assert.equal(cache.get(key).prevCloseDate, '2026-10-12'); assert.equal(broadcasts.length, 0);
}
cache.set('TODAY_BASE', { prevClose: 80, prevCloseDate: '2026-10-13' });
req = rest.fetchSnapshotREST(['TODAY_BASE']); response({last_price: 100, last_time: now - 1_000}); await req;
assert.equal(cache.get('TODAY_BASE').price, 100); assert.equal(cache.get('TODAY_BASE').prevClose, 80);
assert.equal(cache.get('TODAY_BASE').prevCloseDate, '2026-10-13');
assert.equal(cache.get('TODAY_BASE').changePct, 25); assert.equal(broadcasts.at(-1)[2], 25);
req = rest.fetchSnapshotREST(['NO_BASE']); response({last_price: 100, last_time: now - 1_000}); await req;
assert.equal(cache.has('NO_BASE'), false); assert.equal(broadcasts.length, 1);
// 실제 방송 직렬화는 숫자 형태를 유지한다.
const sent = []; const subscriber = { readyState: 1, send: message => sent.push(JSON.parse(message)) };
const broadcastStart = source.indexOf('function broadcastPrice(');
const broadcastEnd = source.indexOf('\n}', broadcastStart) + 2;
const wire = { tickerSubscribers: new Map([['NO_BASE', new Set([subscriber])]]), latestPrices: cache, WebSocket: { OPEN: 1 }, JSON, Math };
vm.runInNewContext(source.slice(broadcastStart, broadcastEnd), wire);
wire.broadcastPrice('NO_BASE', 100, 25, 0);
assert.equal(sent[0].changePct, 25);
broadcasts.length = 0;

// 가격을 버리는 경로에서도 동일 종가의 오래된 날짜를 갱신하고 재방송하지 않는다.
cache.set('SAME_DATE', { price: 100, ts: now - 1_000, prevClose: 80, prevCloseDate: '2026-10-12', changePct: 25 });
req = rest.fetchSnapshotREST(['SAME_DATE']); response({last_price: 101, eod_close_price: 80}); await req;
assert.equal(cache.get('SAME_DATE').prevCloseDate, '2026-10-13');
assert.equal(cache.get('SAME_DATE').price, 100); assert.equal(broadcasts.length, 0);
req = rest.fetchSnapshotREST(['SAME_DATE']); response({last_price: 102, last_time: now}); await req;
assert.equal(cache.get('SAME_DATE').changePct, 27.5); assert.ok(Math.abs(broadcasts.at(-1)[2] - 27.5) < 1e-9);
broadcasts.length = 0;

// 정규장 종가 단독 응답이 prevClose 를 바꾸면 캐시 가격의 등락률도 새 기준으로 다시 계산한다.
cache.set('PCT', { price: 100, ts: now - 200_000, prevClose: 95, changePct: 5.26 });
req = rest.fetchSnapshotREST(['PCT']); response({eod_close_price: 90}); await req;
assert.equal(cache.get('PCT').prevClose, 90); assert.equal(cache.get('PCT').changePct, 11.11); assert.equal(cache.get('PCT').price, 100);
assert.equal(broadcasts.length, 0); // 가격 방송 없음
assert.deepEqual({ ...rest.withPrevClose({ prevClose: 1 }, 50, 'd') }, { prevClose: 50, prevCloseDate: 'd' }); // 가격 없으면 등락 미생성

// prevClose 정정 → 방송 가능한 캐시 가격이면 기존 구독자에게 1회 재방송(가격·시각은 캐시 그대로), 아니면 0회.
cache.set('RB', { price: 110, ts: now - 10_000, priceBasis: 'trade', prevClose: 100, changePct: 10, volume: 3 });
req = rest.fetchSnapshotREST(['RB']); response({eod_close_price: 105}); await req;
assert.deepEqual(broadcasts.map(b => [...b]), [['RB', 110, 4.76, 3]]); assert.equal(cache.get('RB').ts, now - 10_000);
req = rest.fetchSnapshotREST(['RB']); response({eod_close_price: 105}); await req; // 기준 불변
assert.equal(broadcasts.length, 1);
cache.set('RB2', { price: 110, ts: now - 200_000, priceBasis: 'trade', prevClose: 100, volume: 3 }); // 방송 불가(90초 넘음)
req = rest.fetchSnapshotREST(['RB2']); response({eod_close_price: 105}); await req;
assert.equal(cache.get('RB2').changePct, 4.76); assert.equal(broadcasts.length, 1);
broadcasts.length = 0;
// 체결 가격이 있는 응답도 가격을 버리는 분기(같은·더 오래된 시각, 90초 넘은 체결, 시각 없음)에서 prevClose 정정은 반영·재방송한다.
for (const [label, body] of [['same', { last_price: 111, last_time: now - 10_000 }], ['older', { last_price: 111, last_time: now - 20_000 }],
  ['stale', { last_price: 111, last_time: now - 900_000 }], ['timelessFresh', { last_price: 111 }], ['timelessSame', { last_price: 110 }]]) {
  const key = `PC-${label}`; broadcasts.length = 0;
  cache.set(key, { price: 110, ts: now - 10_000, priceBasis: 'trade', prevClose: 100, changePct: 10, volume: 3 });
  req = rest.fetchSnapshotREST([key]); response({ ...body, eod_close_price: 105 }); await req;
  assert.equal(cache.get(key).price, 110, label); assert.equal(cache.get(key).ts, now - 10_000, label);
  assert.equal(cache.get(key).changePct, 4.76, label); assert.deepEqual(broadcasts.map(b => [...b]), [[key, 110, 4.76, 3]], label);
  req = rest.fetchSnapshotREST([key]); response({ ...body, eod_close_price: 105 }); await req; // prevClose 같으면 방송 0
  assert.equal(broadcasts.length, 1, label);
}
broadcasts.length = 0;
// 날짜 넘김 갱신(checkAndRefreshPrevClose)도 같은 규칙.
{ const crStart = source.indexOf('function checkAndRefreshPrevClose(');
  const crEnd = source.indexOf('\nfunction handleAggregateUpdate(', crStart);
  assert.ok(crStart >= 0 && crEnd > crStart);
  let nextClose = 105; const crCache = new Map(), crSent = [];
  const cr = { latestPrices: crCache, Date: FallbackClock, Intl, Object, Number, Math, Set, console: { log() {} },
    getETDateString: () => '2026-10-13', fetchPreviousClose: async () => nextClose, broadcastPrice: (...a) => crSent.push(a) };
  vm.runInNewContext(sessionCode + source.slice(crStart, crEnd), cr);
  const roll = async (ticker, entry) => { crCache.set(ticker, entry); cr.checkAndRefreshPrevClose(ticker, crCache.get(ticker));
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
  await roll('X', { price: 110, ts: now - 10_000, priceBasis: 'trade', prevClose: 100, prevCloseDate: '2026-10-12', volume: 3 });
  assert.deepEqual(crSent.map(b => [...b]), [['X', 110, 4.76, 3]]); assert.equal(crCache.get('X').changePct, 4.76);
  nextClose = 100;
  await roll('Y', { price: 110, ts: now - 10_000, prevClose: 100, prevCloseDate: '2026-10-12', volume: 3 }); // 기준 불변
  await roll('Z', { price: 110, ts: now - 200_000, prevClose: 90, prevCloseDate: '2026-10-12', volume: 3 }); // 방송 불가
  assert.equal(crSent.length, 1); assert.equal(crCache.get('Z').changePct, 10); }

// 경로 × 세션 표: 장후·휴장·조기 폐장 뒤·주말엔 REST 지연 체결·종가 단독 모두 기존 동작(저장·방송), 정규장만 90초 규칙.
const offSessions = { post: Date.parse('2026-10-13T21:00:00Z'), holiday: Date.parse('2026-11-26T16:00:00Z'),
  earlyAfter: Date.parse('2026-11-27T18:30:00Z'), weekend: Date.parse('2026-10-17T15:00:00Z'), pre: premarket };
{ const saved = now;
  for (const [name, at] of Object.entries(offSessions)) {
    now = at; cache.clear(); broadcasts.length = 0;
    req = rest.fetchSnapshotREST([`L-${name}`]); response({last_price: 70, last_time: at - 900_000, eod_close_price: 69}); await req;
    assert.equal(cache.get(`L-${name}`).price, 70, name);
    req = rest.fetchSnapshotREST([`C-${name}`]); response({eod_close_price: 69}); await req;
    assert.equal(cache.get(`C-${name}`).price, 69, name); assert.equal(cache.get(`C-${name}`).priceBasis, 'eod_close', name);
    assert.equal(broadcasts.length, 2, name);
  }
  // 조기 폐장일 정규장 중(12:30 ET)엔 정규장 규칙이 적용된다.
  now = Date.parse('2026-11-27T17:30:00Z'); cache.clear(); broadcasts.length = 0;
  req = rest.fetchSnapshotREST(['EARLY']); response({last_price: 70, last_time: now - 900_000}); await req;
  assert.equal(cache.has('EARLY'), false);
  req = rest.fetchSnapshotREST(['EARLY']); response({eod_close_price: 69}); await req;
  assert.equal('price' in cache.get('EARLY'), false); assert.equal(broadcasts.length, 0);
  now = saved; cache.clear(); broadcasts.length = 0; }

// 구독 스냅샷 판정: 정규장엔 시각 있는 90초 안 체결만, 그 밖의 세션은 기존대로 전부.
for (const [label, at, regularRule] of [['regular', regular, true], ['earlyRegular', Date.parse('2026-11-27T17:30:00Z'), true],
  ...Object.entries(offSessions).map(([n, a]) => [n, a, false])]) {
  const cases = [[{ price: 1, ts: at - 30_000, priceBasis: 'trade' }, true], [{ price: 1, ts: at - 90_000 }, true],
    [{ price: 1, ts: at - 90_001 }, false], [{ price: 1, ts: 0, priceBasis: 'trade' }, false],
    [{ price: 1, ts: 0, priceBasis: 'eod_close' }, false], [{ price: 1, ts: at - 1_000, priceBasis: 'eod_close' }, false]];
  for (const [cached, inRegular] of cases) assert.equal(rest.isSnapshotSendable(cached, at), regularRule ? inRegular : true, `${label} ${JSON.stringify(cached)}`);
}

// 조기 폐장일(13:00 ET): 허브 판정이 저장소 marketCalendar 와 같은 날짜·시각을 쓴다.
const calSource = fs.readFileSync(require('node:path').join(__dirname, '../src/lib/marketCalendar.ts'), 'utf8');
const cal = { exports: {} };
vm.runInNewContext(ts.transpileModule(calSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: cal.exports, Date, Intl, Set, Math, Number, String, Object, Array });
assert.deepEqual([...vm.runInContext("EARLY_CLOSE_DATES", holidayContext)].sort(), [...cal.exports.EARLY_CLOSE_DATES].sort());
for (let day = Date.parse('2026-01-01T00:00:00Z'); day < Date.parse('2028-01-01T00:00:00Z'); day += 86_400_000) {
  for (let m = 12 * 60; m <= 22 * 60; m += 30) {
    const at = day + m * 60_000;
    assert.equal(holidayContext.isRegularSession(at), cal.exports.cashSessionPhaseAt(at) === 'regular', new Date(at).toISOString());
  }
}
const earlyAfter = Date.parse('2026-11-27T18:30:00Z'); // 13:30 ET 조기 폐장 뒤
assert.equal(holidayContext.isRegularSession(Date.parse('2026-11-27T17:59:00Z')), true);
assert.equal(holidayContext.isRegularSession(Date.parse('2026-11-27T18:00:00Z')), false);
r = run(earlyAfter, earlyAfter - 900_000);
assert.equal(r.broadcasts.length, 1); assert.equal(r.staleDropped.size, 0);

// 시나리오 2: 실제 httpsGet·폴백 루프로 한 종목 응답이 정체되면 타임아웃 뒤 다음 종목·다음 폴백이 진행되고 앞 종목은 즉시 방송된다.
const { EventEmitter } = require('node:events');
const httpsStart = source.indexOf('function httpsGet(');
const httpsEnd = source.indexOf('\n// Helper: Get ET Date String', httpsStart);
assert.ok(httpsStart >= 0 && httpsEnd > httpsStart);
const requested = [], stalled = [];
const fakeHttps = { get(url, onResponse) {
  const req = new EventEmitter(); const sym = decodeURIComponent(url.split('/securities/')[1].split('/')[0]);
  requested.push(sym);
  req.destroy = err => { stalled.push(sym); setImmediate(() => { req.emit('error', err); req.emit('close'); }); };
  if (sym !== 'STALL') setImmediate(() => {
    const res = new EventEmitter(); res.setEncoding = () => res; onResponse(res);
    res.emit('data', JSON.stringify({ last_price: 10 + requested.length, last_time: now - 1_000, eod_close_price: 10 }));
    res.emit('end'); req.emit('close');
  });
  return req;
} };
const hubBroadcasts = [];
const hub = { INTRINIO_API_KEY: 'test', https: fakeHttps, latestPrices: new Map(), staleDropped: new Map(), Date: FallbackClock, Intl, Object, Number, Math, Array, Set,
  JSON, Error, setTimeout, clearTimeout, console: { warn() {}, log() {} }, REST_REQUEST_TIMEOUT_MS: 30, REST_CONCURRENCY,
  normalizeTradeMs: x => x, getETDateString: () => '2026-10-13', broadcastPrice: (...args) => hubBroadcasts.push(args),
  tickerSubscribers: new Map([['FIRST', new Set()], ['STALL', new Set()], ['LAST', new Set()]]),
  lastAcceptedTradeMs: new Map(), restFallbackActive: true, restFallbackTimer: null, lastPolygonDataTs: now,
  REST_FALLBACK_CHECK_MS: 10_000, REST_POLL_INTERVAL_MS: 15_000, REST_MAX_TICKERS_PER_POLL: 20,
  lastRestPollStarted: -Infinity, restPollInFlight: false, restLastPolled: new Map(), restNextPollTimer: null, setInterval: () => 1, clearInterval() {} };
vm.runInNewContext(source.slice(httpsStart, httpsEnd) + sessionCode + source.slice(restStart, restEnd) +
  source.slice(fallbackStart, fallbackEnd), hub);
const poll = hub.pollRestFallback();
await new Promise(resolve => setTimeout(resolve, 5));
assert.deepEqual(requested, ['FIRST', 'STALL', 'LAST']);
assert.deepEqual(hubBroadcasts.map(b => b[0]), ['FIRST', 'LAST']); // 묶음 끝·정체 종목을 기다리지 않는다
assert.equal(hub.restPollInFlight, true);
await poll;
assert.deepEqual(stalled, ['STALL']);
assert.deepEqual(hubBroadcasts.map(b => b[0]), ['FIRST', 'LAST']);
assert.equal(hub.restPollInFlight, false);
now += 15_000;
await hub.pollRestFallback(); // 정체 뒤에도 다음 폴백이 돈다
assert.equal(requested.length, 6);
// 가상 시계: 실제 상수(동시성·요청 타임아웃·회당 20·15초 주기)로 최악 지연과 분당 호출 수를 잰다.
function virtualHub(symbols, stallAll, delayMs = 0, chained = false) {
  let vnow = regular; const timers = []; let seq = 0, calls = 0, maxActive = 0, open = 0; const callTimes = [], updates = new Map();
  class VClock extends Date { static now() { return vnow; } }
  const vHttps = { get(url, onResponse) {
    calls++; open++; maxActive = Math.max(maxActive, open); callTimes.push(vnow);
    const req = new EventEmitter();
    req.destroy = err => { open--; req.emit('error', err); };
    if (!stallAll) (delayMs > 0 ? f => ctx.setTimeout(f, delayMs) : f => Promise.resolve().then(f))(() => {
      const res = new EventEmitter(); res.setEncoding = () => res; onResponse(res); open--;
      res.emit('data', JSON.stringify({ last_price: 10, last_time: vnow - 1_000, eod_close_price: 9 })); res.emit('end');
    });
    return req;
  } };
  const ctx = { ...hub, https: vHttps, Date: VClock, latestPrices: new Map(), staleDropped: new Map(), broadcastPrice: t => updates.set(t, [...(updates.get(t) || []), vnow]),
    restFallbackTimer: chained ? 1 : null,
    tickerSubscribers: new Map(symbols.map(t => [t, new Set()])), restLastPolled: new Map(), restNextPollTimer: null, restPollInFlight: false, lastRestPollStarted: -Infinity,
    REST_REQUEST_TIMEOUT_MS, REST_CONCURRENCY, REST_POLL_INTERVAL_MS: realConst('REST_POLL_INTERVAL_MS'),
    REST_MAX_TICKERS_PER_POLL: realConst('REST_MAX_TICKERS_PER_POLL'),
    setTimeout: (fn, ms) => { const t = { at: vnow + ms, fn, id: seq++ }; timers.push(t); return t; },
    clearTimeout: t => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } };
  vm.runInNewContext(source.slice(httpsStart, httpsEnd) + sessionCode + source.slice(restStart, restEnd) +
    source.slice(fallbackStart, fallbackEnd), ctx);
  const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
  const drain = async promise => { let done = false; promise.then(() => { done = true; });
    for (;;) { await flush(); if (done) return;
      timers.sort((a, b) => a.at - b.at || a.id - b.id); const t = timers.shift(); assert.ok(t, 'no timer pending');
      vnow = t.at; t.fn(); } };
  const driveUntil = async until => { for (;;) { await flush();
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      if (!timers.length || timers[0].at > until) { vnow = until; return; }
      const t = timers.shift(); vnow = t.at; t.fn(); } };
  return { ctx, drain, driveUntil, callTimes, updates, get now() { return vnow; }, set now(v) { vnow = v; }, get calls() { return calls; }, get maxActive() { return maxActive; } };
}
// 최악 지연: 20종목 전부 정체해도 묶음은 30초 안에 끝나고 다음 폴백이 돈다.
const worst = virtualHub(Array.from({ length: 20 }, (_, i) => `S${i}`), true);
await worst.drain(worst.ctx.pollRestFallback());
assert.ok(worst.now - regular <= 30_000, `worst ${worst.now - regular}ms`);
assert.equal(worst.calls, 20); assert.equal(worst.maxActive, REST_CONCURRENCY);
assert.equal(worst.ctx.restPollInFlight, false);
// 호출 상한: 101종목 지연·즉시 응답이어도 60초에 80회 이하.
const rate = virtualHub(Array.from({ length: 101 }, (_, i) => `R${i}`), false);
for (let sec = 0; sec < 60; sec++) { rate.now = regular + sec * 1000; await rate.drain(rate.ctx.pollRestFallback()); }
assert.ok(rate.calls <= 80, `calls ${rate.calls}`); assert.equal(rate.calls, 80);
// 시작 간 15초 연쇄 예약·오래된 순 순환: 21종목 장애 시 첫 갱신 ≤ 20초, 이후 종목당 간격 ≤ 30초.
const chain21 = virtualHub(Array.from({ length: 21 }, (_, i) => `C${i}`), false, 0, true);
chain21.ctx.pollRestFallback(); await chain21.driveUntil(regular + 180_000);
assert.equal(chain21.updates.size, 21);
for (const [t, times] of chain21.updates) {
  assert.ok(times[0] - regular <= 20_000, `${t} first ${times[0] - regular}`);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] <= 30_000, `${t} gap ${times[i] - times[i - 1]}`);
  assert.ok(times.length >= 6, `${t} count ${times.length}`);
}
// 묶음 소요 4초(요청 0.8초 × 5회)면 다음 묶음은 시작 15초 뒤에 시작한다.
const slow = virtualHub(Array.from({ length: 40 }, (_, i) => `D${i}`), false, 800, true);
slow.ctx.pollRestFallback(); await slow.driveUntil(regular + 31_000);
const starts = [...new Set(slow.callTimes)].filter((at, i, all) => i === 0 || at - all[i - 1] > 1_000);
assert.deepEqual(starts.slice(0, 3).map(at => at - regular), [0, 15_000, 30_000]);
// 연쇄 예약에서도 101종목 분당 80회 이하.
const chainRate = virtualHub(Array.from({ length: 101 }, (_, i) => `E${i}`), false, 0, true);
chainRate.ctx.pollRestFallback(); await chainRate.driveUntil(regular + 120_000);
for (let w = regular; w <= regular + 60_000; w += 1_000) {
  const n = chainRate.callTimes.filter(at => at >= w && at < w + 60_000).length;
  assert.ok(n <= 80, `window ${w - regular}: ${n}`);
}
console.log('hubSourceFilter: 통과');
})().catch(error => { console.error(error); process.exitCode = 1; });
