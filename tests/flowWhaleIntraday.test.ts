/** Offline regression (2026-10-19): the whale tab through the REAL connected supplier path.
 *  real massiveClient.getOptionSnapshot → intrinioRouter → intrinioClient.getOptionChainSnapshotIntrinio
 *  (fetch mocked with Intrinio's documented options/chain/{t}/{exp}/eod shape) → real trades route → selectWhaleSession → page expressions.
 *  Earlier tests injected last_trade directly and missed that the connected converter never emits it (gate 10190456 P1).
 *  No network, env file, Redis or database access.
 */
import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const RealDate = Date;
const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };
process.env.INTRINIO_API_KEY = 'offline-placeholder';
process.env.INTRINIO_BASE_URL = 'https://intrinio.invalid';
process.env.INTRINIO_MAX_ATTEMPTS = '1';
process.env.INTRINIO_REALTIME_GREEKS = '0';
process.env.EC2_REDIS_PROXY_URL = 'https://cache.invalid';
process.env.REDIS_PROXY_KEY = '';
process.env.EC2_REDIS_PROXY_KEY = '';
delete process.env.UPSTASH_REDIS_REST_URL;

const inject = (rel: string, exports: any) => {
    const id = require.resolve(rel);
    require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
inject('../src/services/redisClient', { getFromCache: async () => null, setInCache: async () => true });
inject('../src/lib/intrinioMeter', { note429() {}, releaseMeterClaim: async () => {}, upstashMeterStore: {} });
inject('../src/lib/intrinioCallMeter', { noteCall() {} });
inject('../src/services/fmpNewsAdapter', { hasFmpKey: () => false });
const massive = require('../src/services/massiveClient');
const { selectWhaleSession } = require('../src/lib/app/flowWhaleSession');

const setNow = (iso: string) => {
    class FixedDate extends RealDate {
        constructor(...args: any[]) { super(...(args.length ? args : [RealDate.parse(iso)]) as [any]); }
        static now() { return RealDate.parse(iso); }
    }
    globalThis.Date = FixedDate as DateConstructor;
};

// Intrinio options/chain/{t}/{exp}/eod rows (ApiResponseOptionsChainEod: chain[{ option, prices }]). No trade prints exist in this shape.
const row = (code: string, type: 'call' | 'put', strike: number, expiration: string, date: string, volume: number, close: number) => ({
    option: { code, ticker: 'NVDA', expiration, strike, type },
    prices: { date, close, close_bid: close - 0.05, close_ask: close + 0.05, close_bid_size: 10, close_ask_size: 12,
        volume, open_interest: 5000, high: close + 0.2, low: close - 0.2, open: close, mark: close,
        implied_volatility: 0.42, delta: type === 'call' ? 0.4 : -0.4, gamma: 0.02, theta: -0.1, vega: 0.08, exercise_style: 'A' },
});
const CHAIN: Record<string, any[]> = {
    '2026-10-23': [
        row('NVDA261023C00220000', 'call', 220, '2026-10-23', '2026-10-16', 61606, 1.2),   // $7,392,720
        row('NVDA261023P00200000', 'put', 200, '2026-10-23', '2026-10-16', 300, 1.0),      // $30,000 — below floor
        row('NVDA261023C00250000', 'call', 250, '2026-10-23', '2026-10-16', 0, 0.05),      // no volume
        row('NVDA261023C00230000', 'call', 230, '2026-10-23', '2026-10-15', 5000, 2.0),    // older EOD row — other session
    ],
    '2026-10-30': [
        row('NVDA261030P00210000', 'put', 210, '2026-10-30', '2026-10-16', 2000, 3.5),     // $700,000
    ],
    '2026-12-18': [
        row('NVDA261218C00260000', 'call', 260, '2026-12-18', '2026-10-16', 9000, 4.0),    // beyond 14d window
    ],
};
let calls: string[] = [];
beforeEach(() => {
    calls = [];
    globalThis.fetch = (async (input: any) => {
        const u = new URL(String(input));
        assert.ok(['intrinio.invalid', 'cache.invalid'].includes(u.hostname), 'unexpected network destination');
        calls.push(u.pathname);
        let body: any;
        if (u.hostname === 'cache.invalid') body = { result: null };
        else if (u.pathname === '/options/expirations/NVDA/eod') body = { expirations: Object.keys(CHAIN) };
        else if (/^\/options\/chain\/NVDA\/[\d-]+\/eod$/.test(u.pathname)) body = { chain: CHAIN[u.pathname.split('/')[4]] ?? [] };
        else if (u.pathname === '/securities/NVDA/prices/realtime') body = { last_price: 214.13 };
        else return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        return { ok: true, status: 200, json: async () => structuredClone(body), text: async () => JSON.stringify(body) };
    }) as any;
});
after(() => {
    globalThis.Date = RealDate; globalThis.fetch = realFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
});

function runRoute(nowIso: string) {
    const exports: Record<string, any> = {};
    const js = ts.transpileModule(fs.readFileSync('src/app/api/live/options/trades/route.ts', 'utf8'),
        { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const response = (payload: any, options?: { status: number }) => ({ status: options?.status ?? 200, json: async () => payload });
    vm.runInNewContext(js, {
        exports, URL, Date: globalThis.Date, console, Promise,
        require: (id: string) => {
            if (id === 'next/server') return { NextResponse: { json: response } };
            if (id === '@/services/redisClient') return { getFromCache: async () => null, setInCache: async () => {} };
            if (id === '@/services/massiveClient') return {
                getOptionSnapshot: massive.getOptionSnapshot,
                fetchMarketStatus: async () => ({ exchanges: { nyse: 'open', nasdaq: 'open' } }),
            };
            throw new Error(`Unexpected route dependency: ${id}`);
        },
    });
    setNow(nowIso);
    return exports.GET({ url: 'http://offline.test/api/live/options/trades?t=NVDA' }).then((r: any) => r.json()).then((b: any) => JSON.parse(JSON.stringify(b))); // vm realm → plain objects
}

// The page's real whale expressions (src/app/[locale]/app-view/flow/page.tsx), evaluated on the selected feed.
const pageSource = fs.readFileSync('src/app/[locale]/app-view/flow/page.tsx', 'utf8');
const pageAst = ts.createSourceFile('page.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const decls = new Map<string, ts.VariableDeclaration>();
(function visit(n: ts.Node) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && !decls.has(n.name.text)) decls.set(n.name.text, n);
    ts.forEachChild(n, visit);
})(pageAst);
function pageValue(name: string, ctx: Record<string, any>) {
    const init = decls.get(name)?.initializer;
    assert.ok(init, `page declaration ${name}`);
    const js = ts.transpileModule(`(${init.getText(pageAst)})`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    return vm.runInNewContext(js, { useMemo: (fn: () => any) => fn(), ...ctx });
}
function screen(selected: any) {
    const ctx: Record<string, any> = { whaleTradesFeed: selected.items, WHALE_PREMIUM_FLOOR: 50_000 };
    for (const name of ['whaleSweeps', 'whaleSummary', 'whaleDayTotal', 'whaleDayCount', 'whaleCallShare', 'largestWhalePrint']) ctx[name] = pageValue(name, ctx);
    return ctx;
}

test('connected Intrinio converter emits no last_trade — this is why tradesObserved is 0 even intraday', async () => {
    setNow('2026-10-19T15:00:00Z'); // Mon 11:00 ET, regular session
    const chain = await massive.getOptionSnapshot('NVDA');
    assert.ok(chain.length >= 5, 'real converter ran');
    assert.ok(chain.every((c: any) => c.last_trade === undefined), 'no trade print fields');
    assert.ok(calls.includes('/options/chain/NVDA/2026-10-23/eod'));
    assert.deepEqual([...new Set(chain.map((c: any) => c._intrinio?.date))].sort(), ['2026-10-15', '2026-10-16']);
});

test('regular session: route keeps items empty (web unchanged) and attaches the dated EOD session aggregate', async () => {
    const body = await runRoute('2026-10-19T15:00:00Z');
    assert.equal(body.debug.tradesObserved, 0);
    assert.deepEqual(body.items, [], 'individual-print slot stays empty — no synthetic prints');
    assert.equal(body.sessionAggregate.basis, 'eod-volume');
    assert.equal(body.sessionAggregate.sessionDate, '2026-10-16');
    assert.deepEqual(body.sessionAggregate.items.map((x: any) => [x.type, x.strike, x.size, x.price, Math.round(x.premium)]),
        [['CALL', 220, 61606, 1.2, 7392720], ['PUT', 210, 2000, 3.5, 700000]]);
    for (const x of body.sessionAggregate.items) {
        assert.equal(x.timestamp, null); assert.equal(x.timeET, null); assert.equal(x.tradeDate, null);
        assert.equal('side' in x, false, 'no inferred direction');
    }
    assert.equal(body.debug.eodSessionDate, '2026-10-16');
    assert.equal(body.debug.eodContracts, 2);

    const selected = selectWhaleSession(body, 'REG', Date.parse('2026-10-19T15:00:00Z'));
    assert.equal(selected.sessionDate, '2026-10-16', 'shown as the prior close, never as live/today');
    assert.notEqual(selected.meta, null);
    const s = screen(selected);
    assert.equal(Math.round(s.whaleDayTotal), 8092720);
    assert.equal(s.whaleDayCount, 2);
    assert.equal(Math.round(s.largestWhalePrint), 7392720);
    assert.ok(Math.abs(s.whaleCallShare - 7392720 / 8092720 * 100) < 1e-9);
    for (const tx of s.whaleSweeps) { assert.equal(tx.time, null); assert.equal(tx.dir, null); assert.equal(tx.tradeDate, null); }
});

test('closed weekend and after-close keep the same dated value; an unfinished session date is refused', async () => {
    const body = await runRoute('2026-10-19T15:00:00Z');
    const sunday = selectWhaleSession(body, 'CLOSED', Date.parse('2026-10-18T16:00:00Z'));
    assert.equal(sunday.sessionDate, '2026-10-16'); assert.equal(sunday.items.length, 2);
    // Same-day EOD date while that session is still open would be "today" mislabelled as a close — refuse.
    const sameDay = { ...body, sessionAggregate: { ...body.sessionAggregate, sessionDate: '2026-10-19',
        items: body.sessionAggregate.items.map((x: any) => ({ ...x, sessionDate: '2026-10-19' })) } };
    const midSession = selectWhaleSession(sameDay, 'REG', Date.parse('2026-10-19T15:00:00Z'));
    assert.equal(midSession.meta, null); assert.equal(midSession.items.length, 0);
    const afterClose = selectWhaleSession(sameDay, 'POST', Date.parse('2026-10-19T21:00:00Z'));
    assert.equal(afterClose.sessionDate, '2026-10-19');
    // Future date, non-trading date, mixed-session rows, or missing basis → dash (never $0, never invented).
    for (const bad of [
        { ...body.sessionAggregate, sessionDate: '2026-10-20' },
        { ...body.sessionAggregate, sessionDate: '2026-10-17' },
        { ...body.sessionAggregate, items: body.sessionAggregate.items.map((x: any) => ({ ...x, sessionDate: '2026-10-15' })) },
        { ...body.sessionAggregate, basis: undefined },
    ]) {
        const r = selectWhaleSession({ ...body, sessionAggregate: bad }, 'REG', Date.parse('2026-10-19T15:00:00Z'));
        assert.equal(r.meta, null); assert.equal(r.items.length, 0);
    }
});

test('a chain without EOD dates (no _intrinio.date) yields no aggregate — source-missing dash, as before', async () => {
    const saved = structuredClone(CHAIN);
    try {
        for (const k of Object.keys(CHAIN)) CHAIN[k] = CHAIN[k].map((r: any) => ({ ...r, prices: { ...r.prices, date: null } }));
        const body = await runRoute('2026-10-19T15:00:00Z');
        assert.equal(body.sessionAggregate, null);
        const r = selectWhaleSession(body, 'REG', Date.parse('2026-10-19T15:00:00Z'));
        assert.equal(r.meta, null);
    } finally { Object.assign(CHAIN, saved); }
});

test('real prints, if a print source ever appears, take precedence over the EOD aggregate', async () => {
    const now = Date.parse('2026-10-19T15:00:00Z');
    const body = await runRoute('2026-10-19T15:00:00Z');
    const withPrint = { ...body, debug: { ...body.debug, tradesObserved: 1 },
        items: [{ type: 'CALL', premium: 400000, price: 4, size: 1000, timestamp: Date.parse('2026-10-19T14:30:00Z') * 1e6 }] };
    const r = selectWhaleSession(withPrint, 'REG', now);
    assert.equal(r.sessionDate, null); assert.equal(r.items.length, 1); assert.equal(r.items[0].premium, 400000);
    // Observed prints but none qualifying in the regular session remain the measured $0 (a28fb70ab behaviour).
    const zero = selectWhaleSession({ ...withPrint, items: [] }, 'REG', now);
    assert.notEqual(zero.meta, null); assert.equal(zero.items.length, 0); assert.equal(zero.sessionDate, null);
});
