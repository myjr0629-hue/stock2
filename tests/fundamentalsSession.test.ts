import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// [T12 · 감사 10/23 M1] 재무 P/E·시총 — 새 공식 종가 확정 뒤 원천 1회 재조회 + 기준 세션을 값과 함께 저장 + 출구는 기준이 다르면 맞춘다.
// 외부 경계(Redis·DynamoDB·공급사·EOD 리더)만 가짜. 수치는 10/25(토) 운영 실측(NVDA 직접 26.4·5.084T vs unified 26.5·5.114T).
(globalThis as any).fetch = () => { throw new Error('network forbidden'); };
const store = new Map<string, any>();
const writes: string[] = [];
const vendor: string[] = [];
let official: Record<string, { close: number; prevClose: number } | null> = {};
let eodDelay = 0;
let readFails = false;
const stub = (id: string, exports: unknown) => {
  const filename = require.resolve(id);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};
stub('../src/services/redisClient', {
  getFromCache: async (k: string) => { if (readFails) return Promise.reject(new Error('down')); return structuredClone(store.get(k) ?? null); },
  setInCache: async (k: string, v: any) => { writes.push(k); store.set(k, structuredClone(v)); return true; },
  mgetFromCache: async (ks: string[]) => ks.map((k) => structuredClone(store.get(k) ?? null)),
});
stub('../src/services/intrinioClient', {
  peekOfficialSessionClose: async (t: string, d: string, p: string) => {
    if (eodDelay) await new Promise((r) => setTimeout(r, eodDelay));
    return official[`${t}:${d}:${p}`] ?? null;
  },
});
// 직접 재무 API 의 원천 — DynamoDB(손익 버전 1 없음 → 공급사 경로) · 공급사(현재 값)
stub('../src/lib/aws/unifiedCacheProvider', { getUnifiedCache: async () => null });
let ratios: any = { price_to_earnings: 26.4, debt_to_equity: 0.09, return_on_equity: 1.05, price_to_book: 22.1, price_to_sales: 17.1, free_cash_flow: 1.27e11, market_cap: 5084136000000 };
stub('../src/services/massiveClient', {
  fetchMassive: async (url: string) => {
    vendor.push(url);
    if (url.includes('/ratios')) return { results: [ratios] };
    return { results: [] };
  },
});

const FS = require('../src/services/fundamentalsSession') as typeof import('../src/services/fundamentalsSession');
const SWR = require('../src/lib/cache/redisSWR') as typeof import('../src/lib/cache/redisSWR');
const { NextRequest } = require('next/server');
const route = require('../src/app/api/live/fundamentals/route');

const SAT = Date.parse('2026-10-24T19:20:00Z');       // 토 15:20 ET — 마지막 끝난 세션 10/23
const FRI_1630 = Date.parse('2026-10-23T20:30:00Z');  // 금 16:30 ET — 10/23 공식 종가 게시 전
const KEY = 'swr:fundamentals:v4:NVDA';
const OFFICIAL = { 'NVDA:2026-10-23:2026-10-22': { close: 210.96, prevClose: 212.21 } };

async function at<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const real = Date.now;
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = real; }
}
const get = (t = 'NVDA') => route.GET(new NextRequest(`https://x.test/api/live/fundamentals?t=${t}`)).then((r: any) => r.json());
// 운영 swr:fundamentals:v4:NVDA 모양 — 10/23 장중(10/22 종가 기준)에 읽어 저장한 옛 값, 표식 없음
const legacyEntry = (ts: number) => ({ timestamp: ts, data: {
  ticker: 'NVDA', score: 80, grade: 'A', breakdown: { pe: { value: '26.5', score: 12, label: 'P/E' } }, pe: 26.5, de: 0.09, roe: 105, revenueGrowth: 69.2,
  netMargin: 55.6, fcfYield: 2.5, pb: 22.2, ps: 17.2, marketCap: 5114261000000, _source: 'polygon-fallback', _incomeMetricsVersion: 1,
} });

async function main() {
  // ① swrFetch 의 새 선택 인자 isFresh — 없으면 동작 불변(나이로만), false 면 동기 재조회·저장, 재조회 실패면 저장값
  store.clear(); writes.length = 0;
  store.set('swr:k', { timestamp: SAT - 1000, data: { v: 1 } });
  let n = 0;
  const plain = await at(SAT, () => SWR.swrFetch('k', async () => ({ v: ++n }), { ttlSeconds: 60, keyPrefix: 'swr' }));
  assert.equal(plain._cache, 'hit'); assert.equal(n, 0, '기본 동작 불변');
  const forced = await at(SAT, () => SWR.swrFetch('k', async () => ({ v: ++n }), { ttlSeconds: 60, keyPrefix: 'swr', isFresh: () => false }));
  assert.equal(forced._cache, 'revalidated'); assert.deepEqual(forced.data, { v: 1 }); assert.deepEqual(writes, ['swr:k']);
  const failed = await at(SAT, () => SWR.swrFetch('k', async () => { throw new Error('vendor 429'); }, { ttlSeconds: 60, keyPrefix: 'swr', isFresh: () => false }));
  assert.equal(failed._cache, 'hit'); assert.deepEqual(failed.data, { v: 1 }, '재조회 실패 → 저장값 유지');

  // ② 기준 세션 — 그 종목 공식 종가가 적재된 마지막 끝난 세션, 게시 전·못 읽음·상한 초과는 null(강제 재조회 없음)
  official = OFFICIAL;
  assert.equal(await at(SAT, () => FS.confirmedCloseSession('NVDA', SAT)), '2026-10-23');
  official = {};
  assert.equal(await FS.confirmedCloseSession('NVDA', FRI_1630), null, '마감 시각 도달만으로 확정하지 않는다');
  official = OFFICIAL; eodDelay = 300;
  const t0 = Date.now();
  assert.equal(await FS.confirmedCloseSession('NVDA', SAT, 50), null); assert.ok(Date.now() - t0 < 250);
  eodDelay = 0; await new Promise((r) => setTimeout(r, 350));

  // ③ 재조회 간격 — 표식이 다르면 한 번 다시 읽고, 실패해 표식이 그대로여도 10분 안엔 다시 안 두드린다
  FS._resetRecheckForTest();
  const fresh = FS.freshForSession('NVDA', '2026-10-23', SAT);
  assert.equal(fresh({ _sourceCheckedAfter: '2026-10-23' }), true);
  assert.equal(fresh({}), false, '표식 없음 → 다시 읽기');
  assert.equal(FS.freshForSession('NVDA', '2026-10-23', SAT + 5 * 60_000)({}), true, '10분 안 재시도 없음');
  assert.equal(FS.freshForSession('NVDA', '2026-10-23', SAT + 11 * 60_000)({}), false, '10분 뒤 재시도');
  assert.equal(FS.freshForSession('NVDA', null, SAT)({}), true, '기준 세션 없음 → 기존 6시간 규칙만');

  // ④ 직접 재무 API — 6시간 안 옛 값(표식 없음)이어도 10/23 공식 종가 확정 뒤엔 원천 1회 → 새 값 + 표식 저장, 다음 요청은 적중(원천 0)
  FS._resetRecheckForTest();
  store.clear(); writes.length = 0; vendor.length = 0; official = OFFICIAL;
  store.set(KEY, legacyEntry(SAT - 2 * 3600_000));
  const r1 = await at(SAT, () => get());
  assert.equal(r1.pe, 26.4); assert.equal(r1.marketCap, 5084136000000); assert.equal(r1._sourceCheckedAfter, '2026-10-23');
  assert.equal(r1._cache, 'revalidated'); assert.deepEqual(writes, [KEY]);
  assert.equal(store.get(KEY).data._sourceCheckedAfter, '2026-10-23', '기준 세션을 값과 함께 저장');
  const firstVendor = vendor.length; assert.ok(firstVendor > 0);
  const r2 = await at(SAT + 60_000, () => get());
  assert.equal(r2._cache, 'hit'); assert.equal(vendor.length, firstVendor, '같은 세션 두 번째 요청 원천 0'); assert.equal(writes.length, 1);
  //    공식 종가 게시 전(금 16:30) — 옛 값 그대로·원천 0(마감 시각만으로 재조회하지 않는다)
  FS._resetRecheckForTest();
  store.clear(); writes.length = 0; vendor.length = 0; official = {};
  store.set(KEY, legacyEntry(FRI_1630 - 3600_000));
  const r3 = await at(FRI_1630, () => get());
  assert.equal(r3.pe, 26.5); assert.equal(r3._cache, 'hit'); assert.equal(vendor.length, 0); assert.equal(writes.length, 0);
  //    재조회 실패(공급사 오류 → 일시 결과) — 옛 값 유지, 저장 0, 10분 안 재시도 0
  FS._resetRecheckForTest();
  store.clear(); writes.length = 0; vendor.length = 0; official = OFFICIAL;
  store.set(KEY, legacyEntry(SAT - 3600_000));
  const realRatios = ratios; ratios = undefined;
  const fm = require('../src/services/massiveClient');
  const realFetch = fm.fetchMassive;
  fm.fetchMassive = async (url: string) => { vendor.push(url); throw new Error('429'); };
  const r4 = await at(SAT, () => get());
  assert.equal(r4.pe, 26.5, '공급사 실패 결과(NO_DATA)로 옛 값을 덮지 않는다');
  assert.equal(r4._cache, 'hit'); assert.equal(writes.length, 0, '실패 결과 저장 0');
  fm.fetchMassive = realFetch; ratios = realRatios;
  const v4 = vendor.length;
  const r5 = await at(SAT + 2 * 60_000, () => get());
  assert.equal(vendor.length, v4, '실패 뒤 10분 안 원천 재조회 0');
  assert.equal(r5._cache, 'hit');

  // ⑤ unified 출구 — 저장된 직접 API 항목(표식 있음)으로 맞춘다: 앱(직접)·웹(unified) 같은 값, 회사 정보는 unified 사본 그대로
  FS._resetFundamentalsMemoForTest();
  store.clear(); readFails = false;
  store.set(KEY, { timestamp: SAT - 60_000, data: { ...legacyEntry(0).data, pe: 26.4, marketCap: 5084136000000, ps: 17.1, pb: 22.1, score: 80, grade: 'A', breakdown: { pe: { value: '26.4', score: 12, label: 'P/E' } }, _sourceCheckedAfter: '2026-10-23' } });
  const unifiedCopy = { ...legacyEntry(0).data, name: 'NVIDIA Corp', sector: 'Semiconductors', description: 'GPU', exchange: 'XNAS' };
  const aligned: any = await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT);
  assert.notEqual(aligned, unifiedCopy);
  assert.equal(aligned.pe, 26.4); assert.equal(aligned.marketCap, 5084136000000); assert.equal(aligned.ps, 17.1);
  assert.deepEqual(aligned.breakdown, { pe: { value: '26.4', score: 12, label: 'P/E' } }, '점수 내역도 원천 결과 그대로(다시 계산 0)');
  assert.equal(aligned.name, 'NVIDIA Corp'); assert.equal(aligned.description, 'GPU'); assert.equal(aligned.exchange, 'XNAS');
  assert.equal(aligned._sourceCheckedAfter, '2026-10-23');
  assert.equal(unifiedCopy.pe, 26.5, '입력(캐시 객체) 불변');
  assert.equal(await FS.alignFundamentalsToSource(aligned, 'NVDA', SAT), aligned, '이미 같으면 같은 객체');
  //    unified 사본이 더 새 세션 → 그대로 · 원천 항목에 표식 없음(옛 저장본) → 그대로 · 다른 종목 항목 → 그대로
  const newer = { ...unifiedCopy, _sourceCheckedAfter: '2026-10-26' };
  assert.equal(await FS.alignFundamentalsToSource(newer, 'NVDA', SAT), newer);
  FS._resetFundamentalsMemoForTest();
  store.set(KEY, legacyEntry(SAT - 60_000));
  assert.equal(await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT), unifiedCopy, '표식 없는 원천 항목은 쓰지 않는다');
  FS._resetFundamentalsMemoForTest();
  store.set(KEY, { timestamp: SAT, data: { ...legacyEntry(0).data, ticker: 'AMD', _sourceCheckedAfter: '2026-10-23' } });
  assert.equal(await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT), unifiedCopy, '다른 종목 항목 거절');
  //    적자 전환(P/E null)도 원천 그대로 — 옛 양수 P/E 를 남기지 않는다
  FS._resetFundamentalsMemoForTest();
  store.set(KEY, { timestamp: SAT, data: { ...legacyEntry(0).data, pe: null, _sourceCheckedAfter: '2026-10-23' } });
  assert.equal((await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT) as any).pe, null);
  //    읽기 실패 — 그대로, 기억하지 않는다(다음 요청이 다시 읽는다)
  FS._resetFundamentalsMemoForTest();
  readFails = true;
  assert.equal(await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT), unifiedCopy);
  readFails = false;
  store.set(KEY, { timestamp: SAT, data: { ...legacyEntry(0).data, pe: 26.4, _sourceCheckedAfter: '2026-10-23' } });
  assert.equal((await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT + 1000) as any).pe, 26.4, '실패는 메모 안 함');

  // ⑤-b 웹 경로의 원천 재조회 기회 — 메모된 항목 표식이 마지막 끝난 세션과 다를 때만, 종목당 10분에 한 번
  FS._resetFundamentalsMemoForTest(); FS._resetKickForTest();
  assert.equal(FS.shouldKickSourceRecheck('NVDA', SAT), false, '아직 읽지 않았으면 판단 안 함');
  store.set(KEY, legacyEntry(SAT - 60_000));
  await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT);
  assert.equal(FS.shouldKickSourceRecheck('NVDA', SAT), true, '표식 없음 → 한 번');
  assert.equal(FS.shouldKickSourceRecheck('NVDA', SAT + 30_000), false, '10분 안 다시 안 부름');
  FS._resetFundamentalsMemoForTest(); FS._resetKickForTest();
  store.set(KEY, { timestamp: SAT, data: { ...legacyEntry(0).data, _sourceCheckedAfter: '2026-10-23' } });
  await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT);
  assert.equal(FS.shouldKickSourceRecheck('NVDA', SAT), false, '이미 마지막 끝난 세션 표식 → 안 부름');

  // ⑥ 배선 — command/unified 의 모든 출구(jsonResponse)·종목 SSR 이 같은 함수, 직접 API 는 기준 세션·isFresh 를 넘긴다
  const unified = fs.readFileSync(path.join(__dirname, '../src/app/api/command/unified/route.ts'), 'utf8');
  const jr = unified.slice(unified.indexOf('async function jsonResponse('), unified.indexOf('// Helper to reliably get the localhost URL'));
  assert.match(jr, /alignFundamentalsToSource\(/);
  assert.match(jr, /shouldKickSourceRecheck\(symbol\)[\s\S]*after\(async \(\) => \{ await callInternalGet\(getFundamentals/);
  const ssr = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/ticker/page.tsx'), 'utf8');
  assert.match(ssr, /alignFundamentalsToSource\(/);
  const direct = fs.readFileSync(path.join(__dirname, '../src/app/api/live/fundamentals/route.ts'), 'utf8');
  assert.match(direct, /isFresh = fsm\.freshForSession\(ticker, session\)/);
  assert.match(direct, /keyPrefix: 'swr', isFresh \}/);

  console.log('fundamentalsSession: 6 묶음 통과');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
