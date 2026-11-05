/**
 * [T43 2026-11-06] 마감 직후 예상폭 깜빡임(14.0 → 12.5 → 13.9) 재현 — 실제 구조 서비스·실제 문(GET /api/options/implied-move)
 *   + 메모리 Redis·가짜 수집기 체인·고정 시계. 외부 I/O 금지.
 *
 * [사고] 11/5(목) AMC 직후(16:1x ET) AXON 11/6 만기: basis live·세션 11/5 로 14.0 → 12.5 → 13.9. 12.5 는 11/4 EOD 스트래들.
 *   실시간 그릭스가 일부 계약에만 실린 수집기 체인에서 ATM 두 다리가 전일 EOD mark 로 채워졌는데, 체인 수준 «realtime» 표식이
 *   그 다리를 실시간으로 만들었다(lib/impliedMove.contractQuoteSource 로 수리). 다리를 바로 읽어도 그 계산은 «11/4 종가»라
 *   판본이 당일 실시간 값에서 전일 값으로 되돌아간다 — 판본 저장 때 같은 만기·당일 실시간 값을 유지한다(holdSessionLiveMove).
 */
import assert from 'node:assert/strict';

const RealDate = Date;
let now = RealDate.parse('2026-11-05T16:05:00-05:00');
class ClockDate extends RealDate {
  constructor(...args: any[]) { super(...(args.length ? args : [now]) as [any]); }
  static now() { return now; }
}
globalThis.Date = ClockDate as DateConstructor;
globalThis.fetch = async () => { throw new Error('외부 호출 금지'); };
const mem = new Map<string, any>();
const writes: string[] = [];
const stub = (path: string, exports: any) => {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
stub('../src/services/redisClient', {
  getFromCache: async (key: string) => structuredClone(mem.get(key) ?? null),
  mgetFromCache: async (keys: string[]) => keys.map((key) => structuredClone(mem.get(key) ?? null)),
  mgetFromCacheStrict: async (keys: string[]) => keys.map((key) => structuredClone(mem.get(key) ?? null)),
  setInCache: async (key: string, value: any) => { writes.push(key); mem.set(key, structuredClone(value)); return true; },
});
stub('../src/services/massiveClient', {
  CACHE_POLICY: { LIVE: 'LIVE' },
  fetchMassive: async (url: string) => {
    if (url === '/v1/marketstatus/upcoming') return [];
    throw new Error('예상하지 않은 공급사 호출: ' + url);
  },
});
stub('../src/services/eodSnapshot', { readEodCloses: async () => null });

const SS = require('../src/services/structureService') as typeof import('../src/services/structureService');
const { GET } = require('../src/app/api/options/implied-move/route') as typeof import('../src/app/api/options/implied-move/route');
const { NextRequest } = require('next/server');

const T = 'AXON';
const EXP = '2026-11-06';
const SPOT = 382.56;
type Leg = { mid: number; rt: boolean };
/** 수집기 슬림 계약 모양(scripts/lambda-flow-harvest slimContract — 계약별 실시간 표식 없음, ivSourceDate/ivObservedAt 만) */
const contract = (strike: number, type: 'call' | 'put', leg: Leg, eodDate: string) => ({
  details: { strike_price: strike, contract_type: type, expiration_date: EXP },
  open_interest: 100 + strike % 7,
  eodDate,
  implied_volatility: 0.9,
  ivSourceDate: leg.rt ? null : eodDate,
  ivObservedAt: leg.rt ? new RealDate(now).toISOString() : null,
  greeks: { gamma: 0.01, implied_volatility: 0.9 },
  day: { volume: 10, close: leg.mid },
  last_quote: { midpoint: leg.mid },
});
/** ATM(382.5) 와 이웃 행사가 — legs[strike] = [콜, 풋] */
const harvest = (legs: Record<number, [Leg, Leg]>, chainDate: string) => {
  const rows = Object.entries(legs).flatMap(([k, [c, p]]) => [contract(Number(k), 'call', c, chainDate), contract(Number(k), 'put', p, chainDate)]);
  mem.set(`polygon:snapshot:probe:${T}`, {
    exactResults: rows, probeResults: rows, expirations: [EXP, '2026-11-13'], weeklyExpiry: EXP,
    greeksSource: 'realtime', greeksRealtimeCount: rows.filter((r) => r.ivObservedAt).length,
    chainDate, chainDates: { [EXP]: chainDate }, _ts: now, _ticker: T, _source: 'lambda-flow-harvest',
  });
};
const live = (mid: number): Leg => ({ mid, rt: true });
const eod = (mid: number): Leg => ({ mid, rt: false });
const quiet = async <X>(fn: () => Promise<X>) => {
  const log = console.log, warn = console.warn, error = console.error, info = console.info;
  console.log = console.warn = console.error = console.info = () => {};
  try { return await fn(); } finally { console.log = log; console.warn = warn; console.error = error; console.info = info; }
};
const compute = () => quiet(() => SS.getStructureData(T, null, { price: SPOT, prevClose: 424.18 }, true, {}));
const stored = () => mem.get(SS.structureV2Key(T))?.data?.impliedMove;
const api = async () => {
  const res = await quiet(() => GET(new NextRequest(`https://x.test/api/options/implied-move?tickers=${T}&after=2026-11-05&timing=amc`)));
  return (await res.json()).results[0];
};
let passed = 0;
const test = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log('  ✓ ' + name); };
const at = (iso: string) => { now = RealDate.parse(iso); };

(async () => {
  const T1605 = RealDate.parse('2026-11-05T16:05:00-05:00');
  await test('16:05 ET 실시간 체인 → 판본 14.0 live(세션 11/5·asOf 수집 시각) · 문도 같은 값', async () => {
    at('2026-11-05T16:05:00-05:00');
    harvest({ 380: [live(30.4), live(23.4)], 382.5: [live(28.9), live(24.65)], 385: [live(27.5), live(25.9)] }, '2026-11-04');
    await compute();
    const im = stored();
    assert.equal(im.pct, 14.0);
    assert.equal(im.basis, 'live');
    assert.equal(im.session, '2026-11-05');
    assert.equal(im.asOf, T1605);
    const r = await api();
    assert.deepEqual([r.impliedMovePct, r.basis, r.session, r.expiry, r.asOf], [14.0, 'live', '2026-11-05', EXP, T1605]);
  });

  await test('16:10 ET 재수집: ATM 두 다리 실시간 빠짐(11/4 EOD mark 25.5+22.3=12.5) → live 12.5 를 내지 않고 판본은 14.0 유지', async () => {
    at('2026-11-05T16:10:00-05:00');
    harvest({ 380: [eod(27.1), eod(20.9)], 382.5: [eod(25.5), eod(22.3)], 385: [eod(24.1), eod(23.6)] }, '2026-11-04');
    const data: any = await compute();
    // 응답(구조 문)도 판본과 같은 값 — 12.5 가 «live·11/5»로 나가지 않는다
    assert.equal(data.impliedMove.pct, 14.0);
    const im = stored();
    assert.deepEqual([im.pct, im.basis, im.session, im.asOf], [14.0, 'live', '2026-11-05', T1605]);
    const r = await api();
    assert.deepEqual([r.impliedMovePct, r.basis, r.session, r.asOf], [14.0, 'live', '2026-11-05', T1605]);
    assert.notEqual(r.impliedMovePct, 12.5);
  });

  await test('16:11 ET 한 다리만 실시간(콜 live·풋 11/4 EOD) — 섞어서 live 로 내지 않는다(판본 유지)', async () => {
    at('2026-11-05T16:11:00-05:00');
    harvest({ 380: [live(30.0), eod(20.9)], 382.5: [live(28.6), eod(22.3)], 385: [eod(24.1), live(26.0)] }, '2026-11-04');
    await compute();
    assert.deepEqual([stored().pct, stored().basis, stored().asOf], [14.0, 'live', T1605]);
    const r = await api();
    assert.equal(r.impliedMovePct, 14.0);
  });

  await test('16:12 ET 실시간 복귀(13.9) → 같은 세션의 더 새 관측으로 갱신', async () => {
    at('2026-11-05T16:12:00-05:00');
    harvest({ 380: [live(30.2), live(23.1)], 382.5: [live(28.7), live(24.45)], 385: [live(27.3), live(25.6)] }, '2026-11-04');
    await compute();
    const r = await api();
    assert.deepEqual([r.impliedMovePct, r.basis, r.session, r.asOf], [13.9, 'live', '2026-11-05', RealDate.parse('2026-11-05T16:12:00-05:00')]);
  });

  await test('캐시 만료(수집기 체인 없음) 뒤 재계산·문 — 값이 전 세션으로 되돌아가지 않는다', async () => {
    at('2026-11-05T16:40:00-05:00');
    mem.delete(`polygon:snapshot:probe:${T}`);
    harvest({ 380: [eod(27.1), eod(20.9)], 382.5: [eod(25.5), eod(22.3)], 385: [eod(24.1), eod(23.6)] }, '2026-11-04');
    await compute();
    const r = await api();
    assert.equal(r.session, '2026-11-05');
    assert.equal(r.impliedMovePct, 13.9);
  });

  await test('11/5 세션 EOD 체인이 나오면 그 세션 EOD 로(basis eod·세션 11/5)', async () => {
    at('2026-11-05T18:30:00-05:00');
    harvest({ 380: [eod(30.3), eod(23.0)], 382.5: [eod(28.9), eod(24.55)], 385: [eod(27.4), eod(25.7)] }, '2026-11-05');
    await compute();
    const r = await api();
    assert.deepEqual([r.impliedMovePct, r.basis, r.session, r.asOf], [14.0, 'eod', '2026-11-05', null]);
  });

  await test('다음 세션(11/6 장중) 실시간 → 새 세션 값', async () => {
    at('2026-11-06T10:00:00-05:00');
    harvest({ 380: [live(12.0), live(10.0)], 382.5: [live(11.0), live(11.2)], 385: [live(10.1), live(12.5)] }, '2026-11-05');
    await compute();
    const r = await quiet(async () => (await (await GET(new NextRequest(`https://x.test/api/options/implied-move?tickers=${T}`))).json()).results[0]);
    assert.deepEqual([r.basis, r.session], ['live', '2026-11-06']);
    assert.equal(r.impliedMovePct, 5.8);
  });

  // 문은 읽기 전용 — 판본·잠금 외 새 키를 쓰지 않는다(새 Redis 키 0)
  assert.ok(writes.every((k) => !/implied|lastlive/i.test(k)), writes.join(','));
  console.log(`\n${passed} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
