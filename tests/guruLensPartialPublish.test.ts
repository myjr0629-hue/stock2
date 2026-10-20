/** Partial publication regressions. Memory stores and synthetic facts only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { guruCompany } from './helpers/guruCompany';
import { memoryPublication } from './helpers/guruPublication';
import { LENS_IDS } from '../src/lib/guruLens/types';
import { evaluateLenses } from '../src/lib/guruLens/rules';
import { publicationHolds } from '../src/lib/guruLens/guards';
import { HEAD_KEY, lensKey, metaKey, makeSnapshot, preparePublication, publishSnapshot, readSnapshot } from '../src/lib/guruLens/pipeline';

const now = new Date('2026-10-19T12:00:00Z');
const calls = { sec: 0, prices: 0, paid: 0 };
const companies = (n = 495) => Array.from({ length: n }, (_, i) => ({ ...guruCompany(), ticker: `T${i}` }));

test('exactly 20% excluded publishes; whole tickers leave every lens and ranks are recalculated', async () => {
    const cs = companies();
    cs.slice(0, 99).forEach((c) => { c.currency = 'KRW'; c.ni[2025] = 3e14; });
    const candidate = makeSnapshot(cs, calls, now);
    const db = memoryPublication();
    const result = await publishSnapshot(db, candidate, cs, null, null);
    assert.equal(result.published, true);
    assert.equal(result.universeCount, 495);
    assert.equal(result.includedCount, 396);
    assert.equal(result.excluded.length, 99, 'count tickers rather than anomaly records');
    assert.ok(result.excluded.every((e) => e.reasons.length >= 2));
    const saved = (await readSnapshot(db))!;
    assert.ok(saved);
    assert.deepEqual(saved.lenses, evaluateLenses(cs.slice(99)));
    for (const id of LENS_IDS) {
        assert.equal(saved.lenses[id].rows.length, 396);
        assert.ok(saved.lenses[id].rows.every((r) => !result.excluded.some((e) => e.ticker === r.ticker)));
        assert.equal(result.passCounts[id], saved.lenses[id].passCount);
    }
    assert.equal(candidate.lenses.moat_compounder.rows.length, 495, 'candidate is not mutated');
});

test('more than 20% holds before acquiring/saving and preserves the previous publication', async () => {
    const cs = companies(), db = memoryPublication();
    const old = makeSnapshot(cs, calls, new Date('2026-10-18T12:00:00Z'));
    old.asOf = '2026-10-15';
    assert.equal((await publishSnapshot(db, old, cs, null, null)).published, true);
    const head = await db.read<any>(HEAD_KEY), writes = db.writes.length;
    cs.slice(0, 100).forEach((c) => { c.currency = 'KRW'; });
    const candidate = makeSnapshot(cs, calls, now);
    for (const previous of [null, old]) {
        const result = await publishSnapshot(db, candidate, cs, previous, previous ? head : null);
        assert.equal(result.reason, 'held');
        assert.ok(result.holds.some((h) => h.code === 'exclusion_ratio'));
        assert.equal(result.excluded.length, 100);
    }
    assert.equal(db.writes.length, writes);
    assert.deepEqual(await db.read(HEAD_KEY), head);
    assert.equal((await readSnapshot(db))!.date, old.date);
});

test('pass-count safeguard compares the filtered result with the last publication', async () => {
    const cs = companies(20), db = memoryPublication();
    const previous = makeSnapshot(cs, calls, new Date('2026-10-18T12:00:00Z'));
    previous.asOf = '2026-10-15';
    assert.equal((await publishSnapshot(db, previous, cs, null, null, 20)).published, true);
    cs.slice(0, 9).forEach((c) => { c.price = 1e6; });
    cs[19].currency = 'KRW';
    const candidate = makeSnapshot(cs, calls, now);
    assert.ok(!publicationHolds(cs, candidate, previous, 20).some((h) => h.code === 'pass_count' && h.detail.startsWith('wonderful_fair:')));
    const result = await publishSnapshot(db, candidate, cs, previous, await db.read(HEAD_KEY), 20);
    assert.equal(result.reason, 'held');
    assert.equal(result.includedCount, 19);
    assert.ok(result.holds.some((h) => h.code === 'pass_count' && h.detail === 'wonderful_fair: 20 → 10'));
    assert.equal((await readSnapshot(db))!.date, previous.date);
});

test('price/CIK coverage is a per-ticker exclusion, so 6% missing does not hold everything', async () => {
    const cs = companies(100);
    cs.slice(0, 6).forEach((c) => { c.price = 0; c.priceDate = ''; c.cik = 0; });
    const { snapshot, holds } = preparePublication(makeSnapshot(cs, calls, now), cs, null, 100);
    assert.deepEqual(holds, []);
    assert.equal(snapshot.includedCount, 94);
    assert.equal(snapshot.asOf, '2026-10-16');
    assert.ok(snapshot.excluded!.every((e) => e.reasons.some((r) => r.code === 'coverage')));
});

test('partial readers reject mismatched counts, duplicate rows and excluded ticker leakage; legacy fallback remains readable', async () => {
    const cs = companies(10), db = memoryPublication();
    const old = makeSnapshot(cs, calls, new Date('2026-10-18T12:00:00Z'));
    old.asOf = '2026-10-15';
    delete old.excluded;
    delete old.includedCount;
    const { lenses, ...meta } = old;
    db.values.set(metaKey(old.date), meta);
    LENS_IDS.forEach((id) => db.values.set(lensKey(id, old.date), { date: old.date, result: lenses[id] }));
    db.values.set(HEAD_KEY, { current: old.date, previous: null, asOf: old.asOf });
    assert.equal((await readSnapshot(db))!.date, old.date);
    cs[0].currency = 'KRW';
    const next = makeSnapshot(cs, calls, now);
    assert.equal((await publishSnapshot(db, next, cs, old, await db.read(HEAD_KEY), 10)).published, true);
    const partial = (await readSnapshot(db))!;
    const originalMeta = structuredClone(db.values.get(metaKey(next.date))) as any;
    for (const edit of [
        (m: any) => { m.includedCount = 10; },
        (m: any) => { m.excluded[0].reasons = []; },
    ]) {
        const bad = structuredClone(originalMeta);
        edit(bad);
        db.values.set(metaKey(next.date), bad);
        assert.equal((await readSnapshot(db))!.date, old.date);
    }
    db.values.set(metaKey(next.date), originalMeta);
    const key = lensKey('moat_compounder', next.date), originalLens = structuredClone(db.values.get(key)) as any;
    for (const ticker of [cs[0].ticker, partial.lenses.moat_compounder.rows[1].ticker]) {
        const bad = structuredClone(originalLens);
        bad.result.rows[0].ticker = ticker;
        db.values.set(key, bad);
        assert.equal((await readSnapshot(db))!.date, old.date);
    }
    db.values.set(key, originalLens);
    assert.equal((await readSnapshot(db))!.date, next.date);
});
