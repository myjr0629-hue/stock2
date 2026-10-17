/**
 * P1 time/basis regressions. No sockets, .env reads, or external I/O.
 * Input envelope: measure/out/20261016T133627.576464Z-local.json (now/live/ticks;
 * actual ticks empty). SDK/CSV rows and boundary values below are synthetic,
 * using the production SDK adapter and CSV headers; no captured CSV was available.
 * Runs whole production modules in a VM, replacing only I/O/React scheduling.
 * Run: ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}' tests/priceTimeBasis.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { EventEmitter } from 'node:events';
import * as calendar from '../src/lib/marketCalendar';
import { acceptHubTick, applyHubLast, regularOpenMs } from '../src/lib/hubLiveOverlay';
import * as ext from '../src/services/extendedSessionClose';
const clock = require('../scripts/integrity/clock');
const plain = (v: any) => JSON.parse(JSON.stringify(v));
const at = (s: string) => Date.parse(s);
let now = at('2026-10-16T13:40:00Z');
class TestDate extends Date {
    constructor(...args: any[]) { if (!args.length) super(now); else super(...(args as [any])); }
    static now() { return now; }
}
const quiet = { log() {}, warn() {}, error() {} };
function load(file: string, deps: Record<string, any>, globals: any = {}) {
    const exports = {};
    const context = vm.createContext({ exports, module: { exports }, console: quiet, Date: TestDate,
        URL, URLSearchParams, Buffer, AbortController, AbortSignal,
        setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
        process: { env: {}, argv: [], on() {} }, __filename: file,
        require(name: string) { assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`); return deps[name]; },
        ...globals });
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
    return { api: (context as any).module.exports, context, run: (s: string) => vm.runInContext(s, context) };
}
let failed = 0, passed = 0;
async function test(name: string, fn: () => any) {
    try { await fn(); passed++; console.log('PASS ' + name); }
    catch (e: any) { failed++; console.error('FAIL ' + name + ': ' + e.message); }
}
function hub() {
    let feed: (t: any) => void = () => {};
    class WS extends EventEmitter { static OPEN = 1; static Server = class extends EventEmitter {}; }
    const h = load('scripts/ec2-price-ws.js', {
        ws: WS, http: { createServer: () => ({ listen() {} }) }, https: {},
        fs: { readFileSync() { throw new Error('Blocked .env read'); } }, path,
        'intrinio-realtime': { RealtimeClient: class { constructor(_key: any, onTrade: any) { feed = onTrade; } join() {} } },
    }, { process: { env: { INTRINIO_API_KEY: 'fixture-placeholder' }, argv: [], on() {} } });
    h.run('connectIntrinioWs(); serverJoined.add("AAPL");');
    return { ...h, feed, tick: () => plain(h.run('lastSnapshot(["AAPL"])')) };
}
const headers = 'SYMBOL,TRADE PRICE,TOTAL TRADE VOLUME,TRADE HIGH PRICE,TRADE LOW PRICE,ASK PRICE,BID PRICE,LAST TRADE TIMESTAMP,LAST ASK TIMESTAMP,LAST BID TIMESTAMP';
function client(csvRow: string, eodDate = '2026-10-15') {
    const c = load('src/services/intrinioClient.ts', {
        './redisClient': { getFromCache: async () => null, setInCache: async () => {} },
        '@/lib/marketCalendar': calendar, 'next/server': { after() {} },
        '@/lib/intrinioWarmGate': { warmGateStore: { getStore: () => null } },
        '@/lib/intrinioMeter': {}, '../../scripts/integrity/clock': clock,
        '@/lib/intrinioBackground': { bgStore: { getStore: () => null } }, '@/lib/intrinioCallMeter': { noteCall() {} },
    }, { fetch: async () => { throw new Error('Unexpected network'); } });
    (c.context as any).csv = headers + '\n' + csvRow + '\n';
    // I/O seams only: real CSV loading/parsing/cache/merger remain in use.
    c.run(`callIntrinio = async () => ({snapshots:[{files:[{url:'https://fixture.invalid/snapshot'}]}]});
        fetch = async () => ({ok:true,arrayBuffer:async()=>Buffer.from(csv)});
        _eodCache = {at:Date.now(),date:'${eodDate}',prevDate:'2026-10-14',rows:new Map([['AAPL',
        {ticker:'AAPL',date:'${eodDate}',o:98,h:102,l:97,c:100,v:1000000,chg:1,chgPct:1}]])};`);
    return c;
}
const midRow = (askTime: string, bidTime = askTime) => `AAPL,,1500000,,,101.02,100.98,,${askTime},${bidTime}`;
async function bulk(c: ReturnType<typeof client>) { return (await c.api.getFullMarketSnapshotIntrinio()).tickers[0]; }
async function route(rows: any[], count: number, session: string, hubResponse?: any, finalClose?: any) {
    const symbols = Array.from({ length: count }, (_, i) => i ? 'T' + i : 'AAPL');
    const r = load('src/app/api/live/quotes/route.ts', {
        'next/server': { NextResponse: { json: (body: any) => ({ json: async () => plain(body) }) }, after() {} },
        '@/services/massiveClient': { fetchMassive: async () => ({ tickers: rows }) },
        '@/services/marketStatusProvider': { getMarketStatusSSOT: async () => ({ session, isHoliday: false }) },
        '@/services/lastSession': { reconstructLastSession: async () => ({}) },
        '@/services/extendedSessionClose': { ...ext, peekExtendedSessionClosesAndWarm: async (need: any[]) => ({ values: need.map(() => finalClose), warm: null }),
            recallProvisionalPreCloses: async (need: any[]) => need.map(() => null), rememberProvisionalPreClose() {} },
        '@/lib/marketCalendar': calendar, '@/lib/bulkQuoteClose': require('../src/lib/bulkQuoteClose'),
        '@/lib/hubLiveOverlay': { ...require('../src/lib/hubLiveOverlay'), overlayBulkWithHub: async (results: any[], date: string) => ({
            ...(hubResponse ? applyHubLast(results, hubResponse, regularOpenMs(date)!) : { results, applied: 0, rejected: 0, missing: 0 }), used: !!hubResponse }) },
    });
    return (await r.api.GET({ url: 'http://fixture.invalid/?symbols=' + symbols.join(',') })).json();
}
function provider() {
    const effects: Function[] = [], timers: Function[] = [], states: any[] = [], sockets: any[] = [];
    class WS { static OPEN = 1; readyState = 1; onmessage: any; constructor(public url: string) { sockets.push(this); } close() {} }
    const p = load('src/providers/WebSocketProvider.tsx', {
        react: { createContext: () => ({ Provider: {} }), useContext() {}, useRef: (v: any) => ({ current: v }),
            useState: (v: any) => { const i = states.length; states.push(v); return [v, (next: any) => { states[i] = next; }]; },
            useCallback: (f: any) => f, useEffect: (f: any) => effects.push(f) },
        'react/jsx-runtime': { jsx: () => null },
    }, { window: {}, WebSocket: WS, setTimeout: (f: Function) => { timers.push(f); return timers.length; } });
    p.api.WebSocketProvider({ children: null }); effects.forEach(f => f());
    return { message: (m: any, guardian = false) => { sockets[guardian ? 1 : 0].onmessage({ data: JSON.stringify(m) });
        while (timers.length) timers.shift()!(); return states[2].get('AAPL'); } };
}
(async () => {
    await test('SDK -> /last preserves 09:25 event received at 09:40; overlay rejects PRE tick', () => {
        const h = hub(), event = at('2026-10-16T13:25:00Z');
        h.feed({ Symbol: 'AAPL', Price: 101, Size: 1, Timestamp: event / 1000 });
        const result = h.tick();
        assert.equal(result.ticks.AAPL.trade, event);
        assert.equal(result.ticks.AAPL.rx, now);
        assert.equal(acceptHubTick(result.ticks.AAPL, { hubNowMs: now, openMs: at('2026-10-16T13:30:00Z'), refPrice: 100, prevClose: 100 }), null);
    });
    await test('SDK preserves s/ms/us/ns and timezone instants; missing time stays unknown', () => {
        const h = hub(), event = now - 900000;
        for (const t of [event / 1000, event, event * 1000, event * 1e6, '2026-10-16T09:25:00-04:00']) {
            h.feed({ Symbol: 'AAPL', Price: 101, Timestamp: t }); assert.equal(h.tick().ticks.AAPL.trade, event);
        }
        for (const t of [undefined, '', 0, 'bad', '2026-10-16T09:25:00']) {
            h.feed({ Symbol: 'AAPL', Price: 101, Timestamp: t }); assert.equal(h.tick().ticks.AAPL.trade, 0);
        }
    });
    await test('actual hub broadcast and cached subscription preserve event time into Provider; REST fallback keeps provider time', async () => {
        now = at('2026-10-16T14:00:00Z');
        const h = hub();
        h.run(`globalThis.sent = [];
            globalThis.socket = new (require('ws'))(); socket.readyState=1;
            socket.send = data => sent.push(JSON.parse(data));
            latestPrices.set('AAPL',{prevClose:100,prevCloseDate:getETDateString()});
            wss.emit('connection',socket,{});
            socket.emit('message',Buffer.from(JSON.stringify({type:'subscribe',tickers:['AAPL']})));`);
        const event = now - 900000;
        h.feed({ Symbol: 'AAPL', Price: 101, Size: 1, Timestamp: event / 1000 });
        const message = plain(h.run(`sent.filter(m=>m.type==='prices').at(-1)`));
        assert.equal(message.ts, event); assert.equal(message.receivedAt, now); assert.equal(message.priceBasis, 'fair_value');
        const p = provider(); assert.equal(p.message(message).ts, event);
        now += 60000;
        h.run(`socket.emit('message',Buffer.from(JSON.stringify({type:'subscribe',tickers:['AAPL']})));`);
        const replay = plain(h.run(`sent.filter(m=>m.type==='prices').at(-1)`));
        assert.equal(replay.ts, event); assert.equal(replay.receivedAt, now - 60000); assert.equal(p.message(replay).ts, event);
        h.run(`require('https').get = (_url, cb) => {
            cb({on(ev,fn) { if(ev==='data') fn(JSON.stringify({last_price:102,last_time:'2026-10-16T13:46:00Z',source:'cboe_one_delayed',eod_close_price:100})); if(ev==='end') fn(); }});
            return {on(){}};
        };`);
        await h.run(`fetchSnapshotREST(['AAPL'])`);
        const rest = plain(h.run(`sent.filter(m=>m.type==='prices').at(-1)`));
        assert.equal(rest.ts, at('2026-10-16T13:46:00Z')); assert.equal(rest.priceSource, 'cboe_one_delayed'); assert.equal(rest.priceBasis, 'trade');
    });
    await test('direct 30-symbol path preserves Edge fair value, default trade and EOD basis without changing prices', async () => {
        now = at('2026-10-16T14:00:00Z');
        const c = client(midRow('2026-10-16T13:45:00Z'));
        c.run(`globalThis.fixtureRt = {source:'cboe_one_delayed',last_price:101,last_time:'2026-10-16T13:45:00Z',normal_market_hours_last_price:101,normal_market_hours_last_time:'2026-10-16T13:45:00Z',eod_close_price:100,eod_close_date:'2026-10-15'};
            globalThis.fixtureEdge = {source:'equities_edge',last_price:102,last_time:'2026-10-16T13:59:51Z'};
            callIntrinio = async (path, params) => path.endsWith('/prices/realtime') ? (params?.source==='equities_edge' ? fixtureEdge : fixtureRt) : {stock_prices:[{date:'2026-10-15',close:100},{date:'2026-10-14',close:99}]};`);
        const direct = (await c.api.getFullMarketSnapshotIntrinio(Array.from({length:30},(_,i)=>i?'T'+i:'AAPL'))).tickers[0];
        assert.equal(direct.lastTrade.p, 102); assert.equal(direct.lastTrade.basis, 'fair_value'); assert.equal(direct.lastTrade.source, 'equities_edge');
        assert.equal(direct.lastTrade.t/1e6, at('2026-10-16T13:59:51Z'));
        c.run('fixtureEdge = null;');
        assert.equal((await c.api.getTickerSnapshot('AAPL')).ticker.lastTrade.basis, 'trade');
        now = at('2026-10-17T14:00:00Z');
        c.run('fixtureRt = null;');
        const eod = (await c.api.getTickerSnapshot('AAPL')).ticker;
        assert.equal(eod.lastTrade.p, 100); assert.equal(eod.lastTrade.basis, 'eod_close'); assert.equal(eod.lastTrade.t, 0);
    });
    await test('CSV mid retains quote time/basis across cache hit; no fetch time masquerades as trade', async () => {
        now = at('2026-10-16T20:01:00Z');
        const event = at('2026-10-16T19:46:00Z'), c = client(midRow('2026-10-16T19:46:00Z'));
        const first = await bulk(c);
        assert.equal(first.lastTrade.p, 101); assert.equal(first.lastTrade.t / 1e6, event);
        assert.equal(first.lastTrade.basis, 'quote_mid'); assert.equal(first.lastTrade.source, 'intrinio_snapshot');
        now += 60000;
        const cached = await bulk(c); assert.equal(cached.lastTrade.t, first.lastTrade.t); assert.equal(cached.updated, first.updated);
    });
    await test('CSV uses older bid/ask time; missing/ambiguous time stays 0; EOD has date, no invented tick', async () => {
        now = at('2026-10-16T20:01:00Z');
        let row = await bulk(client(midRow('2026-10-16T20:00:00Z', '2026-10-16T19:45:00Z')));
        assert.equal(row.lastTrade.t / 1e6, at('2026-10-16T19:45:00Z'));
        row = await bulk(client(midRow('2026-10-16T16:00:00', '')));
        assert.equal(row.lastTrade.p, 101); assert.equal(row.lastTrade.t, 0);
        now = at('2026-10-17T13:00:00Z');
        row = await bulk(client(midRow('2026-10-16T20:00:00Z'), '2026-10-16'));
        assert.equal(row.lastTrade.p, 100); assert.equal(row.lastTrade.t, 0); assert.equal(row.lastTrade.basis, 'eod_close');
    });
    await test('CSV trade retains actual trade time; movers keep price, basis and volume', async () => {
        now = at('2026-10-16T15:00:00Z');
        const c = client('AAPL,103,1500000,104,99,104,102,2026-10-16T14:45:00Z,,');
        const row = await bulk(c), mover = (await c.api.getMoversIntrinio('gainers')).tickers[0];
        assert.equal(row.lastTrade.p, 103); assert.equal(row.lastTrade.t / 1e6, now - 900000);
        assert.equal(row.lastTrade.basis, 'trade'); assert.equal(mover.lastTrade.basis, 'trade'); assert.equal(mover.day.v, 1500000);
    });
    await test('31/100 POST route: RTH CSV quote never becomes 16:01 POST; qualified POST quote remains visible', async () => {
        now = at('2026-10-16T20:01:00Z');
        const row = await bulk(client(midRow('2026-10-16T19:46:00Z'), '2026-10-16'));
        for (const n of [31, 100]) {
            const j = await route([row], n, 'post'); assert.equal(j.data.AAPL.extendedPrice, 0); assert.equal(j.data.AAPL.price, 100);
        }
        const valid = await bulk(client(midRow('2026-10-16T20:00:30Z'), '2026-10-16'));
        const j = await route([valid], 31, 'post'); assert.equal(j.data.AAPL.extendedPrice, 101);
        assert.equal(j.data.AAPL.extendedTime, '2026-10-16T20:00:30.000Z');
        assert.equal(j.data.AAPL.extendedBasis, 'quote_mid');
        assert.equal(j.data.AAPL.extendedSource, 'intrinio_snapshot');
    });
    await test('30/31/100/101 regular route selection and hub event basis survive overlay without changing PRE timestamp', async () => {
        now = at('2026-10-16T13:40:00Z');
        const row = await bulk(client(midRow('2026-10-16T13:25:00Z')));
        const delayed = { now, live: true, ticks: { AAPL: { p: 102, trade: now - 900000, rx: now } } };
        const valid = { ...delayed, ticks: { AAPL: { p: 102, trade: now - 1000, rx: now } } };
        for (const n of [30, 31, 100, 101]) {
            assert.equal((await route([row], n, 'regular', delayed)).data.AAPL.price, 101);
            const j = await route([row], n, 'regular', valid);
            assert.equal(j.data.AAPL.price, n >= 31 && n <= 100 ? 102 : 101);
            if (n >= 31 && n <= 100) {
                assert.equal(j.data.AAPL.extendedPrice, 101, 'PRE candidate uses original CSV price/time pair');
                assert.equal(j.data.AAPL.extendedBasis, 'quote_mid');
            }
        }
        const result = applyHubLast([{ ticker: 'AAPL', snapshot: row }], valid, regularOpenMs('2026-10-16')!).results[0].snapshot;
        assert.equal(result.lastTrade.t, row.lastTrade.t);
        assert.equal(result.priceBasis, 'fair_value');
        assert.equal(result.priceTime, now - 1000);
    });
    await test('CSV epoch units and timezone offsets remain source instants; future hub event is rejected', async () => {
        now = at('2026-10-16T15:00:00Z');
        const event = now - 900000;
        for (const stamp of [String(event/1000), String(event), String(event*1000), String(event*1e6), '2026-10-16T10:45:00-04:00']) {
            const row = await bulk(client(midRow(stamp))); assert.equal(row.lastTrade.t/1e6, event);
        }
        const h = hub(); h.feed({Symbol:'AAPL',Price:101,Timestamp:(now+900000)/1000});
        const tick = h.tick().ticks.AAPL;
        assert.equal(tick.trade, now+900000);
        assert.equal(acceptHubTick(tick,{hubNowMs:now,openMs:regularOpenMs('2026-10-16')!,refPrice:100,prevClose:100}),null);
    });
    await test('confirmed PRE/POST tape closes still win over CSV/hub and retain labels and times', async () => {
        now = at('2026-10-16T13:48:00Z');
        const row = await bulk(client(midRow('2026-10-16T13:33:00Z')));
        let j = await route([row],31,'regular',undefined,{kind:'pre',date:'2026-10-16',price:99.5,time:'2026-10-16T13:29:59Z',source:'utp_delayed'});
        assert.equal(j.data.AAPL.extendedPrice,99.5); assert.equal(j.data.AAPL.extendedKind,'close');
        assert.equal(j.data.AAPL.extendedLabel,'PRE'); assert.equal(j.data.AAPL.extendedTime,'2026-10-16T13:29:59Z');
        assert.equal(j.data.AAPL.extendedBasis,'session_close'); assert.equal(j.data.AAPL.extendedSource,'utp_delayed');
        now = at('2026-10-17T00:20:00Z');
        const post = await bulk(client(midRow('2026-10-17T00:00:00Z'),'2026-10-16'));
        j = await route([post],31,'closed',undefined,{kind:'post',date:'2026-10-16',price:101.5,time:'2026-10-17T00:00:01Z',source:'utp_delayed'});
        assert.equal(j.data.AAPL.price,100); assert.equal(j.data.AAPL.extendedPrice,101.5);
        assert.equal(j.data.AAPL.extendedKind,'close'); assert.equal(j.data.AAPL.extendedLabel,'POST');
    });
    await test('hub broadcast/replay -> Provider: original source time retained; receive time separate', () => {
        now = at('2026-10-16T14:00:00Z');
        const p = provider(); const m = { type: 'prices', ticker: 'AAPL', price: 101, ts: now - 900000, priceBasis: 'fair_value', priceSource: 'equities_edge' };
        for (const guardian of [false, true]) {
            const first = p.message(m, guardian); assert.equal(first.ts, m.ts); assert.equal(first.receivedAt, now);
            now += 60000; const replay = p.message(m, guardian); assert.equal(replay.ts, m.ts); assert.equal(replay.priceBasis, 'fair_value');
        }
        assert.equal(p.message({ type: 'prices', ticker: 'AAPL', price: 101 }).ts, 0);
    });
    console.log(`priceTimeBasis: ${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
