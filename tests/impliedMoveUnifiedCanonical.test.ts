import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// [T26b] 종목 화면 IMP MOVE(/api/dashboard/unified·분석 캐시)도 T26 정본(같은 만기·세션의 «마감 관측»)과 같은 값.
// 저장소·시계·외부 호출은 전부 격리한다(쓰기·네트워크 0). AMZN 수치는 10/25 운영 저장본 그대로:
//   cache:analysis:AMZN = 7.8(eod·10/23·10/30 만기) vs earnings:event-probe:v3:AMZN:2026-10-29:next = 7.9(공급사 EOD mark).
const store = new Map<string, any>();
const reads: string[] = [];
const forbidden = () => { throw new Error('unexpected external I/O or write'); };
(globalThis as any).fetch = forbidden;
const stub = (id: string, exports: unknown) => {
  const filename = require.resolve(id);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};
stub('../src/services/redisClient', {
  getFromCache: async (key: string) => { reads.push(key); return structuredClone(store.get(key) ?? null); },
  mgetFromCache: async (keys: string[]) => { reads.push(...keys); return keys.map(k => structuredClone(store.get(k) ?? null)); },
  setInCache: forbidden,
});
stub('../src/services/structureService', {
  structureV2Key: (t: string) => `structure:v2:${t}`,
  structureLastGoodKey: (t: string) => `structure:lastgood:${t}`,
});
stub('../src/services/eodSnapshot', { readEodCloses: async () => null });
stub('../src/services/xsScores', { ensureXsScores: async () => {}, xsSnapshotOverride: (_t: string, s: any) => s });
stub('../src/services/darkPool', { getDarkPoolBatch: async () => ({}) });

const IMS = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const AC = require('../src/services/analysisCache') as typeof import('../src/services/analysisCache');

const DEF = 'atm-straddle-mid/1' as const;
const SESSION = '2026-10-23';
const EXPIRY = '2026-10-30';
const WEEKEND = Date.parse('2026-10-24T19:20:00Z');   // 토 15:20 ET — 운영 실측 시각(10/25 04:20 KST)
const INTRADAY = Date.parse('2026-10-26T15:00:00Z');  // 월 11:00 ET
const POSTCLOSE = Date.parse('2026-10-26T20:30:00Z'); // 월 16:30 ET

const obs = (o: { strike: number; call: number; put: number; spot: number; session: string; expiry?: string }) => {
  const sum = o.call + o.put;
  return { im: { def: DEF, pct: Math.round(sum / o.spot * 1000) / 10, straddle: Math.round(sum * 100) / 100, strike: o.strike,
    expiry: o.expiry ?? EXPIRY, callPrice: o.call, putPrice: o.put, spot: o.spot, basis: 'eod', asOf: null, chainDate: o.session,
    session: o.session, method: 'weekly' }, checkedAt: Date.parse('2026-10-23T21:10:53Z') };
};
const obsKey = (t: string, after: string, same = false) => `earnings:event-probe:v3:${t}:${after}:${same ? 'same' : 'next'}`;
const fields = (pct: number, o: { basis?: 'eod' | 'live'; session?: string | null; asOf?: number | null; expiry?: string } = {}) => ({
  impliedMovePct: pct, impliedMoveExpiry: o.expiry ?? EXPIRY, impliedMoveBasis: o.basis ?? 'eod', impliedMoveAsOf: o.asOf ?? null,
  impliedMoveDef: DEF, impliedMoveSession: o.session === undefined ? SESSION : o.session,
});
// 운영 cache:analysis:* 모양(필요한 필드만) — 배치가 주말에도 다시 쓴다(15분 안 timestamp, 값은 직전 세션 10/23 eod)
const analysisEntry = (ticker: string, pct: number, extra: any = {}) => ({
  ticker, timestamp: WEEKEND - 5 * 60_000, price: 248, impliedMoveDir: 'CALL', ...fields(pct), ...extra,
});

function seed() {
  store.clear();
  reads.length = 0;
  IMS._resetImpliedPackMemoForTest();
  IMS._resetCanonicalFieldsMemoForTest();
  // 실적 캘린더 묶음(관측 레지스트리) — 행 키 «티커|발표일», e = 그 발표 뒤 첫 만기
  store.set('earnings:implied:v1', { v: 1, cells: {
    'AMZN|2026-10-29': { e: EXPIRY, p: 7.9 },
    'MSFT|2026-10-28': { e: EXPIRY, p: 5.3 },
    'AAPL|2026-11-02': { e: '2026-11-04', p: 4.5 },
  } });
  store.set(obsKey('AMZN', '2026-10-29'), obs({ strike: 247.5, call: 10.099999904632568, put: 9.375, spot: 248, session: SESSION }));
  store.set(obsKey('MSFT', '2026-10-28'), obs({ strike: 525, call: 13.775, put: 13.9, spot: 524.51, session: SESSION }));
  store.set(obsKey('AAPL', '2026-11-02'), obs({ strike: 347.5, call: 8.15, put: 7.625, spot: 347.725, session: SESSION, expiry: '2026-11-04' }));
}

async function at<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const realNow = Date.now;
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = realNow; }
}

async function main() {
  // ① 공유 함수 — 주말: AMZN 7.8 → 7.9(관측 그대로), MSFT 같은 값 → 그대로(null), META 관측 없음·AAPL 다른 만기 → 그대로
  seed();
  const out = await at(WEEKEND, () => IMS.canonicalImpliedMoveFields([
    { ticker: 'AMZN', fields: fields(7.8) },
    { ticker: 'MSFT', fields: fields(5.3) },
    { ticker: 'META', fields: fields(4.4) },
    { ticker: 'AAPL', fields: fields(2.5) },
  ]));
  assert.deepEqual(out[0], fields(7.9), 'AMZN 은 같은 만기·세션 마감 관측 7.9');
  assert.equal(out[1], null, 'MSFT 는 관측과 같은 값 — 그대로');
  assert.equal(out[2], null, 'META 는 관측 없음 — 그대로');
  assert.equal(out[3], null, 'AAPL 은 관측 만기(11/04)가 다름 — 그대로');

  // ② 결과 메모 60초 — 같은 필드는 다시 읽지 않는다(unified 출구가 요청마다 Redis 를 읽지 않게)
  reads.length = 0;
  const again = await at(WEEKEND + 30_000, () => IMS.canonicalImpliedMoveFields([{ ticker: 'AMZN', fields: fields(7.8) }, { ticker: 'MSFT', fields: fields(5.3) }]));
  assert.deepEqual(again[0], fields(7.9));
  assert.equal(again[1], null);
  assert.deepEqual(reads, [], '메모 적중 — Redis 읽기 0');

  // ③ 장중 오늘 실시간 값은 관측(지난 세션)보다 새롭다 — 바꾸지 않고 읽지도 않는다
  seed();
  const live = fields(8.4, { basis: 'live', session: '2026-10-26', asOf: INTRADAY - 60_000 });
  const intraday = await at(INTRADAY, () => IMS.canonicalImpliedMoveFields([{ ticker: 'AMZN', fields: live }]));
  assert.equal(intraday[0], null, '장중 오늘 live 그대로');
  assert.deepEqual(reads, [], '장중 오늘 live 는 묶음·관측을 읽지 않는다');

  // ④ 지난 세션에 저장된 live 값(10/23 장중 값이 주말까지 이월) — 같은 세션 EOD 관측이 이긴다(T26 관문 10250346 ①과 같은 규칙)
  seed();
  const staleLive = fields(7.7, { basis: 'live', session: SESSION, asOf: Date.parse('2026-10-23T19:50:00Z') });
  const carried = await at(WEEKEND, () => IMS.canonicalImpliedMoveFields([{ ticker: 'AMZN', fields: staleLive }]));
  assert.deepEqual(carried[0], fields(7.9), '지난 세션 live → 같은 세션 EOD 관측');

  // ⑤ 더 새 세션의 EOD 값(10/26 마감 뒤) — 옛 관측(10/23)으로 되돌리지 않는다
  seed();
  const newer = await at(POSTCLOSE, () => IMS.canonicalImpliedMoveFields([{ ticker: 'AMZN', fields: fields(6.9, { session: '2026-10-26' }) }]));
  assert.equal(newer[0], null, '세션 후퇴 금지');

  // ⑥ 묶음·관측 읽기 실패 — 그대로(지어내지 않는다)
  seed();
  store.delete('earnings:implied:v1');
  const noPack = await at(WEEKEND, () => IMS.canonicalImpliedMoveFields([{ ticker: 'AMZN', fields: fields(7.8) }]));
  assert.equal(noPack[0], null, '묶음 없으면 그대로');
  //    못 읽은 결과는 기억하지 않는다 — 묶음이 다시 읽히면(5초 뒤) 바로 정본(EC2 시간 초과 1회로 1분간 7.8 이 남지 않게)
  store.set('earnings:implied:v1', { v: 1, cells: { 'AMZN|2026-10-29': { e: EXPIRY, p: 7.9 } } });
  const recovered = await at(WEEKEND + 6_000, () => IMS.canonicalImpliedMoveFields([{ ticker: 'AMZN', fields: fields(7.8) }]));
  assert.deepEqual(recovered[0], fields(7.9), '읽기 실패는 메모하지 않는다');
  //    관측 mget 이 전부 null(프록시 실패 — mget 은 던지지 않는다)이어도 기억하지 않는다
  seed();
  const obsVal = store.get(obsKey('AMZN', '2026-10-29'));
  store.delete(obsKey('AMZN', '2026-10-29'));
  const noObs = await at(WEEKEND, () => IMS.canonicalImpliedMoveFields([{ ticker: 'AMZN', fields: fields(7.8) }]));
  assert.equal(noObs[0], null);
  store.set(obsKey('AMZN', '2026-10-29'), obsVal);
  const obsBack = await at(WEEKEND + 1_000, () => IMS.canonicalImpliedMoveFields([{ ticker: 'AMZN', fields: fields(7.8) }]));
  assert.deepEqual(obsBack[0], fields(7.9), '관측 전부 null 은 메모하지 않는다');

  // ⑦ 행 맵 덮기 — 원본 행 객체는 그대로, 맵 값만 새 객체 · 다른 필드(방향 등)는 보존 · 표식 없는 값은 건드리지 않음
  seed();
  const original = { ...analysisEntry('AMZN', 7.8) };
  const rows: Record<string, any> = { AMZN: original, OLD: { impliedMovePct: 12.3, impliedMoveDef: null } };
  await at(WEEKEND, () => IMS.overlayCanonicalImpliedMoveRows(rows, 500));
  assert.equal(rows.AMZN.impliedMovePct, 7.9);
  assert.equal(rows.AMZN.impliedMoveSession, SESSION);
  assert.equal(rows.AMZN.impliedMoveBasis, 'eod');
  assert.equal(rows.AMZN.impliedMoveDir, 'CALL', '다른 필드 보존');
  assert.equal(rows.AMZN.price, 248);
  assert.equal(original.impliedMovePct, 7.8, '원본 행(응답 캐시 객체)은 고치지 않는다');
  assert.equal(rows.OLD.impliedMovePct, 12.3, '표식 없는 행은 대상 아님');

  // ⑧ 시간 상한 — 읽기가 늦으면 그대로 두고 돌아온다
  seed();
  const slowStore = require('../src/services/redisClient');
  const realMget = slowStore.mgetFromCache;
  slowStore.mgetFromCache = (keys: string[]) => new Promise((r) => setTimeout(() => r(keys.map(() => null)), 300));
  const slowRows: Record<string, any> = { AMZN: analysisEntry('AMZN', 7.8) };
  const t0 = Date.now();
  await IMS.overlayCanonicalImpliedMoveRows(slowRows, 50);
  assert.ok(Date.now() - t0 < 250, '상한 안에 돌아온다');
  assert.equal(slowRows.AMZN.impliedMovePct, 7.8, '시간 초과 — 그대로');
  slowStore.mgetFromCache = realMget;
  await new Promise((r) => setTimeout(r, 350));

  // ⑨ 분석 캐시 입구(getAnalysisCacheForTickers·getAnalysisCache) — 이 캐시를 읽는 화면 전부가 7.9 · 저장본은 그대로(쓰기 0)
  seed();
  store.set('cache:analysis:AMZN', analysisEntry('AMZN', 7.8));
  store.set('cache:analysis:MSFT', analysisEntry('MSFT', 5.3, { price: 524.51 }));
  store.set('cache:analysis:META', analysisEntry('META', 4.4, { price: 642.62 }));
  const map = await at(WEEKEND, () => AC.getAnalysisCacheForTickers(['AMZN', 'MSFT', 'META']));
  assert.equal(map.AMZN.impliedMovePct, 7.9, 'unified·intel 이 읽는 분석 캐시 AMZN = 정본 7.9');
  assert.equal((map.AMZN as any).impliedMoveSession, SESSION);
  assert.equal(map.MSFT.impliedMovePct, 5.3);
  assert.equal(map.META.impliedMovePct, 4.4);
  assert.equal(store.get('cache:analysis:AMZN').impliedMovePct, 7.8, '저장본 불변(쓰기 0 — setInCache 는 호출되면 던진다)');
  IMS._resetCanonicalFieldsMemoForTest();
  const one = await at(WEEKEND, () => AC.getAnalysisCache('AMZN'));
  assert.equal(one?.impliedMovePct, 7.9, '단건 입구도 같은 값');

  // ⑩ 분석 캐시 — 장중 오늘 live 값은 그대로
  seed();
  store.set('cache:analysis:AMZN', { ...analysisEntry('AMZN', 8.4), timestamp: INTRADAY - 60_000, ...live });
  const liveMap = await at(INTRADAY, () => AC.getAnalysisCacheForTickers(['AMZN']));
  assert.equal(liveMap.AMZN.impliedMovePct, 8.4, '장중 live 불변');

  // ⑪ unified 라우트 — 모든 응답 갈래(메모리 fresh·warming·Redis 응답 캐시·분석 캐시·콜드 스타트)가 출구 overlayDashboardLevels 를 지나고,
  //    그 출구가 같은 공유 함수(overlayCanonicalImpliedMoveRows)를 부른다(라우트 파일은 setInterval 예열기를 띄워 직접 불러오지 않는다).
  const src = fs.readFileSync(path.join(__dirname, '../src/app/api/dashboard/unified/route.ts'), 'utf8');
  const getBody = src.slice(src.indexOf('export async function GET('), src.indexOf('async function fetchMarketData()'));
  const okReturns = getBody.match(/return NextResponse\.json\(\{\s*\n\s*\.\.\.\(await overlayDashboardLevels\(/g) || [];
  const allJsonReturns = getBody.match(/return NextResponse\.json\(/g) || [];
  assert.equal(okReturns.length, 5, '성공 응답 5갈래 모두 출구 덮기');
  assert.equal(allJsonReturns.length, okReturns.length + 1, '나머지 1개는 500 오류 응답뿐');
  const overlayBody = src.slice(src.indexOf('async function overlayDashboardLevels('), src.indexOf('export async function GET('));
  assert.match(overlayBody, /await overlayCanonicalImpliedMove\(next\);\s*\n\s*return \{ \.\.\.payload, tickers: next \};/);
  assert.match(overlayBody, /overlayCanonicalImpliedMoveRows\(rows, 500\)/);

  console.log('impliedMoveUnifiedCanonical: 11 묶음 통과');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
