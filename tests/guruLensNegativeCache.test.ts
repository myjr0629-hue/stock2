/** Route cache TTL and recovery. All reads/writes are in local memory. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { NextRequest } from 'next/server';
import { guruCompany } from './helpers/guruCompany';
import { memoryPublication } from './helpers/guruPublication';
import { GURU_UNIVERSE } from '../src/lib/guruLens/sources';
import { makeSnapshot, publishSnapshot } from '../src/lib/guruLens/pipeline';

const db = memoryPublication();
let reads = 0, badges = 0, fail = false, clock = Date.parse('2026-10-19T12:00:00Z');
const originalNow = Date.now, load = (Module as any)._load;
Date.now = () => clock;
(Module as any)._load = function (name: string, parent: any, main: boolean) {
    if (name === '@/lib/guruLens/service') return {
        readonlyCache: { read: async (key: string) => {
            reads++;
            if (fail) throw new Error('synthetic read failure');
            return db.read(key);
        } },
        currentBadges: async () => { badges++; return {}; },
    };
    return load.call(this, name, parent, main);
};
async function main() {
    try {
        const route = require('../src/app/api/guru-lens/route');
        const get = (query = '') => route.GET(new NextRequest('http://localhost/api/guru-lens?' + query));
        const unavailable = async (response: Response, reason: string) => {
            assert.equal(response.status, 503);
            assert.equal(response.headers.get('Cache-Control'), 'public, s-maxage=60');
            assert.deepEqual(await response.json(), { available: false, reason });
        };
        const responses = await Promise.all([get('ticker=AAPL&badges=0'), get('ticker=MSFT&badges=0')]);
        for (const r of responses) await unavailable(r, 'no_published_snapshot');
        assert.equal(reads, 1, 'simultaneous missing reads coalesce');
        clock += 59_999;
        await unavailable(await get(), 'no_published_snapshot');
        assert.equal(reads, 1, 'negative cache is shared across query variants');
        assert.equal((await get('lens=invalid')).status, 400);
        assert.equal(reads, 1);

        const cs = GURU_UNIVERSE.slice(0, 20).map((c) => ({ ...guruCompany(), ticker: c.t }));
        cs[0].currency = 'KRW';
        const candidate = makeSnapshot(cs, { sec: 0, prices: 0, paid: 0 }, new Date(clock));
        const result = await publishSnapshot(db, candidate, cs, null, null, 20);
        assert.equal(result.published, true);
        clock++;
        let response = await get('badges=0');
        assert.equal(response.status, 200, 'new partial publication appears at TTL expiry');
        const body = await response.json();
        assert.equal(body.universeCount, 20);
        assert.equal(body.includedCount, 19);
        assert.deepEqual(body.excluded, result.excluded);
        assert.ok(body.lenses.every((l: any) => l.evaluatedCount === 19 && l.determinedCount <= 19 && l.rows.every((r: any) => r.ticker !== cs[0].ticker)));
        response = await get(`ticker=${cs[0].ticker}&badges=0`);
        const excluded = await response.json();
        assert.deepEqual(excluded.passedLenses, []);
        assert.ok(excluded.lenses.every((l: any) => l.rows.length === 0));

        fail = true;
        const before = reads;
        for (const r of await Promise.all([get(), get('ticker=AAPL&badges=0')]))
            await unavailable(r, 'read_failed');
        assert.equal(reads, before + 1, 'simultaneous failed reads coalesce');
        fail = false;
        clock += 59_999;
        await unavailable(await get(), 'read_failed');
        assert.equal(reads, before + 1, 'failed reads cached for 60 seconds');
        clock++;
        assert.equal((await get('badges=0')).status, 200, 'successful recovery after read failure');
        assert.equal(badges, 0);
        console.log('guruLens negative cache: 60s missing/read failure, concurrent queries, expiry recovery, partial API metadata passed; network/production writes 0');
    } finally {
        Date.now = originalNow;
        (Module as any)._load = load;
    }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
