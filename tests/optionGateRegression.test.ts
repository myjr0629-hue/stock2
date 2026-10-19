/** Offline regressions for both B5 reviews, including the chart-range and direction bypasses. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as gate from '../src/lib/optionDisplayGate';
import { netPremiumOf } from '../src/lib/premiumFlow';

const flowPath = 'src/app/[locale]/app-view/flow/page.tsx';
const radarPath = 'src/components/FlowRadar.tsx';
const read = (path: string) => fs.readFileSync(path, 'utf8');
function initializer(path: string, name: string, last = false) {
    const sf = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let value = '';
    const walk = (node: ts.Node) => {
        if ((!value || last) && ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer) value = node.initializer.getText(sf);
        ts.forEachChild(node, walk);
    };
    walk(sf); assert.ok(value, `${path}: ${name}`); return value;
}
function run(code: string, context: Record<string, any>) {
    const js = ts.transpileModule(`result = (${code});`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
    const sandbox = { result: undefined, useMemo: (fn: () => any) => fn(), ...gate, netPremiumOf, ...context };
    vm.runInNewContext(js, sandbox);
    return sandbox.result as any;
}
const row = (expiry: string, volume = 321) => ({ details: { expiration_date: expiry, contract_type: 'call', strike_price: 200 }, day: { volume } });
const afterExpiry = Date.parse('2026-10-16T16:01:00-04:00');

function webAnalysis(flowMap: any[], overrides: Record<string, any> = {}) {
    return run(initializer(radarPath, 'analysis'), {
        flowMap, currentPrice: 100, callWall: 110, putWall: 90,
        whaleTrades: [], isMarketClosed: false, opi: { value: 100 },
        squeezeProbability: { value: 0, isLoading: false }, ivSkew: { value: 0 },
        smartMoney: { score: 60 }, ivPercentile: { value: null }, dex: { value: -6 },
        uoa: { score: 0 }, pcRatio: { value: 0.05 }, gexRegime: { pinStrength: 0 },
        ui: (key: string) => key, ...overrides,
    });
}

function webGate(rawChain: any[], analysis: any, netPremium = -44000) {
    const context: Record<string, any> = {
        rawChain, analysis, oiPcr: 1,
        currentFlowData: { netPremium, contractsProcessed: rawChain.length },
        ui: (key: string) => key,
    };
    for (const name of ['chainVolumes', 'observedCallVolume', 'observedPutVolume', 'analysisDirection', 'optionSampleOk', 'conclusionOk', 'analysisGateOk', 'analysisStatus']) {
        context[name] = run(initializer(radarPath, name), context);
    }
    return context;
}

const reviewedChain = () => [
    { details: { expiration_date: '2026-10-23', contract_type: 'call', strike_price: 100 }, day: { volume: 200 }, open_interest: 10 },
    { details: { expiration_date: '2026-10-23', contract_type: 'put', strike_price: 100 }, day: { volume: 10 }, open_interest: 10 },
    { details: { expiration_date: '2026-10-23', contract_type: 'put', strike_price: 70 }, day: { volume: 300 }, open_interest: 10 },
];

test('review 2: chart excludes $70 puts, but whole-expiry P/C 1.55 blocks the bullish 73% verdict and AI in both modes', () => {
    const rawChain = reviewedChain();
    const fixedDate = new Proxy(Date, { construct: (target, args) => Reflect.construct(target, args.length ? args : [Date.parse('2026-10-19T15:00:00Z')]) });
    for (const mode of ['VOLUME', 'OI']) {
        const chart = run(initializer(radarPath, '{ flowMap, totalVolume }'), { rawChain, currentPrice: 100, userViewMode: mode, Date: fixedDate });
        assert.equal(chart.flowMap.length, 1);
        assert.equal(chart.flowMap[0].putVol / chart.flowMap[0].callVol, 0.05);
        const analysis = webAnalysis(chart.flowMap);
        assert.equal(analysis.status, 'verdictMomentum');
        assert.equal(analysis.probability, 73);
        const result = webGate(rawChain, analysis);
        assert.equal(result.observedCallVolume, 200);
        assert.equal(result.observedPutVolume, 310);
        assert.equal(result.analysisDirection, 'bullish');
        assert.equal(result.optionSampleOk, true);
        assert.equal(result.conclusionOk, false);
        assert.equal(result.analysisStatus, 'verdictCrossCurrent');
        assert.equal(result.analysisGateOk, false);
        const app = run(initializer(flowPath, 'chainVolumes'), { rawChain });
        assert.deepEqual(JSON.parse(JSON.stringify(result.chainVolumes)), JSON.parse(JSON.stringify(app)));
    }
});

test('review 2: put floor $99.5 and score 16 emit a bullish rebound 73% and must be mixed with AI blocked', () => {
    const rawChain = reviewedChain();
    const analysis = webAnalysis([{ strike: 100, callVol: 200, putVol: 10 }], {
        putWall: 99.5, opi: { value: 64 }, smartMoney: { score: 20 }, dex: { value: 0 }, pcRatio: { value: 1 },
    });
    assert.equal(analysis.compositeScore, 16);
    assert.equal(analysis.status, 'verdictBuyTheDip');
    assert.equal(analysis.probability, 73);
    const result = webGate(rawChain, analysis);
    assert.equal(result.analysisDirection, 'bullish');
    assert.equal(result.conclusionOk, false);
    assert.equal(result.analysisStatus, 'verdictCrossCurrent');
    assert.equal(result.analysisGateOk, false);
    const aligned = webGate(rawChain, analysis, 44000);
    assert.equal(aligned.analysisGateOk, true);
    assert.equal(aligned.analysisStatus, 'verdictBuyTheDip');
});

test('shared whole-expiry volumes ignore later expiries, preserve zero and reject missing or invalid samples', () => {
    const rows = [...reviewedChain(), { ...row('2026-11-20', 100000) }];
    assert.deepEqual(gate.optionChainVolumes(rows), { call: 200, put: 310, callPct: 39.2 });
    assert.equal(gate.optionChainSampleReady(rows, 1), true);
    for (const invalid of [null, undefined, NaN, Infinity, -1, '300']) {
        const bad = reviewedChain();
        (bad[2].day as any).volume = invalid;
        assert.deepEqual(gate.optionChainVolumes(bad), { call: null, put: null, callPct: null });
        assert.equal(webGate(bad, { direction: 'bullish' }).analysisGateOk, false);
    }
    assert.deepEqual(gate.optionChainVolumes([row('2026-10-23', 0)]), { call: 0, put: 0, callPct: null });
    assert.deepEqual(gate.optionChainVolumes([]), { call: null, put: null, callPct: null });
    assert.equal(webGate([row('2026-10-23', 13), row('2026-11-20', 100000)], { direction: 'bullish' }).analysisGateOk, false);
});

test('verdict direction follows all directional branches and gamma overrides, rather than a second score threshold', () => {
    for (const [callWall, putWall, score, status, direction] of [
        [99, 90, 31, 'verdictSuperCycle', 'bullish'],
        [110, 101, -31, 'verdictCollapse', 'bearish'],
        [100.5, 90, 26, 'verdictBreakoutReady', 'bullish'],
        [110, 99.5, 16, 'verdictBuyTheDip', 'bullish'],
        [110, 99.5, 15, 'verdictWeak', 'bearish'],
        [110, 90, 36, 'verdictMomentum', 'bullish'],
        [110, 90, -36, 'verdictPressure', 'bearish'],
        [110, 90, 20, 'verdictCrossCurrent', 'neutral'],
        [99, 101, 21, 'verdictGammaPinchUp', 'bullish'],
        [99, 101, -21, 'verdictGammaPinchDown', 'bearish'],
        [99, 101, -40, 'verdictGammaPinchDown', 'bearish'], // overrides breakout-zone wait
        [99, 101, 16, 'verdictGammaPinchExplosive', 'neutral'],
    ] as const) {
        // OPI contributes 25%; all remaining factors are neutral in this fixture.
        const analysis = webAnalysis([{}], { callWall, putWall, opi: { value: score * 4 }, smartMoney: { score: 20 }, dex: { value: 0 }, pcRatio: { value: 1 } });
        assert.equal(analysis.status, status);
        assert.equal(analysis.direction, direction, status);
        assert.equal(run(initializer(radarPath, 'analysisDirection'), { analysis }), direction);
        if (direction !== 'neutral') {
            const chain = direction === 'bullish' ? reviewedChain() : [row('2026-10-23', 200), { details: { expiration_date: '2026-10-23', contract_type: 'put' }, day: { volume: 10 } }];
            assert.equal(webGate(chain, analysis, direction === 'bullish' ? -44000 : 44000).analysisGateOk, false, status);
        }
    }
    assert.equal(run(initializer(radarPath, 'analysisDirection'), { analysis: null }), 'neutral');
});

test('expired-only STRIKE source preserves actual 321 contracts instead of fabricating 12 rows', () => {
    const rows = [row('2026-10-16')];
    const block = read(flowPath).split('// Group rawChain by strike price')[1].split('// Find closest strike index')[0];
    const result = run(`(() => { ${block} return { strikeMap, strikes }; })()`, {
        rawChain: gate.activeOptionRows(rows, afterExpiry), strikeSource: { rows, date: '2026-10-16' }, displayPrice: 200,
    });
    assert.equal(result.strikes.length, 1);
    assert.equal(result.strikeMap[200].call, 321);
    assert.equal(result.strikeMap[200].put, 0);
});

test('web bullish conclusion with P/C 1.55 and actual -44000 premium must fail the shared gate', () => {
    const flow = { netPremium: -44000, contractsProcessed: 2 };
    const result = run(initializer(radarPath, 'conclusionOk'), {
        analysisDirection: 'bullish', observedCallVolume: 200, observedPutVolume: 310,
        initialFlowData: { liveQuote: { flow } }, currentFlowData: flow,
    });
    assert.equal(result, false);
});

test('STRIKE reads the unfiltered source for its own ticker and never revives an old ticker or failed response', () => {
    const rows = [row('2026-10-16')];
    const code = initializer(flowPath, 'strikeSource');
    const context = { ticker: 'AAPL', strikeVolumeSource: (chain: any[], date: string) => ({ rows: chain, date }) };
    assert.equal(run(code, { ...context, tickerData: { ticker: 'AAPL', flow: { rawChain: rows, dataFreshness: { chainDate: '2026-10-16' } } } }).rows[0].day.volume, 321);
    for (const tickerData of [
        null, { ticker: 'NVDA', flow: { rawChain: rows } },
        { ticker: 'AAPL', flow: { rawChain: rows, dataSource: 'NONE' } },
        { ticker: 'AAPL', flow: { rawChain: rows, error: 'unavailable' } },
    ]) assert.equal(run(code, { ...context, tickerData }).rows.length, 0);
});

test('historical STRIKE keeps only actual last-session rows, including weekend, holiday, early close and DST', () => {
    for (const [now, date, expiry] of [
        ['2026-10-16T16:01:00-04:00', '2026-10-16', '2026-10-16'],
        ['2026-10-18T19:14:00-04:00', '2026-10-16', '2026-10-16'],
        ['2026-10-19T10:00:00-04:00', '2026-10-16', '2026-10-16'],
        ['2026-06-19T12:00:00-04:00', '2026-06-18', '2026-06-18'],
        ['2026-11-27T13:01:00-05:00', '2026-11-27', '2026-11-27'],
        ['2026-11-02T16:01:00-05:00', '2026-11-02', '2026-11-02'],
    ]) {
        const ms = Date.parse(now);
        const rows = [{ ...row(expiry), expired: true }, row('2026-01-02', 99999)];
        const result = gate.strikeVolumeSource(rows, date, ms);
        assert.equal(result.rows.length, 1, now);
        assert.equal(result.rows[0].day.volume, 321);
        assert.equal(result.date, date);
        assert.equal(gate.activeOptionRows(rows, ms).length, 0); // position/sample gate still rejects history
    }
});

test('STRIKE never substitutes fake values for missing, invalid, undated or older historical source', () => {
    const ms = Date.parse('2026-10-18T19:14:00-04:00');
    for (const date of [null, undefined, 'bad', '2026-02-30', '2026-10-15', '2026-10-17', '2026-10-19', 1792195200000]) {
        assert.equal(gate.strikeVolumeSource([row('2026-10-16')], date, ms).rows.length, 0);
    }
    for (const volume of [null, undefined, NaN, Infinity, -1, '321']) {
        assert.equal(gate.strikeVolumeSource([{ ...row('2026-10-16'), day: { volume } }], '2026-10-16', ms).rows.length, 0);
    }
    const zero = gate.strikeVolumeSource([row('2026-10-16', 0)], '2026-10-16', ms);
    assert.equal(zero.rows[0].day.volume, 0);
    assert.equal(gate.strikeVolumeSource([], '2026-10-16', ms).rows.length, 0);
    const block = read(flowPath).split('// Group rawChain by strike price')[1].split('// Find closest strike index')[0];
    assert.equal(run(`(() => { ${block} return strikes; })()`, { rawChain: [], strikeSource: { rows: [] }, displayPrice: 200 }).length, 0);
    assert.equal(run(initializer(flowPath, 'weeklyExpiryLabel'), { chartExpiry: '2026-10-16', expiryKindLabel: 'monthly', strikeSource: { date: '2026-10-16' } }), '2026-10-16 · 10-16 monthly');
    for (const name of ['putPct', 'callPct']) assert.equal(run(initializer(flowPath, name, true), { data: { put: 0, call: 0 }, maxVal: 100 }), 0);
});

test('active STRIKE source wins over historical rows and preserves the original real volume', () => {
    const rows = [row('2026-10-16', 99999), row('2026-10-23', 123)];
    const result = gate.strikeVolumeSource(rows, '2026-10-16', afterExpiry);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].day.volume, 123);
    assert.equal(result.date, '2026-10-16');
});

test('app and web use the same contradiction function and observed premium for both directions', () => {
    for (const [direction, pc, net, expected] of [
        ['bullish', 1.55, -44000, 'neutral'], ['bearish', 0.63, 3461, 'neutral'],
        ['bullish', 0.63, 3461, 'bullish'], ['bearish', 1.55, -44000, 'bearish'],
        ['bullish', 1.55, null, 'bullish'], ['bullish', 1.55, 0, 'bullish'],
    ] as const) {
        const flow = { netPremium: net, contractsProcessed: 2 };
        const appDirection = run(initializer(flowPath, 'overviewDirection'), {
            optionSampleOk: true, rawOverviewDirection: direction, pcKnown: true, pcRatio: pc,
            tickerData: { flow }, netPremiumOverview: net,
        });
        const conclusionOk = run(initializer(radarPath, 'conclusionOk'), {
            analysisDirection: direction, observedCallVolume: 200, observedPutVolume: pc * 200,
            currentFlowData: flow, initialFlowData: { liveQuote: { flow: { netPremium: -Number(net) } } },
        });
        assert.equal(appDirection, expected);
        assert.equal(conclusionOk, expected === direction);
        const analysisGateOk = run(initializer(radarPath, 'analysisGateOk'), { conclusionOk, optionSampleOk: true });
        assert.equal(analysisGateOk, expected === direction);
        if (!analysisGateOk) assert.equal(run(initializer(radarPath, 'analysisStatus'), { optionSampleOk: true, conclusionOk, ui: () => 'existing mixed' }), 'existing mixed');
    }
});

test('both web callers pass the polled flow block alongside rawChain, including refresh without SSR data', () => {
    for (const path of ['src/app/[locale]/flow/FlowPageClient.tsx', 'src/app/[locale]/flow/MobileFlowPage.tsx']) {
        const sf = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        let found = false;
        const walk = (node: ts.Node) => {
            if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sf) === 'FlowRadar') {
                found = node.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'currentFlowData' && p.initializer?.getText(sf) === '{liveQuote?.flow}');
            }
            ts.forEachChild(node, walk);
        };
        walk(sf); assert.equal(found, true, path);
    }
    const context = { analysisDirection: 'bullish', observedCallVolume: 200, observedPutVolume: 310, initialFlowData: undefined };
    assert.equal(run(initializer(radarPath, 'conclusionOk'), { ...context, currentFlowData: { netPremium: -44000 } }), false);
    assert.equal(run(initializer(radarPath, 'conclusionOk'), { ...context, currentFlowData: { netPremium: 44000 } }), true);
});

test('web conclusion keeps the existing missing value while analysis is null', () => {
    assert.equal(run(initializer(radarPath, 'analysisStatus'), { optionSampleOk: true, conclusionOk: true, analysis: null }), '—');
});

test('actual status initializer type-checks with nullable analysis; the former access fails TS18047', () => {
    function diagnostics(expression: string) {
        const name = '/status.ts';
        const code = `declare const optionSampleOk: boolean, conclusionOk: boolean;
            declare const analysis: { status: string } | null;
            declare const ui: (key: string) => string;
            const status = ${expression};`;
        const sf = ts.createSourceFile(name, code, ts.ScriptTarget.ES2020, true);
        const host: ts.CompilerHost = {
            getSourceFile: path => path === name ? sf : undefined,
            getDefaultLibFileName: () => '', writeFile: () => {}, getCurrentDirectory: () => '/',
            getDirectories: () => [], fileExists: path => path === name,
            readFile: path => path === name ? code : undefined,
            getCanonicalFileName: path => path, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
        };
        const program = ts.createProgram([name], { strict: true, noLib: true, noEmit: true }, host);
        return program.getSemanticDiagnostics(sf);
    }
    const expression = initializer(radarPath, 'analysisStatus');
    assert.equal(diagnostics(expression).length, 0);
    const oldExpression = expression.replace("analysis?.status ?? '—'", 'analysis.status');
    assert.notEqual(oldExpression, expression);
    assert.ok(diagnostics(oldExpression).some(d => d.code === 18047));
});
