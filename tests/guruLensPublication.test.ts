/** Gate 2: real Redis + weekly service, memory stores only; no sockets or environment files. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import { memoryPublication } from './helpers/guruPublication';
import { HEAD_KEY, lensKey, metaKey, makeSnapshot, readSnapshot } from '../src/lib/guruLens/pipeline';
import { Company, FIELDS, LENS_IDS } from '../src/lib/guruLens/types';

const first = new Date('2026-10-19T12:00:00Z');
const retry = new Date('2026-10-26T12:00:00Z');
function companies(): Company[] {
    return Array.from({ length: 495 }, (_, i) => {
        const c = {
            ticker: `T${i}`, name: 'Fixture', sector: 'Industrials', cik: i + 1,
            reportedCik: i + 1, year: 2025, priceDate: '2026-10-16', price: 20,
            currency: 'USD', shares: 1e8, sharesDate: '2026-06-30', splitMultiplier: 1,
            splits: [], offHigh: -0.4, ret12m: 0.2, mom12_1: 0.2, beta: 1, issues: [],
        } as unknown as Company;
        FIELDS.forEach((f) => (c[f] = {}));
        return c;
    });
}

function redisFixture() {
    const primary = new Map<string, unknown>();
    const publication = memoryPublication(primary);
    const fallback = new Map<string, unknown>();
    const primaryWrites: string[] = [];
    const fallbackWrites: string[] = [];
    let failKey: string | null = null;
    let outage = false;
    const saveFallback = async (key: string, value: unknown) => {
        fallbackWrites.push(key);
        fallback.set(key, structuredClone(value));
        return 'OK';
    };
    const stubUpstash = {
        get: async (key: string) => fallback.get(key) ?? null,
        set: saveFallback,
        setex: async (key: string, _ttl: number, value: unknown) => saveFallback(key, value),
    };
    const exports: Record<string, any> = {};
    const source = fs.readFileSync(require.resolve('../src/services/redisClient'), 'utf8');
    // Isolated module instance; inject an already-created SDK stub, never read process.env.
    // The production Redis code and service adapters themselves execute unchanged.
    const code = ts.transpileModule(source + '\nupstashClient = __stubUpstash;\n', {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, {
        exports, __stubUpstash: stubUpstash,
        process: { env: {} },
        console: { log() {}, warn() {}, error() {} },
        URL, AbortController, setTimeout, clearTimeout,
        require: (name: string) => {
            if (name === '@upstash/redis') return {};
            if (name === 'perf_hooks') return {
                performance,
                monitorEventLoopDelay: () => { throw new Error('disabled in test'); },
            };
            return require(name);
        },
        fetch: async (input: string, init?: RequestInit) => {
            const url = new URL(String(input));
            if (outage) return new Response(null, { status: 503 });
            if (url.pathname === '/get')
                return Response.json({ result: primary.get(url.searchParams.get('key')!) ?? null });
            assert.equal(url.pathname, '/set', 'only memory Redis endpoints');
            assert.equal(init?.method, 'POST');
            const body = JSON.parse(String(init!.body));
            primaryWrites.push(body.key);
            if (body.key === failKey) return new Response(null, { status: 503 });
            primary.set(body.key, structuredClone(body.value));
            return Response.json({ success: true });
        },
    });
    return {
        publication,
        redis: exports as typeof import('../src/services/redisClient'),
        primary, fallback, primaryWrites, fallbackWrites,
        fail(key: string | null) { failKey = key; publication.fail(key); },
        outage() { outage = true; },
    };
}

async function withService<T>(
    fixture: ReturnType<typeof redisFixture>, cs: Company[],
    run: (service: typeof import('../src/lib/guruLens/service'), collections: () => number) => Promise<T>,
) {
    let count = 0;
    const load = (Module as any)._load;
    const servicePath = require.resolve('../src/lib/guruLens/service');
    delete require.cache[servicePath];
    (Module as any)._load = function (name: string, parent: any, main: boolean) {
        if (parent?.filename === servicePath) {
            if (name === '../../services/redisClient') return fixture.redis;
            if (name === './store') return { publicationStore: fixture.publication };
            if (name === '../../services/darkPool' || name === '../../services/impliedMoveService') return {};
            if (name === './sources') return {
                collectCompanies: async () => {
                    count++;
                    return { companies: cs, calls: { sec: 0, prices: 0, paid: 0 }, failures: [] };
                },
            };
        }
        return load.call(this, name, parent, main);
    };
    try { return await run(require(servicePath), () => count); }
    finally {
        (Module as any)._load = load;
        delete require.cache[servicePath];
    }
}

test('gate setup reproduces generic cache success when only fallback stores a lens', async () => {
    const f = redisFixture();
    const key = lensKey('moat_compounder', first.toISOString());
    f.fail(key);
    assert.equal(await f.redis.setInCache(key, { date: first.toISOString() }), true);
    assert.equal(f.primary.has(key), false);
    assert.equal(f.fallback.has(key), true);
    assert.equal((await f.redis.getAuthoritativeCache(key)).value, null);
});

test('weekly service reports the published partial counts and exclusions rather than the raw candidate', async () => {
    const f = redisFixture(), cs = companies();
    cs.slice(0, 35).forEach((c) => { c.currency = 'KRW'; });
    await withService(f, cs, async (service) => {
        const result = await service.runGuruLens(first);
        assert.equal(result.published, true);
        assert.ok('includedCount' in result);
        if (!('includedCount' in result)) throw new Error('missing publication report');
        assert.equal(result.universeCount, 495);
        assert.equal(result.includedCount, 460);
        assert.equal(result.excluded.length, 35);
        const saved = (await readSnapshot(f.publication))!;
        assert.equal(saved.includedCount, 460);
        for (const id of LENS_IDS) assert.equal(result.passCounts[id], saved.lenses[id].passCount);
        assert.equal(f.fallbackWrites.length, 0);
    });
});

test('gate: every failed lens/meta/head save leaves publication retryable, initially and with a healthy head', async () => {
    for (const existing of [false, true]) {
        for (const failed of [...LENS_IDS.map((id) => lensKey(id, first.toISOString())), metaKey(first.toISOString()), HEAD_KEY]) {
            const f = redisFixture();
            const cs = companies();
            let previous: string | null = null;
            if (existing) {
                const a = makeSnapshot(cs, { sec: 0, prices: 0, paid: 0 }, new Date('2026-10-18T12:00:00Z'));
                a.asOf = '2026-10-15';
                const { lenses, ...meta } = a;
                previous = a.date;
                f.primary.set(metaKey(a.date), meta);
                for (const id of LENS_IDS)
                    f.primary.set(lensKey(id, a.date), { date: a.date, result: lenses[id] });
                f.primary.set(HEAD_KEY, { current: a.date, previous: null });
            }
            const oldHead = f.primary.get(HEAD_KEY);
            f.fail(failed);
            await withService(f, cs, async (service, collections) => {
                const result = await service.runGuruLens(first);
                assert.equal(result.published, false, `${existing}/${failed}: partial saves must not publish`);
                assert.equal(result.reason, 'write_failed');
                assert.deepEqual(f.primary.get(HEAD_KEY), oldHead);
                assert.equal(f.publication.writes.filter((key) => key === HEAD_KEY).length, failed === HEAD_KEY ? 1 : 0);
                assert.equal(f.fallbackWrites.length, 0, 'publication never advances a different store');
                f.fail(null);
                // Next weekly calculation has current prices; financial inputs stay the same.
                cs.forEach((c) => { c.priceDate = '2026-10-23'; });
                assert.equal((await service.runGuruLens(retry)).published, true, 'recovery must reach a new calculation');
                assert.equal(collections(), 2);
                assert.deepEqual(f.primary.get(HEAD_KEY), { current: retry.toISOString(), previous, asOf: '2026-10-23' });
                const snapshot = await readSnapshot(f.publication);
                assert.equal(snapshot!.date, retry.toISOString());
                assert.equal(snapshot!.universeCount, 495);
            });
        }
    }
});

test('authoritative writer rejects invalid values and outages without using fallback', async () => {
    const f = redisFixture();
    for (const value of [null, undefined, { error: 'synthetic' }])
        assert.equal(await f.redis.setAuthoritativeCache(HEAD_KEY, value), false);
    assert.equal(f.primaryWrites.length, 0);
    f.outage();
    assert.equal(await f.redis.setAuthoritativeCache(HEAD_KEY, { current: first.toISOString(), previous: null }), false);
    assert.equal(f.fallbackWrites.length, 0);
});
