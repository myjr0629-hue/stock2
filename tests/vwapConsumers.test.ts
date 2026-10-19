/** Offline production-source execution for the fourth VWAP gate. No network/storage writes. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'node:child_process';
import { normalizeVwap, selectVwap, vwapDistancePct } from '../src/lib/vwap';
import { commandScores } from '../src/lib/commandScores';
import { netPremiumOf } from '../src/lib/premiumFlow';
import { computeUnifiedVolatilityRegime } from '../src/lib/metrics/volatilityRegime';
import { resolveCommandVolatilityObservation, formatObservationTime } from '../src/lib/commandVolatilityObservation';
import { convictionInputsOf, scoreCommandConviction } from '../src/lib/commandConviction';

const cmd = 'src/app/[locale]/app-view/cmd/page.tsx';
function find(file: string, predicate: (n: ts.Node) => boolean) {
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let found = '';
    const visit = (n: ts.Node) => { if (predicate(n)) found = n.getText(ast); ts.forEachChild(n, visit); };
    visit(ast); assert.ok(found, `missing source region in ${file}`); return found;
}
function run(code: string, context: Record<string, any> = {}): any {
    const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
    return vm.runInNewContext(js, { React, commandScores, convictionInputsOf, scoreCommandConviction, normalizeVwap, selectVwap, vwapDistancePct, netPremiumOf, computeUnifiedVolatilityRegime, resolveCommandVolatilityObservation, formatObservationTime, volatilityData: undefined, useMemo: (fn: () => any) => fn(), ...context });
}
function chart(vwap: any, range = '1D', closes = [100, 110, 90, 100]) {
    const fn = find(cmd, n => ts.isFunctionDeclaration(n) && n.name?.text === 'CandleChart');
    // Select inside CandleChart: the page also has a conviction variable named vwapVal.
    const ast = ts.createSourceFile('chart.tsx', fn, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let decl = '', jsx = '';
    const visit = (n: ts.Node) => {
        if (ts.isVariableDeclaration(n) && n.name.getText() === 'vwapVal') decl = n.getText(ast);
        if (ts.isJsxExpression(n) && n.expression?.getText(ast).startsWith('showVwap &&')) jsx = n.expression.getText(ast);
        ts.forEachChild(n, visit);
    };
    visit(ast); assert.ok(decl && jsx);
    return run(`const ${decl}; ({ value: vwapVal, jsx: (${jsx}) });`, {
        vwap, range, price: 123, displayCandles: closes.map(c => ({ c })), showVwap: true, CHART_W: 315,
        toY: (v: number) => { assert.equal(typeof v, 'number'); assert.ok(Number.isFinite(v)); return 50; },
    });
}
function signals(vwap: any) {
    const decl = find(cmd, n => ts.isVariableDeclaration(n) && n.name.getText() === 'signalsData');
    return run(`const ${decl}; signalsData;`, {
        data: { price: 123, vwap, unified: { structure: { underlyingPrice: 100 } } },
        tDashboard: (s: string) => s, readDarkPool: () => null, earningsWithin: () => false,
        iv30Level: null, // signalsData 가 쓰는 컴포넌트 변수(IV30 정합성 수리) — VWAP 시험과 무관
    });
}
function store(incoming: any) {
    let state: any, options: any, persisted: any;
    const exports: any = {};
    run(fs.readFileSync('src/stores/dashboardStore.ts', 'utf8'), {
        exports, AbortController, Date, console,
        fetch: async () => ({ ok: true, json: async () => ({ tickers: { NVDA: incoming } }) }),
        require: (id: string) => {
            if (id === 'zustand') return { create: () => (creator: any) => {
                state = creator((update: any) => {
                    state = { ...state, ...(typeof update === 'function' ? update(state) : update) };
                    persisted = JSON.parse(JSON.stringify(options.partialize(state)));
                }, () => state); return () => state;
            } };
            if (id === 'zustand/middleware') return { persist: (creator: any, opts: any) => { options = opts; return creator; } };
            if (id.endsWith('/vwap')) return { normalizeVwap, selectVwap, vwapDistancePct };
            if (id.endsWith('/impliedMove')) return { copyImpliedMoveGroup: () => {} };
            if (id.endsWith('/dashboardTickerStore')) return {};
            if (id.endsWith('/useOnePipe')) return { computeOnePipe: () => { throw new Error('price pipe must not run'); } };
            throw new Error(`unexpected module ${id}`);
        },
    });
    state.tickers = { NVDA: { vwap: 100, underlyingPrice: 123, levelsSource: 'structure' } };
    state.dashboardTickers = ['NVDA'];
    return { get: () => state, saved: () => persisted, options };
}

test('gate chart: null + closes [100,110,90,100] retains VWAP label and missing value, never 100.00', () => {
    const result = chart(null);
    const html = renderToStaticMarkup(result.jsx);
    assert.equal(result.value, null, html);
    assert.match(html, /VWAP/); assert.match(html, /—/); assert.doesNotMatch(html, /100\.00|NaN|Infinity|<line/);
});
for (const method of ['fetchDashboardData', 'fetchSingleTicker']) {
    test(`gate store ${method}: explicit null clears 100 in memory and persisted payload`, async () => {
        const s = store({ vwap: null }); await s.get()[method](method === 'fetchSingleTicker' ? 'NVDA' : ['NVDA']);
        assert.equal(s.get().tickers.NVDA.vwap, null);
        assert.equal(s.saved().tickers.NVDA.vwap, null);
    });
}
test('gate conviction: price 123 / underlying 100 / null VWAP stays missing with absent distance', () => {
    const result = signals(null);
    assert.equal(result.convictionScore, null); assert.equal(result.convictionGrade, null);
    assert.equal(result.vwap, null); assert.equal(result.vwapDiff, null);
});
test('store hydration never revives legacy VWAP; partialize never stores a session VWAP', () => {
    const s = store({});
    for (const levelsSource of ['structure', null]) {
        const next = s.options.merge({ tickers: { NVDA: { vwap: 100, levelsSource } } }, s.get());
        assert.equal(next.tickers.NVDA.vwap, null);
    }
    assert.equal(s.options.partialize(s.get()).tickers.NVDA.vwap, null);
});
test('valid daily VWAP stays measured; other chart ranges cannot fabricate VWAP', () => {
    assert.equal(chart(109.6).value, 109.6);
    assert.match(renderToStaticMarkup(chart(109.6).jsx), /VWAP 109\.60/);
    for (const range of ['1W', '1M']) assert.equal(chart(109.6, range).value, null);
    assert.equal(chart(null, '1D', []).value, null);
});
test('store absent VWAP preserves same-session value; valid measured VWAP replaces it', async () => {
    for (const method of ['fetchDashboardData', 'fetchSingleTicker']) {
        for (const [incoming, expected] of [[{}, 100], [{ vwap: 109.6 }, 109.6]] as const) {
            const s = store(incoming); await s.get()[method](method === 'fetchSingleTicker' ? 'NVDA' : ['NVDA']);
            assert.equal(s.get().tickers.NVDA.vwap, expected);
        }
    }
});
test('conviction retains measured above/below/equal VWAP scores', () => {
    for (const [value, score] of [[100, 58], [150, 42], [123, 50]] as const) assert.equal(signals(value).convictionScore, score);
});

test('shared app/warm AI snapshot uses source VWAP, never underlying price or fake 0% distance', () => {
    const buildDeepSnapshot = require('../src/lib/ai/deepSnapshot').buildDeepSnapshot;
    for (const [value, expected] of [[null, 'N/A'], [100, '23.0%'], [123, '0.0%']] as const) {
        const result = run('buildDeepSnapshot(x);', { buildDeepSnapshot,
            x: { price: 123, rawTickerData: { vwap: value }, unified: { structure: { underlyingPrice: 100 } } },
            earningsDaysOrNull: () => null,
        });
        assert.equal(result.vwap, value); assert.equal(result.vwapDistance, expected);
    }
});
const metricsFile = 'src/components/intel/mobile/MobileCmdMetrics.tsx';
test('mobile metrics conviction uses VWAP contract instead of structure underlying price', () => {
    const decl = find(metricsFile, n => ts.isVariableDeclaration(n) && n.name.getText() === 'conviction');
    for (const [vwap, score] of [[null, 50], [100, 58], [150, 42]] as const) {
        const result = run(`const ${decl}; conviction;`, { vwap, smaCross: 'NONE', structure: { underlyingPrice: 100 }, q: { price: 123 } });
        assert.equal(result.score, score);
    }
});
test('mobile metrics VWAP card retains label and missing placeholder', () => {
    const expr = find(metricsFile, n => ts.isCallExpression(n) && n.expression.getText().startsWith('(() =>') && n.getText().includes('label="VWAP"'));
    const result = run(`${expr};`, {
        vwap: null, structure: { underlyingPrice: 100 }, q: { price: 123 },
        SignalCard: ({ label, value, sub }: any) => React.createElement('div', {}, label, value, sub),
    });
    const html = renderToStaticMarkup(result);
    assert.match(html, /VWAP—/); assert.doesNotMatch(html, /100\.00|23\.0%/);
});
test('mobile overview AI snapshot never supplies fake zero distance', () => {
    const decl = find('src/components/intel/mobile/MobileCmdOverview.tsx', n => ts.isVariableDeclaration(n) && n.name.getText() === 'buildSnapshot');
    const result = run(`const ${decl}; buildSnapshot();`, {
        buildDeepSnapshot: require('../src/lib/ai/deepSnapshot').buildDeepSnapshot, ticker: 'TEST', useCallback: (fn: any) => fn, vwap: null, unified: { structure: { underlyingPrice: 100 } }, q: { price: 123 }, earningsDaysOrNull: () => null,
    });
    assert.equal(result.vwap, null); assert.equal(result.vwapDistance, 'N/A');
});
test('app Flow absent VWAP does not fabricate price * 0.995', () => {
    const decl = find('src/app/[locale]/app-view/flow/page.tsx', n => ts.isVariableDeclaration(n) && n.name.getText() === 'liveVwap');
    const result = run(`const ${decl}; liveVwap;`, {
        tickerData: { vwap: null, rawTickerData: { vwap: 100 } }, displayPrice: 123,
        pickPositiveNumber: (...values: any[]) => values.find(v => typeof v === 'number' && v > 0) ?? null,
    });
    assert.equal(result, null);
});

test('source selector: explicit null/invalid values stop fallback; undefined permits it', () => {
    for (const value of [null, 0, -1, NaN, Infinity, '100']) assert.equal(selectVwap(value, 100), null);
    assert.equal(selectVwap(undefined, 109.6), 109.6);
    assert.equal(selectVwap(undefined, null, 100), null);
    assert.equal(selectVwap(), null);
});
test('all backend VWAP selectors honor fresh null over stale positive VWAP', () => {
    const files = ['src/app/api/live/ticker/route.ts', 'src/app/api/dashboard/unified/route.ts',
        'src/services/watchlistBatchService.ts', 'src/services/top3Enrichment.ts', 'src/app/api/quant-radar/route.ts'];
    for (const file of files) {
        const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        let count = 0;
        const visit = (n: ts.Node) => {
            if (ts.isCallExpression(n) && n.expression.getText(ast) === 'selectVwap') {
                count++;
                for (const [value, expected] of [[null, null], [109.6, 109.6]] as const) {
                    const snap = { day: { vw: value }, prevDay: { vw: 100 } };
                    assert.equal(run(n.getText(ast), { S: snap, t: snap, snap: { ...snap, ticker: snap },
                        stockData: { vwap: value }, c: snap, entry: { vwap: 100 }, ac: { vwap: 100 },
                        ticker: 'NVDA', vwapMap: { NVDA: 100 }, vwap: 100 }), expected, `${file}: ${n.getText(ast)}`);
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(ast); assert.ok(count > 0, file);
    }
});
test('dashboard refetched null cannot be bypassed by an older previous-day VWAP', () => {
    const expr = find('src/app/api/dashboard/unified/route.ts', n => ts.isPropertyAssignment(n)
        && n.name.getText() === 'vwap' && n.getText().includes('ac.vwap'));
    const result = run(`({${expr}}).vwap;`, {
        snap: { prevDay: { vw: 100 } }, vwapMap: { NVDA: null }, ac: { vwap: 100 }, ticker: 'NVDA',
    });
    assert.equal(result, null);
});
test('mobile parent passes fresh null to metrics/AI/charts instead of SSR VWAP', () => {
    const file = 'src/components/intel/mobile/MobileCommandPage.tsx';
    const decl = find(file, n => ts.isVariableDeclaration(n) && n.name.getText() === 'metricVwap');
    assert.equal(run(`const ${decl}; metricVwap;`, {
        tickerApiData: { vwap: null }, initialStockData: { vwap: 100 }, unified: { _dynamoPrice: { vwap: 100 } },
    }), null);
    for (const tag of ['MobileCmdMetrics', 'MobileCmdOverview']) {
        const jsx = find(file, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === tag);
        assert.match(jsx, /vwap=\{metricVwap\}/);
    }
    for (const tag of ['MobileCmdChart', 'MobileCmdOptions']) {
        const jsx = find(file, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === tag);
        assert.match(jsx, /initialStockData=\{metricStockData\}/);
    }
});
test('app Flow final JSX keeps VWAP card/label and existing missing marker', () => {
    const file = 'src/app/[locale]/app-view/flow/page.tsx';
    const jsx = find(file, n => ts.isJsxElement(n) && n.getText().startsWith('<div className={s.p2Vital}>') && n.getText().includes('liveVwap'));
    const html = renderToStaticMarkup(run(`(${jsx});`, { liveVwap: null, displayPrice: 123, locale: 'en', s: {} }));
    assert.match(html, /VWAP/); assert.match(html, /—/); assert.doesNotMatch(html, /\$0|0\.00%|above|below|<i /);
});
test('quant auto response and smart limit preserve missing VWAP instead of current-price substitution', async () => {
    const file = 'src/app/api/quant-radar/route.ts';
    const decl = find(file, n => ts.isVariableDeclaration(n) && n.name.getText() === 'calculateSmartLimit');
    const map = find(file, n => ts.isCallExpression(n) && n.expression.getText() === 'allocatedPort.map');
    for (const value of [null, 100]) {
        const rows = await run(`const ${decl}; Promise.all(${map});`, {
            allocatedPort: [{ entry: { ticker: 'NVDA', vwap: 100, alphaSnapshot: { score: 50 } }, weight: 1 }],
            investableCapital: 1000,
            fetchMassive: async () => ({ ticker: { lastTrade: { p: 123 }, day: { vw: value }, prevDay: { c: 120 } } }),
        });
        assert.equal(rows[0].realtime.price, 123); assert.equal(rows[0].realtime.vwap, value);
        assert.equal(rows[0].execution.smartLimitStrategy, value === null ? null : 'VWAP_PULLBACK');
        if (value === null) assert.equal(rows[0].execution.smartLimitPrice, null);
    }
});

test('unchanged desktop/dashboard mobile consumers retain their missing-value displays', () => {
    const desktop = find('src/app/[locale]/dashboard/DashboardClient.tsx', n => ts.isCallExpression(n)
        && n.expression.getText().startsWith('(() =>') && n.getText().includes("const vwap = data?.vwap"));
    const html = renderToStaticMarkup(run(desktop, {
        data: { underlyingPrice: 123, vwap: null }, td: (key: string) => key,
        BarChart3: () => null, CardTooltip: ({ children }: any) => children,
    }));
    assert.match(html, /vwapDistance/); assert.match(html, /—/); assert.doesNotMatch(html, /\$0|0\.0%/);
    const mobile = find('src/components/mobile/MobileMetricsTab.tsx', n => ts.isCallExpression(n)
        && n.expression.getText().startsWith('(() =>') && n.getText().includes('const vw = data?.vwap'));
    const mobileHtml = renderToStaticMarkup(run(mobile, {
        data: { vwap: null }, price: 123, td: (key: string) => key, BarChart3: () => null, CenteredBar: () => null,
        MobileMetricCard: ({ title, value, sub }: any) => React.createElement('div', {}, title, value, sub),
    }));
    assert.match(mobileHtml, /vwapDistance—/); assert.doesNotMatch(mobileHtml, /\$0|0\.0%/);
});
test('app Command vital card retains its label and dash after API null mapping', () => {
    const jsx = find(cmd, n => ts.isJsxElement(n) && n.getText().startsWith('<div className={s.p2Vital}>')
        && n.getText().includes('data.vwap'));
    const html = renderToStaticMarkup(run(`(${jsx});`, {
        data: { vwap: null }, displayPrice: 123, locale: 'en', s: {}, MetricInfo: () => null,
    }));
    assert.match(html, /VWAP/); assert.match(html, /—/); assert.doesNotMatch(html, /\$0|above|below|0\.00%/);
});
test('screen labels and translation keys remain identical to starting HEAD aaf27c68a', () => {
    // Conviction keys moved with the shared score calculation. Include the
    // actual cLabel assignments, while checking the page still translates them.
    // B5: the label keys live in the one shared conviction definition (lib/commandConviction).
    const shared = ts.createSourceFile('conviction.ts', fs.readFileSync('src/lib/commandConviction.ts', 'utf8'), ts.ScriptTarget.Latest, true);
    const movedKeys: string[] = [];
    const collect = (n: ts.Node) => {
        if (ts.isStringLiteral(n) && /^conv[A-Z]/.test(n.text)) movedKeys.push(n.text);
        ts.forEachChild(n, collect);
    };
    collect(shared);
    assert.equal(new Set(movedKeys).size, 7);
    const labels = (code: string) => {
        const ast = ts.createSourceFile('view.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const result: string[] = [];
        const visit = (n: ts.Node) => {
            if (ts.isJsxText(n) && n.text.trim() && !['$', '%'].includes(n.text.trim())) result.push(n.text.trim()); // 단위 기호는 라벨이 아니다
            if (ts.isJsxAttribute(n) && ['label', 'title', 'term'].includes(n.name.getText(ast))
                && n.initializer && ts.isStringLiteral(n.initializer)) result.push(n.getText(ast));
            if (ts.isCallExpression(n) && ['td', 'tDashboard', 'gt', 'tg'].includes(n.expression.getText(ast))
                && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) result.push(n.arguments[0].text);
            ts.forEachChild(n, visit);
        };
        // Repeated translation calls do not introduce additional screen labels.
        visit(ast); return [...new Set(result)].sort();
    };
    for (const file of [cmd, 'src/app/[locale]/app-view/flow/page.tsx', metricsFile,
        'src/components/intel/mobile/MobileCmdOverview.tsx', 'src/components/intel/mobile/MobileCommandPage.tsx']) {
        const code = fs.readFileSync(file, 'utf8');
        if (file === cmd) for (const key of new Set(movedKeys)) assert.ok(code.includes(`tDashboard('${key}')`), key);
        const current = [...new Set([...labels(code), ...(file === cmd ? movedKeys : [])])].sort();
        assert.deepEqual(current, labels(execFileSync('git', ['show', `aaf27c68a:${file}`], { encoding: 'utf8' })), file);
    }
});
