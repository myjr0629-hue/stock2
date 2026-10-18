/** Gate regressions: real adapter -> FED -> macro, and fundamentals API -> unified exit. Offline only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(__dirname, '..');
const quiet = { log() {}, warn() {}, error() {} };
const json = { json: (data: any) => ({ json: async () => data }) };
const forbidden = () => { throw new Error('Live I/O forbidden'); };
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
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
function economic(rows: any[]) {
    return functions('src/services/intrinioClient.ts', [
        'getEconomicSeries', 'getInflationExpectationsIntrinio', 'getInflationIntrinio', 'getTreasuryYieldsFred',
    ], {
        callIntrinio: async () => ({ historical_data: rows }),
        TREASURY_SERIES: [['$DGS10', 'yield_10_year'], ['$DGS2', 'yield_2_year']],
    });
}
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
let passed = 0, failed = 0;
async function test(name: string, fn: () => any) {
    try { await fn(); passed++; console.log(`PASS ${name}`); }
    catch (e: any) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
}
(async () => {
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
            './intrinioClient': economic([{ date: '2026-10-16', value: null }, { date: '2026-10-15', value: '' }]),
        });
        const d = await economy.getMacroEconomy();
        assert.equal(d.missing, 7); assert.deepEqual(d.metrics, []); assert.equal(d.newestAsOf, null);
    });
    await test('shared macro economy caller preserves measured zero and valid series', async () => {
        const rows = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2026, 9-i, 1)).toISOString().slice(0, 10), value: 100-i }));
        const economy = load('src/services/macroEconomy.ts', { './intrinioClient': {
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
    console.log(`RESULT ${passed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
})();
