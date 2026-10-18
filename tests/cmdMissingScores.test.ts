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
        [{ netPremium: 0, optionsCount: 2, dataSource: 'LIVE' }, 0],
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
    assert.equal(run(`const ${decl}; netPremiumOverview;`, {
        tickerData: { flow: { netPremium: 0, dataSource: 'LIVE' } }, callPct: 80, absNetPrem: 1000000,
    }), 0);
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
