import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRotationRepair } from '../src/lib/ai/sectorRotationRepair';
import { normalizeSectorRotation, rotationPct } from '../src/lib/ai/sectorRotation';
import { buildHomeSectors } from '../src/lib/app/homeSectors';
import fs from 'node:fs';
import ts from 'typescript';

const reason = { ko: '근거', en: 'reason', ja: '理由' };
const legacy = (change = '+52.2%') => ({ date: '2026-10-16', structured: { sectorRotation: {
  winners: [{ sector: 'M7', change, reason }],
  losers: [{ sector: 'Power Matrix', change: 'Laggard SMR -5.20%', reason }],
} } });
const labels = { m7: 'M7 (Magnificent 7)', power_matrix: 'Power Matrix (Energy & Nuclear)' };
const snapshot = (id: string, date: string, pct: number | null) => ({ sector_id: id, snapshot_date: date,
  data_json: { tickers: [{ change_pct: pct }], sector_summary: { avg_alpha: 52.2 } } });

test('gate: bare legacy alpha is never a return; old/new rows recover actual -1.87% with its own date', async () => {
  let reads = 0;
  const repair = createRotationRepair(labels, async () => {
    reads++;
    return [snapshot('m7', '2026-10-16', -1.87), snapshot('power_matrix', '2026-10-16', -2.02)];
  });
  for (const change of ['+52.2%', '+52.2% avgAlpha', 'Laggard SMR -5.20%']) {
    assert.equal(rotationPct({ sector: 'M7', change, reason }), null);
    const out = await repair(legacy(change));
    const row = out.structured.sectorRotation.winners[0];
    assert.equal(row.changePct, -1.87);
    assert.equal(row.changeDate, '2026-10-16');
    assert.equal(row.avgAlpha, 52.2);
    assert.equal(out.structured.sectorRotation.losers[0].changePct, -2.02);
  }
  assert.equal(reads, 1);
  const numeric = { ...legacy(), structured: normalizeSectorRotation(legacy().structured,
    [{ sector: 'M7', changePct: -1.87, changeDate: '2026-10-16' },
      { sector: 'Power Matrix', changePct: -2.02, changeDate: '2026-10-16' }]) };
  assert.equal((await repair(numeric)).structured.sectorRotation.winners[0].changePct, -1.87);
  assert.equal(reads, 1, 'new numeric payload requires no DB read');
});

test('gate: two GET repairs coalesce into one batch; missing snapshots also cache without 120 reads', async () => {
  for (const empty of [false, true]) {
    let reads = 0;
    const repair = createRotationRepair(labels, async () => {
      reads++;
      return empty ? [] : [snapshot('m7', '2026-10-16', -1.87)];
    });
    await Promise.all([repair(legacy()), repair(legacy())]);
    await repair(legacy());
    assert.equal(reads, 1);
  }
});

test('repair skips empty/newer snapshots, adopts previous actual date and retains it after cache refresh failure', async () => {
  let clock = 0, reads = 0;
  const repair = createRotationRepair(labels, async () => {
    reads++;
    return reads === 1 ? [snapshot('m7', '2026-10-19', 99), snapshot('m7', '2026-10-16', null),
      snapshot('m7', '2026-10-15', -1.87)] : [];
  }, () => clock);
  for (const tick of [0, 60_001]) {
    clock = tick;
    const row = (await repair(legacy())).structured.sectorRotation.winners[0];
    assert.equal(row.changePct, -1.87);
    assert.equal(row.changeDate, '2026-10-15');
  }
  assert.equal(reads, 2);
});

test('normalization binds date to the adopted value, never an empty measurement or report date', () => {
  const previous = { sectorRotation: { winners: [{ sector: 'M7', changePct: -1.87, changeDate: '2026-10-15', reason }] } };
  const empty = [{ sector: 'M7', changePct: null, changeDate: '2026-10-16' }];
  const row = normalizeSectorRotation(legacy().structured, empty, previous).sectorRotation.winners[0];
  assert.equal(row.changePct, -1.87);
  assert.equal(row.changeDate, '2026-10-15');
  const numeric = { sectorRotation: { winners: [{ sector: 'M7', changePct: -2, changeDate: '2026-10-14', reason }] } };
  assert.equal(normalizeSectorRotation(numeric, empty).sectorRotation.winners[0].changeDate, '2026-10-14');
});

function inject(rel: string, exports: any) {
  const path = require.resolve(rel);
  (require as any).cache[path] = { id: path, filename: path, loaded: true, children: [], paths: [], exports };
}

test('batch snapshot fallback performs exactly one query covering all sectors/dates (including empty)', async () => {
  let reads = 0;
  const calls: any[] = [];
  const query: any = {};
  for (const method of ['select', 'in', 'lte', 'gte', 'order']) query[method] = (...args: any[]) => {
    calls.push([method, ...args]); return query;
  };
  query.limit = async () => { reads++; return { data: [], error: null }; };
  inject('../src/lib/supabase/server', { createClient: async () => ({ from: () => query }) });
  const { getRotationSnapshotsThroughDate } = require('../src/lib/supabase/snapshot');
  const repair = createRotationRepair(labels, date => getRotationSnapshotsThroughDate(Object.keys(labels), date));
  await repair(legacy());
  await repair(legacy());
  assert.equal(reads, 1);
  assert.ok(calls.some(c => c[0] === 'in' && c[2].length === 2));
  assert.ok(calls.some(c => c[0] === 'lte' && c[2] === '2026-10-16'));
  assert.ok(calls.some(c => c[0] === 'gte' && c[2] === '2026-09-16'));
});

test('gate: 10/19 POST/CLOSED with supplier 10/16 -2% preserves 10/16 through actual quote route and tile', async () => {
  const RealDate = Date;
  const now = RealDate.parse('2026-10-20T00:30:00Z'); // 10/19 20:30 ET
  class FakeDate extends RealDate {
    constructor(...args: any[]) { super(args.length ? args[0] : now); }
    static now() { return now; }
  }
  (globalThis as any).Date = FakeDate;
  let session = 'post';
  let snap: any = { ticker: 'XLK', day: { c: 98 }, prevDay: { c: 100 },
    _intrinio: { regularDate: '2026-10-16' } };
  let recon: any = {};
  inject('../src/services/massiveClient', { fetchMassive: async () => ({ tickers: [snap] }) });
  inject('../src/services/marketStatusProvider', { getMarketStatusSSOT: async () => ({ session, isHoliday: false }) });
  inject('../src/services/lastSession', { reconstructLastSession: async () => recon });
  inject('../src/services/extendedSessionClose', {
    peekExtendedSessionClosesAndWarm: async (symbols: string[]) => ({ values: symbols.map(() => null) }),
    isTradeInExtSession: () => false,
  });
  inject('../src/lib/hubLiveOverlay', {});
  const { GET } = require('../src/app/api/live/quotes/route');
  try {
    for (const sess of ['post', 'closed']) {
      session = sess;
      const result = await (await GET(new Request('http://localhost/api/live/quotes?symbols=XLK'))).json();
      assert.equal(result.data.XLK.regularDate, '2026-10-16');
      assert.equal(result.data.XLK.changePercent, -2);
      const tiles = buildHomeSectors(result.data);
      assert.equal(tiles[0].pct, -2);
      assert.equal(tiles[0].fallbackDate, '2026-10-16');
      assert.equal(buildHomeSectors({}, tiles)[0].fallbackDate, '2026-10-16');
    }
    // Reconstruction's date outranks the supplier's date and wall clock.
    snap = { ...snap, day: { c: 0 } };
    recon = { XLK: { regClose: 97, prevClose: 100, changePct: -3, regularDate: '2026-10-15', postPrice: 0, postChangePct: 0 } };
    const result = await (await GET(new Request('http://localhost/api/live/quotes?symbols=XLK'))).json();
    assert.equal(result.data.XLK.regularDate, '2026-10-15');
    assert.equal(buildHomeSectors(result.data)[0].fallbackDate, '2026-10-15');
  } finally { (globalThis as any).Date = RealDate; }
});

test('undated regular quote cannot borrow a previous value\'s date', () => {
  const live = buildHomeSectors({ XLK: { price: 99, changePercent: -1, regularDate: '2026-10-19', session: 'regular' } });
  assert.equal(live[0].fallbackDate, undefined, 'live regular session is normalized to reg');
  const previous = buildHomeSectors({ XLK: { price: 99, changePercent: -1, regularDate: '2026-10-15' } });
  const tiles = buildHomeSectors({ XLK: { price: 98, changePercent: -2, session: 'post' } }, previous);
  assert.equal(tiles[0].pct, -1);
  assert.equal(tiles[0].fallbackDate, '2026-10-15');
  assert.equal(tiles[0].riskPct, undefined);
});

test('actual GET serving branch caches one batch for ten sectors across repeated requests, even all-missing', async () => {
  const source = ts.createSourceFile('route.ts', fs.readFileSync('src/app/api/intel/cross-sector-brief/route.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'GET')!;
  const code = ts.transpileModule(fn.getText(source).replace('export async', 'async'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const ten = { ...labels, ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`s${i}`, `Sector ${i}`])) };
  for (const empty of [false, true]) {
    let reads = 0;
    const repair = createRotationRepair(ten, async () => {
      reads++;
      return empty ? [] : [snapshot('m7', '2026-10-16', -1.87)];
    });
    const GET = new Function('NextResponse', 'selectServedBrief', 'getFromCache', 'toServedPayload', 'repairRotationPayload',
      `${code}; return GET;`)(
        require('next/server').NextResponse, async () => legacy(), async () => null, (p: any) => p, repair);
    const responses = await Promise.all([GET(new Request('http://localhost')), GET(new Request('http://localhost'))]);
    for (const response of responses) {
      const out = await response.json();
      assert.equal(out.structured.sectorRotation.winners[0].changePct, empty ? null : -1.87);
    }
    assert.equal(reads, 1);
  }
});

test('last-session reconstruction carries its daily-bar date through the cache; undated old cache is rebuilt', async () => {
  let calls = 0;
  let stored: any = { regClose: 50, prevClose: 100, changePct: -50 }; // obsolete cache without provenance
  inject('../src/services/redisClient', {
    getFromCache: async () => stored,
    setInCache: async (_key: string, value: any) => { stored = value; },
  });
  inject('../src/services/massiveClient', { CACHE_POLICY: { LIVE: {} }, fetchMassive: async () => {
    calls++;
    return { results: [{ c: 98, t: Date.parse('2026-10-15T00:00:00Z') }, { c: 100 }] };
  } });
  inject('../src/services/extendedSessionClose', { getExtendedSessionClose: async () => null });
  delete (require as any).cache[require.resolve('../src/services/lastSession')];
  const { reconstructLastSession } = require('../src/services/lastSession');
  for (let i = 0; i < 2; i++) {
    const result = await reconstructLastSession(['XLK']);
    assert.equal(result.XLK.changePct, -2);
    assert.equal(result.XLK.regularDate, '2026-10-15');
  }
  assert.equal(calls, 1);
});
