import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRotationRepair } from '../src/lib/ai/sectorRotationRepair';
import * as rotation from '../src/lib/ai/sectorRotation';
import * as home from '../src/lib/app/homeSectors';
import { compareSourceDate, pickFreshest } from '../src/lib/sourceFreshness';
const lambda = require('../scripts/lambda-cross-sector/sectorRotation');

const reason = { ko: '근거', en: 'reason', ja: '理由' };
const oldReason = { ko: '하락', en: 'fell', ja: '下落' };
const labels = { m7: 'M7', power_matrix: 'Power Matrix' };
const normalizers = [rotation.normalizeSectorRotation, lambda.normalizeSectorRotation] as const;

test('gate 3 repro A: repair with an older DB snapshot keeps the newer numeric row (mixed numeric + missing)', async () => {
  let reads = 0;
  const repair = createRotationRepair(labels, async () => {
    reads++;
    return [{ sector_id: 'm7', snapshot_date: '2026-10-16', data_json: { tickers: [{ change_pct: -2 }] } },
      { sector_id: 'power_matrix', snapshot_date: '2026-10-16', data_json: { tickers: [{ change_pct: -1.5 }] } }];
  });
  const payload = { date: '2026-10-19', structured: { sectorRotation: {
    winners: [{ sector: 'M7', changePct: 3, changeDate: '2026-10-19', reason }],
    losers: [{ sector: 'Power Matrix', changePct: null, reason }],
  } } };
  const out = await repair(payload);
  const w = out.structured.sectorRotation.winners[0];
  assert.equal(w.changePct, 3);
  assert.equal(w.changeDate, '2026-10-19');
  assert.equal(w.change, '+3.00%');
  assert.deepEqual(w.reason, reason);
  // The missing row is still repaired, with the snapshot's own date.
  const l = out.structured.sectorRotation.losers[0];
  assert.equal(l.changePct, -1.5);
  assert.equal(l.changeDate, '2026-10-16');
  assert.equal(reads, 1);
});

test('gate 3 repro B: client remembers 10/19 +3%, older 10/16 -2% response never overwrites it (app + web + Lambda)', () => {
  for (const normalize of normalizers) {
    const previous = { sectorRotation: { winners: [{ sector: 'M7', changePct: 3, changeDate: '2026-10-19', avgAlpha: 40, reason }] } };
    const incoming = { sectorRotation: { winners: [{ sector: 'M7', changePct: -2, changeDate: '2026-10-16', avgAlpha: 12, reason: oldReason }] } };
    const row = normalize(incoming, [], previous).sectorRotation.winners[0];
    assert.equal(row.changePct, 3);
    assert.equal(row.changeDate, '2026-10-19');
    // Value, date, alpha and reason move together.
    assert.equal(row.avgAlpha, 40);
    assert.deepEqual(row.reason, reason);
    // A newer incoming value does replace the remembered one, again as a bundle.
    const newer = { sectorRotation: { winners: [{ sector: 'M7', changePct: 1, changeDate: '2026-10-20', avgAlpha: 5, reason: oldReason }] } };
    const next = normalize(newer, [], previous).sectorRotation.winners[0];
    assert.deepEqual([next.changePct, next.changeDate, next.avgAlpha, next.reason], [1, '2026-10-20', 5, oldReason]);
  }
});

test('rotation: same-date tie keeps the current response; undated never beats dated; storage + state both count', () => {
  const at = (pct: number, changeDate?: string) => ({ sectorRotation: { winners: [{ sector: 'M7', changePct: pct, changeDate, reason }] } });
  assert.equal(rotation.normalizeSectorRotation(at(1, '2026-10-19'), [], at(9, '2026-10-19')).sectorRotation.winners[0].changePct, 1);
  assert.equal(rotation.normalizeSectorRotation(at(1), [], at(9, '2026-10-16')).sectorRotation.winners[0].changePct, 9);
  assert.equal(rotation.normalizeSectorRotation(at(1, '2026-10-16'), [], at(9)).sectorRotation.winners[0].changePct, 1);
  const history = rotation.rotationHistory(at(2, '2026-10-16'), null, at(3, '2026-10-19'));
  const row = rotation.normalizeSectorRotation(at(-2, '2026-10-15'), [], history).sectorRotation.winners[0];
  assert.deepEqual([row.changePct, row.changeDate], [3, '2026-10-19']);
  // Ground producers still ignore model-invented numbers and use the newest measurement.
  const ground = rotation.normalizeSectorRotation(at(999, '2026-10-20'), [
    { sector: 'M7', changePct: -1, changeDate: '2026-10-16' }, { sector: 'M7', changePct: 0.5, changeDate: '2026-10-19' }], undefined, true);
  assert.deepEqual([ground.sectorRotation.winners[0].changePct, ground.sectorRotation.winners[0].changeDate], [0.5, '2026-10-19']);
});

test('home tiles: storage merge keeps the newer remembered regular value in either order', () => {
  const latest = home.buildHomeSectors({ XLK: { price: 103, previousClose: 100, changePercent: 3, regularDate: '2026-10-19', session: 'regular' } }, [], '', '2026-10-19');
  const older = home.buildHomeSectors({ XLK: { price: 98, changePercent: -2, regularDate: '2026-10-16' } }, [], '', '2026-10-19');
  for (const [a, b] of [[latest, older], [older, latest]]) {
    const tiles = home.buildHomeSectors({}, home.freshestHomeSectors(a, b), '', '2026-10-19');
    assert.deepEqual([tiles[0].pct, tiles[0].fallbackDate, tiles[0].riskPct], [3, '2026-10-19', undefined]);
  }
  assert.ok(home.buildHomeSectors({}, home.freshestHomeSectors([], [])).every(s => s.pct === null));
});

test('shared ordering: dated > undated, later > earlier, ties keep first', () => {
  assert.ok(compareSourceDate('2026-10-19', '2026-10-16') > 0);
  assert.ok(compareSourceDate('2026-10-16', undefined) > 0);
  assert.ok(compareSourceDate('garbage', '2026-01-01') < 0);
  assert.equal(compareSourceDate(undefined, null), 0);
  assert.equal(pickFreshest([{ d: '2026-10-16', v: 1 }, { d: '2026-10-16', v: 2 }], c => c.d)?.v, 1);
  assert.equal(lambda.compareSourceDate('2026-10-19', '2026-10-16'), 1);
});

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

test('gate 4 repro 1: a snapshot never pairs its number with another value\'s reason', async () => {
  const fell = { ko: '2% 하락', en: 'fell 2%', ja: '2%下落' };
  const repair = createRotationRepair(labels, async () => [
    { sector_id: 'm7', snapshot_date: '2026-10-19', data_json: { tickers: [{ change_pct: 3 }] } },
    { sector_id: 'power_matrix', snapshot_date: '2026-10-19', data_json: { tickers: [{ change_pct: -1 }] } }]);
  const out = await repair({ date: '2026-10-19', structured: { sectorRotation: {
    winners: [{ sector: 'M7', changePct: -2, changeDate: '2026-10-16', reason: fell }],
    losers: [{ sector: 'Power Matrix', change: 'Laggard SMR -5.20%', reason }],
  } } });
  const w = out.structured.sectorRotation.winners[0];
  assert.deepEqual([w.changePct, w.changeDate, w.reason], [-2, '2026-10-16', fell]);
  const l = out.structured.sectorRotation.losers[0];
  assert.deepEqual([l.changePct, l.changeDate], [-1, '2026-10-19']);
});

test('gate 5 repro: a repaired legacy row never keeps the legacy reason next to the snapshot value', async () => {
  const fell = { ko: '2% 하락', en: 'fell 2%', ja: '2%下落' };
  for (const snapDate of ['2026-10-16', '2026-10-19']) {
    const repair = createRotationRepair(labels, async () => [
      { sector_id: 'm7', snapshot_date: snapDate, data_json: { tickers: [{ change_pct: 3 }] } }]);
    const out = await repair({ date: '2026-10-19', structured: { sectorRotation: {
      winners: [{ sector: 'M7', change: '-2%', reason: fell }], losers: [] } } });
    const w = out.structured.sectorRotation.winners[0];
    assert.deepEqual([w.changePct, w.changeDate], [3, snapDate]);
    assert.notDeepEqual(w.reason, fell);
    assert.deepEqual(w.reason, { ko: '', en: '', ja: '' });
  }
  // Producer (ground) keeps the reason the model wrote from the same measurements.
  const ground = rotation.normalizeSectorRotation({ sectorRotation: { winners: [{ sector: 'M7', changePct: 999, reason }], losers: [] } },
    [{ sector: 'M7', changePct: 3, changeDate: '2026-10-19' }], undefined, true);
  assert.deepEqual(ground.sectorRotation.winners[0].reason, reason);
});

test('gate 4 repro 2: M7 10/19 +3% → response without M7 → 10/16 -2% keeps +3% (memory, storage, reload)', () => {
  for (const remember of [rotation.rememberRotation, lambda.rememberRotation]) {
    for (const mode of ['memory+storage', 'memory only', 'reload from storage']) {
      const store = mode === 'memory only' ? null : memStore();
      const memory = { current: null as any };
      const pm = { sector: 'Power Matrix', changePct: -1, changeDate: '2026-10-19', reason };
      let shown: any = remember({ sectorRotation: { winners: [{ sector: 'M7', changePct: 3, changeDate: '2026-10-19', reason }], losers: [] } }, memory, undefined, store);
      shown = remember({ sectorRotation: { winners: [pm], losers: [] } }, memory, shown, store);
      if (mode === 'reload from storage') { memory.current = null; shown = undefined; }
      shown = remember({ sectorRotation: { winners: [{ sector: 'M7', changePct: -2, changeDate: '2026-10-16', reason: oldReason }], losers: [] } }, memory, shown, store);
      const w = shown.sectorRotation.winners[0];
      assert.deepEqual([w.changePct, w.changeDate, w.reason], [3, '2026-10-19', reason], mode);
    }
  }
});

// Seeded PRNG so a failure is reproducible.
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}
function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const DATES = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19'];

test('property: any arrival order converges on the newest value; shown date never moves backwards', async () => {
  const rand = rng(20261019);
  for (let iter = 0; iter < 300; iter++) {
    const dates = shuffle(DATES, rand).slice(0, 2 + Math.floor(rand() * 4));
    const pcts = dates.map(() => Math.round((rand() * 10 - 5) * 100) / 100);
    const newest = dates.reduce((m, d) => (d > m ? d : m));
    const expect = pcts[dates.indexOf(newest)];
    const order = shuffle(dates.map((d, i) => i), rand);
    // Some arrivals are legacy/missing rows; they must never erase or regress what was shown.
    const legacyAt = new Set(order.filter(() => rand() < 0.3));

    // (1) Client chain (app Intel + web brief exit, and the Lambda parity copy). Some responses omit M7 entirely,
    //     some carry a legacy row; storage may be absent or survive a reload (memory reset).
    const omitAt = new Set(order.filter(() => rand() < 0.25));
    for (const remember of [rotation.rememberRotation, lambda.rememberRotation]) {
      const store = rand() < 0.5 ? memStore() : null;
      const memory = { current: null as any };
      let shown: any;
      let shownDate = '';
      for (const i of order) {
        const row = legacyAt.has(i) ? { sector: 'M7', change: '+52.2% avgAlpha', reason }
          : { sector: 'M7', changePct: pcts[i], changeDate: dates[i], reason: { ...reason, en: dates[i] } };
        const other = { sector: 'Other', changePct: 1, changeDate: dates[i], reason };
        if (store && rand() < 0.2) { memory.current = null; shown = undefined; } // reload: only storage survives
        shown = remember({ sectorRotation: { winners: omitAt.has(i) ? [other] : [row, other], losers: [] } }, memory, shown, store);
        if (omitAt.has(i)) continue;
        const w = shown.sectorRotation.winners[0];
        if (w.changePct != null) {
          assert.ok((w.changeDate ?? '') >= shownDate, `date regressed iter=${iter}`);
          shownDate = w.changeDate;
          // Bundle: the value is the one measured on the shown date, with its own reason.
          assert.equal(w.changePct, pcts[dates.indexOf(w.changeDate)]);
          assert.equal(w.reason.en, w.changeDate);
        }
      }
      const delivered = order.filter(i => !legacyAt.has(i) && !omitAt.has(i));
      if (delivered.length) {
        const best = delivered.reduce((m, i) => (dates[i] > dates[m] ? i : m));
        const final = remember({ sectorRotation: { winners: [{ sector: 'M7', change: 'legacy', reason }], losers: [] } }, memory, shown, store).sectorRotation.winners[0];
        assert.equal(final.changePct, pcts[best], `iter=${iter}`);
        assert.equal(final.changeDate, dates[best]);
      }
    }

    // (2) Server repair: snapshot rows arrive in any order. A missing row gets the newest snapshot (≤ report date);
    //     a row with its own value keeps value+date+reason together (a snapshot never borrows another value's reason).
    const reportDate = '2026-10-19';
    const embeddedIdx = order[0];
    const own = { ...reason, en: 'own' };
    const repair = createRotationRepair({ m7: 'M7', pm: 'PM' }, async () => shuffle(dates.flatMap((d, i) => [
      { sector_id: 'm7', snapshot_date: d, data_json: { tickers: [{ change_pct: pcts[i] }] } },
      { sector_id: 'pm', snapshot_date: d, data_json: { tickers: [{ change_pct: pcts[i] }] } }]), rand));
    const out = await repair({ date: reportDate, structured: { sectorRotation: {
      winners: [{ sector: 'M7', changePct: pcts[embeddedIdx], changeDate: dates[embeddedIdx], reason: own }],
      losers: [{ sector: 'PM', change: '+52.2% avgAlpha', reason }],
    } } });
    const kept = out.structured.sectorRotation.winners[0];
    assert.deepEqual([kept.changePct, kept.changeDate, kept.reason], [pcts[embeddedIdx], dates[embeddedIdx], own], `repair iter=${iter}`);
    const filled = out.structured.sectorRotation.losers[0];
    assert.deepEqual([filled.changePct, filled.changeDate], [expect, newest], `repair fill iter=${iter}`);

    // (3) Home tile chain: quotes (and outages) arrive in any order.
    let tiles: home.HomeSector[] = [];
    let tileDate = '';
    for (const i of order) {
      const quote = legacyAt.has(i) ? {} : { XLK: { price: 100 + pcts[i], changePercent: pcts[i], regularDate: dates[i], session: 'closed' } };
      tiles = home.buildHomeSectors(quote, tiles, 'closed', reportDate);
      const t = tiles[0];
      if (t.pct != null) {
        assert.ok((t.regularDate ?? '') >= tileDate, `tile date regressed iter=${iter}`);
        tileDate = t.regularDate!;
        assert.equal(t.pct, pcts[dates.indexOf(t.regularDate!)]);
        if (t.regularDate !== reportDate) assert.equal(t.fallbackDate, t.regularDate);
      }
    }
    const delivered = order.filter(i => !legacyAt.has(i));
    if (delivered.length) {
      const best = delivered.reduce((m, i) => (dates[i] > dates[m] ? i : m));
      assert.equal(tiles[0].pct, pcts[best], `tile iter=${iter}`);
    } else {
      assert.equal(tiles[0].pct, null);
    }
  }
});
