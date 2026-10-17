/** 예상 변동: 실제 계산·저장본·읽기 API·메모의 마감 경계. 외부 호출/쓰기 없는 격리 시험. */
import assert from 'node:assert/strict';
import { atmStraddleImpliedMove, impliedMoveFields, readImpliedMoveFields, stampOptionMoveFields, copyImpliedMoveGroup, IMPLIED_MOVE_DEF } from '../src/lib/impliedMove';

let now = Date.parse('2026-10-16T15:59:00-04:00');
Date.now = () => now;
globalThis.fetch = async () => { throw new Error('외부 호출 금지'); };
const mem = new Map<string, any>();
let reads = 0;
let onMget: (() => void) | null = null;
const stub = (path: string, exports: any) => {
  const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
stub('../src/services/redisClient', {
  getFromCache: async (key: string) => { reads++; return mem.get(key) ?? null; },
  mgetFromCache: async (keys: string[]) => { reads++; onMget?.(); return keys.map((key) => mem.get(key) ?? null); },
});
stub('../src/services/structureService', {
  structureV2Key: (t: string) => `structure:v2:${t}`,
  structureLastGoodKey: (t: string) => `structure:lastgood:${t}`,
});
const SVC = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const { GET } = require('../src/app/api/options/implied-move/route');
const { NextRequest } = require('next/server');
const OLD = '2026-10-16', NEXT = '2026-10-23';
const legs = (expiry: string, mid: number) => ['call', 'put'].map((type) => ({
  details: { expiration_date: expiry, strike_price: 400, contract_type: type },
  last_quote: { midpoint: mid }, day: { close: 99 },
}));
// 크기 비교는 합성 체인 재현값이다. TSLA 운영 가격을 주장하지 않는다.
const chain = [...legs(OLD, 1.2), ...legs(NEXT, 16)];
const im = (expiry = OLD) => ({ def: IMPLIED_MOVE_DEF, pct: expiry === OLD ? 0.6 : 8, expiry, straddle: expiry === OLD ? 2.4 : 32,
  strike: 400, spot: 400, callPrice: 1.2, putPrice: 1.2, basis: 'eod', asOf: null, chainDate: OLD, session: OLD });
const structure = (expiry = OLD, move: any = im(expiry)) => ({ data: {
  expiration: expiry, options_status: 'OK', availableExpirations: [OLD, NEXT], underlyingPrice: 400, impliedMove: move,
}, timestamp: now });
const flat = { impliedMovePct: 0.6, impliedMoveDef: IMPLIED_MOVE_DEF, impliedMoveExpiry: OLD, impliedMoveBasis: 'eod', impliedMoveSession: OLD };
const putProbe = (ticker: string) => mem.set(`polygon:snapshot:probe:${ticker}`, {
  weeklyExpiry: OLD, exactResults: legs(OLD, 1.2), probeResults: chain, chainDates: { [OLD]: '2026-10-15', [NEXT]: OLD },
});
let passed = 0;
const test = async (name: string, fn: () => any) => { await fn(); passed++; console.log('✓ ' + name); };

(async () => {
  for (const [iso, alive] of [
    ['2026-10-16T15:59:00-04:00', true], ['2026-10-16T16:00:00-04:00', false],
    ['2026-10-16T16:01:00-04:00', false], ['2026-10-16T19:02:00-04:00', false],
    ['2026-10-17T12:00:00-04:00', false], ['2026-10-18T12:00:00-04:00', false],
    ['2026-10-19T08:00:00-04:00', false],
  ] as const) await test(iso + ': 계산·사본·API는 같은 만기 경계', async () => {
    now = Date.parse(iso); mem.clear();
    const result = atmStraddleImpliedMove(chain, 400)!;
    assert.equal(result.expiry, alive ? OLD : NEXT);
    assert.equal(result.pct, alive ? 0.6 : 8);
    assert.equal(atmStraddleImpliedMove(chain, 400, { expiry: OLD })?.pct ?? null, alive ? 0.6 : null);
    assert.equal(atmStraddleImpliedMove(chain, 400, { minExpiry: '2026-10-01' })!.expiry, alive ? OLD : NEXT);
    assert.equal(impliedMoveFields(im() as any).impliedMovePct, alive ? 0.6 : null);
    assert.equal(readImpliedMoveFields(flat).impliedMovePct, alive ? 0.6 : null);
    const rows = [{ realtime: { ...flat, callWall: 420, putFloor: 380, price: 400 } }];
    stampOptionMoveFields(rows); assert.equal(rows[0].realtime.impliedMovePct, alive ? 0.6 : null);
    const store: any = { ...flat }; copyImpliedMoveGroup(store, flat); assert.equal(store.impliedMovePct, alive ? 0.6 : null);
    mem.set('structure:v2:TSLA', structure());
    assert.equal((await SVC.peekStoredStructure('TSLA'))?.expiration ?? null, alive ? OLD : null);
    assert.equal((await SVC.impliedMoveOfStructure('TSLA', structure().data))?.pct ?? null, alive ? 0.6 : null);
    const response = await GET(new NextRequest('https://local.test/api/options/implied-move?tickers=TSLA'));
    if (alive) assert.equal(response.headers.get('cache-control'), 'public, s-maxage=59, stale-while-revalidate=0');
    const api = await response.json();
    const batch = await SVC.readImpliedMoveRows([{ ticker: 'TSLA' }]);
    assert.deepEqual(api.results, batch);
    assert.equal(batch[0].impliedMovePct, alive ? 0.6 : null);
    assert.equal(batch[0].expiry, alive ? OLD : null);
    // 새 판본 도착: 오래된 impliedMove를 새 expiration 라벨로 바꿔 내면 안 된다.
    mem.set('structure:v2:TSLA', structure(NEXT, im()));
    assert.equal((await SVC.readImpliedMoveRows([{ ticker: 'TSLA' }]))[0].impliedMovePct, null);
    mem.set('structure:v2:TSLA', structure(NEXT));
    assert.equal((await SVC.readImpliedMoveRows([{ ticker: 'TSLA' }]))[0].impliedMovePct, 8);
  });
  await test('60초 메모가 금 16:00 경계를 넘으면 지난 0DTE를 재사용하지 않고 probe의 다음 주 체인을 읽는다', async () => {
    now = Date.parse('2026-10-16T15:59:50-04:00'); putProbe('MEMO');
    assert.equal((await SVC.weeklyImpliedMoveFromProbe('MEMO', 400))?.pct, 0.6);
    const before = reads;
    now += 20_000;
    const next = await SVC.weeklyImpliedMoveFromProbe('MEMO', 400);
    assert.equal(next?.expiry, NEXT); assert.equal(next?.pct, 8); assert.ok(reads > before);
    assert.equal(await SVC.weeklyImpliedMoveFromProbe('MEMO', 400, OLD), null);
    assert.equal((await SVC.weeklyImpliedMoveFromProbe('MEMO', 402))?.spot, 402);
  });
  await test('지난 exact 체인뿐이면 새 만기 라벨로 바꾸지 않고 null', async () => {
    mem.set('polygon:snapshot:probe:EMPTY', { weeklyExpiry: OLD, exactResults: legs(OLD, 1.2) });
    assert.equal(await SVC.weeklyImpliedMoveFromProbe('EMPTY', 400), null);
    assert.equal(atmStraddleImpliedMove(legs(OLD, 1.2), 400), null);
  });
  await test('새 lastgood 선택·실적일이 과거여도 현재 유효한 첫 만기부터', async () => {
    mem.set('structure:v2:TSLA', structure());
    mem.set('structure:lastgood:TSLA:auto', structure(NEXT));
    const got = await SVC.readImpliedMoveRows([{ ticker: 'TSLA', after: OLD, timing: 'bmo' }]);
    assert.equal(got[0].expiry, NEXT); assert.equal(got[0].impliedMovePct, 8);
  });
  await test('조기 폐장·휴장 주간도 공용 달력 마감에 맞춘다', () => {
    const early = [...legs('2026-11-27', 1.2), ...legs('2026-12-04', 16)];
    assert.equal(atmStraddleImpliedMove(early, 400, { nowMs: Date.parse('2026-11-27T12:59:00-05:00') })?.expiry, '2026-11-27');
    assert.equal(atmStraddleImpliedMove(early, 400, { nowMs: Date.parse('2026-11-27T13:01:00-05:00') })?.expiry, '2026-12-04');
    const holiday = [...legs('2026-04-02', 1.2), ...legs('2026-04-10', 16)];
    assert.equal(atmStraddleImpliedMove(holiday, 400, { nowMs: Date.parse('2026-04-02T16:01:00-04:00') })?.expiry, '2026-04-10');
  });
  await test('저장본 읽기를 기다리다 마감되면 지난 최신본 대신 다음 만기 lastgood을 선택', async () => {
    now = Date.parse('2026-10-16T15:59:59-04:00');
    mem.set('structure:v2:TSLA', { ...structure(), timestamp: now + 1000 });
    mem.set('structure:lastgood:TSLA:auto', structure(NEXT));
    onMget = () => { now = Date.parse('2026-10-16T16:00:01-04:00'); };
    try {
      const got = await SVC.readImpliedMoveRows([{ ticker: 'TSLA' }]);
      assert.equal(got[0].expiry, NEXT); assert.equal(got[0].impliedMovePct, 8);
    } finally { onMget = null; }
  });
  console.log(`총 ${passed}개 통과`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
