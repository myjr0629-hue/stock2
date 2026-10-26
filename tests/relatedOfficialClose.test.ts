import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mergeRelatedRow } from '../src/lib/relatedRowMerge';

// [T12 · 감사 10/23 M9] 연관 종목 행 — 끝난 세션을 보여 줄 시간엔 그 세션의 공식 종가 한 쌍(M7 과 같은 읽기).
// 외부 경계(EOD 리더)만 가짜로 둔다 — 네트워크·쓰기 0. 수치는 10/25(토) 운영 실측 그대로.
(globalThis as any).fetch = () => { throw new Error('network forbidden'); };
const calls: string[] = [];
let official: Record<string, { close: number; prevClose: number } | null> = {};
let delayMs = 0;
let readFails = false;
const stub = (id: string, exports: unknown) => {
  const filename = require.resolve(id);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};
stub('../src/services/intrinioClient', {
  peekOfficialSessionClose: async (t: string, d: string, p: string) => {
    calls.push(`${t}:${d}:${p}`);
    if (readFails) throw new Error('EOD unavailable');
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return official[`${t}:${d}:${p}`] ?? null;
  },
});
const SPR = require('../src/services/stalePriceRepair') as typeof import('../src/services/stalePriceRepair');

const SAT = Date.parse('2026-10-24T19:20:00Z');        // 토 15:20 ET — 운영 실측 시각
const MON_0300 = Date.parse('2026-10-26T07:00:00Z');   // 월 03:00 ET — 프리마켓 전(화면은 아직 금요일 세션)
const MON_0405 = Date.parse('2026-10-26T08:05:00Z');   // 월 04:05 ET — 프리마켓(다음 세션 살아 있음)
const MON_1000 = Date.parse('2026-10-26T14:00:00Z');   // 월 10:00 ET — 정규장
const FRI_CLOSE = Date.parse('2026-10-23T20:00:00Z'); // 공식 종가 기준 시각(16:00 EDT)
const SUN = Date.parse('2026-10-26T02:55:00Z');       // 10/26 11:55 KST, 미국 일요일 CLOSED
const FRI_1630 = Date.parse('2026-10-23T20:30:00Z');   // 금 16:30 ET — 마감 직후

// 운영 cache:command:unified NVDA 의 related(10/22 세션 값이 40시간 묵음) + 실패 행(0) + 공식 값 없는 행
const stale = () => ({
  ticker: 'NVDA', count: 10, label: '다수',
  topRelated: [
    { ticker: 'GOOGL', price: 324.2, change: -3.15, logo: null, prevClose: 334.75 },
    { ticker: 'AMD', price: 505.6, change: -8.53, logo: null, prevClose: 552.75 },
    { ticker: 'MSFT', price: 0, change: 0, logo: null, prevClose: 0 },
    { ticker: 'XYZQ', price: 12.5, change: 1.2, logo: null, prevClose: 12.35 },
  ],
  allTickers: ['GOOGL', 'AMD', 'MSFT', 'XYZQ'],
});
const seed1023 = () => {
  official = {
    'GOOGL:2026-10-23:2026-10-22': { close: 320.21, prevClose: 324.21999999999997 },
    'AMD:2026-10-23:2026-10-22': { close: 516.79, prevClose: 507.92999999999995 },
    'META:2026-10-23:2026-10-22': { close: 642.62, prevClose: 648.85 },
    'MSFT:2026-10-23:2026-10-22': { close: 524.51, prevClose: 521.08 },
    'GOOG:2026-10-23:2026-10-22': { close: 317.28, prevClose: 320.76 },
  };
};

async function main() {
  // ① 주말 — 10/22 값 → 10/23 공식 종가 한 쌍 · 실패 행(0)은 그대로 · 공식 값 없는 행은 그대로 · 다른 필드 보존
  seed1023();
  const input = stale();
  const out: any = await SPR.officialCloseRelated(input, SAT);
  assert.notEqual(out, input, '새 객체');
  assert.deepEqual(out.topRelated[0], { ticker: 'GOOGL', price: 320.21, change: -1.24, logo: null, prevClose: 324.22, session: '2026-10-23', closeSession: '2026-10-23', asOf: FRI_CLOSE });
  assert.deepEqual(out.topRelated[1], { ticker: 'AMD', price: 516.79, change: 1.74, logo: null, prevClose: 507.93, session: '2026-10-23', closeSession: '2026-10-23', asOf: FRI_CLOSE });
  assert.deepEqual(out.topRelated[2], input.topRelated[2], '{price:0} 실패 행은 채우지 않는다(웹 병합이 0 을 결측으로 보고 더 새 값을 지킨다 — 관문 10250550)');
  assert.deepEqual(out.topRelated[3], input.topRelated[3], '공식 값 없음 → 그대로(0·보합 금지)');
  assert.equal(out.count, 10); assert.equal(out.label, '다수'); assert.deepEqual(out.allTickers, input.allTickers);
  assert.equal(input.topRelated[0].price, 324.2, '입력(캐시 객체)은 고치지 않는다');
  // prevClose 는 직접 API(/api/live/related prevDay.c, 운영 10/25 실측 324.22)와 같은 «직전 거래일 종가» — 웹 실시간 재계산 분모가 같다
  assert.equal(out.topRelated[0].prevClose, 324.22);

  // ② 월 03:00 ET(프리마켓 전) — 화면은 아직 금요일 세션: 공식 한 쌍
  calls.length = 0;
  const night: any = await SPR.officialCloseRelated(stale(), MON_0300);
  assert.equal(night.topRelated[0].price, 320.21);
  assert.ok(calls.every((c) => c.endsWith(':2026-10-23:2026-10-22')), '기준 세션 10/23·직전 10/22');

  // ③ PRE 도 직전 정규장 공식 한 쌍. 정규장은 기존 값·분모를 유지하며 EOD 읽기 0.
  const premarket: any = await SPR.officialCloseRelated(stale(), MON_0405);
  assert.equal(premarket.topRelated[0].price, 320.21);
  assert.equal(premarket.topRelated[0].closeSession, '2026-10-23');
  assert.equal(premarket.topRelated[0].asOf, FRI_CLOSE);
  for (const at of [Date.parse('2026-10-26T13:30:00Z'), MON_1000, Date.parse('2026-10-26T19:59:00Z')]) {
    calls.length = 0;
    const inp = stale();
    assert.equal(await SPR.officialCloseRelated(inp, at), inp, '실시간 구간 그대로');
    assert.deepEqual(calls, []);
  }

  // ④ 금 16:30 ET — 공식 종가 게시 전이면 그대로, 게시 뒤엔 그 세션
  official = {};
  const pre = stale();
  assert.equal(await SPR.officialCloseRelated(pre, FRI_1630), pre, '게시 전 그대로');
  seed1023();
  const post: any = await SPR.officialCloseRelated(stale(), FRI_1630);
  assert.equal(post.topRelated[0].price, 320.21, '게시 뒤 같은 세션');

  // ⑤ GOOG 는 직접 API 와 같이 GOOGL 값(SNAPSHOT_ALIAS)
  calls.length = 0;
  const goog: any = await SPR.officialCloseRelated({ topRelated: [{ ticker: 'GOOG', price: 1, change: 0, logo: null }] }, SAT);
  assert.deepEqual(calls, ['GOOGL:2026-10-23:2026-10-22']);
  assert.equal(goog.topRelated[0].price, 320.21);

  // ⑥ 휴장(추수감사절 11/26)·다음 날 조기 폐장(11/27 13:00 ET) — 달력 그대로
  calls.length = 0;
  await SPR.officialCloseRelated(stale(), Date.parse('2026-11-26T17:00:00Z'));
  assert.ok(calls.every((c) => c.endsWith(':2026-11-25:2026-11-24')), '휴장일 = 직전 거래일 세션');
  calls.length = 0;
  const early = stale();
  assert.equal(await SPR.officialCloseRelated(early, Date.parse('2026-11-27T17:30:00Z')), early, '조기 폐장일 12:30 ET 는 정규장(손대지 않음)');
  calls.length = 0;
  await SPR.officialCloseRelated(stale(), Date.parse('2026-11-27T18:30:00Z'));
  assert.ok(calls.length > 0 && calls.every((c) => c.endsWith(':2026-11-27:2026-11-25')), '조기 폐장 13:00 뒤 = 그날 세션, 직전 = 11/25');

  // ⑦ 이미 공식 값인 행은 같은 객체(재포장·캐시 갱신 유발 0)
  seed1023();
  const once: any = await SPR.officialCloseRelated(stale(), SAT);
  calls.length = 0;
  assert.equal(await SPR.officialCloseRelated(once, SAT), once);
  assert.deepEqual(calls, ['XYZQ:2026-10-23:2026-10-22'], '공식 행은 재읽기 0, 공식 값 없는 행만 재확인');
  calls.length = 0;
  const legacyOfficial = { topRelated: [{ ...once.topRelated[0], asOf: SUN }] };
  const normalized: any = await SPR.officialCloseRelated(legacyOfficial, SUN);
  assert.equal(normalized.topRelated[0].asOf, FRI_CLOSE, '옛 공식 캐시의 요청 시각 정규화');
  assert.equal(normalized.topRelated[0].price, 320.21);
  assert.deepEqual(calls, [], '옛 공식 캐시 시각 보정도 재읽기 0');

  // ⑧ 상한 — EOD 읽기가 늦으면 그대로
  delayMs = 300;
  const slow = stale();
  const t0 = Date.now();
  assert.equal(await SPR.officialCloseRelated(slow, SAT, 50), slow);
  assert.ok(Date.now() - t0 < 250);
  delayMs = 0;
  await new Promise((r) => setTimeout(r, 350));

  // ⑨-a 운영 반례: session=S·마감 뒤 시각이어도 시간외 321.11 은 공식 320.21 이 아니다.
  //      공식 표식 없는 행은 다시 계산한다. 가격 0 실패 행은 기존 보호 유지.
  seed1023();
  calls.length = 0;
  const AFTER = Date.parse('2026-10-24T14:00:00Z');   // 토 10:00 ET 계산
  const fresh = { topRelated: [
    { ticker: 'GOOGL', price: 321.11, change: -0.96, logo: null, prevClose: 324.22, session: '2026-10-23', asOf: AFTER },
    { ticker: 'MSFT', price: 0, change: 0, logo: null, prevClose: 0, session: null, asOf: AFTER },
  ] };
  const keptOut: any = await SPR.officialCloseRelated(fresh, SAT);
  assert.deepEqual([keptOut.topRelated[0].price, keptOut.topRelated[0].change, keptOut.topRelated[0].prevClose],
    [320.21, -1.24, 324.22], '장후 321.11/−0.96 → 공식 320.21/−1.24');
  assert.equal(keptOut.topRelated[0].closeSession, '2026-10-23');
  assert.equal(keptOut.topRelated[0].asOf, FRI_CLOSE);
  assert.deepEqual(keptOut.topRelated[1], fresh.topRelated[1], '가격 0 실패 보호');
  assert.deepEqual(calls, ['GOOGL:2026-10-23:2026-10-22']);
  const cases: Array<[string, any]> = [
    ['토요일 요청인데 공급사 스냅샷이 목요일(관문 10250504 ①)', { session: '2026-10-22', asOf: AFTER }],
    ['금요일 장중(14:00 ET)에 계산한 금요일 행', { session: '2026-10-23', asOf: Date.parse('2026-10-23T18:00:00Z') }],
    ['기준 없음(DynamoDB 수확본·일봉 폴백)', {}],
  ];
  for (const [name, extra] of cases) {
    const b: any = { topRelated: [{ ticker: 'GOOGL', price: 324.22, change: -3.15, logo: null, prevClose: 334.76, ...extra }] };
    const o: any = await SPR.officialCloseRelated(b, SAT);
    assert.equal(o.topRelated[0].price, 320.21, name);
    assert.equal(o.topRelated[0].prevClose, 324.22, name);
    assert.equal(o.topRelated[0].asOf, FRI_CLOSE, '공식 종가 기준 시각, 요청 시각 아님');
  }
  //      금 16:05 ET 에 계산한 행도 공식 표식이 없으면 보정
  const at1605 = { topRelated: [{ ticker: 'GOOGL', price: 320.4, change: -1.18, logo: null, prevClose: 324.22, session: '2026-10-23', asOf: Date.parse('2026-10-23T20:05:00Z') }] };
  assert.equal((await SPR.officialCloseRelated(at1605, SAT)).topRelated[0].price, 320.21);

  // ⑨-b 실제 라우트 실행: 10/26 운영 모양 + 공급사 호출 수 + 정규장 + 병합(외부 경계만 가짜).
  const vendor: string[] = [];
  let relatedList = ['GOOGL', 'AMD', 'META', 'MSFT'];
  let tradeTime = Date.parse('2026-10-23T23:59:00Z');
  let regularDate = '2026-10-23';
  let omitTimes = false;
  let updateOnly = false;
  let withRegularPair = false; // 실제 Intrinio 어댑터 스냅샷처럼 _intrinio.regularClose·prevClose(본장 종가 한 쌍)를 싣는다
  const regularPairs: Record<string, [number, number]> = {
    GOOGL: [320.21, 324.22], AMD: [516.79, 507.93], META: [642.62, 648.85], MSFT: [524.51, 521.08],
  };
  const quotes: Record<string, [number, number]> = {
    GOOGL: [321.11, 324.22], AMD: [516.21, 507.93], META: [640.05, 648.85], MSFT: [524.54, 521.08],
  };
  stub('../src/services/massiveClient', {
    CACHE_POLICY: { LIVE: 'live' },
    fetchMassive: async (url: string) => {
      vendor.push(url);
      if (url.includes('/v2/aggs/')) return { results: [{ c: 12.5, t: Date.parse('2026-10-23T04:00:00Z') }, { c: 12.35 }] };
      const sym = url.split('/').pop()!;
      if (sym === 'XYZQ') return { ticker: { lastTrade: { p: 0 }, prevDay: { c: 0 } } };
      const [price, prevClose] = quotes[sym];
      return { ticker: { lastTrade: { p: price, t: omitTimes || updateOnly ? undefined : tradeTime * 1e6 },
        updated: omitTimes ? undefined : tradeTime * 1e6, prevDay: { c: prevClose }, _intrinio: { regularDate,
        ...(withRegularPair ? { regularClose: regularPairs[sym][0], prevClose: regularPairs[sym][1], regularLastTime: '2026-10-23T19:59:59.000Z' } : {}) } } };
    },
  });
  stub('../src/lib/aws/dynamoDataProvider', { getRelatedData: async () => ({ tickers: relatedList }) });
  const { NextRequest } = require('next/server');
  const relatedRoute = require('../src/app/api/live/related/route');
  async function getAt(ms: number) {
    const realNow = Date.now;
    Date.now = () => ms;
    try { return await (await relatedRoute.GET(new NextRequest('https://x.test/api/live/related?t=NVDA'))).json(); }
    finally { Date.now = realNow; }
  }
  const values = (row: any) => [row.price, row.change, row.prevClose, row.closeSession, row.asOf];
  let body: any;
  for (const at of [FRI_1630, SUN, MON_0300, MON_0405, Date.parse('2026-10-26T13:29:59Z')]) {
    calls.length = 0; vendor.length = 0;
    body = await getAt(at);
    assert.deepEqual(body.topRelated.map(values), [
      [320.21, -1.24, 324.22, '2026-10-23', FRI_CLOSE],
      [516.79, 1.74, 507.93, '2026-10-23', FRI_CLOSE],
      [642.62, -0.96, 648.85, '2026-10-23', FRI_CLOSE],
      [524.51, 0.66, 521.08, '2026-10-23', FRI_CLOSE],
    ], 'POST·일요일 CLOSED·새벽·PRE 모두 공식 종가/등락/전일 종가');
    assert.ok(body.topRelated.every((r: any) => r.session === '2026-10-23'));
    assert.equal(vendor.length, 4, '기존 snapshot 4회만, 추가 공급사 호출 0');
    assert.ok(vendor.every((url) => url.startsWith('/v2/snapshot/')));
    assert.equal(calls.length, 4, '공식 저장본 읽기만 추가');
    assert.equal(body.label, '소수'); assert.equal(body.count, 4);
    assert.deepEqual(body.allTickers, relatedList);
  }
  calls.length = 0;
  const viaExit: any = await SPR.officialCloseRelated(body, SUN + 60_000);
  assert.equal(viaExit, body, '직접 API 공식 행은 unified 출구에서 같은 객체·같은 시각');
  assert.deepEqual(calls, [], 'unified 출구 추가 읽기 0');
  const unified: any = await SPR.officialCloseRelated(fresh, SUN);
  assert.deepEqual(values(mergeRelatedRow(unified.topRelated[0], body.topRelated[0], SUN)), values(body.topRelated[0]), 'unified → direct 병합 공식 종가 유지');
  assert.deepEqual(values(mergeRelatedRow(body.topRelated[0], unified.topRelated[0], SUN)), values(body.topRelated[0]), 'direct → unified 병합 공식 종가 유지');
  const laterRequest = await getAt(SUN + 120_000);
  assert.equal(laterRequest.topRelated[0].asOf, FRI_CLOSE, '같은 종가 재요청은 asOf 를 갱신하지 않는다');

  // 정규장 반례: 같은 공급사 가격을 공식 종가로 바꾸지 않는다. asOf 는 실제 체결 시각.
  regularDate = '2026-10-26';
  for (const at of [Date.parse('2026-10-26T13:30:00Z'), MON_1000]) {
    tradeTime = at - 30_000;
    calls.length = 0; vendor.length = 0;
    const live = await getAt(at);
    assert.deepEqual(live.topRelated.map((r: any) => [r.price, r.change, r.prevClose]),
      [[321.11, -0.96, 324.22], [516.21, 1.63, 507.93], [640.05, -1.36, 648.85], [524.54, 0.66, 521.08]]);
    assert.ok(live.topRelated.every((r: any) => r.asOf === tradeTime && r.session === regularDate && !r.closeSession));
    assert.deepEqual(calls, [], '정규장 공식 저장본 읽기 0');
    assert.equal(vendor.length, 4, '정규장 공급사 호출 수도 동일');
    const mergedLive = mergeRelatedRow(live.topRelated[0], laterRequest.topRelated[0], at);
    assert.deepEqual(values(mergedLive), values(live.topRelated[0]), '지연 도착한 직전 공식 종가가 새 정규장 값을 덮지 않는다');
    assert.deepEqual(values(mergeRelatedRow(body.topRelated[0], live.topRelated[0], at)), values(live.topRelated[0]), '새 정규장 값은 채택');
  }
  updateOnly = true;
  assert.equal((await getAt(MON_1000)).topRelated[0].asOf, tradeTime, '체결 시각 없으면 원천 updated 사용');
  updateOnly = false; omitTimes = true;
  assert.equal((await getAt(MON_1000)).topRelated[0].asOf, null, '원천 시각 없으면 null, 요청 시각을 만들지 않음');
  omitTimes = false;

  // 공식 EOD 가 없거나 읽기 실패이면 기존 값과 원천 시각을 유지하며, 공식 표식을 만들지 않는다.
  const savedOfficial = official;
  official = {};
  let unavailable = await getAt(SUN);
  assert.deepEqual(values(unavailable.topRelated[0]), [321.11, -0.96, 324.22, undefined, tradeTime]);
  official = savedOfficial; readFails = true;
  try {
    unavailable = await getAt(SUN);
    assert.deepEqual(values(unavailable.topRelated[0]), [321.11, -0.96, 324.22, undefined, tradeTime]);
  } finally { readFails = false; }
  // 관문 10261206 P2: EOD 실패로 시간외 행을 먼저 받은 뒤 공식 조회가 복구된다.
  // 공식 마감 시각이 더 오래되어도 장외에서는 공식 행이 양방향으로 우선한다.
  const recovered = await getAt(SUN);
  const failedRow = unavailable.topRelated[0], recoveredRow = recovered.topRelated[0];
  assert.ok(recoveredRow.asOf < failedRow.asOf, '16:00 공식 종가 < 시간외 체결 시각');
  for (const [oldRow, newRow] of [[failedRow, recoveredRow], [recoveredRow, failedRow]]) {
    assert.deepEqual(values(mergeRelatedRow(oldRow, newRow, SUN)),
      [320.21, -1.24, 324.22, '2026-10-23', FRI_CLOSE], '조회 복구·응답 순서 무관 공식 종가 유지');
  }
  // 공식 EOD 를 못 읽어도 장외엔 스냅샷의 본장 종가 한 쌍 — 시간외 321.11 을 내지 않는다(추가 호출 0). 정규장엔 실시간 그대로.
  withRegularPair = true; regularDate = '2026-10-23'; tradeTime = Date.parse('2026-10-23T23:59:00Z');
  official = {}; vendor.length = 0;
  const pairOnly = await getAt(SUN);
  assert.deepEqual(pairOnly.topRelated.map((r: any) => [r.price, r.change, r.prevClose, r.session, r.closeSession]), [
    [320.21, -1.24, 324.22, '2026-10-23', undefined], [516.79, 1.74, 507.93, '2026-10-23', undefined],
    [642.62, -0.96, 648.85, '2026-10-23', undefined], [524.51, 0.66, 521.08, '2026-10-23', undefined],
  ], 'EOD 읽기 실패에도 정규장 종가·등락');
  assert.equal(pairOnly.topRelated[0].asOf, Date.parse('2026-10-23T19:59:59.000Z'), '정규장 마지막 체결 시각');
  assert.equal(vendor.length, 4, '공급사 호출 수 동일');
  official = savedOfficial;
  const pairOfficial = await getAt(SUN);
  assert.deepEqual(values(pairOfficial.topRelated[0]), [320.21, -1.24, 324.22, '2026-10-23', FRI_CLOSE], 'EOD 가 있으면 공식 표식');
  regularDate = '2026-10-26'; tradeTime = MON_1000 - 30_000;
  const pairReg = await getAt(MON_1000);
  assert.deepEqual([pairReg.topRelated[0].price, pairReg.topRelated[0].change], [321.11, -0.96], '정규장엔 실시간 체결(본장 쌍 미사용)');
  withRegularPair = false;
  relatedList = ['XYZQ']; vendor.length = 0;
  const fallback = await getAt(SUN);
  assert.deepEqual(values(fallback.topRelated[0]), [12.5, 1.21, 12.35, undefined, Date.parse('2026-10-23T04:00:00Z')]);
  assert.equal(fallback.topRelated[0].session, null, '일봉 폴백은 스냅샷 세션을 주장하지 않는다');
  assert.equal(vendor.length, 2, '기존 스냅샷 실패 → 일봉 폴백 1회씩만');
  const src = fs.readFileSync(path.join(__dirname, '../src/app/api/live/related/route.ts'), 'utf8');
  assert.doesNotMatch(src, /asOf:\s*Date\.now\(\)/, '요청 시각을 asOf 로 쓰지 않음');

  // 휴장·조기 폐장·EST 에도 공식 종가 기준 시각을 정확히 고른다.
  for (const [at, session, prev, closedAt] of [
    ['2026-11-26T17:00:00Z', '2026-11-25', '2026-11-24', '2026-11-25T21:00:00Z'],
    ['2026-11-27T18:00:00Z', '2026-11-27', '2026-11-25', '2026-11-27T18:00:00Z'],
    ['2026-12-28T14:29:59Z', '2026-12-24', '2026-12-23', '2026-12-24T18:00:00Z'],
  ]) {
    official[`GOOGL:${session}:${prev}`] = { close: 320.21, prevClose: 324.22 };
    const result: any = await SPR.officialCloseRelated(fresh, Date.parse(at));
    assert.equal(result.topRelated[0].closeSession, session);
    assert.equal(result.topRelated[0].asOf, Date.parse(closedAt), 'EST·휴장·조기 폐장 시각');
  }

  // ⑨-b2 관문 10250550 재현 — 03:59 직접 API 실패 행(0)이 공식 값으로 채워져 unified 캐시에 남으면, 04:00 뒤 웹 병합(실제 규칙)이
  //       직접 API 의 새 프리마켓 값(530/+1.05%)을 524.51/+0.66% 로 덮었다 → 실패 행은 0 그대로라 병합이 새 값을 지킨다
  const failedAt0359: any = await SPR.officialCloseRelated({ topRelated: [{ ticker: 'MSFT', price: 0, change: 0, logo: null, prevClose: 0 }] }, Date.parse('2026-10-26T07:59:00Z'));
  const merged = mergeRelatedRow({ ticker: 'MSFT', price: 530, change: 1.05, logo: null, prevClose: 524.51 }, failedAt0359.topRelated[0], Date.parse('2026-10-26T08:01:00Z'));
  assert.deepEqual([merged.price, merged.change, merged.prevClose], [530, 1.05, 524.51], '새 프리마켓 값·분모 유지');
  const dashSrc = fs.readFileSync(path.join(__dirname, '../src/components/LiveTickerDashboard.tsx'), 'utf8');
  assert.match(dashSrc, /return mergeRelatedRow\(oldItem, newItem, Date\.now\(\)\)/, '시험과 실제 화면이 같은 병합 함수를 사용');

  // ⑨-c 분모 없던 행(수확본)엔 분모를 새로 넣지 않는다 — 웹 병합(«prevClose: 새 행 || 옛 행»)이 직접 API 의 더 새 분모를 덮지 않게(관문 10250519 ③ 경로)
  const noDen: any = await SPR.officialCloseRelated({ topRelated: [{ ticker: 'AMZN', price: 252.36, change: 0, logo: null }, { ticker: 'GOOGL', price: 324.2, change: -3.15, logo: null, prevClose: 0 }] }, SAT);
  official['AMZN:2026-10-23:2026-10-22'] = { close: 248, prevClose: 250.38 };
  const noDen2: any = await SPR.officialCloseRelated({ topRelated: [{ ticker: 'AMZN', price: 252.36, change: 0, logo: null }, { ticker: 'GOOGL', price: 324.2, change: -3.15, logo: null, prevClose: 0 }] }, SAT);
  assert.equal(noDen2.topRelated[0].price, 248); assert.equal(noDen2.topRelated[0].change, -0.95);
  assert.equal(noDen2.topRelated[0].prevClose, undefined, '분모 없던 행 → 분모 없음 유지');
  assert.equal(noDen2.topRelated[1].prevClose, 0, '분모 0 행 → 0 유지(웹은 옛 행 분모를 쓴다)');
  assert.equal(noDen2.topRelated[1].price, 320.21);
  void noDen;
  //   분모 없는 수확 행도 기존 직접 API 분모를 지킨다 — 실제 웹 병합 함수로 회귀 확인.
  const keptDenominator = mergeRelatedRow({ ticker: 'AMZN', price: 248, change: -0.95, prevClose: 250.38 }, noDen2.topRelated[0], SAT);
  assert.equal(keptDenominator.prevClose, 250.38);

  // ⑨ 빈 블록·모양 아님 — 그대로
  assert.equal(await SPR.officialCloseRelated(null as any, SAT), null);
  const empty = { topRelated: [] };
  assert.equal(await SPR.officialCloseRelated(empty, SAT), empty);

  // ⑩ 출구 배선 — command/unified 의 모든 응답(jsonResponse)·종목 SSR 이 같은 함수를 지난다(라우트 전체를 띄우지 않고 소스로 확인)
  const route = fs.readFileSync(path.join(__dirname, '../src/app/api/command/unified/route.ts'), 'utf8');
  const jr = route.slice(route.indexOf('async function jsonResponse('), route.indexOf('// Helper to reliably get the localhost URL'));
  assert.match(jr, /officialCloseRelated\(/, 'jsonResponse 가 연관 종목을 덮는다');
  const getBody = route.slice(route.indexOf('export async function GET('));
  const direct = getBody.match(/NextResponse\.json\(\{[^}]*/g) || [];
  assert.ok(direct.length === 2 && direct.every((m) => /^NextResponse\.json\(\{ error:/.test(m)), 'GET 의 데이터 응답은 전부 jsonResponse(직접 응답은 400·500 오류 2개뿐)');
  const ssr = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/ticker/page.tsx'), 'utf8');
  assert.match(ssr, /officialCloseRelated\(/, '종목 SSR 도 같은 함수');

  console.log('relatedOfficialClose: 공식 종가·PRE/POST/CLOSED·정규장 유지·원천 asOf·양방향 병합·공급사 호출 수·실패 보호 통과');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
