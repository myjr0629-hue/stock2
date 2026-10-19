/** B5 offline reproduction: no network, browser, environment files, or external writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as gate from '../src/lib/optionDisplayGate';
import { netPremiumOf } from '../src/lib/premiumFlow';

let count = 0;
const test = (name: string, fn: () => void) => { fn(); count++; console.log(`PASS ${name}`); };
const close = Date.parse('2026-10-16T16:00:00-04:00');
const weekend = Date.parse('2026-10-18T19:14:00-04:00');
const active = (rows: any[]) => gate.activeOptionRows(rows, weekend);
const flowPath = 'src/app/[locale]/app-view/flow/page.tsx';
const cmdPath = 'src/app/[locale]/app-view/cmd/page.tsx';
const radarPath = 'src/components/FlowRadar.tsx';
const aiPath = 'src/components/FlowAIAnalysis.tsx';
const read = (path: string) => fs.readFileSync(path, 'utf8');
const sources = new Map<string, ts.SourceFile>();
function source(path: string) {
    if (!sources.has(path)) sources.set(path, ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
    return sources.get(path)!;
}
function initializer(path: string, name: string) {
    const sf = source(path); let value = '';
    const walk = (node: ts.Node) => {
        if (!value && ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer) value = node.initializer.getText(sf);
        ts.forEachChild(node, walk);
    };
    walk(sf); assert.ok(value, `${path}: ${name}`); return value;
}
function run(code: string, context: Record<string, any> = {}) {
    const js = ts.transpileModule(`result = (${code});`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const sandbox = { result: undefined, useMemo: (fn: () => any) => fn(), ...gate, netPremiumOf, activeOptionRows: active, ...context };
    vm.runInNewContext(js, sandbox);
    return sandbox.result as any;
}
const init = (path: string, name: string, context: Record<string, any>) => run(initializer(path, name), context);
const row = (expiry: string, type = 'call', volume = 100) => ({ details: { expiration_date: expiry, contract_type: type }, day: { volume } });

test('D05: AAPL expired 8/8 excluded before ranking; cached expired:false also excluded', () => {
    const expired = Array.from({ length: 8 }, (_, i) => ({ expiration: '2026-10-16', expired: false, kind: 'OPENING', oiChange: 1000 + i, strike: 200 }));
    assert.equal(expired.slice(0, 8).length, 8); // former WHALE path
    assert.equal(active(expired).length, 0);
    const valid = { expiration: '2026-11-20', kind: 'OPENING', oiChange: 20, strike: 200 };
    const selected = init(flowPath, 'openingPositions', { optionsEod: { contracts: [...expired, valid] } });
    assert.equal(selected.length, 1); assert.equal(selected[0].expiration, '2026-11-20');
    const whaleCode = read(flowPath).split('const cs = activeOptionRows<any>(optionsEod.contracts);')[1].split('const nf =')[0];
    const rows = run(`(() => { const cs = activeOptionRows(optionsEod.contracts); ${whaleCode}; return { rows, openingCount }; })()`, { optionsEod: { contracts: [...expired, valid] } });
    assert.equal(rows.rows.length, 1); assert.equal(rows.openingCount, 1);
});
test('expiry boundary: 15:59 retained; 16:00 removed; early close, holiday, weekend, DST', () => {
    assert.equal(gate.activeOptionRows([row('2026-10-16')], close - 1).length, 1);
    assert.equal(gate.activeOptionRows([row('2026-10-16')], close).length, 0);
    const early = Date.parse('2026-11-27T13:00:00-05:00');
    assert.equal(gate.activeOptionRows([row('2026-11-27')], early - 1).length, 1);
    assert.equal(gate.activeOptionRows([row('2026-11-27')], early).length, 0);
    assert.equal(gate.activeOptionRows([row('2026-06-19')], Date.parse('2026-06-18T16:00:00-04:00')).length, 0);
    assert.equal(active([row('2026-10-16'), row('2026-10-19')]).length, 1);
    assert.equal(gate.activeOptionRows([row('2026-11-02')], Date.parse('2026-11-02T21:00:00Z')).length, 0);
    assert.equal(gate.activeOptionRows([{ expired: true, expiry: '2027-01-15' }], weekend).length, 0);
});
test('all contract forms: OCC fallback, full expiry, legacy MM/DD, unknown preserved', () => {
    assert.equal(active([{ ticker: 'O:AAPL261016C00200000', expiry: '10/16' }]).length, 0);
    assert.equal(active([{ contract: 'SPY261016P00600000' }]).length, 0);
    assert.equal(active([{ details: { ticker: 'O:NVDA261016C00200000' } }]).length, 0);
    assert.equal(active([{ expiry: '2026-10-16' }, { expirationDate: '2026-10-16' }]).length, 0);
    assert.equal(active([{ expiry: 'unknown' }]).length, 1);
});
test('D14: WTFC C8/P5, missing OI yields missing OPI and conviction, never 0 BEARISH', () => {
    assert.equal(0 <= 35, true); // old initial value satisfied HIGH CONVICTION
    const volumes = init(flowPath, 'chainVolumes', { rawChain: [row('2026-11-20', 'call', 8), row('2026-11-20', 'put', 5)] });
    const context = { pcCallVol: volumes.call, pcPutVol: volumes.put, oiPcr: null };
    assert.equal(init(flowPath, 'optionSampleOk', context), false);
    assert.equal(init(flowPath, 'opi', context), null);
    assert.equal(init(flowPath, 'convictionLabel', { optionSampleOk: false, conclusionConflict: false }), '—');
    assert.equal(init(flowPath, 'confidence', { optionSampleOk: false }), null);
    assert.equal(init(flowPath, 'convictionPct', { optionSampleOk: false }), null);
    assert.equal(init(flowPath, 'overviewSignal', { optionSampleOk: false }).title, '—');
    assert.equal(init(flowPath, 'gaugeStatus', { opi: null }), '—');
});
test('sample boundary: 99 fails, 100 passes; real OI zero valid, missing/NaN/negative fail', () => {
    assert.equal(gate.displayOpi(60, 39, 0.5), null);
    assert.equal(gate.displayOpi(60, 40, 0.5), 75);
    assert.equal(gate.displayOpi(60, 40, 0), 95);
    for (const bad of [null, undefined, NaN, Infinity, -1, '0.5']) assert.equal(gate.displayOpi(60, 40, bad), null);
    assert.equal(gate.optionSampleReady(null, 100, 1), false);
    assert.equal(gate.optionChainSampleReady([row('2026-10-23', 'call', 13), row('2026-11-20', 'put', 10000)], 1), false);
    assert.equal(gate.optionChainSampleReady([row('2026-10-23', 'call', 100)], 1), true);
    const invalid = row('2026-10-23'); delete (invalid.day as any).volume;
    assert.equal(gate.optionChainSampleReady([row('2026-10-23'), invalid], 1), false);
});
test('D15: AAPL bullish score + bearish P/C 1.55 and negative premium => existing mixed conclusion', () => {
    const context = { optionSampleOk: true, rawOverviewDirection: 'bullish', pcCallVol: 200, pcPutVol: 310, netPremiumOverview: -44000, tickerData: { flow: { netPremium: -44000 } } };
    const direction = init(flowPath, 'overviewDirection', context);
    assert.equal(direction, 'neutral');
    const signal = init(flowPath, 'overviewSignal', { ...context, overviewDirection: direction, conclusionConflict: true, flowCopy: { compNeutral: '중립 혼조', signals: { neutral: { action: 'existing action' } } } });
    assert.equal(signal.title, '중립 혼조'); assert.equal(signal.body, '—');
    assert.equal(gate.optionConclusion('bearish', 0.63, 3461), 'neutral');
    assert.equal(gate.optionConclusion('bullish', 0.63, 3461), 'bullish');
    assert.equal(gate.optionConclusion('bullish', 1.55, null), 'bullish');
    assert.equal(gate.optionConclusion('bullish', 1, 0), 'bullish');
    assert.equal(init(flowPath, 'overviewDirection', { ...context, tickerData: { flow: {} } }), 'bullish');
    assert.equal(init(radarPath, 'analysisStatus', { optionSampleOk: true, conclusionOk: false, ui: (key: string) => key }), 'verdictCrossCurrent');
    assert.equal(init(radarPath, 'analysisStatus', { optionSampleOk: false }), '—');
});
test('D19: actual monthly November 20; weekly October 23; holiday-adjusted June 18', () => {
    assert.equal(gate.optionExpiryKind('2026-11-20'), 'monthly');
    assert.equal(gate.optionExpiryKind('2026-10-23'), 'weekly');
    assert.equal(gate.optionExpiryKind('2026-06-18'), 'monthly');
    assert.equal(gate.optionExpiryKind('bad'), null);
    assert.equal(gate.optionExpiryKind('2026-02-30'), null);
    assert.equal(init(flowPath, 'expiryKindLabel', { expiryKind: 'monthly', locale: 'ko' }), '월간 만기');
});
test('D25: WTFC and MSFT wide quotes excluded after hours, regular session preserved', () => {
    for (const quote of [{ bid: 112.5, ask: 185.01, spreadPct: 0 }, { bid: 527, ask: 573, spreadPct: null }]) {
        for (const session of ['CLOSED', 'POST', 'PRE']) {
            assert.equal(gate.displayQuote(quote, session), null);
            assert.equal(init(cmdPath, 'nbbo', { quote, session }), null);
        }
        assert.ok(init(cmdPath, 'nbbo', { quote, session: 'REG' }));
    }
    assert.equal(gate.displayQuote({ bid: 97.5, ask: 102.5 }, 'CLOSED')?.spreadPct, 5);
    assert.equal(gate.displayQuote({ bid: 97.49, ask: 102.51 }, 'CLOSED'), null);
    assert.equal(gate.displayQuote({ bid: 100, ask: 99 }, 'REG'), null);
    assert.equal(gate.displayQuote({ bid: 0, ask: 100 }, 'CLOSED'), null);
    assert.equal(gate.displayQuote({ bid: 100, ask: 100 }, 'CLOSED')?.spreadPct, 0);
    const axis = initializer(cmdPath, 'allVals');
    assert.deepEqual(Array.from(run(axis, { displayCandles: [{ h: 145, l: 143 }], quote: { bid: 112.5, ask: 185.01 } })), [145, 143]);
    assert.equal(init('src/components/StockChart.tsx', 'nbbo', { rawNbbo: { bid: 112.5, ask: 185.01 }, quoteSession: undefined, session: 'CLOSED' }), null);
});
test('web Flow lists also reject expired REST/WS rows before rendering', () => {
    const chainView = init(radarPath, 'chainView', { inputRawChain: [row('2026-10-16'), row('2026-11-20')], inputAllExpiryChain: [], chainDate: null, expiryMinute: Math.floor(weekend / 60000) });
    const chain = init(radarPath, 'rawChain', { chainView });
    assert.equal(chain.length, 1);
    assert.equal(init(radarPath, 'gateChain', { chainView }).length, 1);
    const ws = [{ underlying: 'AAPL', expiry: '2026-10-16' }, { underlying: 'AAPL', expiry: '2026-11-20' }];
    assert.equal(init(radarPath, 'liveOptionsTrades', { wsOptionsTrades: ws, ticker: 'AAPL', expiryMinute: Math.floor(weekend / 60000) }).length, 1);
    const whales = init(radarPath, 'whaleTrades', { restWhaleTrades: ws, wsOptionsTrades: [], ticker: 'AAPL', expiryMinute: Math.floor(weekend / 60000) });
    assert.equal(whales.length, 1);
    const rest = [{ ...ws[0], premium: 100000, type: 'CALL' }, { ...ws[1], premium: 100000, type: 'CALL' }];
    assert.equal(init(flowPath, 'whaleSweeps', { whaleTradesFeed: rest, WHALE_PREMIUM_FLOOR: 50000 }).length, 1);
    assert.equal(init('src/app/[locale]/(home)/page.tsx', 'optionRows', { data: { atmSlice: rest } }).length, 1);
});

test('shared chart gates NBBO with the real session without adding the session badge, and AI keeps its section with a missing value', () => {
    const sf = source('src/components/LiveTickerDashboard.tsx');
    let hasQuoteSession = false, hasSessionBadgeProp = true;
    const walk = (node: ts.Node) => {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sf) === 'StockChart') {
            const props = node.attributes.properties.filter(ts.isJsxAttribute);
            hasQuoteSession = props.some(p => p.name.getText(sf) === 'quoteSession' && p.initializer?.getText(sf) === '{effectiveSession}');
            // `session` drives the LIVE/PRE/POST badge and live-update gating; the dashboard never passed it — keep it that way (no label change).
            hasSessionBadgeProp = props.some(p => p.name.getText(sf) === 'session');
        }
        ts.forEachChild(node, walk);
    };
    walk(sf); assert.equal(hasQuoteSession, true); assert.equal(hasSessionBadgeProp, false);
    const chartNbbo = initializer('src/components/StockChart.tsx', 'nbbo');
    assert.equal(run(chartNbbo, { rawNbbo: { bid: 112.5, ask: 185.01 }, quoteSession: 'POST', session: undefined }), null);
    assert.ok(run(chartNbbo, { rawNbbo: { bid: 112.5, ask: 185.01 }, quoteSession: 'REG', session: undefined }));
    assert.equal(init(aiPath, 'analysis', { dataAvailable: false, storedAnalysis: { confidence: 'HIGH' } }), null);
    assert.equal(init(aiPath, 'analysis', { dataAvailable: true, storedAnalysis: { confidence: 'HIGH' } }).confidence, 'HIGH');
    assert.ok(read(aiPath).includes('!dataAvailable && <div className="p-4 relative z-10 text-slate-400">—</div>'));
});

// Syntax check changed render files, without importing application code or executing effects.
test('changed TSX files parse and transpile without diagnostics', () => {
    for (const path of [flowPath, cmdPath, radarPath, aiPath, 'src/components/LiveTickerDashboard.tsx', 'src/components/StockChart.tsx', 'src/app/[locale]/options-flow/page.tsx', 'src/app/[locale]/(home)/page.tsx']) {
        const result = ts.transpileModule(read(path), { fileName: path, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
        const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
        assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: p => p, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
    }
});

(async () => {
    const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    let commits = 0;
    let respond!: (value: any) => void;
    const requestGeneration = { current: 0 };
    const dataAvailableRef = { current: true };
    const flowData = { currentPrice: 100, factors: {}, session: 'CLOSED' };
    const fetchAnalysis = init(aiPath, 'fetchAnalysis', {
        useCallback: (fn: any) => fn, loading: false, dataAvailableRef, requestGeneration,
        setLoading: () => {}, setError: () => {}, setAnalysis: () => { commits++; },
        fetch: () => new Promise(resolve => { respond = resolve; }),
        ticker: 'WTFC', locale: 'ko', flowData, REFRESH_INTERVALS: {},
        lastPriceRef: { current: 0 }, lastSqueezeRef: { current: 0 },
    });
    const pending = fetchAnalysis();
    dataAvailableRef.current = false;
    requestGeneration.current++;
    // Even after valid data returns, the older generation must not commit.
    dataAvailableRef.current = true;
    respond({ ok: true, json: async () => ({ confidence: 'HIGH' }) });
    await pending;
    assert.equal(commits, 0);
    const fresh = fetchAnalysis();
    respond({ ok: true, json: async () => ({ confidence: 'HIGH' }) });
    await fresh;
    assert.equal(commits, 1);
    dataAvailableRef.current = false;
    await fetchAnalysis();
    assert.equal(commits, 1);
    console.log('PASS web AI rejects late responses after a sample/ticker change and resumes with valid inputs'); count++;

    let effect = '';
    const sf = source(flowPath);
    const walk = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(sf) === 'useEffect' && node.arguments[0]?.getText(sf).includes("fetch('/api/flow/ai-analysis'")) effect = node.arguments[0].getText(sf);
        ts.forEachChild(node, walk);
    };
    walk(sf); assert.ok(effect);
    let lateCommits = 0;
    const cleanup = run(effect, {
        ticker: 'WTFC', aiReady: true, effectiveSession: 'CLOSED', locale: 'ko',
        aiFlowKeyRef: { current: '' }, aiPayloadRef: { current: {} },
        setAiFlow: (value: any) => { if (value) lateCommits++; }, setRiskExpanded: () => {},
        fetch: () => new Promise(resolve => { respond = resolve; }),
    })();
    cleanup();
    respond({ ok: true, json: async () => ({ structuralThesis: 'old result', confidence: 'HIGH' }) });
    await tick();
    assert.equal(lateCommits, 0);
    console.log('PASS app AI rejects an in-flight result after its gate becomes unavailable'); count++;
    console.log(`${count}/${count} passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
