/** Offline N4 web regression: execute production memo/card/AI payload, with no services or env. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeVwap, vwapDistancePct } from '../src/lib/vwap';
import { convictionInputsOf, scoreCommandConviction, webConvictionSnapshot, type ConvictionSnapshot } from '../src/lib/commandConviction';

const file = 'src/components/LiveTickerDashboard.tsx';
const current = fs.readFileSync(file, 'utf8');
const before = fs.readFileSync('tests/fixtures/webCmdConviction.before.tsx.txt', 'utf8');
function find(source: string, predicate: (n: ts.Node) => boolean) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const matches: string[] = [];
    const visit = (n: ts.Node) => { if (predicate(n)) matches.push(n.getText(ast)); ts.forEachChild(n, visit); };
    visit(ast); assert.equal(matches.length, 1); return matches[0];
}
function decl(name: string) { return find(current, n => ts.isVariableDeclaration(n) && n.name.getText() === name); }
const memo = decl('convictionSnapshot');
const score = decl('convictionResult');
const conviction = decl('conviction');
const effect = find(current, n => ts.isCallExpression(n) && n.expression.getText() === 'useEffect'
    && !!n.arguments[0]?.getText().includes('convictionHistory.current.set'));
const card = (source: string) => find(source, n => ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'ProGate'
    && n.openingElement.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText() === 'title'
        && p.initializer?.getText() === '"Conviction Matrix"'));
const ai = find(current, n => ts.isPropertyAssignment(n) && n.name.getText() === 'conviction'
    && n.initializer.getText().includes('conviction?.score'));
const legacy = find(before, n => ts.isVariableDeclaration(n) && n.name.getText() === 'calculateConviction');
function run(code: string, context: Record<string, any> = {}): any {
    const js = ts.transpileModule(code, { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
    } }).outputText;
    return vm.runInNewContext(js, {
        React: { ...React, useMemo: (fn: () => unknown) => fn() },
        useEffect: (fn: () => void) => fn(), webConvictionSnapshot, scoreCommandConviction,
        normalizeVwap, vwapDistancePct, ...context,
    });
}
const stock = { symbol: 'TEST', price: 100, vwap: null };
function web(data: Record<string, any> = {}, history = new Map<string, ConvictionSnapshot>()) {
    return run(`const ${memo}; ${effect}; const ${score}; const ${conviction};
        ({ conviction, snapshot: convictionSnapshot, ai: ({ ${ai} }).conviction });`, {
        ticker: 'TEST', initialUnifiedData: {}, initialStockData: stock, unifiedData: {},
        liveQuote: { ticker: 'TEST', price: 100, flow: null }, displayPrice: 100, newsScore: null,
        convictionHistory: { current: history }, td: (key: string) => key, ...data,
    });
}
const dates = '2026-10-16';
const healthy = {
    unifiedData: { ticker: 'TEST', sma: { cross: 'GOLDEN', date: dates }, structure: { pcRatio: 0.5, netGex: 1e6, chainDate: dates } },
    liveQuote: { ticker: 'TEST', vwap: 98, vwapDate: dates, flow: { netPremium: 1e6, contractsProcessed: 2, dataFreshness: { chainDate: dates } } },
};
function rendered(value: any, locale: string, source = current) {
    const messages = JSON.parse(fs.readFileSync(`src/messages/${locale}.json`, 'utf8'));
    const passthrough = ({ children }: any) => React.createElement(React.Fragment, null, children);
    const element = run(`(${card(source)})`, {
        conviction: value.conviction, convictionSnapshot: value.snapshot,
        td: (key: string) => messages.dashboard[key], tg: (key: string) => messages.gate?.[key] ?? key,
        ProGate: passthrough, CardTooltip: passthrough, Target: () => null,
        COMMAND_TOOLTIPS: { CONVICTION: { tooltip: {} } },
    });
    return renderToStaticMarkup(element);
}

test('reproduce frozen legacy price-only -> 50/C, repaired web -> no score and AI null', () => {
    let old: any;
    run(`const ${legacy}; calculateConviction();`, {
        smaData: null, newsScore: null, liveQuote: { price: 100 }, initialStockData: stock,
        displayPrice: 100, structure: null, td: (key: string) => key, setConviction: (value: any) => { old = value; },
    });
    assert.equal(old.score, 50); assert.equal(old.grade, 'C');
    const result = web();
    assert.equal(result.conviction, null); assert.equal(result.ai.score, null); assert.equal(result.ai.grade, null);
});
test('all missing/invalid/legacy failure inputs produce no vote; observed zero remains 50/C', () => {
    for (const flow of [null, {}, { netPremium: 0 }, { netPremium: 0, contractsProcessed: 0 },
        { netPremium: 1e6, dataSource: 'NONE' }, { netPremium: 1e6, error: 'offline' }, { netFlow: 1e6 }]) {
        assert.equal(web({ liveQuote: { flow } }).conviction, null);
    }
    for (const bad of [undefined, null, '', '0', false, NaN, Infinity, -Infinity]) {
        assert.equal(scoreCommandConviction(convictionInputsOf({ cross: 'UNKNOWN', price: bad, vwap: bad, pcr: bad, gex: bad, flow: { netPremium: bad }, news: bad })), null);
    }
    for (const raw of [{ flow: { netPremium: 0, contractsProcessed: 2 } }, { flow: { netPremium: 0, premiumContracts: 2 } }, { pcr: 0 }, { gex: 0 }, { cross: 'NONE' }]) {
        assert.equal(scoreCommandConviction(convictionInputsOf(raw))?.score, 50);
    }
});
test('partial missing refresh carries each normal input and its original date before scoring', () => {
    const history = new Map<string, ConvictionSnapshot>();
    const good = web(healthy, history);
    assert.equal(good.conviction.score, 90);
    const empty = web({ liveQuote: { flow: { netPremium: 0, dataSource: 'NONE' }, vwap: null } }, history);
    assert.equal(empty.conviction.score, 90);
    for (const key of ['cross', 'vwap', 'pcr', 'gex', 'netPremium']) {
        assert.equal(empty.snapshot.sourceDates[key], dates, key);
        assert.equal(empty.snapshot.inputs[key], good.snapshot.inputs[key], key);
    }
    const omitted = web({ initialStockData: { ...stock, vwap: 105 } }, history);
    assert.equal(omitted.snapshot.inputs.vwap, 98);
    assert.equal(omitted.snapshot.sourceDates.vwap, dates);
    const partial = web({ unifiedData: { structure: { netGex: 0, chainDate: '2026-10-19' } } }, history);
    assert.equal(partial.conviction.score, 85); // updated measured GEX zero, all other prior inputs retained
    assert.equal(partial.snapshot.sourceDates.gex, '2026-10-19');
    assert.equal(partial.snapshot.sourceDates.pcr, dates);
    const zero = web({ liveQuote: { flow: { netPremium: 0, contractsProcessed: 2, dataFreshness: { chainDate: '2026-10-19' } } } }, history);
    assert.equal(zero.snapshot.inputs.netPremium, 0); assert.equal(zero.conviction.score, 80);
});
test('SSR normal inputs seed a failed first refresh without manufactured UI NONE', () => {
    const result = web({ initialUnifiedData: healthy.unifiedData });
    assert.equal(result.conviction.score, 77);
    assert.equal(web({ initialUnifiedData: { sma: {} }, unifiedData: { sma: {} } }).conviction, null);
});
test('a dated older response cannot replace newer observations; unknown dates are never invented', () => {
    const history = new Map<string, ConvictionSnapshot>();
    web(healthy, history);
    const result = web({ unifiedData: { structure: { netGex: -1e6, chainDate: '2026-10-15' } } }, history);
    assert.equal(result.snapshot.inputs.gex, 1e6); assert.equal(result.snapshot.sourceDates.gex, dates);
    const unknown = web({ unifiedData: { timestamp: Date.now(), sma: { cross: 'GOLDEN' } } });
    assert.equal(unknown.conviction.score, 65); assert.equal(unknown.snapshot.sourceDates.cross, null);
});
test('ticker navigation and late old ticker responses cannot leak inputs; returning to ticker retains history', () => {
    const history = new Map<string, ConvictionSnapshot>();
    web(healthy, history);
    const other = web({ ticker: 'OTHER', initialStockData: { symbol: 'OTHER', price: 100 }, ...healthy }, history);
    assert.equal(other.conviction, null);
    assert.equal(web({}, history).conviction.score, 90);
    const crossStock = web({ ticker: 'OTHER', ...healthy }, new Map());
    assert.equal(crossStock.conviction, null);
});
test('web refresh reacts to VWAP/display price and observation count changes', () => {
    assert.equal(web({ liveQuote: { vwap: 100, vwapDate: dates } }).conviction.score, 50);
    assert.equal(web({ liveQuote: { vwap: 100, vwapDate: dates }, displayPrice: 102 }).conviction.score, 58);
    assert.equal(web({ liveQuote: { vwap: 102, vwapDate: dates } }).conviction.score, 42);
    assert.equal(web({ liveQuote: { flow: { netPremium: 0, contractsProcessed: 0 } } }).conviction, null);
    assert.equal(web({ liveQuote: { flow: { netPremium: 0, contractsProcessed: 2 } } }).conviction.score, 50);
    assert.equal(web({ liveQuote: { flow: { netPremium: 0, contractsProcessed: 0 } } }).conviction, null);
});
test('ticker revisit uses newer SSR VWAP when live omits it: 42 instead of stale 58', () => {
    const history = new Map<string, ConvictionSnapshot>();
    const old = web({ liveQuote: { ticker: 'TEST', vwap: 98, vwapDate: dates } }, history);
    assert.equal(old.conviction.score, 58);
    web({ ticker: 'OTHER', initialStockData: { symbol: 'OTHER', price: 100 } }, history);
    const result = web({
        initialStockData: { ...stock, vwap: 102, vwapDate: '2026-10-19' },
        liveQuote: { ticker: 'TEST', price: 100 },
    }, history);
    assert.equal(result.snapshot.inputs.vwap, 102);
    assert.equal(result.snapshot.sourceDates.vwap, '2026-10-19');
    assert.equal(result.conviction.score, 42);
    assert.equal(result.ai.score, 42);
});
test('VWAP uses newest source date, ties prefer live then SSR then history, and dates stay paired', () => {
    const previous = webConvictionSnapshot('TEST', {
        stock: { ...stock, vwap: 98, vwapDate: '2026-10-16' }, price: 100,
    });
    const cases = [
        { name: 'new live', live: 101, liveDate: '2026-10-20', ssrDate: '2026-10-19', expected: 101, date: '2026-10-20' },
        { name: 'new SSR beats older live', live: 101, liveDate: '2026-10-17', ssrDate: '2026-10-19', expected: 102, date: '2026-10-19' },
        { name: 'history beats both older sources', live: 101, liveDate: '2026-10-14', ssrDate: '2026-10-15', expected: 98, date: '2026-10-16' },
        { name: 'live wins equal dates', live: 101, liveDate: '2026-10-16', ssrDate: '2026-10-16', expected: 101, date: '2026-10-16' },
        { name: 'SSR wins equal history date', live: null, liveDate: undefined, ssrDate: '2026-10-16', expected: 102, date: '2026-10-16' },
        { name: 'compare instants across offsets', live: 101, liveDate: '2026-10-19T10:00:00+09:00', ssrDate: '2026-10-19T02:00:00Z', expected: 102, date: '2026-10-19T02:00:00Z' },
        { name: 'null live cannot lend its newer date', live: null, liveDate: '2026-10-20', ssrDate: '2026-10-15', expected: 98, date: '2026-10-16' },
        { name: 'invalid live falls back to new SSR', live: 0, liveDate: '2026-10-20', ssrDate: '2026-10-19', expected: 102, date: '2026-10-19' },
        { name: 'undated live cannot borrow SSR date', live: 101, liveDate: undefined, ssrDate: '2026-10-19', expected: 102, date: '2026-10-19' },
        { name: 'invalid date cannot outrank dated history', live: 101, liveDate: 'invalid', ssrDate: undefined, expected: 98, date: '2026-10-16' },
    ];
    for (const row of cases) {
        const result = webConvictionSnapshot('TEST', {
            stock: { ...stock, vwap: 102, vwapDate: row.ssrDate },
            quote: { ticker: 'TEST', vwap: row.live, vwapDate: row.liveDate }, price: 100,
        }, previous);
        assert.equal(result.inputs.vwap, row.expected, row.name);
        assert.equal(result.sourceDates.vwap, row.date, row.name);
    }
    const undated = webConvictionSnapshot('TEST', {
        stock: { ...stock, vwap: 102 }, quote: { vwap: 101 }, price: 100,
    });
    assert.equal(undated.inputs.vwap, 101);
    assert.equal(undated.sourceDates.vwap, null);
    const mismatched = webConvictionSnapshot('OTHER', {
        stock: { ...stock, vwap: 102, vwapDate: '2026-10-20' },
        quote: { ticker: 'TEST', vwap: 101, vwapDate: '2026-10-21' }, price: 100,
    }, previous);
    assert.equal(mismatched.inputs.vwap, null);
    assert.equal(mismatched.sourceDates.vwap, null);
});
test('normal web weights/news/grades match frozen legacy and app uses the identical helper', () => {
    for (const cross of ['GOLDEN', 'DEAD', 'NONE']) for (const pcr of [0, 0.5, 1, 1.5]) {
        for (const gex of [-1e6, 0, 1e6]) for (const premium of [-1e6, 0, 1e6]) for (const news of [20, 50, 80]) {
            let old: any;
            run(`const ${legacy}; calculateConviction();`, {
                smaData: { cross }, newsScore: { score: news }, structure: { pcRatio: pcr, netGex: gex },
                liveQuote: { vwap: 98, flow: { netPremium: premium } }, initialStockData: stock, displayPrice: 100,
                td: (key: string) => key, setConviction: (value: any) => { old = value; },
            });
            const now = scoreCommandConviction(convictionInputsOf({ cross, price: 100, vwap: 98, pcr, gex, flow: { netPremium: premium, contractsProcessed: 2 }, news }));
            assert.equal(now?.score, old.score); assert.equal(now?.grade, old.grade); assert.equal(now?.labelKey, old.label);
        }
    }
    const app = fs.readFileSync('src/app/[locale]/app-view/cmd/page.tsx', 'utf8');
    assert.match(app, /scoreCommandConviction\(convictionInputsOf\(/);
});
test('ko/en/ja retain CONVICTION label/card/normal HTML; only unavailable values use dashes', () => {
    for (const locale of ['ko', 'en', 'ja']) {
        const good = web(healthy);
        const html = rendered(good, locale);
        const withoutDates = html.replace(/ data-source-dates="[^"]*"/, '').replace(/ title="[^"]*"/, '');
        assert.equal(withoutDates, rendered(good, locale, before));
        assert.match(html, /2026-10-16/);
        const empty = rendered(web(), locale);
        assert.match(empty, /CONVICTION/); assert.match(empty, /\/100/); assert.match(empty, /—/);
        assert.doesNotMatch(empty, />50<|>C<|NaN|Infinity|\.\.\./);
        assert.equal((empty.match(/—/g) ?? []).length, 4);
    }
});
