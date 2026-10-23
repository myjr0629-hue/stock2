/** Gate regressions: real adapter -> FED -> macro, and fundamentals API -> unified exit. Offline only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { observationMonthsAgo } from '../src/lib/economicSeries';

const root = path.resolve(__dirname, '..');
const quiet = { log() {}, warn() {}, error() {} };
const json = { json: (data: any) => ({ json: async () => data }) };
const forbidden = () => { throw new Error('Live I/O forbidden'); };
const compile = (source: string) => ts.transpileModule(source, { fileName: 'offline.tsx', compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.React,
} }).outputText;
function load(rel: string, mocks: Record<string, any>, extra = ''): any {
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', 'console', 'fetch', compile(fs.readFileSync(path.join(root, rel), 'utf8') + extra))(
        (id: string) => id in mocks ? mocks[id] : forbidden(), mod, mod.exports, quiet, forbidden,
    );
    return mod.exports;
}
function functions(rel: string, names: string[], deps: Record<string, any>): any {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    const ast = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
    const nodes = ast.statements.filter((n: any) => names.includes(n.name?.text));
    assert.equal(nodes.length, names.length, 'Extract every requested production function');
    const js = compile(nodes.map(n => n.getText(ast).replace(/^export /, '')).join('\n'));
    return new Function(...Object.keys(deps), 'console', js + `; return {${names.join(',')}};`)(...Object.values(deps), quiet);
}
function economic(rows: any[] | Record<string, any[]>) {
    return functions('src/services/intrinioClient.ts', [
        'getEconomicSeries', 'getInflationExpectationsIntrinio', 'getInflationIntrinio', 'getTreasuryYieldsFred',
    ], {
        callIntrinio: async (endpoint: string) => ({ historical_data: Array.isArray(rows)
            ? rows : rows[decodeURIComponent(endpoint.split('/')[2])] ?? [] }),
        observationMonthsAgo,
        TREASURY_SERIES: [['$DGS10', 'yield_10_year'], ['$DGS2', 'yield_2_year']],
    });
}
function economy(rows: any[] | Record<string, any[]>) {
    return load('src/services/macroEconomy.ts', {
        './intrinioClient': economic(rows), '@/lib/economicSeries': { observationMonthsAgo },
    }).getMacroEconomy();
}
function realGauge(realYield: any) {
    const rel = 'src/components/guardian/RealityCheck.tsx';
    const ast = ts.createSourceFile(rel, fs.readFileSync(path.join(root, rel), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let gauge: ts.JsxSelfClosingElement | undefined;
    function visit(node: ts.Node) {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'MiniGauge'
            && node.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(ast) === 'label'
                && p.initializer && ts.isStringLiteral(p.initializer) && p.initializer.text === 'REAL')) gauge = node;
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(gauge, 'Keep the REAL gauge rendered');
    return new Function('realYield', 't', 'getRealColor', 'React', compile(`const MiniGauge = null; const gauge = ${gauge.getText(ast)};`) + ';return gauge;')(
        realYield, (key: string) => key, (stance: string) => stance,
        { createElement: (_component: any, props: any) => props },
    );
}
const monthlyRows = () => Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 9 - i, 1)).toISOString().slice(0, 10),
    value: i === 0 ? 120 : i === 12 ? 100 : i === 13 ? 80 : 110,
}));
async function realYield(rows: any[]) {
    const adapter = economic(rows);
    const fed = load('src/services/fedApiClient.ts', {
        './redisClient': {}, '@/services/intrinioClient': {}, './massiveClient': {
            fetchMassive: async (url: string) => url.includes('inflation-expectations')
                ? adapter.getInflationExpectationsIntrinio() : { cpi: 100, date: '2026-09-01' },
        },
    });
    const macro = load('src/services/macroHubProvider.ts', {
        './massiveClient': {}, '@/services/intrinioClient': {}, './marketStatusProvider': {}, './eventHubProvider': {},
        './fedApiClient': fed, './yahooFinanceHub': {}, './redisClient': {}, '@/lib/yieldChange': {},
        './marketIndexBasis': { loadMarketIndexBasis: forbidden },
        '@/lib/macroSnapshotCarry': require('../src/lib/macroSnapshotCarry'),
        '@/lib/macroFredFallback': require('../src/lib/macroFredFallback'),
    }, '\nexport { fetchRealYieldData };');
    return macro.fetchRealYieldData(4.2, '2026-10-16', 'YAHOO');
}
async function fundamentals(ratios: any = {}, unified: any = null) {
    const route = load('src/app/api/live/fundamentals/route.ts', {
        'next/server': { NextResponse: json }, '@/lib/incomeMetrics': require('../src/lib/incomeMetrics'),
        '@/lib/cache/redisSWR': { swrFetch: async (_key: string, fn: any) => ({ data: await fn(), _cache: 'miss' }) },
        '@/lib/aws/unifiedCacheProvider': { getUnifiedCache: async () => unified },
        '@/services/massiveClient': { fetchMassive: async (url: string) => ({ results: url.includes('/ratios') ? [ratios] : [] }) },
    });
    return (await route.GET({ nextUrl: new URL('https://offline.invalid/?t=TEST') })).json();
}
function unifiedExit(result: any) {
    let calls = 0;
    const mod = functions('src/app/api/command/unified/route.ts', ['jsonResponse', 'overlayFundamentals'], {
        isMarketHoursNow: () => false, overlayEarningsDate: async (d: any) => d,
        overlayStructureLevels: async (d: any) => d, normalizeShape: (d: any) => d,
        stripStaleInstitutional: (d: any) => d, NextResponse: json, getFundamentals: forbidden,
        callInternalGet: async () => { calls++; if (result instanceof Error) throw result; return result; },
    });
    return { calls: () => calls, respond: async (d: any, ticker?: string) => (await mod.jsonResponse(d, 200, ticker)).json() };
}
const legacy = () => ({
    ticker: 'TEST', sector: 'Technology', name: 'Fixture Company', marketCap: 123, pe: 15, price: 42,
    score: 8, grade: 'F', netMargin: 0, revenueGrowth: 20, custom: { keep: true },
    breakdown: { pe: { value: '15', score: 4, label: 'P/E' }, rev: { value: '+20%', score: 8, label: 'Rev' }, margin: { value: '0%', score: 4, label: 'Margin' } },
});
function assertMetadata(actual: any, expected = legacy()) {
    for (const key of ['ticker', 'sector', 'name', 'marketCap', 'pe', 'price', 'custom']) assert.deepEqual(actual[key], (expected as any)[key], key);
    for (const key of Object.keys(expected)) assert.ok(Object.hasOwn(actual, key), `Preserve field ${key}`);
}
// ── 4차 관문: 실물경제 스트립을 가짜 React 로 실제 렌더한다(네트워크·DOM 없음)
const MACRO_KEYS = ['fedFunds', 'unemployment', 'cpiYoY', 'payrolls', 'consumerSentiment', 'gdpQoQ', 'curve10y2y'];
function renderStrip(metrics: any[], locale: 'ko' | 'en' | 'ja' = 'ko') {
    const rel = 'src/components/app/MacroEconomyStrip.tsx';
    const mod: any = { exports: {} };
    const rows: Array<{ m: any; node: any }> = [];
    let state = 0;
    const react = {
        useState: (init: any) => [[metrics, 'FRED (St. Louis Fed) via Intrinio', false][state++] ?? init, () => {}],
        useEffect: () => {},
    };
    const React = {
        createElement: (type: any, props: any, ...children: any[]) => {
            if (typeof type === 'function') {
                const node = type({ ...(props || {}), children });
                if (props?.m) rows.push({ m: props.m, node });
                return node;
            }
            return { type, props: props || {}, children };
        },
        Fragment: 'fragment',
    };
    new Function('require', 'module', 'exports', 'console', 'fetch', 'React', compile(fs.readFileSync(path.join(root, rel), 'utf8')))(
        (id: string) => id === 'react' ? react : forbidden(), mod, mod.exports, quiet, forbidden, React,
    );
    const tree = mod.exports.default({ locale });
    return { tree, rows };
}
function textOf(node: any): string {
    if (node == null || node === false || node === true) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('|');
    return (node.children || []).map(textOf).join('|');
}
const cells = (node: any) => (node.children || []).flat().filter((c: any) => c && c.type === 'span').map(textOf);
async function economyRoute(rows: any[] | Record<string, any[]>) {
    const service = load('src/services/macroEconomy.ts', {
        './intrinioClient': economic(rows), '@/lib/economicSeries': { observationMonthsAgo },
    });
    const route = load('src/app/api/market/economy/route.ts', {
        'next/server': { NextResponse: { json: (data: any, init?: any) => ({ status: init?.status ?? 200, data }) } },
        '@/services/macroEconomy': service,
        '@/lib/macroLastGoodStore': { readLastGood: async () => ({}), saveLastGood: async () => {} },
        '@/lib/macroLastGood': require('../src/lib/macroLastGood'),
    });
    return route.GET();
}
const gdpAprilMissing = () => ({
    '$CPIAUCSL': monthlyRows(), '$UNRATE': monthlyRows(), '$PAYEMS': monthlyRows(), '$UMCSENT': monthlyRows(),
    '$DFF': [{ date: '2026-10-16', value: 4.2 }, { date: '2026-10-15', value: 4.1 }],
    // GDP 7월 120 · 1월 80, 비교 대상 4월 관측 없음(관문 재현 그대로)
    '$GDP': [{ date: '2026-07-01', value: 120 }, { date: '2026-01-01', value: 80 }],
    '$T10Y2Y': [{ date: '2026-10-16', value: 0.3 }, { date: '2026-10-15', value: 0.2 }],
});
let passed = 0, failed = 0;
async function test(name: string, fn: () => any) {
    try { await fn(); passed++; console.log(`PASS ${name}`); }
    catch (e: any) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
}
(async () => {
    await test('P2 CPI/PCE YoY stays at 20% when an intermediate month is missing', async () => {
        for (const gap of [null, '', false, NaN]) {
            const rows: any[] = monthlyRows(); rows[5].value = gap;
            const d = await economic(rows).getInflationIntrinio();
            assert.equal(d.cpiYoY, 20); assert.equal(d.pceYoY, 20);
            const macro = await economy(rows);
            const cpi = macro.metrics.find((m: any) => m.key === 'cpiYoY');
            assert.equal(cpi.value, 20); assert.equal(cpi.change, -17.5);
        }
    });
    await test('P2 absent year-ago month stays missing instead of comparing 13 months ago', async () => {
        for (const remove of [false, true]) {
            const rows: any[] = monthlyRows();
            if (remove) rows.splice(12, 1); else rows[12].value = null;
            const d = await economic(rows).getInflationIntrinio();
            assert.equal(d.cpi, 120); assert.equal(d.pce, 120);
            assert.equal(d.cpiYoY, null); assert.equal(d.pceYoY, null);
        }
    });
    await test('P2 CPI prior YoY change requires the prior calendar month and its own year-ago month', async () => {
        for (const gapIndex of [1, 13]) {
            const rows: any[] = monthlyRows(); rows[gapIndex].value = null;
            const d = await economy(rows);
            const cpi = d.metrics.find((m: any) => m.key === 'cpiYoY');
            assert.equal(cpi.value, 20); assert.equal(cpi.change, null);
        }
    });
    await test('P2 CPI and PCE use their own latest observation month across year boundaries', async () => {
        const rows: any[] = monthlyRows(); rows[0].value = null;
        const d = await economic(rows).getInflationIntrinio();
        assert.equal(d.date, '2026-09-01'); assert.equal(d.cpiYoY, 37.5); assert.equal(d.pceYoY, 37.5);
        const sparse = [{ date: '2026-01-01', value: 120 }, { date: '2025-01-01', value: 100 }];
        assert.equal((await economic(sparse).getInflationIntrinio()).cpiYoY, 20);
        const separate = await economic({ '$CPIAUCSL': sparse, '$PCEPI': [
            { date: '2025-12-01', value: 105 }, { date: '2024-12-01', value: 100 },
        ] }).getInflationIntrinio();
        assert.equal(separate.cpiYoY, 20); assert.equal(separate.pceYoY, 5);
    });
    await test('P2 complete monthly observations retain main comparison results', async () => {
        const rows = monthlyRows();
        const d = await economic(rows).getInflationIntrinio();
        assert.equal(d.cpiYoY, 20); assert.equal(d.pceYoY, 20);
        const macro = await economy({
            '$CPIAUCSL': rows, '$UNRATE': rows, '$PAYEMS': rows, '$UMCSENT': rows,
            '$DFF': [{ date: '2026-10-16', value: 4.2 }, { date: '2026-10-15', value: 4.1 }],
            '$GDP': [{ date: '2026-07-01', value: 120 }, { date: '2026-04-01', value: 100 }],
            '$T10Y2Y': [{ date: '2026-10-16', value: 0.3 }, { date: '2026-10-15', value: 0.2 }],
        });
        assert.equal(macro.missing, 0);
        assert.deepEqual(macro.metrics.map((m: any) => [m.key, m.value, m.change]), [
            ['fedFunds', 4.2, 0.1], ['unemployment', 120, 10], ['cpiYoY', 20, -17.5],
            ['payrolls', 10, 10], ['consumerSentiment', 120, 10], ['gdpQoQ', 20, null], ['curve10y2y', 0.3, 0.1],
        ]);
    });
    await test('P2 zero latest index is observed; zero or missing year-ago index cannot be a denominator', async () => {
        for (const latest of [0, '0']) {
            const rows: any[] = monthlyRows(); rows[0].value = latest;
            const d = await economic(rows).getInflationIntrinio();
            assert.equal(d.cpi, 0); assert.equal(d.cpiYoY, -100); assert.equal(d.pceYoY, -100);
        }
        for (const prior of [0, null, '']) {
            const rows: any[] = monthlyRows(); rows[12].value = prior;
            const d = await economic(rows).getInflationIntrinio();
            assert.equal(d.cpiYoY, null); assert.equal(d.pceYoY, null);
        }
    });
    await test('P2 monthly level changes do not silently become two-month changes', async () => {
        const rows = [{ date: '2026-10-01', value: 120 }, { date: '2026-09-01', value: null }, { date: '2026-08-01', value: 100 }];
        const d = await economy(rows);
        for (const key of ['unemployment', 'consumerSentiment']) {
            const metric = d.metrics.find((m: any) => m.key === key);
            assert.equal(metric.value, 120); assert.equal(metric.change, null); assert.equal(metric.watch, null);
        }
    });
    await test('P2 payroll acceleration requires consecutive calendar months', async () => {
        const d = await economy([{ date: '2026-10-01', value: 120 }, { date: '2026-09-01', value: 110 }, { date: '2026-07-01', value: 100 }]);
        const payroll = d.metrics.find((m: any) => m.key === 'payrolls');
        assert.equal(payroll.value, 10); assert.equal(payroll.change, null);
    });
    await test('P2 GDP QoQ selects exactly the prior quarter and never a six-month comparison', async () => {
        const valid = [{ date: '2026-07-01', value: 120 }, { date: '2026-04-01', value: 100 }, { date: '2026-01-01', value: 80 }];
        const d = await economy(valid);
        assert.equal(d.metrics.find((m: any) => m.key === 'gdpQoQ').value, 20);
        const missing: any[] = valid.map(r => ({ ...r })); missing[1].value = null;
        const unavailable = await economy(missing);
        // 4차 관문: 비교 분기가 없으면 6개월 전과 비교하지 않되, 행은 목록에서 빼지 않는다(칸 숨김 금지)
        const gdpRow = unavailable.metrics.find((m: any) => m.key === 'gdpQoQ');
        assert.ok(gdpRow, 'GDP row must stay in the list');
        assert.equal(gdpRow.value, null); assert.equal(gdpRow.change, null); assert.equal(gdpRow.watch, null);
    });
    await test('P2 missing real yield renders both REAL value and stance as a dash', async () => {
        for (const source of [null, '', false]) {
            const result = await realYield([{ date: '2026-10-16', value: source }]);
            const gauge = realGauge(result);
            assert.equal(gauge.label, 'REAL'); assert.equal(gauge.value, '—'); assert.equal(gauge.subLabel, '—');
        }
        const mismatched = await realYield([{ date: '2026-10-15', value: 2.3 }]);
        assert.equal(realGauge(mismatched).subLabel, '—'); assert.equal(realGauge(undefined).subLabel, '—');
    });
    await test('P2 measured neutral, tight and loose real yields retain existing stance labels', async () => {
        for (const [value, label] of [[4.2, 'stanceNeutral'], [0, 'stanceTight'], [5, 'stanceLoose']] as const) {
            const result = await realYield([{ date: '2026-10-16', value }]);
            const gauge = realGauge(result);
            assert.equal(gauge.subLabel, label); assert.notEqual(gauge.value, '—');
        }
    });
    await test('P1 source null cannot create +4.20% TIGHT through adapter/FED/macro', async () => {
        assert.equal(await realYield([{ date: '2026-10-16', value: null }]), null);
    });
    await test('P1 missing, blank, boolean and nonfinite economic observations are absent', async () => {
        for (const value of [undefined, '', ' ', false, true, NaN, Infinity, '.', {}, []]) {
            assert.deepEqual(await economic([{ date: '2026-10-16', value }]).getEconomicSeries('$T5YIE'), [], String(value));
        }
    });
    await test('P1 numeric zero and string zero remain measured observations', async () => {
        for (const value of [0, '0']) {
            const d = await realYield([{ date: '2026-10-16', value }]);
            assert.equal(d.inflationExpectation, 0); assert.equal(d.realYield, 4.2); assert.equal(d.stance, 'TIGHT');
        }
    });
    await test('P1 older valid expectations cannot acquire missing latest observation date', async () => {
        assert.equal(await realYield([{ date: '2026-10-16', value: null }, { date: '2026-10-15', value: 2.3 }]), null);
    });
    await test('P1 valid matching rates still calculate measured zero real yield', async () => {
        const d = await realYield([{ date: '2026-10-16', value: '4.2' }]);
        assert.equal(d.realYield, 0); assert.equal(d.stance, 'NEUTRAL');
    });
    await test('shared economic adapter excludes absent CPI/PCE observations', async () => {
        const d = await economic([{ date: '2026-10-16', value: null }]).getInflationIntrinio();
        assert.equal(d.count, 0); assert.deepEqual(d.results, []);
    });
    await test('shared economic adapter excludes absent FRED treasury observations', async () => {
        const d = await economic([{ date: '2026-10-16', value: null }]).getTreasuryYieldsFred();
        assert.equal(d.count, 0); assert.deepEqual(d.results, []);
    });
    await test('shared economic adapter preserves valid CPI/PCE and FRED zero', async () => {
        const a = economic([{ date: '2026-10-16', value: 0 }]);
        const inflation = await a.getInflationIntrinio();
        assert.equal(inflation.cpi, 0); assert.equal(inflation.pce, 0);
        const treasury = await a.getTreasuryYieldsFred();
        assert.equal(treasury.results[0].yield_10_year, 0); assert.equal(treasury.results[0].yield_2_year, 0);
    });
    await test('shared macro economy caller receives no fabricated observations', async () => {
        const economy = load('src/services/macroEconomy.ts', {
            '@/lib/economicSeries': { observationMonthsAgo },
            './intrinioClient': economic([{ date: '2026-10-16', value: null }, { date: '2026-10-15', value: '' }]),
        });
        const d = await economy.getMacroEconomy();
        assert.equal(d.missing, 7); assert.deepEqual(d.metrics, []); assert.equal(d.newestAsOf, null);
    });
    await test('shared macro economy caller preserves measured zero and valid series', async () => {
        const rows = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2026, 9-i, 1)).toISOString().slice(0, 10), value: 100-i }));
        const economy = load('src/services/macroEconomy.ts', { '@/lib/economicSeries': { observationMonthsAgo }, './intrinioClient': {
            getEconomicSeries: (symbol: string) => economic(symbol === '$DFF' ? rows.map(r => ({ ...r, value: 0 })) : rows).getEconomicSeries(symbol),
        } });
        const d = await economy.getMacroEconomy();
        assert.equal(d.missing, 0); assert.equal(d.metrics.length, 7);
        const rate = d.metrics.find((m: any) => m.key === 'fedFunds');
        assert.equal(rate.value, 0); assert.equal(rate.change, 0);
        assert.ok(d.metrics.every((m: any) => Number.isFinite(m.value)));
    });
    await test('P2 fallback correction preserves cached metadata and clears obsolete income values', async () => {
        const old = legacy();
        const d = await unifiedExit(await fundamentals()).respond({ fundamentals: old }, 'TEST');
        assertMetadata(d.fundamentals); assert.equal(d.fundamentals.netMargin, null); assert.equal(d.fundamentals.revenueGrowth, null);
        assert.equal(old.netMargin, 0); assert.equal(old.revenueGrowth, 20);
    });
    await test('P2 fundamentals fallback exposes supplier market cap including actual zero', async () => {
        for (const market_cap of [456, 0]) assert.equal((await fundamentals({ market_cap })).marketCap, market_cap);
        assert.equal((await fundamentals()).marketCap, null);
    });
    await test('P2 supplier market cap supersedes cached cap through unified exit', async () => {
        for (const market_cap of [456, 0]) {
            const d = await unifiedExit(await fundamentals({ market_cap })).respond({ fundamentals: legacy() }, 'TEST');
            assert.equal(d.fundamentals.marketCap, market_cap); assert.equal(d.fundamentals.sector, 'Technology');
        }
    });
    await test('P2 repaired score and margin zero overwrite obsolete derived fields', async () => {
        const result = { _incomeMetricsVersion: 1, score: 0, grade: 'F', revenueGrowth: 0, netMargin: 0, breakdown: { rev: { value: '0%', score: 4, label: 'Rev' } } };
        const d = await unifiedExit(result).respond({ fundamentals: legacy() }, 'TEST');
        assertMetadata(d.fundamentals); assert.equal(d.fundamentals.score, 0); assert.equal(d.fundamentals.netMargin, 0); assert.equal(d.fundamentals.revenueGrowth, 0);
        assert.equal(d.fundamentals.breakdown.rev.value, '0%');
    });
    for (const [name, result] of [['null response', null], ['error payload', { error: 'Failed' }], ['thrown failure', new Error('offline')]] as const) {
        await test(`P2 ${name} retains metadata but invalidates obsolete income calculations`, async () => {
            const d = await unifiedExit(result).respond({ fundamentals: legacy() }, 'TEST');
            assertMetadata(d.fundamentals); assert.equal(d.fundamentals.netMargin, null); assert.equal(d.fundamentals.revenueGrowth, null);
            assert.equal(d.fundamentals.score, null); assert.equal(d.fundamentals.grade, 'NO_DATA');
            assert.equal(d.fundamentals.breakdown.rev.value, '—'); assert.equal(d.fundamentals.breakdown.margin.value, '—');
            assert.equal(d.fundamentals.breakdown.margin.score, 0); assert.equal(d.fundamentals.breakdown.pe.value, '15');
        });
    }
    await test('P2 missing ticker retains every legacy field without a supplier call', async () => {
        const old: any = legacy(); delete old.ticker;
        const exit = unifiedExit(null);
        const d = await exit.respond({ fundamentals: old });
        for (const key of Object.keys(old)) assert.ok(Object.hasOwn(d.fundamentals, key));
        assert.equal(d.fundamentals.sector, old.sector); assert.equal(d.fundamentals.netMargin, null); assert.equal(exit.calls(), 0);
    });
    await test('P2 corrected and absent fundamentals require no additional query', async () => {
        const exit = unifiedExit(new Error('must not call'));
        const corrected = { ...legacy(), _incomeMetricsVersion: 1 };
        assert.equal((await exit.respond({ fundamentals: corrected }, 'TEST')).fundamentals, corrected);
        assert.equal((await exit.respond({ fundamentals: null }, 'TEST')).fundamentals, null); assert.equal(exit.calls(), 0);
    });
    await test('P1 correction preserves fields and nested breakdown metadata through repeated exits', async () => {
        const previous = legacy();
        (previous.breakdown.rev as any).custom = { keep: true };
        (previous.breakdown as any).custom = { value: 'retained', score: 1, label: 'Fixture' };
        const original = JSON.parse(JSON.stringify(previous));
        const exit = unifiedExit(await fundamentals());
        const first = await exit.respond({ ticker: 'TEST', fundamentals: previous });
        const second = await exit.respond(first);
        assertMetadata(second.fundamentals);
        assert.deepEqual(second.fundamentals.breakdown.rev.custom, { keep: true });
        assert.deepEqual(second.fundamentals.breakdown.custom, original.breakdown.custom);
        assert.deepEqual(previous, original); assert.equal(exit.calls(), 1);
    });
    // ══ 4차 관문(10190212) — 비교 기간 결측이 «행 사라짐»이 되면 안 된다 ══
    await test('G4 GDP April missing keeps the GDP row with null value and change (gate reproduction)', async () => {
        for (const variant of ['absent', 'null', 'blank'] as const) {
            const rows: any = gdpAprilMissing();
            if (variant !== 'absent') rows.$GDP = [rows.$GDP[0], { date: '2026-04-01', value: variant === 'null' ? null : '' }, rows.$GDP[1]];
            const d = await economy(rows);
            assert.deepEqual(d.metrics.map((m: any) => m.key), MACRO_KEYS, variant);
            const gdp = d.metrics.find((m: any) => m.key === 'gdpQoQ');
            assert.deepEqual(gdp.label, { en: 'GDP (QoQ)', ko: 'GDP 전분기비', ja: 'GDP(前期比)' });
            assert.equal(gdp.value, null); assert.equal(gdp.change, null); assert.equal(gdp.watch, null);
            assert.equal(gdp.trend, 'FLAT'); assert.equal(gdp.asOf, '2026-07-01'); assert.equal(gdp.unit, 'percent');
            assert.notEqual(gdp.value, 0, 'missing comparison must not become a measured 0');
            assert.equal(d.missing, 1);
        }
    });
    await test('G4 GDP row renders label and dash in the existing strip cell, other rows unchanged', async () => {
        const d = await economy(gdpAprilMissing());
        for (const locale of ['ko', 'en', 'ja'] as const) {
            const { rows } = renderStrip(d.metrics, locale);
            assert.deepEqual(rows.map(r => r.m.key).sort(), [...MACRO_KEYS].sort(), 'every row is rendered');
            const gdp = rows.find(r => r.m.key === 'gdpQoQ')!;
            const label = { ko: 'GDP 전분기비', en: 'GDP (QoQ)', ja: 'GDP(前期比)' }[locale];
            assert.ok(textOf(gdp.node).includes(label), `GDP label in ${locale}`);
            assert.deepEqual(cells(gdp.node), ['—', '', '07-01']);
            const cpi = rows.find(r => r.m.key === 'cpiYoY')!;
            assert.equal(cells(cpi.node)[0], '20.0%');
            const pay = rows.find(r => r.m.key === 'payrolls')!;
            assert.equal(cells(pay.node)[0], '+10K');
        }
    });
    await test('G4 CPI year-ago and payroll prior month missing keep their rows (same exclusion path)', async () => {
        const cpi: any[] = monthlyRows(); cpi.splice(12, 1);
        const pay = [{ date: '2026-10-01', value: 120 }, { date: '2026-08-01', value: 100 }];
        const d = await economy({ ...gdpAprilMissing(), '$CPIAUCSL': cpi, '$PAYEMS': pay });
        assert.deepEqual(d.metrics.map((m: any) => m.key), MACRO_KEYS);
        for (const [key, asOf] of [['cpiYoY', '2026-10-01'], ['payrolls', '2026-10-01'], ['gdpQoQ', '2026-07-01']]) {
            const m = d.metrics.find((x: any) => x.key === key);
            assert.equal(m.value, null, key); assert.equal(m.change, null, key); assert.equal(m.watch, null, key); assert.equal(m.asOf, asOf, key);
        }
        assert.equal(d.missing, 3);
        const { rows } = renderStrip(d.metrics);
        for (const key of ['cpiYoY', 'payrolls', 'gdpQoQ']) assert.equal(cells(rows.find(r => r.m.key === key)!.node)[0], '—', key);
    });
    await test('G4 a series with no observation at all still keeps its row; empty block keeps the route failure contract', async () => {
        const rows: any = gdpAprilMissing(); rows.$GDP = [];
        const d = await economy(rows);
        assert.deepEqual(d.metrics.map((m: any) => m.key), MACRO_KEYS);
        const gdp = d.metrics.find((m: any) => m.key === 'gdpQoQ');
        assert.equal(gdp.value, null); assert.equal(gdp.asOf, null);
        assert.deepEqual(cells(renderStrip(d.metrics).rows.find(r => r.m.key === 'gdpQoQ')!.node), ['—', '', '']);
        assert.equal(d.newestAsOf, '2026-10-16');
        const empty = await economy([]);
        assert.deepEqual(empty.metrics, []); assert.equal(empty.missing, 7); assert.equal(empty.newestAsOf, null);
    });
    await test('G4 single daily observation keeps fed funds and curve rows with null change', async () => {
        const d = await economy({ ...gdpAprilMissing(), '$DFF': [{ date: '2026-10-16', value: 4.2 }], '$T10Y2Y': [{ date: '2026-10-16', value: -0.1 }] });
        const fed = d.metrics.find((m: any) => m.key === 'fedFunds');
        const curve = d.metrics.find((m: any) => m.key === 'curve10y2y');
        assert.equal(fed.value, 4.2); assert.equal(fed.change, null);
        assert.equal(curve.value, -0.1); assert.equal(curve.change, null); assert.equal(curve.watch?.on, true);
    });
    await test('G4 /api/market/economy returns all 7 rows with a dash value instead of dropping GDP', async () => {
        const res = await economyRoute(gdpAprilMissing());
        assert.equal(res.status, 200);
        assert.deepEqual(res.data.metrics.map((m: any) => m.key), MACRO_KEYS);
        assert.equal(res.data.metrics.find((m: any) => m.key === 'gdpQoQ').value, null);
    });
    await test('G4 complete data is unchanged and measured zero renders as zero, not a dash', async () => {
        const full: any = { ...gdpAprilMissing(), '$GDP': [{ date: '2026-07-01', value: 120 }, { date: '2026-04-01', value: 100 }] };
        const d = await economy(full);
        assert.equal(d.missing, 0);
        assert.deepEqual(d.metrics.map((m: any) => [m.key, m.value, m.change]), [
            ['fedFunds', 4.2, 0.1], ['unemployment', 120, 10], ['cpiYoY', 20, -17.5],
            ['payrolls', 10, 10], ['consumerSentiment', 120, 10], ['gdpQoQ', 20, null], ['curve10y2y', 0.3, 0.1],
        ]);
        const zero = await economy({ ...full, '$DFF': [{ date: '2026-10-16', value: 0 }, { date: '2026-10-15', value: 0 }] });
        assert.equal(cells(renderStrip(zero.metrics).rows.find(r => r.m.key === 'fedFunds')!.node)[0], '0.00%');
    });
    await test('G4 earlier gates stay fixed: period regression, REAL dash, fundamentals field retention', async () => {
        const rows: any[] = monthlyRows(); rows[5].value = null;
        assert.equal((await economic(rows).getInflationIntrinio()).cpiYoY, 20);
        assert.equal(realGauge(await realYield([{ date: '2026-10-16', value: null }])).subLabel, '—');
        assert.equal(await realYield([{ date: '2026-10-16', value: null }]), null);
        const d = await unifiedExit(await fundamentals()).respond({ fundamentals: legacy() }, 'TEST');
        assertMetadata(d.fundamentals);
    });
    console.log(`RESULT ${passed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
})();
