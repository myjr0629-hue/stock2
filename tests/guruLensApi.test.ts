/** Route adapters mocked before import. Never opens sockets or reads environment files. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { FIELDS, Company, LENS_IDS } from '../src/lib/guruLens/types';
import { makeSnapshot, HEAD_KEY, metaKey, lensKey } from '../src/lib/guruLens/pipeline';
import { NextRequest } from 'next/server';
const r = {
    ticker: 'AAPL',
    name: 'Fixture',
    sector: 'Information Technology',
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
    ret12m: 0.2,
    mom12_1: 0.2,
    beta: 1,
    issues: [],
} as unknown as Company;
FIELDS.forEach((f) => (r[f] = {}));
const snap = makeSnapshot([r], { sec: 0, prices: 0, paid: 0 }, new Date('2026-10-19T12:00:00Z'));
// A passing stock beyond top 10 must still be present in reverse lookup.
snap.lenses.moat_compounder.rows[0].passed = true;
snap.lenses.moat_compounder.passCount = 1;
const { lenses: _, ...meta } = snap;
const store = new Map<string, unknown>([
    [HEAD_KEY, { current: snap.date, previous: null }],
    [metaKey(snap.date), meta],
]);
LENS_IDS.forEach((id) => store.set(lensKey(id, snap.date), { date: snap.date, result: snap.lenses[id] }));
let reads = 0,
    badgeReads = 0,
    cronRuns = 0;
const load = (Module as any)._load;
(Module as any)._load = function (name: string, parent: any, main: any) {
    if (name === '@/lib/guruLens/service')
        return {
            readonlyCache: {
                read: async (key: string) => {
                    reads++;
                    return store.get(key) ?? null;
                },
            },
            currentBadges: async () => {
                badgeReads++;
                return {};
            },
            runGuruLens: async () => {
                cronRuns++;
                throw new Error('must not run');
            },
        };
    return load.call(this, name, parent, main);
};
async function main() {
    const route = require('../src/app/api/guru-lens/route');
    let response = await route.GET(new NextRequest('http://localhost/api/guru-lens?ticker=AAPL'));
    assert.equal(response.status, 200);
    let body = await response.json();
    assert.deepEqual(body.passedLenses, ['moat_compounder']);
    assert.equal(body.lenses.length, 10);
    assert.equal(body.lenses[0].rows[0].ticker, 'AAPL');
    response = await route.GET(
        new NextRequest('http://localhost/api/guru-lens?lens=defensive_value&ticker=AAPL'),
    );
    body = await response.json();
    assert.equal(body.lenses[0].passCount, 0);
    assert.deepEqual(body.passedLenses, []);
    const before = reads;
    for (const query of [
        'lens=wrong',
        'ticker=ZZZZZZ',
        'lens=',
        'ticker=',
        'limit=0',
        'limit=51',
        'limit=1.1',
    ])
        assert.equal(
            (await route.GET(new NextRequest('http://localhost/api/guru-lens?' + query))).status,
            400,
        );
    assert.equal(reads, before, 'validation before cache access');
    store.clear();
    response = await route.GET(new NextRequest('http://localhost/api/guru-lens'));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).reason, 'no_published_snapshot');
    const cron = require('../src/app/api/cron/guru-lens/route');
    assert.equal((await cron.GET(new NextRequest('http://localhost/api/cron/guru-lens'))).status, 401);
    assert.equal(cronRuns, 0);
    assert.equal(badgeReads, 2);
    (Module as any)._load = load;
    console.log(
        'guruLens API: ticker reverse lookup, lens filtering, closest!=pass, invalid queries, empty cache, cron authorization passed; production writes 0',
    );
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
