/**
 * «발표 전 예상 변동폭» 고정값 (2026-11-18 — NVDA 11/17 장후: 캘린더 ±8.6·알림 ±8.4·앱 ±8.2 가 시각마다 달랐다)
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/frozenExpected.test.ts
 *
 * 지키는 것:
 *   1. 고정 전(기준 세션 마감 전) = 지금 실시간 값 그대로(고정값을 담지 않는다)
 *   2. 고정 뒤(발표 뒤 포함) = 고정값 하나 — 발표 알림이 보낸 숫자(Upstash ev/exp → 고정 기록으로 적어 둠)가 묶음 칸(마감 뒤 다시 읽은 값)을 이긴다
 *   3. 고정 기록이 있으면 그 값(Upstash·묶음 무시) · src pack 기록은 알림 값으로 올린다
 *   4. 예비(고정 기록·알림 없음): 실적 반응 기록의 마감 관측 → 묶음 칸 중 «발표 전 세션» 값만 · 발표 뒤 값(장전 발표일 세션·마감 뒤 새로 읽은 발표일 칸)은 절대 아님
 *   5. 마감 직전 묶음 칸 → 고정 기록(src pack) 한 번 · 이미 있으면 안 씀 · 마감 뒤/2시간 넘은 묶음은 안 씀
 *   6. 채점표·종목 페이지 채점 이력 — 같은 정의(주간·월간 ATM)면 고정값으로(범위 판정도 다시), event-split 기록은 그대로
 *   7. 캘린더 완료 행 — 채점 전이면 고정값, 채점 뒤면 채점값 · 종목 페이지 «발표 전 예상»도 고정값
 *   8. 발표 알림 크론 — 뜬 값·고정 값을 고정 기록으로(keepExpected)
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

const ET = (day: string, hh: number, mm = 0): number => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d, hh + 5, mm); };
const D = '2026-11-17';

// ── 저장소 가짜(EC2 캐시 · Upstash) ──
const kv = new Map<string, unknown>();
const writes: string[] = [];
let mgetCalls = 0;
const redisPath = require.resolve('../src/services/redisClient');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: {
  mgetFromCache: async (keys: string[]) => { mgetCalls++; return keys.map((k) => kv.get(k) ?? null); },
  mgetFromCacheStrict: async (keys: string[]) => { mgetCalls++; return keys.map((k) => kv.get(k) ?? null); },
  getFromCache: async (k: string) => kv.get(k) ?? null,
  setInCache: async (k: string, v: unknown) => { writes.push(k); kv.set(k, JSON.parse(JSON.stringify(v))); return true; },
} } as unknown as NodeModule;
void Module;

import { freezeMsOf, isFrozenTime, frozenExpectedKey, frozenFromPrevPack, frozenFromPackFallback, applyFrozenToRecord, rowImpliedFromFrozen, type FrozenExpected } from '../src/lib/earnings/frozenExpected';
import type { ImpliedPack } from '../src/lib/earnings/earningsImplied';
import { FLASH_KEYS, runEarningsFlash, type FlashDeps, type FlashReaders } from '../src/lib/signals/earningsFlash';
import { aggregateScorecard } from '../src/lib/earnings/earningsScorecard';
import { attachReportedImplied } from '../src/lib/earnings/calendarReportedImplied';
import { buildEarningsPageView, emptySnapshot } from '../src/lib/seo/earningsPage';
import { FakeStore, FakeKv, FakeSender, IOS_TOKEN } from './_signalsFixtures';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const svc = require('../src/services/frozenExpectedService') as typeof import('../src/services/frozenExpectedService');

const upstash = new Map<string, unknown>();
let upCalls = 0;
svc._setFrozenUpstash({ mget: async (...keys: string[]) => { upCalls++; return keys.map((k) => upstash.get(k) ?? null); } });
const reset = () => { kv.clear(); upstash.clear(); writes.length = 0; upCalls = 0; mgetCalls = 0; svc._setFrozenUpstash({ mget: async (...keys: string[]) => { upCalls++; return keys.map((k) => upstash.get(k) ?? null); } }); };

const NV = { ticker: 'NVDA', date: D, hour: 'amc' };
const DIS = { ticker: 'DIS', date: D, hour: 'bmo' };
/** 마감 뒤 다시 만든 묶음 — NVDA 발표일 마감 호가 8.2 · DIS 발표일(장전 발표 뒤) 세션 2.4 */
const postPack: ImpliedPack = { v: 1, at: ET(D, 17, 30), day: D, cells: {
  'NVDA|2026-11-17': { p: 8.2, e: '2026-11-18', b: 'eod', s: D, r: null, method: 'weekly', f: '2026-11-18' },
  'DIS|2026-11-17': { p: 2.4, e: '2026-11-20', b: 'eod', s: D, r: null, method: 'monthly', f: '2026-11-20' },
  'ZZZ|2026-11-17': { p: 5.5, e: '2026-11-20', b: 'live', s: D, r: null, method: 'monthly', f: '2026-11-20' },
} };
const ev = { v: 1, ticker: 'NVDA', date: D, hour: 'amc', expectedPct: 8.4, expectedSrc: 'snap', movePct: 2.4376, base: 180, price: 184.4, priceAtMs: ET(D, 16, 45), decidedAt: ET(D, 16, 50) };
const exp = { pct: 8.4, expiry: '2026-11-18', session: D, asOf: ET(D, 15, 44), capturedAt: ET(D, 15, 45), src: 'snap', basis: 'live' };

let passed = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

t('고정 시각 = 기준 세션 정규장 마감 — 장후 발표일 16:00 ET · 장전 직전 거래일 16:00 ET · 시각 미정은 없음', () => {
  assert.equal(freezeMsOf(D, 'amc'), ET(D, 16, 0));
  assert.equal(freezeMsOf(D, 'bmo'), ET('2026-11-16', 16, 0));
  assert.equal(freezeMsOf('2026-11-16', 'bmo'), ET('2026-11-13', 16, 0), '월요일 장전 = 금요일 마감');
  assert.equal(freezeMsOf(D, ''), null);
  assert.equal(isFrozenTime(NV, ET(D, 15, 59)), false);
  assert.equal(isFrozenTime(NV, ET(D, 16, 0)), true);
});

t('발표 전(고정 전) — 고정값을 담지 않는다(화면은 실시간 값 그대로) · 저장소도 읽지 않는다', async () => {
  reset();
  upstash.set(FLASH_KEYS.exp('NVDA', D), JSON.stringify(exp));
  const m = await svc.readFrozenExpected([NV], ET(D, 15, 50), { pack: postPack, persist: true });
  assert.equal(m.size, 0); assert.equal(upCalls, 0); assert.equal(mgetCalls, 0); assert.equal(writes.length, 0);
});

t('발표 뒤 — 알림이 보낸 ±8.4(ev) 가 마감 뒤 묶음 칸 ±8.2 를 이기고, 고정 기록으로 한 번 적힌다 · 다음 읽기는 기록에서 끝난다', async () => {
  reset();
  upstash.set(FLASH_KEYS.ev('NVDA', D), JSON.stringify(ev));
  upstash.set(FLASH_KEYS.exp('NVDA', D), JSON.stringify(exp));
  for (const at of [ET(D, 16, 45), ET(D, 17, 30), ET(D, 19, 0)]) {
    const m = await svc.readFrozenExpected([NV], at, { pack: postPack, persist: true });
    const f = m.get('NVDA|2026-11-17')!;
    assert.equal(f.pct, 8.4); assert.equal(f.expiry, '2026-11-18'); assert.equal(f.session, D); assert.equal(f.src, 'flash');
  }
  assert.deepEqual(writes, [frozenExpectedKey('NVDA', D)], '한 번만 적는다');
  assert.equal(upCalls, 1, '기록이 생긴 뒤엔 Upstash 를 다시 읽지 않는다');
  // 알림 키가 만료돼도(3~5일 뒤) 같은 숫자
  upstash.clear();
  const later = await svc.readFrozenExpected([NV], ET('2026-11-24', 9, 0), { pack: null, persist: true });
  assert.equal(later.get('NVDA|2026-11-17')?.pct, 8.4);
  // 화면 칸 모양 — 앱 캘린더와 같은 필드 + frozen 표식
  assert.deepEqual(rowImpliedFromFrozen(later.get('NVDA|2026-11-17')!), { pct: 8.4, expiry: '2026-11-18', basis: 'live', session: D, frozen: true });
});

t('뜬 값(exp)이 만료돼 고정 이벤트(ev)만 있으면 — 숫자는 알림 값, 만기는 그 발표의 첫 만기(묶음 f)로 채워 적는다', async () => {
  reset();
  upstash.set(FLASH_KEYS.ev('NVDA', D), JSON.stringify(ev));
  const m = await svc.readFrozenExpected([NV], ET(D, 18, 0), { pack: postPack, persist: true });
  assert.equal(m.get('NVDA|2026-11-17')?.pct, 8.4); assert.equal(m.get('NVDA|2026-11-17')?.expiry, '2026-11-18');
  assert.equal((kv.get(frozenExpectedKey('NVDA', D)) as FrozenExpected).expiry, '2026-11-18');
});

t('고정 기록이 pack 이면 알림 값으로 올린다 · flash 기록이면 Upstash 를 보지 않는다', async () => {
  reset();
  kv.set(frozenExpectedKey('NVDA', D), { v: 1, ticker: 'NVDA', date: D, hour: 'amc', pct: 8.5, expiry: '2026-11-18', session: D, basis: 'live', src: 'pack', capturedAt: ET(D, 15, 55) });
  upstash.set(FLASH_KEYS.ev('NVDA', D), JSON.stringify(ev));
  const m = await svc.readFrozenExpected([NV], ET(D, 17, 0), { persist: true });
  assert.equal(m.get('NVDA|2026-11-17')?.pct, 8.4);
  assert.equal((kv.get(frozenExpectedKey('NVDA', D)) as FrozenExpected).src, 'flash');
  const calls = upCalls;
  await svc.readFrozenExpected([NV], ET(D, 17, 10), { persist: true });
  assert.equal(upCalls, calls);
});

t('예비 — 알림·고정 기록이 없으면 실적 반응 기록의 마감 관측 · 그것도 없으면 «발표 전 세션» 묶음 칸만, 발표 뒤 값은 절대 아님', async () => {
  reset();
  kv.set('earnings:actuals:v1:DIS:2026-11-17', { v: 1, ticker: 'DIS', date: D, hour: 'bmo', at: 1,
    expected: { pct: 6.6, method: 'monthly', straddlePct: 6.6, expiry: '2026-11-20', session: '2026-11-16', basis: 'eod', strike: 119, straddle: 7.8, spot: 118.7, capturedAt: ET('2026-11-16', 17, 0), src: 'page' }, actual: null });
  const m = await svc.readFrozenExpected([DIS, NV, { ticker: 'ZZZ', date: D, hour: 'amc' }], ET(D, 18, 30), { pack: postPack, persist: true });
  assert.equal(m.get('DIS|2026-11-17')?.pct, 6.6, 'DIS: 묶음의 발표 뒤 2.4 가 아니라 직전 거래일 마감 관측 6.6');
  assert.equal(m.get('DIS|2026-11-17')?.src, 'actuals');
  assert.equal(m.get('NVDA|2026-11-17')?.pct, 8.2, 'NVDA(공지 16:20 > 옵션 마감 16:15): 발표일 마감 호가는 발표 전');
  assert.equal(m.get('NVDA|2026-11-17')?.src, 'pack');
  assert.equal(m.has('ZZZ|2026-11-17'), false, '시각 모르는 장후 — 마감 뒤 새로 읽은 발표일 칸은 발표 전이라 단정 못 함');
  assert.equal(writes.length, 0, '예비 값은 적어 두지 않는다');
  // 장전 발표 — 발표일 세션 칸(발표 뒤)은 버리고, 직전 거래일 칸은 받는다
  assert.equal(frozenFromPackFallback(DIS, postPack), null);
  const prevSession: ImpliedPack = { ...postPack, cells: { 'DIS|2026-11-17': { p: 6.5, e: '2026-11-20', b: 'eod', s: '2026-11-16', r: null, f: '2026-11-20' } } };
  assert.equal(frozenFromPackFallback(DIS, prevSession)?.pct, 6.5);
  // 장후 · 시각 미정 — 마감 전에 만든 묶음이 새로 읽은 칸은 발표 전
  const preClose: ImpliedPack = { ...postPack, at: ET(D, 15, 55) };
  assert.equal(frozenFromPackFallback({ ticker: 'ZZZ', date: D, hour: 'amc' }, preClose)?.pct, 5.5);
  assert.equal(frozenFromPackFallback({ ticker: 'ZZZ', date: D, hour: 'amc' }, { ...preClose, cells: { 'ZZZ|2026-11-17': { ...postPack.cells['ZZZ|2026-11-17'], k: 1 } } }), null, '이어 쓴 칸(k)은 언제 읽었는지 모른다');
});

t('마감 직전 묶음 칸 → 고정 기록(src pack) 한 번 · 이미 있으면 안 씀 · 마감 뒤·2시간 넘은 묶음은 안 씀', async () => {
  reset();
  const prev: ImpliedPack = { v: 1, at: ET(D, 15, 56), day: D, cells: { 'ZZZ|2026-11-17': { p: 5.4, e: '2026-11-20', b: 'live', s: D, r: null, method: 'monthly', f: '2026-11-20' } } };
  const rows = [{ ticker: 'ZZZ', date: D, hour: 'amc' }];
  assert.equal(await svc.persistPackFreezes(rows, prev, ET(D, 15, 58)), 0, '고정 전');
  assert.equal(await svc.persistPackFreezes(rows, prev, ET(D, 16, 3)), 1);
  assert.equal((kv.get(frozenExpectedKey('ZZZ', D)) as FrozenExpected).pct, 5.4);
  assert.equal(await svc.persistPackFreezes(rows, { ...prev, cells: { 'ZZZ|2026-11-17': { ...prev.cells['ZZZ|2026-11-17'], p: 9.9 } } }, ET(D, 16, 8)), 0, '이미 있음');
  assert.equal(frozenFromPrevPack(rows[0], { ...prev, at: ET(D, 16, 1) }), null, '마감 뒤 묶음');
  assert.equal(frozenFromPrevPack(rows[0], { ...prev, at: ET(D, 13, 30) }), null, '2시간 넘음');
  const m = await svc.readFrozenExpected(rows, ET(D, 17, 0), { pack: postPack });
  assert.equal(m.get('ZZZ|2026-11-17')?.pct, 5.4, '마감 뒤 묶음 칸(5.5)이 아니라 고정 기록');
});

t('채점표 — 같은 정의(주간 ATM)면 고정값 ±8.4 로 채점(범위 판정도 다시) · event-split 기록은 그대로 · 마감 관측이 없던 기록은 고정값으로', () => {
  const f: FrozenExpected = { v: 1, ticker: 'NVDA', date: D, hour: 'amc', pct: 8.4, expiry: '2026-11-18', session: D, basis: 'live', src: 'flash', capturedAt: ET(D, 15, 45) };
  const rec = { v: 1, ticker: 'NVDA', date: D, hour: 'amc', at: ET('2026-11-18', 16, 40),
    expected: { pct: 8.2, method: 'weekly', straddlePct: 8.2, expiry: '2026-11-18', session: D, basis: 'eod', strike: 180, straddle: 14.76, spot: 180, capturedAt: ET(D, 16, 40), src: 'page' },
    actual: { pct: -8.3, baseDate: D, baseClose: 180, reactDate: '2026-11-18', reactClose: 165.06, src: 'intrinio-daily', check: 'fmp', at: ET('2026-11-18', 16, 35) } };
  const now = ET('2026-11-18', 18, 0);
  const before = aggregateScorecard('2026-11-16', [rec], now).rows[0];
  assert.equal(before.expectedPct, 8.2); assert.equal(before.beyond, true);
  const after = aggregateScorecard('2026-11-16', [applyFrozenToRecord(rec, f)], now).rows[0];
  assert.equal(after.expectedPct, 8.4); assert.equal(after.beyond, false, '|−8.3| ≤ 8.4 → 범위 안');
  assert.equal(after.basis.expectedExpiry, '2026-11-18');
  const split = { ...rec, expected: { ...rec.expected, pct: 7.7, method: 'event-split', straddlePct: 8.6 } };
  assert.equal(applyFrozenToRecord(split, f), split);
  assert.equal(applyFrozenToRecord(rec, { ...f, session: '2026-11-16' }), rec, '세션이 다르면 입히지 않는다');
  const noExp = { ...rec, expected: null };
  assert.equal(aggregateScorecard('2026-11-16', [applyFrozenToRecord(noExp, f)], now).rows[0]?.expectedPct, 8.4);
});

t('캘린더 완료 행 — 채점 전이면 고정값, 채점 뒤면 채점값 · 고정값이 없으면 null(예전 그대로)', () => {
  const f = rowImpliedFromFrozen({ v: 1, ticker: 'NVDA', date: D, hour: 'amc', pct: 8.4, expiry: '2026-11-18', session: D, basis: 'live', src: 'flash', capturedAt: ET(D, 15, 45) });
  const row = { ticker: 'NVDA', date: D, hour: 'amc', implied: null };
  const now = ET(D, 19, 0);
  assert.equal(attachReportedImplied([row], [], now, new Map([['NVDA|2026-11-17', f]]))[0].implied?.pct, 8.4);
  assert.equal(attachReportedImplied([row], [], now)[0].implied, null);
  const score = { ticker: 'NVDA', date: D, hour: 'amc' as const, expectedPct: 8.4, actualPct: -8.3, beyond: false, check: 'fmp' as const,
    basis: { expectedSession: D, expectedExpiry: '2026-11-18', expectedSource: 'page' as const, expectedCapturedAt: '', baseDate: D, reactDate: '2026-11-18', actualCalculatedAt: '' } };
  const graded = attachReportedImplied([row], [score], ET('2026-11-18', 18, 0), new Map([['NVDA|2026-11-17', f]]))[0].implied;
  assert.equal(graded?.reported, true); assert.equal(graded?.pct, 8.4); assert.equal(graded?.within, true);
});

t('종목 페이지 — 발표 뒤 «발표 전 예상» = 고정값(마감 뒤 묶음 8.2 아님) · 고정 전엔 묶음 값', () => {
  const nowAfter = ET(D, 17, 30);
  const snap = { ...emptySnapshot(nowAfter), calendarOk: true, recordsOk: true, packAt: postPack.at, packDay: D,
    next: { NVDA: [{ ticker: 'NVDA', date: D, hour: 'amc', etTime: '16:20', dateStatus: 'confirmed' as const }] }, cells: postPack.cells,
    frozen: { 'NVDA|2026-11-17': { v: 1 as const, ticker: 'NVDA', date: D, hour: 'amc' as const, pct: 8.4, expiry: '2026-11-18', session: D, basis: 'live' as const, src: 'flash' as const, capturedAt: ET(D, 15, 45) } } };
  const v = buildEarningsPageView('NVDA', snap as any, nowAfter);
  assert.equal(v.implied?.pct, 8.4); assert.equal(v.implied?.expiry, '2026-11-18'); assert.equal(v.next?.phase, 'done');
  const pre = buildEarningsPageView('NVDA', { ...snap, frozen: {} } as any, ET(D, 15, 0));
  assert.equal(pre.implied?.pct, 8.2, '고정 전 = 묶음(실시간) 값 그대로');
});

t('발표 알림 크론 — 뜬 값(15:45)과 고정에 쓴 값을 고정 기록으로 넘긴다(keepExpected) · 미리보기는 안 넘긴다', async () => {
  const kept: Array<[string, number]> = [];
  const store = new FakeStore(), fkv = new FakeKv(), sender = new FakeSender();
  const readers: FlashReaders = {
    async implied(entries) { return new Map(entries.map((e) => [e.ticker, { impliedMovePct: 8.44, expiry: '2026-11-18', asOf: ET(D, 15, 44), session: D, basis: 'live' }])); },
    async actuals() { return new Map(); },
    async quote() { return { session: 'POST', regularDate: D, regularClose: 180, prevClose: 178, regularTradeMs: ET(D, 16, 0), extendedPrice: 184.4, extendedTradeMs: ET(D, 16, 45), stale: false }; },
  };
  const deps: FlashDeps = { store, kv: fkv, readers, sender, reserve: async (_k, n) => n, log: () => {}, keepExpected: async (e, s) => { kept.push([e.ticker, s.pct]); } };
  store.addDevice(IOS_TOKEN, { watchlist: { t: ['NVDA'] }, tz: 'Asia/Seoul' });
  const list = [{ ticker: 'NVDA', date: D, hour: 'amc' as const, etTime: '16:20', sourceKind: 'company-pr' as const, sourceUrl: 'https://example.com', announcedOn: '2026-10-28', verifiedAt: '2026-11-09T00:00:00Z', quote: '' }];
  await runEarningsFlash(deps, { now: ET(D, 15, 45), kind: 'preview', list: list as any, envMode: null, signalEnvMode: null });
  assert.deepEqual(kept, [], '미리보기');
  await runEarningsFlash(deps, { now: ET(D, 15, 45), kind: 'cron', list: list as any, envMode: null, signalEnvMode: null });
  assert.deepEqual(kept, [['NVDA', 8.4]]);
  await runEarningsFlash(deps, { now: ET(D, 16, 50), kind: 'cron', list: list as any, envMode: null, signalEnvMode: null });
  assert.deepEqual(kept, [['NVDA', 8.4], ['NVDA', 8.4]], '고정 때 같은 숫자');
  assert.match(sender.items[0]?.body ?? '', /±8\.4%/);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}`); console.error(e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} 통과`);
})();
