/** Gate 3: deterministic offline cache and publication interleavings. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { moneyBadge, readBadges } from '../src/lib/guruLens/badges';
import { makeSnapshot, publishSnapshot, readSnapshot, HEAD_KEY, lensKey, metaKey } from '../src/lib/guruLens/pipeline';
import { Company, FIELDS, LENS_IDS } from '../src/lib/guruLens/types';
import { memoryPublication } from './helpers/guruPublication';
const now = new Date('2026-10-19T12:00:00Z');
const option = { callVol: 100, putVol: 100, prevDate: '2026-10-15',
    top: [{ t: 'C' as const, d: 6000, e: '2026-10-23' }] };

test('gate: record 10/16 OI belongs to 10/15 and cannot overlap 10/16 dark pool', () => {
    const dp = { date: '2026-10-16', regime: 'ACCUMULATION', stealth: 80 };
    const b = moneyBadge(dp, option, '2026-10-16', null, now.getTime());
    assert.equal(b.signals[2].date, '2026-10-15');
    assert.equal(b.signals[2].on, true);
    assert.equal(b.signals[1].date, '2026-10-16');
    assert.equal(b.asOf, '2026-10-16');
    assert.equal(b.count, 1);
    assert.equal(b.overlap, false);
    const same = moneyBadge({ ...dp, date: '2026-10-15' }, option, '2026-10-16', null, now.getTime());
    assert.equal(same.count, 2);
    assert.equal(same.overlap, true);
    assert.equal(same.asOf, '2026-10-15');
    for (const prevDate of [undefined, null, '2026-10-16', '2026-10-20']) {
        const unknown = moneyBadge(dp, { ...option, prevDate }, '2026-10-16', null, now.getTime());
        assert.equal(unknown.signals[2].on, null);
        assert.equal(unknown.signals[2].date, null);
        assert.equal(unknown.overlap, false);
    }
});

test('cache reader preserves bundle and stale ticker OI session dates independently', async () => {
    const results = await readBadges(['AAA', 'BBB', 'CCC'], {
        read: async <T>(key: string) => key === 'intrinio:options:eod' ? {
            date: '2026-10-16', prevDate: '2026-10-15', tickers: { AAA: option },
            stale: { BBB: { ...option, date: '2026-10-15', prevDate: '2026-10-14' },
                CCC: { ...option, date: '2026-10-15', prevDate: undefined } },
        } as T : null,
        darkPool: async () => ({}), implied: async () => [],
    }, now.getTime());
    assert.equal(results.AAA.money.signals[2].date, '2026-10-15');
    assert.equal(results.BBB.money.signals[2].date, '2026-10-14');
    assert.equal(results.BBB.money.signals[1].date, '2026-10-15');
    assert.equal(results.CCC.money.signals[2].date, null);
    assert.equal(results.CCC.money.signals[2].on, null);
});

function generation(asOf: string, generatedAt: string) {
    const c = { ticker: 'AAA', name: 'Fixture', sector: 'Industrials', cik: 1, reportedCik: 1,
        year: 2025, priceDate: asOf, price: 20, currency: 'USD', shares: 1e8,
        sharesDate: '2026-06-30', splitMultiplier: 1, splits: [], offHigh: -0.4,
        ret12m: 0.2, mom12_1: 0.2, beta: 1, issues: [] } as unknown as Company;
    FIELDS.forEach((f) => c[f] = {});
    return { cs: [c], snapshot: makeSnapshot([c], { sec: 0, prices: 0, paid: 0 }, new Date(generatedAt)) };
}
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => resolve = r);
    return { promise, resolve };
}

test('gate: newer commit survives a slower older run after both observed the same head', async () => {
    const db = memoryPublication();
    const old = generation('2026-10-15', '2026-10-19T10:00:00Z');
    const latest = generation('2026-10-16', '2026-10-19T11:00:00Z');
    const seen = deferred(), proceed = deferred();
    const slow = { ...db, acquire: async () => { seen.resolve(); await proceed.promise; return db.acquire(); } };
    const pending = publishSnapshot(slow, old.snapshot, old.cs, null, null, 1);
    await seen.promise;
    assert.equal((await publishSnapshot(db, latest.snapshot, latest.cs, null, null, 1)).published, true);
    proceed.resolve();
    assert.equal((await pending).reason, 'older_generation');
    assert.equal((await readSnapshot(db))!.asOf, '2026-10-16');
    assert.equal((await readSnapshot(db))!.date, latest.snapshot.date);
});

test('asOf ordering rejects later execution with older or identical price data', async () => {
    const db = memoryPublication();
    const a = generation('2026-10-16', '2026-10-19T10:00:00Z');
    await publishSnapshot(db, a.snapshot, a.cs, null, null, 1);
    for (const asOf of ['2026-10-15', '2026-10-16']) {
        const b = generation(asOf, '2026-10-19T12:00:00Z');
        const head = await db.read<any>(HEAD_KEY);
        assert.equal((await publishSnapshot(db, b.snapshot, b.cs, a.snapshot, head, 1)).reason, 'older_generation');
    }
    assert.equal((await readSnapshot(db))!.date, a.snapshot.date);
});

test('same generation concurrent runs are locked; expired owner cannot commit or release new lease', async () => {
    const db = memoryPublication();
    const a = generation('2026-10-16', now.toISOString());
    const reached = deferred(), proceed = deferred();
    db.beforeCommit(async () => { reached.resolve(); await proceed.promise; });
    const pending = publishSnapshot(db, a.snapshot, a.cs, null, null, 1);
    await reached.promise;
    assert.equal((await publishSnapshot(db, a.snapshot, a.cs, null, null, 1)).reason, 'publication_locked');
    db.expire();
    const newOwner = await db.acquire();
    proceed.resolve();
    assert.equal((await pending).reason, 'lock_lost');
    assert.equal(await db.acquire(), null, 'old finally must not remove the new lease');
    assert.equal(await db.read(HEAD_KEY), null);
    await db.release(newOwner!);
    db.beforeCommit();
    assert.equal((await publishSnapshot(db, a.snapshot, a.cs, null, null, 1)).published, true);
});

test('generation is immutable and missing saves cannot advance head', async () => {
    const db = memoryPublication();
    const a = generation('2026-10-16', now.toISOString());
    const owner = await db.acquire();
    const key = lensKey('moat_compounder', a.snapshot.date);
    assert.equal(await db.save(key, { date: a.snapshot.date, marker: 1 }, owner!), true);
    assert.equal(await db.save(key, { date: a.snapshot.date, marker: 2 }, owner!), false);
    assert.equal(await db.commit(a.snapshot, null, null, owner!), 'write_failed');
    assert.equal(await db.read(HEAD_KEY), null);
    await db.release(owner!);
    const b = generation('2026-10-16', '2026-10-19T13:00:00Z');
    assert.equal((await publishSnapshot(db, b.snapshot, b.cs, null, null, 1)).published, true);
    assert.equal(db.values.size, LENS_IDS.length + 3); // orphan key + complete generation + head
    assert.ok(db.values.has(metaKey(b.snapshot.date)));
});

test('source asOf wins even when execution began earlier than the current generation', async () => {
    const db = memoryPublication();
    const old = generation('2026-10-15', '2026-10-19T11:00:00Z');
    await publishSnapshot(db, old.snapshot, old.cs, null, null, 1);
    const fresh = generation('2026-10-16', '2026-10-19T10:00:00Z');
    const result = await publishSnapshot(db, fresh.snapshot, fresh.cs, old.snapshot, await db.read<any>(HEAD_KEY), 1);
    assert.equal(result.published, true);
    assert.equal((await readSnapshot(db))!.asOf, '2026-10-16');
});
