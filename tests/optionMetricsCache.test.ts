/** Offline: real fast-all route + service; Redis/Dynamo are memory-only. No .env loading.
 * node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/optionMetricsCache.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { etPhase, INTEL_FAST_SECTORS } from '../src/lib/cache/intelFastCache';
import { optionMetrics } from '../src/lib/optionMetrics';
import { OPTIONS_ROW_MAX_AGE_MS } from '../src/lib/app/intelOptionsBasis';

const realNow = Date.now;
let now = Date.parse('2026-10-19T12:00:00-04:00');
Date.now = () => now;
globalThis.fetch = async () => { throw new Error('External I/O forbidden'); };
const tickers = Array.from({ length: 70 }, (_, i) => `TEST${i}`);
const structures = new Map<string, any>();
const oi = new Map<string, any>();
let dynamoCalls = 0, structureReads = 0, redisFails = false, dynamoFails = false;
let beforeOi: (() => Promise<void>) | undefined;
const stub = (file: string, exports: any) => {
    const id = require.resolve(file);
    require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
stub('../src/services/redisClient', {
    mgetFromCache: async (keys: string[]) => {
        if (keys[0]?.startsWith('structure:')) {
            structureReads++;
            // The real Redis helper resolves null entries on failure; it does not reject.
            if (redisFails) return keys.map(() => null);
            return keys.map(k => {
                const ticker = k.slice('structure:v2:'.length);
                return structures.has(ticker) ? structuredClone({ data: structures.get(ticker) }) : null;
            });
        }
        // 10 fresh sector envelopes, 70 unique tickers; no background refresh is allowed.
        return INTEL_FAST_SECTORS.map((_, i) => ({ at: now, phase: etPhase(now).key,
            body: { success: true, data: tickers.slice(i * 7, i * 7 + 7).map(ticker => ({ ticker, price: 100 })), meta: {} },
        }));
    },
});
stub('../src/lib/aws/dynamoDataProvider', {
    getLatestGex: async (ticker: string) => {
        dynamoCalls++;
        const row = structuredClone(oi.get(ticker) ?? null);
        if (beforeOi) await beforeOi();
        if (dynamoFails) throw new Error('Dynamo unavailable');
        return row;
    },
});
stub('../src/lib/cache/staleLock', { ageSec: (ms: number) => Math.floor(ms / 1000),
    tryBackgroundLock: () => { throw new Error('Unexpected write'); }, releaseBackgroundLock: () => { throw new Error('Unexpected write'); },
});
stub('../src/lib/intelFastGovernor', { governorOff: () => { throw new Error('Unexpected governor read'); } });
stub('next/server', { NextResponse: { json: (data: any) => new Response(JSON.stringify(data)) },
    after: () => { throw new Error('Unexpected background work'); },
});

function reset(iso = '2026-10-19T12:00:00-04:00') {
    now = Date.parse(iso);
    dynamoCalls = structureReads = 0; redisFails = dynamoFails = false; beforeOi = undefined;
    structures.clear(); oi.clear();
    for (const [i, ticker] of tickers.entries()) {
        structures.set(ticker, { expiration: '2026-10-23', options_status: 'OK', netGex: (i - 35) * 1e6,
            squeezeScore: i, squeezeRisk: i > 50 ? 'EXTREME' : 'LOW' });
        oi.set(ticker, { timestamp: now - 60_000, pcr: 0.555 + i / 100 });
    }
    delete require.cache[require.resolve('../src/services/optionMetricsService')];
    delete require.cache[require.resolve('../src/app/api/intel/fast-all/route')];
    return require('../src/services/optionMetricsService') as typeof import('../src/services/optionMetricsService');
}
const response = async (app = true) => {
    const { GET } = require('../src/app/api/intel/fast-all/route');
    const body = await (await GET(new Request(`http://offline.test/api/intel/fast-all${app ? '?app=1' : ''}`))).json();
    assert.equal(body.meta.count, 10); assert.equal(body.missing.length, 0);
    return Object.values(body.sectors).flatMap((s: any) => s.data) as any[];
};
const checkValues = (rows: any[]) => rows.forEach(row => {
    const expected = optionMetrics(structures.get(row.ticker), oi.get(row.ticker), now);
    for (const key of Object.keys(expected)) assert.deepEqual(row[key], expected[key as keyof typeof expected], `${row.ticker}.${key}`);
});
let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log(`ok - ${name}`); };

(async () => {
    await test('baseline: uncached 70 + 70; real fast-all: first 70, hit 0 (app/web)', async () => {
        const service = reset();
        await service.readOptionMetrics(tickers); await service.readOptionMetrics(tickers);
        assert.equal(dynamoCalls, 140);
        dynamoCalls = structureReads = 0;
        checkValues(await response()); assert.equal(dynamoCalls, 70);
        const first = await response(false); checkValues(first);
        assert.equal(dynamoCalls, 70); assert.equal(structureReads, 1);
        first[0].pcr = 99; checkValues(await response());
    });
    await test('10 simultaneous 70-ticker requests share 70 queries + one Redis mget', async () => {
        reset();
        const all = await Promise.all(Array.from({ length: 10 }, () => response()));
        all.forEach(checkValues); assert.equal(dynamoCalls, 70); assert.equal(structureReads, 1);
        await response(); assert.equal(dynamoCalls, 70);
    });
    await test('overlapping ticker sets/aliases share flights; empty input does no I/O', async () => {
        const service = reset();
        structures.set('BRK.B', null);
        oi.set('BRK.B', { timestamp: now, pcr: 0.8 });
        const [a, b] = await Promise.all([
            service.readOptionMetrics([...tickers.slice(0, 50), 'brk-b', 'BRK.B'], { cache: true }),
            service.readOptionMetrics([...tickers.slice(30), 'BRK/B'], { cache: true }),
        ]);
        assert.equal(dynamoCalls, 71); assert.deepEqual(a.get('BRK-B'), b.get('BRK/B'));
        assert.equal((await service.readOptionMetrics([], { cache: true })).size, 0); assert.equal(dynamoCalls, 71);
    });
    await test('cached/uncached values match for missing, NO_MARKET, expired, nonfinite and zero measurements', async () => {
        const service = reset();
        structures.set('TEST0', null); structures.get('TEST1').options_status = 'NO_MARKET';
        structures.get('TEST2').expiration = '2026-10-16';
        structures.get('TEST3').netGex = NaN; structures.get('TEST3').squeezeScore = Infinity;
        oi.delete('TEST4'); oi.set('TEST5', { timestamp: now, totalCallOI: 10, totalPutOI: 0 });
        oi.set('TEST6', { timestamp: now - OPTIONS_ROW_MAX_AGE_MS - 1, pcr: 1.5 });
        oi.set('TEST7', { timestamp: now + 3600_001, pcr: 1.5 });
        const uncached = await service.readOptionMetrics(tickers);
        assert.deepEqual(await service.readOptionMetrics(tickers, { cache: true }), uncached);
        assert.deepEqual(await service.readOptionMetrics(tickers, { cache: true }), uncached);
        assert.equal(dynamoCalls, 140);
        assert.equal(uncached.get('TEST5')!.pcr, 0); assert.equal(uncached.get('TEST35')!.gex, 0);
    });
    for (const [iso, ttl] of [['2026-10-19T12:00:00-04:00', 20_000], ['2026-10-19T21:00:00-04:00', 60_000]] as const) {
        await test(`source update: both structure/OI follow at ${ttl / 1000}s; hits do not extend TTL`, async () => {
            reset(iso); const started = now; await response();
            now++;
            for (const ticker of tickers) {
                structures.set(ticker, { ...structures.get(ticker), netGex: 12e6, squeezeScore: 90, squeezeRisk: 'EXTREME' });
                oi.set(ticker, { timestamp: now, pcr: 1.234 });
            }
            now = started + ttl - 1;
            assert.notEqual((await response())[0].pcr, 1.23); assert.equal(dynamoCalls, 70);
            now++;
            checkValues(await response()); assert.equal(dynamoCalls, 140);
            assert.equal((await response())[0].pcr, 1.23); assert.equal(dynamoCalls, 140);
        });
    }
    await test('session boundary invalidates before TTL, including early close expiration floor', async () => {
        for (const [start, end] of [
            ['2026-10-19T09:29:59-04:00', '2026-10-19T09:30:00-04:00'],
            ['2026-11-27T12:59:59-05:00', '2026-11-27T13:00:00-05:00'],
        ]) {
            const service = reset(start);
            structures.get('TEST0').expiration = start.slice(0, 10);
            assert.notEqual((await service.readOptionMetrics(['TEST0'], { cache: true })).get('TEST0')!.gex, null);
            now = Date.parse(end);
            const m = (await service.readOptionMetrics(['TEST0'], { cache: true })).get('TEST0')!;
            assert.equal(dynamoCalls, 2);
            if (end.includes('13:00')) assert.equal(m.gex, null);
        }
    });
    await test('cached row age is rechecked at 5-day boundary without a Dynamo read', async () => {
        const service = reset(); oi.set('TEST0', { timestamp: now - OPTIONS_ROW_MAX_AGE_MS, pcr: 0.8 });
        assert.equal((await service.readOptionMetrics(['TEST0'], { cache: true })).get('TEST0')!.pcr, 0.8);
        now++;
        const m = (await service.readOptionMetrics(['TEST0'], { cache: true })).get('TEST0')!;
        assert.equal(m.pcr, null); assert.equal(m.optionsAsOf, null); assert.equal(dynamoCalls, 1);
    });
    await test('missing/failed Dynamo rows retry in 5s', async () => {
        for (const failure of [false, true]) {
            const service = reset(); oi.delete('TEST0'); dynamoFails = failure;
            assert.equal((await service.readOptionMetrics(['TEST0'], { cache: true })).get('TEST0')!.pcr, null);
            oi.set('TEST0', { timestamp: now, pcr: 0.9 }); dynamoFails = false;
            now += 4999; await service.readOptionMetrics(['TEST0'], { cache: true }); assert.equal(dynamoCalls, 1);
            now++; assert.equal((await service.readOptionMetrics(['TEST0'], { cache: true })).get('TEST0')!.pcr, 0.9);
            assert.equal(dynamoCalls, 2);
        }
    });
    for (const iso of ['2026-10-19T12:00:00-04:00', '2026-10-19T21:00:00-04:00']) {
        await test(`Redis null-array failure recovers after 1s without waiting for TTL (${iso})`, async () => {
            reset(iso); redisFails = true;
            const failed = await response();
            assert.ok(failed.every(row => row.gex === null && row.squeezeScore === null));
            assert.equal(dynamoCalls, 70); assert.equal(structureReads, 1);
            redisFails = false; now += 1000;
            checkValues(await response());
            assert.equal(dynamoCalls, 140); assert.equal(structureReads, 2);
            checkValues(await response(false));
            assert.equal(dynamoCalls, 140); assert.equal(structureReads, 2);
        });
    }
    await test('mixed null entries prevent retaining the batch; recovered zero values are cached', async () => {
        const service = reset();
        const restored = { ...structures.get('TEST0'), netGex: 0, squeezeScore: 0 };
        structures.delete('TEST0');
        const failed = await service.readOptionMetrics(['TEST0', 'TEST1'], { cache: true });
        assert.equal(failed.get('TEST0')!.gex, null);
        assert.equal(failed.get('TEST1')!.gex, -34e6);
        structures.set('TEST0', restored); structures.get('TEST1').netGex = 12e6; now += 1000;
        const recovered = await service.readOptionMetrics(['TEST0', 'TEST1'], { cache: true });
        assert.equal(recovered.get('TEST0')!.gex, 0); assert.equal(recovered.get('TEST0')!.squeezeScore, 0);
        assert.equal(recovered.get('TEST1')!.gex, 12e6);
        assert.equal(dynamoCalls, 4); assert.equal(structureReads, 2);
        assert.deepEqual(await service.readOptionMetrics(['TEST0', 'TEST1'], { cache: true }), recovered);
        assert.equal(dynamoCalls, 4); assert.equal(structureReads, 2);
    });
    await test('a successful wrapper with no structure data remains cacheable', async () => {
        const service = reset(); structures.set('TEST0', null);
        const missing = await service.readOptionMetrics(['TEST0'], { cache: true });
        assert.equal(missing.get('TEST0')!.gex, null); assert.equal(missing.get('TEST0')!.pcr, 0.56);
        now += 1000;
        assert.deepEqual(await service.readOptionMetrics(['TEST0'], { cache: true }), missing);
        assert.equal(dynamoCalls, 1); assert.equal(structureReads, 1);
    });
    await test('slow I/O cannot extend cache freshness; expired results are not retained', async () => {
        const service = reset();
        beforeOi = async () => { now += 20_001; };
        await service.readOptionMetrics(['TEST0'], { cache: true });
        beforeOi = undefined;
        await service.readOptionMetrics(['TEST0'], { cache: true }); assert.equal(dynamoCalls, 2);
    });
    await test('all other shared callers retain uncached behavior and values', async () => {
        const service = reset();
        await service.readOptionMetrics(['TEST0'], { cache: true });
        oi.set('TEST0', { timestamp: now, totalCallOI: 100, totalPutOI: 25 });
        const m = (await service.readOptionMetrics(['TEST0'])).get('TEST0')!;
        assert.equal(m.pcr, 0.25); assert.equal(dynamoCalls, 2);
        for (const file of ['src/services/portfolioBatchService.ts', 'src/services/watchlistBatchService.ts',
            'src/app/api/app/options-latest/route.ts', 'src/app/api/undercurrent/shared.ts',
            'src/app/api/command/unified/route.ts', 'src/app/api/intel/fast/route.ts',
            'src/app/api/live/ticker/route.ts', 'src/app/api/live/short-squeeze/route.ts']) {
            const text = fs.readFileSync(file, 'utf8');
            // command/unified reads metrics + regime inputs of the same edition through readOptionEditions (same uncached read).
            assert.ok(text.includes('readOptionMetrics(') || text.includes('readOptionEditions('), file); assert.ok(!text.includes('{ cache: true }'), file);
        }
    });
    console.log(`${passed} tests passed; measured baseline 140/2 requests, cached hit 0/request, simultaneous 70/10 requests.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Date.now = realNow; });
