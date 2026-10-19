/** Gate 4: real calculation + read route, synthetic inputs, no sockets or production writes. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { NextRequest } from 'next/server';
import { Company, FIELDS, LENS_IDS, LensId } from '../src/lib/guruLens/types';
import { evaluateLenses } from '../src/lib/guruLens/rules';
import { HEAD_KEY, lensKey, makeSnapshot, metaKey, selectSnapshot } from '../src/lib/guruLens/pipeline';

function company(ticker: string, pe = 10): Company {
    const r = {
        ticker, name: 'Fixture', sector: 'Industrials', cik: 1, reportedCik: 1,
        year: 2025, priceDate: '2026-10-16', price: pe * 3, currency: 'USD',
        shares: 1e8, sharesDate: '2026-06-30', splitMultiplier: 1, splits: [],
        offHigh: -0.4, ret12m: 0.5, mom12_1: 0.3, beta: 0.8, issues: [],
    } as unknown as Company;
    FIELDS.forEach((f) => (r[f] = {}));
    for (let y = 2014; y <= 2025; y++) {
        const values = {
            ni: 3e8, eq: 1e9, rev: 3e9 * 1.15 ** (y - 2025), eps: 3,
            ocf: 4e8, capex: 1e8, divpaid: 1e7, dps: 0.1, oi: 1e9, gp: 1.6e9,
            da: 1e8, wsh: 1e8, assets: 4e9, liab: 2e9, ca: 2e9, cl: 5e8,
            ltd: 1e8, cash: 2e8, ppe: 5e8,
        };
        FIELDS.forEach((f) => (r[f][y] = values[f]));
    }
    return r;
}

const pes = [16, 20, 30, 40, 50, 60];
const tickers = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL'];
const companies = pes.map((pe, i) => company(tickers[i], pe));
const result = evaluateLenses(companies).max_pessimism;
assert.equal(result.passCount, 0);
assert.deepEqual(
    result.rows.slice(0, 5).map((r) => r.checks.find((c) => c.id === '5년 평균 PER')!.value),
    [16, 20, 30, 40, 50],
    'PER <=15: the closest five must include 16 and exclude 60',
);
assert.ok(result.rows.every((r) => !r.passed && r.reason.includes('미달: 5년 평균 PER')));

// Every lens declares the actual failed-row metric and its favorable direction.
const directions: Record<LensId, 'asc' | 'desc'> = {
    moat_compounder: 'desc', wonderful_fair: 'desc', defensive_value: 'desc', garp: 'desc',
    quality_growth: 'desc', max_pessimism: 'asc', roc_ey: 'desc',
    financial_strength: 'desc', low_psr_momentum: 'desc', quality_multifactor: 'desc',
};
for (const id of LENS_IDS) {
    const worse = company('AAA'), better = company('ZZZ');
    // Both fail the same data gate, so pass status cannot mask a reversed comparator.
    worse.issues = better.issues = ['fixture_rejected'];
    if (id === 'moat_compounder')
        for (const y of [2023, 2024, 2025]) better.ocf[y] = 8e8;
    if (id === 'wonderful_fair')
        for (const y of [2022, 2023, 2024, 2025]) better.oi[y] = 2e9;
    if (['defensive_value', 'garp', 'max_pessimism', 'financial_strength'].includes(id))
        better.price /= 2;
    if (['quality_growth', 'roc_ey'].includes(id)) better.oi[2025] = 2e9;
    if (id === 'low_psr_momentum') better.ret12m = 0.8;
    if (id === 'quality_multifactor') {
        better.gp[2025] = 2e9;
        better.ni[2025] = 6e8;
        better.ocf[2025] = 16e8;
    }
    const ranked = evaluateLenses([worse, better])[id];
    assert.equal(ranked.passCount, 0, id);
    assert.equal(ranked.rows[0].ticker, 'ZZZ', `${id}: favorable metric first`);
    assert.equal(ranked.definition.closestSort.direction, directions[id], id);
    assert.ok(ranked.definition.closestSort.metric.length > 0, id);
}

// Missing metrics always go last, even for ascending PER. Equal metrics use ticker order.
const missing = company('AAA');
missing.ni[2025] = null;
const tied = evaluateLenses([missing, company('ZZZ', 16), company('BBB', 16)]).max_pessimism;
assert.deepEqual(tied.rows.map((r) => r.ticker), ['BBB', 'ZZZ', 'AAA']);
assert.equal(tied.rows[2].score, null);
const noCashflow = company('AAA');
noCashflow.ocf[2025] = null;
const withCashflow = company('ZZZ');
withCashflow.issues = ['fixture_rejected'];
assert.deepEqual(evaluateLenses([noCashflow, withCashflow]).moat_compounder.rows.map((r) => r.ticker),
    ['ZZZ', 'AAA']);

// Passed percentile scores retain their existing descending order and precedence.
const mixed = evaluateLenses([company('CHEAP', 5), company('DEAR', 10), ...companies]).max_pessimism;
assert.equal(mixed.passCount, 2);
assert.deepEqual(mixed.rows.slice(0, 3).map((r) => r.ticker), ['CHEAP', 'DEAR', 'AAPL']);

const snapshot = makeSnapshot(companies, { sec: 0, prices: 0, paid: 0 }, new Date('2026-10-19T12:00:00Z'));
assert.deepEqual(selectSnapshot(snapshot, 'max_pessimism', 'AAPL').passedLenses, []);
const { lenses: _, ...meta } = snapshot;
const store = new Map<string, unknown>([
    [HEAD_KEY, { current: snapshot.date, previous: null, asOf: snapshot.asOf }],
    [metaKey(snapshot.date), meta],
]);
LENS_IDS.forEach((id) => store.set(lensKey(id, snapshot.date), {
    date: snapshot.date, result: snapshot.lenses[id],
}));
const load = (Module as any)._load;
(Module as any)._load = function (name: string, parent: any, main: any) {
    if (name === '@/lib/guruLens/service') return {
        readonlyCache: { read: async (key: string) => store.get(key) ?? null },
        currentBadges: async () => ({}),
    };
    return load.call(this, name, parent, main);
};
async function main() {
    try {
        const { GET } = require('../src/app/api/guru-lens/route');
        for (const query of ['lens=max_pessimism', 'lens=max_pessimism&limit=1', '']) {
            const response = await GET(new NextRequest(`http://localhost/api/guru-lens?${query}`));
            assert.equal(response.status, 200);
            const body = await response.json();
            const lens = body.lenses.find((l: any) => l.definition.id === 'max_pessimism');
            assert.equal(lens.mode, 'closest');
            assert.equal(lens.passCount, 0);
            assert.equal(lens.evaluatedCount, 6);
            assert.deepEqual(lens.rows.map((r: any) => r.ticker), tickers.slice(0, 5));
            assert.ok(lens.rows.every((r: any) => r.passed === false));
        }
        for (const ticker of ['AAPL', 'GOOGL']) {
            const response = await GET(new NextRequest(
                `http://localhost/api/guru-lens?lens=max_pessimism&ticker=${ticker}`,
            ));
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.deepEqual(body.passedLenses, []);
            assert.equal(body.lenses[0].rows.length, 1);
            assert.equal(body.lenses[0].rows[0].ticker, ticker);
            assert.equal(body.lenses[0].rows[0].passed, false);
        }
        console.log('guruLens gate4: PER closest five, all 10 metric directions, missing/ties, passed order, reverse lookup and GET closest passed; production writes 0');
    } finally {
        (Module as any)._load = load;
    }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
