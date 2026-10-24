import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// [T12 · 감사 10/23 M9] 연관 종목 행 — 끝난 세션을 보여 줄 시간엔 그 세션의 공식 종가 한 쌍(M7 과 같은 읽기).
// 외부 경계(EOD 리더)만 가짜로 둔다 — 네트워크·쓰기 0. 수치는 10/25(토) 운영 실측 그대로.
(globalThis as any).fetch = () => { throw new Error('network forbidden'); };
const calls: string[] = [];
let official: Record<string, { close: number; prevClose: number } | null> = {};
let delayMs = 0;
const stub = (id: string, exports: unknown) => {
  const filename = require.resolve(id);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};
stub('../src/services/intrinioClient', {
  peekOfficialSessionClose: async (t: string, d: string, p: string) => {
    calls.push(`${t}:${d}:${p}`);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return official[`${t}:${d}:${p}`] ?? null;
  },
});
const SPR = require('../src/services/stalePriceRepair') as typeof import('../src/services/stalePriceRepair');

const SAT = Date.parse('2026-10-24T19:20:00Z');        // 토 15:20 ET — 운영 실측 시각
const MON_0300 = Date.parse('2026-10-26T07:00:00Z');   // 월 03:00 ET — 프리마켓 전(화면은 아직 금요일 세션)
const MON_0405 = Date.parse('2026-10-26T08:05:00Z');   // 월 04:05 ET — 프리마켓(다음 세션 살아 있음)
const MON_1000 = Date.parse('2026-10-26T14:00:00Z');   // 월 10:00 ET — 정규장
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
    'MSFT:2026-10-23:2026-10-22': { close: 524.51, prevClose: 521.08 },
    'GOOG:2026-10-23:2026-10-22': { close: 317.28, prevClose: 320.76 },
  };
};

async function main() {
  // ① 주말 — 10/22 값 → 10/23 공식 종가 한 쌍 · 실패 행(0)도 채움 · 공식 값 없는 행은 그대로 · 다른 필드 보존
  seed1023();
  const input = stale();
  const out: any = await SPR.officialCloseRelated(input, SAT);
  assert.notEqual(out, input, '새 객체');
  assert.deepEqual(out.topRelated[0], { ticker: 'GOOGL', price: 320.21, change: -1.24, logo: null, prevClose: 324.22, session: '2026-10-23', closeSession: '2026-10-23', asOf: SAT });
  assert.deepEqual(out.topRelated[1], { ticker: 'AMD', price: 516.79, change: 1.74, logo: null, prevClose: 507.93, session: '2026-10-23', closeSession: '2026-10-23', asOf: SAT });
  assert.deepEqual(out.topRelated[2], { ticker: 'MSFT', price: 524.51, change: 0.66, logo: null, prevClose: 521.08, session: '2026-10-23', closeSession: '2026-10-23', asOf: SAT }, '{price:0} 행도 공식 값으로');
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

  // ③ 프리마켓·정규장(다음 세션이 살아 있음) — 손대지 않는다, 읽지도 않는다
  for (const at of [MON_0405, MON_1000]) {
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
  assert.equal(await SPR.officialCloseRelated(once, SAT), once);

  // ⑧ 상한 — EOD 읽기가 늦으면 그대로
  delayMs = 300;
  const slow = stale();
  const t0 = Date.now();
  assert.equal(await SPR.officialCloseRelated(slow, SAT, 50), slow);
  assert.ok(Date.now() - t0 < 250);
  delayMs = 0;
  await new Promise((r) => setTimeout(r, 350));

  // ⑨-a 기준 세션 저장 — 행의 session(공급사 스냅샷 본장 날짜)·asOf(계산 시각). S 마감 뒤에 계산한 S 행(운영 AMZN unified live-direct)은
  //      그대로(직접 API 와 같은 값), 가격 0 행만 공식 값. 스냅샷이 아직 전 세션(목)·장중에 계산한 S 행·기준 없음(DynamoDB 수확본)은 다시 계산
  seed1023();
  calls.length = 0;
  const AFTER = Date.parse('2026-10-24T14:00:00Z');   // 토 10:00 ET 계산
  const fresh = { topRelated: [
    { ticker: 'GOOGL', price: 321.11, change: -0.96, logo: null, prevClose: 324.22, session: '2026-10-23', asOf: AFTER },
    { ticker: 'MSFT', price: 0, change: 0, logo: null, prevClose: 0, session: null, asOf: AFTER },
  ] };
  const keptOut: any = await SPR.officialCloseRelated(fresh, SAT);
  assert.deepEqual(keptOut.topRelated[0], fresh.topRelated[0], 'S 마감 뒤 계산한 S 행 → 직접 API 값 그대로');
  assert.equal(keptOut.topRelated[1].price, 524.51, '가격 0 행은 공식 값');
  assert.deepEqual(calls, ['MSFT:2026-10-23:2026-10-22'], '필요한 행만 읽는다');
  const allFresh = { topRelated: [fresh.topRelated[0]] };
  assert.equal(await SPR.officialCloseRelated(allFresh, SAT), allFresh, '전부 그대로 → 같은 객체·읽기 0');
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
    assert.equal(o.topRelated[0].asOf, SAT, '고친 행은 계산 시각을 싣는다');
  }
  //      금 16:05 ET(조기 폐장 아님) 계산 금요일 행은 마감 뒤 — 그대로
  const at1605 = { topRelated: [{ ticker: 'GOOGL', price: 320.4, change: -1.18, logo: null, prevClose: 324.22, session: '2026-10-23', asOf: Date.parse('2026-10-23T20:05:00Z') }] };
  assert.equal(await SPR.officialCloseRelated(at1605, SAT), at1605);

  // ⑨-b 직접 API 응답 행에 기준이 실린다(라우트 실행 — 공급사·DynamoDB 는 가짜) · 행 값 불변 · 스냅샷 본장 날짜 그대로
  stub('../src/services/massiveClient', {
    CACHE_POLICY: { LIVE: 'live' },
    fetchMassive: async (url: string) => {
      const sym = url.split('/').pop();
      if (sym === 'XYZQ') return { ticker: { lastTrade: { p: 0 }, prevDay: { c: 0 } } };   // 스냅샷 실패 → 일봉 폴백
      if (url.includes('/v2/aggs/')) return { results: [{ c: 12.5 }, { c: 12.35 }] };
      return { ticker: { lastTrade: { p: sym === 'GOOGL' ? 321.11 : 524.54 }, prevDay: { c: sym === 'GOOGL' ? 324.22 : 521.08 }, _intrinio: { regularDate: sym === 'GOOGL' ? '2026-10-23' : '2026-10-22' } } };
    },
  });
  stub('../src/lib/aws/dynamoDataProvider', { getRelatedData: async () => ({ tickers: ['GOOGL', 'MSFT', 'XYZQ'] }) });
  const { NextRequest } = require('next/server');
  const relatedRoute = require('../src/app/api/live/related/route');
  const realNow = Date.now;
  Date.now = () => SAT;
  let body: any;
  try { body = await (await relatedRoute.GET(new NextRequest('https://x.test/api/live/related?t=NVDA'))).json(); } finally { Date.now = realNow; }
  assert.deepEqual(body.topRelated.map((r: any) => [r.ticker, r.price, r.change, r.prevClose, r.session, r.asOf]),
    [['GOOGL', 321.11, -0.96, 324.22, '2026-10-23', SAT], ['MSFT', 524.54, 0.66, 521.08, '2026-10-22', SAT], ['XYZQ', 12.5, 1.21, 12.35, null, SAT]], '행 값 불변 + 기준');
  const viaExit: any = await SPR.officialCloseRelated(body, SAT);
  assert.deepEqual(viaExit.topRelated[0], body.topRelated[0], '같은 세션·마감 뒤 행은 unified 출구에서도 그대로');
  assert.equal(viaExit.topRelated[1].price, 524.51, '스냅샷이 전 세션(10/22)인 행은 공식 값');

  // ⑨-c 웹 병합(lib/relatedRowMerge) — 관문 10250504 ②·③ + 예전 규칙 보존
  const { mergeRelatedRow } = require('../src/lib/relatedRowMerge');
  const T0400 = Date.parse('2026-10-26T08:00:05Z');
  const directNew = { ticker: 'GOOGL', price: 321.5, change: 0.4, logo: null, prevClose: 320.21, session: '2026-10-23', asOf: T0400 };
  const lateUnified = { ticker: 'GOOGL', price: 320.21, change: -1.24, logo: null, prevClose: 324.22, session: '2026-10-23', closeSession: '2026-10-23', asOf: T0400 - 6_000 };
  const m2 = mergeRelatedRow(directNew, lateUnified);
  assert.equal(m2.prevClose, 320.21, '② 늦게 도착한 옛 응답이 새 분모를 못 덮는다');
  const ws = 322;
  assert.equal(Number(((ws - m2.prevClose!) / m2.prevClose! * 100).toFixed(2)), 0.56, '② WebSocket 등락 +0.56% 유지(−0.68% 반전 없음)');
  const flat = { ticker: 'GOOGL', price: 320.21, change: 0, logo: null, prevClose: 320.21, session: '2026-10-23', closeSession: '2026-10-23', asOf: T0400 + 60_000 };
  const oldLive = { ticker: 'GOOGL', price: 322, change: 0.56, logo: null, prevClose: 320.21, asOf: T0400 };
  const m3 = mergeRelatedRow(oldLive, flat);
  assert.equal(m3.change, 0, '③ 공식 보합 0% 그대로(옛 +0.56% 안 남김)');
  assert.equal(m3.price, 320.21);
  //   예전 규칙: 새 행 가격·등락 0(실패) → 옛 실시간 값 · 분모 없으면 옛 분모 · 계산 시각 없는 두 행은 새 행
  const legacyOld = { ticker: 'AMD', price: 516.21, change: 1.63, logo: null, prevClose: 507.93 };
  assert.deepEqual(mergeRelatedRow(legacyOld, { ticker: 'AMD', price: 0, change: 0, logo: null }), { ticker: 'AMD', price: 516.21, change: 1.63, logo: null, prevClose: 507.93 });
  assert.deepEqual(mergeRelatedRow(legacyOld, { ticker: 'AMD', price: 517, change: 1.8, logo: null }), { ticker: 'AMD', price: 517, change: 1.8, logo: null, prevClose: 507.93 });
  //   계산 시각 있는 옛 행(직접 API) vs 시각 없는 새 행(옛 캐시·수확본) → 옛 행 값(낡은 캐시가 방금 받은 값을 못 덮는다)
  const stamped = { ...legacyOld, asOf: T0400 };
  const mx = mergeRelatedRow(stamped, { ticker: 'AMD', price: 505.6, change: -8.53, logo: null, prevClose: 552.72 });
  assert.equal(mx.price, 516.21); assert.equal(mx.prevClose, 507.93);
  //   새 행이 더 늦게 계산됐으면 새 행
  assert.equal(mergeRelatedRow(stamped, { ticker: 'AMD', price: 518, change: 2, logo: null, prevClose: 507.93, asOf: T0400 + 1 }).price, 518);
  //   옛 행 실패(가격 0)면 시각과 무관하게 새 행
  assert.equal(mergeRelatedRow({ ticker: 'AMD', price: 0, change: 0, logo: null, asOf: T0400 }, { ticker: 'AMD', price: 517, change: 1.8, logo: null }).price, 517);
  //   웹 화면이 이 함수를 쓴다(소스 배선)
  const dash = fs.readFileSync(path.join(__dirname, '../src/components/LiveTickerDashboard.tsx'), 'utf8');
  assert.match(dash, /return mergeRelatedRow\(oldItem, newItem\);/);

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

  console.log('relatedOfficialClose: 13 묶음 통과');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
