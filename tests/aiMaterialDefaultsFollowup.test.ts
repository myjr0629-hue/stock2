/** Gate 10191257 reproductions. Executes production expressions/hooks offline. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { test } from 'node:test';
import { buildDeepSnapshot, type DeepSnapshotInput } from '../src/lib/ai/deepSnapshot';
import { deepMetricXml } from '../src/lib/ai/deepMaterialPrompt';
import { deepMaterialIssues } from '../src/lib/ai/deepTrust';
import { flowTokensFromDeepSnapshot, flowTokenRules } from '../src/lib/ai/flowTokens';
import { normalizeVwap } from '../src/lib/vwap';

import { computeUnifiedVolatilityRegime } from '../src/lib/metrics/volatilityRegime';
const webFile = 'src/components/LiveTickerDashboard.tsx';
const mobileFile = 'src/components/intel/mobile/MobileCmdOverview.tsx';
const ast = (file: string) => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(file: string, predicate: (n: ts.Node) => boolean): string {
    const tree = ast(file);
    let found = '';
    const visit = (n: ts.Node) => { if (predicate(n)) found = n.getText(tree); ts.forEachChild(n, visit); };
    visit(tree);
    assert.ok(found, `source region missing: ${file}`);
    return found;
}
function run(code: string, context: Record<string, any>) {
    const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
    return vm.runInNewContext(js, context);
}
function input(ticker: string, structure: any): DeepSnapshotInput {
    return { ticker, price: 100, priceChange: 0, session: 'CLOSED', unified: { structure },
        rawTickerData: {}, insider: null, technicals: null, creditSpread: null };
}
function webSnapshot(ticker: string, structure: any, volatility: any = null) {
    const context = {
        React: { useMemo: (fn: () => any) => fn() }, buildDeepSnapshot,
        ticker, structure, volatilityData: volatility, unifiedData: { volatility }, initialUnifiedData: null,
        // B5: the card and the AI read the same selected edition (lib/metrics/observation).
        volatilityObservation: { data: { structure, volatility } }, computeUnifiedVolatilityRegime,
        convictionSnapshot: { inputs: undefined },
        livePrice: { price: 100 }, initialStockData: null, displayPrice: 100, displayChangePct: 0,
        effectiveSession: 'CLOSED', _swrQuote: null, ssrFallback: null, effectiveSma: null,
        effectiveFund: null, effectiveAnalyst: null, effectiveSqueeze: null, effectiveRelated: null,
        effectiveEarnings: null, daysFromEarningsLabel: () => null, liveQuote: null, insiderData: null,
    };
    const derived = find(webFile, n => ts.isVariableDeclaration(n) && n.name.getText() === 'effectiveVol');
    const call = find(webFile, n => ts.isCallExpression(n) && n.expression.getText() === 'buildDeepSnapshot');
    return run(`const ${derived}; ({ effectiveVol, snapshot: ${call} });`, context);
}

test('web: real effectiveVol 0/LOW never becomes an AI observation; no prior means null', () => {
    const { effectiveVol, snapshot } = webSnapshot('WEB_GATE_MISSING', { netGex: 10_000_000 });
    // B5: the shared card calculation no longer fabricates 0/LOW for a missing squeeze input.
    assert.equal(effectiveVol.squeezeScore, null);
    assert.equal(effectiveVol.squeezeRisk, null);
    assert.equal(snapshot.structure.squeezeScore, null);
    assert.equal(snapshot.structure.squeezeRisk, null);
    assert.match(deepMetricXml(snapshot), /squeeze_risk>N\/A \(N\/A%\)/);
    assert.doesNotMatch(deepMetricXml(snapshot), /squeeze_risk>LOW \(0%\)/);
    const tokens = flowTokensFromDeepSnapshot(snapshot);
    assert.equal('SQUEEZE' in tokens, false);
    assert.doesNotMatch(flowTokenRules(tokens), /\{SQUEEZE\}/);
});

test('web: missing squeeze uses only dated last good and keeps its original date', () => {
    const asOf = '2026-10-16T20:00:00.000Z';
    webSnapshot('WEB_GATE_HISTORY', { netGex: 10_000_000 }, { squeezeScore: 45, squeezeRisk: 'HIGH', asOf });
    for (let i = 0; i < 2; i++) {
        const { snapshot } = webSnapshot('WEB_GATE_HISTORY', { netGex: 12_000_000 });
        assert.equal(snapshot.structure.squeezeScore, 45);
        assert.equal(snapshot.structure.squeezeRisk, 'HIGH');
        assert.deepEqual(snapshot.sources['structure.squeezeScore'], { asOf, historical: true });
        assert.deepEqual(snapshot.sources['structure.squeezeRisk'], { asOf, historical: true });
        assert.match(deepMetricXml(snapshot), /2026-10-16T20:00:00.000Z/);
    }
    const { snapshot } = webSnapshot('WEB_GATE_ZERO', { netGex: 1 }, { squeezeScore: 0, squeezeRisk: 'LOW' });
    assert.equal(snapshot.structure.squeezeScore, 0, 'a real producer zero remains measured');
    assert.match(deepMetricXml(snapshot), /squeeze_risk>LOW \(0%\)/);
});

test('producer-shaped gamma 70/STICKY and measured zero survive; no-OI placeholder stays null', () => {
    for (const extra of [{ debug: { todayOI: 1000 } }, {}]) {
        const s = buildDeepSnapshot(input('GAMMA_GATE', { gammaConcentration: 70, gammaConcentrationLabel: 'STICKY', ...extra }));
        assert.equal(s.structure.gammaConcentration, 70);
        assert.equal(s.structure.gammaConcentrationLabel, 'STICKY');
        assert.match(deepMetricXml(s), /gamma_concentration>70% \(STICKY\)/);
    }
    const zero = buildDeepSnapshot(input('GAMMA_GATE_ZERO', {
        gammaConcentration: 0, gammaConcentrationLabel: 'LOOSE', debug: { todayOI: 1000 },
    }));
    assert.equal(zero.structure.gammaConcentration, 0);
    assert.equal(zero.structure.gammaConcentrationLabel, 'LOOSE');
    const missing = buildDeepSnapshot(input('GAMMA_GATE_NO_OI', {
        gammaConcentration: 0, gammaConcentrationLabel: 'LOOSE', debug: { todayOI: 0 },
    }));
    assert.equal(missing.structure.gammaConcentration, null);
    assert.equal(missing.structure.gammaConcentrationLabel, null);
});

// Run the component's actual pre-JSX hooks with deterministic React scheduling.
// Fetch is injected: no browser, server, provider or external writes.
function mobileHarness(fetcher?: (body: any, signal: AbortSignal) => Promise<any>) {
    const tree = ast(mobileFile);
    const component = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'MobileCmdOverview') as ts.FunctionDeclaration;
    assert.ok(component?.body);
    const statements = component.body.statements;
    const end = statements.findIndex(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(tree) === 'toggleSection'));
    assert.ok(end > 0);
    const source = statements.slice(0, end).map(n => n.getText(tree)).join('\n');
    type Slot = { value?: any; deps?: any[]; cleanup?: any; effect?: () => any };
    const slots: Slot[] = [];
    const pending: number[] = [];
    const requests: Array<{ body: any; signal: AbortSignal }> = [];
    let cursor = 0;
    const changed = (a?: any[], b?: any[]) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
    const useState = (initial: any) => {
        const i = cursor++;
        if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
        return [slots[i].value, (v: any) => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }];
    };
    const useRef = (initial: any) => {
        const i = cursor++;
        if (!slots[i]) slots[i] = { value: { current: initial } };
        return slots[i].value;
    };
    const useMemo = (fn: () => any, deps: any[]) => {
        const i = cursor++;
        if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
        return slots[i].value;
    };
    const useEffect = (effect: () => any, deps: any[]) => {
        const i = cursor++;
        if (!slots[i] || changed(slots[i].deps, deps)) {
            slots[i] = { ...slots[i], deps, effect };
            pending.push(i);
        }
    };
    const context: any = {
        useState, useRef, useMemo, useEffect, useCallback: (fn: any, deps: any[]) => useMemo(() => fn, deps),
        useLocale: () => 'ko', useTranslations: () => () => '', normalizeVwap, buildDeepSnapshot, deepMaterialIssues,
        volatilityData: undefined, volatilitySource: undefined, convictionInputs: undefined,
        AbortController,
        fetch: async (url: string, options?: any) => {
            if (url !== '/api/command/deep-analysis') return { json: async () => ({ data: [] }) };
            const body = JSON.parse(options.body);
            requests.push({ body, signal: options.signal });
            if (fetcher) return fetcher(body, options.signal);
            return deepMaterialIssues(body.snapshot).ok
                ? { ok: true, status: 200, json: async () => ({ currentState: `analysis:${body.ticker}` }) }
                : { ok: false, status: 422 };
        },
    };
    const render = (props: any) => {
        cursor = 0;
        const state = run(`(() => { ${source}\nreturn { aiData, aiLoading }; })()`, { ...context, ...props });
        for (const i of pending.splice(0)) { slots[i].cleanup?.(); slots[i].cleanup = slots[i].effect!(); }
        return state;
    };
    const strictReplay = () => {
        for (const slot of slots) if (slot.effect) slot.cleanup?.();
        for (const slot of slots) if (slot.effect) slot.cleanup = slot.effect();
    };
    const unmount = () => { for (const slot of slots) slot.cleanup?.(); };
    return { render, requests, strictReplay, unmount };
}
const props = (ticker: string, unified: any = null) => ({ ticker, quote: { price: 100, changePct: 0, session: 'CLOSED' }, unified, unifiedLoading: !unified, sourceVwap: null });
// B5: a lone GEX is a partial regime input (no score), so a third observed group is the squeeze card.
const complete = { structure: { netGex: 10_000_000 }, sma: { cross: 'GOLDEN', sma50: 99 }, squeeze: { siPercent: 12.5 } };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('mobile PRO: cache miss/422 before unified, then actual material triggers one successful retry', async () => {
    const h = mobileHarness();
    const cold = props('MOBILE_GATE');
    h.render(cold);
    await settle();
    assert.equal(h.requests.length, 1);
    assert.equal(deepMaterialIssues(h.requests[0].body.snapshot).ok, false);
    assert.equal(h.render(cold).aiData, null);
    const ready = props('MOBILE_GATE', complete);
    h.render(ready);
    await settle();
    assert.equal(h.requests.length, 2);
    assert.equal(deepMaterialIssues(h.requests[1].body.snapshot).ok, true);
    const state = h.render(ready);
    assert.equal(state.aiData.currentState, 'analysis:MOBILE_GATE');
    assert.equal(state.aiLoading, false);
    for (let i = 0; i < 5; i++) h.render({ ...ready, quote: { ...ready.quote, price: 101 + i } });
    h.render(cold); h.render(ready);
    assert.equal(h.requests.length, 2, 'quote changes/readiness flaps must not loop generation');
    h.unmount();
});

test('mobile: initially complete material requests once; StrictMode abort/replay still resolves', async () => {
    const h = mobileHarness();
    const ready = props('MOBILE_STRICT', complete);
    h.render(ready);
    h.strictReplay();
    await settle();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[0].signal.aborted, true);
    assert.equal(h.requests[1].signal.aborted, false);
    assert.equal(h.render(ready).aiData.currentState, 'analysis:MOBILE_STRICT');
    h.render({ ...ready, unified: { ...complete } });
    assert.equal(h.requests.length, 2);
    h.unmount();
});

test('mobile: stale response/finally after ticker switch cannot overwrite the active analysis', async () => {
    let release: (value: any) => void = () => {};
    const h = mobileHarness(async body => body.ticker === 'MOBILE_OLD'
        ? new Promise(resolve => { release = resolve; })
        : { ok: true, json: async () => ({ currentState: 'new analysis' }) });
    h.render(props('MOBILE_OLD', complete));
    h.render(props('MOBILE_NEW', complete));
    await settle();
    assert.equal(h.requests[0].signal.aborted, true);
    release({ ok: true, json: async () => ({ currentState: 'old analysis' }) });
    await settle();
    const state = h.render(props('MOBILE_NEW', complete));
    assert.equal(state.aiData.currentState, 'new analysis');
    assert.equal(state.aiLoading, false);
    h.unmount();
});
