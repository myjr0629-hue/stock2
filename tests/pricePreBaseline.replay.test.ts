/** Offline replay: actual store actions -> actual mobile display expressions.
 * Run: node node_modules/ts-node/dist/bin.js --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' tests/pricePreBaseline.replay.test.ts
 * --baseline reads origin/main without modifying the worktree.
 * --snapshots-dir=<path> adds saved REG API responses; no network or env files are read.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = path.join(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const read = (file: string): string => baseline
    ? execFileSync('git', ['show', `origin/main:${file}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, file), 'utf8');
const modules = new Map<string, any>();
function load(file: string, overrides: Record<string, any> = {}, globals: Record<string, any> = {}, source = read(file)): any {
    const exports = {};
    const ctx = vm.createContext({ exports, module: { exports }, console, Date, AbortController,
        require(name: string) {
            if (Object.hasOwn(overrides, name)) return overrides[name];
            if (name.startsWith('.') || name.startsWith('@/')) {
                const target = name.startsWith('@/') ? `src/${name.slice(2)}.ts`
                    : path.posix.normalize(path.posix.join(path.posix.dirname(file), name + '.ts'));
                if (!modules.has(target)) modules.set(target, load(target));
                return modules.get(target);
            }
            throw new Error(`Unexpected dependency: ${name}`);
        }, ...globals });
    vm.runInContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
    } }).outputText, ctx, { filename: file });
    return (ctx as any).module.exports;
}
const pipe = load('src/hooks/useOnePipe.ts', {
    react: {}, swr: {}, '@/providers/WebSocketProvider': {}, '@/hooks/useMarketStatus': {},
});
const { calcPriceDisplay } = load('src/utils/calcPriceDisplay.ts');
const backdrop = load('src/lib/marketBackdrop.ts');
const { etWallTimeToMs } = load('src/lib/marketSession.ts');
// Execute the production daily-bar reader and response builder, with all I/O in memory.
// Extract declarations to avoid the route's cache warmer and unrelated providers.
async function unifiedFromBars(close: number, date: string | null, cached = false, session = 'PRE', analysis = false) {
    const file = 'src/app/api/dashboard/unified/route.ts';
    const source = read(file);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const builder = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildResponseFromResults');
    const analysisBuilder = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildResponseFromAnalysisCache');
    assert.ok(builder);
    assert.ok(analysisBuilder);
    const daily = source.slice(source.indexOf('type PrevDayEntry'), source.indexOf('// [AWS-FIRST]'));
    const pct = (close - 98) / 98 * 100;
    const api = load(file, {
        '@/app/api/live/quotes/route': { GET: async () => ({ json: async () => ({ data: {
            TEST: { price: 99, previousClose: 98, session: session === 'REG' ? 'regular' : session.toLowerCase() },
        } }) }) },
        '@/lib/aws/priceCacheStore': { getLatestPricesBatch: async () => new Map([['TEST', { close: 99, vwap: 99 }]]) },
    }, {
        NextRequest: class { constructor(_url: string) {} },
        setTimeout: () => 0, // the winning in-memory response needs no timeout timer
        selectVwap: load('src/lib/vwap.ts').selectVwap,
        getFromCache: async (key: string) => cached && key.startsWith('prev-day-pct:')
            ? { close, prevClose: 98, changePct: pct, ...(date ? { date } : {}) } : null,
        setInCache: async () => true,
        // Same UTC midnight day label as intrinioClient.getDailyAggregates, never receipt time.
        fetchMassive: async () => ({ results: [{ c: close, t: date ? Date.parse(`${date}T00:00:00Z`) : undefined }, { c: 98 }] }),
        readImpliedMoveFields: () => ({}), calculateWhaleIndex: () => null,
        calculateAlphaScore: () => ({ pillars: Object.fromEntries(['momentum', 'structure', 'flow', 'regime', 'catalyst'].map(k => [k, { score: 0 }])) }),
        recordAlphaDaily: () => {}, getDashboardSmartTTL: () => ({ memoryMs: 1000 }),
    }, `${daily}\n${builder.getText(ast)}\n${analysisBuilder.getText(ast)}\nexports.build = buildResponseFromResults;\nexports.analysis = buildResponseFromAnalysisCache;`);
    const response = analysis
        ? await api.analysis(['TEST'], { TEST: { shortVolPct: 1, darkPoolPct: 1, vwap: 99 } }, null)
        : await api.build([{ ticker: 'TEST', error: null, data: {
            underlyingPrice: 99, prevClose: 98, changePercent: pct, session,
        } }], null);
    return response.tickers;
}
// Execute every calcPriceDisplay call used by the mobile dashboard header/drawer/card.
const displays: Array<(data: any) => any> = [];
for (const file of ['src/components/mobile/MobileDashboardShell.tsx', 'src/components/mobile/MobileDashboardClient.tsx']) {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const vars: string[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && ['extSession', 'extPriceVal', 'extPctVal', 'extLabelVal'].includes(node.name.getText(ast))) vars.push(`const ${node.getText(ast)};`);
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'calcPriceDisplay') {
            const code = [...vars, node.getText(ast)].join('\n');
            displays.push(data => vm.runInNewContext(code, { data, calcPriceDisplay }));
        }
        ts.forEachChild(node, visit);
    };
    visit(ast);
}
assert.equal(displays.length, 3);
// 시계 고정: 월 2026-10-19 08:00 ET(PRE) — 달력상 직전 정규장 = 금 2026-10-16.
const MON_PRE = '2026-10-19T12:00:00Z';
function clockAt(iso: string): DateConstructor {
    const fixed = Date.parse(iso);
    class FakeDate extends Date {
        constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(fixed); }
        static now() { return fixed; }
    }
    return FakeDate as unknown as DateConstructor;
}
function makeStore(quotes: any, unified: any = {}, nowIso = MON_PRE) {
    let persistence: any;
    // In-memory zustand/persist substitutes: actual initializer/actions, no browser storage.
    const create = () => (initializer: any) => {
        let state: any;
        const set = (next: any) => { state = { ...state, ...(typeof next === 'function' ? next(state) : next) }; };
        state = initializer(set, () => state);
        return { getState: () => state, setState: set };
    };
    const loaded = load('src/stores/dashboardStore.ts', {
        zustand: { create }, 'zustand/middleware': { persist: (x: any, options: any) => { persistence = options; return x; } },
        '@/hooks/useOnePipe': pipe, '@/lib/storage/dashboardTickerStore': {},
    }, { Date: clockAt(nowIso), fetch: async (url: string) => {
        assert.ok(url.startsWith('/api/live/quotes?') || url.startsWith('/api/dashboard/unified?'));
        return { ok: true, json: async () => url.startsWith('/api/live/quotes?')
            ? { data: quotes } : { tickers: unified } };
    } });
    return { ...loaded, persistence };
}
let passed = 0;
const failed: string[] = [];
async function test(name: string, fn: () => any) {
    try { await fn(); passed++; }
    catch (e) { failed.push(name); console.error(`FAIL ${name}: ${(e as Error).message}`); }
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function expectDisplay(row: any, price: number, pct: number, ext?: number) {
    for (const display of displays) {
        const output = display(row);
        near(output.displayPrice, price);
        near(output.displayChangePct, pct);
        if (ext != null) { near(output.activeExtPct, ext); assert.equal(output.activeExtPctKnown, true); }
    }
}
async function main() {
    const fridayPct = (100 - 98) / 98 * 100;
    for (const analysis of [false, true]) {
        await test(`PRE ${analysis ? 'analysis' : 'structure'} response preserves UTC daily-bar date`, async () => {
            const rows = await unifiedFromBars(100, '2026-10-16', false, 'PRE', analysis);
            assert.equal(rows.TEST.regularCloseDate, '2026-10-16');
            for (const mode of ['unified', 'single']) {
                const { useDashboardStore: store } = makeStore({}, rows);
                if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
                else await store.getState().fetchSingleTicker('TEST');
                expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
            }
        });
        for (const session of ['REG', 'POST', 'CLOSED']) await test(`${session} ${analysis ? 'analysis' : 'structure'} response has no PRE metadata`, async () => {
            const rows = await unifiedFromBars(100, '2026-10-16', false, session, analysis);
            assert.equal(rows.TEST.session, session);
            // 일봉 거래일은 세션과 무관하게 싣는다(클라이언트는 PRE 에서만 쓴다) — 가격 필드는 그대로.
            assert.equal(rows.TEST.regularCloseDate, '2026-10-16');
            near(rows.TEST.underlyingPrice, 99);
            near(rows.TEST.prevRegularClose, 98);
        });
    }
    for (const mode of ['unified', 'single']) {
        for (const analysis of [false, true]) for (const cached of [false, true]) {
            await test(`gate 10200458 ${mode} ${analysis ? 'analysis' : 'structure'} ${cached ? 'cache' : 'bars'}: undated persisted100 prev98`, async () => {
                const rows = await unifiedFromBars(100, '2026-10-16', cached, 'PRE', analysis);
                const { useDashboardStore: store, persistence } = makeStore({}, rows);
                store.setState({ tickers: { TEST: { underlyingPrice: 100, prevRegularClose: 100,
                    prevClose: 98, changePercent: fridayPct, prevChangePct: fridayPct,
                    intradayChangePct: fridayPct, session: 'POST' } } });
                // Run the real persistence adapter: baseline survives, volatile rates do not.
                const saved = persistence.partialize(store.getState());
                assert.equal(saved.tickers.TEST.prevRegularCloseDate, undefined);
                assert.equal(saved.tickers.TEST.prevChangePct, null);
                store.setState(persistence.merge(saved, store.getState()));
                if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
                else await store.getState().fetchSingleTicker('TEST');
                const row = store.getState().tickers.TEST;
                expectDisplay(row, 100, fridayPct);
                near(row.prevRegularClose, 100);
                near(row.prevClose, 98);
                near(row.prevChangePct, fridayPct);
                near(row.intradayChangePct, fridayPct);
                assert.equal(row.prevRegularCloseDate, undefined);
            });
        }
        await test(`gate 10200506 ${mode}: Fri POST saved (prevRegularClose=98) -> Mon PRE unified first -> quotes -> WS`, async () => {
            const quoteNow = { price: 100, previousClose: 98, changePercent: fridayPct, session: 'pre',
                extendedPrice: 100.5, extendedChangePercent: 0.5, extendedLabel: 'PRE' };
            const { useDashboardStore: store, persistence } = makeStore({ TEST: quoteNow }, await unifiedFromBars(100, '2026-10-16'));
            // 금요일 POST 의 실제 폴링 결과를 저장 → 복원(날짜 없음 · prevRegularClose = 목요일 98)
            store.setState({ tickers: { TEST: { underlyingPrice: 100, regularCloseToday: 100, prevRegularClose: 98,
                prevClose: 98, changePercent: fridayPct, prevChangePct: fridayPct, intradayChangePct: fridayPct, session: 'POST' } } });
            const saved = persistence.partialize(store.getState());
            assert.equal(saved.tickers.TEST.prevRegularClose, null); // 세션 의존 기준가는 저장하지 않는다
            assert.equal(saved.tickers.TEST.prevClose, null);
            store.setState(persistence.merge(saved, store.getState()));
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
            await store.getState().fetchPriceOnly(['TEST']);
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct, 0.5);
            near(store.getState().tickers.TEST.prevChangePct, fridayPct);
            store.getState().updateRealtimePrice('TEST', 100.5);
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct, 0.5);
            // 30초 뒤 unified 재수신도 쌍을 바꾸지 않는다
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct, 0.5);
        });
        for (const [date, label] of [['2026-10-15', 'stale(Thu)'], ['2026-10-19', 'future(Mon partial)'], [null, 'undated']] as const) {
            await test(`PRE ${mode}: unverified daily bar ${label} never seeds price; quotes decide`, async () => {
                const stalePct = (97 - 98) / 98 * 100;
                const quoteNow = { price: 100, previousClose: 98, changePercent: fridayPct, session: 'pre' };
                const { useDashboardStore: store, persistence } = makeStore({ TEST: quoteNow }, await unifiedFromBars(97, date));
                // 관문 10200716 #1: 금 POST 저장값(prevRegularClose=98)을 실제 저장·복원 경로로
                store.setState({ tickers: { TEST: { underlyingPrice: 100, regularCloseToday: 100, prevRegularClose: 98, prevClose: 98, session: 'POST' } } });
                store.setState(persistence.merge(persistence.partialize(store.getState()), store.getState()));
                if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
                else await store.getState().fetchSingleTicker('TEST');
                const row = store.getState().tickers.TEST;
                assert.equal(row.underlyingPrice, null);
                // 확인 안 된 기준가는 화면에 없다(결측 대기 — 카드는 mainPrice>0 일 때만 가격을 그린다)
                for (const display of displays) assert.equal(display(row).displayPrice, 0);
                if (date) assert.equal(row.prevChangePct ?? null, null);
                await store.getState().fetchPriceOnly(['TEST']);
                expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
                // 다음 unified(다른 날 일봉)가 와도 quotes 의 쌍이 유지된다
                if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
                else await store.getState().fetchSingleTicker('TEST');
                expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
                assert.notEqual(store.getState().tickers.TEST.prevChangePct, stalePct);
            });
        }
        for (const cached of [false, true]) await test(`gate 10200438 ${mode} ${cached ? 'cache' : 'bars'}: stored100 structure99 daily100`, async () => {
            const { useDashboardStore: store } = makeStore({}, await unifiedFromBars(100, '2026-10-16', cached));
            store.setState({ tickers: { TEST: { underlyingPrice: null, prevRegularClose: 100, prevClose: 98, session: 'CLOSED' } } });
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
            assert.equal(store.getState().tickers.TEST.underlyingPrice, 100);
        });
        await test(`gate 10200716 #2 ${mode}: cached CLOSED unified cannot overwrite PRE quotes pair`, async () => {
            const quoteNow = { price: 100, previousClose: 98, changePercent: fridayPct, session: 'pre' };
            const stale = await unifiedFromBars(99, '2026-10-15', false, 'CLOSED'); // 다른 날 일봉 · CLOSED 캐시
            const { useDashboardStore: store } = makeStore({ TEST: quoteNow }, stale);
            await store.getState().fetchPriceOnly(['TEST']);
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
        });
        await test(`gate 10200716 #3 ${mode}: PRE rate does not linger into a flat POST`, async () => {
            const q: any = { price: 100, previousClose: 98, changePercent: fridayPct, session: 'pre' };
            const { useDashboardStore: store } = makeStore({ TEST: q });
            await store.getState().fetchPriceOnly(['TEST']);
            Object.assign(q, { price: 100, previousClose: 100, changePercent: 0, session: 'regular' });
            await store.getState().fetchPriceOnly(['TEST']);
            Object.assign(q, { session: 'post' });
            await store.getState().fetchPriceOnly(['TEST']);
            expectDisplay(store.getState().tickers.TEST, 100, 0);
        });
        await test(`gate 10200728 #1 ${mode}: earlier CLOSED unified pct cannot outlive PRE quotes pair (+WS)`, async () => {
            const quoteNow = { price: 100, previousClose: 98, changePercent: fridayPct, session: 'pre', extendedPrice: 100.5, extendedLabel: 'PRE', extendedChangePercent: 0.5 };
            const closedOld = await unifiedFromBars(99, '2026-10-16', false, 'CLOSED'); // +1.02%
            const { useDashboardStore: store } = makeStore({ TEST: quoteNow }, closedOld);
            store.setState({ tickers: { TEST: { underlyingPrice: null, session: 'CLOSED' } } });
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            await store.getState().fetchPriceOnly(['TEST']);
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct, 0.5);
            store.getState().updateRealtimePrice('TEST', 100.5);
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct, 0.5);
        });
        await test(`gate 10200728 #2 ${mode}: verified PRE seed -> REG -> flat POST shows 0.00%`, async () => {
            const q: any = { price: 100, previousClose: 98, changePercent: fridayPct, session: 'pre' };
            const { useDashboardStore: store } = makeStore({ TEST: q }, await unifiedFromBars(100, '2026-10-16'));
            store.setState({ tickers: { TEST: { underlyingPrice: null, session: 'CLOSED' } } });
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
            Object.assign(q, { price: 100, previousClose: 100, changePercent: 0, session: 'regular' });
            await store.getState().fetchPriceOnly(['TEST']);
            Object.assign(q, { session: 'post' });
            await store.getState().fetchPriceOnly(['TEST']);
            expectDisplay(store.getState().tickers.TEST, 100, 0);
        });
        await test(`gate 10200739 #2 ${mode}: same-date unified with a different close cannot replace the PRE quotes pair`, async () => {
            const quoteNow = { price: 100, previousClose: 98, changePercent: fridayPct, session: 'pre' };
            const { useDashboardStore: store } = makeStore({ TEST: quoteNow }, await unifiedFromBars(99, '2026-10-16'));
            await store.getState().fetchPriceOnly(['TEST']);
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
        });
        await test(`PRE ${mode}: early close Fri 2026-11-27 13:00 ET is the Monday PRE baseline`, async () => {
            const { useDashboardStore: store } = makeStore({}, await unifiedFromBars(100, '2026-11-27'), '2026-11-30T13:00:00Z');
            store.setState({ tickers: { TEST: { underlyingPrice: null, prevRegularClose: 98, prevClose: 98, session: 'CLOSED' } } });
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
        });
        await test(`PRE ${mode}: Tue PRE after Mon holiday uses Fri (2026-09-04 → 09-08)`, async () => {
            const { useDashboardStore: store } = makeStore({}, await unifiedFromBars(100, '2026-09-04'), '2026-09-08T12:00:00Z');
            store.setState({ tickers: { TEST: { underlyingPrice: null, session: 'CLOSED' } } });
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            expectDisplay(store.getState().tickers.TEST, 100, fridayPct);
        });
        await test(`PRE ${mode}: real flat day (0.00%) stays 0 not missing`, async () => {
            const { useDashboardStore: store } = makeStore({}, await unifiedFromBars(98, '2026-10-16'));
            store.setState({ tickers: { TEST: { underlyingPrice: null, session: 'CLOSED' } } });
            if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
            else await store.getState().fetchSingleTicker('TEST');
            const row = store.getState().tickers.TEST;
            expectDisplay(row, 98, 0);
            assert.equal(row.prevChangePct, 0);
        });
    }
    for (const sess of ['post', 'closed']) await test(`gate 10200739 #1 ${sess}: locked close keeps its own rate when quotes move`, async () => {
        const q: any = { price: 100, previousClose: 100, changePercent: 0, session: sess };
        const { useDashboardStore: store } = makeStore({ TEST: q }, {}, '2026-10-19T22:30:00Z');
        await store.getState().fetchPriceOnly(['TEST']);
        expectDisplay(store.getState().tickers.TEST, 100, 0);
        Object.assign(q, { price: 102, changePercent: 2 });
        await store.getState().fetchPriceOnly(['TEST']);
        const row = store.getState().tickers.TEST;
        for (const display of displays) { const o = display(row); near(o.displayChangePct, (o.displayPrice - 100) / 100 * 100); }
    });
    for (const sess of ['post', 'closed']) await test(`gate 10200748 #1 ${sess}: SSR re-entry keeps locked close pair`, async () => {
        const q: any = { price: 100, previousClose: 100, changePercent: 0, session: sess };
        const { useDashboardStore: store } = makeStore({ TEST: q }, {}, '2026-10-19T22:30:00Z');
        await store.getState().fetchPriceOnly(['TEST']);
        store.getState().initializeStore(['TEST'], { TEST: { ...q, price: 102, changePercent: 2 } });
        for (const display of displays) { const o = display(store.getState().tickers.TEST); near(o.displayChangePct, (o.displayPrice - 100) / 100 * 100); }
    });
    for (const mode of ['unified', 'single']) await test(`gate 10200748 #2 ${mode}: previous-day unified bar cannot overwrite POST locked pair`, async () => {
        const q: any = { price: 100, previousClose: 100, changePercent: 0, session: 'post' };
        const { useDashboardStore: store } = makeStore({ TEST: q }, await unifiedFromBars(102, '2026-10-16', false, 'POST'), '2026-10-19T22:30:00Z');
        await store.getState().fetchPriceOnly(['TEST']);
        if (mode === 'unified') await store.getState().fetchDashboardData(['TEST']);
        else await store.getState().fetchSingleTicker('TEST');
        expectDisplay(store.getState().tickers.TEST, 100, 0);
    });
    const quote = { price: 100, previousClose: 98, changePercent: fridayPct,
        session: 'pre', extendedPrice: 100, extendedChangePercent: 0, extendedLabel: 'PRE' };
    for (const mode of ['SSR', 'poll', 'unified', 'single']) {
        await test(`PRE ${mode}: Thu98 Fri100 MonPRE100 -> main100 PRE0`, async () => {
            const { useDashboardStore: store } = makeStore({ TEST: quote }, await unifiedFromBars(100, '2026-10-16'));
            const state = () => store.getState();
            if (mode === 'SSR') state().initializeStore(['TEST'], { TEST: quote });
            if (mode === 'poll') await state().fetchPriceOnly(['TEST']);
            if (mode === 'unified' || mode === 'single') {
                // Rehydration preserves structural baseline while prices are absent.
                store.setState({ tickers: { TEST: { underlyingPrice: null, prevRegularClose: 98,
                    prevClose: 98, session: 'CLOSED' } } });
                if (mode === 'unified') await state().fetchDashboardData(['TEST']);
                else await state().fetchSingleTicker('TEST');
            }
            expectDisplay(state().tickers.TEST, 100, fridayPct, mode === 'SSR' || mode === 'poll' ? 0 : undefined);
            await state().fetchPriceOnly(['TEST']);
            state().updateRealtimePrice('TEST', 99.8);
            expectDisplay(state().tickers.TEST, 100, fridayPct, -0.2);
            state().updateRealtimePrice('TEST', 100);
            expectDisplay(state().tickers.TEST, 100, fridayPct, 0);
        });
    }
    await test('PRE return: old locked close must not replace latest regular close on WS', () => {
        const { useDashboardStore: store } = makeStore({});
        store.setState({ tickers: { TEST: { underlyingPrice: 98, regularCloseToday: 98, prevRegularClose: 98, session: 'POST' } } });
        store.getState().initializeStore(['TEST'], { TEST: quote });
        store.getState().updateRealtimePrice('TEST', 99.8);
        const row = store.getState().tickers.TEST;
        near(row.underlyingPrice, 100);
        near(row.extended.preChangePct, -0.2);
        expectDisplay(row, 100, fridayPct, -0.2);
    });
    const snapshotArg = process.argv.find(s => s.startsWith('--snapshots-dir='));
    const snapshotDir = snapshotArg ? snapshotArg.split('=').slice(1).join('=')
        : path.join(__dirname, 'fixtures/price-pre-baseline');
    const snapshots = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'quotes-2310.json'), 'utf8'));
    for (const [symbol, q] of Object.entries(snapshots.data) as [string, any][]) {
        await test(`saved REG ${symbol}: SSR -> poll -> WS -> POST`, async () => {
            assert.equal(q.session, 'regular');
            const { useDashboardStore: store } = makeStore({ [symbol]: q });
            const state = () => store.getState();
            state().initializeStore([symbol], { [symbol]: q });
            expectDisplay(state().tickers[symbol], q.price, q.changePercent);
            await state().fetchPriceOnly([symbol]);
            expectDisplay(state().tickers[symbol], q.price, q.changePercent);
            state().updateRealtimePrice(symbol, q.price * 1.001);
            const wsPct = (q.price * 1.001 - q.previousClose) / q.previousClose * 100;
            expectDisplay(state().tickers[symbol], q.price * 1.001, wsPct);
            // POST is a simulation using saved prices; it is not an official close capture.
            q.session = 'post'; q.extendedPrice = q.price; q.extendedLabel = 'POST';
            await state().fetchPriceOnly([symbol]);
            expectDisplay(state().tickers[symbol], q.price, q.changePercent, 0);
        });
    }
    const input = (date: string, minutes: number, priceDate = date) => ({
        nowMs: etWallTimeToMs(date, minutes),
        nasdaq: { price: 100, changePct: 0, marketTime: new Date(etWallTimeToMs(priceDate, 780)).toISOString() },
        dow: null, spx: null, nq: null, es: null, us10y: null,
    });
    for (const date of ['2026-11-27', '2026-12-24', '2027-11-26']) {
        for (const minutes of [779, 780, 810, 960]) await test(`UC early close ${date} ${minutes}`, () => {
            const b = backdrop.buildBackdrop(input(date, minutes));
            assert.equal(b.clock.phase, minutes < 780 ? 'regular' : 'after-close');
            assert.equal(b.cash.live, minutes < 780);
            assert.ok(backdrop.calendarKey(etWallTimeToMs(date, minutes)).includes(b.clock.phase));
            const facts = backdrop.factsBlock(b);
            if (minutes >= 780) { assert.ok(facts.includes('CLOSED for the day at 13:00 ET')); assert.ok(!facts.includes('at 16:00 ET')); }
            else assert.ok(facts.includes('OPEN, trading LIVE now'));
        });
        await test(`UC ${date}: EOD delay preserves actual price date`, () => {
            const b = backdrop.buildBackdrop(input(date, 810, '2026-10-16'));
            assert.equal(b.cash.sessionDate, '2026-10-16');
            assert.ok(backdrop.factsBlock(b).includes('at 13:00 ET'));
        });
    }
    for (const [date, minutes, phase] of [
        ['2026-10-19', 510, 'pre-open'], ['2026-10-19', 570, 'regular'],
        ['2026-10-19', 959, 'regular'], ['2026-10-19', 960, 'after-close'],
        ['2026-10-18', 810, 'closed-day'], ['2026-11-26', 810, 'closed-day'],
    ] as const) await test(`UC normal/weekend/holiday ${date} ${minutes}`, () => {
        const b = backdrop.buildBackdrop(input(date, minutes));
        assert.equal(b.clock.phase, phase);
        if (phase === 'after-close') assert.ok(backdrop.factsBlock(b).includes('at 16:00 ET'));
    });
    console.log(`${baseline ? 'origin/main' : 'worktree'}: ${passed} passed, ${failed.length} failed`);
    if (failed.length) process.exitCode = 1;
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
