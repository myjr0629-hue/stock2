import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
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
function indexRoute(store: Map<string, any>, failed = new Set<string>()) {
    return load('src/app/api/market/index-close/route.ts', {
        'next/server': { NextResponse: { json: plain } },
        '@/services/redisClient': { getFromCache: async (key: string) => {
            if (failed.has(key)) throw new Error('read failed');
            return store.get(key) ?? null;
        } },
        '@/services/yahooFinanceHub': { YAHOO_CACHE_KEYS: keys },
        '@/lib/indexCloseSnapshot': indexSnapshots,
    });
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

test('collector: missing baseline is unavailable; actual zero survives failed secondary daily data', async () => {
    for (const symbol of ['^IXIC', '^DJI', '^GSPC']) {
        for (const previousClose of [undefined, 100]) {
            const calls: string[] = [];
            const collector = load('src/app/api/cron/market-feed/route.ts', {
                'next/server': {}, '@/services/redisClient': {},
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

test('collector: only valid cash-index observations enter the durable cache, without TTL', async () => {
    const src = read('src/app/api/cron/market-feed/route.ts');
    const ast = ts.createSourceFile('route.ts', src, ts.ScriptTarget.Latest, true);
    let block: ts.IfStatement | undefined;
    function visit(n: ts.Node) {
        if (ts.isIfStatement(n) && n.expression.getText(ast).includes('REAL_INDEX_SYMBOLS.has(yahoo)')) block = n;
        ts.forEachChild(n, visit);
    }
    visit(ast);
    assert.ok(block);
    const body = ts.transpile(block!.getText(ast), { target: ts.ScriptTarget.ES2020 });
    const execute = new Function('yahoo', 'quote', 'key', 'setInCache', 'REAL_INDEX_SYMBOLS', 'indexCloseSnapshot', 'indexLastGoodKey',
        `return (async () => { ${body} })();`);
    for (const [symbol, q, count] of [['^DJI', quote({ changePct: 0 }), 1], ['^DJI', quote({ changePct: undefined }), 0],
        ['^DJI', quote({ marketTime: undefined }), 0], ['NQ=F', quote(), 0]] as any[]) {
        const writes: any[] = [];
        await execute(symbol, q, 'dow', (...args: any[]) => { writes.push(args); }, new Set(['^DJI', '^IXIC', '^GSPC']),
            indexSnapshots.indexCloseSnapshot, indexSnapshots.indexLastGoodKey);
        assert.equal(writes.length, count);
        if (count) { assert.equal(writes[0].length, 2); assert.equal(writes[0][1], q); }
    }
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
            '@/lib/marketCalendar': calendar, '@/lib/bulkQuoteClose': {}, '@/lib/hubLiveOverlay': {},
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
