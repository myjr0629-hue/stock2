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
  // ② 기준 세션 — 그 종목 공식 종가가 적재된 마지막 끝난 세션, 게시 전·못 읽음·상한 초과는 null(강제 재조회 없음)
  official = OFFICIAL;
  assert.equal(await at(SAT, () => FS.confirmedCloseSession('NVDA', SAT)), '2026-10-23');
  official = {};
  assert.equal(await FS.confirmedCloseSession('NVDA', FRI_1630), null, '마감 시각 도달만으로 확정하지 않는다');
  official = OFFICIAL; eodDelay = 300;
  const t0 = Date.now();
  assert.equal(await FS.confirmedCloseSession('NVDA', SAT, 50), null); assert.ok(Date.now() - t0 < 250);
  eodDelay = 0; await new Promise((r) => setTimeout(r, 350));

  // ③ 직접 재무 API — 재조회 주기·저장 규칙은 예전 그대로(6시간 안 적중·원천 0), 공급사에서 «방금» 읽은 정상 결과에만 기준 세션 표식
  store.clear(); writes.length = 0; vendor.length = 0; official = OFFICIAL;
  store.set(KEY, legacyEntry(SAT - 2 * 3600_000));
  const r0 = await at(SAT, () => get());
  assert.equal(r0._cache, 'hit'); assert.equal(r0.pe, 26.5); assert.equal(vendor.length, 0, '6시간 안 — 강제 재조회 없음(예전 규칙)'); assert.equal(writes.length, 0);
  store.set(KEY, legacyEntry(SAT - 7 * 3600_000));
  const r1 = await at(SAT, () => get());
  assert.equal(r1._cache, 'revalidated'); assert.equal(r1.pe, 26.4); assert.equal(r1.marketCap, 5084136000000);
  assert.equal(r1._sourceCheckedAfter, '2026-10-23', '공급사에서 방금 읽은 정상 결과 → 기준 세션 표식');
  assert.equal(store.get(KEY).data._sourceCheckedAfter, '2026-10-23', '표식을 값과 함께 저장');
  //    공식 종가 게시 전(금 16:30) — 표식 없음(마감 시각만으로 확정하지 않는다)
  store.clear(); official = {};
  const r3 = await at(FRI_1630, () => get());
  assert.equal(r3.pe, 26.4); assert.equal(r3._sourceCheckedAfter, undefined);
  //    공급사 실패 → 빈 결과(NO_DATA) — 표식 없음(출구가 정상 값을 빈 값으로 덮지 않는다, 관문 10250533 ②)
  store.clear(); official = OFFICIAL;
  const fm = require('../src/services/massiveClient');
  const realFetch = fm.fetchMassive;
  fm.fetchMassive = async () => ({ results: [] });   // 어댑터가 429 를 빈 응답으로 바꾼 모양
  const r4 = await at(SAT, () => get());
  fm.fetchMassive = realFetch;
  assert.equal(r4.grade, 'NO_DATA'); assert.equal(r4._sourceCheckedAfter, undefined);
  //    DynamoDB 수확본 — 표식 없음(수확 시점의 가격 기준을 모른다, 관문 10250533 ①)
  store.clear();
  const ucp = require('../src/lib/aws/unifiedCacheProvider');
  const realU = ucp.getUnifiedCache;
  ucp.getUnifiedCache = async () => ({ fundamentals: { ...legacyEntry(0).data, _incomeMetricsVersion: 1 } });
  const r5 = await at(SAT, () => get());
  ucp.getUnifiedCache = realU;
  assert.equal(r5._source, 'dynamodb'); assert.equal(r5.pe, 26.5); assert.equal(r5._sourceCheckedAfter, undefined);

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

  // ⑤-b 웹만 보는 종목의 갱신 기회 — 저장 항목이 없거나 6시간이 지났을 때만, 종목당 10분에 한 번(신선한 항목이면 안 부름)
  FS._resetFundamentalsMemoForTest(); FS._resetKickForTest();
  assert.equal(FS.shouldKickSourceRecheck('NVDA', SAT), false, '아직 읽지 않았으면 판단 안 함');
  store.delete(KEY);
  await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT);
  assert.equal(FS.shouldKickSourceRecheck('NVDA', SAT), true, '항목 없음 → 한 번');
  assert.equal(FS.shouldKickSourceRecheck('NVDA', SAT + 30_000), false, '10분 안 다시 안 부름');
  FS._resetFundamentalsMemoForTest(); FS._resetKickForTest();
  store.set(KEY, legacyEntry(SAT - 60_000));
  await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT);
  assert.equal(FS.shouldKickSourceRecheck('NVDA', SAT), false, '신선한 항목(6시간 안) → 안 부름');
  FS._resetFundamentalsMemoForTest(); FS._resetKickForTest();
  store.set(KEY, legacyEntry(SAT - 7 * 3600_000));
  await FS.alignFundamentalsToSource(unifiedCopy, 'NVDA', SAT);
  assert.equal(FS.shouldKickSourceRecheck('NVDA', SAT), true, '6시간 지난 항목 → 한 번');

  // ⑥ 배선 — command/unified 의 모든 출구(jsonResponse)·종목 SSR 이 같은 함수, 직접 API 는 기준 세션·isFresh 를 넘긴다
  const unified = fs.readFileSync(path.join(__dirname, '../src/app/api/command/unified/route.ts'), 'utf8');
  const jr = unified.slice(unified.indexOf('async function jsonResponse('), unified.indexOf('// Helper to reliably get the localhost URL'));
  assert.match(jr, /alignFundamentalsToSource\(/);
  assert.match(jr, /shouldKickSourceRecheck\(symbol\)[\s\S]*after\(async \(\) => \{ await callInternalGet\(getFundamentals/);
  const ssr = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/ticker/page.tsx'), 'utf8');
  assert.match(ssr, /alignFundamentalsToSource\(/);
  const direct = fs.readFileSync(path.join(__dirname, '../src/app/api/live/fundamentals/route.ts'), 'utf8');
  assert.match(direct, /keyPrefix: 'swr' \}/, '재무 SWR 규칙 불변');
  const swrSrc = fs.readFileSync(path.join(__dirname, '../src/lib/cache/redisSWR.ts'), 'utf8');
  assert.ok(!swrSrc.includes('isFresh'), 'swrFetch 공용 동작 불변');

  console.log('fundamentalsSession: 5 묶음 통과');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
