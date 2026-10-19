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
function load(file: string, overrides: Record<string, any> = {}, globals: Record<string, any> = {}): any {
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
    vm.runInContext(ts.transpileModule(read(file), { compilerOptions: {
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
function makeStore(quotes: any, unified: any = {}) {
    // In-memory zustand/persist substitutes: actual initializer/actions, no browser storage.
    const create = () => (initializer: any) => {
        let state: any;
        const set = (next: any) => { state = { ...state, ...(typeof next === 'function' ? next(state) : next) }; };
        state = initializer(set, () => state);
        return { getState: () => state, setState: set };
    };
    return load('src/stores/dashboardStore.ts', {
        zustand: { create }, 'zustand/middleware': { persist: (x: any) => x },
        '@/hooks/useOnePipe': pipe, '@/lib/storage/dashboardTickerStore': {},
    }, { fetch: async (url: string) => {
        assert.ok(url.startsWith('/api/live/quotes?') || url.startsWith('/api/dashboard/unified?'));
        return { ok: true, json: async () => url.startsWith('/api/live/quotes?')
            ? { data: quotes } : { tickers: unified } };
    } });
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
    const quote = { price: 100, previousClose: 98, changePercent: fridayPct,
        session: 'pre', extendedPrice: 100, extendedChangePercent: 0, extendedLabel: 'PRE' };
    for (const mode of ['SSR', 'poll', 'unified', 'single']) {
        await test(`PRE ${mode}: Thu98 Fri100 MonPRE100 -> main100 PRE0`, async () => {
            const { useDashboardStore: store } = makeStore({ TEST: quote }, {
                TEST: { underlyingPrice: 100, prevClose: 98, changePercent: fridayPct, session: 'PRE' },
            });
            const state = () => store.getState();
            if (mode === 'SSR') state().initializeStore(['TEST'], { TEST: quote });
            if (mode === 'poll') await state().fetchPriceOnly(['TEST']);
            if (mode === 'unified' || mode === 'single') {
                // Rehydration preserves structural baseline while prices are absent.
                store.setState({ tickers: { TEST: { underlyingPrice: null, prevRegularClose: 98, prevClose: 98, session: 'CLOSED' } } });
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
