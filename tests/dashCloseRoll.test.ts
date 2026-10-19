/** Offline replay: original API JSON -> actual store -> actual component expressions.
 * --baseline is only for recording the unfixed implementation. No provider data is invented.
 * Boundary cases change the session/clock only; they are simulations, not production captures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { calcPriceDisplay, oneNumberFromQuote } from '../src/utils/calcPriceDisplay';
import { pickExtPrice } from '../src/utils/extWsTrust';
import { copyImpliedMoveGroup } from '../src/lib/impliedMove';
import { normalizeVwap } from '../src/lib/vwap';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const dir = 'tests/fixtures/dash-close-roll/';
const quotes = JSON.parse(read(dir + 'quotes-0601.json'));
const unified = JSON.parse(read(dir + 'dash-unified-0555.json'));
const official = read(dir + 'nasdaq-official-0601.jsonl').trim().split('\n').map(s => JSON.parse(s).data);
const baseline = process.argv.includes('--baseline');
const clone = (v: any) => JSON.parse(JSON.stringify(v));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const compile = (s: string) => ts.transpileModule(s, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText;
function load(file: string, deps: Record<string, any>, globals: any = {}) {
    const exports = {};
    const ctx = vm.createContext({ exports, module: { exports }, console, Date, AbortController,
        require: (name: string) => {
            assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`);
            return deps[name];
        }, ...globals });
    vm.runInContext(compile(read(file)), ctx);
    return (ctx as any).module.exports;
}
const pipe = load('src/hooks/useOnePipe.ts', {
    react: {}, swr: {}, '@/providers/WebSocketProvider': {}, '@/hooks/useMarketStatus': {},
    '@/utils/extWsTrust': { pickExtPrice },
    // 묶음 4 — useOnePipe 가 원천 스탬프·WS 틱 나이 판정을 쓴다(src/lib/sourceStamp.ts)
    '@/lib/sourceStamp': require('../src/lib/sourceStamp'), '@/lib/marketCalendar': require('../src/lib/marketCalendar'),
    // 가격 채택 통합 — 정규장 소켓 채택·기준 종가 규칙(src/lib/priceAcceptance.ts)
    '@/lib/priceAcceptance': require('../src/lib/priceAcceptance'),
});
// Extract the source expression rather than copying the screen's price calculation.
function screen(file: string, priceFile = file) {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let priceCall: ts.CallExpression | undefined;
    let chartBase: ts.Expression | undefined;
    function visit(node: ts.Node) {
        if (!priceCall && ts.isCallExpression(node) && node.expression.getText() === 'calcPriceDisplay') priceCall = node;
        if (!chartBase && ts.isJsxAttribute(node) && node.name.getText() === 'prevClose' && node.initializer && ts.isJsxExpression(node.initializer)) chartBase = node.initializer.expression;
        ts.forEachChild(node, visit);
    }
    visit(ast);
    if (priceFile !== file) {
        const priceAst = ts.createSourceFile(priceFile, read(priceFile), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        visit(priceAst);
    }
    assert.ok(priceCall && chartBase);
    return (data: any) => ({
        price: vm.runInNewContext(priceCall!.getText(), { data, calcPriceDisplay }),
        chartBase: vm.runInNewContext(chartBase!.getText(ast), { data, prevClose: data.prevClose }),
    });
}
const desktop = screen('src/app/[locale]/dashboard/DashboardClient.tsx');
const mobile = screen('src/app/[locale]/dashboard/MobileDashboardPage.tsx', 'src/components/mobile/MobileDashboardShell.tsx');
function makeStore(q: any = quotes, now = quotes.timestamp) {
    class Clock extends Date {
        constructor(...a: any[]) { super(a.length ? a[0] : now); }
        static now() { return now; }
    }
    return load('src/stores/dashboardStore.ts', {
        zustand: require('zustand'),
        'zustand/middleware': { persist: (initializer: any) => initializer },
        '@/hooks/useOnePipe': pipe,
        '@/lib/storage/dashboardTickerStore': {},
        '@/lib/impliedMove': { copyImpliedMoveGroup },
        '@/lib/vwap': { normalizeVwap },
        '@/lib/priceAcceptance': require('../src/lib/priceAcceptance'),
    }, {
        Date: Clock,
        fetch: async (url: string) => {
            assert.ok(url.startsWith('/api/dashboard/unified?') || url.startsWith('/api/live/quotes?'));
            return { ok: true, json: async () => clone(url.startsWith('/api/live/quotes?') ? q : unified) };
        },
    }).useDashboardStore;
}

async function main() {
    for (const row of official) {
        assert.match(row.secondaryData.lastTradeTimestamp, /Closed at Oct 14, 2026 4:00 PM ET/);
        const close = Number(row.secondaryData.lastSalePrice.replace('$', ''));
        assert.notEqual(quotes.data[row.symbol].price, close);
        console.log(`A measured ${row.symbol}: quotes=${quotes.data[row.symbol].price}, official=${close}`);
    }
    assert.equal(quotes.data.MSTR.price.toFixed(2), '143.28');
    assert.equal(quotes.data.MSTR.changePercent.toFixed(2), '-5.85');
    // A cannot identify the vendor's source field from these API outputs.
    assert.equal(quotes.data.NVDA._intrinio, undefined);
    const protectedQuote = { ...quotes.data.NVDA, extendedPrice: 221.43 };
    const one = oneNumberFromQuote(protectedQuote, 'post')!;
    assert.equal(one.price, 221.43);
    assert.equal(one.changePct!.toFixed(2), '-3.10');

    // Direct JSON projection exposes the field error, but is NOT the actual store path.
    const direct = desktop(unified.tickers.NVDA);
    assert.equal(direct.price.displayPrice, 228.52);
    assert.equal(direct.price.displayChangePct.toFixed(2), '0.97');
    console.log(`B direct JSON (bypasses store): ${direct.price.displayPrice}, ${direct.price.displayChangePct.toFixed(2)}%, POST ${direct.price.activeExtPct.toFixed(2)}%`);

    for (const order of ['unified-first', 'quotes-first', 'SSR-first']) {
        const store = makeStore();
        const state = () => store.getState();
        if (order === 'SSR-first') state().initializeStore(['NVDA', 'TSLA', 'SPY'], quotes.data);
        if (order === 'quotes-first') await state().fetchPriceOnly();
        await state().fetchDashboardData();
        if (order === 'unified-first') {
            assert.equal(state().tickers.NVDA.regularCloseToday, null);
            assert.equal(state().tickers.NVDA.prevClose, 226.32);
        }
        await state().fetchPriceOnly();
        await state().fetchDashboardData();
        await state().fetchPriceOnly();
        for (const symbol of ['NVDA', 'TSLA', 'SPY']) {
            const data = state().tickers[symbol];
            const expectedBase = baseline && order === 'unified-first' ? unified.tickers[symbol].prevClose : quotes.data[symbol].previousClose;
            near(data.prevClose, expectedBase);
            for (const render of [desktop, mobile]) {
                const output = render(data);
                near(output.price.displayPrice, quotes.data[symbol].price);
                near(output.chartBase, quotes.data[symbol].price);
                near(output.price.displayChangePct, (quotes.data[symbol].price - expectedBase) / expectedBase * 100);
            }
            const output = desktop(data).price;
            console.log(`B ${order} ${symbol}: $${output.displayPrice.toFixed(2)} ${output.displayChangePct.toFixed(2)}%, POST ${output.activeExtPct.toFixed(2)}%, base=${data.prevClose}`);
        }
    }
    // Session boundary simulations reuse captured prices; no assertion of official close availability.
    for (const [time, session] of [
        ['2026-10-14T20:00:01Z', 'post'], ['2026-10-14T20:59:00Z', 'post'],
        ['2026-10-15T00:18:00Z', 'closed'], ['2026-10-15T11:00:00Z', 'pre'],
    ]) {
        const q = clone(quotes);
        for (const row of Object.values(q.data) as any[]) row.session = session;
        const store = makeStore(q, Date.parse(time));
        await store.getState().fetchDashboardData();
        await store.getState().fetchPriceOnly();
        const row = store.getState().tickers.NVDA;
        const expected = baseline ? unified.tickers.NVDA.prevClose : q.data.NVDA.previousClose;
        near(row.prevClose, expected);
        assert.equal(row.regularCloseToday, session === 'pre' ? null : q.data.NVDA.price);
        console.log(`boundary simulation ${time} ${session}: base=${row.prevClose}, close=${row.regularCloseToday}`);
    }
    // A missing quote baseline must retain the existing fallback; q.prevClose is also supported.
    for (const [previousClose, prevClose, expected] of [
        [0, 0, 226.32], [undefined, 228.52, baseline ? 226.32 : 228.52],
    ]) {
        const q = clone(quotes);
        q.data.NVDA.previousClose = previousClose;
        q.data.NVDA.prevClose = prevClose;
        const store = makeStore(q);
        await store.getState().fetchDashboardData();
        await store.getState().fetchPriceOnly();
        near(store.getState().tickers.NVDA.prevClose, expected!);
    }
    console.log('PASS: original JSON replay, store ordering, actual desktop/mobile expressions, session boundaries');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
