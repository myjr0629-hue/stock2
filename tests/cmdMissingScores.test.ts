/** N4 offline regression: run the production memo and cards; no API/env access. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeVwap, vwapDistancePct } from '../src/lib/vwap';

const file = 'src/app/[locale]/app-view/cmd/page.tsx';
const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate: (node: ts.Node) => boolean): string {
    const matches: string[] = [];
    const visit = (node: ts.Node) => {
        if (predicate(node)) matches.push(node.getText(ast));
        ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.equal(matches.length, 1, 'production source region must be unique');
    return matches[0];
}
const memo = find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'signalsData');
const card = find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'SignalCard');
const cards = ['volRegime', 'conviction'].map(term => find(n => ts.isJsxSelfClosingElement(n)
    && n.tagName.getText(ast) === 'SignalCard' && n.attributes.properties.some(p =>
        ts.isJsxAttribute(p) && p.name.getText(ast) === 'infoTerm' && p.initializer?.getText(ast) === `"${term}"`)));
function run(code: string, context: Record<string, unknown> = {}): any {
    const js = ts.transpileModule(code, { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
    } }).outputText;
    return vm.runInNewContext(js, {
        React, normalizeVwap, vwapDistancePct, useMemo: (fn: () => unknown) => fn(),
        tDashboard: (key: string) => key, iv30Level: null,
        MetricInfo: () => null, ...context,
    });
}
// Fixed price-only /api/command/unified + /api/live/ticker response shape.
const priceOnly = {
    price: 100, vwap: null,
    unified: {
        ticker: 'TEST', structure: null, volatility: null, sma: null,
        institutional: null, squeeze: null, analyst: null, fundamentals: null, earnings: null,
    },
    rawTickerData: { ticker: 'TEST', prices: { price: 100 }, flow: null },
};
function signals(overrides: Record<string, any> = {}) {
    return run(`const ${memo}; signalsData;`, { data: { ...priceOnly, ...overrides } });
}
function scorePatch(unified: Record<string, any>, extra: Record<string, any> = {}) {
    return signals({ unified, ...extra });
}
function rendered(signalsData: any, locale = 'ko') {
    return cards.map(jsx => {
        const element = run(`${card}; (${jsx});`, { signalsData, locale });
        return { props: element.props, html: renderToStaticMarkup(element) };
    });
}

test('N4 price-only response has no volatility/conviction score, regime, grade or fabricated distance', () => {
    for (const data of [priceOnly, { price: 100 }, { ...priceOnly, unified: {} }]) {
        const result = signals(data);
        for (const key of ['regimeScore', 'regime', 'convictionScore', 'convictionGrade', 'flipDistance', 'isAboveFlip']) {
            assert.equal(result[key], null, key);
        }
        assert.equal(result.convictionLabel, '—');
    }
});
test('N4 both cards and their labels/slots stay visible with dash values in all locales', () => {
    for (const [locale, labels] of [['ko', ['변동성 레짐', '확신도']], ['en', ['VOL REGIME', 'CONVICTION']], ['ja', ['ボラティリティ体制', 'コンビクション']]] as const) {
        rendered(signals(), locale).forEach(({ props, html }, i) => {
            assert.equal(props.label, labels[i]);
            assert.equal(props.value, '—'); assert.equal(props.badge, '—');
            assert.equal(props.insightOverride, '—'); assert.ok(props.sub);
            assert.ok(html.includes(labels[i])); assert.match(html, /—/);
            assert.doesNotMatch(html, /\/100|CALM|convNeutral|volStable|Stable|安定|안정|중립|NaN|Infinity/);
        });
    }
});
test('N4 partial volatility uses only available GEX, flip distance or IV input', () => {
    for (const [unified, expected] of [
        [{ structure: { netGex: -2000000 } }, 11],
        [{ structure: { netGex: 2000000 } }, 8],
        [{ structure: { gammaFlipLevel: 100 } }, 20],
        [{ structure: { gammaFlipLevel: 50 } }, 5],
        [{ structure: { atmIV: 0.5 } }, 20],
        [{ volatility: { iv: 75 } }, 30],
        [{ structure: { atmIV: 0 }, volatility: { iv: 50 } }, 20],
    ] as const) assert.equal(scorePatch(unified).regimeScore, expected, JSON.stringify(unified));
    for (const unified of [{ structure: { atmIV: 0.5 } }, { structure: { gammaFlipLevel: 100 } }]) {
        assert.equal(scorePatch(unified).convictionScore, null);
    }
});
test('N4 partial conviction uses only available technical/flow observations', () => {
    for (const [unified, extra, expected] of [
        [{ sma: { cross: 'GOLDEN' } }, {}, 65],
        [{ sma: { cross: 'DEAD' } }, {}, 35],
        [{ sma: { cross: 'NONE' } }, {}, 50],
        [{}, { vwap: 98 }, 58],
        [{}, { vwap: 102 }, 42],
        [{}, { vwap: 100 }, 50],
        [{ structure: { pcRatio: 0.5 } }, {}, 57],
        [{ structure: { pcRatio: 0 } }, {}, 50],
        [{ structure: { pcRatio: 1 } }, {}, 50],
        [{ structure: { pcRatio: 1.5 } }, {}, 43],
        [{}, { rawTickerData: { flow: { netPremium: 1000000 } } }, 55],
        [{}, { rawTickerData: { flow: { netPremium: -1000000 } } }, 45],
        [{}, { rawTickerData: { flow: { netFlow: 1000000 } } }, 55],
    ] as const) assert.equal(scorePatch(unified, extra).convictionScore, expected, JSON.stringify({ unified, extra }));
});
test('N4 measured GEX/flow zeros remain observations and never fall back to a different flow', () => {
    const gex = scorePatch({ structure: { netGex: 0 } });
    assert.equal(gex.regimeScore, 5); assert.equal(gex.convictionScore, 50);
    const flow = scorePatch({}, { rawTickerData: { flow: { netPremium: 0, netFlow: 1000000 } } });
    assert.equal(flow.convictionScore, 50); assert.equal(flow.regimeScore, null);
});
test('N4 invalid numeric fields/unknown SMA never create observations or non-finite scores', () => {
    for (const value of [undefined, null, '', '0', false, NaN, Infinity, -Infinity]) {
        const result = scorePatch({
            structure: { netGex: value, gammaFlipLevel: value, atmIV: value, pcRatio: value },
            volatility: { iv: value }, sma: { cross: 'UNKNOWN' },
        }, { vwap: value, rawTickerData: { flow: { netPremium: value, netFlow: value } } });
        assert.equal(result.regimeScore, null, String(value));
        assert.equal(result.convictionScore, null, String(value));
    }
    const zeroSentinels = scorePatch({ structure: { gammaFlipLevel: 0, atmIV: 0 }, volatility: { iv: 0 } });
    assert.equal(zeroSentinels.regimeScore, null);
});
test('N4 flip/VWAP need both positive finite prices; no fake at-flip points without price', () => {
    for (const price of [null, undefined, 0, -1, NaN, Infinity]) {
        const result = scorePatch({ structure: { gammaFlipLevel: 100 } }, { price, vwap: 100 });
        assert.equal(result.regimeScore, null); assert.equal(result.convictionScore, null);
        assert.equal(result.flipDistance, null); assert.equal(result.isAboveFlip, null);
    }
});
test('N4 complete measured inputs retain original weights, grades and translated state', () => {
    const bullish = scorePatch({
        structure: { netGex: -10000000, gammaFlipLevel: 100, atmIV: 0.7, pcRatio: 0.5 }, sma: { cross: 'GOLDEN' },
    }, { vwap: 95, rawTickerData: { flow: { netPremium: 1000000 } } });
    assert.equal(bullish.regimeScore, 75); assert.equal(bullish.regime, 'ERUPTING');
    assert.equal(bullish.convictionScore, 80); assert.equal(bullish.convictionGrade, 'A');
    assert.equal(bullish.convictionLabel, 'convStrong');
    const bearish = scorePatch({
        structure: { netGex: 20000000, gammaFlipLevel: 50, atmIV: 0.2, pcRatio: 1.5 }, sma: { cross: 'DEAD' },
    }, { vwap: 105, rawTickerData: { flow: { netPremium: -1000000 } } });
    assert.equal(bearish.regimeScore, 19); assert.equal(bearish.regime, 'CALM');
    assert.equal(bearish.convictionScore, 20); assert.equal(bearish.convictionGrade, 'D-');
    const output = rendered(bullish);
    assert.equal(output[0].props.value, '75 /100'); assert.equal(output[1].props.value, '80 /100');
    output.forEach(({ props }) => assert.equal(props.insightOverride, undefined));
});
