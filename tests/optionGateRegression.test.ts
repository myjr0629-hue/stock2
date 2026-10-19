/** Offline regressions for both B5 reviews, including the chart-range and direction bypasses. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as gate from '../src/lib/optionDisplayGate';
import { netPremiumOf } from '../src/lib/premiumFlow';
import { optionExpiryJudge } from '../src/lib/marketCalendar';

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
function appConclusion(ctx: Record<string, any>) {
    const conclusionCheck = run(initializer(flowPath, 'conclusionCheck'), ctx);
    const overviewDirection = run(initializer(flowPath, 'overviewDirection'), { ...ctx, conclusionCheck });
    const conclusionConflict = run(initializer(flowPath, 'conclusionConflict'), { ...ctx, conclusionCheck, overviewDirection });
    return { conclusionCheck, overviewDirection, conclusionConflict };
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
        optionsGateEmptied: false, ui: (key: string) => key, ...overrides,
    });
}

function webGate(rawChain: any[], analysis: any, netPremium = -44000) {
    const context: Record<string, any> = {
        gateChain: rawChain, analysis, oiPcr: 1,
        currentFlowData: { netPremium, contractsProcessed: rawChain.length },
        ui: (key: string) => key,
    };
    for (const name of ['chainVolumes', 'analysisDirection', 'optionSampleOk', 'conclusionOk', 'analysisGateOk', 'analysisStatus']) {
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
        const chart = run(initializer(radarPath, '{ flowMap, totalVolume }'), { rawChain, currentPrice: 100, userViewMode: mode, chainFallback: false, Date: fixedDate });
        assert.equal(chart.flowMap.length, 1);
        assert.equal(chart.flowMap[0].putVol / chart.flowMap[0].callVol, 0.05);
        const analysis = webAnalysis(chart.flowMap);
        assert.equal(analysis.status, 'verdictMomentum');
        assert.equal(analysis.probability, 73);
        const result = webGate(rawChain, analysis);
        assert.equal(result.chainVolumes.call, 200);
        assert.equal(result.chainVolumes.put, 310);
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
        rawChain: gate.activeOptionRows(rows, afterExpiry), strikeSource: { rows, date: '2026-10-16', archived: true }, displayPrice: 200,
    });
    assert.equal(result.strikes.length, 1);
    assert.equal(result.strikeMap[200].call, 321);
    assert.equal(result.strikeMap[200].put, 0);
});

test('web bullish conclusion with P/C 1.55 and actual -44000 premium must fail the shared gate', () => {
    const flow = { netPremium: -44000, contractsProcessed: 2 };
    const result = run(initializer(radarPath, 'conclusionOk'), {
        analysisDirection: 'bullish', chainVolumes: { call: 200, put: 310 },
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
    assert.equal(run(initializer(flowPath, 'weeklyExpiryLabel'), { chartExpiry: '2026-10-16', strikeCopy: { weekly: '주간 만기' }, strikeSource: { date: '2026-10-16', archived: true } }), '2026-10-16 · 10-16 주간 만기');
    // Live rows keep the original label exactly (no date prefix added).
    assert.equal(run(initializer(flowPath, 'weeklyExpiryLabel'), { chartExpiry: '2026-10-23', strikeCopy: { weekly: '주간 만기' }, strikeSource: { date: null, archived: false } }), '10-23 주간 만기');
    for (const name of ['putPct', 'callPct']) assert.equal(run(initializer(flowPath, name, true), { data: { put: 0, call: 0 }, maxVal: 100 }), 0);
});

test('active STRIKE source wins over historical rows and preserves the original real volume', () => {
    const rows = [row('2026-10-16', 99999), row('2026-10-23', 123)];
    const result = gate.strikeVolumeSource(rows, '2026-10-16', afterExpiry);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].day.volume, 123);
    assert.equal(result.date, null);
    assert.equal(result.archived, false);
});

test('app and web use the same contradiction function and observed premium for both directions', () => {
    for (const [direction, pc, net, expected] of [
        ['bullish', 1.55, -44000, 'neutral'], ['bearish', 0.63, 3461, 'neutral'],
        ['bullish', 0.63, 3461, 'bullish'], ['bearish', 1.55, -44000, 'bearish'],
        ['bullish', 1.55, null, 'bullish'], ['bullish', 1.55, 0, 'bullish'],
    ] as const) {
        const flow = { netPremium: net, contractsProcessed: 2 };
        const appDirection = appConclusion({
            optionSampleOk: true, rawOverviewDirection: direction, pcCallVol: 200, pcPutVol: pc * 200,
            tickerData: { flow }, netPremiumOverview: net,
        }).overviewDirection;
        const conclusionOk = run(initializer(radarPath, 'conclusionOk'), {
            analysisDirection: direction, chainVolumes: { call: 200, put: pc * 200 },
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
    const context = { analysisDirection: 'bullish', chainVolumes: { call: 200, put: 310 }, initialFlowData: undefined };
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

// ── Review 3 (gate 10/19 15:20) ─────────────────────────────────────────────
const callZeroChain = () => [
    { details: { expiration_date: '2026-10-23', contract_type: 'call', strike_price: 100 }, day: { volume: 0 }, open_interest: 1000, greeks: { delta: 0.5 } },
    { details: { expiration_date: '2026-10-23', contract_type: 'put', strike_price: 100 }, day: { volume: 300 }, open_interest: 100, greeks: { delta: -0.5 } },
];

test('review 3: call volume 0 / put 300 (P/C undefined) cannot keep the rebound 73% verdict or AI — web', () => {
    const analysis = webAnalysis([{ strike: 100, callVol: 200, putVol: 10 }], {
        putWall: 99.5, opi: { value: 64 }, smartMoney: { score: 20 }, dex: { value: 0 }, pcRatio: { value: 1 },
    });
    assert.equal(analysis.status, 'verdictBuyTheDip');
    assert.equal(analysis.probability, 73);
    for (const net of [-44000, 44000, null]) {
        const result = webGate(callZeroChain(), analysis, net as any);
        assert.equal(result.chainVolumes.call, 0);
        assert.equal(result.chainVolumes.put, 300);
        assert.equal(result.optionSampleOk, true);
        assert.equal(result.conclusionOk, false, String(net));
        assert.equal(result.analysisStatus, 'verdictCrossCurrent');
        assert.equal(result.analysisGateOk, false); // FlowAIAnalysis dataAvailable=false → AI blocked
    }
    assert.equal(gate.optionConclusionFromVolumes('bullish', 0, 300, -44000), 'neutral');
    assert.equal(gate.optionConclusionFromVolumes('bearish', 0, 300, -44000), 'neutral');
    assert.equal(gate.optionConclusionFromVolumes('bullish', null, 300, -44000), 'neutral');
    assert.equal(gate.optionConclusionFromVolumes('neutral', 0, 300, -44000), 'neutral');
    assert.equal(gate.optionConclusionFromVolumes('bullish', 200, 10, -44000), 'bullish');
});

test('review 3: call volume 0 / put 300 — app uses the same shared check: mixed conclusion, AI not requested', () => {
    const chainVolumes = run(initializer(flowPath, 'chainVolumes'), { rawChain: callZeroChain() });
    assert.deepEqual(JSON.parse(JSON.stringify(chainVolumes)), { call: 0, put: 300, callPct: 0 });
    const optionSampleOk = gate.optionSampleReady(chainVolumes.call, chainVolumes.put, 0.1);
    assert.equal(optionSampleOk, true);
    for (const net of [-44000, 44000]) {
        const ctx = { optionSampleOk, rawOverviewDirection: 'bullish', pcCallVol: 0, pcPutVol: 300, tickerData: { flow: { netPremium: net, contractsProcessed: 2 } } };
        const { overviewDirection, conclusionConflict } = appConclusion(ctx);
        assert.equal(overviewDirection, 'neutral');
        assert.equal(conclusionConflict, true);
        const aiReady = run(initializer(flowPath, 'aiReady'), {
            price: 100, tickerData: { ticker: 'AAPL' }, ticker: 'AAPL', flowPhaseDone: true, optionSampleOk, conclusionConflict,
            tkNorm: (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
        });
        assert.equal(aiReady, false);
    }
});

test('review 3: expiry filter empties rawChain at 16:01 ET — radar keeps its cards with real data, never synthesized', () => {
    const expiredOnly = [row('2026-10-16'), { details: { expiration_date: '2026-10-16', contract_type: 'put', strike_price: 195 }, day: { volume: 50 } }];
    const later = [
        { details: { expiration_date: '2026-11-20', contract_type: 'call', strike_price: 210 }, day: { volume: 70 }, open_interest: 900 },
        { details: { expiration_date: '2026-11-20', contract_type: 'put', strike_price: 190 }, day: { volume: 40 }, open_interest: 800 },
        { details: { expiration_date: '2026-12-18', contract_type: 'call', strike_price: 220 }, day: { volume: 9 }, open_interest: 5 },
    ];
    const expiryMinute = Math.floor(afterExpiry / 60000);
    const view = (inputRawChain: any[], inputAllExpiryChain: any[], chainDate: unknown) =>
        run(initializer(radarPath, 'chainView'), { inputRawChain, inputAllExpiryChain, chainDate, expiryMinute });
    const earlyReturn = (rawChain: any[]) => {
        assert.ok(read(radarPath).includes('if (noOptionSource) return noFlowDataPanel;'));
        return run(initializer(radarPath, 'noOptionSource'), { inputRawChain: rawChain });
    };

    // (a) chain dated the session that just closed → that session's real list, display only.
    const archived = view(expiredOnly, [...expiredOnly, ...later], '2026-10-16');
    assert.equal(archived.archived, true);
    assert.equal(archived.date, '2026-10-16');
    assert.deepEqual(archived.rows.map((r: any) => r.day.volume), [321, 50]); // actual volumes, not 12 synthetic strikes
    assert.equal(archived.gateRows.length, 0);
    assert.equal(earlyReturn(archived.rows), false);
    assert.equal(run(initializer(radarPath, 'isMarketClosed'), { chainView: archived, totalVolume: 371, rawChain: archived.rows }), true); // existing «PREVIOUS CLOSE DATA» label, not «Live»
    const archivedGate = { gateChain: archived.gateRows, oiPcr: 1, analysis: { direction: 'bullish', status: 'verdictMomentum' }, currentFlowData: { netPremium: 44000 }, ui: (k: string) => k } as Record<string, any>;
    for (const name of ['optionSampleOk', 'chainVolumes', 'analysisDirection', 'conclusionOk', 'analysisGateOk', 'analysisStatus']) archivedGate[name] = run(initializer(radarPath, name), archivedGate);
    assert.equal(archivedGate.optionSampleOk, false);
    assert.equal(archivedGate.analysisStatus, '—'); // conclusion cell kept, value missing
    assert.equal(archivedGate.analysisGateOk, false);

    // (b) chain not dated that session → nearest live expiry from the all-expiry chain (11/20 only).
    for (const date of [null, '2026-10-15']) {
        const next = view(expiredOnly, [...expiredOnly, ...later], date);
        assert.equal(next.archived, false);
        assert.equal(next.fallback, true);
        assert.deepEqual(next.rows.map((r: any) => r.details.expiration_date), ['2026-11-20', '2026-11-20']);
        assert.equal(next.gateRows.length, 0); // substitute expiry: display only (premium is the original expiry's)
        assert.equal(earlyReturn(next.rows), false);
    }

    // hasData keeps whale / dark-pool fetching on whenever the source had rows.
    assert.equal(run(initializer(radarPath, 'hasData'), { rawChain: [], inputRawChain: expiredOnly }), true);
    // Live rows win; an empty source stays empty (existing no-data panel only when there is truly nothing).
    assert.equal(view([row('2026-10-23', 5)], later, '2026-10-16').rows[0].day.volume, 5);
    assert.equal(view([], later, '2026-10-16').rows.length, 0);
});

// ── Review 4 (gate 10/19 16:44) ─────────────────────────────────────────────
test('review 4: call 0 / put 300 with an originally NEUTRAL conclusion still blocks the conclusion and AI (app and web)', () => {
    const neutral = { direction: 'neutral', status: 'verdictCrossCurrent' };
    for (const net of [-44000, 44000, null]) {
        const web = webGate(callZeroChain(), neutral, net as any);
        assert.equal(web.optionSampleOk, true);
        assert.equal(web.conclusionOk, false, String(net));
        assert.equal(web.analysisGateOk, false); // FlowAIAnalysis dataAvailable=false
        assert.equal(web.analysisStatus, 'verdictCrossCurrent'); // existing mixed state, cell kept
        const ctx = { optionSampleOk: true, rawOverviewDirection: 'neutral', pcCallVol: 0, pcPutVol: 300, tickerData: { flow: { netPremium: net } } };
        const app = appConclusion(ctx);
        assert.equal(app.overviewDirection, 'neutral');
        assert.equal(app.conclusionConflict, true);
        const aiReady = run(initializer(flowPath, 'aiReady'), {
            price: 100, tickerData: { ticker: 'AAPL' }, ticker: 'AAPL', flowPhaseDone: true, optionSampleOk: true, conclusionConflict: app.conclusionConflict,
            tkNorm: (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
        });
        assert.equal(aiReady, false);
    }
    assert.deepEqual(gate.optionConclusionCheck('neutral', 0, 300, null), { direction: 'neutral', ok: false });
    assert.deepEqual(gate.optionConclusionCheck('neutral', 200, 310, -44000), { direction: 'neutral', ok: true });
    assert.deepEqual(gate.optionConclusionCheck('bullish', 200, 310, -44000), { direction: 'neutral', ok: false });
});

test('review 4: fallback lists survive the live DTE window, so flowMap / AI VERDICT area stays (11/20 substitute and weekend archive)', () => {
    const at = (iso: string) => new Proxy(Date, { construct: (target, args) => Reflect.construct(target, args.length ? args : [Date.parse(iso)]) });
    const later = [
        { details: { expiration_date: '2026-11-20', contract_type: 'call', strike_price: 210 }, day: { volume: 70 }, open_interest: 900 },
        { details: { expiration_date: '2026-11-20', contract_type: 'put', strike_price: 190 }, day: { volume: 40 }, open_interest: 800 },
    ];
    const expired = [row('2026-10-16'), { details: { expiration_date: '2026-10-16', contract_type: 'put', strike_price: 195 }, day: { volume: 50 } }];
    const chartCode = initializer(radarPath, '{ flowMap, totalVolume }');
    // 10/16 16:01 ET, undated expired source → 11/20 substitute (35 DTE, beyond the 7–15 live window).
    const sub = gate.optionChainView(expired, later, null, afterExpiry);
    assert.equal(sub.fallback, true);
    const subChart = run(chartCode, { rawChain: sub.rows, currentPrice: 200, userViewMode: 'VOLUME', chainFallback: sub.fallback, Date: at('2026-10-16T20:01:00Z') });
    assert.equal(subChart.flowMap.length, 2);
    assert.equal(subChart.totalVolume, 110);
    // Weekend: archived 10/16 list (already past) also stays.
    const weekend = Date.parse('2026-10-18T19:14:00-04:00');
    const arc = gate.optionChainView(expired, [], '2026-10-16', weekend);
    assert.equal(arc.archived, true);
    const arcChart = run(chartCode, { rawChain: arc.rows, currentPrice: 200, userViewMode: 'VOLUME', chainFallback: arc.fallback, Date: at('2026-10-18T23:14:00Z') });
    assert.equal(arcChart.flowMap.length, 2);
    assert.equal(arcChart.totalVolume, 371);
    // Live rows keep the original window (no behaviour change).
    const liveChart = run(chartCode, { rawChain: later, currentPrice: 200, userViewMode: 'VOLUME', chainFallback: false, Date: at('2026-10-16T20:01:00Z') });
    assert.equal(liveChart.flowMap.length, 0);
});

test('review 4: substitute expiry never mixes its P/C with the original expiry premium — gates read nothing, AI blocked', () => {
    const sub10_23 = [
        { details: { expiration_date: '2026-10-23', contract_type: 'call', strike_price: 100 }, day: { volume: 200, close: 1 } },
        { details: { expiration_date: '2026-10-23', contract_type: 'put', strike_price: 100 }, day: { volume: 310, close: 1 } },
    ];
    const view = gate.optionChainView([row('2026-10-16')], sub10_23, null, afterExpiry);
    assert.equal(view.rows.length, 2);
    assert.equal(view.gateRows.length, 0);
    const ctx: Record<string, any> = { gateChain: view.gateRows, oiPcr: 1, analysis: { direction: 'bullish', status: 'verdictMomentum' }, currentFlowData: { netPremium: 44000 }, ui: (k: string) => k };
    for (const name of ['optionSampleOk', 'chainVolumes', 'analysisDirection', 'conclusionOk', 'analysisGateOk', 'analysisStatus']) ctx[name] = run(initializer(radarPath, name), ctx);
    assert.equal(ctx.optionSampleOk, false);
    assert.equal(ctx.analysisGateOk, false);
    assert.equal(ctx.analysisStatus, '—');
});

// ── Review 5 (gate 10/19 17:02) ─────────────────────────────────────────────
test('review 5: archive date comes only from the rawChain response — levels / SSR dates cannot certify an expired list', () => {
    const code = initializer(radarPath, 'chainDate');
    assert.equal(run(code, { currentFlowData: { rawChain: [] }, levelsChainDate: '2026-10-16', initialFlowData: { dataFreshness: { chainDate: '2026-10-16' } } }), null);
    assert.equal(run(code, { currentFlowData: { dataFreshness: { chainDate: '2026-10-16' } }, levelsChainDate: null }), '2026-10-16');
    const later = [{ details: { expiration_date: '2026-11-20', contract_type: 'call', strike_price: 210 }, day: { volume: 70 } }];
    const view = gate.optionChainView([row('2026-10-16')], later, run(code, { currentFlowData: {}, levelsChainDate: '2026-10-16' }), afterExpiry);
    assert.equal(view.archived, false); // undated expired list is not shown as the previous session
    assert.equal(view.rows[0].details.expiration_date, '2026-11-20');
});

test('review 5: fallback list entirely outside ±15% keeps its real strikes, so flowMap / AI VERDICT area stays', () => {
    const at = new Proxy(Date, { construct: (target, args) => Reflect.construct(target, args.length ? args : [Date.parse('2026-10-16T20:01:00Z')]) });
    const far = [
        { details: { expiration_date: '2026-11-20', contract_type: 'call', strike_price: 250 }, day: { volume: 100 } },
        { details: { expiration_date: '2026-11-20', contract_type: 'put', strike_price: 240 }, day: { volume: 50 } },
    ];
    const chartCode = initializer(radarPath, '{ flowMap, totalVolume }');
    const fb = run(chartCode, { rawChain: far, currentPrice: 200, userViewMode: 'VOLUME', chainFallback: true, Date: at });
    assert.deepEqual(JSON.parse(JSON.stringify(fb.flowMap.map((r: any) => [r.strike, r.callVol, r.putVol]))), [[250, 100, 0], [240, 0, 50]]);
    assert.equal(fb.totalVolume, 150);
    // Live rows keep the ±15% chart range unchanged.
    const live = [{ ...far[0], details: { ...far[0].details, expiration_date: '2026-10-23' } }];
    assert.equal(run(chartCode, { rawChain: live, currentPrice: 200, userViewMode: 'VOLUME', chainFallback: false, Date: at }).flowMap.length, 0);
});

// ── Review 6 (gate 10/19 17:22) ─────────────────────────────────────────────
/** Server-render the real FlowRadar with network hooks / providers stubbed (no network, no browser). */
async function renderRadar(props: Record<string, any>, darkPool: any, nowMs: number, iv: any = null): Promise<string> {
    const path = await import('node:path');
    const { createRequire } = await import('node:module');
    const esbuild = await import('esbuild');
    const stubs: Record<string, string> = {
        'next-intl': `const tr = () => Object.assign((k) => k, { raw: (k) => k, rich: (k) => k, has: () => true });
            export const useTranslations = tr; export const useLocale = () => 'en';`,
        '@/hooks/useFlowData': `export const useWhaleTrades = () => ({ trades: [], isLoading: false });
            export const useRealtimeMetrics = () => ({ metrics: globalThis.__b5DarkPool ?? { darkPool: null, shortVolume: null, bidAsk: null, blockTrade: null } });
            export const useDarkPoolTrades = () => ({ trades: [] });
            export const useIvPercentile = () => globalThis.__b5Iv ?? ({ percentile: null, currentIv: null, collecting: false });
            export const useEnhancedMetrics = () => ({});`,
        '@/providers/WebSocketProvider': `export const useRealtimeData = () => ({ optionsTrades: [], optionsQuotes: {}, connected: false });`,
        '@/components/FlowAIAnalysis': `export const FlowAIAnalysis = () => null;`,
        '@/components/gate/FeatureGate': `export const ProGate = ({ children }) => children; export const EliteGate = ({ children }) => children;`,
    };
    const root = path.resolve('.');
    const built = await esbuild.build({
        stdin: { contents: `export { FlowRadar } from './src/components/FlowRadar';`, resolveDir: root, loader: 'ts' },
        bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
        external: ['react', 'react-dom', 'react/*', 'react-dom/*', 'lucide-react'],
        plugins: [{
            name: 'b5-stubs',
            setup(b) {
                b.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'b5-stub' }
                    : args.path.startsWith('@/') ? b.resolve('./src/' + args.path.slice(2), { resolveDir: root, kind: args.kind }) : undefined);
                b.onLoad({ filter: /.*/, namespace: 'b5-stub' }, args => ({ contents: stubs[args.path], loader: 'jsx' }));
            },
        }],
    });
    const mod: any = { exports: {} };
    new Function('require', 'module', 'exports', built.outputFiles[0].text)(createRequire(path.join(root, 'package.json')), mod, mod.exports);
    const req = createRequire(path.join(root, 'package.json'));
    const React = req('react');
    const { renderToStaticMarkup } = req('react-dom/server');
    const realNow = Date.now;
    (globalThis as any).__b5DarkPool = darkPool;
    (globalThis as any).__b5Iv = iv;
    Date.now = () => nowMs;
    try { return renderToStaticMarkup(React.createElement(mod.exports.FlowRadar, props)); }
    finally { Date.now = realNow; }
}

test('review 6/7: both chains only 10/16 expiry, source date 10/15, IV Rank 20%, at 10/16 16:01 ET — option part missing (no P/C 0.00 / ACCUMULATION), dark pool card still drawn', async () => {
    const only1016 = [row('2026-10-16'), { details: { expiration_date: '2026-10-16', contract_type: 'put', strike_price: 195 }, day: { volume: 50 }, open_interest: 10 }];
    const currentFlowData = { dataFreshness: { chainDate: '2026-10-15' }, netPremium: 44000 };
    // Recovery result is empty: no live rows, chain not dated the session that closed, no live expiry elsewhere.
    const view = gate.optionChainView(only1016, only1016, '2026-10-15', afterExpiry);
    assert.deepEqual([view.rows.length, view.gateRows.length, view.archived, view.fallback], [0, 0, false, false]);
    // The radar does not return early: the source had rows, only the option side is missing.
    assert.equal(run(initializer(radarPath, 'noOptionSource'), { inputRawChain: only1016 }), false);
    assert.equal(run(initializer(radarPath, 'noOptionSource'), { inputRawChain: [] }), true); // a truly empty source keeps the existing panel
    assert.equal(run(initializer(radarPath, 'optionsGateEmptied'), { noOptionSource: false, rawChain: view.rows }), true);

    // Whole component, server-rendered with the same inputs and a valid dark pool reading.
    const html = await renderRadar({
        ticker: 'AAPL', rawChain: only1016, allExpiryChain: only1016, gammaFlipLevel: null, oiPcr: 1, currentPrice: 200,
        initialFlowData: {}, currentFlowData, maxPain: 200, callWall: 210, putFloor: 190,
    }, { darkPool: { percent: 41.2, volume: 12300, totalVolume: 29850, buyPct: 0, sellPct: 0 } }, afterExpiry,
        { percentile: 20, currentIv: 0.31, collecting: false }); // review 7: IV Rank 20%
    assert.ok(html.includes('Dark Pool %') && html.includes('41.2%') && html.includes('DP 12.3K'), 'dark pool card missing');
    assert.ok(html.includes('Short Vol %') && html.includes('whaleTracking'), 'short volume / order flow cards missing');
    // Option part: the existing no-data panel, never values computed from an empty chain.
    assert.ok(html.includes('No Flow Data Available'));
    const text = html.replace(/<[^>]+>/g, ' ');
    for (const fake of ['OPTIONS MARKET REGIME', 'ACCUMULATION', 'P/C', '0.00', 'GEX REGIME', 'VOLATILE', 'AI VERDICT', 'Implied Move', 'SQUEEZE', 'OPI', '321']) {
        assert.ok(!text.includes(fake), `option value shown from an empty chain: ${fake}`);
    }
    // Same chains dated the session that closed (archived real list): full radar unchanged, shared cards drawn once.
    const full = await renderRadar({
        ticker: 'AAPL', rawChain: only1016, allExpiryChain: only1016, gammaFlipLevel: null, oiPcr: 1, currentPrice: 200,
        initialFlowData: {}, currentFlowData: { ...currentFlowData, dataFreshness: { chainDate: '2026-10-16' } }, maxPain: 200, callWall: 210, putFloor: 190,
    }, { darkPool: { percent: 41.2, volume: 12300, totalVolume: 29850, buyPct: 0, sellPct: 0 } }, afterExpiry);
    assert.ok(!full.includes('No Flow Data Available') && full.includes('AI VERDICT') && full.includes('OPTIONS MARKET REGIME'));
    assert.equal(full.split('Dark Pool %').length - 1, 1);
    assert.equal(full.split('Short Vol %').length - 1, 1);
    // A truly empty source still shows the existing no-data panel.
    const empty = await renderRadar({ ticker: 'AAPL', rawChain: [], allExpiryChain: [], oiPcr: 1, currentPrice: 200, initialFlowData: {}, currentFlowData }, null, afterExpiry);
    assert.ok(empty.includes('No Flow Data Available') && !empty.includes('Dark Pool %')); // unchanged
});

test('review 6: 10/15 public new-position table keeps its 10/16-expiry contracts after 10/16 close — table matches the session total', () => {
    const page = 'src/app/[locale]/options-flow/page.tsx';
    const contracts = Array.from({ length: 12 }, (_, i) => ({
        ticker: `T${i}`, type: i % 2 ? 'put' : 'call', strike: 100 + i, expiry: '2026-10-16', contracts: 1000 + i, notional: 8_000_000 + i, isEtf: false,
    }));
    const data = { date: '2026-10-15', totalNotional: 100_000_000, tickers: 50, contracts };
    // Same filter the page applies (ContractTable rows, OG top 3, first fact), judged at the list's own session.
    const src = read(page);
    assert.ok(src.includes('const rows = sessionOptionRows(inputRows, data?.date);'));
    assert.ok(src.includes('sessionOptionRows(d?.contracts ?? [], d?.date).slice(0, 3)'));
    assert.ok(src.includes('const c0 = sessionOptionRows(data.contracts, data.date)[0];'));
    assert.ok(!/activeOptionRows\(/.test(src)); // the reader's clock never judges a past session's list
    for (const now of [afterExpiry, Date.parse('2026-10-18T19:14:00-04:00'), Date.parse('2026-10-19T10:00:00-04:00')]) {
        const rows = gate.sessionOptionRows(data.contracts, data.date, now);
        assert.equal(rows.length, 12, new Date(now).toISOString());
        assert.equal(rows[0].ticker, 'T0');
    }
    // Rows already expired at that session still drop; undated / future / invalid dates fall back to the live boundary.
    assert.equal(gate.sessionOptionRows([{ ...contracts[0], expiry: '2026-10-14' }], '2026-10-15', afterExpiry).length, 0);
    assert.equal(gate.sessionOptionRows(contracts, null, afterExpiry).length, 0);
    assert.equal(gate.sessionOptionRows(contracts, '2026-10-20', afterExpiry).length, 0);
    assert.equal(gate.sessionOptionRows(contracts, '2026-02-30', afterExpiry).length, 0);
    // Same session date, live day: the 10/16 contracts are live either way.
    assert.equal(gate.sessionOptionRows(contracts, '2026-10-16', Date.parse('2026-10-16T15:00:00-04:00')).length, 12);
});

// App EOD lists must use the same recorded session as their unchanged date label.
function appEodPositions(optionsEod: any) {
    const now = Date.parse('2026-10-19T10:00:00-04:00');
    const context = {
        optionsEod,
        activeOptionRows: (rows: any[]) => gate.activeOptionRows(rows, now),
        sessionOptionRows: (rows: any[], date: unknown) => gate.sessionOptionRows(rows, date, now),
    };
    const openingPositions = run(initializer(flowPath, 'openingPositions'), context);
    const uoaAlert = run(initializer(flowPath, 'uoaAlert'), { openingPositions });
    const source = read(flowPath);
    const start = source.indexOf(`const cs = ${initializer(flowPath, 'cs', true)};`);
    assert.ok(start >= 0);
    const whaleCode = source.slice(start).split('const nf =')[0];
    const whale = run(`(() => { ${whaleCode} return { rows, openingCount }; })()`, context);
    return { openingPositions, uoaAlert, whale };
}

test('app SPY: 10/15 session retains all eight 10/16-expiry WHALE rows and the opening alert when read on 10/19', () => {
    const now = Date.parse('2026-10-19T10:00:00-04:00');
    const top = Array.from({ length: 8 }, (_, i) => ({
        c: `O:SPY261016C${String((600 + i) * 1000).padStart(8, '0')}`,
        e: '2026-10-16', t: 'C', k: 600 + i, d: 1000 + i, v: 2000 + i, oi: 3000 + i,
    }));
    // Execute the actual API mapping, including its request-time expired flag, before the app consumes it.
    const apiPath = 'src/app/api/flow/options-eod/route.ts';
    const contracts = run(initializer(apiPath, 'contracts', true), {
        top, isExpired: run(initializer(apiPath, 'isExpired'), { nowMs: now, optionExpiryJudge }),
        classify: run(initializer(apiPath, 'classify'), {}),
    });
    assert.equal(contracts.length, 8);
    assert.ok(contracts.every((c: any) => c.expired === true && c.kind === 'OPENING'));
    assert.equal(gate.activeOptionRows(contracts, now).length, 0);
    const result = appEodPositions({ prevDate: '2026-10-15', date: '2026-10-16', contracts });
    assert.equal(result.whale.rows.length, 8);
    assert.equal(result.whale.openingCount, 8);
    assert.deepEqual(result.whale.rows.map((r: any) => r.contract), contracts.slice().reverse().map((r: any) => r.contract));
    assert.equal(result.openingPositions.length, 8);
    assert.equal(result.uoaAlert.contract, contracts[7].contract);
});

test('app EOD: prevDate wins, legacy date works, and rows already expired at the session still drop from WHALE and banner', () => {
    const contracts = ['2026-10-14', '2026-10-15', '2026-10-16'].map((expiration, i) => ({
        contract: `session-${i}`, expiration, kind: 'OPENING', oiChange: 1000 + i, strike: 600,
    }));
    const flagged = { ...contracts[2], contract: 'flagged', expired: true };
    for (const dates of [{ prevDate: '2026-10-15', date: '2026-10-16' }, { date: '2026-10-15' }]) {
        const result = appEodPositions({ ...dates, contracts: [...contracts, flagged] });
        assert.deepEqual(result.whale.rows.map((r: any) => r.contract), ['session-2', 'flagged', 'session-1']);
        assert.deepEqual(result.openingPositions.map((r: any) => r.contract), ['session-2', 'flagged', 'session-1']);
        assert.equal(result.whale.openingCount, 3);
        assert.equal(result.uoaAlert.contract, 'session-2');
    }
    const undated = appEodPositions({ contracts });
    assert.equal(undated.whale.rows.length, 0);
    assert.equal(undated.openingPositions.length, 0);
    assert.equal(undated.uoaAlert, null);
});

test('session expiry flag: public rows use their session expiry; undated, invalid and future sessions retain the live gate', () => {
    const now = Date.parse('2026-10-19T10:00:00-04:00');
    const rows = ['2026-10-14', '2026-10-15', '2026-10-16'].map(expiry => ({ expiry, expired: true }));
    assert.deepEqual(gate.sessionOptionRows(rows, '2026-10-15', now).map(r => r.expiry), ['2026-10-15', '2026-10-16']);
    // A future-expiry row flagged expired must still be rejected by every live fallback.
    const liveFlagged = [{ expiry: '2026-11-20', expired: true }];
    assert.equal(gate.activeOptionRows(liveFlagged, now).length, 0);
    for (const date of [null, '2026-02-30', '2026-10-20']) {
        assert.equal(gate.sessionOptionRows(liveFlagged, date, now).length, 0);
    }
});
