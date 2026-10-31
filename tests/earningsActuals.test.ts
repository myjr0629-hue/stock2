/**
 * 실적 발표 «실제 반응 vs 옵션 예상» — 규칙 · 크론 채우기 · 페이지 표시 (2026-10-14)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsActuals.test.ts
 *
 * 지키는 것:
 *   1. 기준 세션 — 장전 = 전일 종가→발표일 종가 · 장후 = 발표일 종가→다음 거래일 종가(주말·휴장 건너뜀) · 시각 미공지는 계산하지 않는다
 *   2. 확정 시각 — 정규장 마감(16:00 · 조기 폐장 13:00) + 30분 전에는 일봉을 쓰지 않는다
 *   3. 숫자 — 10/13 실측 6종목(JPM·JNJ·C·GS·UNH·WFC)의 등락률과 한 자리 반올림, 두 공급사 대조
 *   4. 예상 변동폭 저장 — 기준 세션(AMC 발표일·BMO 전 거래일)의 마감 관측만 · 빈 기록에 한 번만 · 장후 실시간 거절 · 지연 관측 허용
 *   5. 실제 반응 저장 — 확정 전 건너뜀 · 공급사 불일치면 저장 안 함 · FMP 가 없으면 단독 표시 · 한 번 저장하면 다시 계산하지 않는다 · 단독 기록은 다음 회차가 FMP 로 대조 보강(불일치면 지움)
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
let failMget = false;
let fmpRows: unknown = [];
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (failReads && (u.pathname === '/get' || u.pathname === '/mget')) throw new Error('redis down');
  if (failMget && u.pathname === '/mget') return Response.json({ results: [] });   // 응답은 왔지만 값이 비었다(묶음 읽기는 이를 «없음»으로 본다)
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
  if (u.hostname === 'financialmodelingprep.com') return Response.json(fmpRows);
  return new Response('not found', { status: 404 });
};

// Provider tests: the shared FMP guard has its own tests (fmpOpenBurst). Pass straight to the fetch stub.
const fmpClientPath = require.resolve('../src/lib/fmpClient');
require.cache[fmpClientPath] = { id: fmpClientPath, filename: fmpClientPath, loaded: true,
  exports: { fmpFetch: (url: string) => globalThis.fetch(url) } } as NodeModule;
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
const reset = () => { store.clear(); writes = 0; writeLog.length = 0; failReads = false; failMget = false; WEEK._resetEarningsWeekMemo(); RC._resetEcBreakerForTest(); };

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
  method: pct == null ? null : 'monthly' as const, straddlePct: pct,
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
  // 2026-10-30 정책: expected = 기준 세션(AMC 발표일 · BMO 전 거래일)의 «마감 관측»만 · 빈 기록에 한 번만 · 장후 실시간 합성가 배제
  const obsOf = (ticker: string, pct: number | null, session: string | null, expiry = '2026-10-16', basis: 'eod' | 'live' = 'eod') =>
    ({ ...rowOf(ticker, pct, session, expiry, basis), source: pct == null ? null : ('probe' as const) });
  type Obs = ReturnType<typeof obsOf>;
  const obsDeps = (stored: Obs | null, probed: Obs | null = stored, log?: { reads: number; probes: number }) => ({
    runLock: async () => 'ok' as const,
    readObservation: async (_c: unknown, probe: boolean) => { if (log) { if (probe) log.probes++; else log.reads++; } return probe ? probed : stored; },
  });
  await ta('★ 장전 발표 — 전 거래일 마감 관측 저장(120일 TTL) · 한 번 저장되면 다시 읽지도 쓰지도 않는다', async () => {
    reset();
    const list = [entry('BAC', '2026-10-14', 'bmo')];
    const log = { reads: 0, probes: 0 };
    const r1 = await SVC.runActualsCycle({ nowMs: NOW_EVE, list, deps: obsDeps(obsOf('BAC', 4.2, '2026-10-13'), undefined, log) });
    assert.deepEqual(r1.expectedSaved, ['BAC|2026-10-14:4.2']);
    assert.equal(writes, 1); assert.equal(writeLog[0].key, key('BAC', '2026-10-14')); assert.equal(writeLog[0].ttl && writeLog[0].ttl > 100 * 86400, true, 'TTL 120일(지터 포함)');
    const rec = store.get(key('BAC', '2026-10-14')) as any;
    assert.equal(rec.expected.pct, 4.2); assert.equal(rec.expected.session, '2026-10-13'); assert.equal(rec.expected.src, 'page'); assert.equal(rec.actual, null);
    assert.equal(rec.expected.method, 'monthly'); assert.equal(rec.expected.straddlePct, 4.2); assert.equal(rec.expected.basis, 'eod');
    assert.equal(log.probes, 0, '저장본이 기준 세션이면 공급사 조회 없음');
    const r2 = await SVC.runActualsCycle({ nowMs: NOW_EVE + 600_000, list, deps: obsDeps(obsOf('BAC', 5.5, '2026-10-13'), undefined, log) });
    assert.deepEqual(r2.expectedSaved, []); assert.equal(writes, 1, '저장된 expected 는 덮지 않는다'); assert.equal(log.reads, 1, '채워진 기록은 관측을 읽지도 않는다');
  });
  await ta('분리값·ATM 원값을 함께 저장한다(영수증은 ATM 원값)', async () => {
    reset();
    const list = [entry('MIX', '2026-10-14', 'bmo')];
    const split = { ...obsOf('MIX', 7.7, '2026-10-13'), method: 'event-split' as const, straddlePct: 8.6, straddle: 8.6 };
    await SVC.runActualsCycle({ nowMs: NOW_EVE, list, deps: obsDeps(split) });
    const rec = A.parseRecord(store.get(key('MIX', '2026-10-14')))!;
    assert.equal(writes, 1);
    assert.equal(rec.expected!.pct, 7.7); assert.equal(rec.expected!.method, 'event-split');
    assert.equal(A.atmReceiptExpectedPct(rec.expected!), 8.6);
    const receiptRecord = { ...rec, actual: { pct: 8, baseDate: '2026-10-13', baseClose: 100,
      reactDate: '2026-10-14', reactClose: 108, src: 'intrinio-daily', check: 'fmp', at: ms('2026-10-14T21:00:00Z') } };
    const receipts = require('../src/lib/earnings/earningsReceipts') as typeof import('../src/lib/earnings/earningsReceipts');
    const receipt = receipts.buildEarningsReceipts('2026-10-12', list, [receiptRecord], ms('2026-10-20T21:00:00Z'));
    assert.equal(receipt.rows[0].expected!.pct, 8.6); assert.equal(receipt.rows[0].beyond, false);
  });
  await ta('★ INTC 10/29 장후 — 장중 저장 안 함 · 16:05 실시간·전일 관측 거절 · 다음 날 아침 발표일 마감 관측 저장 · 그 뒤 값으로 안 덮음', async () => {
    reset();
    const list = [entry('INTC', '2026-10-29', 'amc')];
    const log = { reads: 0, probes: 0 };
    // 10/29 12:00 ET — 기준 세션(10/29) 마감 전: 10/28 관측(9.2)이 있어도 저장하지 않는다
    const r0 = await SVC.runActualsCycle({ nowMs: ms('2026-10-29T16:00:00Z'), list, deps: obsDeps(obsOf('INTC', 9.2, '2026-10-28', '2026-10-30'), undefined, log) });
    assert.deepEqual(r0.expectedSaved, []); assert.ok(r0.skipped.some((x) => x.reason === 'expected:base_session_open')); assert.equal(log.reads + log.probes, 0);
    // 10/29 16:05 ET — 장 마감 뒤 실시간 합성가(basis live)는 세션이 같아도 거절
    const r1 = await SVC.runActualsCycle({ nowMs: ms('2026-10-29T20:05:00Z'), list, deps: obsDeps(obsOf('INTC', 14.4, '2026-10-29', '2026-10-30', 'live')) });
    assert.deepEqual(r1.expectedSaved, []); assert.ok(r1.skipped.some((x) => x.reason === 'expected:basis_live'));
    // 10/29 17:25 ET — 저장본은 아직 10/28, 공급사 EOD 도 아직 → 비워 두고 재시도
    const r2 = await SVC.runActualsCycle({ nowMs: ms('2026-10-29T21:25:00Z'), list, deps: obsDeps(obsOf('INTC', 9.2, '2026-10-28', '2026-10-30'), null, log) });
    assert.deepEqual(r2.expectedSaved, []); assert.equal(log.probes, 1, '반응일 마감 전이면 직접 조회');
    assert.ok(r2.skipped.some((x) => x.reason === 'expected:session_2026-10-28_not_2026-10-29'));
    assert.equal(writes, 0);
    // 10/30 07:20 ET — 지연 도착한 10/29 마감 관측(6.9) 저장
    const r3 = await SVC.runActualsCycle({ nowMs: ms('2026-10-30T11:20:00Z'), list, deps: obsDeps(obsOf('INTC', 9.2, '2026-10-28', '2026-10-30'), obsOf('INTC', 6.9, '2026-10-29', '2026-10-30'), log) });
    assert.deepEqual(r3.expectedSaved, ['INTC|2026-10-29:6.9']);
    assert.equal((store.get(key('INTC', '2026-10-29')) as any).expected.session, '2026-10-29');
    // 10/30 19:00 ET — 발표 뒤 세션 관측은 기록을 건드리지 않는다
    const r4 = await SVC.runActualsCycle({ nowMs: ms('2026-10-30T23:00:00Z'), list, deps: { ...obsDeps(obsOf('INTC', 8.0, '2026-10-30', '2026-11-06')), bars: barsFrom({}), fmp: barsFrom({}) } });
    assert.deepEqual(r4.expectedSaved, []); assert.equal((store.get(key('INTC', '2026-10-29')) as any).expected.pct, 6.9);
  });
  await ta('★ 장전 발표일 세션 관측·발표 전 만기 관측은 거절 · 반응일 마감 뒤엔 직접 조회 없이 저장된 지연 관측만 읽는다', async () => {
    reset();
    const bmo = [entry('JPM', '2026-10-13', 'bmo')];
    const r = await SVC.runActualsCycle({ nowMs: ms('2026-10-13T11:20:00Z'), list: bmo, deps: obsDeps(obsOf('JPM', 3.0, '2026-10-13'), null) });
    assert.deepEqual(r.expectedSaved, []); assert.ok(r.skipped.some((x) => x.reason.startsWith('expected:session_2026-10-13_not_2026-10-12')));
    const r1 = await SVC.runActualsCycle({ nowMs: ms('2026-10-13T11:20:00Z'), list: bmo, deps: obsDeps(obsOf('JPM', 3.0, '2026-10-12', '2026-10-09')) });
    assert.ok(r1.skipped.some((x) => x.reason === 'expected:expiry_2026-10-09'));
    assert.equal(writes, 0);
    const amc = [entry('NFLX', '2026-10-20', 'amc')];
    const log = { reads: 0, probes: 0 };
    const r2 = await SVC.runActualsCycle({ nowMs: ms('2026-10-23T12:00:00Z'), list: amc, deps: { ...obsDeps(obsOf('NFLX', 7.0, '2026-10-20', '2026-10-23'), null, log), bars: barsFrom({}), fmp: barsFrom({}) } });
    assert.deepEqual(r2.expectedSaved, ['NFLX|2026-10-20:7'], '발표 사흘 뒤에도 기준 세션 관측이면 저장');
    assert.equal(log.probes, 0, '반응일(10/21) 마감 뒤 — 첫 만기가 지날 수 있어 직접 조회하지 않는다');
  });
  await ta('★ 검증 없는 옛 기록은 확인된 기준 세션 관측으로 교체한다', async () => {
    reset();
    const list = [entry('C', '2026-10-13', 'bmo', '08:00')];
    store.set(key('C', '2026-10-13'), { v: 1, ticker: 'C', date: '2026-10-13', hour: 'bmo', expected: { pct: 4, expiry: '2026-10-16', session: '2026-10-09', basis: 'eod', strike: 132, straddle: 5.33, spot: 131.92, capturedAt: 1, src: 'page' }, actual: null, at: 1 });
    const log = { reads: 0, probes: 0 };
    const r = await SVC.runActualsCycle({ nowMs: NOW_EVE, list, deps: { ...obsDeps(obsOf('C', 3.0, '2026-10-12'), undefined, log), bars: barsFrom({}), fmp: barsFrom({}) } });
    assert.equal(log.reads, 1); assert.deepEqual(r.expectedSaved, ['C|2026-10-13:3']);
    assert.equal((store.get(key('C', '2026-10-13')) as any).expected.pct, 3);
  });
  await ta('시각 미공지 종목·관측 없음은 건너뜀(지어내지 않는다)', async () => {
    reset();
    const list = [entry('PLD', '2026-10-15', ''), entry('ZZZ', '2026-10-14', 'bmo')];
    const r = await SVC.runActualsCycle({ nowMs: NOW_EVE, list, deps: obsDeps(obsOf('ZZZ', null, null)) });
    assert.equal(r.considered, 1, '미공지(PLD)는 후보가 아니다'); assert.deepEqual(r.expectedSaved, []); assert.equal(writes, 0);
    assert.ok(r.skipped.some((s) => s.reason === 'expected:no_snapshot'));
    const r2 = await SVC.runActualsCycle({ nowMs: NOW_EVE, list, deps: obsDeps(null) });
    assert.ok(r2.skipped.some((s) => s.reason === 'expected:no_observation'));
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
  await ta('★ FMP 응답 파싱 — non-split-adjusted 엔드포인트는 종가 필드가 adjClose(10/14 운영 첫 회차에서 close 만 읽어 대조가 «없음»이 됐다)', async () => {
    fmpRows = [{ symbol: 'JPM', date: '2026-10-13', adjClose: 331.43, volume: 1 }, { symbol: 'JPM', date: '2026-10-12', adjClose: 334.3 }, { symbol: 'JPM', date: 'x', adjClose: 1 }];
    assert.deepEqual(await SVC.fmpCloses('JPM', '2026-10-12', '2026-10-13'), [{ date: '2026-10-13', close: 331.43 }, { date: '2026-10-12', close: 334.3 }]);
    fmpRows = [{ date: '2026-10-13', close: 331.43, adjClose: 999 }];
    assert.deepEqual(await SVC.fmpCloses('JPM', '2026-10-12', '2026-10-13'), [{ date: '2026-10-13', close: 331.43 }], 'close 가 있으면 close');
    fmpRows = { 'Error Message': 'limit' };
    await assert.rejects(() => SVC.fmpCloses('JPM', '2026-10-12', '2026-10-13'), /fmp_shape/);
    fmpRows = [];
  });
  await ta('★ 대조 보강 — Intrinio 단독 기록은 다음 회차가 FMP 로 다시 본다: 일치 → «FMP 대조» · 불일치 → 기록 삭제 · FMP 불가 → 그대로 · 4일 지난 기록·방금 계산한 기록은 건드리지 않는다', async () => {
    reset();
    const mk = (tk: string, at: number, check: 'fmp' | null = null) => ({ v: 1, ticker: tk, date: '2026-10-13', hour: 'bmo', at, expected: null,
      actual: { pct: -1, baseDate: '2026-10-12', baseClose: 100, reactDate: '2026-10-13', reactClose: 99, src: 'intrinio-daily', check, at } });
    const list = ['AGREE', 'DIFF', 'DOWN', 'OLD', 'DONE'].map((t) => entry(t, '2026-10-13', 'bmo'));
    store.set(key('AGREE', '2026-10-13'), mk('AGREE', NOW_AFTER - 3_600_000));
    store.set(key('DIFF', '2026-10-13'), mk('DIFF', NOW_AFTER - 3_600_000));
    store.set(key('DOWN', '2026-10-13'), mk('DOWN', NOW_AFTER - 3_600_000));
    store.set(key('OLD', '2026-10-13'), mk('OLD', NOW_AFTER - 5 * 86_400_000));
    store.set(key('DONE', '2026-10-13'), mk('DONE', NOW_AFTER - 3_600_000, 'fmp'));
    const ok = (c: number): import('../src/services/earningsActualsService').DailyClose[] => [{ date: '2026-10-12', close: 100 }, { date: '2026-10-13', close: c }];
    const asked: string[] = [];
    const fmp: import('../src/services/earningsActualsService').BarsFn = async (tk) => {
      asked.push(tk);
      if (tk === 'DOWN') throw new Error('fmp_http_429');
      return tk === 'DIFF' ? ok(94) : ok(99);
    };
    const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: async () => [], fmp } });
    assert.deepEqual(r.rechecked.sort(), ['AGREE|2026-10-13:fmp', 'DIFF|2026-10-13:mismatch-dropped']);
    assert.deepEqual(asked.sort(), ['AGREE', 'DIFF', 'DOWN'], 'OLD(5일 전)·DONE(이미 대조됨)은 부르지 않는다');
    assert.equal((store.get(key('AGREE', '2026-10-13')) as any).actual.check, 'fmp');
    assert.equal((store.get(key('DIFF', '2026-10-13')) as any).actual, null, '독립 공급사가 다르다고 하면 지운다');
    assert.equal((store.get(key('DOWN', '2026-10-13')) as any).actual.check, null);
    assert.ok(r.skipped.some((s) => s.key === 'DOWN|2026-10-13' && s.reason.startsWith('recheck:fmp_unavailable')));
    // 방금 계산한 종목은 같은 회차에서 FMP 를 두 번 보지 않는다
    reset(); asked.length = 0;
    await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: async (tk, f, to) => { asked.push(tk); throw new Error('down'); } } });
    assert.deepEqual(asked, ['JPM'], '계산 때 1번(실패) — 같은 회차 보강은 건너뜀');
  });
  await ta('★ 확정 뒤 재확인 — 마감+30분 직후 2시간 안에 저장한 기록은 2시간 뒤 한 번 더 읽는다: 같으면 저장 시각만 갱신 · 다르면 새 값(두 공급사 일치) · 공급사끼리 다르면 기록 삭제 · 다시는 안 본다', async () => {
    reset();
    const CLOSE_MS = ms('2026-10-13T20:00:00Z');                     // 16:00 ET
    const early = CLOSE_MS + 35 * 60_000;                            // 마감+35분 — 일봉 확정(마감+30분) 직후에 저장한 기록
    const late = CLOSE_MS + 3 * 3_600_000;                           // 마감+3시간 — 확정 뒤 2시간(마감+2시간30분)이 지났다
    const mk = (tk: string, react: number) => ({ v: 1, ticker: tk, date: '2026-10-13', hour: 'bmo', at: early, expected: null,
      actual: { pct: A.pctChange(100, react), baseDate: '2026-10-12', baseClose: 100, reactDate: '2026-10-13', reactClose: react, src: 'intrinio-daily', check: 'fmp', at: early } });
    store.set(key('SAME', '2026-10-13'), mk('SAME', 95));
    store.set(key('MOVED', '2026-10-13'), mk('MOVED', 95.5));       // 임시 종가 95.5 → 최종 95.0
    store.set(key('SPLIT', '2026-10-13'), mk('SPLIT', 95.5));
    const list = ['SAME', 'MOVED', 'SPLIT'].map((t) => entry(t, '2026-10-13', 'bmo'));
    const mkBars = (c: number): import('../src/services/earningsActualsService').DailyClose[] => [{ date: '2026-10-12', close: 100 }, { date: '2026-10-13', close: c }];
    const bars: import('../src/services/earningsActualsService').BarsFn = async (tk) => mkBars(tk === 'MOVED' || tk === 'SPLIT' ? 95 : 95);
    const fmp: import('../src/services/earningsActualsService').BarsFn = async (tk) => mkBars(tk === 'SPLIT' ? 93 : 95);
    // 마감+2시간 «전»에는 건드리지 않는다
    const before = await SVC.runActualsCycle({ nowMs: CLOSE_MS + 100 * 60_000, list, deps: { bars, fmp } });
    assert.deepEqual(before.rechecked, [], '확정 뒤 2시간(마감+2시간30분) 전');
    const r = await SVC.runActualsCycle({ nowMs: late, list, deps: { bars, fmp } });
    assert.deepEqual(r.rechecked.sort(), ['MOVED|2026-10-13:settled-updated(-4.5→-5)', 'SAME|2026-10-13:settled-same', 'SPLIT|2026-10-13:settle-conflict-dropped']);
    const moved = store.get(key('MOVED', '2026-10-13')) as any;
    assert.deepEqual([moved.actual.reactClose, moved.actual.pct, moved.actual.check, moved.actual.at], [95, -5, 'fmp', late]);
    assert.equal((store.get(key('SAME', '2026-10-13')) as any).actual.at, late);
    assert.equal((store.get(key('SPLIT', '2026-10-13')) as any).actual, null, '두 공급사가 다르면 지운다');
    const asked: string[] = [];
    const r2 = await SVC.runActualsCycle({ nowMs: late + 600_000, list, deps: { bars: async (tk, f, to) => { asked.push(tk); return bars(tk, f, to); }, fmp: async (tk, f, to) => { asked.push(tk); return fmp(tk, f, to); } } });
    assert.deepEqual(r2.rechecked, []);
    assert.deepEqual([...new Set(asked)], ['SPLIT'], '한 번 재확인한 기록(SAME·MOVED)은 다시 안 본다 — 지운 SPLIT 만 처음부터 다시 계산(여전히 공급사가 달라 저장 안 됨)');
    assert.equal((store.get(key('SPLIT', '2026-10-13')) as any).actual, null);
  });
  await ta('수동 보강(seedExpected) — 이미 값이 있으면 건드리지 않고, 실제 반응 기록은 그대로 둔다', async () => {
    reset();
    const snap = { firstExpiryVerified: true as const, pct: 3.2, method: 'monthly' as const, expiry: '2026-10-16', session: '2026-10-12', basis: 'eod' as const, strike: 335, straddle: 10.58, spot: 334.3, capturedAt: 1, src: 'eod-chain' as const };
    assert.equal(await SVC.seedExpected({ ticker: 'JPM', date: '2026-10-13', hour: 'bmo' }, snap), 'saved');
    assert.equal(await SVC.seedExpected({ ticker: 'JPM', date: '2026-10-13', hour: 'bmo' }, { ...snap, pct: 9.9 }), 'kept');
    await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: jpmFmp } });
    const rec = store.get(key('JPM', '2026-10-13')) as any;
    assert.equal(rec.expected.pct, 3.2); assert.equal(rec.expected.src, 'eod-chain'); assert.equal(rec.actual.pct, -0.8585, '예상은 그대로, 실제만 채워졌다');
  });

  await ta('★ 쓰기 안전 — 묶음 읽기가 빈 값을 돌려줘도 저장된 expected 를 지키고, 엄격 읽기까지 실패하면 쓰지 않는다', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo')];
    const exp = { firstExpiryVerified: true, pct: 3.2, method: 'monthly', expiry: '2026-10-16', session: '2026-10-12', basis: 'eod', strike: 335, straddle: 10.58, spot: 334.3, capturedAt: 1, src: 'page' };
    store.set(key('JPM', '2026-10-13'), { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: exp, actual: null, at: 1 });
    failReads = true;
    const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: jpmBars, fmp: jpmFmp, readObservation: async () => null } });
    assert.equal(writes, 0, '엄격 읽기 실패 — 쓰기 0'); assert.ok(r.skipped.some((x) => x.reason === 'read_failed')); assert.deepEqual(r.actualsSaved, []);
    assert.equal((store.get(key('JPM', '2026-10-13')) as any).expected.pct, 3.2);
    reset();
    store.set(key('JPM', '2026-10-13'), { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: exp, actual: null, at: 1 });
    failMget = true;
    const r2 = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars: jpmBars, fmp: jpmFmp, readObservation: async () => null } });
    const rec = store.get(key('JPM', '2026-10-13')) as any;
    assert.equal(rec.expected.pct, 3.2, '빈 묶음 읽기를 믿고 expected 를 지우지 않는다'); assert.equal(rec.actual.pct, -0.8585);
    assert.deepEqual(r2.actualsSaved, ['JPM|2026-10-13:-0.8585']);
  });
  await ta('★ 한 기록이 깨져 있어도 그 건만 건너뛰고 다른 종목의 실제 반응·재검증은 계속한다', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo'), entry('C', '2026-10-13', 'bmo')];
    store.set(key('JPM', '2026-10-13'), { v: 9, garbage: true });
    const bars = barsFrom({ JPM: [['2026-10-12', 334.3], ['2026-10-13', 331.43]], C: [['2026-10-12', 131.92], ['2026-10-13', 124.53]] });
    const fmp = barsFrom({ JPM: [['2026-10-12', 334.3], ['2026-10-13', 331.43]], C: [['2026-10-12', 131.92], ['2026-10-13', 124.53]] });
    const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { bars, fmp, readObservation: async () => null } });
    assert.deepEqual(r.actualsSaved, ['C|2026-10-13:-5.6019']);
    assert.ok(r.skipped.some((x) => x.key === 'JPM|2026-10-13' && x.reason === 'invalid_record'));
    assert.deepEqual(store.get(key('JPM', '2026-10-13')), { v: 9, garbage: true }, '깨진 기록은 덮지 않는다(수동 확인 몫)');
    assert.equal((store.get(key('C', '2026-10-13')) as any).actual.pct, -5.6019);
  });

  await ta('★ 묶음 읽기가 비어 늦은 expected 를 채울 때도 저장된 actual 은 지운다·바꾸지 않는다(관문 10300928 ①)', async () => {
    reset();
    const list = [entry('INTC', '2026-10-29', 'amc')];
    const actual = { pct: -5.1, baseDate: '2026-10-29', baseClose: 40, reactDate: '2026-10-30', reactClose: 37.96, src: 'intrinio-daily', check: 'fmp', at: ms('2026-10-30T21:00:00Z') };
    store.set(key('INTC', '2026-10-29'), { v: 1, ticker: 'INTC', date: '2026-10-29', hour: 'amc', expected: null, actual, at: 1 });
    failMget = true;
    const r = await SVC.runActualsCycle({ nowMs: ms('2026-10-31T12:00:00Z'), list, deps: { ...obsDeps(obsOf('INTC', 6.9, '2026-10-29', '2026-10-30'), null),
      bars: async () => { throw new Error('vendor down'); }, fmp: barsFrom({}) } });
    assert.deepEqual(r.expectedSaved, ['INTC|2026-10-29:6.9']);
    const rec = store.get(key('INTC', '2026-10-29')) as any;
    assert.equal(rec.expected.pct, 6.9); assert.deepEqual(rec.actual, actual, '저장된 actual 그대로');
  });
  await ta('★ 회차 겹침 — 잠금이 잡혀 있으면 쉰다 · 잠금 저장소 불가면 actual 은 main 그대로, expected 만 쓰지 않는다(관문 10300928 ③)', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo')];
    const busy = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { ...obsDeps(obsOf('JPM', 3.2, '2026-10-12')), runLock: async () => 'busy' as const, bars: jpmBars, fmp: jpmFmp } });
    assert.equal(writes, 0); assert.ok(busy.skipped.some((x) => x.reason === 'run_locked'));
    const un = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { ...obsDeps(obsOf('JPM', 3.2, '2026-10-12')), runLock: async () => 'unavailable' as const, bars: jpmBars, fmp: jpmFmp } });
    assert.deepEqual(un.expectedSaved, []); assert.deepEqual(un.actualsSaved, ['JPM|2026-10-13:-0.8585']);
    assert.ok(un.skipped.some((x) => x.reason === 'expected:run_lock_unavailable'));
    const rec = store.get(key('JPM', '2026-10-13')) as any;
    assert.equal(rec.expected, null); assert.equal(rec.actual.pct, -0.8585);
  });

  await ta('★ actual 결과를 먼저 저장한 뒤 expected 관측을 읽는다(관문 10300933·10300934 — 조회 지연이 actual 저장을 막지 않게)', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo')];
    let actualAtRead: unknown = 'not-called';
    const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list, deps: { runLock: async () => 'ok' as const, bars: jpmBars, fmp: jpmFmp,
      readObservation: async () => { actualAtRead = (store.get(key('JPM', '2026-10-13')) as any)?.actual?.pct; return obsOf('JPM', 3.2, '2026-10-12'); } } });
    assert.equal(actualAtRead, -0.8585, 'expected 조회 시점에 actual 이 이미 저장돼 있다');
    assert.deepEqual(r.actualsSaved, ['JPM|2026-10-13:-0.8585']); assert.deepEqual(r.expectedSaved, ['JPM|2026-10-13:3.2']);
    const rec = store.get(key('JPM', '2026-10-13')) as any;
    assert.equal(rec.expected.pct, 3.2); assert.equal(rec.actual.pct, -0.8585); assert.equal(writes, 2);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 6. 페이지 표시 ━━━');
  await ta('★ 발표 완료 행 — «실제 −0.9% vs 옵션 예상 ±3.2%» + 출처·기준 시각 줄(세 언어) · 쓰기 0', async () => {
    reset();
    const list = [entry('JPM', '2026-10-13', 'bmo'), entry('GS', '2026-10-13', 'bmo', '07:30'), entry('UNH', '2026-10-13', 'bmo')];
    store.set(key('JPM', '2026-10-13'), { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', at: 1,
      expected: { firstExpiryVerified: true, pct: 3.2, expiry: '2026-10-16', session: '2026-10-12', basis: 'eod', strike: 335, straddle: 10.58, spot: 334.3, capturedAt: 1, src: 'eod-chain' },
      actual: { pct: -0.8585, baseDate: '2026-10-12', baseClose: 334.3, reactDate: '2026-10-13', reactClose: 331.43, src: 'intrinio-daily', check: 'fmp', at: 2 } });
    store.set(key('GS', '2026-10-13'), { v: 1, ticker: 'GS', date: '2026-10-13', hour: 'bmo', at: 1,
      expected: { firstExpiryVerified: true, pct: 4.2, expiry: '2026-10-16', session: '2026-10-12', basis: 'eod', strike: 895, straddle: 37.1, spot: 893.95, capturedAt: 1, src: 'eod-chain' },
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
