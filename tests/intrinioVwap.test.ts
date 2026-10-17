/** Offline regression: execute the real Intrinio gateway, adapters and router. */
import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import fixture from './fixtures/intrinio-vwap.json';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeVwap, vwapDistancePct } from '../src/lib/vwap';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandSSRCards } from '../src/app/[locale]/ticker/CommandSSRCards';

const RealDate = Date;
const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };
process.env.INTRINIO_API_KEY = 'offline-placeholder';
process.env.INTRINIO_BASE_URL = 'https://intrinio.invalid';
process.env.INTRINIO_MAX_ATTEMPTS = '1';
process.env.EC2_REDIS_PROXY_URL = 'https://cache.invalid';
process.env.REDIS_PROXY_KEY = '';
process.env.EC2_REDIS_PROXY_KEY = '';
delete process.env.UPSTASH_REDIS_REST_URL;

const inject = (rel: string, exports: any) => {
    const id = require.resolve(rel);
    require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
const cache = new Map<string, any>();
inject('../src/services/redisClient', {
    getFromCache: async (key: string) => cache.get(key) ?? null,
    setInCache: async (key: string, value: any) => { cache.set(key, value); return true; },
});
inject('../src/lib/intrinioMeter', { note429() {}, releaseMeterClaim: async () => {}, upstashMeterStore: {} });
inject('../src/lib/intrinioCallMeter', { noteCall() {} });
inject('../src/services/fmpNewsAdapter', { hasFmpKey: () => false });
const { routeToIntrinio } = require('../src/services/intrinioRouter');
const client = require('../src/services/intrinioClient');

let rt: any;
let hist: any;
let calls: string[];
const now = (iso: string) => {
    class FixedDate extends RealDate {
        constructor(...args: any[]) { super(...(args.length ? args : [RealDate.parse(iso)]) as [any]); }
        static now() { return RealDate.parse(iso); }
    }
    globalThis.Date = FixedDate as DateConstructor;
};
beforeEach(() => {
    now('2026-10-16T17:00:00Z');
    cache.clear(); calls = [];
    rt = structuredClone(fixture.realtime); hist = structuredClone(fixture.history);
    globalThis.fetch = (async (input: any) => {
        const u = new URL(String(input));
        assert.ok(['intrinio.invalid', 'cache.invalid'].includes(u.hostname), 'unexpected network destination');
        calls.push(u.pathname); // Do not log query strings or headers.
        let body: any;
        if (u.hostname === 'cache.invalid') {
            const key = u.searchParams.get('key') || '';
            body = { result: key === 'intrinio:eod:snapshot' ? {
                date: '2026-10-16', prevDate: '2026-10-15',
                rows: [['NVDA', 100, 110, 90, 100, 300000, 2, 2.0408]],
            } : key === 'intrinio:eod:history' ? {
                dates: ['2026-10-14'], closes: { NVDA: [97] },
            } : null };
        } else if (u.pathname.endsWith('/prices/realtime')) body = rt;
        else if (u.pathname.endsWith('/prices')) body = hist;
        else if (u.pathname === '/securities/snapshots') body = { snapshots: [] };
        else throw new Error('Unexpected offline request path');
        return { ok: true, status: 200, json: async () => structuredClone(body) };
    }) as any;
});
after(() => {
    globalThis.Date = RealDate; globalThis.fetch = realFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
});

test('evidence limitation is explicit; OHLCV cannot determine VWAP', () => {
    assert.ok(fixture.provenance.requests.every(r => r.status === 401 && !Object.keys(r.summary).length));
    const weighted = (xs: number[][]) => xs.reduce((n, [p, v]) => n + p * v, 0) / xs.reduce((n, [, v]) => n + v, 0);
    assert.equal(weighted(fixture.trades), 109.6);
    assert.equal(weighted([[100, 1], [110, 1], [90, 97], [100, 1]]), 90.4);
    // Both tapes have identical O/H/L/C/volume. Neither VWAP is typical price 100.
});

test('snapshot day/prevDay/min never expose typical price as VWAP', async () => {
    const { ticker: s } = await routeToIntrinio('/v2/snapshot/locale/us/markets/stocks/tickers/NVDA');
    for (const b of [s.day, s.prevDay, s.min]) assert.equal(b.vw, null);
    assert.equal(s.day.typicalPrice, 100);
    assert.equal(s.prevDay.typicalPrice, 98);
    assert.deepEqual([s.day.o, s.day.h, s.day.l, s.day.c, s.day.v], [100, 110, 90, 100, 100]);
    assert.equal(calls.length, 3, 'default + history + Edge; no VWAP request added');
});

test('daily adapter preserves OHLCV and separates typicalPrice from unavailable VWAP', async () => {
    hist = fixture.daily;
    const r = await client.getDailyAggregates('nvda', '2026-10-15', '2026-10-16');
    assert.deepEqual(r.results.map((b: any) => b.vw), [null, null]);
    assert.deepEqual(r.results.map((b: any) => b.typicalPrice), [98, 100]);
    assert.deepEqual(r.results.map((b: any) => [b.o, b.h, b.l, b.c, b.v]), [[98, 108, 88, 98, 200], [100, 110, 90, 100, 100]]);
    assert.equal(calls.length, 1);
});

test('daily range and prev router callers keep sort/limit/count and missing VWAP', async () => {
    hist = fixture.daily;
    const r = await routeToIntrinio('/v2/aggs/ticker/NVDA/range/1/day/2026-10-15/2026-10-16', { sort: 'desc', limit: '1' });
    assert.equal(r.results[0].c, 100); assert.equal(r.results[0].vw, null);
    assert.equal(r.resultsCount, 1);
    const p = await routeToIntrinio('/v2/aggs/ticker/NVDA/prev');
    assert.equal(p.results[0].vw, null); assert.equal(p.results[0].c, 100);
});

test('missing high/low or volume does not create a VWAP or a zero-based typicalPrice', async () => {
    delete rt.high_price; delete rt.low_price; delete rt.market_volume;
    const s = (await client.getTickerSnapshot('NVDA')).ticker;
    assert.equal(s.day.vw, null); assert.equal(s.day.typicalPrice, null);
    assert.equal(s.day.c, 100); assert.equal(s.day.v, 0);
});

for (const [session, iso, last, close, previous] of [
    ['PRE', '2026-10-16T12:00:00Z', 101, 98, 97],
    ['REG', '2026-10-16T17:00:00Z', 100, 100, 98],
    ['POST', '2026-10-16T21:00:00Z', 102, 100, 98],
    ['CLOSED', '2026-10-17T00:30:00Z', 102, 100, 98],
] as const) {
    test(`${session}: price/session/regular-close/previous-close/extended price stay intact`, async () => {
        now(iso); rt.last_price = last; rt.last_time = iso;
        rt.normal_market_hours_last_time = session === 'PRE' ? '2026-10-15T20:00:00Z' : '2026-10-16T20:00:00Z';
        if (session === 'REG') rt.normal_market_hours_last_time = iso;
        rt.normal_market_hours_last_price = session === 'PRE' ? 98 : 100;
        const s = (await client.getTickerSnapshot('NVDA')).ticker;
        assert.deepEqual([s._intrinio.session, s.day.c, s.prevDay.c, s.lastTrade.p], [session, close, previous, last]);
        assert.equal(s.day.vw, null); assert.equal(s.prevDay.vw, null);
        if (session === 'PRE') assert.equal(s.preMarket, last);
        if (session === 'POST' || session === 'CLOSED') assert.equal(s.afterHours, last);
    });
}

test('bulk snapshot bar callers keep prices/volume but no typical VWAP', async () => {
    const r = await client.getFullMarketSnapshotIntrinio();
    const s = r.tickers.find((r: any) => r.ticker === 'NVDA');
    assert.ok(s);
    assert.equal(s.day.vw, null); assert.equal(s.min.vw, null); assert.equal(s.prevDay.vw, null);
    assert.equal(s.day.typicalPrice, 100); assert.equal(s.day.c, 100); assert.equal(s.day.v, 300000);
});

test('grouped latest/previous/history rows never substitute typical price or close for VWAP', async () => {
    for (const date of ['2026-10-16', '2026-10-15', '2026-10-14']) {
        const r = await client.getGroupedDailyIntrinio(date);
        assert.ok(r.results.length);
        assert.equal(r.results[0].vw, null, date);
    }
});

test('direct snapshot batch caller retains null VWAP', async () => {
    const r = await client.getFullMarketSnapshotIntrinio(['NVDA']);
    assert.equal(r._source, 'intrinio-realtime');
    assert.equal(r.tickers[0].day.vw, null); assert.equal(r.tickers[0].day.c, 100);
});

test('liquidity fallback snapshot caller still computes spread, independently of VWAP', async () => {
    now('2026-10-16T21:00:00Z'); rt.last_time = '2026-10-16T21:00:00Z';
    const r = await client.sessionAwareLiquidity('NVDA', null, null);
    assert.ok(r.liquidityScore > 0); assert.ok(r.spreadPct > 0);
    assert.ok(calls.includes('/securities/NVDA/prices/realtime'));
});

// Keep the actual price adapter/router; isolate unrelated news/options/storage work.
inject('../src/services/massiveClient', {
    CACHE_POLICY: { LIVE: {}, REPORT_GEN: {} }, setStatusCallback() {}, normalizeError: () => ({ code: 'OFFLINE' }),
    fetchMassive: async (endpoint: string, params: any = {}) => {
        const path = endpoint.startsWith('http') ? new URL(endpoint).pathname : endpoint;
        if (/snapshot|\/range\/1\/day\/|\/prev$/.test(path)) return routeToIntrinio(path, params);
        return { results: [], status: 'OK' };
    },
});
inject('../src/services/marketStatusProvider', { getMarketStatusSSOT: async () => ({ session: 'regular' }) });
inject('../src/services/holidayCache', { findWeeklyExpirationSync: () => '2026-10-16' });
inject('../src/services/extendedSessionClose', {
    isTradeInExtSession: () => false, peekExtendedSessionCloses: async () => [],
    getExtendedSessionClose: async () => null,
});
inject('../src/services/newsHubProvider', { fetchStockNews: async () => [] });
inject('../src/services/buildIdSSOT', { getBuildId: () => 'offline', getEnvType: () => 'local' });

test('SSR getStockData receives null VWAP through the real adapter/router', async () => {
    const { getStockData } = require('../src/services/stockApi');
    const result = await getStockData('NVDA', '1mo');
    assert.equal(result.vwap, null); assert.equal(result.price, 100);
    assert.equal(result.dayHigh, 110); assert.equal(result.dayLow, 90);
});

test('SSR getStockDataLight → actual preview keeps unavailable VWAP as a placeholder', async () => {
    const { getStockDataLight } = require('../src/services/marketDataLight');
    const result = await getStockDataLight('NVDA');
    assert.equal(result.vwap, null); assert.equal(result.price, 100);
    assert.equal(result.todayClose, 100); assert.equal(result.prevClose, 98);
    const html = renderToStaticMarkup(React.createElement(CommandSSRCards, { data: {}, stockData: result, ticker: 'NVDA' }));
    assert.ok(html.includes('VWAP')); assert.ok(html.includes('--'));
    assert.doesNotMatch(html, /\$0\.00|Infinity|NaN/);
});

test('CentralDataHub and tickerOverview preserve the missing-VWAP contract', async () => {
    const { CentralDataHub } = require('../src/services/centralDataHub');
    CentralDataHub._fetchOptionsChain = async () => ({ optionsCount: 0 });
    const unified = await CentralDataHub.getUnifiedData('NVDA', true);
    assert.equal(unified.snapshot.day.vw, null); assert.equal(unified.price, 100);
    const { getTickerOverview } = require('../src/services/tickerOverview');
    const result = await getTickerOverview('NVDA', { includeHistory: false, includeNews: false, includeOptions: false });
    assert.equal(result.price.vwap, null); assert.equal(result.price.last, 100);
    assert.equal(result.diagnostics.vwap.ok, false);
});

// Execute every directly affected VWAP mapping expression from its current source.
// This complements the real adapter/service tests; it is not a full HTTP/UI test.
const consumerFiles = [
    'src/app/api/live/ticker/route.ts', 'src/app/api/live/prev-day/route.ts',
    'src/app/api/dashboard/daily-history/route.ts', 'src/app/api/dashboard/unified/route.ts',
    'src/app/api/portfolio/batch/route.ts', 'src/app/api/quant-radar/route.ts',
    'src/services/stockApi.ts', 'src/services/marketDataLight.ts',
    'src/services/watchlistBatchService.ts', 'src/services/portfolioBatchService.ts',
    'src/services/unifiedPriceService.ts', 'src/services/top3Enrichment.ts',
    'src/services/terminalEnricher.ts',
];
for (const file of consumerFiles) {
    test(`${file}: mapping keeps absence and valid VWAP distinct from typicalPrice`, () => {
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        const expressions: string[] = [];
        const visit = (node: ts.Node) => {
            if ((ts.isPropertyAssignment(node) || ts.isVariableDeclaration(node)) && node.initializer
                && /vwap|prevVwap/.test(node.name.getText(source)) && /\.vw\b/.test(node.initializer.getText(source))) {
                expressions.push(node.initializer.getText(source));
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
        assert.ok(expressions.length, `no mapping examined in ${file}`);
        for (const value of [null, 109.6]) {
            const b = { vw: value, typicalPrice: 100 };
            const snapshot = { day: b, prevDay: b };
            const context = { S: snapshot, t: snapshot, snap: snapshot, tickerData: snapshot,
                stockData: { vwap: value }, c: snapshot, entry: { vwap: value }, ac: { vwap: value },
                vwapMap: { NVDA: value }, ticker: 'NVDA', bar: b, prevResults: b,
                data: { snapshot }, last: 123, vwap: value, normalizeVwap };
            for (const expression of expressions) {
                const mapped = vm.runInNewContext(`(${expression})`, context);
                if (value === null) assert.ok(mapped == null || mapped === 0, expression);
                else assert.equal(mapped, value, expression);
            }
        }
    });
}

test('terminal price evidence does not replace missing VWAP with last price', () => {
    const file = 'src/services/terminalEnricher.ts';
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const fn = source.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'buildPriceEvidence');
    assert.ok(fn);
    const js = ts.transpileModule(fn.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const build = vm.runInNewContext(`${js}; buildPriceEvidence`, { normalizeVwap, vwapDistancePct });
    const input = { price: 123, snapshot: { day: { vw: null, typicalPrice: 100 } } };
    const missing = build(input);
    assert.equal(missing.last, 123); assert.equal(missing.vwap, null); assert.equal(missing.vwapDistPct, null);
    const valid = build({ ...input, snapshot: { day: { vw: 109.6 } } });
    assert.equal(valid.vwap, 109.6); assert.ok(valid.vwapDistPct > 0);
});

for (const file of ['src/app/api/wim/today/route.ts', 'src/app/api/wim/lab/route.ts']) {
    test(`${file}: numeric filter keeps missing VWAP out of sparkline values`, () => {
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        let expression = '';
        const visit = (node: ts.Node) => {
            if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'vwaps') expression = node.initializer!.getText(source);
            ts.forEachChild(node, visit);
        };
        visit(source); assert.ok(expression);
        const js = ts.transpileModule(`const values = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
        for (const value of [null, 109.6]) {
            const values = vm.runInNewContext(`${js}; values`, { bars: [{ c: 100, vw: value, typicalPrice: 100 }] });
            assert.deepEqual(Array.from(values), value === null ? [] : [109.6]);
        }
    });
}

test('analysis uses its existing missing-VWAP branch instead of a measured-distance factor', async () => {
    const s = (await client.getTickerSnapshot('NVDA')).ticker;
    const { calculateAlphaScore } = require('../src/services/alphaEngine');
    const result = calculateAlphaScore({ ticker: 'NVDA', session: 'REG', price: 100, changePct: 2, vwap: s.day.vw });
    const factor = result.pillars.momentum.factors.find((f: any) => f.name === 'vwapPosition');
    assert.ok(factor); assert.equal(factor.detail, 'VWAP 없음(추정)');
    assert.ok(Number.isFinite(result.score));
});

test('dashboard does not refetch explicitly unavailable VWAP; absent/legacy data still retries', () => {
    const file = 'src/app/api/dashboard/unified/route.ts';
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let expression = '';
    const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'tickersNeedingVwap') expression = node.initializer!.getText(source);
        ts.forEachChild(node, visit);
    };
    visit(source); assert.ok(expression);
    for (const [snapshot, expected] of [
        [{ day: { vw: null } }, []], [{ day: { vw: 109.6 } }, []],
        [{ day: { vw: 0 } }, ['NVDA']], [{}, ['NVDA']],
    ] as const) {
        const result = vm.runInNewContext(`(${expression})`, { tickers: ['NVDA'], analysisCacheMap: { NVDA: { vwap: null } }, priceMap: { NVDA: snapshot } });
        assert.deepEqual(Array.from(result), Array.from(expected));
    }
});
