/** Offline final-JSX regression for gate-fix_p1-vwap-10171450 (no browser/network). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandSSRCards } from '../src/app/[locale]/ticker/CommandSSRCards';
import { normalizeVwap, vwapDistancePct } from '../src/lib/vwap';

const intelFile = 'src/app/[locale]/intel/IntelClientPage.tsx';
const dashboardFile = 'src/components/LiveTickerDashboard.tsx';
const source = (file: string) => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(file: string, predicate: (node: ts.Node) => boolean): string {
    const ast = source(file);
    let found = '';
    const visit = (node: ts.Node) => {
        if (predicate(node)) found = node.getText(ast);
        ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.ok(found, `missing source region: ${file}`);
    return found;
}
// Execute current production function/JSX, not a copy of its calculation.
function execute(code: string, context: Record<string, any> = {}) {
    const js = ts.transpileModule(code, { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
    } }).outputText;
    return vm.runInNewContext(js, { React, normalizeVwap, vwapDistancePct, ...context });
}
const buildPrice = (value: any, last = 123) => {
    const fn = find('src/services/terminalEnricher.ts', n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildPriceEvidence');
    return execute(`${fn}; buildPriceEvidence(input);`, {
        input: { price: last, snapshot: { day: { vw: value, typicalPrice: 100 } } },
    });
};
const renderIntel = (price: any) => {
    const jsx = find(intelFile, n => ts.isJsxElement(n)
        && n.getText().startsWith('<div className="bg-slate-900 p-3">') && n.getText().includes('VWAP Dist'));
    return renderToStaticMarkup(execute(`(${jsx});`, { ev: { price } }));
};
const renderDashboard = (liveVwap: any, ssrVwap: any, price = 123, liveReceived = true) => {
    const iife = find(dashboardFile, n => ts.isCallExpression(n) && n.expression.getText().startsWith('(() =>')
        && n.getText().includes('const vwapDesc ='));
    return renderToStaticMarkup(execute(`(${iife});`, {
        liveQuote: liveReceived ? { vwap: liveVwap } : null,
        initialStockData: { vwap: ssrVwap }, displayPrice: price,
        td: (key: string) => key,
        CardTooltip: ({ children }: any) => children,
        COMMAND_TOOLTIPS: { VWAP: { tooltip: 'tooltip' } },
        Activity: () => null,
    }));
};
const text = (html: string) => html.replace(/<[^>]*>/g, '');
const renderPreview = (stockVwap: any, cachedVwap?: any, price = 123) => {
    const html = renderToStaticMarkup(React.createElement(CommandSSRCards, {
        data: { _dynamoPrice: { vwap: cachedVwap } }, stockData: { price, vwap: stockVwap }, ticker: 'NVDA',
    }));
    const title = html.indexOf('>VWAP</span>');
    assert.ok(title >= 0, 'SSR VWAP label/card remains');
    const start = html.lastIndexOf('<div class="relative overflow-hidden', title);
    const end = html.indexOf('<div class="relative overflow-hidden', title);
    return html.slice(start, end < 0 ? undefined : end);
};
function assertMissing(html: string, label: string) {
    assert.ok(html.includes(label), 'card/label must remain');
    assert.doesNotMatch(text(html), /\$0\.00|Infinity|NaN|[+-]?0\.0+%/);
    assert.ok(text(html).includes('--'), 'existing missing-value placeholder');
    assert.doesNotMatch(text(html), /vwapNear|vwapAbove|vwapBelow/);
}

test('gate 1: price 123 + null source VWAP keeps null evidence, not zero', () => {
    const price = buildPrice(null);
    assert.equal(price.last, 123);
    assert.equal(price.vwap, null);
    assert.equal(price.vwapDistPct, null);
});
test('gate 1: real terminal evidence → Intel JSX never renders $0.00 / +Infinity%', () => {
    assertMissing(renderIntel(buildPrice(null)), 'VWAP Dist');
});
test('gate 2: fresh null + SSR null keeps Dashboard card without fake neutral signal', () => {
    assertMissing(renderDashboard(null, null), 'VWAP');
});
test('gate 2: SSR before fresh response preserves missing-value card', () => {
    assertMissing(renderDashboard(undefined, null, 123, false), 'VWAP');
});
test('SSR preview keeps the existing VWAP placeholder and card', () => {
    assertMissing(renderPreview(null), 'VWAP');
});
test('fresh explicit null does not resurrect a stale SSR VWAP', () => {
    assertMissing(renderDashboard(null, 100), 'VWAP');
});
test('fresh undefined still allows the existing SSR fallback', () => {
    const html = text(renderDashboard(undefined, 100));
    assert.ok(html.includes('$100.00'));
    assert.ok(html.includes('+23.0%'));
    assert.ok(html.includes('vwapAbove'));
});
test('valid zero distance survives Intel reported-distance selection', () => {
    const html = text(renderIntel({ last: 123, vwap: 100, vwapDistPct: 0 }));
    assert.ok(html.includes('$100.00'));
    assert.ok(html.includes('0.0%'));
    assert.ok(!html.includes('+23.0%'));
});
test('valid measured above / below / equal VWAP retains Dashboard descriptions', () => {
    for (const [price, key, pct] of [[123, 'vwapAbove', '+23.0%'], [77, 'vwapBelow', '-23.0%'], [100, 'vwapNear', '0.0%']] as const) {
        const html = text(renderDashboard(100, null, price));
        assert.ok(html.includes('$100.00')); assert.ok(html.includes(key)); assert.ok(html.includes(pct));
    }
});
test('legacy zero / invalid VWAP never divides or renders a price/signal', () => {
    for (const value of [undefined, 0, -1, NaN, Infinity]) {
        assertMissing(renderIntel({ last: 123, vwap: value, vwapDistPct: 0 }), 'VWAP Dist');
        assertMissing(renderDashboard(value, null), 'VWAP');
    }
});
test('valid VWAP + missing price keeps the value but does not assert neutral distance', () => {
    const html = text(renderDashboard(100, null, 0));
    assert.ok(html.includes('$100.00'));
    assert.doesNotMatch(html, /0\.0+%|vwapNear|Infinity|NaN/);
});
test('SSR preview honors explicit null over stale cached VWAP; undefined still falls back', () => {
    assertMissing(renderPreview(null, 100), 'VWAP');
    assert.ok(text(renderPreview(undefined, 100)).includes('$100.00'));
});
test('SSR preview rejects legacy zero and invalid VWAP, without hiding its card', () => {
    for (const value of [0, -1, NaN, Infinity]) assertMissing(renderPreview(value, 100), 'VWAP');
});
test('SSR preview valid prices retain direction and a measured zero distance', () => {
    for (const [price, pct] of [[123, '+23.0%'], [77, '-23.0%'], [100, '0.0%']] as const) {
        const html = text(renderPreview(100, undefined, price));
        assert.ok(html.includes('$100.00')); assert.ok(html.includes(pct));
    }
    const noPrice = text(renderPreview(100, undefined, 0));
    assert.ok(noPrice.includes('$100.00')); assert.doesNotMatch(noPrice, /0\.0%|Infinity|NaN/);
});
test('distance helper rejects invalid prices/overflow and preserves reported zero', () => {
    for (const value of [null, undefined, 0, -1, NaN, Infinity, '100']) {
        assert.equal(normalizeVwap(value), null);
        assert.equal(vwapDistancePct(123, value, 0), null);
        assert.equal(vwapDistancePct(value, 100, 0), null);
    }
    assert.equal(vwapDistancePct(Number.MAX_VALUE, Number.MIN_VALUE), null);
    assert.equal(vwapDistancePct(123, 100, 0), 0);
    assert.equal(vwapDistancePct(123, 100, Infinity), 23);
});
test('terminal incomplete fallback also serializes absent VWAP as null', () => {
    const fn = find('src/services/terminalEnricher.ts', n => ts.isFunctionDeclaration(n) && n.name?.text === 'createIncompleteItem');
    const item = execute(`${fn}; createIncompleteItem('NVDA', {});`);
    assert.equal(item.evidence.price.vwap, null); assert.equal(item.evidence.price.vwapDistPct, null);
    assert.equal(JSON.parse(JSON.stringify(buildPrice(null))).vwapDistPct, null);
});
test('all Dashboard VWAP selectors (card/charts/AI) honor fresh null and SSR fallback', () => {
    const ast = source(dashboardFile);
    const selectors: string[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'normalizeVwap') selectors.push(node.getText(ast));
        ts.forEachChild(node, visit);
    };
    visit(ast);
    // B5: conviction reads VWAP through the shared input rule (webConvictionState) and the AI through
    // buildDeepSnapshot's rawTickerData — so three direct selectors remain (card + two charts).
    assert.equal(selectors.length, 3);
    const aiVwap = find(dashboardFile, n => ts.isPropertyAssignment(n) && n.name.getText() === 'rawTickerData'
        && n.initializer.getText().includes('liveQuote?.flow'));
    for (const expr of [...selectors, `normalizeVwap(({${aiVwap}}).rawTickerData.vwap)`]) {
        for (const [fresh, expected] of [[null, null], [undefined, 100], [109.6, 109.6], [0, null], [Infinity, null]] as const) {
            assert.equal(execute(`${expr};`, { liveQuote: { vwap: fresh }, initialStockData: { vwap: 100 } }), expected);
        }
    }
});
test('conviction does not score missing VWAP; measured above/below bonuses stay intact', () => {
    // B5: the web card's shared conviction state. A fresh null from the live quote is the route invalidating
    // a stale-session VWAP — it is not scored and the SSR VWAP is not carried over it.
    const conv = require('../src/lib/commandConviction');
    for (const [value, expected] of [[null, 50], [100, 58], [150, 42]] as const) {
        const ssr = { unified: null, stock: { symbol: 'TEST', price: 123, vwap: 100 } };
        const state = conv.webConvictionState('TEST', ssr, { quote: { ticker: 'TEST', vwap: value }, stock: ssr.stock, price: 123,
            unified: { ticker: 'TEST', sma: { cross: 'NONE' } } });
        assert.equal(conv.scoreCommandConviction(state.inputs).score, expected);
    }
});
test('AI snapshot distance follows the same missing/valid selection', () => {
    const { buildDeepSnapshot } = require('../src/lib/ai/deepSnapshot');
    const aiVwap = find(dashboardFile, n => ts.isPropertyAssignment(n) && n.name.getText() === 'rawTickerData'
        && n.initializer.getText().includes('liveQuote?.flow'));
    let seq = 0;
    for (const [value, expected] of [[null, 'N/A'], [100, '23.0%']] as const) {
        const rawTickerData = execute(`({${aiVwap}}).rawTickerData;`, { liveQuote: { vwap: value, flow: null }, initialStockData: { vwap: 100 } });
        const snap = buildDeepSnapshot({ ticker: `VWAPAI${++seq}`, price: 123, priceChange: 0, session: 'REG', unified: {},
            rawTickerData, insider: null, technicals: null, creditSpread: null });
        assert.equal(snap.vwapDistance, expected);
    }
});
test('Intel valid VWAP with absent/nonfinite reported distance computes a finite distance', () => {
    for (const value of [null, undefined, NaN, Infinity]) {
        const html = text(renderIntel({ last: 123, vwap: 100, vwapDistPct: value }));
        assert.ok(html.includes('$100.00')); assert.ok(html.includes('+23.0%'));
    }
});
