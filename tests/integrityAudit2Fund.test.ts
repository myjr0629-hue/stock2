/** Offline regressions for integrity audit 2, IDs 10–15. No environment files or live I/O. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(__dirname, '..');
const quiet = { log() {}, warn() {}, error() {} };
const json = { json: (data: any) => ({ json: async () => data }) };
function load(rel: string, mocks: Record<string, any>, extra = ''): any {
    const source = fs.readFileSync(path.join(root, rel), 'utf8') + extra;
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', 'console', 'fetch', js)((id: string) => {
        if (id in mocks) return mocks[id];
        throw new Error(`Unmocked import: ${id}`);
    }, mod, mod.exports, quiet, () => { throw new Error('Network forbidden'); });
    return mod.exports;
}
let failed = 0, passed = 0;
async function test(name: string, fn: () => any) {
    try { await fn(); passed++; console.log(`PASS ${name}`); }
    catch (e: any) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
}
const quarter = (year: number, q: number, revenue: any, income: any = 10) => ({ fiscal_year: year, fiscal_period: `Q${q}`, period_end: `${year}-${String(q * 3).padStart(2, '0')}-28`, revenue, consolidated_net_income_loss: income });
async function fundamentals(rows: any[], unified: any = null) {
    const route = load('src/app/api/live/fundamentals/route.ts', {
        'next/server': { NextResponse: json },
        '@/lib/incomeMetrics': require('../src/lib/incomeMetrics'),
        '@/lib/cache/redisSWR': { swrFetch: async (_key: string, fn: any) => ({ data: await fn(), _cache: 'miss' }) },
        '@/lib/aws/unifiedCacheProvider': { getUnifiedCache: async () => unified },
        '@/services/massiveClient': { fetchMassive: async (url: string) => ({ results: url.includes('income-statements') ? rows : [] }) },
    });
    return (await route.GET({ nextUrl: new URL('https://offline.invalid/?t=TEST') })).json();
}
function technical(rows: any[], field = 'adx') {
    const mod = load('src/services/advancedTechnicals.ts', { '@/services/intrinioClient': {
        getTechnicalIndicator: async (kind: string) => ({ _rows: kind === field ? rows : [] }), getCloseHistory: async () => null,
    } });
    return mod.getAdvancedTechnicals('TEST', null, null);
}
function macro(inflation: any) {
    return load('src/services/macroHubProvider.ts', {
        './massiveClient': {}, '@/services/intrinioClient': { getEconomicSeries: async () => [] }, './marketStatusProvider': {}, './eventHubProvider': {},
        './fedApiClient': { getInflationData: async () => { if (inflation instanceof Error) throw inflation; return inflation; } },
        './yahooFinanceHub': {}, './redisClient': {}, '@/lib/yieldChange': {},
        './marketIndexBasis': { loadMarketIndexBasis: () => { throw new Error('Index cache I/O forbidden in REAL unit test'); } },
        '@/lib/macroSnapshotCarry': require('../src/lib/macroSnapshotCarry'),
        '@/lib/macroFredFallback': { fredCreditSpread: async () => null, fredRealPair: async () => null },
    }, '\nexport { fetchRealYieldData };');
}
const engine = load('src/lib/rankings/engine.ts', { '@/lib/marketCalendar': load('src/lib/marketCalendar.ts', {}) });
const snapshots = (today: any) => [90,95,100,105,110,95,100,105,today].map((v, i) => {
    const d = ['01','02','05','06','07','08','09','12','13'][i];
    return { timestamp: Date.parse(`2026-10-${d}T21:00:00Z`), _oi: 1000, _d: `2026-10-${d}`,
        chainDate: `2026-10-${d}`, optionBasis: 'eod', premiumBasis: 'volume-close', totalPremium: v };
});
const enhanced = load('src/app/api/flow/enhanced-metrics/route.ts', {
    'next/server': {}, '@/services/redisClient': {}, '@/lib/aws/dynamoDataProvider': {}, '@/lib/aws/dynamoClient': {},
}, '\nexport { computeUoaZScore };');
const oiRows = (values: any[]) => values.map((v, i) => ({ timestamp: Date.UTC(2026, 9, 16-i, 20), totalCallOI: v, totalPutOI: 0 }));
(async () => {
    await test('10 null ADX stays missing', async () => { const d = await technical([{ adx: null, di_pos: null, di_neg: null }]); assert.equal(d.adx, null); assert.ok(d._partial.includes('adx')); });
    await test('10 ADX uses one complete observation', async () => {
        const d = await technical([{ adx: 30, di_pos: '', di_neg: 10 }, { adx: 12, di_pos: 0, di_neg: 5 }]);
        assert.equal(d.adx.value, 12); assert.equal(d.adx.diPos, 0);
    });
    await test('10 real zero ADX survives', async () => assert.equal((await technical([{ adx: 0, di_pos: 0, di_neg: 0 }])).adx.value, 0));
    await test('10 ATR and BB null never become observations', async () => {
        assert.equal((await technical([{ atr: null }], 'atr')).atr, null);
        assert.equal((await technical([{ upper_band: null, middle_band: 100, lower_band: null }], 'bb')).bb, null);
    });
    await test('11 missing income cannot create margin points', async () => { const d = await fundamentals([quarter(2026, 2, 100, null)]); assert.equal(d.netMargin, null); assert.equal(d.breakdown.margin.score, 0); });
    await test('11 zero income is measured zero margin', async () => { const d = await fundamentals([quarter(2026, 2, 100, 0)]); assert.equal(d.netMargin, 0); assert.equal(d.breakdown.margin.score, 4); });
    await test('12 two quarters cannot become YoY growth', async () => assert.equal((await fundamentals([quarter(2026, 2, 120), quarter(2026, 1, 100)])).revenueGrowth, null));
    await test('12 fiscal same quarter fixes YoY despite order/gaps', async () => {
        const d = await fundamentals([quarter(2026, 2, 120), quarter(2025, 2, 80), quarter(2026, 1, 100)]);
        assert.equal(d.revenueGrowth, 50);
    });
    await test('12 measured zero revenue is -100%, not missing', async () => assert.equal((await fundamentals([quarter(2026, 2, 0), quarter(2025, 2, 80)])).revenueGrowth, -100));
    await test('13 no inflation source cannot create real yield', async () => assert.equal(await macro(new Error('offline')).fetchRealYieldData(4.2, '2026-10-16', 'YAHOO'), null));
    await test('13 missing nominal cannot create real yield', async () => assert.equal(await macro({ expectations: 2.3, expectationsDate: '2026-10-16', source: 'INTRINIO' }).fetchRealYieldData(null, '2026-10-16', 'YAHOO'), null));
    await test('13 mismatched or absent observation date is missing', async () => {
        for (const expectationsDate of [undefined, '2026-10-15']) assert.equal(await macro({ expectations: 2.3, expectationsDate, source: 'INTRINIO' }).fetchRealYieldData(4.2, '2026-10-16', 'YAHOO'), null);
    });
    await test('13 valid matching observations preserve real zero', async () => {
        const d = await macro({ expectations: 4.2, expectationsDate: '2026-10-16', source: 'INTRINIO' }).fetchRealYieldData(4.2, '2026-10-16', 'YAHOO'); assert.equal(d.realYield, 0); assert.equal(d.stance, 'NEUTRAL');
    });
    await test('14 missing latest metric never ranks or reuses yesterday', () => {
        for (const v of [null, undefined, '', ' ', false, Infinity]) assert.equal(engine.deviationOf(snapshots(v), 'totalPremium').ok, null);
    });
    await test('14 actual zero keeps finite ranking distance', () => { const d = engine.deviationOf(snapshots(0), 'totalPremium').ok; assert.ok(d); assert.equal(d.today, 0); assert.ok(Number.isFinite(engine.ratioDistance(d.ratio))); });
    await test('14 ratio distances preserve reciprocal symmetry', () => { assert.equal(engine.ratioDistance(2), engine.ratioDistance(.5)); assert.equal(engine.ratioDistance(1), 0); });
    await test('15 zero variance with changed OI is uncomputable', () => { const d = enhanced.computeUoaZScore(oiRows([200,100,100,100])); assert.equal(d.zScore, null); assert.equal(d.isUnusual, null); assert.equal(d.currentOI, 200); });
    await test('15 unchanged baseline is distinguishable from changed baseline', () => assert.equal(enhanced.computeUoaZScore(oiRows([100,100,100,100])).zScore, 0));
    await test('15 missing OI side cannot become measured zero', () => assert.equal(enhanced.computeUoaZScore(oiRows([null,100,90,110])), null));
    // 10/19 운영 세션: scripts/lambda-harvest·deploy-lambda-v7 은 운영 signum-harvest(harvest_lambda/ 계보)가 아닌 옛 계보라 되돌림 — 이 단언 제외(2026-10-19/lambda-diff/patch/README.txt)
    // await test('11/12 Lambda producer paths match null and fiscal-quarter rules', () => {
    //         const helper = fs.readFileSync(path.join(root, 'src/lib/incomeMetrics.js'), 'utf8').replace(/^module.exports.*$/m, '');
    //         for (const rel of ['scripts/lambda-harvest/index.js', 'scripts/deploy-lambda-v7.js']) {
    //             const source = fs.readFileSync(path.join(root, rel), 'utf8');
    //             const blocks = [...source.matchAll(/const vxResults = vxData\?\.results \|\| \[\];([\s\S]*?)let score = 0;/g)];
    //             assert.equal(blocks.length, 2, rel);
    //             for (const block of blocks) {
    //                 const calculate = new Function('vxData', helper + block[0].replace(/let score = 0;$/, '') + '; return {revenueGrowth, netMargin};');
    //                 const missing = calculate({ results: [quarter(2026, 2, 120, null), quarter(2026, 1, 100)] });
    //                 assert.deepEqual(missing, { revenueGrowth: null, netMargin: null }, rel);
    //                 const yoy = calculate({ results: [quarter(2026, 2, 120, 0), quarter(2025, 2, 80)] });
    //                 assert.deepEqual(yoy, { revenueGrowth: 50, netMargin: 0 }, rel);
    //             }
    //         }
    //     });
    await test('11 upstream adapter preserves null, blank and measured zero', async () => {
        const rel = 'src/services/intrinioClient.ts';
        const source = fs.readFileSync(path.join(root, rel), 'utf8');
        const ast = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
        const node = ast.statements.find((n: any) => n.name?.text === 'getIncomeStatementsIntrinio')!;
        const fn = node.getText(ast).replace(/^export /, '');
        for (const value of [null, '', ' ', false, 0, '0']) {
            const js = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
            const callIntrinio = async (url: string) => url.includes('standardized_financials')
                ? { standardized_financials: [{ data_tag: { tag: 'totalrevenue' }, value: 100 }, { data_tag: { tag: 'netincome' }, value }] }
                : { fundamentals: [{ id: 'fixture', fiscal_year: 2026, fiscal_period: 'Q2', end_date: '2026-06-28' }] };
            const get = new Function('callIntrinio', js + '; return getIncomeStatementsIntrinio;')(callIntrinio);
            const result = await get('TEST');
            assert.equal(result.results[0].consolidated_net_income_loss, value === 0 || value === '0' ? 0 : null);
        }
    });
    await test('11/12 outdated unified calculations fall through; corrected version remains AWS-first', async () => {
        const old = { fundamentals: { score: 4, grade: 'F', netMargin: 0 } };
        const corrected = { fundamentals: { score: 0, grade: 'F', netMargin: 0, _incomeMetricsVersion: 1 } };
        assert.equal((await fundamentals([quarter(2026, 2, 100, null)], old)).netMargin, null);
        const d = await fundamentals([], corrected);
        assert.equal(d._source, 'dynamodb'); assert.equal(d.score, 0); assert.equal(d.netMargin, 0);
    });
    await test('12 absent fiscal identity or missing exact prior quarter stays missing', async () => {
        assert.equal((await fundamentals([{ revenue: 120 }, { revenue: 80 }])).revenueGrowth, null);
        const d = await fundamentals([quarter(2026, 2, 120), quarter(2026, 1, 100), quarter(2025, 4, 90), quarter(2025, 3, 85), quarter(2025, 1, 80)]);
        assert.equal(d.revenueGrowth, null);
    });
    await test('13 expectation date comes from expectations feed, not CPI date or fetch time', async () => {
        const fed = load('src/services/fedApiClient.ts', { './redisClient': {}, '@/services/intrinioClient': {}, './massiveClient': {
            fetchMassive: async (url: string) => url.includes('inflation-expectations') ? { expected: 2.3, date: '2026-10-16' } : { cpi: 100, date: '2026-09-01' },
        } });
        const d = await fed.getInflationData(); assert.equal(d.date, '2026-09-01'); assert.equal(d.expectationsDate, '2026-10-16');
    });
    await test('14 distances are finite, reciprocal and monotonic including zero', () => {
        assert.equal(engine.ratioDistance(0), 1);
        for (const r of [-1, NaN, Infinity]) assert.equal(engine.ratioDistance(r), null);
        const ds = [1, 2, 4, 10, 100].map(engine.ratioDistance);
        assert.deepEqual(ds, [...ds].sort((a,b) => a-b));
    });
    await test('15 observed nonconstant OI uses finite z-score', () => {
        const d = enhanced.computeUoaZScore(oiRows([200,90,100,110])); assert.equal(d.zScore, 12.2); assert.equal(d.isUnusual, true);
    });
    // 10/19 운영 세션: scripts/lambda-harvest·deploy-lambda-v7 은 운영 signum-harvest(harvest_lambda/ 계보)가 아닌 옛 계보라 되돌림 — 이 단언 제외(2026-10-19/lambda-diff/patch/README.txt)
    // await test('11/12 embedded Lambda function equals canonical source; template injects it', () => {
    //         const canonical = fs.readFileSync(path.join(root, 'src/lib/incomeMetrics.js'), 'utf8').replace(/^module.exports.*$/m, '').trim();
    //         const lambda = fs.readFileSync(path.join(root, 'scripts/lambda-harvest/index.js'), 'utf8');
    //         assert.ok(lambda.startsWith(canonical));
    //         const deploy = fs.readFileSync(path.join(root, 'scripts/deploy-lambda-v7.js'), 'utf8');
    //         assert.ok(deploy.includes("../src/lib/incomeMetrics.js")); assert.ok(deploy.includes('${incomeMetricsSource}'));
    //     });
    await test('11/12 unified response cannot bypass corrected fundamentals via old cache', async () => {
        const rel = 'src/app/api/command/unified/route.ts';
        const source = fs.readFileSync(path.join(root, rel), 'utf8');
        const ast = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
        const functions = ast.statements.filter((n: any) => ['jsonResponse', 'overlayFundamentals'].includes(n.name?.text)).map(n => n.getText(ast)).join('\n');
        const js = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
        let calls = 0;
        const respond = new Function('isMarketHoursNow', 'overlayEarningsDate', 'overlayStructureLevels', 'normalizeShape', 'stripStaleInstitutional', 'NextResponse', 'callInternalGet', 'getFundamentals', js + ';return jsonResponse;')(
            () => false, async (d: any) => d, async (d: any) => d, (d: any) => d, (d: any) => d, json,
            async () => { calls++; return { score: null, grade: 'NO_DATA', netMargin: null, revenueGrowth: null, _incomeMetricsVersion: 1 }; }, () => {},
        );
        const old = { fundamentals: { score: 4, netMargin: 0, revenueGrowth: 20 } };
        const d = await (await respond(old, 200, 'TEST')).json();
        assert.equal(d.fundamentals.netMargin, null); assert.equal(d.fundamentals.revenueGrowth, null); assert.equal(calls, 1);
        await respond({ fundamentals: { score: 0, netMargin: 0, _incomeMetricsVersion: 1 } }, 200, 'TEST');
        assert.equal(calls, 1);
    });
    await test('14 API selection rejects all nonfinite scores before visible list and pool', () => {
        const source = fs.readFileSync(path.join(root, 'src/app/api/ranking/route.ts'), 'utf8');
        const start = source.indexOf('        const finiteRows =');
        const end = source.indexOf('        results[spec.id] =', start);
        const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
        const select = new Function('rows', 'spec', 'top', 'STRUCT_LIVE_RULES', 'LIVE_POOL_SIZE', js + ';return {picked,pool};');
        const rows = [Infinity, NaN, null, .5, .8].map((rank, i) => ({ ticker: `T${i}`, rank }));
        const result = select(rows, { id: 'gamma-flip' }, 5, { 'gamma-flip': {} }, 15);
        assert.deepEqual(result.picked.map((r: any) => r.rank), [.8, .5]); assert.deepEqual(result.pool, result.picked);
    });
    await test('15 existing FlowRadar fallback replaces uncomputable z-score without new copy', () => {
        const source = fs.readFileSync(path.join(root, 'src/components/FlowRadar.tsx'), 'utf8');
        const start = source.indexOf('    const uoa = useMemo(');
        const end = source.indexOf('    // [NEW] P/C Ratio', start);
        const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
        const calculate = new Function('useMemo', 'filteredChain', 'enhancedData', 'fm', js + ';return uoa;');
        const chain = [{ day: { volume: 100 }, open_interest: 100 }];
        const changed = enhanced.computeUoaZScore(oiRows([200,100,100,100]));
        const result = calculate((fn: any) => fn(), chain, { uoa: changed }, (key: string) => key);
        assert.equal(result.source, 'intraday'); assert.equal(result.score, 10); assert.equal(result.label, 'uoaExtreme');
        const unchanged = enhanced.computeUoaZScore(oiRows([100,100,100,100]));
        assert.equal(calculate((fn: any) => fn(), chain, { uoa: unchanged }, (key: string) => key).source, 'dynamodb');
    });
    console.log(`${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
})();
