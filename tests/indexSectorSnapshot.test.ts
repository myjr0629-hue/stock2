import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { indexArchiveMemory } from './helpers/indexArchiveMemory';
import * as indexSnapshots from '../src/lib/indexCloseSnapshot';
import { buildIndexItems, buildSectorItems, sectorDisplayPct } from '../src/lib/dashMarketSnapshot';
import * as calendar from '../src/lib/marketCalendar';
import { reconcileIndexQuote } from '../src/lib/indexQuoteReconcile';

// Run production modules with strict I/O seams. No Redis, vendor, env files or network.
const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = (x: any) => JSON.parse(JSON.stringify(x));
function load(file: string, deps: Record<string, any>, globals: any = {}, extra = '') {
    const exports = {};
    const context = vm.createContext({ exports, module: { exports }, URL, AbortSignal, Date,
        console: { log() {}, warn() {}, error() {} },
        fetch: () => { throw new Error('Unexpected network'); },
        require(name: string) { assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`); return deps[name]; },
        ...globals });
    vm.runInContext(ts.transpileModule(read(file) + extra, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, context);
    return (context as any).module.exports;
}
const quote = (over: any = {}) => ({ price: 101, changePct: 1, prevClose: 100,
    marketTime: '2026-10-16T20:00:00.000Z', updatedAt: '2026-10-16T20:01:00.000Z', source: 'YAHOO', ...over });
const keys = { IDX_NASDAQ: 'nasdaq', IDX_DOW: 'dow', IDX_SPX: 'spx' };
function archiveService(store: Map<string, any>, writes: any[][] = [], memory = indexArchiveMemory(store, writes)) {
    return load('src/services/indexArchiveStore.ts', {
        '@upstash/redis': { Redis: memory.Redis },
        '@/lib/atomicArchiveSave': require('../src/lib/atomicArchiveSave'),
        '@/lib/indexCloseSnapshot': indexSnapshots,
    }, { process: { env: { KV_REST_API_URL: 'https://fixture.invalid', KV_REST_API_TOKEN: 'offline-fixture' } } });
}
const atomicKey = (key: string) => `${key}:last-good:v2`;
function indexRoute(store: Map<string, any>, failed = new Set<string>(), archive = archiveService(store)) {
    return load('src/app/api/market/index-close/route.ts', {
        'next/server': { NextResponse: { json: plain } },
        '@/services/indexArchiveStore': archive,
        '@/services/redisClient': { getFromCache: async (key: string) => {
            if (failed.has(key)) throw new Error('read failed');
            return store.get(key) ?? null;
        } },
        '@/services/yahooFinanceHub': { YAHOO_CACHE_KEYS: keys },
        '@/lib/indexCloseSnapshot': indexSnapshots,
    });
}
function marketFeed(store: Map<string, any>, observation: any, writes: any[][] = [], archive = archiveService(store, writes), revision = 100) {
    return load('src/app/api/cron/market-feed/route.ts', {
        'next/server': { NextResponse: { json: plain } },
        '@/services/redisClient': {
            getFromCache: async (key: string) => store.get(key) ?? null,
            setInCache: async (...args: any[]) => { writes.push(args); store.set(args[0], plain(args[1])); return true; },
        },
        '@/services/yahooFinanceHub': { YAHOO_CACHE_KEYS: keys },
        '@/lib/indexCloseSnapshot': indexSnapshots,
        '@/lib/indexQuoteReconcile': { reconcileIndexQuote },
        '@/services/indexArchiveStore': archive,
    }, { Date: class extends Date { static now() { return revision; } }, fetch: async (url: string) => {
        const requested = new URL(url);
        assert.ok(['query1.finance.yahoo.com', 'production.dataviz.cnn.io'].includes(requested.hostname));
        const ok = decodeURIComponent(requested.pathname).endsWith('/^DJI')
            && requested.searchParams.get('interval') === '1m';
        return { ok, json: async () => ({ chart: { result: [{ meta: {
            regularMarketPrice: observation.price, previousClose: observation.prevClose,
            regularMarketTime: Date.parse(observation.marketTime) / 1000,
        } }] } }) };
    } });
}
const sectorQuote = (over: any = {}) => ({ price: 101, previousClose: 100, changePercent: 1,
    sourceSessionDate: '2026-10-16', ...over });

test('index: all missing/rejected reads return three explicit nulls, no fabricated values', async () => {
    for (const fail of [new Set<string>(), new Set(Object.values(keys))]) {
        assert.deepEqual(await indexRoute(new Map(), fail).GET(), { nasdaq: null, dow: null, spx: null });
    }
    assert.deepEqual(buildIndexItems(null).map(x => [x.sym, x.noData, x.chg]),
        [['DOW', true, null], ['NASDAQ', true, null], ['S&P 500', true, null]]);
});

test('index: partial, nonfinite, undated and DEFAULT quotes restore an atomic dated observation', async () => {
    const saved = quote({ price: 100, changePct: 0 });
    for (const bad of [null, { price: 102 }, quote({ changePct: undefined }), quote({ price: NaN }),
        quote({ price: Infinity }), quote({ marketTime: undefined }), quote({ source: 'DEFAULT' })]) {
        const store = new Map([['dow', bad], [indexSnapshots.indexLastGoodKey('dow'), saved]]);
        const result = await indexRoute(store).GET();
        assert.equal(result.dow.price, 100);
        assert.equal(result.dow.changePct, 0);
        assert.equal(result.dow.marketTime, saved.marketTime);
        assert.equal(result.dow.sourceSessionDate, '2026-10-16');
        assert.equal(result.spx, null);
        assert.equal(indexSnapshots.resolveIndexClose(bad, null), null);
    }
});

test('index: one good field group renders independently; memory bridges later total read failure', async () => {
    const store = new Map([['dow', quote({ changePct: 0 })]]);
    const failed = new Set<string>();
    const route = indexRoute(store, failed);
    const first = await route.GET();
    const items = buildIndexItems(first);
    assert.equal(items.length, 3);
    assert.equal(items[0].chg, 0);
    assert.equal(items[1].noData, true);
    assert.equal(items[0].sourceSessionDate, '2026-10-16');
    for (const key of Object.values(keys)) { failed.add(key); failed.add(indexSnapshots.indexLastGoodKey(key)); }
    assert.deepEqual(await route.GET(), first);
    assert.deepEqual(buildIndexItems(null, items), items);
});

test('index: older out-of-order quotes cannot displace a newer observation', () => {
    assert.equal(indexSnapshots.resolveIndexClose(quote({ marketTime: '2026-10-15T20:00:00Z' }), quote())?.marketTime,
        quote().marketTime);
});

test('collector: Oct 16 price 110 survives Oct 15 price 100 and a fresh API instance after live expiry', async () => {
    const store = new Map<string, any>();
    const writes: any[][] = [];
    await marketFeed(store, quote({ price: 110 }), writes).GET({ url: 'http://fixture.invalid/api/cron/market-feed' });
    const savedKey = atomicKey('dow');
    const saved = plain(store.get(savedKey));
    assert.equal(saved.price, 110);
    await marketFeed(store, quote({ price: 100, marketTime: '2026-10-15T20:00:00Z' }), writes)
        .GET({ url: 'http://fixture.invalid/api/cron/market-feed' });
    assert.deepEqual(store.get(savedKey), saved);
    assert.equal(writes.filter(([key]) => key === savedKey).length, 1);
    store.delete('dow'); // Ten-minute live cache expired; API memory starts empty.
    const restored = await indexRoute(store).GET();
    assert.equal(restored.dow.price, 110);
    assert.equal(restored.dow.marketTime, '2026-10-16T20:00:00.000Z');
    assert.equal(restored.dow.sourceSessionDate, '2026-10-16');
    assert.equal(buildIndexItems(restored)[0].noData, false);
});

test('collector: source time precedes revision; equal-source later revision accepts corrections', async () => {
    const savedKey = atomicKey('dow');
    const saved = quote({ price: 110, marketTime: '2026-10-16T19:59:00.000Z', updatedAt: '2099-01-01T00:00:00Z' });
    for (const [marketTime, expected] of [
        ['2026-10-16T19:58:00Z', 110], ['2026-10-16T19:59:00Z', 100], ['2026-10-16T20:00:00Z', 100],
        ['2026-10-19T13:30:00Z', 100],
    ] as const) {
        const store = new Map([[savedKey, { ...saved, sourceTime: Date.parse(saved.marketTime), revision: 1 }]]);
        await marketFeed(store, quote({ price: 100, marketTime })).GET({ url: 'http://fixture.invalid/api/cron/market-feed' });
        assert.equal(store.get(savedKey).price, expected, marketTime);
    }
});

test('collector: missing baseline is unavailable; actual zero survives failed secondary daily data', async () => {
    for (const symbol of ['^IXIC', '^DJI', '^GSPC']) {
        for (const previousClose of [undefined, 100]) {
            const calls: string[] = [];
            const collector = load('src/app/api/cron/market-feed/route.ts', {
                'next/server': {}, '@/services/redisClient': {}, '@/services/indexArchiveStore': {},
                '@/lib/indexCloseSnapshot': indexSnapshots,
                '@/services/yahooFinanceHub': { YAHOO_CACHE_KEYS: keys },
                '@/lib/indexQuoteReconcile': { reconcileIndexQuote },
            }, { fetch: async (url: string) => {
                calls.push(url);
                return { ok: url.includes('interval=1m'), json: async () => ({ chart: { result: [{
                    meta: { regularMarketPrice: 100, previousClose, regularMarketTime: Date.parse(quote().marketTime) / 1000 },
                }] } }) };
            } }, '\nexport { fetchOneQuote };');
            const actual = await collector.fetchOneQuote(symbol);
            assert.equal(actual?.changePct ?? null, previousClose === undefined ? null : 0);
            assert.equal(calls.length, 2, 'no value-based daily walk-back for an actual cash index');
        }
    }
});

test('collector: only valid cash-index observations enter v2, without TTL; v1 is read only', async () => {
    const store = new Map<string, any>();
    const writes: any[][] = [];
    const legacy = quote({ price: 99 });
    store.set(indexSnapshots.indexLastGoodKey('dow'), legacy);
    await marketFeed(store, quote({ changePct: 0 }), writes).GET({ url: 'http://fixture.invalid/api/cron/market-feed' });
    const archiveWrites = writes.filter(([key]) => String(key).endsWith(':last-good:v2'));
    assert.equal(archiveWrites.length, 1);
    assert.equal(archiveWrites[0].length, 2, 'no TTL on durable archive');
    assert.equal(archiveWrites[0][1].sourceTime, Date.parse(quote().marketTime));
    assert.equal(archiveWrites[0][1].revision, 100);
    assert.deepEqual(store.get(indexSnapshots.indexLastGoodKey('dow')), legacy);
    const archive = archiveService(store);
    for (const invalid of [quote({ changePct: undefined }), quote({ marketTime: undefined }), quote({ price: 0 })]) {
        await assert.rejects(archive.saveIndexArchive('dow', invalid, 200));
    }
});

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

test('gate 2 correction: same source 110/110 → 110/100 restores +10%, then corrected zero, after live expiry', async () => {
    const store = new Map<string, any>();
    for (const [prevClose, expected, revision] of [[110, 0, 100], [100, 10, 200], [110, 0, 300]]) {
        await marketFeed(store, quote({ price: 110, prevClose }), [], undefined, revision)
            .GET({ url: 'http://fixture.invalid/api/cron/market-feed' });
        assert.equal((await indexRoute(store).GET()).dow.changePct, expected);
        store.delete('dow');
        const restored = (await indexRoute(store).GET()).dow;
        assert.equal(restored.changePct, expected);
        assert.equal(restored.price, 110);
        assert.equal(restored.sourceSessionDate, '2026-10-16');
    }
});

for (const [olderTime, sameSource] of [['2026-10-15T20:00:00Z', false], ['2026-10-16T19:59:00Z', false], ['2026-10-16T20:00:00Z', true]] as const) {
    test(`gate 2 concurrency: delayed older commit cannot reverse latest archive (${olderTime})`, async () => {
        const store = new Map<string, any>();
        const memory = indexArchiveMemory(store);
        const archive = archiveService(store, [], memory);
        const waiting = deferred(), release = deferred();
        let paused = false;
        memory.hooks.beforeExec = async (_key, value) => {
            if (value.revision === 100 && !paused) { paused = true; waiting.resolve(); await release.promise; }
        };
        const old = marketFeed(store, quote({ price: 100, prevClose: sameSource ? 100 : 90, marketTime: olderTime }), [], archive, 100)
            .GET({ url: 'http://fixture.invalid/api/cron/market-feed' });
        await waiting.promise;
        await marketFeed(store, quote({ price: 110, prevClose: 100 }), [], archive, 200)
            .GET({ url: 'http://fixture.invalid/api/cron/market-feed' });
        release.resolve();
        await old;
        assert.equal(memory.stats.conflicts, 1, 'forced WATCH conflict followed by a fresh comparison');
        // Also verify an API instance that remembered the older response.
        const api = indexRoute(store);
        const current = await api.GET();
        assert.equal(current.dow.price, 110);
        store.delete('dow');
        for (const result of [await api.GET(), await indexRoute(store).GET()]) {
            assert.equal(result.dow.price, 110);
            assert.equal(result.dow.changePct, 10);
            assert.equal(result.dow.sourceSessionDate, '2026-10-16');
            assert.equal(result.dow.revision, 200);
        }
    });
}

test('v2 supersedes stale live/v1/memory at equal source time; later source still wins', async () => {
    const store = new Map<string, any>([['dow', quote({ price: 110, changePct: 0, revision: 100 })]]);
    const api = indexRoute(store);
    assert.equal((await api.GET()).dow.changePct, 0);
    await archiveService(store).saveIndexArchive('dow', quote({ price: 110, changePct: 10 }), 200);
    store.set(indexSnapshots.indexLastGoodKey('dow'), quote({ price: 110, changePct: 0, updatedAt: '2099-01-01T00:00:00Z' }));
    assert.equal((await api.GET()).dow.changePct, 10);
    store.set('dow', quote({ marketTime: '2026-10-19T14:00:00Z', revision: 1 }));
    assert.equal((await api.GET()).dow.sourceSessionDate, '2026-10-19');
});

test('dashboard retains revision across state/local storage restoration and rejects older equal-source polling', () => {
    const latest = buildIndexItems({ dow: quote({ price: 110, changePct: 10, revision: 200 }) });
    const restored = plain(latest);
    const older = buildIndexItems({ dow: quote({ price: 110, changePct: 0, revision: 100 }) }, restored);
    assert.equal(older[0].chg, 10);
    assert.equal(older[0].revision, 200);
    assert.deepEqual(buildIndexItems(null, restored), latest);
    const correctedZero = buildIndexItems({ dow: quote({ price: 110, changePct: 0, revision: 300 }) }, older);
    assert.equal(correctedZero[0].chg, 0);
});

test('v2 read failure restores v1/memory and an unconfigured store fails explicitly', async () => {
    const legacy = quote({ price: 110, changePct: 10 });
    const store = new Map<string, any>([[indexSnapshots.indexLastGoodKey('dow'), legacy]]);
    const archive = { readIndexArchive: async () => { throw new Error('offline timeout'); } };
    const failed = new Set<string>();
    const api = indexRoute(store, failed, archive);
    assert.equal((await api.GET()).dow.changePct, 10);
    failed.add(indexSnapshots.indexLastGoodKey('dow'));
    assert.equal((await api.GET()).dow.changePct, 10);
    const missing = load('src/services/indexArchiveStore.ts', {
        '@upstash/redis': { Redis: class { constructor() { throw new Error('unexpected construction'); } } },
        '@/lib/atomicArchiveSave': require('../src/lib/atomicArchiveSave'), '@/lib/indexCloseSnapshot': indexSnapshots,
    }, { process: { env: {} } });
    await assert.rejects(missing.saveIndexArchive('dow', legacy, 200), /store unavailable/);
    await assert.rejects(missing.readIndexArchive('dow'), /store unavailable/);
});

test('archive errors are reported by cron without non-atomic fallback writes', async () => {
    const store = new Map<string, any>();
    const result = await marketFeed(store, quote(), [], { saveIndexArchive: async () => { throw new Error('offline timeout'); } })
        .GET({ url: 'http://fixture.invalid/api/cron/market-feed' });
    assert.equal(result.ok, 0);
    assert.ok(result.results.includes('^DJI=101(ARCHIVE_WRITE_FAIL)'));
    assert.ok(!store.has(atomicKey('dow')) && !store.has(indexSnapshots.indexLastGoodKey('dow')));
});

test('sectors: missing/partial observations keep eight cells; real zero replaces prior nonzero', () => {
    assert.deepEqual(buildSectorItems({}, '').map(x => x.pct), Array(8).fill(null));
    const previous = buildSectorItems({ XLK: sectorQuote() }, 'closed');
    for (const bad of [{}, { price: 100 }, sectorQuote({ changePercent: null }), sectorQuote({ sourceSessionDate: null }),
        sectorQuote({ changePercent: Infinity }), sectorQuote({ price: 0, error: 'unavailable' })]) {
        const actual = buildSectorItems({ XLK: bad }, 'closed', previous);
        assert.equal(actual[0].pct, 1);
        assert.equal(actual[0].sourceSessionDate, '2026-10-16');
        assert.equal(actual[0].riskPct, undefined);
        assert.equal(actual[1].pct, null);
    }
    // A contradictory baseline cannot override the vendor's actual measured 0%.
    assert.equal(buildSectorItems({ XLK: sectorQuote({ changePercent: 0 }) }, 'closed', previous)[0].pct, 0);
    const restored = buildSectorItems({}, '', JSON.parse(JSON.stringify(previous)));
    assert.equal(restored[0].pct, 1);
    assert.equal(restored[0].sourceSessionDate, '2026-10-16');
});

test('sectors: PRE/REG/POST/CLOSED retain source dates and source-derived changes including zero', () => {
    for (const session of ['pre', 'regular', 'post', 'closed']) {
        const ext = session === 'pre' || session === 'post';
        const result = buildSectorItems({ XLK: sectorQuote({ price: 100, changePercent: 0,
            extendedPrice: 100, extendedDate: '2026-10-19', session }) }, session);
        assert.equal(result[0].pct, 0);
        assert.equal(result[0].sourceSessionDate, ext ? '2026-10-19' : '2026-10-16');
    }
});

test('sectors: undated/old ticks or missing baseline cannot create zero or replace a dated value', () => {
    const sector = buildSectorItems({ XLK: sectorQuote() }, 'regular')[0];
    const now = Date.parse('2026-10-16T15:00:00Z');
    for (const tick of [{ price: 100 }, { price: 100, priceTime: now - 120_000 },
        { price: Infinity, priceTime: now }, { price: 100, priceTime: now + 120_000 }]) {
        assert.equal(sectorDisplayPct(sector, tick, true, now), 1);
    }
    assert.equal(sectorDisplayPct(sector, { price: 100, priceTime: now }, true, now), 0);
    assert.equal(sectorDisplayPct({ ...sector, base: undefined }, { price: 100, priceTime: now }, true, now), 1);
    assert.equal(sectorDisplayPct(sector, { price: 100, priceTime: now }, false, now), 1);
});

test('shared quotes route: actual source dates survive all sessions; quote fields remain compatible', async () => {
    for (const session of ['pre', 'regular', 'post', 'closed']) {
        const now = Date.parse('2026-10-19T15:00:00Z');
        const sourceTime = Date.parse('2026-10-16T19:59:00Z');
        const row = { day: { c: 100 }, prevDay: { c: 100 }, lastTrade: { p: 100, t: sourceTime * 1e6 },
            _intrinio: { regularDate: '2026-10-16' } };
        const route = load('src/app/api/live/quotes/route.ts', {
            'next/server': { NextResponse: { json: plain }, after() {} },
            '@/services/massiveClient': { fetchMassive: async () => ({ tickers: [{ ticker: 'XLK', ...row }] }) },
            '@/services/marketStatusProvider': { getMarketStatusSSOT: async () => ({ session, isHoliday: false }) },
            '@/services/lastSession': { reconstructLastSession: async () => ({}) },
            '@/services/extendedSessionClose': {
                peekExtendedSessionClosesAndWarm: async (need: any[]) => ({ values: need.map(() => null), warm: null }),
                recallProvisionalPreCloses: async (need: any[]) => need.map(() => null),
                rememberProvisionalPreClose() {}, isTradeInExtSession: () => false, pickRegularPreClose: () => null,
            },
            '@/lib/marketCalendar': calendar, '@/lib/bulkQuoteClose': {}, '@/lib/hubLiveOverlay': {}, '@/lib/sourceStamp': require('../src/lib/sourceStamp'),
        });
        const data = (await route.GET({ url: 'http://fixture.invalid/?symbols=XLK' })).data.XLK;
        assert.equal(data.sourceSessionDate, '2026-10-16');
        assert.equal(data.price, 100); assert.equal(data.changePercent, 0);
        assert.equal(data.previousClose, 100); assert.equal(data.session, session);
    }
});

test('last-session reconstruction carries the aggregate date, including a genuine zero close', async () => {
    const module = load('src/services/lastSession.ts', {
        '@/services/massiveClient': { CACHE_POLICY: {}, fetchMassive: async () => ({ results: [
            { c: 100, t: Date.parse('2026-10-16T04:00:00Z') }, { c: 100, t: Date.parse('2026-10-15T04:00:00Z') },
        ] }) },
        '@/services/redisClient': { getFromCache: async () => null, setInCache: async () => true },
        '@/services/extendedSessionClose': { getExtendedSessionClose: async () => null },
    });
    const result = await module.reconstructLastSession(['XLK']);
    assert.equal(result.XLK.sourceSessionDate, '2026-10-16');
    assert.equal(result.XLK.changePct, 0);
});

test('actual sector JSX renders missing as em dash and measured zero as +0.00%', () => {
    const source = read('src/app/[locale]/app-view/dash/page.tsx');
    const ast = ts.createSourceFile('dash.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let display: ts.Expression | undefined;
    function visit(node: ts.Node) {
        if (ts.isJsxExpression(node) && node.expression?.getText(ast).startsWith("pct == null ? '—'")) display = node.expression;
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(display);
    for (const [pct, expected] of [[null, '—'], [0, '+0.00%'], [-1, '-1.00%']]) {
        assert.equal(vm.runInNewContext(display!.getText(ast), { pct }), expected);
    }
});

test('OracleHeader keeps DOW/NASDAQ cells for missing values and displays real zero', () => {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    let idxData: any;
    const component = load('src/components/guardian/OracleHeader.tsx', {
        react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
        swr: { default: () => ({ data: idxData }) },
        '@/hooks/useMacroSnapshot': { useMacroSnapshot: () => ({ snapshot: null }) },
        '@/components/guardian/GuardianProvider': { useGuardian: () => ({ rlsi: null }) },
        '@/i18n/routing': { Link: (props: any) => React.createElement('a', { href: props.href }, props.children) },
        'next-intl': { useTranslations: () => () => '' },
        'lucide-react': { BookOpen: () => null },
    });
    idxData = { dow: null, nasdaq: null, spx: null };
    let html = renderToStaticMarkup(React.createElement(component.OracleHeader));
    assert.equal((html.match(/>DOW</g) || []).length, 2);
    assert.equal((html.match(/>NASDAQ</g) || []).length, 2);
    assert.equal(html.includes('+0.00%'), false);
    idxData = { dow: quote({ changePct: 0 }), nasdaq: quote({ changePct: 0 }) };
    html = renderToStaticMarkup(React.createElement(component.OracleHeader));
    assert.equal((html.match(/\+0.00%/g) || []).length, 4);
});

// ── Gate 3 (10/19 14:22) reproductions: Thu close 98, Fri close 100, Mon PRE 100 = real 0% ──
const MON_PRE = Date.parse('2026-10-19T12:00:00Z'); // 08:00 ET Monday
function fixedDate(ms: number) {
    const Real = Date;
    return class extends Real {
        constructor(...args: any[]) { super(...((args.length ? args : [ms]) as [number])); }
        static now() { return ms; }
    };
}
async function quotesRow(session: string, row: any, nowMs: number) {
    const route = load('src/app/api/live/quotes/route.ts', {
        'next/server': { NextResponse: { json: plain }, after() {} },
        '@/services/massiveClient': { fetchMassive: async () => ({ tickers: [{ ticker: 'XLK', ...row }] }) },
        '@/services/marketStatusProvider': { getMarketStatusSSOT: async () => ({ session, isHoliday: false }) },
        '@/services/lastSession': { reconstructLastSession: async () => ({}) },
        '@/services/extendedSessionClose': {
            peekExtendedSessionClosesAndWarm: async (need: any[]) => ({ values: need.map(() => null), warm: null }),
            recallProvisionalPreCloses: async (need: any[]) => need.map(() => null),
            rememberProvisionalPreClose() {},
            isTradeInExtSession: (ms: number, date: string, kind: string) => kind === session && calendar.etDateOf(ms) === date,
            pickRegularPreClose: () => null,
        },
        '@/lib/marketCalendar': calendar, '@/lib/bulkQuoteClose': {}, '@/lib/hubLiveOverlay': {}, '@/lib/sourceStamp': require('../src/lib/sourceStamp'),
    }, { Date: fixedDate(nowMs) });
    const json = await route.GET({ url: 'http://fixture.invalid/?symbols=XLK' });
    return { json, row: json.data.XLK };
}

test('gate 3: Monday PRE print equal to Friday close is a measured 0%, not Friday +2.04%', async () => {
    const { json, row } = await quotesRow('pre', {
        day: { c: 100 }, prevDay: { c: 98 }, lastTrade: { p: 100, t: MON_PRE * 1e6 },
        _intrinio: { regularDate: '2026-10-16' },
    }, MON_PRE + 60_000);
    assert.equal(row.extendedPrice, 100);
    assert.equal(row.extendedDate, '2026-10-19');
    assert.equal(row.extendedChangePercent, 0);
    assert.equal(row.extendedLabel, 'PRE'); // label unchanged
    const [xlk] = buildSectorItems({ XLK: row }, json.session, [], json.timestamp);
    assert.equal(xlk.pct, 0);
    assert.equal(xlk.sourceSessionDate, '2026-10-19');
    assert.equal(xlk.baseDate, '2026-10-19');
    assert.equal(xlk.base, 100);
    const now = MON_PRE + 90_000;
    assert.equal(sectorDisplayPct(xlk, { price: 100, priceTime: now - 1_000 }, true, now), 0);
    assert.equal(sectorDisplayPct(xlk, { price: 101, priceTime: now - 1_000 }, true, now), 1);
});

test('gate 3: before the first PRE print, a newer Monday socket tick is measured against Friday close', async () => {
    const fridayClose = Date.parse('2026-10-16T20:00:00Z');
    const { json, row } = await quotesRow('pre', {
        day: { c: 100 }, prevDay: { c: 98 }, lastTrade: { p: 100, t: fridayClose * 1e6 },
        _intrinio: { regularDate: '2026-10-16' },
    }, MON_PRE);
    assert.equal(row.extendedPrice, 0); // no Monday print yet: nothing extended to show
    const [xlk] = buildSectorItems({ XLK: row }, json.session, [], json.timestamp);
    assert.ok(Math.abs(xlk.pct! - 200 / 98) < 1e-9); // Friday regular change, dated Friday
    assert.equal(xlk.sourceSessionDate, '2026-10-16');
    assert.equal(xlk.baseDate, '2026-10-19');
    const now = MON_PRE + 30_000;
    // Monday tick at the same price = real 0% (Friday +2.04% must not stay on screen).
    assert.equal(sectorDisplayPct(xlk, { price: 100, priceTime: now - 1_000 }, true, now), 0);
    // A tick from another trading day never borrows Monday's baseline.
    const friday = Date.parse('2026-10-16T19:59:59Z');
    assert.equal(sectorDisplayPct(xlk, { price: 100, priceTime: friday }, true, friday + 1_000), xlk.pct);
    // Restored from storage, the dated baseline survives; old storage without it stays as-is.
    const restored = buildSectorItems({}, '', JSON.parse(JSON.stringify([xlk])));
    assert.equal(restored[0].baseDate, '2026-10-19');
    const legacy = buildSectorItems({}, '', [{ ...xlk, baseDate: undefined }]);
    assert.equal(sectorDisplayPct(legacy[0], { price: 100, priceTime: now - 1_000 }, true, now), legacy[0].pct);
});

test('gate 3: a socket tick older than the quote observation cannot replace it', () => {
    const quoteTime = Date.parse('2026-10-19T15:00:00Z');
    const [xlk] = buildSectorItems({ XLK: sectorQuote({ price: 101, previousClose: 100, changePercent: 1,
        sourceSessionDate: '2026-10-19', priceTime: quoteTime }) }, 'regular');
    assert.equal(xlk.baseDate, '2026-10-19');
    assert.equal(sectorDisplayPct(xlk, { price: 100, priceTime: quoteTime - 5_000 }, true, quoteTime), 1);
    assert.equal(sectorDisplayPct(xlk, { price: 100, priceTime: quoteTime + 1_000 }, true, quoteTime + 2_000), 0);
});

test('gate 3: regular-session source date follows priceTime when the hub advanced it past lastTrade.t', async () => {
    const monday = Date.parse('2026-10-19T14:00:00Z');
    const { row } = await quotesRow('regular', {
        day: { c: 101 }, prevDay: { c: 100 }, priceTime: monday,
        lastTrade: { p: 101, t: Date.parse('2026-10-16T19:59:00Z') * 1e6 },
        _intrinio: { regularDate: '2026-10-16' },
    }, monday + 60_000);
    assert.equal(row.priceTime, monday);
    assert.equal(row.sourceSessionDate, '2026-10-19');
    assert.equal(row.price, 101);
});

// ── Gate 4 (10/19 15:34): Fri close 100 · Mon PRE 100 (real 0%) · stale Friday socket 99.8 ──
test('gate 4: shared consumers never let an older 0.25%-near socket tick replace a dated PRE 0%', async () => {
    const { pickExtPrice } = await import('../src/utils/extWsTrust');
    const { liveDisplay } = await import('../src/utils/liveQuote');
    const monPre = '2026-10-19T12:00:00.000Z';
    const friTick = Date.parse('2026-10-16T23:59:00Z');
    const monTick = Date.parse('2026-10-19T12:00:30Z');
    // useLivePrice / computeOnePipe selector
    assert.deepEqual(pickExtPrice(99.8, 100, { wsTimeMs: friTick, serverTime: monPre }), { price: 100, fromWs: false });
    assert.deepEqual(pickExtPrice(99.8, 100, { wsTimeMs: 0, serverTime: monPre }), { price: 100, fromWs: false });
    assert.deepEqual(pickExtPrice(100.1, 100, { wsTimeMs: monTick, serverTime: monPre }), { price: 100.1, fromWs: true });
    assert.deepEqual(pickExtPrice(99.8, 100), { price: 100, fromWs: false }); // no server time: keep the server price
    // computeOnePipe (dashboard/web) with the real function text
    const pipeSrc = read('src/hooks/useOnePipe.ts');
    const sf = ts.createSourceFile('pipe.ts', pipeSrc, ts.ScriptTarget.Latest, true);
    const fn = (name: string) => {
        let text = '';
        sf.forEachChild(n => { if (ts.isFunctionDeclaration(n) && n.name?.text === name) text = n.getText(sf).replace(/^export\s+/, ''); });
        return text;
    };
    const js = ts.transpileModule(`${fn('round2')}\n${fn('computeOnePipe')}\nmodule.exports = computeOnePipe;`,
        { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const PA = require('../src/lib/priceAcceptance');
    const box: any = { module: { exports: {} }, pickExtPrice, ownSessionBaseline: PA.ownSessionBaseline, tradeInLaneWindow: PA.tradeInLaneWindow, etDateOf: require('../src/lib/marketCalendar').etDateOf };
    vm.runInNewContext(js, box);
    const pipe = box.module.exports;
    const base = { session: 'PRE', pollPrice: 100, pollPrevClose: 98, pollExtPrice: 100, pollExtLabel: 'PRE',
        pollChangePct: 200 / 98, regularCloseToday: null, pollExtTime: monPre };
    const stale = pipe({ ...base, wsPrice: 99.8, wsTimeMs: friTick });
    assert.equal(stale.extPrice, 100); assert.equal(stale.extChangePct, 0); assert.equal(stale.source, 'POLL');
    const fresh = pipe({ ...base, wsPrice: 100.1, wsTimeMs: monTick });
    assert.equal(fresh.extPrice, 100.1); assert.equal(fresh.source, 'WS');
    // list rows (useLiveQuotes → liveDisplay)
    const rest = { price: 100, previousClose: 98, changePercent: 200 / 98, extendedPrice: 100, extendedChangePercent: 0,
        extendedLabel: 'PRE', extendedTime: monPre, session: 'pre' };
    const nowMs = monTick + 60_000;   // 고정 시계(월 08:01 ET) — 실행 시각에 따라 «미래 체결»이 되지 않게
    const old = liveDisplay(rest, { price: 99.8, changePct: 0, ts: nowMs, priceTime: friTick }, { wsConnected: true, nowMs });
    assert.equal(old!.price, 100); assert.equal(old!.changePct, 0); assert.equal(old!.live, false);
    const now = liveDisplay(rest, { price: 100, changePct: 0, ts: nowMs, priceTime: monTick }, { wsConnected: true, nowMs });
    assert.equal(now!.price, 100); assert.equal(now!.changePct, 0); assert.equal(now!.live, true);
});

// ── Gate 5 (10/19 16:25): web dashboard store + native Intel overlay pass trade times to computeOnePipe ──
test('gate 5: dashboard store and Intel overlay keep Monday PRE 100 (0%) against a stale Friday socket 99.8', async () => {
    const { pickExtPrice } = await import('../src/utils/extWsTrust');
    const monPre = '2026-10-19T12:00:00.000Z';
    const friTick = Date.parse('2026-10-16T23:59:00Z');
    const monTick = Date.parse('2026-10-19T12:00:30Z');
    const quoteRow = { price: 100, previousClose: 98, prevClose: 98, changePercent: 200 / 98, extendedPrice: 100,
        extendedChangePercent: 0, extendedLabel: 'PRE', extendedTime: monPre, session: 'pre' };
    const compile = (src: string) => ts.transpileModule(src, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const loadMod = (file: string, deps: Record<string, any>, globals: any = {}) => {
        const exports = {};
        const ctx = vm.createContext({ exports, module: { exports }, console: { log() {}, warn() {}, error() {} }, Date,
            require: (name: string) => { assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`); return deps[name]; },
            ...globals });
        vm.runInContext(compile(read(file)), ctx);
        return (ctx as any).module.exports;
    };
    const pipeMod = loadMod('src/hooks/useOnePipe.ts', { react: {}, swr: {}, '@/providers/WebSocketProvider': {},
        '@/hooks/useMarketStatus': {}, '@/utils/extWsTrust': { pickExtPrice },
        '@/lib/sourceStamp': require('../src/lib/sourceStamp'), '@/lib/marketCalendar': require('../src/lib/marketCalendar'),
        '@/lib/priceAcceptance': require('../src/lib/priceAcceptance') });
    const store = loadMod('src/stores/dashboardStore.ts', {
        zustand: require('zustand'), 'zustand/middleware': { persist: (init: any) => init },
        '@/hooks/useOnePipe': pipeMod, '@/lib/storage/dashboardTickerStore': {},
        '@/lib/impliedMove': { copyImpliedMoveGroup: () => ({}) }, '@/lib/vwap': { normalizeVwap: (v: any) => v },
        '@/lib/priceAcceptance': require('../src/lib/priceAcceptance'),
    }, { fetch: async (url: string) => {
        assert.ok(url.startsWith('/api/live/quotes?'), 'no network: quotes fixture only');
        return { ok: true, json: async () => ({ data: { XLK: quoteRow }, session: 'pre', timestamp: monTick }) };
    } }).useDashboardStore;
    // Gate 6: SSR initialization, before the first price poll. A fresh tick also
    // proves extendedTime survived hydration, rather than only testing the fallback.
    store.getState().initializeStore(['XLK'], { XLK: quoteRow });
    assert.equal(store.getState().tickers.XLK.extended.extTime, monPre);
    store.getState().updateRealtimePrice('XLK', 99.8, 0, friTick);
    assert.equal(store.getState().tickers.XLK.extended.prePrice, 100);
    assert.equal(store.getState().tickers.XLK.extended.preChangePct.toFixed(2), '0.00');
    store.getState().updateRealtimePrice('XLK', 100.1, 0, monTick);
    assert.equal(store.getState().tickers.XLK.extended.prePrice, 100.1);
    await store.getState().fetchPriceOnly(['XLK']);
    assert.equal(store.getState().tickers.XLK.extended.prePrice, 100);
    assert.equal(store.getState().tickers.XLK.extended.preChangePct, 0);
    store.getState().updateRealtimePrice('XLK', 99.8, 0, friTick);
    assert.equal(store.getState().tickers.XLK.extended.prePrice, 100);
    assert.equal(store.getState().tickers.XLK.extended.preChangePct, 0);
    store.getState().updateRealtimePrice('XLK', 100.1, 0, monTick);
    assert.equal(store.getState().tickers.XLK.extended.prePrice, 100.1);
    store.getState().updateRealtimePrice('XLK', 99.9, 0, monTick - 10_000); // older than the adopted tick
    assert.equal(store.getState().tickers.XLK.extended.prePrice, 100.1);

    // Native Intel: real poll updater (records extendedTime) + real WS overlay arrow function.
    const hookSrc = read('src/hooks/useIntelSharedData.ts');
    const sf = ts.createSourceFile('intel.ts', hookSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const find = (root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node => {
        let hit: ts.Node | undefined;
        const walk = (n: ts.Node) => { if (!hit && pred(n)) hit = n; if (!hit) ts.forEachChild(n, walk); };
        walk(root); assert.ok(hit); return hit!;
    };
    const varInit = (root: ts.Node, name: string) => (find(root, n => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)
        && n.name.text === name) as ts.VariableDeclaration);
    const fnText = (name: string) => find(sf, n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(sf);
    const make = (code: string, names: string[]) => {
        const box: any = { module: { exports: null } };
        vm.runInNewContext(compile(`module.exports = function(${names.join(',')}) { ${code} };`), box);
        return box.module.exports;
    };
    const missing = await import('../src/lib/app/intelMissing');
    const computeOnePipe = pipeMod.computeOnePipe;
    const priceFn = varInit(sf, 'fetchPriceOnly');
    const update = make(`const ${varInit(priceFn, 'toSession').getText(sf)};\nreturn (${varInit(priceFn, 'updateFn').initializer!.getText(sf)});`,
        ['priceMap', 'computeOnePipe', 'setMissingField', 'sameMissingFields', 'serverRegularPriceUsable'])(
        { XLK: quoteRow }, computeOnePipe, missing.setMissingField, missing.sameMissingFields, require('../src/lib/priceAcceptance').serverRegularPriceUsable);
    const [polled] = update([{ ticker: 'XLK', price: 100, changePct: 200 / 98, prevClose: 98, extendedPrice: 0,
        extendedChangePct: 0, extendedLabel: '', session: 'pre' }]);
    assert.equal(polled.extendedPrice, 100);
    assert.equal(polled.extendedTime, monPre);
    const normalizeSession = make(`${fnText('normalizeSession')}\nreturn normalizeSession;`, [])();
    const overlay = (ws: Map<string, any>) => make(`return (${varInit(sf, 'overlay').initializer!.getText(sf)});`,
        ['wsPrices', 'computeOnePipe', 'normalizeSession', 'setMissingField', 'sameMissingFields'])(
        ws, computeOnePipe, normalizeSession, missing.setMissingField, missing.sameMissingFields);
    // Gate 6: actual fast API price projection -> initial native overlay; no price poll.
    const initial = fastInitialRow('PRE', { day: { c: 100 }, prevDay: { c: 98 },
        lastTrade: { p: 100, t: Date.parse(monPre) * 1e6 } });
    assert.equal(initial.extendedTime, monPre);
    const [initialStale] = overlay(new Map([['XLK', { price: 99.8, priceTime: friTick }]]))([initial]);
    assert.equal(initialStale.extendedPrice, 100);
    assert.equal(initialStale.extendedChangePct.toFixed(2), '0.00');
    const [initialFresh] = overlay(new Map([['XLK', { price: 100.1, priceTime: monTick }]]))([initial]);
    assert.equal(initialFresh.extendedPrice, 100.1);
    const [undated] = overlay(new Map([['XLK', { price: 99.8, priceTime: friTick }]]))([{ ...initial, extendedTime: null }]);
    assert.equal(undated.extendedPrice, 100);
    assert.equal(undated.extendedChangePct, 0);
    const [stale] = overlay(new Map([['XLK', { price: 99.8, changePct: 0, priceTime: friTick }]]))([polled]);
    assert.equal(stale.extendedPrice, 100); assert.equal(stale.extendedChangePct, 0);
    const [fresh] = overlay(new Map([['XLK', { price: 100.1, changePct: 0, priceTime: monTick }]]))([polled]);
    assert.equal(fresh.extendedPrice, 100.1);
});

// Execute the production fast route's price-selection statements and actual JSON
// properties. Options/cache/provider work is excluded, with no network or env reads.
function fastInitialRow(session: string, snap: any, close?: any, recon?: any) {
    const source = read('src/app/api/intel/fast/route.ts');
    const sf = ts.createSourceFile('fast.ts', source, ts.ScriptTarget.Latest, true);
    let start: ts.VariableStatement | undefined;
    const walk = (n: ts.Node) => {
        if (ts.isVariableStatement(n) && n.getText(sf).startsWith('const prevClose = snap?.prevDay?.c')) start = n;
        ts.forEachChild(n, walk);
    };
    walk(sf); assert.ok(start);
    const block = start.parent as ts.Block;
    const from = block.statements.indexOf(start);
    const to = block.statements.findIndex(n => ts.isVariableStatement(n) && n.getText(sf).startsWith('const analysis ='));
    assert.ok(to > from);
    const ret = block.statements.find(ts.isReturnStatement)!;
    const fields = new Set(['ticker', 'price', 'changePct', 'prevClose', 'extendedPrice', 'extendedChangePct', 'extendedLabel', 'extendedTime', 'priceTime', 'session']);
    const props = (ret.expression as ts.ObjectLiteralExpression).properties.filter(p => p.name && fields.has(p.name.getText(sf)));
    const extSf = ts.createSourceFile('ext.ts', read('src/services/extendedSessionClose.ts'), ts.ScriptTarget.Latest, true);
    const helpers = extSf.statements.filter(n => ts.isFunctionDeclaration(n)
        && ['isTradeInExtSession', 'pickRegularPreClose'].includes(n.name?.text || '')).map(n => n.getText(extSf).replace(/^export\s+/, ''));
    const code = [...helpers, ...block.statements.slice(from, to).map(n => n.getText(sf)),
        `module.exports = { ${props.map(p => p.getText(sf)).join(',')} };`].join('\n');
    const box: any = { module: { exports: null }, Date, ...calendar, snap, session, ticker: 'XLK', cached: null,
        aggMap: {}, todayET: '2026-10-19', shownDate: '2026-10-19', extCloseMap: { XLK: close },
        preRecallMap: {}, reconMap: { XLK: recon }, rememberProvisionalPreClose() {} };
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS } }).outputText, box);
    return box.module.exports;
}

test('gate 6: fast response timestamps belong to the selected price in every session', () => {
    const pre = '2026-10-19T12:00:00.000Z', post = '2026-10-19T21:00:00.000Z';
    const snapshot = (time: string) => ({ day: { c: 100 }, prevDay: { c: 98 }, lastTrade: { p: 100, t: Date.parse(time) * 1e6 } });
    for (const [session, time] of [['PRE', pre], ['POST', post], ['CLOSED', post]]) {
        const row = fastInitialRow(session, snapshot(time));
        assert.equal(row.extendedTime, time);
        assert.equal(row.priceTime, null);
        assert.equal(row.extendedChangePct, 0);
    }
    const final = { price: 100.2, date: '2026-10-19', time: post };
    assert.equal(fastInitialRow('CLOSED', snapshot(pre), final).extendedTime, post);
    assert.equal(fastInitialRow('REG', snapshot(pre), { ...final, time: pre }).extendedTime, pre);
    const regularMs = Date.parse('2026-10-19T14:00:00Z');
    assert.equal(fastInitialRow('REG', { ...snapshot(pre), priceTime: regularMs }).priceTime, regularMs);
    assert.equal(fastInitialRow('REG', snapshot(pre)).priceTime, Date.parse(pre));
    assert.equal(fastInitialRow('PRE', snapshot('2026-10-16T23:59:00Z')).extendedTime, null);
    assert.equal(fastInitialRow('CLOSED', { prevDay: { c: 98 } }, final,
        { regClose: 100, changePct: 0, postPrice: 100.1, postChangePct: 0.1 }).extendedTime, null);
});
