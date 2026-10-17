/** 마감 롤오버: 실제 구조 서비스 + 메모리 Redis/가짜 체인만. 외부 I/O 금지. */
import assert from 'node:assert/strict';
import { optionExpirationFloor, isOptionExpiredAt } from '../src/lib/marketCalendar';
import { displayLevels, levelsFromStructure, applyLevelsToRealtime, applyLevelsToUnified, levelCellState } from '../src/lib/optionLevelGate';
import { checkLevels, levelsNotice } from '../src/lib/app/watchlistInsights';
import { ucMoneyAtExit } from '../src/lib/seo/ucMoneyExit';

const RealDate = Date;
let now = RealDate.parse('2026-10-16T15:59:00-04:00');
class ClockDate extends RealDate {
  constructor(...args: any[]) { super(...(args.length ? args : [now]) as [any]); }
  static now() { return now; }
}
globalThis.Date = ClockDate as DateConstructor;
globalThis.fetch = async () => { throw new Error('외부 호출 금지'); };
const mem = new Map<string, any>();
const calls: string[] = [];
let vendorEmpty = false;
let missingExact = false;
const oldExp = '2026-10-16', nextExp = '2026-10-23';
const snapshot = (expiration = oldExp) => ({
  ticker: 'MSTR', levelsProducer: 'structureService', options_status: 'OK', expiration,
  chainDate: '2026-10-15', underlyingPrice: 100, maxPain: 100,
  levels: { callWall: 110, putFloor: 90, pinZone: 100 }, gammaFlipLevel: 100,
  structure: { strikes: [90, 100, 110], callsOI: [1, 3, 10], putsOI: [10, 3, 1], gexCum: [-1, 1, 3] },
});
const chain = (expiration: string) => [90, 100, 110].flatMap((strike) => ['call', 'put'].map((type) => ({
  details: { expiration_date: expiration, strike_price: strike, contract_type: type },
  open_interest: type === 'call' ? strike : 200 - strike,
  greeks: { gamma: 0.02, delta: 0.5, implied_volatility: 0.4 },
  day: { close: 1, volume: 10 }, last_quote: { midpoint: 1 },
  _intrinio: { date: '2026-10-15' },
})));
const stub = (path: string, exports: any) => {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
stub('../src/services/redisClient', {
  getFromCache: async (key: string) => mem.get(key) ?? null,
  mgetFromCache: async (keys: string[]) => keys.map((key) => mem.get(key) ?? null),
  setInCache: async (key: string, value: any) => { mem.set(key, value); return true; },
});
stub('../src/services/massiveClient', {
  CACHE_POLICY: { LIVE: 'LIVE' },
  fetchMassive: async (url: string) => {
    calls.push(url);
    if (url === '/v1/marketstatus/upcoming') return [];
    if (url.includes('expiration_date.gte=')) return vendorEmpty
      ? { results: [], vendorFailed: true }
      : { results: [...chain(oldExp), ...chain(nextExp)], expirationsRequested: [oldExp, nextExp] };
    const exp = /expiration_date=(\d{4}-\d{2}-\d{2})/.exec(url)?.[1];
    if (exp) return vendorEmpty || missingExact ? { results: [], vendorFailed: true } : { results: chain(exp) };
    throw new Error('예상하지 않은 호출: ' + url);
  },
});
const SS = require('../src/services/structureService') as typeof import('../src/services/structureService');
const { GET } = require('../src/app/api/live/options/structure/route') as typeof import('../src/app/api/live/options/structure/route');
const { NextRequest } = require('next/server');
let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log('✓ ' + name); };
const at = (iso: string) => { now = RealDate.parse(iso); calls.length = 0; mem.clear(); };
const putOld = () => mem.set('structure:v2:MSTR', { data: snapshot(), timestamp: now - 30_000 });
const quiet = async <T>(fn: () => Promise<T>) => {
  const log = console.log, warn = console.warn, error = console.error;
  console.log = console.warn = console.error = () => {};
  try { return await fn(); } finally { console.log = log; console.warn = warn; console.error = error; }
};

(async () => {
  for (const [iso, floor, alive] of [
    ['2026-10-16T15:59:00-04:00', oldExp, true],
    ['2026-10-16T16:00:00-04:00', '2026-10-19', false],
    ['2026-10-16T16:01:00-04:00', '2026-10-19', false],
    ['2026-10-16T19:02:00-04:00', '2026-10-19', false],
    ['2026-10-17T12:00:00-04:00', '2026-10-19', false],
    ['2026-10-18T12:00:00-04:00', '2026-10-19', false],
    ['2026-10-19T08:00:00-04:00', '2026-10-19', false],
  ] as const) await test(`${iso}: 캐시·목록·새 체인·대기 표시`, async () => {
    at(iso); vendorEmpty = false; putOld();
    assert.equal(optionExpirationFloor(now), floor);
    assert.equal(SS.getNextTradingDayET(), floor);
    const normalized = SS.normalizeExpirationsForToday({ availableExpirations: [oldExp, nextExp] });
    assert.deepEqual(normalized.availableExpirations, alive ? [oldExp, nextExp] : [nextExp]);
    const info = await SS.inspectStoredVersions(['MSTR']);
    assert.equal(info!.get('MSTR')!.usable, alive);
    const peek = await SS.peekStructureLevelsDetailed(['MSTR'], [], undefined, { refresh: false });
    const pending = peek.levels.get('MSTR')!;
    assert.deepEqual(peek.noSnapshot, alive ? [] : ['MSTR']);
    assert.equal(pending.maxPain, alive ? 100 : null);
    if (!alive) {
      assert.equal(pending.levelsExpiration, null);
      assert.equal(pending.levelsAsOf, now - 30_000);
      assert.equal(pending.levelsChainDate, '2026-10-15');
      assert.equal(levelCellState(pending.maxPain, pending, 'maxPain'), 'none');
      const rt: any = { price: 100 }; applyLevelsToRealtime(rt, pending);
      assert.equal(levelsNotice(checkLevels({ ...rt, hasLevelsMeta: true }, now)), 'wait');
      assert.equal(rt.levelsAsOf, now - 30_000);
    }
    // TTL 72시간인 수집기 프로브도 같은 경계를 지나야 한다.
    mem.set('polygon:snapshot:probe:MSTR', { _ts: now, weeklyExpiry: oldExp, expirations: [oldExp, nextExp], exactResults: chain(oldExp), chainDate: '2026-10-15' });
    const data: any = await quiet(() => SS.getStructureData('MSTR', null, { price: 100, prevClose: 99 }));
    assert.equal(data.expiration, alive ? oldExp : nextExp);
    assert.equal(data.options_status, 'OK');
    if (!alive) {
      assert.ok(calls.some((url) => url.includes('expiration_date.gte=2026-10-19')));
      assert.ok(calls.some((url) => url.includes('expiration_date=2026-10-23')));
      assert.ok(!calls.some((url) => url.includes('expiration_date=2026-10-16')));
      assert.ok(!data.availableExpirations.includes(oldExp));
    }
  });
  await test('공급사 다음 체인 없음: 과거 exp 요청·명시 캐시도 PENDING, 날짜 라벨만 바꾸지 않음', async () => {
    at('2026-10-16T19:02:00-04:00'); vendorEmpty = true;
    mem.set(SS.structureRedisKey('MSTR:' + oldExp), { data: snapshot(), timestamp: now });
    const data: any = await quiet(() => SS.getStructureData('MSTR', oldExp, { price: 100, prevClose: 99 }));
    assert.equal(data.options_status, 'PENDING'); assert.equal(data.maxPain, null);
    assert.equal(data.expirationFallbackFrom, oldExp);
    assert.ok(!isOptionExpiredAt(data.expiration, now));
    assert.ok(!calls.some((url) => url.includes('expiration_date=2026-10-16')));
  });
  await test('목록에 다음 주간 만기는 있으나 해당 체인이 비었음: PENDING, 지난 판본으로 계산/덮어쓰기 금지', async () => {
    at('2026-10-16T19:02:00-04:00'); vendorEmpty = false; missingExact = true; putOld();
    try {
      const data: any = await quiet(() => SS.getStructureData('MSTR', null, { price: 100, prevClose: 99 }));
      assert.equal(data.expiration, nextExp); assert.equal(data.options_status, 'PENDING');
      assert.equal(data.maxPain, null); assert.equal(data.contractsFetched, 0);
      assert.equal(mem.get('structure:v2:MSTR').data.expiration, oldExp);
      const peek = await SS.peekStructureLevelsDetailed(['MSTR'], [], undefined, { refresh: false });
      assert.equal(peek.levels.get('MSTR')!.levelsSource, null);
      assert.equal(peek.levels.get('MSTR')!.maxPain, null);
    } finally { missingExact = false; }
  });
  await test('다음 체인이 비어 있을 때 직접 호출 3번 연속: 벤더 목록 조회는 한 번(1분 기억), 1분 뒤 다시 조회', async () => {
    at('2026-10-16T19:30:00-04:00'); vendorEmpty = false; missingExact = true; putOld();
    try {
      const lists = () => calls.filter((url) => url.includes('expiration_date.gte=')).length;
      const exacts = () => calls.filter((url) => /expiration_date=\d{4}-\d{2}-\d{2}/.test(url) && !url.includes('gte=')).length;
      for (let i = 0; i < 3; i++) {
        const data: any = await quiet(() => SS.getStructureData('MSTR', null, { price: 100, prevClose: 99 }));
        assert.equal(data.options_status, 'PENDING'); assert.equal(data.maxPain, null);
      }
      assert.equal(lists(), 1, '목록 조회 1회'); assert.equal(exacts(), 1, '정확 만기 조회 1회');
      now += 61_000; putOld();
      await quiet(() => SS.getStructureData('MSTR', null, { price: 100, prevClose: 99 }));
      assert.equal(lists(), 2, '1분 뒤에는 다시 조회');
    } finally { missingExact = false; }
  });
  await test('마감 전 읽고 마감 뒤 응답: 공용 출구·통합/SEO 자기 구조 폴백도 지난 값 재사용 금지', () => {
    at('2026-10-16T16:01:00-04:00');
    const lv = { ...levelsFromStructure(snapshot())!, levelsAsOf: now - 120_000 };
    const d = displayLevels(lv, 100, 'boundary');
    assert.equal(d.maxPain, null); assert.equal(d.levelsExpiration, null);
    assert.equal(d.levelsAsOf, now - 120_000);
    const out = applyLevelsToUnified({ structure: snapshot(), volatility: { flipLevel: 100 } }, null);
    assert.equal(out.structure.expiration, null); assert.equal(out.structure.maxPain, null);
    assert.equal(out.volatility.flipLevel, null);
    const uc = ucMoneyAtExit({ maxPain: 999, callWall: 999, putFloor: 999 }, {
      now, todayET: oldExp, lastClosed: oldExp, regularNow: false, generatedAt: null, eod: null, levels: d,
    });
    assert.equal(uc.maxPain, null);
  });
  await test('구조 API 출구: 마감을 넘긴 OK 캐시가 응답 중 돌아와도 PENDING', async () => {
    const realGet = SS.getStructureData;
    (SS as any).getStructureData = async () => ({ ...snapshot(), levelsAsOf: now - 120_000 });
    try {
      const res = await GET(new NextRequest('http://local.test/api/live/options/structure?t=MSTR'));
      const j = await res.json();
      assert.equal(j.options_status, 'PENDING'); assert.equal(j.expiration, null);
      assert.equal(j.maxPain, null); assert.equal(j.levelsAsOf, now - 120_000);
      assert.ok(!j.availableExpirations?.includes(oldExp));
    } finally { (SS as any).getStructureData = realGet; }
  });
  await test('조기 폐장·휴장·서머타임: 기존 계약 판정과 같은 경계', () => {
    for (const [iso, want] of [
      ['2026-11-27T12:59:00-05:00', '2026-11-27'],
      ['2026-11-27T13:00:00-05:00', '2026-11-30'],
      ['2026-12-24T13:00:00-05:00', '2026-12-28'],
      ['2026-09-04T16:01:00-04:00', '2026-09-08'],
      ['2026-11-01T08:00:00-05:00', '2026-11-02'],
    ]) assert.equal(optionExpirationFloor(RealDate.parse(iso)), want);
  });
  console.log(`총 ${passed}개 통과`);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { globalThis.Date = RealDate; });
