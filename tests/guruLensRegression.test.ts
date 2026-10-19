/** Gate regressions: synthetic data, memory cache, no sockets or environment files. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import { insiderKey, insiderNet, moneyBadge, readBadges } from '../src/lib/guruLens/badges';
import {
    HEAD_KEY, Head, lensKey, metaKey, makeSnapshot, publishSnapshot, readSnapshot,
} from '../src/lib/guruLens/pipeline';
import { Company, FIELDS, Snapshot } from '../src/lib/guruLens/types';

const now = new Date('2026-10-19T12:00:00Z');
const transaction = (code: string, shares: number, price = 10) => ({
    transaction_type_code: code,
    transaction_date: '2026-10-16',
    amount_of_shares: shares,
    transaction_price: price,
});

test('weekly service publishes after fallback using the head observed before collection', async () => {
    const companies = Array.from({ length: 495 }, (_, i) => ({ ...fixture(), ticker: `T${i}` }));
    const calls = { sec: 0, prices: 0, paid: 0 };
    const a = makeSnapshot(companies, calls, new Date('2026-10-17T12:00:00Z'));
    const b = makeSnapshot(companies, calls, new Date('2026-10-18T12:00:00Z'));
    const store = new Map<string, unknown>();
    for (const snapshot of [a, b]) {
        const { lenses, ...meta } = snapshot;
        store.set(metaKey(snapshot.date), meta);
        for (const [id, result] of Object.entries(lenses))
            store.set(lensKey(id as keyof typeof lenses, snapshot.date), { date: snapshot.date, result });
    }
    store.set(HEAD_KEY, { current: b.date, previous: a.date });
    store.delete(lensKey('moat_compounder', b.date));
    let headReads = 0, collections = 0;
    const originalLoad = (Module as any)._load;
    (Module as any)._load = function (name: string, parent: any, main: boolean) {
        if (parent?.filename?.endsWith('/guruLens/service.ts')) {
            if (name === '../../services/redisClient') return {
                getAuthoritativeCache: async (key: string) => {
                    if (key === HEAD_KEY) headReads++;
                    return { ok: true, value: store.get(key) ?? null };
                },
                setInCache: async (key: string, value: unknown) => {
                    store.set(key, structuredClone(value));
                    return true;
                },
            };
            if (name === '../../services/darkPool' || name === '../../services/impliedMoveService') return {};
            if (name === './sources') return {
                collectCompanies: async () => {
                    collections++;
                    return { companies, calls, failures: [] };
                },
            };
        }
        return originalLoad.call(this, name, parent, main);
    };
    const servicePath = require.resolve('../src/lib/guruLens/service');
    try {
        const { runGuruLens } = require(servicePath) as typeof import('../src/lib/guruLens/service');
        const result = await runGuruLens(now);
        assert.equal(result.published, true);
        assert.equal(headReads, 2, 'one initial pointer plus one publication recheck');
        assert.equal(collections, 1);
        assert.deepEqual(store.get(HEAD_KEY), { current: now.toISOString(), previous: a.date });
        assert.equal((await readSnapshot({ read: async <T>(key: string) => (store.get(key) as T) ?? null }))!.date,
            now.toISOString());

        store.delete(lensKey('moat_compounder', now.toISOString()));
        store.delete(lensKey('moat_compounder', a.date));
        assert.equal((await runGuruLens(now)).reason, 'previous_snapshot_unreadable');
        assert.equal(collections, 1, 'no source collection when both saved generations are unreadable');
    } finally {
        (Module as any)._load = originalLoad;
        delete require.cache[servicePath];
    }
});

test('gate: an incomplete insider page cannot turn a real net sale into overlap', () => {
    const firstPage = {
        next_page: 'synthetic-next-page',
        transaction_filings: [{ transactions: [transaction('P', 100)] }],
    };
    const secondPage = { transaction_filings: [{ transactions: [transaction('S', 200)] }] };
    const complete = {
        next_page: null,
        transaction_filings: [...firstPage.transaction_filings, ...secondPage.transaction_filings],
    };
    assert.equal(insiderNet(complete, now.getTime())!.net30d, -1000);
    const partial = insiderNet(firstPage, now.getTime());
    const badge = moneyBadge(
        { date: '2026-10-16', regime: 'ACCUMULATION', stealth: 80 },
        null, null, partial, now.getTime(),
    );
    assert.equal(badge.overlap, false, 'one dark-pool signal plus incomplete insider data is not overlap');
    assert.equal(partial, null, 'never label a first-page subtotal as net30d');
    assert.equal(badge.signals.find((s) => s.id === 'insider_net_buy')!.on, null);
});

test('insider: terminal data uses P minus S, with exercises, gifts and derivatives excluded', () => {
    const raw = {
        next_page: null,
        transaction_filings: [{ transactions: [
            transaction('P', 100), transaction('S', 200),
            transaction('M', 10000), transaction('G', 10000),
            transaction('A', 10000), transaction('F', 10000),
            { ...transaction('P', 10000), derivative_transaction: true },
            { ...transaction('P', 10000), transaction_date: '2026-09-01' },
            { ...transaction('P', 10000), transaction_date: '2026-10-20' },
        ] }],
    };
    assert.deepEqual(insiderNet(raw, now.getTime()), {
        net30d: -1000, buyCount: 1, sellCount: 1, from: '2026-09-19', through: '2026-10-19',
    });
    assert.equal(insiderNet({ transaction_filings: raw.transaction_filings }, now.getTime()), null,
        'a cache without pagination metadata does not prove completeness');
    assert.equal(insiderNet({ next_page: null, transaction_filings: [] }, now.getTime())!.net30d, 0);
    for (const [code, expected] of [['P', 1000], ['S', -1000]] as const) {
        const net = insiderNet({
            next_page: null, transaction_filings: [{ transactions: [transaction(code, 100)] }],
        }, now.getTime());
        assert.equal(net!.net30d, expected);
        assert.equal(moneyBadge(null, null, null, net, now.getTime()).signals[3].on, expected > 0);
    }
});

test('cache badge reader propagates incomplete insider data as unknown without fetching pages', async () => {
    for (const next_page of ['synthetic-next-page', undefined, null]) {
        const keys: string[] = [];
        const result = await readBadges(['AAA'], {
            read: async <T>(key: string) => {
                keys.push(key);
                return key === insiderKey('AAA') ? {
                    next_page, transaction_filings: [{ transactions: [transaction('P', 100)] }],
                } as T : null;
            },
            darkPool: async () => ({ AAA: { date: '2026-10-16', regime: 'ACCUMULATION', stealth: 80 } }),
            implied: async () => { assert.fail('no earnings: no implied requests'); },
        }, now.getTime());
        const complete = next_page === null;
        assert.equal(result.AAA.money.overlap, complete);
        assert.equal(result.AAA.money.signals[3].on, complete ? true : null);
        assert.equal(keys.filter((key) => key.includes('insider_transaction_filings')).length, 1);
    }
});

function fixture(): Company {
    const company = {
        ticker: 'AAA', name: 'Fixture', sector: 'Industrials',
        cik: 1, reportedCik: 1, year: 2025,
        priceDate: '2026-10-16', price: 20, currency: 'USD',
        shares: 1e8, sharesDate: '2026-06-30', splitMultiplier: 1, splits: [],
        offHigh: -0.4, ret12m: 0.2, mom12_1: 0.2, beta: 1, issues: [],
    } as unknown as Company;
    FIELDS.forEach((f) => (company[f] = {}));
    return company;
}

test('gate: after corrupt B falls back to A, a healthy C replaces head and preserves A', async () => {
    const company = fixture();
    const store = new Map<string, unknown>();
    const cache = {
        read: async <T>(key: string) => (store.get(key) as T) ?? null,
        write: async <T>(key: string, value: T) => {
            store.set(key, structuredClone(value));
            return true;
        },
    };
    const generation = (date: string) => makeSnapshot([company], { sec: 0, prices: 0, paid: 0 }, new Date(date));
    const publish = async (next: Snapshot, previous: Snapshot | null) =>
        publishSnapshot(cache, next, [company], previous, await cache.read<Head>(HEAD_KEY), 1);
    const a = generation('2026-10-17T12:00:00Z');
    const b = generation('2026-10-18T12:00:00Z');
    const c = generation('2026-10-19T12:00:00Z');
    assert.equal((await publish(a, null)).published, true);
    assert.equal((await publish(b, a)).published, true);
    store.delete(lensKey('moat_compounder', b.date));
    const fallback = await readSnapshot(cache);
    assert.equal(fallback!.date, a.date);
    assert.equal((await publish(c, fallback)).reason, 'published');
    assert.deepEqual(store.get(HEAD_KEY), { current: c.date, previous: a.date });
    assert.equal((await readSnapshot(cache))!.date, c.date);
    store.delete(lensKey('quality_growth', c.date));
    assert.equal((await readSnapshot(cache))!.date, a.date, 'C must preserve healthy A rather than corrupt B');

    const expectedHead = await cache.read<Head>(HEAD_KEY);
    const fallbackAgain = await readSnapshot(cache, expectedHead);
    const older = generation('2026-10-18T18:00:00Z');
    assert.equal((await publishSnapshot(cache, older, [company], fallbackAgain, expectedHead, 1)).reason,
        'older_generation', 'a run older than corrupt current C cannot replace it');

    // A newer publisher changes the pointer during the slow generation writes.
    const competingHead = { current: '2026-10-19T18:00:00Z', previous: a.date };
    const d = generation('2026-10-19T19:00:00Z');
    const racingCache = {
        ...cache,
        write: async <T>(key: string, value: T) => {
            const ok = await cache.write(key, value);
            if (key === lensKey('moat_compounder', d.date)) store.set(HEAD_KEY, competingHead);
            return ok;
        },
    };
    assert.equal((await publishSnapshot(racingCache, d, [company], fallbackAgain, expectedHead, 1)).reason,
        'head_changed');
    assert.deepEqual(store.get(HEAD_KEY), competingHead, 'a concurrent head must not be overwritten');

    store.set(HEAD_KEY, { ...expectedHead!, previous: b.date });
    assert.equal((await publishSnapshot(cache, d, [company], fallbackAgain, expectedHead, 1)).reason,
        'head_changed', 'a change to only the fallback pointer must also be detected');
});
