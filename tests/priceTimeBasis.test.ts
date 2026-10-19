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
import * as liveQuote from '../src/utils/liveQuote';
const clock = require('../scripts/integrity/clock');
const scriptCalendar = require('../scripts/lib/us-market-calendar');
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
function client(csvRow: string, eodDate = '2026-10-15', lastGood: any = null, store?: Map<string, any>) {
    const c = load('src/services/intrinioClient.ts', {
        './redisClient': { getFromCache: async (key: string) => store ? store.get(key) ?? null : key.startsWith('intrinio:snap:lastgood:') ? lastGood : null,
            setInCache: async (key: string, value: any) => { store?.set(key, plain(value)); } },
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
async function route(rows: any[], count: number, session: string, hubResponse?: any, finalClose?: any, recalledPre?: any) {
    const symbols = Array.from({ length: count }, (_, i) => i ? 'T' + i : 'AAPL');
    const r = load('src/app/api/live/quotes/route.ts', {
        'next/server': { NextResponse: { json: (body: any) => ({ json: async () => plain(body) }) }, after() {} },
        '@/services/massiveClient': { fetchMassive: async () => ({ tickers: rows }) },
        '@/services/marketStatusProvider': { getMarketStatusSSOT: async () => ({ session, isHoliday: false }) },
        '@/services/lastSession': { reconstructLastSession: async () => ({}) },
        '@/services/extendedSessionClose': { ...ext, peekExtendedSessionClosesAndWarm: async (need: any[]) => ({ values: need.map(() => finalClose), warm: null }),
            recallProvisionalPreCloses: async (need: any[]) => need.map(() => recalledPre ?? null), rememberProvisionalPreClose() {} },
        '@/lib/marketCalendar': calendar, '@/lib/bulkQuoteClose': require('../src/lib/bulkQuoteClose'),
        '@/lib/sourceStamp': require('../src/lib/sourceStamp'),   // 묶음 4 — 종목별 원천 스탬프
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
// SSR uses the real stock-light consumer; only fetch/cache/clock I/O is replaced.
async function stockLight(row: any, finalPost?: any) {
    const etDate = calendar.etDateOf(now);
    const minute = calendar.etMinutesOf(now);
    const m = load('src/services/marketDataLight.ts', {
        '@/services/massiveClient': { fetchMassive: async (url: string) => url.includes('/snapshot/') ? { ticker: row } : null },
        '@/services/timezoneUtils': { getETNow: () => ({ dateString: etDate, hour: Math.floor(minute / 60), minute: minute % 60, isWeekend: false }) },
        '@/services/redisClient': { getFromCache: async () => null, setInCache: async () => true },
        '@/services/extendedSessionClose': { ...ext, getExtendedSessionClose: async (_s: string, _d: string, kind: string) => kind === 'post' ? finalPost : null },
        '@/lib/marketCalendar': calendar,
    });
    return m.api.getStockDataLight('AAPL');
}
// Render the actual Movers component/row with only React scheduling and I/O mocked.
function moversText(tick: any) {
    const item = { ticker: 'AAPL', price: 100, changePercent: 1, volume: 1000, value: 100000, spark: [] };
    const state = [{ value: [item], gainers: [item], losers: [item] }, false, 'value'];
    let i = 0;
    const jsx = (type: any, props: any) => ({ type, props });
    const m = load('src/app/[locale]/app-view/movers/page.tsx', {
        react: { useState: () => [state[i++], () => {}], useEffect() {}, useMemo: (f: any) => f(),
            useRef: (v: any) => ({ current: v }), Suspense: 'suspense' },
        'react/jsx-runtime': { jsx, jsxs: jsx }, 'next-intl': { useLocale: () => 'en' },
        '@/i18n/routing': { useRouter: () => ({}) }, '@/components/mobile/MobileAppFooter': { MobileAppFooter: 'footer' },
        '@/components/app/AppTickerLogo': { AppTickerLogo: 'logo' }, '@/components/app/watchlist/StarButton': { LogoWithBadge: 'badge' },
        '@/components/app/watchlist/useLongPress': { useStarLongPress: () => () => ({}), lpRowClass: '' },
        '@/lib/app/watchlist': { useAppWatchlist: () => new Set() },
        '@/providers/WebSocketProvider': { useRealtimeData: () => ({ prices: new Map([['AAPL', tick]]) }) },
        '@/hooks/useMarketStatus': { useMarketStatus: () => ({ status: { session: 'pre', isHoliday: false } }) },
        './movers.module.css': new Proxy({}, { get: (_, k) => String(k) }),
    });
    function textOf(node: any): string {
        if (node == null || typeof node === 'boolean') return '';
        if (Array.isArray(node)) return node.map(textOf).join(' ');
        if (typeof node !== 'object') return String(node);
        return textOf(typeof node.type === 'function' ? node.type(node.props) : node.props?.children);
    }
    return textOf(m.api.default()).replace(/\$\s+/g, '$');
}
(async () => {
    // The script calendar supplies trading-day/DST conversion; it deliberately
    // uses a conservative 16:00 close. The app's existing half-day table supplies 13:00.
    for (const suffix of ['00.000', '00.500', '01.000']) {
        for (const consumer of ['SSR', 'quotes'] as const) {
            await test(`gate P2: half-day 2026-11-27 16:00:${suffix} POST $103 survives adapter -> ${consumer}`, async () => {
                const date = '2026-11-27';
                assert.equal(scriptCalendar.isNonTradingDay(date), false);
                now = scriptCalendar.etWallToUtcMs(date, 16, 16) + 30000;
                const event = scriptCalendar.etWallToUtcMs(date, 16) + Number(suffix) * 1000;
                const stamp = new Date(event).toISOString();
                const store = new Map<string, any>([[`ext:siplive:v1:POST:AAPL:${date}`, { none: true }]]);
                const c = client('', '2026-11-25', null, store);
                (c.context as any).fixtureRt = { source: 'cboe_one_delayed', last_price: 103, last_time: stamp,
                    normal_market_hours_last_price: 102, normal_market_hours_last_time: '2026-11-27T18:00:00Z',
                    eod_close_price: 100, eod_close_date: '2026-11-25' };
                c.run("callIntrinio = async path => path.endsWith('/prices/realtime') ? fixtureRt : null;");
                const row = (await c.api.getTickerSnapshot('AAPL')).ticker;
                assert.equal(row._intrinio.hasExtendedTrade, true);
                assert.equal(row.afterHours, 103);
                assert.equal(row.lastTrade.t / 1e6, event);
                if (consumer === 'SSR') {
                    const ssr = await stockLight(row);
                    assert.equal(ssr.extended.postPrice, 103);
                    assert.equal(ssr.price, 103); assert.equal(ssr.todayClose, 102); assert.equal(ssr.session, 'post');
                } else {
                    for (const count of [30, 31, 100]) {
                        const j = await route([row], count, 'post');
                        assert.equal(j.data.AAPL.extendedPrice, 103, `${count} symbols`);
                        assert.equal(j.data.AAPL.price, 102); assert.equal(j.data.AAPL.extendedTime, stamp);
                        assert.equal(j.data.AAPL.extendedLabel, 'POST'); assert.equal(j.data.AAPL.extendedKind, 'live');
                        assert.equal(j.data.AAPL.extendedBasis, 'trade');
                        assert.equal(j.data.AAPL.extendedSource, 'cboe_one_delayed');
                    }
                }
            });
        }
    }
    for (const date of ['2026-11-27', '2026-12-24', '2027-11-26']) {
        await test(`half-day ${date}: actual 13:00 closing second stays REG; subsequent POST survives SSR/quotes`, async () => {
            assert.equal(scriptCalendar.isNonTradingDay(date), false);
            assert.equal(calendar.sessionCloseMinutes(date), 780);
            now = scriptCalendar.etWallToUtcMs(date, 16, 16) + 30000;
            for (const [offset, post] of [[-1, false], [0, false], [500, false], [999, false],
                [1000, true], [30000, true], [3 * 3600000, true], [3 * 3600000 + 500, true]] as const) {
                const event = scriptCalendar.etWallToUtcMs(date, 13) + offset;
                assert.equal(ext.isTradeInExtSession(event, date, 'post'), post, `${date} +${offset}ms`);
                assert.equal(ext.isTradeInExtSession(event, date, 'pre'), false);
                assert.equal(ext.isTradeInExtSession(event, '2026-10-16', 'post'), false);
                const row = { ticker: 'AAPL', day: { c: 102 }, prevDay: { c: 100 },
                    lastTrade: { p: 103, t: event * 1e6 }, _intrinio: { hasExtendedTrade: post } };
                assert.equal((await stockLight(row)).extended.postPrice, post ? 103 : null);
                for (const count of [30, 31, 100]) {
                    const j = await route([row], count, 'post');
                    assert.equal(j.data.AAPL.extendedPrice, post ? 103 : 0);
                    assert.equal(j.data.AAPL.extendedLabel, 'POST');
                }
            }
        });
    }
    for (const stamp of ['2026-10-16T20:00:01Z', '2026-10-16T20:00:30Z', '2026-10-16T20:01:01Z']) {
        await test(`gate P2: 16:16:30 ET lookup retains genuine POST $103 at ${stamp} through adapter -> SSR`, async () => {
            now = at('2026-10-16T20:16:30Z');
            const c = client('');
            (c.context as any).fixtureRt = { source: 'cboe_one_delayed', last_price: 103, last_time: stamp,
                normal_market_hours_last_price: 102, normal_market_hours_last_time: '2026-10-16T20:00:00Z',
                eod_close_price: 100, eod_close_date: '2026-10-15' };
            c.run("callIntrinio = async path => path.endsWith('/prices/realtime') ? fixtureRt : null;");
            const row = (await c.api.getTickerSnapshot('AAPL')).ticker;
            const ssr = await stockLight(row);
            assert.equal(ssr.extended.postPrice, 103, 'valid POST must survive adapter eligibility metadata');
            assert.equal(ssr.price, 103); assert.equal(ssr.todayClose, 102); assert.equal(ssr.session, 'post');
            assert.equal(row._intrinio.hasExtendedTrade, true); assert.equal(row.afterHours, 103);
            assert.equal(row._intrinio.extendedPrice, 103);
            assert.ok(Math.abs(row._intrinio.extendedChangePct - 100 / 102) < 0.0001);
            assert.equal(row.lastTrade.t / 1e6, at(stamp));
            assert.equal(row.lastTrade.basis, 'trade'); assert.equal(row.lastTrade.source, 'cboe_one_delayed');
            for (const count of [30, 31, 100]) {
                const j = await route([row], count, 'post');
                assert.equal(j.data.AAPL.price, 102); assert.equal(j.data.AAPL.extendedPrice, 103);
                assert.equal(j.data.AAPL.extendedLabel, 'POST');
                assert.equal(j.data.AAPL.extendedTime, new Date(at(stamp)).toISOString());
            }
        });
    }
    await test('adapter eligibility uses source session, preserves closing second and PRE/early-close boundaries', async () => {
        for (const [stamp, regularStamp, expected] of [
            ['2026-10-16T20:00:00.000Z', '2026-10-16T19:59:59Z', false],
            ['2026-10-16T20:00:00.999Z', '2026-10-16T19:59:59Z', false],
            ['2026-10-16T20:00:01Z', '2026-10-16T20:00:00.999Z', true],
            ['2026-12-16T21:00:01Z', '2026-12-16T21:00:00Z', true],
            ['2026-11-27T18:00:00.999Z', '2026-11-27T17:59:59Z', false],
            ['2026-11-27T18:00:01Z', '2026-11-27T18:00:00Z', true],
            ['2026-10-16T12:15:00Z', '2026-10-15T20:00:00Z', true],
            ['2026-10-16T13:30:01Z', '2026-10-15T20:00:00Z', false],
            ['2026-10-16T19:59:59Z', '2026-10-16T19:58:00Z', false],
            ['2026-10-16T20:00:01Z', '2026-10-16T20:00:01Z', false],
            ['2026-10-16T20:00:01Z', '2026-10-16T20:00:02Z', false],
            ['', '2026-10-16T20:00:00Z', false],
            ['2026-10-16T20:00:01Z', '', false],
        ] as const) {
            now = at('2026-12-16T22:00:00Z'); // POST lookup; classify the source event, not receipt time.
            const store = new Map<string, any>([['ext:siplive:v1:POST:AAPL:2026-12-16', { none: true }]]);
            const c = client('', '2026-10-15', null, store);
            (c.context as any).fixtureRt = { source: 'cboe_one_delayed', last_price: 103, last_time: stamp,
                normal_market_hours_last_price: 102, normal_market_hours_last_time: regularStamp,
                eod_close_price: 100, eod_close_date: '2026-10-15' };
            c.run("callIntrinio = async path => path.endsWith('/prices/realtime') ? fixtureRt : null;");
            const row = (await c.api.getTickerSnapshot('AAPL')).ticker;
            assert.equal(row._intrinio.hasExtendedTrade, expected, stamp + ' after ' + regularStamp);
            assert.equal(row._intrinio.extendedPrice, expected ? 103 : null);
            assert.equal(row.afterHours, expected ? 103 : undefined);
            assert.equal(row.lastTrade.p, 103, 'eligibility must not erase the source price');
            assert.equal(row.lastTrade.t / 1e6, stamp ? at(stamp) : 0);
        }
    });
    for (const stamp of ['2026-10-16T20:00:00.000Z', '2026-10-16T20:00:00.999Z']) {
        await test(`gate P2: 18:00 ET stale fallback with closing-auction print ${stamp} stays regular in SSR`, async () => {
            now = at('2026-10-16T22:00:00Z');
            const c = client('', '2026-10-15', { at: now - 3600000, rt: {
                source: 'cboe_one_delayed', last_price: 103, last_time: '2026-10-16T20:30:00Z',
                normal_market_hours_last_price: 102, normal_market_hours_last_time: stamp,
                eod_close_price: 100, eod_close_date: '2026-10-15' } });
            c.run('callIntrinio = async () => null;');
            const row = (await c.api.getTickerSnapshot('AAPL')).ticker;
            assert.equal(row.lastTrade.p, 102); assert.equal(row.day.c, 102);
            assert.equal(row.lastTrade.t / 1e6, at(stamp));
            assert.equal(row.lastTrade.basis, 'trade'); assert.equal(row.lastTrade.source, 'cboe_one_delayed');
            assert.equal(row._intrinio.hasExtendedTrade, false);
            const ssr = await stockLight(row);
            assert.equal(ssr.extended.postPrice, null, 'regular print must never become POST $102');
            assert.equal(ssr.price, 102); assert.equal(ssr.todayClose, 102); assert.equal(ssr.session, 'post');
        });
    }
    await test('SSR respects explicit no-extended-trade metadata even after closing second; absent metadata remains compatible', async () => {
        now = at('2026-10-16T22:00:00Z');
        const row = { day: { c: 102 }, prevDay: { c: 100 }, lastTrade: { p: 103, t: at('2026-10-16T20:00:01Z') * 1e6 } };
        assert.equal((await stockLight({ ...row, _intrinio: { hasExtendedTrade: false } })).extended.postPrice, null);
        assert.equal((await stockLight(row)).extended.postPrice, 103);
        assert.equal((await stockLight({ ...row, _intrinio: { hasExtendedTrade: true } })).extended.postPrice, 103);
        now = at('2026-10-17T00:20:00Z');
        assert.equal((await stockLight({ ...row, _intrinio: { hasExtendedTrade: false } })).extended.postPrice, null);
        assert.equal((await stockLight({ ...row, _intrinio: { hasExtendedTrade: false } }, { price: 104 })).extended.postPrice, 104);
    });
    for (const [stamp, post] of [
        ['2026-10-16T20:00:00.000Z', false], ['2026-10-16T20:00:00.999Z', false], ['2026-10-16T20:00:01.000Z', true],
    ] as const) {
        await test(`shared snapshot boundary ${stamp}: ${post ? 'POST' : 'REG'} across 30/31/100-symbol routes and SSR`, async () => {
            now = at('2026-10-16T22:00:00Z');
            assert.equal(ext.isTradeInExtSession(at(stamp), '2026-10-16', 'post'), post);
            assert.equal(ext.isTradeInExtSession(at(stamp), '2026-10-16', 'pre'), false);
            const row = { ticker: 'AAPL', day: { c: 102 }, prevDay: { c: 100 }, lastTrade: { p: 103, t: at(stamp) * 1e6 } };
            for (const count of [30, 31, 100]) {
                const j = await route([row], count, 'post');
                assert.equal(j.data.AAPL.price, 102);
                assert.equal(j.data.AAPL.extendedPrice, post ? 103 : 0);
                assert.equal(j.data.AAPL.extendedLabel, 'POST', 'label must remain unchanged');
                assert.equal(j.data.AAPL.extendedTime, post ? stamp : null);
            }
            assert.equal((await stockLight(row)).extended.postPrice, post ? 103 : null);
        });
    }
    await test('snapshot boundary also holds in EST; PRE/date/end boundaries remain unchanged', () => {
        for (const [stamp, post] of [['21:00:00.000', false], ['21:00:00.999', false], ['21:00:01.000', true]] as const) {
            assert.equal(ext.isTradeInExtSession(at(`2026-12-16T${stamp}Z`), '2026-12-16', 'post'), post);
        }
        for (const [stamp, kind, expected] of [
            ['2026-10-16T07:59:59Z', 'pre', false], ['2026-10-16T08:00:00Z', 'pre', true],
            ['2026-10-16T13:29:59.999Z', 'pre', true], ['2026-10-16T13:30:00Z', 'pre', false],
            ['2026-10-16T19:59:59.999Z', 'post', false], ['2026-10-16T23:59:59.999Z', 'post', true],
            ['2026-10-17T00:00:00Z', 'post', false], ['2026-10-15T20:30:00Z', 'post', false],
        ] as const) assert.equal(ext.isTradeInExtSession(at(stamp), '2026-10-16', kind), expected, stamp);
    });
    await test('SSR PRE respects explicit trade eligibility and preserves compatible snapshot values', async () => {
        now = at('2026-10-16T12:30:00Z');
        const row = { day: { c: 100 }, prevDay: { c: 99 }, lastTrade: { p: 105, t: at('2026-10-16T12:15:00Z') * 1e6 } };
        assert.equal((await stockLight(row)).extended.prePrice, 105);
        assert.equal((await stockLight({ ...row, _intrinio: { hasExtendedTrade: false } })).extended.prePrice, null);
    });
    await test('gate P2: 09:29:59 bid + 09:30:01 ask is a regular quote, never PRE $100.40', async () => {
        now = at('2026-10-16T13:46:00Z');
        for (const reversed of [false, true]) {
            const old = '2026-10-16T13:29:59Z', fresh = '2026-10-16T13:30:01Z';
            const row = await bulk(client(`AAPL,,1500000,,,100.80,100,,${reversed ? old : fresh},${reversed ? fresh : old}`));
            const hub = { now, live: true, ticks: { AAPL: { p: 102, trade: now - 1000, rx: now } } };
            const j = await route([row], 31, 'regular', hub);
            assert.equal(j.data.AAPL.extendedPrice, 0, 'regular quote must not enter PRE candidate');
            assert.equal(j.data.AAPL.price, 102);
            assert.equal((await route([row], 31, 'regular')).data.AAPL.price, 100.4, 'keep the quote value visible as regular price');
            assert.equal(row.lastTrade.t / 1e6, at(fresh));
            assert.equal(row.lastTrade.basis, 'quote_mid');
        }
    });
    await test('gate P2: real SIP overlay -> last-good storage -> failed lookup restores Cboe regular source', async () => {
        now = at('2026-10-16T21:00:00Z');
        const store = new Map<string, any>();
        const c = client('', '2026-10-15', null, store);
        c.run(`callIntrinio = async path => path.endsWith('/prices/realtime') ? {
                source:'cboe_one_delayed',last_price:102,last_time:'2026-10-16T19:59:59Z',
                normal_market_hours_last_price:102,normal_market_hours_last_time:'2026-10-16T19:59:59Z',
                eod_close_price:100,eod_close_date:'2026-10-15'} : null;`);
        store.set('ext:siplive:v1:POST:AAPL:2026-10-16', { p: 103, t: '2026-10-16T20:30:00Z', s: 1 });
        const first = (await c.api.getTickerSnapshot('AAPL')).ticker;
        assert.equal(first.lastTrade.p, 103); assert.equal(first.lastTrade.source, 'delayed_sip');
        assert.equal(store.get('intrinio:snap:lastgood:v1:AAPL').rt.source, 'delayed_sip');
        now += 3600000;
        c.run('callIntrinio = async () => null;');
        const fallback = (await c.api.getTickerSnapshot('AAPL')).ticker;
        assert.equal(fallback.lastTrade.p, 102); assert.equal(fallback.day.c, 102);
        assert.equal(fallback.lastTrade.source, 'cboe_one_delayed');
        assert.equal(fallback.lastTrade.basis, 'trade');
        assert.equal(fallback.lastTrade.t / 1e6, at('2026-10-16T19:59:59Z'));
        assert.equal(fallback.afterHours, undefined);
    });
    await test('regular quote preserves genuine recalled PRE price/time/label for 31 and 100 symbols', async () => {
        now = at('2026-10-16T13:46:00Z');
        const row = await bulk(client('AAPL,,1500000,,,100.80,100,,2026-10-16T13:30:01Z,2026-10-16T13:29:59Z'));
        for (const count of [31, 100]) {
            const j = await route([row], count, 'regular', undefined, undefined,
                { p: 99.5, t: '2026-10-16T13:29:58Z' });
            assert.equal(j.data.AAPL.price, 100.4);
            assert.equal(j.data.AAPL.extendedPrice, 99.5);
            assert.equal(j.data.AAPL.extendedChangePercent, -0.5);
            assert.equal(j.data.AAPL.extendedTime, '2026-10-16T13:29:58.000Z');
            assert.equal(j.data.AAPL.extendedLabel, 'PRE');
        }
    });
    await test('SIP regular provenance survives repeated overlays; refreshed Edge provenance replaces old Cboe', async () => {
        now = at('2026-10-16T22:00:00Z');
        const c = client('');
        const base = { source: 'cboe_one_delayed', normal_market_hours_last_source: 'cboe_one_delayed',
            last_price: 101, last_time: '2026-10-16T19:58:00Z',
            normal_market_hours_last_price: 101, normal_market_hours_last_time: '2026-10-16T19:58:00Z',
            eod_close_price: 100, eod_close_date: '2026-10-15' };
        const edge = c.api.overlayRealtimeEdge(base, { source: 'equities_edge', last_price: 102, last_time: '2026-10-16T19:59:59Z' });
        assert.equal(edge.normal_market_hours_last_source, 'equities_edge');
        for (const original of [base, edge]) {
            const once = c.api.overlayExtendedSip(original, { p: 103, t: '2026-10-16T20:30:00Z' });
            const twice = plain(c.api.overlayExtendedSip(plain(once), { p: 104, t: '2026-10-16T20:31:00Z' }));
            assert.equal(twice.source, 'delayed_sip');
            assert.equal(twice.normal_market_hours_last_source, original.source);
            const fallbackClient = client('', '2026-10-15', { at: now - 3600000, rt: twice });
            fallbackClient.run('callIntrinio = async () => null;');
            const row = (await fallbackClient.api.getTickerSnapshot('AAPL')).ticker;
            assert.equal(row.lastTrade.source, original.source);
            assert.equal(row.lastTrade.basis, original.source === 'equities_edge' ? 'fair_value' : 'trade');
            assert.equal(row.lastTrade.p, original.normal_market_hours_last_price);
            assert.equal(row.lastTrade.t / 1e6, at(original.normal_market_hours_last_time));
        }
    });
    await test('legacy saved SIP without regular provenance remains generic; published EOD stays EOD', async () => {
        now = at('2026-10-16T22:00:00Z');
        for (const published of [false, true]) {
            const c = client('', '2026-10-15', { at: now - 3600000, rt: {
                source: 'delayed_sip', last_price: 103, last_time: '2026-10-16T20:30:00Z',
                normal_market_hours_last_price: 102, normal_market_hours_last_time: '2026-10-16T19:59:59Z',
                eod_close_price: published ? 102 : 100, eod_close_date: published ? '2026-10-16' : '2026-10-15' } });
            c.run('callIntrinio = async () => null;');
            const row = (await c.api.getTickerSnapshot('AAPL')).ticker;
            assert.equal(row.lastTrade.p, 102);
            assert.equal(row.lastTrade.source, published ? 'intrinio_eod' : 'intrinio_realtime');
            assert.equal(row.lastTrade.basis, published ? 'eod_close' : 'trade');
            assert.equal(row.lastTrade.t / 1e6, published ? 0 : at('2026-10-16T19:59:59Z'));
        }
    });
    await test('gate P1: 08:15 ET price received 08:30 keeps Movers $105/+5% and PRE-MKT', () => {
        now = at('2026-10-16T12:30:00Z');
        for (const guardian of [false, true]) {
            const tick = provider().message({ type: 'prices', ticker: 'AAPL', price: 105, changePct: 5,
                ts: at('2026-10-16T12:15:00Z'), priceBasis: 'trade', priceSource: 'cboe_one_delayed' }, guardian);
            const text = moversText(tick);
            assert.ok(text.includes('$105.00'), text); assert.ok(text.includes('+5.00%'), text);
            assert.ok(text.includes('PRE-MKT'), text);
        }
    });
    await test('gate P2: stale extended value is dropped but $102 regular trade keeps source/time', async () => {
        now = at('2026-10-16T22:00:00Z');
        const regularTime = '2026-10-16T19:59:59Z';
        const c = client('', '2026-10-15', { at: now - 3600000, rt: { source: 'cboe_one_delayed',
            last_price: 103, last_time: '2026-10-16T20:30:00Z',
            normal_market_hours_last_price: 102, normal_market_hours_last_time: regularTime,
            eod_close_price: 100, eod_close_date: '2026-10-15' } });
        c.run('callIntrinio = async () => null;');
        const row = (await c.api.getTickerSnapshot('AAPL')).ticker;
        assert.equal(row.lastTrade.p, 102); assert.equal(row.afterHours, undefined);
        assert.equal(row._intrinio.hasExtendedTrade, false);
        assert.equal(row.lastTrade.basis, 'trade'); assert.equal(row.lastTrade.source, 'cboe_one_delayed');
        assert.equal(row.lastTrade.t / 1e6, at(regularTime));
    });
    await test('Movers retains the receipt freshness boundary; missing source time does not hide a received price', () => {
        for (const guardian of [false, true]) {
            for (const ts of [undefined, 0, -1, 'bad', now + 900000]) {
                const received = now, p = provider();
                const tick = p.message({ type: 'prices', ticker: 'AAPL', price: 105, changePct: 5, ts }, guardian);
                assert.equal(tick.ts, received);
                assert.equal(tick.priceTime, typeof ts === 'number' && ts > 0 ? ts : 0);
                now = received + 119999;
                assert.ok(moversText(tick).includes('$105.00'));
                now = received + 120000;
                const expired = moversText(tick);
                assert.ok(expired.includes('$100.00')); assert.ok(expired.includes('+1.00%'));
                assert.ok(expired.includes('PRE-MKT'));
            }
        }
    });
    await test('Provider -> useLiveQuotes -> liveDisplay keeps receipt at and existing PRE/REG prices', () => {
        now = at('2026-10-16T14:00:00Z');
        for (const guardian of [false, true]) {
            const tick = provider().message({ type: 'prices', ticker: 'AAPL', price: 105, changePct: 5, ts: now - 900000 }, guardian);
            for (const session of ['pre', 'regular']) {
                const h = load('src/hooks/useLiveQuotes.ts', {
                    react: { useState: (v: any) => [typeof v === 'function' ? v() : v, () => {}],
                        useEffect() {}, useMemo: (f: any) => f(), useCallback: (f: any) => f, useRef: (v: any) => ({ current: v }) },
                    swr: () => ({ data: { data: { AAPL: { price: session === 'pre' ? 100 : 105, previousClose: 100,
                        extendedPrice: 105, session } }, session, at: now - 1000, asked: ['AAPL'] }, mutate() {} }),
                    '@/providers/WebSocketProvider': { useRealtimeData: () => ({ connected: true, prices: new Map([['AAPL', tick]]) }) },
                    '@/utils/liveQuote': liveQuote,
                });
                const q = h.api.useLiveQuotes(['AAPL']).quotes.AAPL;
                assert.equal(q.price, 105); assert.equal(q.changePct, 5); assert.equal(q.at, now);
                assert.equal(q.live, true); assert.equal(q.ext, session === 'pre');
                assert.equal(tick.priceTime, now - 900000);
            }
        }
    });
    await test('stale fallback metadata follows resolver selection: regular trade/Edge versus published EOD', async () => {
        now = at('2026-10-16T22:00:00Z');
        const regularTime = '2026-10-16T19:59:59Z';
        for (const source of ['cboe_one_delayed', 'equities_edge']) {
            for (const published of [false, true]) {
                for (const bars of [[], [{ date: published ? '2026-10-16' : '2026-10-15', close: published ? 102 : 100 }]]) {
                    const c = client('', '2026-10-15', { at: now - 3600000, rt: { source,
                        last_price: 103, last_time: '2026-10-16T20:30:00Z',
                        normal_market_hours_last_price: 102, normal_market_hours_last_time: regularTime,
                        eod_close_price: published ? 102 : 100, eod_close_date: published ? '2026-10-16' : '2026-10-15' } });
                    (c.context as any).fixtureBars = bars;
                    c.run("callIntrinio = async path => path.endsWith('/prices/realtime') ? null : {stock_prices:fixtureBars};");
                    const row = (await c.api.getTickerSnapshot('AAPL')).ticker;
                    assert.equal(row.day.c, 102); assert.equal(row.lastTrade.p, 102);
                    assert.equal(row.afterHours, undefined); assert.equal(row._intrinio.hasExtendedTrade, false);
                    assert.equal(row.lastTrade.basis, published ? 'eod_close' : source === 'equities_edge' ? 'fair_value' : 'trade');
                    assert.equal(row.lastTrade.source, published ? 'intrinio_eod' : source);
                    assert.equal(row.lastTrade.t / 1e6, published ? 0 : at(regularTime));
                }
            }
        }
    });
    await test('SDK -> /last preserves 09:25 event received at 09:40; overlay rejects PRE tick', () => {
        now = at('2026-10-16T13:40:00Z');
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
        const p = provider(); const first = p.message(message);
        assert.equal(first.priceTime, event); assert.equal(first.ts, now);
        now += 60000;
        h.run(`socket.emit('message',Buffer.from(JSON.stringify({type:'subscribe',tickers:['AAPL']})));`);
        const replay = plain(h.run(`sent.filter(m=>m.type==='prices').at(-1)`));
        assert.equal(replay.ts, event); assert.equal(replay.receivedAt, now - 60000);
        const received = p.message(replay);
        assert.equal(received.priceTime, event); assert.equal(received.ts, now);
        assert.equal(received.sourceReceivedAt, now - 60000);
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
    await test('CSV mid forms at latest bid/ask event; missing/ambiguous time stays 0; EOD has date, no invented tick', async () => {
        now = at('2026-10-16T20:01:00Z');
        let row = await bulk(client(midRow('2026-10-16T20:00:00Z', '2026-10-16T19:45:00Z')));
        assert.equal(row.lastTrade.t / 1e6, at('2026-10-16T20:00:00Z'));
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
            const first = p.message(m, guardian);
            assert.equal(first.priceTime, m.ts); assert.equal(first.ts, now); assert.equal(first.receivedAt, now);
            now += 60000; const replay = p.message(m, guardian);
            assert.equal(replay.priceTime, m.ts); assert.equal(replay.ts, now); assert.equal(replay.priceBasis, 'fair_value');
        }
        const unknown = p.message({ type: 'prices', ticker: 'AAPL', price: 101 });
        assert.equal(unknown.priceTime, 0); assert.equal(unknown.ts, now);
    });
    console.log(`priceTimeBasis: ${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
