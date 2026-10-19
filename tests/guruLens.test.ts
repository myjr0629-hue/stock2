/** Synthetic fixtures only. No network, credentials, production Redis, or paid API calls. */
import assert from 'node:assert/strict';
import { Company, FIELDS, LENS_IDS, LensId, Snapshot } from '../src/lib/guruLens/types';
import { evaluateLenses } from '../src/lib/guruLens/rules';
import { GURU_UNIVERSE, parseChart, splitAdjustedShares, alignedBeta } from '../src/lib/guruLens/sources';
import { publicationHolds } from '../src/lib/guruLens/guards';
import {
    makeSnapshot,
    publishSnapshot,
    readSnapshot,
    selectSnapshot,
    HEAD_KEY,
    lensKey,
    Head,
} from '../src/lib/guruLens/pipeline';
import { holdingBadge, moneyBadge, insiderNet, readBadges } from '../src/lib/guruLens/badges';

const now = new Date('2026-10-19T12:00:00Z');
function fixture(ticker = 'AAA'): Company {
    const r = {
        ticker,
        name: 'Fixture',
        sector: 'Industrials',
        cik: 1,
        reportedCik: 1,
        year: 2025,
        priceDate: '2026-10-16',
        price: 20,
        currency: 'USD',
        shares: 1e8,
        sharesDate: '2026-06-30',
        splitMultiplier: 1,
        splits: [],
        offHigh: -0.4,
        ret12m: 0.5,
        mom12_1: 0.3,
        beta: 0.8,
        issues: [],
    } as unknown as Company;
    FIELDS.forEach((f) => (r[f] = {}));
    for (let y = 2014; y <= 2025; y++) {
        const growth = 1.15 ** (y - 2025);
        Object.assign(r.ni, { [y]: 3e8 * growth });
        Object.assign(r.eq, { [y]: 1e9 * growth });
        Object.assign(r.rev, { [y]: 3e9 * growth });
        Object.assign(r.eps, { [y]: 3 * growth });
        Object.assign(r.ocf, { [y]: 4e8 * growth });
        Object.assign(r.capex, { [y]: 1e8 * growth });
        Object.assign(r.divpaid, { [y]: 1e7 });
        Object.assign(r.dps, { [y]: 0.1 });
        Object.assign(r.oi, { [y]: 1e9 * growth });
        Object.assign(r.gp, { [y]: 1.6e9 * growth });
        Object.assign(r.da, { [y]: 1e8 });
        Object.assign(r.wsh, { [y]: 1e8 });
        Object.assign(r.assets, { [y]: 4e9 * growth });
        Object.assign(r.liab, { [y]: 2e9 * growth });
        Object.assign(r.ca, { [y]: 2e9 * growth });
        Object.assign(r.cl, { [y]: 5e8 * growth });
        Object.assign(r.ltd, { [y]: 1e8 * growth });
        Object.assign(r.cash, { [y]: 2e8 * growth });
        Object.assign(r.ppe, { [y]: 5e8 * growth });
    }
    // F-Score improving liquidity, margins, turnover, leverage and no issuance.
    r.assets[2023] = 2.9e9;
    r.assets[2024] = 3.2e9;
    r.assets[2025] = 4e9;
    r.ca[2024] = 1e9;
    r.gp[2024] = 1e9;
    r.ltd[2024] = 2e8;
    return r;
}
function forLens(id: LensId): Company[] {
    const r = fixture();
    if (id === 'quality_growth') r.oi[2022] = r.rev[2022]! * 0.2;
    if (id === 'defensive_value') r.eq[2025] = 2e9;
    if (id === 'financial_strength') r.price = 5;
    if (id === 'quality_multifactor') {
        const worse = fixture('BBB');
        worse.gp[2025] = 1e8;
        worse.ni[2025] = 1e7;
        worse.ocf[2025] = 1e7;
        worse.liab[2025] = 3e9;
        r.liab[2024] = 2e9;
        r.liab[2025] = 1.8e9;
        return [r, worse];
    }
    return [r];
}
let assertions = 0;
for (const id of LENS_IDS) {
    const companies = forLens(id),
        result = evaluateLenses(companies)[id].rows.find((r) => r.ticker === 'AAA')!;
    assert.equal(result.passed, true, `${id}: ${result.reason}`);
    assert.ok(
        result.reason.includes('충족:') &&
            !result.reason.includes('NaN') &&
            !result.reason.includes('Infinity'),
    );
    for (const c of result.checks) assert.ok(result.reason.includes(c.reason));
    const bad = structuredClone(companies);
    bad[0].shares = null;
    const rejected = evaluateLenses(bad)[id].rows.find((r) => r.ticker === 'AAA')!;
    assert.equal(rejected.passed, false, id);
    assert.match(rejected.reason, /시총 USD 자료 없음/);
    const specific = structuredClone(companies);
    const target = specific[0];
    const mutations: Record<LensId, () => void> = {
        moat_compounder: () => {
            target.ni[2016] = -1;
        },
        wonderful_fair: () => {
            target.price = 1e5;
        },
        defensive_value: () => {
            target.divpaid = {};
            target.dps = {};
        },
        garp: () => {
            target.ltd[2025] = 2e9;
        },
        quality_growth: () => {
            target.oi[2025] = 1e8;
        },
        max_pessimism: () => {
            target.offHigh = -0.1;
        },
        roc_ey: () => {
            target.sector = 'Financials';
        },
        financial_strength: () => {
            target.ocf[2025] = -1e8;
        },
        low_psr_momentum: () => {
            target.eps[2025] = 1;
        },
        quality_multifactor: () => {
            target.beta = 1.2;
        },
    };
    mutations[id]();
    const failedRule = evaluateLenses(specific)[id].rows.find((r) => r.ticker === 'AAA')!;
    assert.equal(failedRule.passed, false, `${id}: a strategy-specific failure must reject`);
    assert.ok(failedRule.checks.find((c) => !c.passed && c.id !== '시총 USD' && c.id !== '자료 정합'));
    assertions += 5;
}
assert.equal(GURU_UNIVERSE.length, 495);
const missingPrice = fixture();
missingPrice.price = 0;
missingPrice.issues = ['price_missing'];
assert.equal(
    evaluateLenses([missingPrice]).moat_compounder.rows[0].checks.find((c) => c.id === '시총 USD')!.value,
    null,
    'missing price cannot become a measured zero market cap',
);
const missingDebt = fixture();
missingDebt.ltd[2025] = null;
assert.equal(evaluateLenses([missingDebt]).moat_compounder.rows[0].passed, false);
assert.match(evaluateLenses([missingDebt]).moat_compounder.rows[0].reason, /장기부채\/순이익 자료 없음/);

const c = fixture(),
    snap = makeSnapshot([c], { sec: 0, prices: 0, paid: 0 }, now);
assert.deepEqual(publicationHolds([c], snap, null, 1), []);
const checkHold = (edit: (r: Company) => void, code: string) => {
    const r = structuredClone(c);
    edit(r);
    assert.ok(
        publicationHolds([r], makeSnapshot([r], snap.calls, now), snap, 1).some((h) => h.code === code),
        code,
    );
};
checkHold((r) => (r.currency = 'KRW'), 'unit');
checkHold((r) => (r.ni[2025] = 3e14), 'net_income_digits');
checkHold((r) => (r.wsh[2025] = 100), 'unit');
checkHold((r) => (r.reportedCik = 2), 'cik_change');
checkHold((r) => (r.priceDate = '2026-09-01'), 'stale_price');
checkHold((r) => {
    r.splits = [{ date: '2026-10-01', ratio: 0.88 }];
    r.splitMultiplier = 0.88;
}, 'spinoff');
checkHold((r) => {
    r.splits = [{ date: '2026-10-01', ratio: 25 }];
    r.splitMultiplier = 1;
}, 'split');
checkHold((r) => {
    r.splits = [{ date: '2026-10-01', ratio: 25 }];
    r.splitMultiplier = 25;
}, 'per_mismatch');
const adjusted = splitAdjustedShares(4e6, '2026-06-30', '2026-10-16', [{ date: '2026-10-01', ratio: 25 }]);
assert.deepEqual(adjusted, { shares: 1e8, multiplier: 25 });
const bkng = fixture('BKNG');
bkng.splits = [{ date: '2026-10-01', ratio: 25 }];
bkng.shares = adjusted.shares;
bkng.splitMultiplier = 25;
bkng.eps[2025] = 75;
bkng.wsh[2025] = 4e6;
assert.deepEqual(publicationHolds([bkng], makeSnapshot([bkng], snap.calls, now), null, 1), []);
const counts = structuredClone(snap);
counts.lenses.moat_compounder.passCount = 50;
assert.ok(publicationHolds([c], counts, snap, 1).some((h) => h.code === 'pass_count'));
const reverse = selectSnapshot(snap, undefined, 'AAA');
assert.deepEqual(
    reverse.passedLenses,
    LENS_IDS.filter((id) => snap.lenses[id].rows[0].passed),
);
assert.equal(selectSnapshot(snap, undefined, 'ZZZ').passedLenses!.length, 0);
const twenty = makeSnapshot(
    Array.from({ length: 20 }, (_, i) => fixture(`T${String(i).padStart(2, '0')}`)),
    snap.calls,
    now,
);
assert.equal(twenty.lenses.moat_compounder.rows[19].ticker, 'T19');
assert.ok(
    selectSnapshot(twenty, undefined, 'T19').passedLenses!.includes('moat_compounder'),
    'rank 20 is found beyond top 10',
);
const defensive = fixture();
defensive.divpaid = {};
defensive.dps = {};
const closest = makeSnapshot([defensive], snap.calls, now);
assert.equal(closest.lenses.defensive_value.passCount, 0);
assert.ok(!selectSnapshot(closest, undefined, 'AAA').passedLenses!.includes('defensive_value'));

const store = new Map<string, unknown>();
let writes = 0,
    failKey = '';
const cache = {
    read: async <T>(key: string) => (store.get(key) as T) ?? null,
    write: async <T>(key: string, value: T) => {
        writes++;
        if (key === failKey) return false;
        store.set(key, structuredClone(value));
        return true;
    },
};
async function main() {
    assert.equal((await publishSnapshot(cache, snap, [c], null, 1)).published, true);
    assert.deepEqual(await readSnapshot(cache), snap);
    const after = makeSnapshot([c], snap.calls, new Date('2026-10-20T12:00:00Z'));
    failKey = lensKey('quality_growth', after.date);
    assert.equal((await publishSnapshot(cache, after, [c], snap, 1)).reason, 'write_failed');
    assert.equal((await readSnapshot(cache))!.date, snap.date);
    failKey = '';
    assert.equal((await publishSnapshot(cache, after, [c], snap, 1)).published, true);
    store.delete(lensKey('moat_compounder', after.date));
    assert.equal((await readSnapshot(cache))!.date, snap.date, 'partial generation falls back');
    store.set(lensKey('moat_compounder', after.date), { date: after.date, result: {} });
    assert.equal((await readSnapshot(cache))!.date, snap.date, 'malformed generation falls back');
    const beforeWrites = writes,
        bad = structuredClone(c);
    bad.reportedCik = 9;
    assert.equal((await publishSnapshot(cache, after, [bad], snap, 1)).reason, 'held');
    assert.equal(writes, beforeWrites);

    const h = {
        holders: [
            {
                cik: '0001067983',
                name: 'Fund fixture',
                shares: 10,
                marketValue: 200,
                period: '2026-06-30',
                filingDate: '2026-08-14',
            },
        ],
        totalHolders: 1000,
        period: '2026-06-30',
        source: 'sec-form13f-datasets',
        universeFilers: 8000,
    };
    assert.equal(holdingBadge('moat_compounder', h, now).held, true);
    assert.equal(holdingBadge('roc_ey', h, now).held, null, 'top60 absence is unknown');
    assert.equal(holdingBadge('garp', h, now).state, 'not_applicable');
    assert.equal(holdingBadge('moat_compounder', h, now).portfolioRank, null);
    const at = now.getTime(),
        dp = { date: '2026-10-16', regime: 'ACCUMULATION', stealth: 80 };
    const opt = { callVol: 200, putVol: 100, top: [{ t: 'C' as const, d: 5000, e: '2026-10-23' }] };
    assert.equal(moneyBadge(dp, opt, '2026-10-16', null, at).count, 3);
    assert.equal(moneyBadge(dp, opt, '2026-10-16', null, at).overlap, true);
    assert.equal(moneyBadge(dp, { callVol: 100, putVol: 100 }, '2026-10-16', null, at).overlap, false);
    assert.equal(
        moneyBadge({ ...dp, date: '2026-10-15' }, opt, '2026-10-16', null, at).count,
        2,
        'mismatched EOD dates not counted',
    );
    assert.equal(
        moneyBadge(null, { top: [{ t: 'C', d: 5000, e: '2026-10-16' }] }, '2026-10-16', null, at).count,
        0,
        'expired contracts',
    );
    const ins = insiderNet(
        {
            transaction_filings: [
                {
                    filing_date: '2026-10-16',
                    transactions: [
                        {
                            transaction_type_code: 'P',
                            transaction_date: '2026-10-15',
                            amount_of_shares: 10,
                            transaction_price: 2,
                        },
                        {
                            transaction_type_code: 'S',
                            transaction_date: '2026-10-15',
                            amount_of_shares: 100,
                            transaction_price: 2,
                        },
                    ],
                },
            ],
        },
        at,
    );
    assert.equal(ins!.net30d, -180);
    assert.equal(moneyBadge(null, null, null, ins, at).count, 0, 'a purchase does not imply net buying');
    let reqs: any[] = [];
    const b = await readBadges(
        ['AAA'],
        {
            read: async <T>(key: string) =>
                key === 'market:earnings-calendar:v4'
                    ? ({ rows: [{ ticker: 'AAA', date: '2026-10-22', hour: 'amc' }] } as T)
                    : null,
            darkPool: async () => ({}),
            implied: async (rs) => {
                reqs = rs;
                return rs.map(
                    (r) =>
                        ({ ticker: r.ticker, impliedMovePct: 8, expiry: '2026-10-23', reason: null }) as any,
                );
            },
        },
        at,
    );
    assert.deepEqual(reqs, [{ ticker: 'AAA', after: '2026-10-22', timing: 'amc' }]);
    assert.equal(b.AAA.earnings.days, 3);
    assert.equal(b.AAA.earnings.impliedMove!.impliedMovePct, 8);
    assert.equal(b.AAA.holdingIndex, null);
    assert.equal(b.AAA.money.overlap, false);
    console.log(
        `guruLens: 10 lenses pass/fail/reasons; publication guards; BKNG split; reverse lookup; partial writes; 13F; money; earnings passed (${assertions} lens assertions plus integration assertions)`,
    );
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
