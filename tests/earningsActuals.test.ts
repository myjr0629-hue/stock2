/**
 * 실적 발표 «실제 반응 vs 옵션 예상» — 규칙 · 크론 채우기 · 페이지 표시 (2026-10-14)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsActuals.test.ts
 *
 * 지키는 것:
 *   1. 기준 세션 — 장전 = 전일 종가→발표일 종가 · 장후 = 발표일 종가→다음 거래일 종가(주말·휴장 건너뜀) · 시각 미공지는 계산하지 않는다
 *   2. 확정 시각 — 정규장 마감(16:00 · 조기 폐장 13:00) + 30분 전에는 일봉을 쓰지 않는다
 *   3. 숫자 — 10/13 실측 6종목(JPM·JNJ·C·GS·UNH·WFC)의 등락률과 한 자리 반올림, 두 공급사 대조
 *   4. 예상 변동폭 저장 — 발표 전 범위의 세션만 · 발표가 끝나면 덮지 않는다 · 같은 값은 다시 쓰지 않는다 · 뒤로 가지 않는다
 *   5. 실제 반응 저장 — 확정 전 건너뜀 · 공급사 불일치면 저장 안 함 · FMP 가 없으면 단독 표시 · 한 번 저장하면 다시 계산하지 않는다
 *   6. 페이지 — 발표 완료 행에 «실제 −x% vs 옵션 예상 ±y%» · 마감 전이면 «… 마감 뒤 표시» · 기록 없으면 «—» · 읽기는 쓰기 0
 *   7. 크론 라우트 — 인증 · 문구(금지 표현 없음, 세 언어)
 */
import assert from 'node:assert/strict';

process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FMP_API_KEY = 'test-fmp';
process.env.FINNHUB_API_KEY = 'test-finnhub';
const store = new Map<string, unknown>();
let writes = 0;
const writeLog: Array<{ key: string; value: any; ttl?: number }> = [];
let failReads = false;
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (failReads && (u.pathname === '/get' || u.pathname === '/mget')) throw new Error('redis down');
  if (u.pathname === '/get') return Response.json({ result: store.get(u.searchParams.get('key') || '') ?? null });
  if (u.pathname === '/mget') {
    const keys = (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent);
    return Response.json({ results: keys.map((k) => store.get(k) ?? null) });
  }
  if (u.pathname === '/set' && init?.method === 'POST') {
    writes += 1;
    const b = JSON.parse(init.body || '{}');
    store.set(b.key, b.value);
    writeLog.push({ key: b.key, value: b.value, ttl: b.ttl });
    return Response.json({ ok: true });
  }
  if (u.hostname === 'financialmodelingprep.com') return Response.json([]);
  return new Response('not found', { status: 404 });
};

const A = require('../src/lib/earnings/earningsActuals') as typeof import('../src/lib/earnings/earningsActuals');
const EW = require('../src/lib/earningsWeek') as typeof import('../src/lib/earningsWeek');
const V = require('../src/lib/earningsWeekView') as typeof import('../src/lib/earningsWeekView');
const SVC = require('../src/services/earningsActualsService') as typeof import('../src/services/earningsActualsService');
const WEEK = require('../src/services/earningsWeekService') as typeof import('../src/services/earningsWeekService');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');
const ROUTE = require('../src/app/api/cron/earnings-actuals/route') as typeof import('../src/app/api/cron/earnings-actuals/route');
const { NextRequest } = require('next/server');

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const ms = (iso: string) => Date.parse(iso);
const reset = () => { store.clear(); writes = 0; writeLog.length = 0; failReads = false; WEEK._resetEarningsWeekMemo(); RC._resetEcBreakerForTest(); };

// 10/13 실측 종가(Intrinio 일봉 = CNBC = FMP 분할 미조정 — 12/12 센트까지 같았다)
const CLOSE: Record<string, [number, number, number]> = {   // [10/12 종가, 10/13 종가, 기대 등락률(%)]
  JPM: [334.3, 331.43, -0.8585], JNJ: [263.73, 248.61, -5.7331], C: [131.92, 124.53, -5.6019],
  GS: [893.95, 891.91, -0.2282], UNH: [378.52, 377.76, -0.2008], WFC: [83.32, 80.74, -3.0965],
};
const entry = (ticker: string, date: string, hour: 'amc' | 'bmo' | '', etTime?: string) => ({
  ticker, date, hour, etTime, sourceKind: 'company-pr' as const, sourceUrl: 'https://example.com', announcedOn: '', verifiedAt: '2026-10-11T00:00:00Z', quote: 'x',
});
const rowOf = (ticker: string, pct: number | null, session: string | null, expiry = '2026-10-16', basis: 'eod' | 'live' = 'eod') => ({
  ticker, impliedMovePct: pct, expiry: pct == null ? null : expiry, asOf: null, basis: pct == null ? null : basis, strike: pct == null ? null : 100, straddle: pct == null ? null : 4,
  spot: pct == null ? null : 100, source: pct == null ? null : ('structure' as const), session, reason: pct == null ? 'no_snapshot' : null,
});
const barsFrom = (m: Record<string, Array<[string, number]>>): import('../src/services/earningsActualsService').BarsFn => async (tk) => (m[tk] || []).map(([date, close]) => ({ date, close }));
const key = (tk: string, d: string) => A.actualsKey(tk, d);

(async () => {
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 1. 기준 세션 ━━━');
  t('장전 = 발표일 직전 거래일 → 발표일 · 월요일 장전은 금요일부터', () => {
    assert.deepEqual(A.reactionSessions('2026-10-13', 'bmo'), { base: '2026-10-12', react: '2026-10-13' });
    assert.deepEqual(A.reactionSessions('2026-10-12', 'bmo'), { base: '2026-10-09', react: '2026-10-12' });
    assert.deepEqual(A.reactionSessions('2026-09-08', 'bmo'), { base: '2026-09-04', react: '2026-09-08' }, '노동절(9/7) 건너뜀');
  });
  t('장후 = 발표일 → 다음 거래일 · 금요일 장후는 월요일 · 휴장 건너뜀', () => {
    assert.deepEqual(A.reactionSessions('2026-10-21', 'amc'), { base: '2026-10-21', react: '2026-10-22' });
    assert.deepEqual(A.reactionSessions('2026-10-16', 'amc'), { base: '2026-10-16', react: '2026-10-19' });
    assert.deepEqual(A.reactionSessions('2026-11-25', 'amc'), { base: '2026-11-25', react: '2026-11-27' }, '추수감사절(11/26) 건너뜀');
    assert.equal(A.nextTradingDate('2026-12-24'), '2026-12-28', '12/25 휴장 + 주말');
  });
  t('시각 미공지 · 휴장일·주말 발표일 · 모양 오류는 계산하지 않는다', () => {
    assert.equal(A.reactionSessions('2026-10-15', ''), null);
    assert.equal(A.reactionSessions('2026-10-17', 'bmo'), null);
    assert.equal(A.reactionSessions('2026-09-07', 'amc'), null);
    assert.equal(A.reactionSessions('10/13', 'bmo'), null);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 2. 일봉 확정 시각 ━━━');
  t('정규장 마감 + 30분 — 서머타임(16:30 ET = 20:30Z) · 표준시(21:30Z) · 조기 폐장(13:30 ET)', () => {
    assert.equal(A.reactionFinalAt('2026-10-13'), ms('2026-10-13T20:30:00Z'));
    assert.equal(A.reactionFinalAt('2026-11-03'), ms('2026-11-03T21:30:00Z'));
    assert.equal(A.reactionFinalAt('2026-11-27'), ms('2026-11-27T18:30:00Z'), '조기 폐장 13:00 ET + 30분');
    assert.equal(A.isReactionFinal('2026-10-13', ms('2026-10-13T20:29:59Z')), false);
    assert.equal(A.isReactionFinal('2026-10-13', ms('2026-10-13T20:30:00Z')), true);
    assert.equal(A.isReactionFinal('2026-10-13', ms('2026-10-13T15:00:00Z')), false, '장중');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 3. 숫자 ━━━');
  t('★ 10/13 실측 6종목 — 등락률(소수 4자리)과 화면 한 자리 글자', () => {
    const want: Record<string, string> = { JPM: '−0.9%', JNJ: '−5.7%', C: '−5.6%', GS: '−0.2%', UNH: '−0.2%', WFC: '−3.1%' };
    for (const [tk, [b, r, pct]] of Object.entries(CLOSE)) {
      const got = A.pctChange(b, r)!;
      assert.ok(Math.abs(got - pct) < 0.0002, `${tk}: ${got} vs ${pct}`);
      assert.equal(A.signedPctText(got), want[tk], tk);
    }
  });
  t('반올림 — 절댓값 half-up · 0.0% 는 부호 없음 · 양수는 + · 값 없으면 —', () => {
    assert.equal(A.signedPctText(0.85), '+0.9%'); assert.equal(A.signedPctText(-0.85), '−0.9%');
    assert.equal(A.signedPctText(0.049), '0.0%'); assert.equal(A.signedPctText(-0.04), '0.0%');
    assert.equal(A.signedPctText(12.34), '+12.3%'); assert.equal(A.signedPctText(null), '—');
    assert.equal(A.expectedPctText(3.2), '±3.2%'); assert.equal(A.expectedPctText(0), '—'); assert.equal(A.expectedPctText(null), '—');
    assert.equal(A.pctChange(0, 1), null); assert.equal(A.pctChange(10, -1), null);
  });
  t('두 공급사 대조 — 센트 차는 일치 · 0.1% 넘으면 불일치', () => {
    assert.equal(A.closesAgree(331.43, 331.43), true);
    assert.equal(A.closesAgree(331.43, 331.57), true, 'Nasdaq 마지막 체결(14센트 차 = 0.04%)');
    assert.equal(A.closesAgree(331.43, 333.0), false);
    assert.equal(A.closesAgree(0, 1), false);
  });
  t('예상 변동폭 저장 범위 — 장전: 세션 < 발표일 · 장후: 세션 ≤ 발표일 · 모르면 거절', () => {
    assert.equal(A.expectedEligible({ date: '2026-10-13', hour: 'bmo' }, '2026-10-12'), true);
    assert.equal(A.expectedEligible({ date: '2026-10-13', hour: 'bmo' }, '2026-10-13'), false, '발표일 장중·마감 값은 발표 뒤 값');
    assert.equal(A.expectedEligible({ date: '2026-10-21', hour: 'amc' }, '2026-10-21'), true, '발표일 마감까지는 발표 전');
    assert.equal(A.expectedEligible({ date: '2026-10-21', hour: 'amc' }, '2026-10-22'), false);
    assert.equal(A.expectedEligible({ date: '2026-10-21', hour: 'amc' }, null), false);
    assert.equal(A.expectedEligible({ date: '2026-10-21', hour: '' }, '2026-10-20'), false);
  });
  t('저장본 모양 검사 — 모양이 틀리면 버린다(읽는 쪽은 믿지 않는다)', () => {
    assert.equal(A.parseRecord(null), null); assert.equal(A.parseRecord({ v: 2 }), null);
    assert.equal(A.parseRecord({ v: 1, ticker: 'C', date: '2026-10-13', hour: '' }), null);
    const ok = A.parseRecord({ v: 1, ticker: 'c', date: '2026-10-13', hour: 'bmo', expected: { pct: -1, session: '2026-10-12' }, actual: { pct: 'x' }, at: 5 })!;
    assert.equal(ok.ticker, 'C'); assert.equal(ok.expected, null, '음수 예상은 버림'); assert.equal(ok.actual, null);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 4. 예상 변동폭 저장(크론 ①) ━━━');
  const NOW_EVE = ms('2026-10-13T22:00:00Z');       // 10/13 18:00 ET — 10/13 장전은 발표 완료, 10/14 장전은 발표 전
  await ta('★ 발표 전 + 세션이 범위 안 → 저장(120일 TTL) · 같은 값은 다시 쓰지 않는다', async () => {
    reset();
    const list = [entry('BAC', '2026-10-14', 'bmo')];
    const deps = { readImplied: async () => [rowOf('BAC', 4.2, '2026-10-13')] };
    const r1 = await SVC.runActualsCycle({ nowMs: NOW_EVE, list, deps });
    assert.deepEqual(r1.expectedSaved, ['BAC|2026-10-14:4.2']);
    assert.equal(writes, 1); assert.equal(writeLog[0].key, key('BAC', '2026-10-14')); assert.equal(writeLog[0].ttl && writeLog[0].ttl > 100 * 86400, true, 'TTL 120일(지터 포함)');
    const rec = store.get(key('BAC', '2026-10-14')) as any;
    assert.equal(rec.expected.pct, 4.2); assert.equal(rec.expected.session, '2026-10-13'); assert.equal(rec.expected.src, 'page'); assert.equal(rec.actual, null);
    const r2 = await SVC.runActualsCycle({ nowMs: NOW_EVE + 600_000, list, deps });
    assert.deepEqual(r2.expectedSaved, []); assert.equal(writes, 1, '같은 값 — 쓰기 0');
  });
  await ta('값이 바뀌면(같은 발표 전 범위) 마지막 값으로 덮는다 · 더 이른 세션으로는 되돌아가지 않는다', async () => {
    reset();
    const list = [entry('MS', '2026-10-14', 'bmo')];
    await SVC.runActualsCycle({ nowMs: NOW_EVE, list, deps: { readImplied: async () => [rowOf('MS', 4.3, '2026-10-13')] } });
    const r = await SVC.runActualsCycle({ nowMs: NOW_EVE + 3_600_000, list, deps: { readImplied: async () => [rowOf('MS', 4.5, '2026-10-13')] } });
    assert.deepEqual(r.expectedSaved, ['MS|2026-10-14:4.5']);
    const back = await SVC.runActualsCycle({ nowMs: NOW_EVE + 7_200_000, list, deps: { readImplied: async () => [rowOf('MS', 4.0, '2026-10-12')] } });
    assert.deepEqual(back.expectedSaved, []); assert.ok(back.skipped.some((s) => s.reason === 'expected:older_session'));
    assert.equal((store.get(key('MS', '2026-10-14')) as any).expected.pct, 4.5);
  });
  await ta('★ 발표 뒤에 계산된 값은 저장하지 않는다 — 장전 발표일 장중 세션 · 장후의 다음 날 세션', async () => {
    reset();
    const bmo = [entry('JPM', '2026-10-13', 'bmo')];
    const r = await SVC.runActualsCycle({ nowMs: ms('2026-10-13T12:00:00Z'), list: bmo, deps: { readImplied: async () => [rowOf('JPM', 3.0, '2026-10-13', '2026-10-16', 'live')] } });   // 08:00 ET 아직 발표 전이지만 세션이 발표일
    assert.deepEqual(r.expectedSaved, []); assert.ok(r.skipped.some((s) => s.reason.startsWith('expected:session_2026-10-13_out_of_range')));
    assert.equal(writes, 0);
    const amc = [entry('NFLX', '2026-10-20', 'amc')];
    const r2 = await SVC.runActualsCycle({ nowMs: ms('2026-10-20T19:00:00Z'), list: amc, deps: { readImplied: async () => [rowOf('NFLX', 7.0, '2026-10-20', '2026-10-23', 'live')] } });
    assert.deepEqual(r2.expectedSaved, ['NFLX|2026-10-20:7'], '장후는 발표일 장중 값이 «발표 전 마지막 값»');
  });
  await ta('★ 발표가 끝나면(phase done) 읽지도 덮지도 않는다 — 마지막 발표 전 값이 남는다', async () => {
    reset();
    const list = [entry('C', '2026-10-13', 'bmo', '08:00')];
    store.set(key('C', '2026-10-13'), { v: 1, ticker: 'C', date: '2026-10-13', hour: 'bmo', expected: { pct: 4, expiry: '2026-10-16', session: '2026-10-12', basis: 'eod', strike: 132, straddle: 5.33, spot: 131.92, capturedAt: 1, src: 'page' }, actual: null, at: 1 });
    let asked = 0;
    const r = await SVC.runActualsCycle({ nowMs: NOW_EVE, list, deps: { readImplied: async () => { asked++; return [rowOf('C', 3.0, '2026-10-13')]; }, bars: barsFrom({}), fmp: barsFrom({}) } });
    assert.equal(asked, 0, '발표 완료 종목은 예상 읽기 자체를 안 한다'); assert.deepEqual(r.expectedSaved, []);
    assert.equal((store.get(key('C', '2026-10-13')) as any).expected.pct, 4);
  });
  await ta('시각 미공지 종목·저장본 없음은 건너뜀(지어내지 않는다)', async () => {
    reset();
    const list = [entry('PLD', '2026-10-15', ''), entry('ZZZ', '2026-10-14', 'bmo')];
    const r = await SVC.runActualsCycle({ nowMs: NOW_EVE, list, deps: { readImplied: async () => [rowOf('ZZZ', null, null)] } });
    assert.equal(r.considered, 1, '미공지(PLD)는 후보가 아니다'); assert.deepEqual(r.expectedSaved, []); assert.equal(writes, 0);
    assert.ok(r.skipped.some((s) => s.reason === 'expected:no_snapshot'));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 5. 실제 반응 저장(크론 ②) ━━━');
  const NOW_AFTER = ms('2026-10-13T21:30:00Z');     // 10/13 17:30 ET — 10/13 일봉 확정(16:30 ET) 뒤
  const jpmBars = barsFrom({ JPM: [['2026-10-09', 332.99], ['2026-10-12', 334.3], ['2026-10-13', 331.43]] });
  const jpmFmp = barsFrom({ JPM: [['2026-10-12', 334.3], ['2026-10-13', 331.43]] });
  await ta('★ 장전 발표 — 10/12 종가 334.30 → 10/13 종가 331.43 = −0.8585% · FMP 대조 일치', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo')];
    const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: jpmBars, fmp: jpmFmp } });
    assert.deepEqual(r.actualsSaved, ['JPM|2026-10-13:-0.8585']);
    const rec = store.get(key('JPM', '2026-10-13')) as any;
    assert.equal(rec.hour, 'bmo'); assert.equal(rec.actual.baseDate, '2026-10-12'); assert.equal(rec.actual.reactDate, '2026-10-13');
    assert.deepEqual([rec.actual.baseClose, rec.actual.reactClose, rec.actual.check, rec.actual.src], [334.3, 331.43, 'fmp', 'intrinio-daily']);
  });
  await ta('일봉이 확정되기 전(16:30 ET 이전)에는 벤더를 부르지 않는다 · 확정 뒤 한 번 저장하면 다시 계산하지 않는다', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo')];
    let calls = 0;
    const counting: import('../src/services/earningsActualsService').BarsFn = async (...a) => { calls++; return jpmBars(...a); };
    const early = await SVC.runActualsCycle({ nowMs: ms('2026-10-13T20:10:00Z'), list, deps: { bars: counting, fmp: jpmFmp } });   // 16:10 ET
    assert.equal(calls, 0); assert.ok(early.skipped.some((s) => s.reason === 'actual:not_final')); assert.equal(writes, 0);
    await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: counting, fmp: jpmFmp } });
    assert.equal(calls, 1);
    await SVC.runActualsCycle({ nowMs: NOW_AFTER + 1_800_000, list, deps: { bars: counting, fmp: jpmFmp } });
    assert.equal(calls, 1, '저장된 뒤에는 벤더 0');
  });
  await ta('★ 장후 발표 — 발표일 종가 → 다음 거래일 종가(금요일 장후는 월요일)', async () => {
    reset();
    const list = [entry('ZZ', '2026-10-16', 'amc')];
    const bars = barsFrom({ ZZ: [['2026-10-15', 50], ['2026-10-16', 100], ['2026-10-19', 108.5]] });
    const fmp = barsFrom({ ZZ: [['2026-10-16', 100], ['2026-10-19', 108.5]] });
    const fri = await SVC.runActualsCycle({ nowMs: ms('2026-10-17T01:00:00Z'), list, deps: { bars, fmp } });
    assert.deepEqual(fri.actualsSaved, [], '금요일 밤에는 아직 — 반응일(월요일) 정규장이 안 끝났다');
    const mon = await SVC.runActualsCycle({ nowMs: ms('2026-10-19T21:00:00Z'), list, deps: { bars, fmp } });
    assert.deepEqual(mon.actualsSaved, ['ZZ|2026-10-16:8.5']);
    assert.equal((store.get(key('ZZ', '2026-10-16')) as any).actual.reactDate, '2026-10-19');
  });
  await ta('★ 두 공급사 종가가 다르면 저장하지 않는다 · FMP 가 못 주면 Intrinio 단독으로 저장(check null)', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo')];
    const bad = barsFrom({ JPM: [['2026-10-12', 334.3], ['2026-10-13', 336.9]] });
    const r1 = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: jpmBars, fmp: bad } });
    assert.deepEqual(r1.actualsSaved, []); assert.ok(r1.skipped.some((s) => s.reason.startsWith('actual:vendor_mismatch'))); assert.equal(writes, 0);
    const r2 = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: jpmBars, fmp: async () => { throw new Error('fmp down'); } } });
    assert.deepEqual(r2.actualsSaved, ['JPM|2026-10-13:-0.8585:single']);
    assert.equal((store.get(key('JPM', '2026-10-13')) as any).actual.check, null);
    reset();
    const r3 = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: jpmBars, fmp: barsFrom({}) } });
    assert.equal(r3.actualsSaved.length, 1, 'FMP 가 빈 응답이어도 단독 저장'); assert.equal((store.get(key('JPM', '2026-10-13')) as any).actual.check, null);
  });
  await ta('일봉에 기준일·반응일이 없으면 건너뜀 · 50% 넘는 변동은 오염으로 거절 · 8일 지난 기록은 자동으로 채우지 않는다', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo')];
    const noReact = barsFrom({ JPM: [['2026-10-09', 332.99], ['2026-10-12', 334.3]] });
    const r1 = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: noReact, fmp: jpmFmp } });
    assert.ok(r1.skipped.some((s) => s.reason.startsWith('actual:bar_missing')));
    const split = barsFrom({ JPM: [['2026-10-12', 334.3], ['2026-10-13', 83.5]] });
    const r2 = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: split, fmp: barsFrom({ JPM: [['2026-10-12', 334.3], ['2026-10-13', 83.5]] }) } });
    assert.ok(r2.skipped.some((s) => s.reason.startsWith('actual:implausible')));
    const old = await SVC.runActualsCycle({ nowMs: ms('2026-10-23T21:00:00Z'), list, deps: { bars: jpmBars, fmp: jpmFmp } });
    assert.ok(old.skipped.some((s) => s.reason === 'actual:too_old')); assert.equal(writes, 0);
  });
  await ta('벤더가 던져도 회차는 끝난다(다른 종목은 계속) · dryRun 은 저장하지 않는다', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo'), entry('JNJ', '2026-10-13', 'bmo')];
    const bars: import('../src/services/earningsActualsService').BarsFn = async (tk, f, to) => {
      if (tk === 'JPM') throw new Error('intrinio 429');
      return barsFrom({ JNJ: [['2026-10-12', 263.73], ['2026-10-13', 248.61]] })(tk, f, to);
    };
    const fmp = barsFrom({ JNJ: [['2026-10-12', 263.73], ['2026-10-13', 248.61]] });
    const dry = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars, fmp }, dryRun: true });
    assert.equal(dry.actualsSaved.length, 1); assert.equal(writes, 0, 'dryRun');
    const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars, fmp } });
    assert.deepEqual(r.actualsSaved, ['JNJ|2026-10-13:-5.7331']); assert.ok(r.skipped.some((s) => s.key === 'JPM|2026-10-13' && s.reason.startsWith('actual:error')));
  });
  await ta('수동 보강(seedExpected) — 이미 값이 있으면 건드리지 않고, 실제 반응 기록은 그대로 둔다', async () => {
    reset();
    const snap = { pct: 3.2, expiry: '2026-10-16', session: '2026-10-12', basis: 'eod' as const, strike: 335, straddle: 10.58, spot: 334.3, capturedAt: 1, src: 'eod-chain' as const };
    assert.equal(await SVC.seedExpected({ ticker: 'JPM', date: '2026-10-13', hour: 'bmo' }, snap), 'saved');
    assert.equal(await SVC.seedExpected({ ticker: 'JPM', date: '2026-10-13', hour: 'bmo' }, { ...snap, pct: 9.9 }), 'kept');
    await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: jpmFmp } });
    const rec = store.get(key('JPM', '2026-10-13')) as any;
    assert.equal(rec.expected.pct, 3.2); assert.equal(rec.expected.src, 'eod-chain'); assert.equal(rec.actual.pct, -0.8585, '예상은 그대로, 실제만 채워졌다');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 6. 페이지 표시 ━━━');
  await ta('★ 발표 완료 행 — «실제 −0.9% vs 옵션 예상 ±3.2%» + 출처·기준 시각 줄(세 언어) · 쓰기 0', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo'), entry('GS', '2026-10-13', 'bmo', '07:30'), entry('UNH', '2026-10-13', 'bmo')];
    store.set(key('JPM', '2026-10-13'), { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', at: 1,
      expected: { pct: 3.2, expiry: '2026-10-16', session: '2026-10-12', basis: 'eod', strike: 335, straddle: 10.58, spot: 334.3, capturedAt: 1, src: 'eod-chain' },
      actual: { pct: -0.8585, baseDate: '2026-10-12', baseClose: 334.3, reactDate: '2026-10-13', reactClose: 331.43, src: 'intrinio-daily', check: 'fmp', at: 2 } });
    store.set(key('GS', '2026-10-13'), { v: 1, ticker: 'GS', date: '2026-10-13', hour: 'bmo', at: 1,
      expected: { pct: 4.2, expiry: '2026-10-16', session: '2026-10-12', basis: 'eod', strike: 895, straddle: 37.1, spot: 893.95, capturedAt: 1, src: 'eod-chain' },
      actual: { pct: -0.2282, baseDate: '2026-10-12', baseClose: 893.95, reactDate: '2026-10-13', reactClose: 891.91, src: 'intrinio-daily', check: null, at: 2 } });
    const w0 = writes;
    const now = ms('2026-10-14T01:00:00Z');
    const d = await WEEK.buildEarningsWeek(now, list);
    assert.equal(writes, w0, '페이지 읽기 — Redis 쓰기 0');
    const row = (tk: string) => d.rows.find((r) => r.ticker === tk)!;
    assert.equal(row('JPM').actual!.pct, -0.8585); assert.equal(row('JPM').expectedAtReport!.pct, 3.2);
    const ko = V.viewRow(row('JPM'), 'ko', d, now);
    assert.equal(ko.phase, 'done'); assert.equal(ko.moveText, null, '발표 완료 행의 옛 «예상 변동폭» 칸은 그대로 비어 있다');
    assert.equal(ko.actual!.headline, '실제 −0.9%'); assert.equal(ko.actual!.vs, 'vs 옵션 예상 ±3.2%');
    assert.equal(ko.actual!.src, '종가 10/12(월) $334.30 → 10/13(화) $331.43 · 출처 Intrinio 일봉(FMP 대조) · 옵션 예상은 10/12(월) 마감 호가 기준 · 10/16 만기까지');
    const en = V.viewRow(row('JPM'), 'en', d, now);
    assert.equal(en.actual!.headline, 'Actual −0.9%'); assert.equal(en.actual!.vs, 'vs options-implied ±3.2%');
    assert.equal(en.actual!.src, 'Closes 10/12 (Mon) $334.30 → 10/13 (Tue) $331.43 · Source: Intrinio daily bars (cross-checked with FMP) · Implied move: 10/12 (Mon) closing quotes, to the 10/16 expiry');
    const ja = V.viewRow(row('JPM'), 'ja', d, now);
    assert.equal(ja.actual!.headline, '実際 −0.9%'); assert.equal(ja.actual!.vs, 'vs オプション予想 ±3.2%');
    assert.equal(ja.actual!.src, '終値 10/12(月) $334.30 → 10/13(火) $331.43 · 出典 Intrinio日足(FMP照合) · オプション予想は10/12(月)引けの気配が基準 · 10/16満期まで');
    const gs = V.viewRow(row('GS'), 'ko', d, now);
    assert.equal(gs.actual!.headline, '실제 −0.2%'); assert.ok(!gs.actual!.src.includes('FMP'), '대조 못 한 값은 «FMP 대조»라고 쓰지 않는다');
    const unh = V.viewRow(row('UNH'), 'ko', d, now);
    assert.equal(unh.phase, 'done'); assert.equal(unh.actual, null); assert.equal(unh.actualPending, null, '반응일 마감이 지났는데 기록이 없으면 «—» (지어내지 않는다)');
  });
  await ta('★ 장후 발표 완료 + 반응일 정규장 전 — «10/15(목) 정규장 마감 뒤 표시» · 발표 전/오늘 행에는 없다', async () => {
    reset();
    const list = [entry('NFLX', '2026-10-14', 'amc'), entry('ABC', '2026-10-15', 'amc')];
    const now = ms('2026-10-14T22:30:00Z');       // 10/14 18:30 ET — NFLX 발표 완료(18:00), 반응일 10/15 마감 전
    const d = await WEEK.buildEarningsWeek(now, list);
    const nf = V.viewRow(d.rows.find((r) => r.ticker === 'NFLX')!, 'ko', d, now);
    assert.equal(nf.phase, 'done'); assert.equal(nf.actual, null); assert.equal(nf.actualPending, '10/15(목) 정규장 마감 뒤 표시');
    assert.equal(V.viewRow(d.rows.find((r) => r.ticker === 'NFLX')!, 'en', d, now).actualPending, 'Shown after the 10/15 (Thu) close');
    assert.equal(V.viewRow(d.rows.find((r) => r.ticker === 'NFLX')!, 'ja', d, now).actualPending, '10/15(木) 引け後に表示');
    const abc = V.viewRow(d.rows.find((r) => r.ticker === 'ABC')!, 'ko', d, now);
    assert.equal(abc.phase, 'upcoming'); assert.equal(abc.actual, null); assert.equal(abc.actualPending, null);
  });
  await ta('시각 미공지·Redis 읽기 실패 — 페이지는 던지지 않고 이 칸만 비운다', async () => {
    reset();
    const list = [entry('PLD', '2026-10-13', ''), entry('JPM', '2026-10-13', 'bmo')];
    const now = ms('2026-10-14T01:00:00Z');
    failReads = true;
    const d = await WEEK.buildEarningsWeek(now, list);
    const pld = V.viewRow(d.rows.find((r) => r.ticker === 'PLD')!, 'ko', d, now);
    assert.equal(pld.actual, null); assert.equal(pld.actualPending, null);
    assert.equal(V.viewRow(d.rows.find((r) => r.ticker === 'JPM')!, 'ko', d, now).actual, null);
    failReads = false;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 7. 크론 라우트 · 문구 ━━━');
  await ta('크론 — 운영(production)에서 CRON_SECRET 이 틀리면 401 · 맞으면 보고 JSON', async () => {
    reset();
    const env = process.env as Record<string, string | undefined>;
    const prev = [env.NODE_ENV, env.CRON_SECRET];
    env.NODE_ENV = 'production'; env.CRON_SECRET = 'sekret';
    try {
      const bad = await ROUTE.GET(new NextRequest('https://x.test/api/cron/earnings-actuals', { headers: { authorization: 'Bearer nope' } }));
      assert.equal(bad.status, 401);
      const ok = await ROUTE.GET(new NextRequest('https://x.test/api/cron/earnings-actuals?dry=1', { headers: { authorization: 'Bearer sekret' } }));
      assert.equal(ok.status, 200);
      const j = await ok.json();
      assert.equal(j.success, true); assert.equal(j.dryRun, true); assert.equal(typeof j.considered, 'number');
    } finally { env.NODE_ENV = prev[0]; if (prev[1] === undefined) delete env.CRON_SECRET; else env.CRON_SECRET = prev[1]; }
  });
  t('새 문구 — 금지 표현(확실·보장·권유) 없음 · 세 언어에 같은 키 · 금융 공통어는 영어 그대로', () => {
    for (const loc of EW.EW_LOCALES) {
      const c = EW.COPY[loc].actual;
      const text = [c.word, c.vs('±3.2%'), c.closes({ base: '10/12', baseClose: '$1', react: '10/13', reactClose: '$2', fmp: true }), c.closes({ base: '10/12', baseClose: '$1', react: '10/13', reactClose: '$2', fmp: false }),
        c.implied({ day: '10/12', expiry: '10/16', live: false }), c.implied({ day: '10/12', expiry: null, live: true }), c.pending({ md: '10/15' }), ...EW.COPY[loc].read.map((r) => r.join(' '))].join('\n');
      for (const re of EW.BANNED_WORDS) assert.doesNotMatch(text, re, `${loc}: ${re}`);
      assert.match(text, /Intrinio|FMP/);
      const adv = text.split('\n').filter((s) => /추천|recommend|おすすめ|推奨/i.test(s));
      assert.equal(adv.length, 0, `${loc}: 권유 어휘`);
    }
    assert.match(EW.COPY.ko.actual.vs('x'), /옵션 예상/); assert.match(EW.COPY.ja.actual.vs('x'), /オプション予想/); assert.match(EW.COPY.en.actual.vs('x'), /options-implied/);
    for (const loc of EW.EW_LOCALES) assert.equal(EW.COPY[loc].read.length, 5, `${loc}: 읽는 법 5항목`);
  });

  console.log(`\n${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
