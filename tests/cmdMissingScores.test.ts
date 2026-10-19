/** N4 offline regression: run the production memo and cards; no API/env access. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeVwap, vwapDistancePct } from '../src/lib/vwap';
import { commandScores } from '../src/lib/commandScores';
import { netPremiumOf, premiumLabel } from '../src/lib/premiumFlow';
import { gammaFlipDistancePct } from '../src/lib/gammaFlipDistance';
import { computeUnifiedVolatilityRegime, computeVolatilityRegime } from '../src/lib/metrics/volatilityRegime';
import { resolveCommandVolatilityObservation, formatObservationTime } from '../src/lib/commandVolatilityObservation';
import { commandConvictionRaw, convictionInputsOf, retainConvictionInputs, scoreCommandConviction } from '../src/lib/commandConviction';

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
        React, commandScores, commandConvictionRaw, retainConvictionInputs, convictionInputsOf, scoreCommandConviction, normalizeVwap, vwapDistancePct, netPremiumOf, gammaFlipDistancePct, useMemo: (fn: () => unknown) => fn(),
        computeUnifiedVolatilityRegime, resolveCommandVolatilityObservation, formatObservationTime,
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
// B5: the vol regime card uses the shared definition (lib/metrics/volatilityRegime) with the
// structure edition's own spot — the same value as the unified API, web, mobile and AI.
const FULL_VOL = { netGex: -100e6, gammaFlipLevel: 100, underlyingPrice: 102, squeezeScore: 40, atmIv: 40, gammaConcentration: 60 };
test('gamma flip uses spot percent in the production Command memo', () => {
    for (const [price, expected] of [[105.10, 4.9], [94.90, -5.4], [100, 0]]) {
        const out = scorePatch({ structure: { gammaFlipLevel: 100, underlyingPrice: price } }, { price });
        assert.equal(out.flipDistance, expected);
        assert.equal(out.isAboveFlip, price > 100);
    }
});
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
test('B5 partial volatility inputs are missing (no partial score), complete inputs match the shared definition', () => {
    for (const unified of [
        { structure: { netGex: -2000000 } },
        { structure: { netGex: 2000000 } },
        { structure: { gammaFlipLevel: 100 } },
        { structure: { gammaFlipLevel: 50 } },
        { structure: { atmIV: 0.5 } },
        { volatility: { iv: 75 } },
        { structure: { atmIV: 0 }, volatility: { iv: 50 } },
        { structure: { ...FULL_VOL, gammaConcentration: null } },
    ]) {
        const out = scorePatch(unified);
        assert.equal(out.regimeScore, null, JSON.stringify(unified)); assert.equal(out.regime, null);
    }
    const full = scorePatch({ structure: FULL_VOL });
    assert.equal(full.regimeScore, 58); assert.equal(full.regime, 'LOADED');
    assert.equal(full.regimeScore, computeVolatilityRegime(FULL_VOL).regimeScore);
    // Legacy decimal atmIV and percent volatility.iv are the same unit after resolution.
    assert.equal(scorePatch({ structure: { ...FULL_VOL, atmIv: undefined, atmIV: 0.4 } }).regimeScore, 58);
    assert.equal(scorePatch({ structure: { ...FULL_VOL, atmIv: null }, volatility: { iv: 40 } }).regimeScore, 58);
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
        // netFlow is not a producer field; only netPremium (judged by netPremiumOf) votes.
        [{}, { rawTickerData: { flow: { netFlow: 1000000 } } }, null],
    ] as const) assert.equal(scorePatch(unified, extra).convictionScore, expected, JSON.stringify({ unified, extra }));
});
test('N4 measured GEX/flow zeros remain observations and never fall back to a different flow', () => {
    const gex = scorePatch({ structure: { ...FULL_VOL, netGex: 0 } });
    assert.equal(gex.regimeScore, computeVolatilityRegime({ ...FULL_VOL, netGex: 0 }).regimeScore);
    assert.equal(gex.regimeScore, 38); assert.equal(gex.convictionScore, 50);
    const flow = scorePatch({}, { rawTickerData: { flow: { netPremium: 0, contractsProcessed: 2, netFlow: 1000000 } } });
    assert.equal(flow.convictionScore, 50); assert.equal(flow.regimeScore, null);
    // A zero with no producer contract count cannot prove an observation (legacy producers emitted 0 for "not measured").
    assert.equal(scorePatch({}, { rawTickerData: { flow: { netPremium: 0, netFlow: 1000000 } } }).convictionScore, null);
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
        structure: { netGex: -1e9, gammaFlipLevel: 100, underlyingPrice: 100.5, squeezeScore: 80, atmIV: 0.7, gammaConcentration: 75, pcRatio: 0.5 }, sma: { cross: 'GOLDEN' },
    }, { vwap: 95, rawTickerData: { flow: { netPremium: 1000000 } } });
    assert.equal(bullish.regimeScore, 95); assert.equal(bullish.regime, 'ERUPTING');
    assert.equal(bullish.convictionScore, 80); assert.equal(bullish.convictionGrade, 'A');
    assert.equal(bullish.convictionLabel, 'convStrong');
    const bearish = scorePatch({
        structure: { netGex: 20000000, gammaFlipLevel: 50, underlyingPrice: 100, squeezeScore: 20, atmIV: 0.2, gammaConcentration: 10, pcRatio: 1.5 }, sma: { cross: 'DEAD' },
    }, { vwap: 105, rawTickerData: { flow: { netPremium: -1000000 } } });
    assert.equal(bearish.regimeScore, 5); assert.equal(bearish.regime, 'CALM');
    assert.equal(bearish.convictionScore, 20); assert.equal(bearish.convictionGrade, 'D-');
    const output = rendered(bullish);
    assert.equal(output[0].props.value, '95 /100'); assert.equal(output[1].props.value, '80 /100');
    output.forEach(({ props }) => assert.equal(props.insightOverride, undefined));
});

// Load the whole producer with dependencies replaced before evaluation. Any
// unexpected import, network access or persistent write fails this offline test.
function offlineHub(overrides: Record<string, any> = {}) {
    const exports: any = {};
    const modules: Record<string, any> = {
        './massiveClient': {
            fetchMassive: async (path: string) => {
                if (path.includes('/snapshot/locale/')) return { ticker: { day: { c: 100 }, prevDay: { c: 99 } } };
                if (path.includes('/open-close/')) return { close: 100 };
                if (path.includes('/aggs/')) return { results: [] };
                if (path.includes('/indicators/')) return { results: { values: [] } };
                throw new Error('Unexpected offline data request');
            },
            fetchMassiveAll: async () => { throw new Error('offline options failure'); },
            ...overrides.massive,
        },
        './marketStatusProvider': { getMarketStatusSSOT: async () => ({ session: 'REG' }) },
        './holidayCache': { findWeeklyExpirationSync: (expirations: string[]) => expirations[0] || '' },
        './redisClient': {
            getFromCache: async () => null,
            setInCache: async () => assert.fail('Unexpected cache write'),
            ...overrides.cache,
        },
        './extendedSessionClose': { peekExtendedSessionCloses: async () => ({}), isTradeInExtSession: () => false },
        '@/lib/marketCalendar': { etDateOf: () => '2026-10-19', shownRegularSessionDate: () => '2026-10-19' },
        '@/lib/metrics/optionPremium': require('../src/lib/metrics/optionPremium'),
    };
    run(fs.readFileSync('src/services/centralDataHub.ts', 'utf8'), {
        exports,
        require: (id: string) => { assert.ok(id in modules, 'Unexpected dependency'); return modules[id]; },
        console: { log() {}, warn() {}, error() {} },
        setTimeout: (fn: () => void) => fn(),
    });
    return exports.CentralDataHub;
}
function assertMissingFlow(flow: any) {
    assert.equal(flow.dataSource, 'NONE');
    for (const key of ['netPremium', 'callPremium', 'putPremium', 'totalPremium', 'optionsCount']) {
        assert.equal(flow[key], null, key);
    }
}
function assertMissingCards(flow: any) {
    const result = signals({ rawTickerData: { flow } });
    assert.equal(result.convictionScore, null);
    assert.equal(result.convictionGrade, null);
    assert.equal(result.convictionLabel, '—');
    for (const locale of ['ko', 'en', 'ja']) {
        rendered(result, locale).forEach(({ props, html }) => {
            assert.equal(props.value, '—'); assert.equal(props.badge, '—');
            assert.equal(props.insightOverride, '—');
            assert.doesNotMatch(html, /50|\/100|convNeutral|중립/);
        });
    }
}
test('N4 actual price-only producer response after options lookup failure renders dashes', async () => {
    const hub = offlineHub();
    const quote = await hub.getUnifiedData('TEST', true);
    assert.equal(quote.price, 100); assert.equal(quote.rsi, null);
    assertMissingFlow(quote.flow);
    assertMissingCards(quote.flow);
});
test('N4 producer marks every unavailable chain path missing, including empty exact results', async () => {
    for (const error of [new Error('offline failure'), { httpStatus: 401 }, { httpStatus: 403 }, { httpStatus: 404 }]) {
        const hub = offlineHub({ massive: { fetchMassiveAll: async () => { throw error; } } });
        assertMissingFlow(await hub._fetchOptionsChain('TEST', 100));
    }
    const noOptions = offlineHub({ massive: { fetchMassiveAll: async () => ({ results: [] }) } });
    assertMissingFlow(await noOptions._fetchOptionsChain('TEST', 100));
    assertMissingFlow(await noOptions._fetchOptionsChain('TEST', 0));
    let requests = 0;
    const emptyExact = offlineHub({ massive: { fetchMassiveAll: async () => ({ results: ++requests === 1
        ? [{ details: { expiration_date: '2099-12-31' } }] : [] }) } });
    assertMissingFlow(await emptyExact._fetchOptionsChain('TEST', 100));
    assert.equal(requests, 2);
    const rejectedChain = offlineHub();
    rejectedChain._fetchOptionsChain = async () => { throw new Error('rejected chain'); };
    assertMissingFlow((await rejectedChain.getUnifiedData('TEST', true)).flow);
    const failedQuote = offlineHub();
    failedQuote._fetchInternal = async () => { throw new Error('rejected quote'); };
    assertMissingFlow((await failedQuote.getUnifiedData('TEST', true)).flow);
});
test('N4 old cached zero/NONE or error-marked flow cannot vote or use another flow field', () => {
    for (const failure of [{ dataSource: 'NONE' }, { error: 'offline failure' }, { dataSource: 'LIVE', error: 'offline failure' }]) {
        assertMissingCards({ netPremium: 0, optionsCount: 0, netFlow: 1000000, ...failure });
        // Available technical evidence still votes; the failed option contributes nothing.
        const result = scorePatch({ sma: { cross: 'GOLDEN' } }, {
            rawTickerData: { flow: { netPremium: -1000000, ...failure } },
        });
        assert.equal(result.convictionScore, 65);
    }
});
test('N4 successful balanced premiums remain a measured zero observation', async () => {
    const chain = ['call', 'put'].map(contract_type => ({
        details: { contract_type, expiration_date: '2099-12-31', strike_price: 100 },
        day: { volume: 10, close: 2 }, open_interest: 10, greeks: { gamma: 0.1 },
    }));
    const hub = offlineHub({ cache: { getFromCache: async () => ({
        probeResults: chain, exactResults: chain, weeklyExpiry: '2099-12-31', expirations: ['2099-12-31'], _ts: Date.now(),
    }) } });
    const flow = await hub._fetchOptionsChain('TEST', 100);
    assert.equal(flow.netPremium, 0); assert.equal(flow.optionsCount, 2);
    assert.equal(flow.totalPremium, 4000); assert.notEqual(flow.dataSource, 'NONE');
    assert.equal(signals({ rawTickerData: { flow } }).convictionScore, 50);
});

function productionNode(file: string, predicate: (n: ts.Node) => boolean): string {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const matches: string[] = [];
    const visit = (n: ts.Node) => {
        if (predicate(n)) matches.push(n.getText(source));
        ts.forEachChild(n, visit);
    };
    visit(source); assert.equal(matches.length, 1, file);
    return matches[0];
}
test('N4 Terminal evidence preserves null and measured zero for every premium alias', () => {
    const fn = productionNode('src/services/terminalEnricher.ts', n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildFlowEvidence');
    for (const [flow, expected] of [
        [{ netPremium: null, optionsCount: null, dataSource: 'NONE' }, null],
        [{ netPremium: 0, optionsCount: 0, dataSource: 'NONE' }, null],
        [{ netPremium: 1000000, error: 'offline failure' }, null],
        [{ netPremium: 0, optionsCount: 2, contractsProcessed: 2, dataSource: 'LIVE' }, 0],
        [{ netPremium: 0, optionsCount: 2, contractsProcessed: 0, dataSource: 'CALCULATED' }, null],
        [{ netPremium: 0, optionsCount: 2, dataSource: 'LIVE' }, null],
        [{ netPremium: 1000000, optionsCount: 2, dataSource: 'CALCULATED' }, 1000000],
    ] as const) {
        const evidence = run(`${fn}; buildFlowEvidence(data);`, { data: { flow } });
        for (const key of ['netPremium', 'netFlow', 'largeTradesUsd']) assert.equal(evidence[key], expected, key);
    }
});
test('N4 app Flow never reconstructs missing premium from old magnitude and call share', () => {
    const decl = productionNode('src/app/[locale]/app-view/flow/page.tsx', n => ts.isVariableDeclaration(n)
        && ts.isIdentifier(n.name) && n.name.text === 'netPremiumOverview');
    for (const flow of [{ netPremium: null }, { dataSource: 'NONE', netPremium: 0 }, { error: 'offline failure', netPremium: 0 }]) {
        assert.equal(run(`const ${decl}; netPremiumOverview;`, { tickerData: { flow }, callPct: 80, absNetPrem: 1000000 }), null);
    }
    // B4: the cell uses the one producer observation rule (netPremiumOf) — a measured 0 needs its contract count.
    assert.equal(run(`const ${decl}; netPremiumOverview;`, {
        tickerData: { flow: { netPremium: 0, contractsProcessed: 2, dataSource: 'LIVE' } }, callPct: 80, absNetPrem: 1000000,
    }), 0);
    assert.equal(run(`const ${decl}; netPremiumOverview;`, {
        tickerData: { flow: { netPremium: 0, dataSource: 'LIVE' } }, callPct: 80, absNetPrem: 1000000,
    }), null);
});
test('N4 shared web/mobile FlowSniper retains slots and labels with absent values', () => {
    const component = productionNode('src/components/FlowSniper.tsx', n => ts.isFunctionDeclaration(n) && n.name?.text === 'FlowSniper');
    for (const flow of [
        { netPremium: null, callPremium: null, putPremium: null, optionsCount: null },
        { netPremium: 0, callPremium: 0, putPremium: 0, optionsCount: 0, dataSource: 'NONE' },
        { netPremium: 0, callPremium: 0, putPremium: 0, optionsCount: 0, error: 'offline failure' },
    ]) {
        const element = run(component.replace('export function', 'function') + '; FlowSniper(flow);', {
            flow, useTranslations: () => (key: string) => key,
            Target: () => null, Info: () => null, TrendingUp: () => null,
        });
        const html = renderToStaticMarkup(element);
        for (const label of ['flowMonitor', 'netPremiumFlow', 'callPrem', 'putPrem', 'volumeStrength']) assert.ok(html.includes(label), label);
        assert.match(html, /—/); assert.doesNotMatch(html, /\$0|50%|bearish|bullish|NaN|Infinity/);
    }
    for (const file of ['src/components/LiveTickerDashboard.tsx', 'src/components/intel/mobile/MobileCmdOptions.tsx', 'src/components/intel/mobile/MobileCmdFlow.tsx']) {
        const jsx = productionNode(file, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'FlowSniper');
        const element = run(`(${jsx});`, { FlowSniper: () => null, liveQuote: { flow: { netPremium: null, callPremium: null, putPremium: null, optionsCount: null, dataSource: 'NONE' } } });
        assert.equal(element.props.dataSource, 'NONE');
        for (const key of ['netPremium', 'callPremium', 'putPremium', 'optionsCount']) assert.equal(element.props[key], null, `${file}: ${key}`);
    }
});

test('N4 FlowSniper keeps every existing translation label key', () => {
    const file = 'src/components/FlowSniper.tsx';
    const keys = (code: string) => {
        const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const found: string[] = [];
        const visit = (n: ts.Node) => {
            if (ts.isCallExpression(n) && n.expression.getText(ast) === 't'
                && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) found.push(n.arguments[0].text);
            ts.forEachChild(n, visit);
        };
        visit(ast); return [...new Set(found)].sort();
    };
    assert.deepEqual(keys(fs.readFileSync(file, 'utf8')), keys(execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })));
});

test('N4 tickerOverview never promotes a failed flow with stale rawChain to OK', () => {
    const guard = productionNode('src/services/tickerOverview.ts', n => ts.isIfStatement(n)
        && n.expression.getText().includes('unified.flow.rawChain &&'));
    for (const failure of [{ dataSource: 'NONE' }, { error: 'offline failure' }]) {
        const result = { options: { status: 'PENDING', netPremium: null } };
        run(guard, { unified: { flow: { ...failure, rawChain: [{}], netPremium: 0 } }, result });
        assert.equal(result.options.status, 'PENDING');
        assert.equal(result.options.netPremium, null);
    }
    const result = { options: { status: 'PENDING', netPremium: null } };
    run(guard, { unified: { flow: { dataSource: 'LIVE', rawChain: [{}], netPremium: 0 } }, result });
    assert.equal(result.options.status, 'OK'); assert.equal(result.options.netPremium, 0);
});
test('N4 FlowSniper successful positive, negative and balanced flows preserve previous rendering', () => {
    const file = 'src/components/FlowSniper.tsx';
    const previous = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' });
    const ast = ts.createSourceFile(file, previous, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const oldComponent = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'FlowSniper')!.getText(ast);
    const newComponent = productionNode(file, n => ts.isFunctionDeclaration(n) && n.name?.text === 'FlowSniper');
    const html = (component: string, flow: any) => renderToStaticMarkup(run(component.replace('export function', 'function') + '; FlowSniper(flow);', {
        flow, useTranslations: () => (key: string, args?: any) => args ? `${key}:${args.count}` : key,
        Target: () => null, Info: () => null, TrendingUp: () => null,
    })).replace(/<!--.*?-->/g, '');
    for (const [callPremium, putPremium] of [[2000000, 1000000], [1000000, 2000000], [1000000, 1000000]]) {
        const flow = { callPremium, putPremium, netPremium: callPremium - putPremium, optionsCount: 2, dataSource: 'LIVE' };
        assert.equal(html(newComponent, flow), html(oldComponent, flow));
    }
});

const intelFile = 'src/app/[locale]/intel/IntelClientPage.tsx';
const intelPremium = productionNode(intelFile, n => ts.isCallExpression(n)
    && n.expression.getText().startsWith('(() =>')
    && n.getText().includes('const displayNetPremium ='));
const intelQuote = productionNode(intelFile, n => ts.isFunctionDeclaration(n) && n.name?.text === 'processTickerData');
const intelFlowSection = productionNode(intelFile, n => ts.isJsxElement(n)
    && n.openingElement.tagName.getText() === 'section' && n.getText().includes('Net Whale Flow'));
function intelFlow(flow: any, session: any, snapshotPremium?: any, locale = 'ko', code = intelPremium) {
    const messages = JSON.parse(fs.readFileSync(`src/messages/${locale}.json`, 'utf8')).intel;
    const element = run(`(${code});`, {
        ev: { flow: { vol: 10000, offExPct: 10, ...flow }, price: { last: 100 } },
        item: { decisionSSOT: { snapshotData: { netPremium: snapshotPremium } } },
        liveQuote: { session, volume: 10000 }, isLive: false, Layers: () => null,
        ti: (key: string) => messages[key],
    });
    return renderToStaticMarkup(element).replace(/<!--.*?-->/g, '');
}

test('N4 Intel actual failed Hub -> Terminal flow retains amount/description dashes in every session and locale', async () => {
    const quote = await offlineHub().getUnifiedData('TEST', true);
    const build = productionNode('src/services/terminalEnricher.ts', n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildFlowEvidence');
    const flow = run(`${build}; buildFlowEvidence(data);`, { data: quote });
    assert.equal(flow.netPremium, null); assert.equal(flow.complete, false);
    for (const locale of ['ko', 'en', 'ja']) {
        for (const session of ['REG', 'PRE', 'POST', 'CLOSED', null, undefined, 'UNKNOWN']) {
            const html = intelFlow(flow, session, undefined, locale, intelFlowSection);
            for (const label of ['Flow Dynamics', 'Net Whale Flow', 'INSTITUTIONAL']) assert.ok(html.includes(label));
            assert.equal((html.match(/—/g) || []).length, 2, html);
            assert.doesNotMatch(html, /\$0\.0M|NaN|Infinity/);
            const messages = JSON.parse(fs.readFileSync(`src/messages/${locale}.json`, 'utf8')).intel;
            assert.ok(!html.includes(messages.marketClosedNoFlow));
        }
    }
});

test('N4 Intel incomplete/invalid premiums and legacy zero snapshots never become observed zero', () => {
    for (const complete of [false, undefined]) {
        for (const netPremium of [null, undefined, 0, 1000000, -1000000, NaN, Infinity, '0']) {
            for (const snapshot of [undefined, null, 0, NaN, Infinity, '1000000']) {
                const html = intelFlow({ netPremium, complete }, 'CLOSED', snapshot);
                assert.equal((html.match(/—/g) || []).length, 2, html);
                assert.doesNotMatch(html, /\$|장 마감|NaN|Infinity|%/);
            }
        }
    }
    for (const netPremium of [null, undefined, NaN, Infinity, -Infinity, '0', false]) {
        assert.equal((intelFlow({ netPremium, complete: true }, 'REG').match(/—/g) || []).length, 2);
    }
});

test('N4 Intel measured zero survives a conflicting snapshot; closed copy requires explicit closed session', () => {
    for (const locale of ['ko', 'en', 'ja']) {
        const messages = JSON.parse(fs.readFileSync(`src/messages/${locale}.json`, 'utf8')).intel;
        for (const session of ['REG', 'PRE', 'POST', 'CLOSED', null, undefined, 'UNKNOWN']) {
            const html = intelFlow({ netPremium: 0, complete: true }, session, 5000000, locale);
            assert.match(html, /\$0\.0M/); assert.doesNotMatch(html, /\$5\.0M|%/);
            assert.equal(html.includes(messages.marketClosedNoFlow), session === 'POST' || session === 'CLOSED', html);
            assert.equal(html.includes('>—</span>'), session !== 'POST' && session !== 'CLOSED', html);
            assert.ok(!html.includes(messages.snapshotTimeData));
        }
    }
});

test('N4 Intel signed snapshot fallback stays marked as snapshot and never claims closed/no flow', () => {
    for (const premium of [2000000, -2000000]) {
        const html = intelFlow({ netPremium: null, complete: false }, 'CLOSED', premium);
        assert.match(html, premium > 0 ? /\$2\.0M/ : /\$-2\.0M/);
        const messages = JSON.parse(fs.readFileSync('src/messages/ko.json', 'utf8')).intel;
        assert.ok(html.includes(messages.snapshotTimeData));
        assert.ok(!html.includes(messages.marketClosedNoFlow));
    }
});

test('N4 Intel measured signed premiums retain previous HTML in every locale and session', () => {
    const previous = execFileSync('git', ['show', `HEAD:${intelFile}`], { encoding: 'utf8' });
    const source = ts.createSourceFile(intelFile, previous, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let oldPremium = '';
    const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && n.expression.getText(source).startsWith('(() =>')
            && n.getText(source).includes('const displayNetPremium =')) oldPremium = n.getText(source);
        ts.forEachChild(n, visit);
    };
    visit(source); assert.ok(oldPremium);
    for (const locale of ['ko', 'en', 'ja']) {
        for (const session of ['REG', 'PRE', 'POST', 'CLOSED']) {
            for (const netPremium of [2000000, -2000000]) {
                const flow = { netPremium, complete: true };
                assert.equal(intelFlow(flow, session, undefined, locale), intelFlow(flow, session, undefined, locale, oldPremium));
            }
        }
    }
});

test('N4 Intel quote mapper preserves unknown session instead of manufacturing CLOSED', () => {
    for (const session of [undefined, null, 'REG', 'PRE', 'POST', 'CLOSED']) {
        const quote = run(`${intelQuote}; processTickerData(data);`, { data: { session, display: { price: 100 } } });
        assert.equal(quote.session, session ?? null); assert.equal(quote.price, 100);
        const html = intelFlow({ netPremium: 0, complete: true }, quote.session);
        assert.equal(html.includes('장 마감'), session === 'POST' || session === 'CLOSED');
    }
    const source = fs.readFileSync(intelFile, 'utf8');
    assert.equal((source.match(/processTickerData\(data\)/g) || []).length, 1, 'check every quote mapper caller');
    const drawer = productionNode(intelFile, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'TickerEvidenceDrawer');
    const element = run(`(${drawer});`, {
        TickerEvidenceDrawer: () => null, selectedTicker: { ticker: 'TEST' },
        liveQuotes: { TEST: { session: 'REG' } }, setSelectedTicker: () => {},
    });
    assert.equal(element.props.liveQuote.session, 'REG');
});

// ── 2026-10-19 Claude fix: gate 10190737 findings ①②③ + original N4 repro + measured zero, all offline ──
const unpricedChain = ['call', 'put'].map(contract_type => ({
    details: { contract_type, expiration_date: '2099-12-31', strike_price: 100 },
    day: { volume: 0 }, open_interest: 10, greeks: { gamma: 0.1 },
}));
const pricedChain = ['call', 'put'].map(contract_type => ({
    details: { contract_type, expiration_date: '2099-12-31', strike_price: 100 },
    day: { volume: 10, close: 2 }, open_interest: 10, greeks: { gamma: 0.1 },
}));
function cachedChainHub(chain: any[]) {
    return offlineHub({ cache: { getFromCache: async () => ({
        probeResults: chain, exactResults: chain, weeklyExpiry: '2099-12-31', expirations: ['2099-12-31'], _ts: Date.now(),
    }) } });
}
const terminalBuild = () => productionNode('src/services/terminalEnricher.ts', n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildFlowEvidence');

test('gate① chain with contracts but no price/volume is unmeasured premium, OI-based values kept', async () => {
    const flow = await cachedChainHub(unpricedChain)._fetchOptionsChain('TEST', 100);
    assert.equal(flow.contractsProcessed, 0);
    for (const key of ['netPremium', 'callPremium', 'putPremium', 'totalPremium']) assert.equal(flow[key], null, key);
    // The chain itself was observed: count, chain and OI levels are not hidden.
    assert.equal(flow.optionsCount, 2); assert.equal(flow.rawChain.length, 2);
    assert.equal(typeof flow.gamma, 'number'); assert.equal(netPremiumOf(flow), null);
    // Command conviction: no vote → dash (price-only otherwise).
    assertMissingCards(flow);
    // Terminal → Intel: incomplete, and CLOSED session never claims "$0.0M · market closed, no flow".
    const evidence = run(`${terminalBuild()}; buildFlowEvidence(data);`, { data: { volume: 10000, flow } });
    assert.equal(evidence.netPremium, null); assert.equal(evidence.complete, false);
    for (const locale of ['ko', 'en', 'ja']) {
        const messages = JSON.parse(fs.readFileSync(`src/messages/${locale}.json`, 'utf8')).intel;
        for (const session of ['REG', 'POST', 'CLOSED']) {
            const html = intelFlow(evidence, session, undefined, locale, intelFlowSection);
            assert.doesNotMatch(html, /\$0\.0M/); assert.ok(!html.includes(messages.marketClosedNoFlow));
        }
    }
    // Old cached payload of the same shape (zeros + contractsProcessed 0) is judged the same way.
    assert.equal(netPremiumOf({ netPremium: 0, callPremium: 0, putPremium: 0, optionsCount: 2, contractsProcessed: 0, dataSource: 'CALCULATED' }), null);
});
test('gate① OI × prev-close fallback (no live volume) remains a measured premium', async () => {
    const chain = ['call', 'put'].map((contract_type, i) => ({
        details: { contract_type, expiration_date: '2099-12-31', strike_price: 100 },
        day: { volume: 0, previous_close: i === 0 ? 3 : 1 }, open_interest: 10, greeks: { gamma: 0.1 },
    }));
    const flow = await cachedChainHub(chain)._fetchOptionsChain('TEST', 100);
    assert.equal(flow.contractsProcessed, 2); assert.equal(flow.dataSource, 'CALCULATED');
    assert.equal(flow.netPremium, 2000); assert.equal(netPremiumOf(flow), 2000);
});

// flowTokens: real module, with '@/…' aliases mapped to the real files (formatting helpers only).
function flowTokensFromDeepSnapshot(snap: any) {
    const exports: any = {};
    const modules: Record<string, any> = {
        '@/lib/optionLevelGate': require('../src/lib/optionLevelGate'),
        '@/lib/ai/trustLayer': { splitSentences: (t: string) => [t] },
    };
    run(fs.readFileSync('src/lib/ai/flowTokens.ts', 'utf8'), {
        exports, require: (id: string) => { assert.ok(id in modules, `Unexpected dependency ${id}`); return modules[id]; },
    });
    return exports.flowTokensFromDeepSnapshot(snap);
}
function deepSnapshotModule() {
    const exports: any = {};
    const modules: Record<string, any> = {
        '@/lib/earningsDate': require('../src/lib/earningsDate'),
        '@/lib/vwap': require('../src/lib/vwap'),
        '@/lib/premiumFlow': require('../src/lib/premiumFlow'),
        '@/lib/metrics/volatilityRegime': require('../src/lib/metrics/volatilityRegime'),
        '@/lib/commandScores': { commandScores },
        '@/lib/metrics/observation': require('../src/lib/metrics/observation'),
        '@/lib/commandConviction': require('../src/lib/commandConviction'),
        '@/lib/defs/market': require('../src/lib/defs/market'),
        '@/lib/defs/gexTimeline': require('../src/lib/defs/gexTimeline'),
    };
    run(fs.readFileSync('src/lib/ai/deepSnapshot.ts', 'utf8'), {
        exports, require: (id: string) => { assert.ok(id in modules, `Unexpected dependency ${id}`); return modules[id]; },
    });
    return exports;
}
const deepPromptLine = (() => {
    const src = fs.readFileSync('src/lib/ai/deepMaterialPrompt.ts', 'utf8');
    const lines = src.split('\n').filter(l => l.includes('<net_premium>'));
    assert.equal(lines.length, 1); return lines[0].trim();
})();
const deepPrompt = (flow: any) => run('`' + deepPromptLine + '`', { flow });
test('gate② AI input keeps missing premium missing (no NET_PREM placeholder), measured zero stays 0', async () => {
    const { buildDeepSnapshot } = deepSnapshotModule();
    const base = { ticker: 'TEST', price: 100, priceChange: 0, session: 'CLOSED', unified: {}, insider: null, technicals: null, creditSpread: null };
    const unmeasured = await cachedChainHub(unpricedChain)._fetchOptionsChain('TEST', 100);
    for (const flow of [
        { netPremium: null, dataSource: 'NONE' }, { netPremium: 0, dataSource: 'NONE' }, { netPremium: 0, error: 'x' },
        unmeasured, null, undefined, {},
    ]) {
        const snap = buildDeepSnapshot({ ...base, rawTickerData: { flow } });
        assert.equal(snap.flow.netPremium, null, JSON.stringify(flow));
        assert.equal('NET_PREM' in flowTokensFromDeepSnapshot(snap), false);
        assert.equal(deepPrompt(snap.flow), '<net_premium>N/A</net_premium>');
    }
    const measured = await cachedChainHub(pricedChain)._fetchOptionsChain('TEST', 100);
    const zero = buildDeepSnapshot({ ...base, rawTickerData: { flow: measured } });
    assert.equal(zero.flow.netPremium, 0); assert.equal(flowTokensFromDeepSnapshot(zero).NET_PREM, 0);
    assert.equal(deepPrompt(zero.flow), '<net_premium>$0.0M (NEUTRAL)</net_premium>');
    const signed = buildDeepSnapshot({ ...base, rawTickerData: { flow: { netPremium: -3800000, contractsProcessed: 4 } } });
    assert.equal(deepPrompt(signed.flow), '<net_premium>$3.8M (PUT dominant)</net_premium>');
    assert.equal(deepPrompt({ netPremium: 2500000 }), '<net_premium>+$2.5M (CALL dominant)</net_premium>');
});

// Command hero: production premium selection + production card JSX.
const heroSelect = productionNode(file, n => ts.isPropertyAssignment(n) && n.name.getText() === 'netPremium'
    && n.initializer.getText().includes('netPremiumOf(')).replace(/^netPremium:\s*/, '');
const heroCard = (code: string) => {
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const visit = (n: ts.Node) => {
        if (ts.isJsxElement(n) && n.openingElement.getText(source).includes('s.heroMetricCard')
            && n.getText(source).includes("premiumLabel('net'")) found.push(n.getText(source));
        ts.forEachChild(n, visit);
    };
    visit(source); assert.equal(found.length, 1); return found[0];
};
const heroHtml = (card: string, netPremium: any, locale = 'ko') => renderToStaticMarkup(run(`(${card});`, {
    data: { premium: { netPremium } }, locale, premiumLabel, MetricInfo: () => null,
    s: new Proxy({}, { get: (_t, k) => String(k) }),
})).replace(/<!--.*?-->/g, '');
const pickHero = (flow: any, structure: any) => run(`(${heroSelect});`, { flow: flow ?? {}, u: { structure } });
test('gate③ Command hero keeps a measured zero instead of overwriting it with unified $2.0M', async () => {
    const card = heroCard(fs.readFileSync(file, 'utf8'));
    const measuredZero = await cachedChainHub(pricedChain)._fetchOptionsChain('TEST', 100);
    assert.equal(measuredZero.netPremium, 0);
    const unified2M = { netPremium: 2000000, premiumContracts: 5 };
    const picked = pickHero(measuredZero, unified2M);
    assert.equal(picked, 0);
    for (const locale of ['ko', 'en', 'ja']) {
        const html = heroHtml(card, picked, locale);
        assert.match(html, /\$0K/); assert.doesNotMatch(html, /\$2\.0M|콜 우세|Call dominant|コール優勢|풋 우세/);
        assert.ok(html.includes(premiumLabel('net', locale)));
    }
    // Live unmeasured → the other producer's *measured* value may fill; unmeasured/legacy zero there stays a dash.
    const unmeasured = await cachedChainHub(unpricedChain)._fetchOptionsChain('TEST', 100);
    for (const live of [unmeasured, { netPremium: null, dataSource: 'NONE' }, null]) {
        assert.equal(pickHero(live, unified2M), 2000000);
        assert.equal(pickHero(live, { netPremium: 0, premiumContracts: 0 }), null);
        assert.equal(pickHero(live, { netPremium: 0 }), null);
        assert.equal(pickHero(live, null), null);
        assert.equal(pickHero(live, { netPremium: 0, premiumContracts: 3 }), 0);
    }
    const dash = heroHtml(card, null);
    assert.equal((dash.match(/—/g) || []).length, 2, dash); assert.doesNotMatch(dash, /\$|콜 우세|풋 우세/);
});
test('gate③ Command hero nonzero signed premiums render exactly as origin/main', () => {
    const previous = execFileSync('git', ['show', `origin/main:${file}`], { encoding: 'utf8' });
    const oldCard = heroCard(previous); const newCard = heroCard(fs.readFileSync(file, 'utf8'));
    for (const locale of ['ko', 'en', 'ja']) {
        for (const v of [3800000, -3800000, 450000, -450000, 1000000, -999]) {
            assert.equal(heroHtml(newCard, v, locale), heroHtml(oldCard, v, locale), String(v));
        }
    }
});
test('N4 original repro: price valid, GEX/flip/IV/technical/flow all missing → both scores dash', async () => {
    const unmeasured = await cachedChainHub(unpricedChain)._fetchOptionsChain('TEST', 100);
    for (const flow of [null, { netPremium: null, dataSource: 'NONE' }, unmeasured]) {
        const result = signals({ rawTickerData: { prices: { price: 100 }, flow } });
        assert.equal(result.regimeScore, null); assert.equal(result.regime, null);
        assert.equal(result.convictionScore, null); assert.equal(result.convictionGrade, null);
    }
});
test('N4 measured zero premium is a conviction vote of 0 (not dropped, not defaulted)', async () => {
    const measuredZero = await cachedChainHub(pricedChain)._fetchOptionsChain('TEST', 100);
    assert.equal(signals({ rawTickerData: { flow: measuredZero } }).convictionScore, 50);
    assert.equal(scorePatch({ sma: { cross: 'GOLDEN' } }, { rawTickerData: { flow: measuredZero } }).convictionScore, 65);
    const evidence = run(`${terminalBuild()}; buildFlowEvidence(data);`, { data: { volume: 10000, flow: measuredZero } });
    assert.equal(evidence.netPremium, 0); assert.equal(evidence.complete, true);
});
test('structureService emits the premium contract count next to the unchanged netPremium', () => {
    const src = fs.readFileSync('src/services/structureService.ts', 'utf8');
    assert.match(src, /if \(vol > 0 && lastPrice > 0\) \{\s*if \(c\.type === 'call'\) callPremiumVol \+= vol \* lastPrice \* 100;\s*else putPremiumVol \+= vol \* lastPrice \* 100;\s*premiumContracts\+\+;/);
    assert.match(src, /netPremium: Math\.round\(callPremiumVol - putPremiumVol\),\s*premiumContracts,/);
});
test('netPremiumOf: single observation rule', () => {
    for (const [flow, expected] of [
        [null, null], [undefined, null], [{}, null], [{ netPremium: null }, null], [{ netPremium: NaN }, null],
        [{ netPremium: '5' }, null], [{ netPremium: 5, dataSource: 'NONE' }, null], [{ netPremium: 5, error: 'e' }, null],
        [{ netPremium: 0, contractsProcessed: 1 }, 0], [{ netPremium: 0, contractsProcessed: 0 }, null],
        [{ netPremium: 7, contractsProcessed: 0 }, null], [{ netPremium: 0, premiumContracts: 2 }, 0],
        [{ netPremium: 0 }, null], [{ netPremium: -7 }, -7],
    ] as const) assert.equal(netPremiumOf(flow), expected, JSON.stringify(flow));
});
test('gate④ every deep-analysis caller sends missing premium as null (web dashboard, mobile overview)', async () => {
    const unmeasured = await cachedChainHub(unpricedChain)._fetchOptionsChain('TEST', 100);
    const measured = await cachedChainHub(pricedChain)._fetchOptionsChain('TEST', 100);
    const { buildDeepSnapshot } = deepSnapshotModule();
    const base = { ticker: 'CALLERS', price: 100, priceChange: 0, session: 'CLOSED', unified: {}, insider: null, technicals: null, creditSpread: null };
    const webInput = productionNode('src/components/LiveTickerDashboard.tsx', n => ts.isPropertyAssignment(n)
        && n.name.getText() === 'rawTickerData' && n.initializer.getText().includes('liveQuote?.flow'));
    // A fresh ticker per independent case: the AI material keeps per-ticker last-good values (shared rule 3).
    let seq = 0;
    const web = (flow: any) => buildDeepSnapshot({ ...base, ticker: `CALLERS${++seq}`, ...run(`({${webInput}});`, { liveQuote: { flow }, initialStockData: null }) }).flow;
    for (const flow of [unmeasured, { netPremium: null, dataSource: 'NONE' }, { netPremium: 0, dataSource: 'NONE' }, null]) {
        assert.equal(web(flow).netPremium, null); assert.equal(deepPrompt(web(flow)), '<net_premium>N/A</net_premium>');
    }
    assert.equal(web(measured).netPremium, 0); assert.equal(deepPrompt(web(measured)), '<net_premium>$0.0M (NEUTRAL)</net_premium>');
    assert.equal(web({ netPremium: 2500000, contractsProcessed: 3 }).netPremium, 2500000);
    const mobileInput = productionNode('src/components/intel/mobile/MobileCmdOverview.tsx', n => ts.isPropertyAssignment(n)
        && n.name.getText() === 'rawTickerData' && n.initializer.getText().includes('q.netPremium'));
    const mobile = (netPremium: any) => buildDeepSnapshot({ ...base, ticker: `CALLERS${++seq}`, ...run(`({${mobileInput}});`, { q: { netPremium }, vwap: null }) }).flow;
    for (const v of [null, undefined, 0, NaN]) assert.equal(mobile(v).netPremium, null);
    assert.equal(mobile(-1200000).netPremium, -1200000);
    // No remaining `|| 0` / `?? 0` premium coercion in any snapshot builder.
    for (const f of ['src/components/LiveTickerDashboard.tsx', 'src/components/intel/mobile/MobileCmdOverview.tsx', 'src/lib/ai/deepSnapshot.ts']) {
        assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /flow: \{\s*netPremium: [^\n]*(\|\| 0|\?\? 0)/, f);
    }
});
