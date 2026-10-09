/**
 * «신규 포지션 구축» 장 마감 직후 추정 시험 (2026-10-09) — src/lib/newPositionBasis.ts · src/services/institutionalFlow.ts · 대시 카드 소스
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/newPositionEstimate.test.ts
 *   기기 시간대와 무관해야 한다 — TZ=UTC · Asia/Seoul · America/New_York 로 각각 돌린다.
 *
 * 결함(대표 10/9): «목요일 장이 마감됐는데 카드가 수요일 새로 깔린 옵션을 보여 준다».
 *   묶음 레코드 D 의 거래량(v)은 D 세션 것이고 미결제약정(oi)은 D 아침 OCC = D−1 마감이라, OI 증가분(확정치)은 늘 한 세션 늦다.
 *   목요일 저녁 묶음(D=10/8 목 · prevDate=10/7 수)의 확정치는 수요일 것 — 목요일 장 확정치는 금요일 저녁 레코드가 올라와야 생긴다.
 *   → 그 사이는 «그 세션 거래량이 직전 OI 를 넘은 몫»으로 추정한다(업계 표준 Vol > OI). 정의의 정본은 lib/newPositionBasis.ts 머리 주석.
 * 지키는 것:
 *   1. 전환 규칙(순수 함수) — 마감 직후 · 장중 · 장 시작 전 · 주말 · 휴장일 · 묶음 갱신 전 1시간 · 확정치가 L 까지 온 경우 · 날짜 이상
 *   2. 추정 식 — max(0, v − oi) × 100 × 행사가, 만기가 «그 세션 다음 거래일» 이내인 계약 제외, 숫자 아닌 칸은 0
 *   3. 서비스 — 옵션을 켠 호출자(대시 카드)만 추정을 받고, 마케팅·SEO 소비처(옵션 없음)는 옛 동작 그대로 확정치
 *   4. 표본이 얇으면 추정을 만들지 않고 확정치로 되돌아간다(0 이나 상수를 지어내지 않는다)
 *   5. 화면 — 키커 «{요일} 장 신규 (추정)» 3개 언어 · 상대 날짜 낱말 없음 · 추정 문장에 «OCC 확정 전 거래량 기준 추정» · 확정 문구 그대로
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log(`  ✓ ${name}`); });
const hh = (x: number) => String(x).padStart(2, '0');
// ET 벽시계 → epoch ms. 서머타임(EDT, UTC−4) 2026-03-08 ~ 2026-11-01 · 그 밖은 EST(UTC−5)
const edt = (ymd: string, h: number, m = 0, s = 0) => Date.parse(`${ymd}T${hh(h)}:${hh(m)}:${hh(s)}-04:00`);
const est = (ymd: string, h: number, m = 0, s = 0) => Date.parse(`${ymd}T${hh(h)}:${hh(m)}:${hh(s)}-05:00`);
const REL_WORDS = /오늘|어제|어젯밤|today|yesterday|overnight|今日|本日|昨日|昨夜/i;

// ── 기관 신규 포지션 서비스를 EC2 프록시 흉내로 돌린다 — tests/relativeDayLabels 와 같은 방식(읽기만, 쓰기는 버린다)
process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'k';
let rawBundle: any = null;
(globalThis as any).fetch = async (input: any) => {
  const url = String(input);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('http://ec2.test/get')) {
    const key = decodeURIComponent(url.split('key=')[1] || '');
    if (key === 'intrinio:options:eod') return json({ result: JSON.stringify(rawBundle) });
    return json({ result: null });
  }
  if (url.startsWith('http://ec2.test/set')) return json({ ok: true });
  throw new Error('unexpected fetch ' + url);
};

const row = (c: string, k: number, e: string, tp: 'C' | 'P', v: number, oi: number, d: number | null) =>
  ({ c, k, e, t: tp, v, oi, d, iv: 0.5, dl: 0.5 });

/**
 * 묶음 한 벌. 종목 60개(= 시장 전체 문턱 50 위), 종목마다 계약 4행:
 *   A 콜 만기 2099  v 1,500 · oi 1,000 → 열린 500   · 행사가 100 → $5,000,000   (확정치 d = +50)
 *   B 콜 만기 «다음 거래일» v 100,000 · oi 100            → 단기 만기라 추정에서 제외
 *   C 풋 만기 2099  v 400 · oi 900                        → 거래량이 oi 아래 → 0
 *   D 풋 만기 2099  v 700 · oi 0 (새 시리즈) · 행사가 50 → $3,500,000
 * 종목당 추정 $8.5M · 콜 비중 5/8.5 = 58.8% · 60종목 합계 $510M.
 * 별도 종목 BIG: 콜 만기 2099 v 50,000 · oi 1,000 · 행사가 200 → 49,000 × 100 × 200 = $980M — 최대 단일 계약.
 */
function bundleOf(date: string, prevDate: string, nextSession: string, opts: { thin?: boolean; extraRows?: any[] } = {}) {
  const b: any = { date, prevDate, tickers: {} as Record<string, any> };
  for (let i = 0; i < 60; i++) {
    const top = [
      row(`T${i}A`, 100, '2099-01-15', 'C', 1500, 1000, 50),
      row(`T${i}B`, 100, nextSession, 'C', 100000, 100, 30),
      row(`T${i}C`, 100, '2099-01-15', 'P', 400, 900, -20),
      row(`T${i}D`, 50, '2099-01-15', 'P', 700, 0, null),
    ];
    // 얇은 표본 시험: 앞의 10종목만 v > oi 이고 나머지는 거래량이 oi 아래 — 추정 종목 수 10 < 50. 확정치(d>0)는 60종목 그대로.
    if (opts.thin && i >= 10) { top[0].v = 10; top[3].v = 0; }
    b.tickers[`T${i}`] = { top };
  }
  b.tickers.BIG = { top: [row('BIGA', 200, '2099-01-15', 'C', 50000, 1000, 5), ...(opts.extraRows || [])] };
  return b;
}

(async () => {
  const B = await import('../src/lib/newPositionBasis');
  const S = await import('../src/lib/marketSession');
  const F = await import('../src/services/institutionalFlow');

  console.log(`━━━ 1. 전환 규칙 pickNewPositionBasis (기기 시간대 ${process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone}) ━━━`);
  // 10/8(목) 저녁 실측 묶음: date 10/8 · prevDate 10/7. 마지막으로 끝난 정규장 L = 그 시각까지의 마감 세션.
  const THU = { date: '2026-10-08', prevDate: '2026-10-07' };
  const pick = (ms: number, b: { date: unknown; prevDate: unknown }) => B.pickNewPositionBasis({ now: ms, ...b });

  await t('목요일 마감 직후(16:00·17:22 ET) 묶음(10/8·10/7) → 목요일 추정 — 대표가 본 «수요일 확정»이 아니다', () => {
    for (const ms of [edt('2026-10-08', 16, 0), edt('2026-10-08', 17, 22), edt('2026-10-08', 23, 59)])
      assert.deepEqual(pick(ms, THU), { basis: 'estimate', session: '2026-10-08' });
  });
  await t('금요일 장 시작 전·장중(10/9 09:00·11:00·15:59 ET) → 여전히 목요일 추정 — 진행 중인 금요일은 건드리지 않고, 수요일 확정으로 물러나지도 않는다', () => {
    for (const ms of [edt('2026-10-09', 0, 0), edt('2026-10-09', 9, 0), edt('2026-10-09', 11, 0), edt('2026-10-09', 15, 59)])
      assert.deepEqual(pick(ms, THU), { basis: 'estimate', session: '2026-10-08' }, new Date(ms).toISOString());
  });
  await t('금요일 마감 직후~묶음 갱신 전(16:00~17:00 ET): 묶음은 아직 10/8 → 목요일 추정을 그대로 둔다(날짜를 단 채로 한 칸 물러나지 않는다)', () => {
    for (const ms of [edt('2026-10-09', 16, 0), edt('2026-10-09', 16, 30), edt('2026-10-09', 16, 59)])
      assert.deepEqual(pick(ms, THU), { basis: 'estimate', session: '2026-10-08' });
  });
  await t('금요일 저녁 묶음 갱신(10/9·10/8) → 금요일 추정, 확정(목요일)은 한 세션 늦어 카드에 오르지 않는다 — 카드는 늘 «마지막 마감 세션»', () => {
    assert.deepEqual(pick(edt('2026-10-09', 17, 30), { date: '2026-10-09', prevDate: '2026-10-08' }), { basis: 'estimate', session: '2026-10-09' });
  });
  await t('주말(토 10/10 · 일 10/11): 묶음(10/9·10/8) → 금요일 추정', () => {
    for (const ms of [edt('2026-10-10', 9, 0), edt('2026-10-11', 20, 0)])
      assert.deepEqual(pick(ms, { date: '2026-10-09', prevDate: '2026-10-08' }), { basis: 'estimate', session: '2026-10-09' });
  });
  await t('휴장일 뒤: 노동절(9/7 월) 다음 화 9/8 새벽 · 노동절 당일 → L = 금 9/4, 묶음(9/4·9/3) → 금요일 추정', () => {
    for (const ms of [edt('2026-09-07', 12, 0), edt('2026-09-08', 5, 0), edt('2026-09-08', 9, 0)])
      assert.deepEqual(pick(ms, { date: '2026-09-04', prevDate: '2026-09-03' }), { basis: 'estimate', session: '2026-09-04' });
  });
  await t('확정치가 마지막 마감 세션까지 왔으면(prevDate ≥ L) → 확정 — 같으면 확정', () => {
    // 가상: 토 10/10 에 묶음(10/12·10/9) → P = L = 10/9
    assert.deepEqual(pick(edt('2026-10-10', 9, 0), { date: '2026-10-12', prevDate: '2026-10-09' }), { basis: 'confirmed', session: '2026-10-09' });
    // 장중 금 10/9 11:00: L = 10/8 · 묶음(10/9·10/8) (진행 중 세션 D 는 추정 못 한다) → 확정 10/8
    assert.deepEqual(pick(edt('2026-10-09', 11, 0), { date: '2026-10-09', prevDate: '2026-10-08' }), { basis: 'confirmed', session: '2026-10-08' });
  });
  await t('진행 중 세션의 묶음(D > L)·비거래일 레코드·날짜 없음/모양 틀림 → 추정하지 않고 확정(날짜를 지어내지 않는다)', () => {
    // 레코드 D 가 아직 끝나지 않은 세션: 금 10/9 11:00 ET 에 묶음(10/9·10/7) — L=10/8 < D
    assert.deepEqual(pick(edt('2026-10-09', 11, 0), { date: '2026-10-09', prevDate: '2026-10-07' }), { basis: 'confirmed', session: '2026-10-07' });
    // 토요일 레코드
    assert.deepEqual(pick(edt('2026-10-12', 9, 0), { date: '2026-10-10', prevDate: '2026-10-08' }), { basis: 'confirmed', session: '2026-10-08' });
    for (const bad of [undefined, null, '', '10/8', '2026-10-08T21:22:53Z', 20261008, {}]) {
      assert.deepEqual(pick(edt('2026-10-08', 17, 0), { date: bad, prevDate: '2026-10-07' }), { basis: 'confirmed', session: '2026-10-07' }, String(bad));
      assert.deepEqual(pick(edt('2026-10-08', 17, 0), { date: '2026-10-08', prevDate: bad }), { basis: 'estimate', session: '2026-10-08' }, 'prevDate ' + String(bad));
    }
    assert.deepEqual(pick(edt('2026-10-08', 17, 0), { date: null, prevDate: null }), { basis: 'confirmed', session: null });
  });
  await t('경계 — 15:59:59 ET 는 아직 장중(L = 전 거래일), 16:00:00 부터 L = 오늘 · ET 자정 앞뒤 · 서머타임 끝(11/1 일) 다음 월요일', () => {
    // 묶음(10/7·10/6)만 있는 수요일: 15:59:59 → L = 10/6(화) → P(10/6) ≥ L → 확정 / 16:00:00 → L = 10/7 → 수요일 추정
    const WED = { date: '2026-10-07', prevDate: '2026-10-06' };
    assert.deepEqual(pick(edt('2026-10-07', 15, 59, 59), WED), { basis: 'confirmed', session: '2026-10-06' });
    assert.deepEqual(pick(edt('2026-10-07', 16, 0, 0), WED), { basis: 'estimate', session: '2026-10-07' });
    // 서머타임 끝 직후 월요일 11/2 17:00 EST — 묶음(11/2·10/30)
    assert.deepEqual(pick(est('2026-11-02', 17, 0), { date: '2026-11-02', prevDate: '2026-10-30' }), { basis: 'estimate', session: '2026-11-02' });
    // 일요일 11/1 (서머타임 끝 날) 저녁 — 묶음(10/30·10/29) → 금요일 추정
    assert.deepEqual(pick(est('2026-11-01', 20, 0), { date: '2026-10-30', prevDate: '2026-10-29' }), { basis: 'estimate', session: '2026-10-30' });
  });
  await t('같은 묶음·같은 순간이면 보는 사람의 기기 시간대와 상관없이 같은 답(순수 함수 — 시계는 ms 인자뿐)', () => {
    const ms = edt('2026-10-08', 17, 22);
    const before = process.env.TZ;
    const outs = new Set<string>();
    for (const tz of ['Asia/Seoul', 'America/New_York', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
      process.env.TZ = tz;
      outs.add(JSON.stringify(pick(ms, THU)));
    }
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
    assert.equal(outs.size, 1);
  });
  await t('nextTradingDate — 금→월 · 목→금 · 노동절 전 금(9/4)→화(9/8) · 추정 만기 경계', () => {
    assert.equal(B.nextTradingDate('2026-10-08'), '2026-10-09');
    assert.equal(B.nextTradingDate('2026-10-09'), '2026-10-12');
    assert.equal(B.nextTradingDate('2026-09-04'), '2026-09-08');
    assert.equal(B.estimateExpiryCutoff('2026-10-08'), '2026-10-09');
    assert.equal(B.estimateExpiryCutoff('2026-10-09'), '2026-10-12');
  });

  console.log('━━━ 2. 추정 식 estimatedOpenedContracts ━━━');
  const CUT = '2026-10-09';
  await t('열린 계약 = max(0, v − oi) — 10/8 실측 GLD 261016P410: v 25,317 · oi 5,831 → 19,486', () => {
    assert.equal(B.estimatedOpenedContracts({ v: 1500, oi: 1000, e: '2099-01-15' }, CUT), 500);
    assert.equal(B.estimatedOpenedContracts({ v: 25317, oi: 5831, e: '2026-10-16' }, CUT), 19486);
    assert.equal(B.estimatedOpenedContracts({ v: 700, oi: 0, e: '2026-10-16' }, CUT), 700);        // 새 시리즈(oi 0)
  });
  await t('거래량이 oi 이하면 0 — 청산·당일 사고팔기는 «새 돈»이 아니다', () => {
    assert.equal(B.estimatedOpenedContracts({ v: 900, oi: 900, e: '2026-10-16' }, CUT), 0);
    assert.equal(B.estimatedOpenedContracts({ v: 400, oi: 900, e: '2026-10-16' }, CUT), 0);
  });
  await t('만기가 «그 세션 다음 거래일» 이내(0·1일 만기)면 뺀다 — 10/8 실측 넣으면 $1,030B(확정치 $44B 의 23배)였다', () => {
    assert.equal(B.estimatedOpenedContracts({ v: 175181, oi: 14219, e: '2026-10-09' }, CUT), 0);   // NVDA 261009C237.5 — 금요일 만기
    assert.equal(B.estimatedOpenedContracts({ v: 194404, oi: 76662, e: '2026-10-08' }, CUT), 0);   // 그 세션에 이미 만기
    assert.equal(B.estimatedOpenedContracts({ v: 5000, oi: 100, e: '2026-10-12' }, CUT), 4900);    // 월요일 만기는 남는다
  });
  await t('숫자가 아닌 칸·만기 모름·행 없음은 0 — 지어내지 않는다', () => {
    for (const r of [null, undefined, {}, { v: 'x', oi: 1, e: '2099-01-01' }, { v: 10, oi: null, e: '2099-01-01' }, { v: NaN, oi: 1, e: '2099-01-01' },
      { v: Infinity, oi: 1, e: '2099-01-01' }, { v: 10, oi: 1 }, { v: 10, oi: 1, e: '' }, { v: 10, oi: 1, e: 20991231 as any }])
      assert.equal(B.estimatedOpenedContracts(r as any, CUT), 0, JSON.stringify(r));
  });

  console.log('━━━ 3. 서비스 — 옵션을 켠 호출자만 추정, 나머지는 옛 동작 ━━━');
  const AT_THU_EVE = edt('2026-10-08', 17, 22);
  await t('옵션 없이 부르면(마케팅·SEO 소비처) 확정치 그대로 — date = prevDate · basis \'confirmed\' · 추정이 새어 들어가지 않는다', async () => {
    rawBundle = bundleOf('2026-10-08', '2026-10-07', '2026-10-09');
    const s = await F.getInstitutionalFlowSummary();
    assert.equal(s?.basis, 'confirmed');
    assert.equal(s?.date, '2026-10-07');
    const s2 = await F.getInstitutionalFlowSummary({ allowEstimate: false, now: AT_THU_EVE });
    assert.deepEqual(s2, s);
  });
  await t('옵션 켠 대시 카드(목 17:22 ET) → 목요일 추정: 금액 = Σ(v−oi)×100×행사가 · 단기 만기 제외 · 콜 비중 · 최대 단일 계약', async () => {
    rawBundle = bundleOf('2026-10-08', '2026-10-07', '2026-10-09');
    const s = await F.getInstitutionalFlowSummary({ allowEstimate: true, now: AT_THU_EVE });
    assert.ok(s);
    assert.equal(s!.basis, 'estimate');
    assert.equal(s!.date, '2026-10-08');
    // 60종목 × $8.5M + BIG $980M = $1,490M — B행(단기 만기 · 거래량 100,000)이 들어갔다면 60 × 10,000,000 × … 로 자릿수가 달라진다
    assert.equal(s!.notional, 60 * 8_500_000 + 980_000_000);
    assert.equal(s!.tickers, 61);
    // 콜 = 60 × 5,000,000 + 980,000,000 = 1,280M / 1,490M
    assert.equal(s!.callPct, Math.round((1_280_000_000 / 1_490_000_000) * 1000) / 10);
    assert.equal(s!.side, 'call');
    assert.equal(s!.topTicker, 'BIG');
    assert.equal(s!.topNotional, 980_000_000);
    assert.deepEqual(s!.topContract, { ticker: 'BIG', type: 'call', strike: 200, expiry: '2099-01-15', contracts: 49000, notional: 980_000_000 });
    assert.equal(s!.percentile, null);       // 평소 대비 이력은 확정 정의 — 추정에 견주지 않는다
    assert.equal(s!.samples, 0);
  });
  await t('확정치와 같은 모양 — 같은 키 · 같은 단위(USD 명목) · 같은 종목 범위(top 행): 키 집합이 같다', async () => {
    rawBundle = bundleOf('2026-10-08', '2026-10-07', '2026-10-09');
    const c = await F.getInstitutionalFlowSummary();
    const e = await F.getInstitutionalFlowSummary({ allowEstimate: true, now: AT_THU_EVE });
    assert.deepEqual(Object.keys(e!).sort(), Object.keys(c!).sort());
    // 확정치 합계(d>0 × 100 × 행사가): A 50 · B 30 → (50+30) × 100 × 100 × 60 + BIG 5 × 100 × 200 = $48.1M — 규모가 다른 이유는 가짜 묶음의 d 값일 뿐, 같은 식이다
    assert.equal(c!.notional, 60 * (50 + 30) * 100 * 100 + 5 * 100 * 200);
  });
  await t('장중 금요일(10/9 11:00 ET) 에도 같은 묶음이면 목요일 추정 — 수요일 확정으로 물러나지 않는다 · 마감 후 묶음 갱신 뒤엔 금요일', async () => {
    rawBundle = bundleOf('2026-10-08', '2026-10-07', '2026-10-09');
    const s = await F.getInstitutionalFlowSummary({ allowEstimate: true, now: edt('2026-10-09', 11, 0) });
    assert.equal(s!.basis, 'estimate'); assert.equal(s!.date, '2026-10-08');
    rawBundle = bundleOf('2026-10-09', '2026-10-08', '2026-10-12');
    const s2 = await F.getInstitutionalFlowSummary({ allowEstimate: true, now: edt('2026-10-09', 17, 30) });
    assert.equal(s2!.basis, 'estimate'); assert.equal(s2!.date, '2026-10-09');
  });
  await t('«최대»는 지금도 깔려 있는 계약 — 묶음이 뒤처진 때(L 이 앞서간 때) 만기 ≤ 마지막 마감 세션 계약은 «최대»에서만 빠지고 합계에는 남는다', async () => {
    // 금 16:30 ET(L = 10/9, 묶음 10/8): 만기 월요일(10/12) 계약은 합계에도 «최대»에도 들어간다 — 79,000 × 100 × 300 = $2.37B
    rawBundle = bundleOf('2026-10-08', '2026-10-07', '2026-10-09', { extraRows: [row('BIGM', 300, '2026-10-12', 'P', 80000, 1000, 1)] });
    const s1 = await F.getInstitutionalFlowSummary({ allowEstimate: true, now: edt('2026-10-09', 16, 30) });
    assert.equal(s1!.date, '2026-10-08');
    assert.equal(s1!.topContract?.expiry, '2026-10-12');
    assert.equal(s1!.topContract?.notional, 79_000 * 100 * 300);
    // 월 17:00 ET(L = 10/12, 묶음은 그대로 10/8 — 수집기 장애 극단): 만기 10/12 ≤ L 이라 «최대»에서 빠진다(89,000 × 100 × 500 = $4.45B 로 더 크지만)
    rawBundle = bundleOf('2026-10-08', '2026-10-07', '2026-10-09', { extraRows: [row('GONE', 500, '2026-10-12', 'C', 90000, 1000, 1)] });
    const s2 = await F.getInstitutionalFlowSummary({ allowEstimate: true, now: edt('2026-10-12', 17, 0) });
    assert.equal(s2!.topContract?.ticker, 'BIG');
    assert.equal(s2!.notional, 60 * 8_500_000 + 980_000_000 + 89_000 * 100 * 500);   // 합계에는 GONE 몫이 남아 있다(합계 경계는 «다음 거래일 10/9 이내 만기 제외»)
  });
  await t('추정을 만들 표본이 얇으면(v > oi 종목 50 미만) 확정치로 되돌아간다 — 0 도 상수도 지어내지 않는다', async () => {
    rawBundle = bundleOf('2026-10-08', '2026-10-07', '2026-10-09', { thin: true });
    const s = await F.getInstitutionalFlowSummary({ allowEstimate: true, now: AT_THU_EVE });
    assert.equal(s?.basis, 'confirmed');
    assert.equal(s?.date, '2026-10-07');
  });
  await t('거래량·미결제약정 칸이 없는 묶음(옛 형식)도 확정치로 — 칸이 없다고 추정이 터지지 않는다', async () => {
    const b = bundleOf('2026-10-08', '2026-10-07', '2026-10-09');
    for (const v of Object.values<any>(b.tickers)) for (const r of v.top) { delete r.v; delete r.oi; }
    rawBundle = b;
    const s = await F.getInstitutionalFlowSummary({ allowEstimate: true, now: AT_THU_EVE });
    assert.equal(s?.basis, 'confirmed');
  });
  await t('마감 전(목 15:00 ET) 묶음(10/7·10/6) → 수요일 추정 · 묶음이 비면 null', async () => {
    rawBundle = bundleOf('2026-10-07', '2026-10-06', '2026-10-08');
    const s = await F.getInstitutionalFlowSummary({ allowEstimate: true, now: edt('2026-10-08', 15, 0) });
    assert.equal(s!.basis, 'estimate'); assert.equal(s!.date, '2026-10-07');
    rawBundle = null;
    assert.equal(await F.getInstitutionalFlowSummary({ allowEstimate: true, now: AT_THU_EVE }), null);
  });

  console.log('━━━ 4. 화면·소비처 소스 회귀 ━━━');
  const root = path.resolve(__dirname, '..');
  const dash = fs.readFileSync(path.join(root, 'src/app/[locale]/app-view/dash/page.tsx'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'src/app/api/live/premium-metrics/route.ts'), 'utf8');
  await t('대시 키커 틀 3개 언어 — «{d} 장 신규 (추정)» · «New on {d} (est.)» · «{d}の新規（推定）» · 상대 날짜 낱말 없음', () => {
    const must = ["kickerEst: '{d} 장 신규 (추정)'", "kickerEst: 'New on {d} (est.)'", "kickerEst: '{d}の新規（推定）'"];
    for (const m of must) assert.ok(dash.includes(m), m);
    // 폴백(요일 없음)에도 상대 날짜 낱말이 없다
    for (const m of dash.matchAll(/kickerEstOff: '([^']+)'/g)) assert.ok(!REL_WORDS.test(m[1]), m[1]);
    for (const loc of ['ko', 'en', 'ja'] as const) {
      const tpl = { ko: '{d} 장 신규 (추정)', en: 'New on {d} (est.)', ja: '{d}の新規（推定）' }[loc];
      const out = S.withSessionDay(tpl, '2026-10-08', loc, 'x');
      assert.equal(out, { ko: '목요일 장 신규 (추정)', en: 'New on Thursday (est.)', ja: '木曜日の新規（推定）' }[loc]);
      assert.ok(!REL_WORDS.test(out));
    }
  });
  await t('추정 문장에 «OCC 확정 전 거래량 기준 추정»(ko) · «volume est., pre-OCC»(en) · «OCC確定前の出来高推定»(ja) · 금융 공통어(OCC) 그대로', () => {
    for (const m of ['OCC 확정 전 거래량 기준 추정', 'volume est., pre-OCC', 'OCC確定前の出来高推定']) assert.ok(dash.includes(m), m);
    assert.ok(dash.includes("f.basis === 'estimate'"));
  });
  await t('확정 문구는 그대로 — «신규 진입 · 콜/풋 N% 우위»·«opened across»·«の新規 · コール優勢» 와 «새로 깔린 옵션» 키커', () => {
    for (const m of ['신규 진입 · ${f.callPct >= 50', 'opened across ${f.tickers} names', 'の新規 · ${f.callPct >= 50', "kickerOn: '{d} 새로 깔린 옵션'", "kickerOn: 'Options opened {d}'", "kickerOn: '{d}に建てられたオプション'"])
      assert.ok(dash.includes(m), m);
  });
  await t('추정일 때만 추정 키커 — instFlow.basis === \'estimate\' 분기 하나, 확정은 기존 withSessionDay(kickerOn)', () => {
    assert.ok(/instFlow\?\.basis === 'estimate'\s*\?\s*withSessionDay\(gateCopy\.signals\.instFlow\.kickerEst/.test(dash));
    assert.ok(dash.includes('withSessionDay(gateCopy.signals.instFlow.kickerOn, instFlow?.date'));
  });
  await t('라우트: 대시 카드 호출만 allowEstimate · 정상본 키 :v2 — 옛 확정치 정상본을 첫 응답에 내보내지 않는다', () => {
    assert.ok(route.includes('getInstitutionalFlowSummary({ allowEstimate: true })'));
    assert.ok(route.includes("'premium:instflow:lastgood:v2'"));
  });
  await t('라우트: 정상본은 asOf(ms)를 달고 15분이 지나면 즉시 반환하지 않고 새로 계산한다 — 배경 갱신이 멈춰도 «목요일 추정»이 주말까지 가지 않는다', () => {
    assert.ok(route.includes('15 * 60 * 1000'));
    assert.ok(/asOf: Date\.now\(\)/.test(route));
    assert.ok(/maxAgeMs != null/.test(route));
    // 다른 카드(시장 폭 등)는 maxAgeMs 를 주지 않는다 — 옛 동작 그대로
    assert.ok(route.includes("withLastGood('breadth', 'premium:breadth:lastgood', () => getIndexBreadth())"));
  });
  await t('마케팅·SEO 소비처(영상 크론·마케팅 입력·옵션 흐름 페이지)는 옵션을 켜지 않는다 — 추정을 사실처럼 싣지 않는다', () => {
    for (const f of ['src/app/api/cron/render-video/route.ts', 'src/lib/marketing-v2/core/data.ts', 'src/app/api/cron/daily-content/route.ts', 'src/app/[locale]/options-flow/page.tsx']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      assert.ok(!/allowEstimate/.test(src), f);
    }
  });

  console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
