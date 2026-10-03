/**
 * 옵션 만기 판정 시험 — 만기일 «정규장 마감»(16:00 ET · 조기 폐장 13:00)에 만기 (2026-10-03 수리)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/optionExpiry.test.ts
 *   기기 시간대와 무관해야 한다 — TZ=UTC · Asia/Seoul · America/New_York · America/Los_Angeles · Europe/Berlin 로 각각 돌린다.
 *
 * [결함 · 10/3 실측] options-eod 라우트의 isExpired 가 «만기일 < 오늘(ET)»이라 오늘 만기를 자정까지 살려 뒀다.
 *   묶음 D 는 D 장 마감 뒤에 나오므로 D 만기 계약은 처음 뜰 때 이미 만기였는데, 미국 저녁(=한국 아침) 내내 «신규 포지션»에
 *   섞였다가 ET 자정(한국 13:00)에 빠졌다 — 10/2 묶음 NVDA 칩 +39,278 → +13,986 · NKE 풋 +74,521 → 콜 +7,637 · SPY +21,684 → 0.
 * 지키는 것:
 *   1. 경계 — 15:59·16:00·16:01 ET · 조기 폐장 13:00 · 휴장일 · 주말 · ET 자정 앞뒤 · 서머타임 전환일 · 날짜 모양 아님
 *   2. 같은 묶음을 «한국 아침»과 «한국 오후»로 계산해도 결과가 같다 — 라우트(all=1·t=) · 기관 신규 포지션 서비스
 *      (수리 전 판정이면 같은 시험에서 바뀐다는 것도 보인다 — 시험이 결함을 잡는다)
 *   3. 묶음이 처음 뜰 수 있는 때(D 16:00 ET)부터 다음 거래일 장 마감 직전까지 30분마다 — 전부 같다
 *   4. 조기 폐장 표는 하나 — watchlistInsights 가 다시 내보내는 것과 marketCalendar 의 것이 같은 객체
 */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  isOptionExpiredAt, optionExpiryJudge, etDateOf, EARLY_CLOSE_DATES, sessionCloseMinutes, isNonTradingDay,
} from '../src/lib/marketCalendar';
import * as WI from '../src/lib/app/watchlistInsights';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const hh = (x: number) => String(x).padStart(2, '0');
// ET 벽시계 → epoch ms. 서머타임(EDT, UTC−4) 2026-03-08 ~ 2026-11-01 · 그 밖은 EST(UTC−5)
const edt = (ymd: string, h: number, m = 0, s = 0) => Date.parse(`${ymd}T${hh(h)}:${hh(m)}:${hh(s)}-04:00`);
const est = (ymd: string, h: number, m = 0, s = 0) => Date.parse(`${ymd}T${hh(h)}:${hh(m)}:${hh(s)}-05:00`);
const kst = (ymd: string, h: number, m = 0) => Date.parse(`${ymd}T${hh(h)}:${hh(m)}:00+09:00`);
const X = isOptionExpiredAt;
/** 수리 전 판정(그대로 옮김) — 시험이 결함을 잡는지 보이려고만 쓴다 */
const oldExpired = (exp: unknown, ms: number) => typeof exp === 'string' && exp.length >= 10 && exp.slice(0, 10) < etDateOf(ms);

(async () => {
  console.log(`━━━ 1. 경계 (기기 시간대 ${process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone}) ━━━`);

  await t('평일 마감 16:00 ET — 15:59 살아 있음 · 15:59:59 살아 있음 · 16:00 만기 · 16:01 만기 (10/2 금 EDT)', () => {
    assert.equal(X('2026-10-02', edt('2026-10-02', 15, 59)), false);
    assert.equal(X('2026-10-02', edt('2026-10-02', 15, 59, 59)), false);
    assert.equal(X('2026-10-02', edt('2026-10-02', 16, 0)), true);
    assert.equal(X('2026-10-02', edt('2026-10-02', 16, 1)), true);
    // 장 전·장중 — 오늘 만기는 살아 있다(예전과 같다)
    assert.equal(X('2026-10-02', edt('2026-10-02', 0, 0)), false);
    assert.equal(X('2026-10-02', edt('2026-10-02', 9, 30)), false);
  });

  await t('조기 폐장 13:00 ET — 11/27(EST)·12/24: 12:59 살아 있음 · 13:00·13:01 만기 · 표는 하나(marketCalendar)', () => {
    for (const d of ['2026-11-27', '2026-12-24']) {
      assert.equal(sessionCloseMinutes(d), 13 * 60, d);
      assert.equal(X(d, est(d, 12, 59)), false, d);
      assert.equal(X(d, est(d, 13, 0)), true, d);
      assert.equal(X(d, est(d, 13, 1)), true, d);
    }
    // 대조: 7/2(목)은 조기 폐장이 아니다(7/3 이 대체 휴장) — 13:00 엔 살아 있고 16:00 에 만기
    assert.equal(X('2026-07-02', edt('2026-07-02', 13, 0)), false);
    assert.equal(X('2026-07-02', edt('2026-07-02', 15, 59)), false);
    assert.equal(X('2026-07-02', edt('2026-07-02', 16, 0)), true);
  });

  await t('휴장일 — 추수감사절 11/26·노동절 9/7·준틴스 6/19: 전 거래일 만기는 만기, 다음 거래일 만기는 살아 있음', () => {
    assert.equal(X('2026-11-25', est('2026-11-26', 10)), true);
    assert.equal(X('2026-11-27', est('2026-11-26', 10)), false);
    assert.equal(X('2026-09-04', edt('2026-09-07', 12)), true);
    assert.equal(X('2026-09-08', edt('2026-09-07', 23, 59)), false);
    // 준틴스(금) 주간 만기는 거래소가 목 6/18 로 앞당긴다 — 6/18 마감이 경계
    assert.equal(X('2026-06-18', edt('2026-06-18', 15, 59)), false);
    assert.equal(X('2026-06-18', edt('2026-06-18', 16, 0)), true);
    // 공급사가 혹시 휴장일 날짜를 만기로 적어도 «그 앞 마지막 거래일 마감»에 끝난다(살아 있는 척하지 않는다)
    assert.equal(isNonTradingDay('2026-06-19'), true);
    assert.equal(X('2026-06-19', edt('2026-06-18', 15, 59)), false);
    assert.equal(X('2026-06-19', edt('2026-06-18', 16, 0)), true);
    assert.equal(X('2026-06-19', edt('2026-06-19', 10)), true);
    assert.equal(X('2026-11-26', est('2026-11-26', 10)), true);
  });

  await t('주말 — 토·일엔 금요일 만기는 만기, 월요일 만기는 살아 있음 · 토요일 날짜 만기는 금 16:00 에 끝', () => {
    assert.equal(X('2026-10-02', edt('2026-10-03', 10)), true);
    assert.equal(X('2026-10-05', edt('2026-10-03', 10)), false);
    assert.equal(X('2026-10-05', edt('2026-10-04', 23, 59)), false);
    assert.equal(X('2026-10-05', edt('2026-10-05', 15, 59)), false);
    assert.equal(X('2026-10-05', edt('2026-10-05', 16, 0)), true);
    assert.equal(X('2026-10-03', edt('2026-10-02', 15, 59)), false);
    assert.equal(X('2026-10-03', edt('2026-10-02', 16, 0)), true);
  });

  await t('ET 자정 앞뒤 — 마감 뒤부터 자정 너머까지 같은 답(수리 전 판정은 자정에 뒤집힌다)', () => {
    const before = edt('2026-10-02', 23, 59, 59), after = edt('2026-10-03', 0, 0, 0);
    assert.equal(X('2026-10-02', edt('2026-10-02', 16, 0)), true);
    assert.equal(X('2026-10-02', before), true);
    assert.equal(X('2026-10-02', after), true);
    assert.equal(oldExpired('2026-10-02', before), false, '수리 전: 자정 전엔 «살아 있음»');
    assert.equal(oldExpired('2026-10-02', after), true, '수리 전: 자정에 «만기»로 뒤집힘');
    // 내일 만기는 자정 앞뒤 모두 살아 있다
    assert.equal(X('2026-10-05', before), false);
    assert.equal(X('2026-10-05', after), false);
    // 한국 시각으로: 10/3 05:00 KST(=10/2 16:00 ET)부터 만기 · 10/3 04:59 KST 엔 살아 있음
    assert.equal(X('2026-10-02', kst('2026-10-03', 4, 59)), false);
    assert.equal(X('2026-10-02', kst('2026-10-03', 5, 0)), true);
    assert.equal(X('2026-10-02', kst('2026-10-03', 12, 59)), true);
    assert.equal(X('2026-10-02', kst('2026-10-03', 13, 0)), true);
  });

  await t('서머타임 시작(3/8) — 월 3/9 16:00 EDT = 20:00Z 가 경계(고정 UTC−5 였다면 21:00Z) · 금 3/6 은 21:00Z', () => {
    assert.equal(X('2026-03-09', Date.parse('2026-03-09T19:59:00Z')), false);
    assert.equal(X('2026-03-09', Date.parse('2026-03-09T20:00:00Z')), true);
    assert.equal(X('2026-03-06', Date.parse('2026-03-06T20:59:00Z')), false);
    assert.equal(X('2026-03-06', Date.parse('2026-03-06T21:00:00Z')), true);
    // 전환 당일(일) 새벽 — 02:00 EST → 03:00 EDT 를 건너도 월요일 만기는 살아 있다 · ET 날짜는 05:00Z 에 바뀐다
    assert.equal(etDateOf(Date.parse('2026-03-08T04:59:00Z')), '2026-03-07');
    assert.equal(etDateOf(Date.parse('2026-03-08T05:00:00Z')), '2026-03-08');
    for (const z of ['2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z', '2026-03-09T03:59:00Z', '2026-03-09T04:00:00Z']) {
      assert.equal(X('2026-03-09', Date.parse(z)), false, z);
      assert.equal(X('2026-03-06', Date.parse(z)), true, z);
    }
  });

  await t('서머타임 끝(11/1) — 금 10/30 16:00 EDT = 20:00Z · 월 11/2 16:00 EST = 21:00Z 가 경계', () => {
    assert.equal(X('2026-10-30', Date.parse('2026-10-30T19:59:00Z')), false);
    assert.equal(X('2026-10-30', Date.parse('2026-10-30T20:00:00Z')), true);
    assert.equal(X('2026-11-02', Date.parse('2026-11-02T20:59:00Z')), false);
    assert.equal(X('2026-11-02', Date.parse('2026-11-02T21:00:00Z')), true);
    // ET 자정: 11/1 00:00 EDT = 04:00Z · 11/2 00:00 EST = 05:00Z
    assert.equal(etDateOf(Date.parse('2026-11-01T03:59:00Z')), '2026-10-31');
    assert.equal(etDateOf(Date.parse('2026-11-01T04:00:00Z')), '2026-11-01');
    assert.equal(etDateOf(Date.parse('2026-11-02T04:59:00Z')), '2026-11-01');
    assert.equal(etDateOf(Date.parse('2026-11-02T05:00:00Z')), '2026-11-02');
    assert.equal(X('2026-11-02', Date.parse('2026-11-01T05:30:00Z')), false);   // 01:30 EDT/EST 두 번 오는 시각
    assert.equal(X('2026-10-30', Date.parse('2026-11-01T06:30:00Z')), true);
  });

  await t('날짜 모양이 아니면 판단하지 않는다(false) · 시각이 붙은 날짜는 날짜만 본다', () => {
    const now = edt('2026-10-03', 1);
    for (const bad of [undefined, null, 0, 20261002, '', '2026/10/02', '20261002', 'abc', {}]) assert.equal(X(bad as any, now), false, String(bad));
    assert.equal(X('2026-10-02T00:00:00Z', now), true);
    assert.equal(X('2026-10-05T00:00:00.000Z', now), false);
  });

  await t('판정기(optionExpiryJudge — 묶음을 훑는 곳이 쓴다)는 한 건씩 판정과 답이 같다 · 순서·반복과 무관(만기일별 기억)', () => {
    const exps = ['2026-10-02', '2026-10-05', '2026-10-03', '2026-06-19', '2026-11-27', '2026-11-26', '2027-01-15', '2026-10-02T00:00:00Z', 'x', '', null, 7];
    const times = [edt('2026-10-02', 15, 59), edt('2026-10-02', 16), edt('2026-10-02', 23, 59), edt('2026-10-03', 0), kst('2026-10-03', 8), kst('2026-10-03', 14),
      edt('2026-10-05', 15, 59), edt('2026-10-05', 16), est('2026-11-27', 12, 59), est('2026-11-27', 13), edt('2026-06-18', 16), Date.parse('2026-03-09T20:00:00Z')];
    for (const ms of times) {
      const j = optionExpiryJudge(ms);
      const once = exps.map((e) => X(e, ms));
      assert.deepEqual(exps.map((e) => j(e)), once, new Date(ms).toISOString());
      assert.deepEqual([...exps].reverse().map((e) => j(e)), [...once].reverse());
      assert.deepEqual(exps.map((e) => j(e)), once, '두 번째(기억한 답)도 같다');
    }
  });

  await t('판정기는 계약 수와 무관하게 ET 시각을 «한 번»만 읽는다(toLocaleString 2회) — 계약마다 읽으면 4,500계약 약 180ms(10/3 실측)', () => {
    const real = Date.prototype.toLocaleString;
    let calls = 0;
    Date.prototype.toLocaleString = function (this: Date, ...a: any[]) { calls++; return (real as any).apply(this, a); } as any;
    try {
      const j = optionExpiryJudge(kst('2026-10-03', 8));
      const pool = ['2026-10-02', '2026-10-05', '2026-10-09', '2026-10-16', '2027-01-15'];
      let k = 0;
      for (let i = 0; i < 4500; i++) if (j(pool[i % pool.length])) k++;
      assert.equal(k, 900);
      assert.equal(calls, 2);
    } finally {
      Date.prototype.toLocaleString = real;
    }
  });

  await t('조기 폐장 표는 하나 — watchlistInsights 가 다시 내보내는 것과 같은 객체·같은 함수(값 이동만, 복사 아님)', () => {
    assert.equal(WI.EARLY_CLOSE_DATES, EARLY_CLOSE_DATES);
    assert.equal(WI.sessionCloseMinutes, sessionCloseMinutes);
    assert.deepEqual([...EARLY_CLOSE_DATES].sort(), ['2026-11-27', '2026-12-24', '2027-11-26']);
    assert.equal(sessionCloseMinutes('2026-10-02'), 960);
  });

  // ─────────────────────────────────────────────────────────────────────
  console.log('━━━ 2. 같은 묶음 — 한국 아침 vs 오후 (라우트 all=1·t= · 기관 신규 포지션) ━━━');
  // 묶음 D = 2026-10-02(금) 레코드 · 직전 10/01. 10/2 운영 실측의 «모양»을 옮겼다:
  //   NVDA 10/2 만기 콜 +25,292 + 10/16 만기 콜 +13,986 (자정 전 칩 +39,278 → 자정 뒤 +13,986)
  //   NKE  10/2 만기 풋 +74,521 + 10/9 만기 콜 +7,637  (자정 전 풋 → 자정 뒤 콜 — 방향 뒤집힘)
  //   SPY  10/2 만기 풋 +21,684 뿐                      (자정 전 +21,684 → 자정 뒤 없음)
  //   AAPL 10/5(월) 만기 콜 +3,000 — 다음 거래일 마감(월 16:00 ET)에 빠지는 것이 정상(진짜 만기)
  //   MU   지각 종목(stale · 제 날짜 10/01) — 10/1 만기 +500(만기) · 10/16 만기 +2,500
  const c = (code: string, t: 'C' | 'P', k: number, e: string, d: number | null) => ({ c: code, k, e, t, v: 1000, oi: 5000, d, iv: 0.4, dl: t === 'C' ? 0.5 : -0.5 });
  const tick = (top: any[]) => ({ callOI: 1, putOI: 1, callVol: 1, putVol: 1, pcrOI: 1, pcrVol: 1, gammaOI: 0, contracts: top.length, top });
  const tickers: Record<string, any> = {
    NVDA: tick([c('NVDA261002C00190000', 'C', 190, '2026-10-02', 25292), c('NVDA261016C00200000', 'C', 200, '2026-10-16', 13986), c('NVDA261016P00150000', 'P', 150, '2026-10-16', -900)]),
    NKE: tick([c('NKE261002P00060000', 'P', 60, '2026-10-02', 74521), c('NKE261009C00070000', 'C', 70, '2026-10-09', 7637)]),
    SPY: tick([c('SPY261002P00660000', 'P', 660, '2026-10-02', 21684)]),
    AAPL: tick([c('AAPL261005C00250000', 'C', 250, '2026-10-05', 3000), c('AAPL270115C00300000', 'C', 300, '2027-01-15', 1200)]),
  };
  // 기관 집계의 «시장 전체» 문턱(50종목)을 넘기는 채움 종목 — 먼 만기
  for (let i = 0; i < 60; i++) tickers[`T${i}`] = tick([c(`T${i}C`, 'C', 100, '2027-01-15', 100 + i)]);
  const bundle = {
    date: '2026-10-02', prevDate: '2026-10-01', source: 'api', tickers,
    stale: { MU: { ...tick([c('MU261001C00150000', 'C', 150, '2026-10-01', 500), c('MU261016C00160000', 'C', 160, '2026-10-16', 2500)]), date: '2026-10-01', prevDate: '2026-09-30' } },
  };
  // 이력(수집기 flowPoint 모양 — 만기 필터 없는 합계) 12일 · 0.25B~3.0B — 이 묶음의 «필터 전»(약 2.9B)·«필터 뒤»(약 0.5B) 합계를 가른다
  const histPoints = Array.from({ length: 12 }, (_, i) => ({ date: `2026-09-${hh(14 + i)}`, notional: (i + 1) * 0.25e9, callPct: 60 }));

  process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
  process.env.EC2_REDIS_PROXY_KEY = 'k';
  delete process.env.VERCEL_ENV;
  (globalThis as any).fetch = async (input: any) => {
    const url = String(input);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('http://ec2.test/get')) {
      const key = decodeURIComponent(url.split('key=')[1] || '');
      if (key === 'intrinio:options:eod') return json({ result: JSON.stringify(bundle) });
      if (key === 'intrinio:options:flow:hist') return json({ result: JSON.stringify({ points: histPoints }) });
      return json({ result: null });
    }
    if (url.startsWith('http://ec2.test/set')) return json({ ok: true });
    throw new Error('unexpected fetch ' + url);
  };

  const { GET } = await import('../src/app/api/flow/options-eod/route');
  const call = async (qs: string) => {
    const res = await GET(new NextRequest(`https://x.test/api/flow/options-eod?${qs}`));
    return { cache: res.headers.get('cache-control'), body: await res.json() };
  };
  const strip = (b: any) => { const { simAt, ...rest } = b; return rest; };

  const KR_AM = kst('2026-10-03', 8);    // = 10/2 19:00 ET (미국 저녁)
  const KR_PM = kst('2026-10-03', 14);   // = 10/3 01:00 ET (ET 자정 뒤)
  assert.equal(etDateOf(KR_AM), '2026-10-02');
  assert.equal(etDateOf(KR_PM), '2026-10-03');

  await t('라우트 all=1 — 한국 아침(10/3 08:00)과 오후(14:00)가 글자 그대로 같다', async () => {
    const am = await call(`all=1&at=${KR_AM}`);
    const pm = await call(`all=1&at=${KR_PM}`);
    assert.deepEqual(strip(am.body), strip(pm.body));
    assert.equal(am.body.date, '2026-10-02'); assert.equal(am.body.prevDate, '2026-10-01');
    // 10/2 만기는 묶음이 뜰 때 이미 만기 — 처음부터 빠져 있다
    assert.equal(am.body.opening.NVDA.callContracts, 13986);
    assert.equal(am.body.opening.NKE.side, 'call');
    assert.equal(am.body.opening.NKE.callContracts, 7637);
    assert.equal(am.body.opening.NKE.putContracts, 0);
    assert.equal(am.body.opening.SPY, undefined);
    assert.equal(am.body.opening.AAPL.callContracts, 4200);
    assert.equal(am.body.openingStale.MU.callContracts, 2500);
  });

  await t('수리 전 판정이었다면 같은 묶음이 시각에 따라 바뀐다 — NVDA +39,278 → +13,986 · NKE 풋 → 콜 · SPY +21,684 → 없음', () => {
    const sideOf = (top: any[], ms: number) => {
      let cc = 0, pc = 0, cn = 0, pn = 0;
      for (const x of top) {
        if (!(x.d > 0) || oldExpired(x.e, ms)) continue;
        if (x.t === 'C') { cc += x.d; cn += x.d * 100 * x.k; } else { pc += x.d; pn += x.d * 100 * x.k; }
      }
      return cc + pc > 0 ? { side: cn >= pn ? 'call' : 'put', cc, pc } : null;
    };
    assert.deepEqual(sideOf(tickers.NVDA.top, KR_AM), { side: 'call', cc: 39278, pc: 0 });
    assert.deepEqual(sideOf(tickers.NVDA.top, KR_PM), { side: 'call', cc: 13986, pc: 0 });
    assert.deepEqual(sideOf(tickers.NKE.top, KR_AM), { side: 'put', cc: 7637, pc: 74521 });
    assert.deepEqual(sideOf(tickers.NKE.top, KR_PM), { side: 'call', cc: 7637, pc: 0 });
    assert.deepEqual(sideOf(tickers.SPY.top, KR_AM), { side: 'put', cc: 0, pc: 21684 });
    assert.equal(sideOf(tickers.SPY.top, KR_PM), null);
  });

  await t('라우트 t= — NVDA·NKE·SPY·지각 MU: 한국 아침·오후의 expired·openingCount·contracts 가 같다', async () => {
    for (const tk of ['NVDA', 'NKE', 'SPY', 'MU', 'AAPL']) {
      const am = await call(`t=${tk}&at=${KR_AM}`);
      const pm = await call(`t=${tk}&at=${KR_PM}`);
      const { etToday: a1, ...amRest } = strip(am.body);
      const { etToday: p1, ...pmRest } = strip(pm.body);
      assert.deepEqual(amRest, pmRest, tk);
      assert.equal(a1, '2026-10-02'); assert.equal(p1, '2026-10-03');   // etToday 는 «그 시각의 ET 날짜»(기존 필드 그대로)
    }
    const nvda = (await call(`t=NVDA&at=${KR_AM}`)).body;
    assert.deepEqual(nvda.contracts.map((x: any) => [x.expiration, x.expired]), [['2026-10-02', true], ['2026-10-16', false], ['2026-10-16', false]]);
    assert.equal(nvda.summary.openingCount, 1);
    assert.equal((await call(`t=SPY&at=${KR_AM}`)).body.summary.openingCount, 0);
  });

  await t('묶음이 처음 뜰 수 있는 때(금 16:00 ET)부터 다음 거래일 마감 직전(월 15:30 ET)까지 30분마다 — all=1 이 전부 같다', async () => {
    const ref = strip((await call(`all=1&at=${KR_AM}`)).body);
    let k = 0;
    for (let ms = edt('2026-10-02', 16, 0); ms <= edt('2026-10-05', 15, 30); ms += 30 * 60_000) {
      assert.deepEqual(strip((await call(`all=1&at=${ms}`)).body), ref, new Date(ms).toISOString());
      k++;
    }
    assert.equal(k, 144);
    // 월 16:00 ET(=화 05:00 KST) — 10/5 만기 AAPL +3,000 이 «진짜 만기»로 빠진다(새 묶음이 늦으면 생기는 정상 변화)
    const mon = (await call(`all=1&at=${edt('2026-10-05', 16, 0)}`)).body;
    assert.equal(mon.opening.AAPL.callContracts, 1200);
    assert.equal(mon.opening.NVDA.callContracts, 13986);
  });

  await t('진단 ?at= — 응답은 공유 캐시에 안 남는다(no-store) · simAt 표기 · 운영(VERCEL_ENV=production)에선 무시', async () => {
    const sim = await call(`all=1&at=${KR_AM}`);
    assert.equal(sim.cache, 'no-store');
    assert.equal(sim.body.simAt, new Date(KR_AM).toISOString());
    assert.equal((await call(`all=1&at=2026-10-02T19:00:00-04:00`)).body.simAt, new Date(KR_AM).toISOString());
    assert.equal((await call('all=1&at=nonsense')).body.simAt, undefined);
    // 운영: ?at= 무시 → «지금»(여기선 Date.now 를 한국 아침으로 고정)으로 계산 · 평소 캐시 머리글
    const realNow = Date.now;
    process.env.VERCEL_ENV = 'production';
    try {
      Date.now = () => KR_AM;
      const prodAm = await call(`all=1&at=${edt('2026-10-02', 12)}`);
      assert.equal(prodAm.body.simAt, undefined);
      assert.equal(prodAm.cache, 'public, s-maxage=600, stale-while-revalidate=3600');
      assert.equal(prodAm.body.opening.SPY, undefined, '?at=(장중)을 무시하고 지금(마감 뒤) 기준');
      Date.now = () => KR_PM;
      const prodPm = await call('all=1');
      assert.deepEqual(prodAm.body, prodPm.body, '운영 경로(Date.now)도 한국 아침·오후가 같다');
    } finally {
      Date.now = realNow;
      delete process.env.VERCEL_ENV;
    }
  });

  const F = await import('../src/services/institutionalFlow');
  await t('기관 신규 포지션(옵션 흐름 SEO 페이지·대시 카드·마케팅 입력) — 한국 아침·오후가 같고 만기 지난 계약은 빠진다', async () => {
    const [La, Lp] = [await F.getInstitutionalFlowLeaders(KR_AM), await F.getInstitutionalFlowLeaders(KR_PM)];
    assert.deepEqual(La, Lp);
    assert.ok(La && La.contracts.every((x) => x.expiry !== '2026-10-02'));
    assert.equal(La!.byTicker.find((x) => x.ticker === 'SPY'), undefined);
    assert.equal(La!.byTicker.find((x) => x.ticker === 'NKE')?.side, 'call');
    assert.equal(La!.date, '2026-10-01');
    const [Sa, Sp] = [await F.getInstitutionalFlowSummary(KR_AM), await F.getInstitutionalFlowSummary(KR_PM)];
    assert.deepEqual(Sa, Sp);
    assert.notEqual(Sa?.topContract?.expiry, '2026-10-02');
    const [Na, Np] = [await F.getInstitutionalFlowForTicker('NKE', KR_AM), await F.getInstitutionalFlowForTicker('NKE', KR_PM)];
    assert.deepEqual(Na, Np);
    assert.equal(Na?.side, 'call'); assert.equal(Na?.contracts, 7637);
    assert.equal(await F.getInstitutionalFlowForTicker('SPY', KR_AM), null);
  });

  await t('기관 요약의 «평소 대비» 백분위는 이력과 같은 기준(만기 필터 없는 합계)으로 견준다 — 수리 전과 같은 값', async () => {
    let raw = 0, alive = 0;
    for (const v of Object.values<any>(tickers)) for (const x of v.top) {
      if (!(x.d > 0)) continue;
      raw += x.d * 100 * x.k;
      if (!isOptionExpiredAt(x.e, KR_AM)) alive += x.d * 100 * x.k;
    }
    const pct = (v: number) => Math.round((histPoints.filter((h) => h.notional <= v).length / histPoints.length) * 100);
    assert.notEqual(pct(raw), pct(alive), '시험 자료가 두 기준을 가를 만큼이어야 한다');
    const S = await F.getInstitutionalFlowSummary(KR_AM);
    assert.equal(S?.percentile, pct(raw));
    assert.equal(S?.notional, alive);
    assert.equal(S?.samples, 12);
  });

  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error('✗', e); process.exit(1); });
