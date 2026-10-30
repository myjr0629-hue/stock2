/**
 * 실적 주간 페이지(/[locale]/earnings-week) — 규칙·자료·정확성 (2026-10-11)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsWeek.test.ts
 *
 * 지키는 것:
 *   1. 주(週) 경계 — 뉴욕 월~금, 토·일에는 다음 주 · 회사 공지 목록에서 그 주 항목만(추정 날짜는 표에 없다)
 *   2. 발표 상태 — 장전은 개장(09:30 ET), 장후는 18:00 ET 이후 «발표 완료» · 시각 미공지는 그날 끝까지 «오늘»
 *   3. 한국 시각 — 서머타임(EDT)·표준시(EST) 환산 · 시각이 없으면 «같은 날 저녁~밤 / 다음 날 새벽»으로만
 *   4. 숫자 정확성 — 페이지가 읽는 예상 변동은 GET /api/options/implied-move(라우트)와 «같은 저장본에서 같은 값»(오라클 대조) ·
 *      레벨은 저장본 값 그대로 · 저장본이 없으면 «값 없음 + 이유»(지어내지 않는다) · Redis 쓰기 0 · 읽기 실패에도 던지지 않는다
 *   5. 표시 — 발표 완료 행의 예상 변동은 지운다(레벨은 현재 값) · 맨 위 한 줄은 «아직 안 나온 종목 중» 가장 큰 값
 *   6. 문구 — 금지 표현 없음 · Max Pain/Call Wall/Put Floor 는 세 언어 모두 번역하지 않는다 · 앱 링크(from·code)와 쿠폰 화면 문구
 */
import assert from 'node:assert/strict';

process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FMP_API_KEY = 'test-fmp';
process.env.FINNHUB_API_KEY = 'test-finnhub';
const store = new Map<string, unknown>();
let writes = 0;
const writeKeys: string[] = [];
let mgets = 0;
let failReads = false;
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (failReads && (u.pathname === '/get' || u.pathname === '/mget')) throw new Error('redis down');
  if (u.pathname === '/get') return Response.json({ result: store.get(u.searchParams.get('key') || '') ?? null });
  if (u.pathname === '/mget') {
    mgets += 1;
    const keys = (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent);
    return Response.json({ results: keys.map((k) => store.get(k) ?? null) });
  }
  if (u.pathname === '/set' && init?.method === 'POST') { writes += 1; try { writeKeys.push(JSON.parse(init.body || '{}').key); } catch { /* */ } return Response.json({ ok: true }); }
  if (u.hostname === 'financialmodelingprep.com') return Response.json([]);
  return new Response('not found', { status: 404 });
};

const EW = require('../src/lib/earningsWeek') as typeof import('../src/lib/earningsWeek');
const V = require('../src/lib/earningsWeekView') as typeof import('../src/lib/earningsWeekView');
const C = require('../src/lib/earningsConfirmed') as typeof import('../src/lib/earningsConfirmed');
const SVC = require('../src/services/earningsWeekService') as typeof import('../src/services/earningsWeekService');
const IMS = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const ROUTE = require('../src/app/api/options/implied-move/route') as typeof import('../src/app/api/options/implied-move/route');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');
const COUPON = require('../src/lib/marketing/coupon') as typeof import('../src/lib/marketing/coupon');
const { NextRequest } = require('next/server');

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const at = async <T,>(iso: string, fn: () => Promise<T>): Promise<T> => {
  const real = Date.now; const ms = Date.parse(iso);
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = real; }
};
const ms = (iso: string) => Date.parse(iso);

// ── 저장본 모양(structureService 의 판본: { data, timestamp }) ─────────────────────────────
function structure(ticker: string, S: number, o: { mp: number; cw: number; pf: number; pct: number | null; straddle?: number; strike?: number; imExpiry?: string; exps?: string[]; basis?: 'eod' | 'live' }) {
  const strikes = [o.pf - 5, o.pf, o.mp, o.strike ?? Math.round(S), o.cw, o.cw + 5].sort((a, b) => a - b);
  const exps = o.exps ?? ['2026-10-16', '2026-10-23', '2026-10-30'];
  return {
    data: {
      ticker, options_status: 'OK', expiration: '2026-10-16', availableExpirations: exps, chainDate: '2026-10-09',
      underlyingPrice: S, prevClose: S - 1, maxPain: o.mp,
      levels: { callWall: o.cw, putFloor: o.pf, pinZone: o.mp },
      structure: { strikes, callsOI: strikes.map((_, i) => 100 + i), putsOI: strikes.map((_, i) => 200 - i), gexCum: strikes.map((_, i) => -50 + i * 20) },
      impliedMove: o.pct == null ? null : {
        def: 'atm-straddle-mid/1', pct: o.pct, straddle: o.straddle ?? +(S * o.pct / 100).toFixed(2), strike: o.strike ?? Math.round(S), expiry: o.imExpiry ?? '2026-10-16',
        callPrice: 1, putPrice: 1, spot: S, basis: o.basis ?? 'eod', asOf: null, chainDate: '2026-10-09', session: '2026-10-09',
      },
    },
    timestamp: ms('2026-10-10T04:07:00Z'),
  };
}
const put = (k: string, v: unknown) => store.set(k, v);
const seed = () => {
  store.clear(); writes = 0; writeKeys.length = 0; mgets = 0; failReads = false;
  SVC._resetEarningsWeekMemo();
  RC._resetEcBreakerForTest();     // 앞 시험의 «Redis 다운»이 차단기를 열어 둔 채 넘어가지 않게
  put('structure:v2:JPM', structure('JPM', 333.45, { mp: 335, cw: 375, pf: 330, pct: 3.6 }));
  put('structure:v2:BAC', structure('BAC', 54.425, { mp: 54, cw: 60, pf: 50, pct: 4.1, strike: 54 }));
  put('structure:v2:TSM', structure('TSM', 452.94, { mp: 450, cw: 500, pf: 420, pct: 4.3, strike: 452.5 }));
  put('intrinio:eod:snapshot', { date: '2026-10-09', rows: [['JNJ', 0, 0, 0, 261.4, 0, 0, 0]] });
  // JNJ: 구조 사본의 주간 만기(10/16)가 «발표 뒤 첫 만기»(10/14)와 달라 수집기 체인으로 계산하는 경로
  put('structure:v2:JNJ', structure('JNJ', 261.4, { mp: 260, cw: 280, pf: 250, pct: 3.6, strike: 262.5, exps: ['2026-10-14', '2026-10-16', '2026-10-23'] }));
  put('polygon:snapshot:probe:JNJ', {
    greeksSource: 'eod', _ts: ms('2026-10-10T04:00:00Z'), chainDate: '2026-10-09',
    probeResults: [
      { details: { expiration_date: '2026-10-14', strike_price: 262.5, contract_type: 'call' }, last_quote: { midpoint: 3.1 }, _rtGreeks: false },
      { details: { expiration_date: '2026-10-14', strike_price: 262.5, contract_type: 'put' }, last_quote: { midpoint: 3.5 }, _rtGreeks: false },
    ],
  });
  // PLD: 저장본 없음
};

const WEEK_NOW = ms('2026-10-11T16:00:00Z');   // 일요일 낮(ET 12:00) → 다음 주 10/12~10/16

(async () => {
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 1. 주 경계 · 회사 공지 목록 ━━━');
  t('뉴욕 월~금 — 일요일은 다음 주, 월~금은 그 주, 토요일은 다음 주', () => {
    const r = (iso: string) => EW.weekRangeET(ms(iso));
    assert.deepEqual([r('2026-10-11T16:00:00Z').start, r('2026-10-11T16:00:00Z').end, r('2026-10-11T16:00:00Z').rolled], ['2026-10-12', '2026-10-16', true]);
    assert.deepEqual([r('2026-10-12T13:00:00Z').start, r('2026-10-12T13:00:00Z').rolled], ['2026-10-12', false]);
    assert.equal(r('2026-10-14T20:00:00Z').start, '2026-10-12');
    assert.equal(r('2026-10-16T22:00:00Z').end, '2026-10-16');
    assert.equal(r('2026-10-17T15:00:00Z').start, '2026-10-19');   // 토요일
    // 한국은 이미 월요일이어도 뉴욕이 일요일이면 «다음 주» — 뉴욕 기준
    assert.equal(r('2026-10-11T23:30:00Z').start, '2026-10-12');
    assert.equal(r('2026-10-12T03:30:00Z').rolled, true);          // ET 일요일 23:30
  });
  t('★ 10/12~10/16 = 회사가 공지한 12종목(ASML·BAC·BLK·C·GS·JNJ·JPM·MS·PLD·TSM·UNH·WFC) — 날짜·시각 순', () => {
    const e = EW.selectWeekEntries(C.CONFIRMED_EARNINGS, '2026-10-12', '2026-10-16');
    assert.deepEqual(e.map((x) => x.ticker).sort(), ['ASML', 'BAC', 'BLK', 'C', 'GS', 'JNJ', 'JPM', 'MS', 'PLD', 'TSM', 'UNH', 'WFC']);
    assert.deepEqual(e.map((x) => x.date), [...e.map((x) => x.date)].sort(), '날짜순');
    const byDay = (d: string) => e.filter((x) => x.date === d).map((x) => x.ticker);
    assert.deepEqual(byDay('2026-10-13'), ['C', 'GS', 'JNJ', 'JPM', 'UNH', 'WFC'], '같은 날 장전끼리는 티커순 — 분 단위 시각은 일부 종목에만 있어 순서에 쓰지 않는다');
    assert.deepEqual(byDay('2026-10-14'), ['ASML', 'BAC', 'BLK', 'MS']);
    assert.deepEqual(byDay('2026-10-15'), ['TSM', 'PLD'], '장전(TSM 02:00) → 시각 미공지(PLD)');
  });
  t('목록에 없는 주(예: 10/26~10/30 일부)는 비지 않고, 먼 주는 빈 배열 — 추정 날짜는 만들지 않는다', () => {
    const w2 = EW.selectWeekEntries(C.CONFIRMED_EARNINGS, '2026-10-19', '2026-10-23').map((x) => `${x.ticker}@${x.date}`);
    assert.deepEqual(w2.sort(), ['IBM@2026-10-21', 'LRCX@2026-10-21', 'NEE@2026-10-21', 'NFLX@2026-10-20', 'TSLA@2026-10-21']);
    assert.deepEqual(EW.selectWeekEntries(C.CONFIRMED_EARNINGS, '2027-03-01', '2027-03-05'), []);
  });
  t('목록의 etTime 은 «HH:MM»이고 실제 존재하는 ET 시각이다(근거 있는 항목에만)', () => {
    for (const c of C.CONFIRMED_EARNINGS) {
      if (c.etTime == null) continue;
      assert.match(c.etTime, /^\d{2}:\d{2}$/, c.ticker);
      assert.notEqual(EW.etWallToMs(c.date, c.etTime), null, c.ticker);
    }
    const by = Object.fromEntries(C.CONFIRMED_EARNINGS.map((c) => [c.ticker, c]));
    assert.equal(by.GS.etTime, '07:30'); assert.equal(by.C.etTime, '08:00'); assert.equal(by.WFC.etTime, '07:00'); assert.equal(by.MS.etTime, '07:30');
    assert.equal(by.JPM.etTime, undefined, '근거 문장에 시각이 없는 항목은 비운다');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 2. 발표 상태 ━━━');
  t('장전(bmo) — 개장 전 today · 09:30 ET 부터 done · 전날은 upcoming · 다음 날은 done', () => {
    const p = (iso: string) => EW.phaseOf('2026-10-13', 'bmo', ms(iso));
    assert.equal(p('2026-10-12T20:00:00Z'), 'upcoming');
    assert.equal(p('2026-10-13T11:00:00Z'), 'today');      // 07:00 ET
    assert.equal(p('2026-10-13T13:29:00Z'), 'today');      // 09:29 ET
    assert.equal(p('2026-10-13T13:30:00Z'), 'done');       // 09:30 ET
    assert.equal(p('2026-10-14T12:00:00Z'), 'done');
  });
  t('장후(amc) — 18:00 ET 전까지 today · 이후 done / 시각 미공지는 그날 끝까지 today', () => {
    const a = (iso: string) => EW.phaseOf('2026-10-21', 'amc', ms(iso));
    assert.equal(a('2026-10-21T21:59:00Z'), 'today');      // 17:59 ET
    assert.equal(a('2026-10-21T22:00:00Z'), 'done');       // 18:00 ET
    const x = (iso: string) => EW.phaseOf('2026-10-15', '', ms(iso));
    assert.equal(x('2026-10-16T03:59:00Z'), 'today');      // 10/15 23:59 ET
    assert.equal(x('2026-10-16T04:00:00Z'), 'done');       // 10/16 00:00 ET
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 3. 한국 시각 ━━━');
  t('서머타임(EDT, UTC-4) — GS 10/13 07:30 ET = 한국 10/13 20:30 · ASML 10/14 01:00 ET = 한국 14:00 · TSM 10/15 02:00 ET = 한국 15:00', () => {
    const w = (d: string, tm: string) => EW.releaseWhen({ date: d, hour: 'bmo', etTime: tm });
    assert.deepEqual([w('2026-10-13', '07:30').kstDate, w('2026-10-13', '07:30').kstTime], ['2026-10-13', '20:30']);
    assert.deepEqual([w('2026-10-14', '01:00').kstDate, w('2026-10-14', '01:00').kstTime], ['2026-10-14', '14:00']);
    assert.deepEqual([w('2026-10-15', '02:00').kstDate, w('2026-10-15', '02:00').kstTime], ['2026-10-15', '15:00']);
  });
  t('표준시(EST, UTC-5) — 11/3 08:00 ET = 한국 22:00 · 서머타임 끝(11/1) 전후가 갈린다', () => {
    const w = EW.releaseWhen({ date: '2026-11-03', hour: 'bmo', etTime: '08:00' });
    assert.deepEqual([w.kstDate, w.kstTime], ['2026-11-03', '22:00']);
    assert.equal(EW.releaseWhen({ date: '2026-10-30', hour: 'bmo', etTime: '08:00' }).kstTime, '21:00');
  });
  t('시각이 없으면 분을 지어내지 않는다 — 장전 = 한국 같은 날 저녁~밤 · 장후 = 한국 다음 날 새벽 · 미공지 = 한국 줄 없음', () => {
    const bmo = EW.releaseWhen({ date: '2026-10-13', hour: 'bmo' });
    assert.deepEqual([bmo.kstDate, bmo.kstTime, bmo.kstApprox], ['2026-10-13', null, 'evening']);
    const amc = EW.releaseWhen({ date: '2026-10-21', hour: 'amc' });
    assert.deepEqual([amc.kstDate, amc.kstTime, amc.kstApprox], ['2026-10-22', null, 'dawn']);
    assert.deepEqual([EW.releaseWhen({ date: '2026-10-15', hour: '' }).kstDate, EW.releaseWhen({ date: '2026-10-15', hour: '' }).kstApprox], [null, null]);
  });
  t('날짜 표기 — 10/13(화) · 10/13 (Tue) · 10/13(火)', () => {
    assert.equal(EW.mdw('2026-10-13', 'ko'), '10/13(화)');
    assert.equal(EW.mdw('2026-10-13', 'en'), '10/13 (Tue)');
    assert.equal(EW.mdw('2026-10-13', 'ja'), '10/13(火)');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 4. 숫자 정확성 — 라우트(오라클)와 같은 저장본에서 같은 값 ━━━');
  await ta('★ 페이지가 읽는 예상 변동 = GET /api/options/implied-move 결과(JPM·BAC·TSM 구조 사본 / JNJ 수집기 체인 / PLD 저장본 없음)', async () => {
    seed();
    const cases = [
      { ticker: 'JPM', after: '2026-10-13', timing: 'bmo' as const },
      { ticker: 'BAC', after: '2026-10-14', timing: 'bmo' as const },
      { ticker: 'TSM', after: '2026-10-15', timing: 'bmo' as const },
      { ticker: 'JNJ', after: '2026-10-13', timing: 'bmo' as const },
      { ticker: 'PLD', after: '2026-10-15', timing: 'unknown' as const },
    ];
    const mine = await at('2026-10-11T16:00:00Z', () => IMS.readImpliedMoveRows(cases, '2026-10-11'));
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const res = await at('2026-10-11T16:00:00Z', () => ROUTE.GET(new NextRequest(`https://x.test/api/options/implied-move?tickers=${c.ticker}&after=${c.after}&timing=${c.timing}`)));
      const oracle = (await res.json()).results[0];
      assert.deepEqual(mine[i], oracle, `${c.ticker}: 페이지 읽기와 라우트가 다르다`);
    }
    assert.equal(mine[0].impliedMovePct, 3.6); assert.equal(mine[0].expiry, '2026-10-16'); assert.equal(mine[0].source, 'structure');
    assert.equal(mine[3].source, 'probe'); assert.equal(mine[3].expiry, '2026-10-14');
    assert.equal(mine[3].impliedMovePct, +(((3.1 + 3.5) / 261.4) * 100).toFixed(1));      // 정의 그대로: (콜+풋 중간가) ÷ 현물
    assert.equal(mine[4].impliedMovePct, null); assert.equal(mine[4].reason, 'no_snapshot');
    assert.equal(writes, 0, 'Redis 쓰기 0');
  });
  await ta('buildEarningsWeek — 12종목 · 숫자는 저장본 그대로(예상 변동·Max Pain·Call Wall·Put Floor·기준가) · 저장본 없는 종목은 값 없음', async () => {
    seed();
    const d = await at('2026-10-11T16:00:00Z', () => SVC.buildEarningsWeek(WEEK_NOW));
    assert.equal(d.range.start, '2026-10-12'); assert.equal(d.rows.length, 12);
    const by = Object.fromEntries(d.rows.map((r) => [r.ticker, r]));
    const jpm = by.JPM;
    assert.deepEqual([jpm.impliedMovePct, jpm.impliedExpiry, jpm.spot, jpm.maxPain, jpm.callWall, jpm.putFloor], [3.6, '2026-10-16', 333.45, 335, 375, 330]);
    assert.deepEqual([by.BAC.impliedMovePct, by.BAC.maxPain, by.BAC.callWall, by.BAC.putFloor], [4.1, 54, 60, 50]);
    assert.deepEqual([by.TSM.impliedMovePct, by.TSM.maxPain, by.TSM.callWall, by.TSM.putFloor], [4.3, 450, 500, 420]);
    assert.equal(by.JNJ.impliedExpiry, '2026-10-14');
    const pld = by.PLD;
    assert.deepEqual([pld.impliedMovePct, pld.maxPain, pld.callWall, pld.putFloor, pld.spot], [null, null, null, null, null]);
    assert.equal(pld.impliedReason, 'no_snapshot');
    assert.equal(d.dataSession, '2026-10-09'); assert.equal(d.dataBasis, 'eod');
    assert.deepEqual(writeKeys.filter((k) => !/^structure:/.test(k)), [], `구조 데우기 잠금(structure:*) 외 Redis 쓰기 0: ${writeKeys.join(',')}`);
  });
  await ta('[T37] 발표 뒤 갭 Max Pain — INTC 10/30 재현: 판본이 ±35% 정의 밖(94 vs 63.6)으로 뺀 값을 발표 전 기록 현물(92.07) 기준 ±35% 안일 때만 표시', async () => {
    const PRM = require('../src/lib/earnings/postReportMaxPain') as typeof import('../src/lib/earnings/postReportMaxPain');
    const A = require('../src/lib/earnings/earningsActuals') as typeof import('../src/lib/earnings/earningsActuals');
    const intc = (o: { mp?: number | null; oob?: number | null; exp?: string; chain?: string } = {}) => ({
      data: {
        ticker: 'INTC', options_status: 'OK', expiration: o.exp ?? '2026-10-16', chainDate: o.chain ?? '2026-10-14', availableExpirations: ['2026-10-16', '2026-10-23'],
        underlyingPrice: 63.632, prevClose: 92.07, maxPain: o.mp ?? null,
        levels: { callWall: 70, putFloor: 55, pinZone: null },
        structure: { strikes: [50, 55, 60, 64, 70, 94], callsOI: [1, 2, 3, 4, 5, 6], putsOI: [6, 5, 4, 3, 2, 1], gexCum: [1, 2, 3, 4, 5, 6] },
        debug: { maxPainOutOfBand: o.oob === undefined ? 94 : o.oob },
      },
      timestamp: ms('2026-10-15T18:30:00Z'),
    });
    const expected = (spot: number | null, session = '2026-10-14') => ({ pct: 6.9, expiry: '2026-10-16', session, basis: 'eod', method: 'weekly', straddlePct: 6.9, strike: 92, straddle: 6.38, spot, capturedAt: 1, src: 'page' });
    const record = (exp: any) => ({ v: 1, ticker: 'INTC', date: '2026-10-14', hour: 'amc', expected: exp, actual: null, at: 1 });
    const list = [{ ...C.CONFIRMED_EARNINGS[0], ticker: 'INTC', date: '2026-10-14', hour: 'amc' as const, etTime: undefined }];
    const NOW = '2026-10-15T18:57:00Z';   // 목 14:57 ET — 발표(10/14 장후) 다음 정규장
    const row = async () => (await at(NOW, () => SVC.buildEarningsWeek(ms(NOW), list as any, { readOnly: true }))).rows[0];

    // 순수 함수 — 표
    const shown = { maxPain: null, levelsExpiration: '2026-10-16', levelsChainDate: '2026-10-14' };
    const ex = A.parseRecord(record(expected(92.07)))!.expected;
    assert.equal(PRM.postReportMaxPain(intc(), shown, ex, '2026-10-15'), 94);
    assert.equal(PRM.postReportMaxPain(intc(), shown, ex, '2026-10-14'), null, '발표 전 기록 세션 당일(발표 전일 수 있다) — 정의 그대로');
    assert.equal(PRM.postReportMaxPain(intc(), { ...shown, maxPain: 70 }, ex, '2026-10-15'), null, '표시 값이 있으면 건드리지 않는다');
    assert.equal(PRM.postReportMaxPain(intc({ oob: 52.5 }), shown, ex, '2026-10-15'), null, '발표 전 가격에서도 ±35% 밖 = 왜곡 체인(DD 137 대 52.5 꼴) — 계속 없음');
    assert.equal(PRM.postReportMaxPain(intc({ oob: null }), shown, ex, '2026-10-15'), null);
    assert.equal(PRM.postReportMaxPain(intc({ mp: 64 }), shown, ex, '2026-10-15'), null, '판본에 값이 있었는데 문이 지운 경우는 되살리지 않는다');
    assert.equal(PRM.postReportMaxPain(intc({ exp: '2026-10-23' }), shown, ex, '2026-10-15'), null, '다른 만기 판본');
    assert.equal(PRM.postReportMaxPain(intc({ chain: '2026-10-13' }), shown, ex, '2026-10-15'), null, '다른 체인 날짜 판본');
    assert.equal(PRM.postReportMaxPain(intc(), shown, A.parseRecord(record(expected(null)))!.expected, '2026-10-15'), null, '발표 전 현물 기록 없음');
    assert.equal(PRM.postReportMaxPain(intc(), shown, null, '2026-10-15'), null);
    assert.equal(PRM.postReportMaxPain(null, shown, ex, '2026-10-15'), null);
    assert.equal(PRM.postReportMaxPain({ data: { ...intc().data, options_status: 'PARTIAL' } }, shown, ex, '2026-10-15'), null);

    // 서비스 — 같은 mget(왕복 수 그대로) · Redis 쓰기 0 · Call Wall·Put Floor 는 그대로
    seed(); put('structure:v2:INTC', intc()); put(A.actualsKey('INTC', '2026-10-14'), record(expected(92.07)));
    const before = mgets;
    const r1 = await row();
    assert.deepEqual([r1.maxPain, r1.callWall, r1.putFloor, r1.levelsExpiry], [94, 70, 55, '2026-10-16']);
    assert.equal(writes, 0, 'Redis 쓰기 0');
    const mgetsWithFix = mgets - before;
    // 발표 전 기록이 없으면 — 예전과 같이 없음(«—»)
    seed(); put('structure:v2:INTC', intc());
    const before2 = mgets;
    const r2 = await row();
    assert.deepEqual([r2.maxPain, r2.callWall], [null, 70]);
    assert.equal(mgetsWithFix, mgets - before2, `Redis 왕복 수 같음(${mgetsWithFix})`);
    // 발표 전 현물에서도 멀면(왜곡 체인) — 없음
    seed(); put('structure:v2:INTC', intc({ oob: 40 })); put(A.actualsKey('INTC', '2026-10-14'), record(expected(92.07)));
    assert.equal((await row()).maxPain, null);
    // 화면 뷰 — 기존 형식 그대로 «$94»(문구 변경 0)
    seed(); put('structure:v2:INTC', intc()); put(A.actualsKey('INTC', '2026-10-14'), record(expected(92.07)));
    const d = await at(NOW, () => SVC.buildEarningsWeek(ms(NOW), list as any, { readOnly: true }));
    assert.equal(V.viewRow(d.rows[0], 'ko', d, ms(NOW)).maxPain, '$94');
  });
  await ta('만기가 지난 레벨 판본은 쓰지 않는다 · 읽기 실패에도 던지지 않고 «값 없음»으로 12행을 낸다', async () => {
    seed();
    put('structure:v2:JPM', { ...structure('JPM', 333.45, { mp: 335, cw: 375, pf: 330, pct: 3.6 }), data: { ...structure('JPM', 333.45, { mp: 335, cw: 375, pf: 330, pct: 3.6 }).data, expiration: '2026-10-09' } });
    const d1 = await at('2026-10-11T16:00:00Z', () => SVC.buildEarningsWeek(WEEK_NOW));
    assert.deepEqual([d1.rows.find((r) => r.ticker === 'JPM')!.maxPain, d1.rows.find((r) => r.ticker === 'JPM')!.impliedMovePct], [null, null]);
    seed(); failReads = true;
    const d2 = await at('2026-10-11T16:00:00Z', () => SVC.buildEarningsWeek(WEEK_NOW));
    assert.equal(d2.rows.length, 12);
    assert.ok(d2.rows.every((r) => r.impliedMovePct == null && r.maxPain == null));
  });
  await ta('날짜 확인 전 종목 — 캘린더 «캐시»에서 읽기만(회사 공지 목록에 없는 종목만 · 이번 주 밖 날짜 제외) · 캐시가 없어도 벤더를 부르지 않는다', async () => {
    seed();
    const none = await at('2026-10-11T16:00:00Z', () => SVC.buildEarningsWeek(WEEK_NOW));
    assert.deepEqual(none.pending, []);
    put('market:earnings-calendar:v4', { ok: true, rows: [
      { ticker: 'ZZZ', date: '2026-10-15' }, { ticker: 'YYY', date: '2026-10-13' }, { ticker: 'JPM', date: '2026-10-13' },
      { ticker: 'TSLA', date: '2026-10-14' },                 // 회사 공지는 10/21 — FMP 옛 추정이 이 주에 걸려도 «확인 전»으로 올리지 않는다
      { ticker: 'AAA', date: '2026-10-20' },
    ] });
    SVC._resetEarningsWeekMemo();
    const d = await at('2026-10-11T16:00:00Z', () => SVC.buildEarningsWeek(WEEK_NOW));
    assert.deepEqual(d.pending, [{ ticker: 'YYY', date: '2026-10-13' }, { ticker: 'ZZZ', date: '2026-10-15' }]);
    assert.equal(d.rows.length, 12, '표에는 회사 공지 종목만');
  });
  await ta('getEarningsWeek — 60초 안에는 Redis 를 다시 읽지 않는다 · 읽기가 실패하면 마지막 정상본', async () => {
    seed();
    const real = Date.now; let clock = ms('2026-10-11T16:00:00Z'); Date.now = () => clock;
    try {
      const a = await SVC.getEarningsWeek();
      const readsAfterFirst = mgets;
      assert.ok(readsAfterFirst >= 2);
      clock += 30_000;
      const b = await SVC.getEarningsWeek();
      assert.equal(mgets, readsAfterFirst, '메모 적중 — 읽기 0'); assert.equal(b, a);
      clock += 5 * 60_000; failReads = true;
      let bg = 0;
      const c = await SVC.getEarningsWeek({ background: () => { bg += 1; } });
      assert.equal(c.rows.find((r) => r.ticker === 'JPM')!.impliedMovePct, 3.6, '낡은 사본을 즉시');
      assert.equal(bg, 1, '갱신은 응답 뒤로');
    } finally { Date.now = real; }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 5. 표시 변환 ━━━');
  await ta('★ 발표가 지난 종목은 «발표 완료» — 예상 변동은 지우고 레벨은 지금 값 · 앞으로 남은 종목은 그대로', async () => {
    seed();
    const d = await at('2026-10-11T16:00:00Z', () => SVC.buildEarningsWeek(WEEK_NOW));
    const now = ms('2026-10-14T15:00:00Z');       // 10/14 11:00 ET — 10/13 전부 · 10/14 장전 전부 완료, 10/15 TSM·PLD 앞으로
    const view = (tk: string) => V.viewRow(d.rows.find((r) => r.ticker === tk)!, 'ko', d, now);
    assert.equal(view('JPM').phase, 'done'); assert.equal(view('JPM').moveText, null); assert.equal(view('JPM').maxPain, '$335');
    assert.equal(view('BAC').phase, 'done');
    assert.equal(view('TSM').phase, 'upcoming'); assert.equal(view('TSM').moveText, '±4.3%'); assert.equal(view('TSM').moveTag, '10/16 만기');
    assert.deepEqual(V.countsOf(d, now), { n: 12, done: 10, left: 2 });
  });
  await ta('맨 위 한 줄 — 아직 안 나온 종목 중 가장 큰 예상 변동(TSM ±4.3%) · 완료된 종목의 큰 값은 빠진다', async () => {
    seed();
    const d = await at('2026-10-11T16:00:00Z', () => SVC.buildEarningsWeek(WEEK_NOW));
    const l0 = V.topLineOf(d, 'ko', WEEK_NOW)!;
    assert.match(l0, /^이번 주 가장 큰 예상 변동: TSM ±4\.3% \(10\/15 02:00 ET\)$/);
    assert.equal(V.topLineOf(d, 'en', WEEK_NOW), 'Biggest implied move this week: TSM ±4.3% (10/15 02:00 ET)');
    assert.match(V.topLineOf(d, 'ja', WEEK_NOW)!, /^今週最大の予想変動: TSM ±4\.3%/);
    // 10/15 03:00 ET 이후 TSM 은 완료 → BAC(4.1)가 이미 완료라 JNJ/JPM 도 완료 → 남은 값이 없으면 null
    assert.equal(V.topLineOf(d, 'ko', ms('2026-10-16T12:00:00Z')), null);
  });
  await ta('행 표시 — 한국 시각 줄·기준가·레벨 글자 · 숫자가 없으면 «—»가 아니라 noData 표식', async () => {
    seed();
    const d = await at('2026-10-11T16:00:00Z', () => SVC.buildEarningsWeek(WEEK_NOW));
    const gs = V.viewRow(d.rows.find((r) => r.ticker === 'GS')!, 'ko', d, WEEK_NOW);
    assert.equal(gs.etLine, '10/13(화) 07:30 ET'); assert.equal(gs.kstLine, '한국 10/13(화) 20:30');
    const jpm = V.viewRow(d.rows.find((r) => r.ticker === 'JPM')!, 'ko', d, WEEK_NOW);
    assert.equal(jpm.etLine, '10/13(화) 장전'); assert.equal(jpm.kstLine, '한국 10/13(화) 저녁~밤');
    assert.deepEqual([jpm.moveText, jpm.priceText, jpm.maxPain, jpm.callWall, jpm.putFloor], ['±3.6%', '$333.45', '$335', '$375', '$330']);
    const pld = V.viewRow(d.rows.find((r) => r.ticker === 'PLD')!, 'en', d, WEEK_NOW);
    assert.equal(pld.etLine, '10/15 (Thu) Time not announced'); assert.equal(pld.kstLine, null);
    assert.equal(pld.noData, true); assert.equal(pld.moveText, null);
    assert.equal(V.fmtLevel(52.5), '$52.5'); assert.equal(V.fmtLevel(1055), '$1,055'); assert.equal(V.fmtLevel(null), null); assert.equal(V.fmtPrice(54.425), '$54.43');
  });
  await ta('기준 시각 줄 — 마감 호가면 «뉴욕 10/9(금) 마감 호가 · 계산 시각 뉴욕 … · 한국 …» · 장중이면 «장중 실시간 호가»', async () => {
    seed();
    const d = await at('2026-10-11T16:00:00Z', () => SVC.buildEarningsWeek(WEEK_NOW));
    const l = V.asOfLineOf(d, 'ko')!;
    assert.match(l, /^옵션 숫자 기준: 뉴욕 10\/9\(금\) 마감 호가 · 계산 시각 뉴욕 10\/10\(토\) 00:07 · 한국 10\/10\(토\) 13:07$/);
    assert.match(V.asOfLineOf({ ...d, dataBasis: 'live' }, 'en')!, /^Options numbers as of: live in-session quotes/);
    assert.equal(V.asOfLineOf({ ...d, dataBasis: null }, 'ko'), null);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 6. 문구 · 앱 링크 ━━━');
  t('금지 표현(투자 권유·확실·보장 유도) 없음 — 세 언어 모든 문구', () => {
    const sample = { n: 12, done: 3, left: 9, ticker: 'TSM', pct: '±4.3%', when: '10/15 02:00 ET', top: 'x', range: '10/12–10/16', session: 'x', kst: 'x', at: '2026-10-11', md: '10/16', day: '10/9(금)', ny: 'x' } as any;
    for (const loc of EW.EW_LOCALES) {
      const c = EW.COPY[loc];
      const all: string[] = [];
      const walk = (v: unknown) => {
        if (typeof v === 'string') all.push(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(c);
      for (const fn of [c.h1, c.metaTitle, c.shareTitle]) all.push(fn('10/12–10/16'));
      all.push(c.metaDesc(sample), c.topLine(sample), c.countLine(sample), c.shareText(sample), c.asOfClose(sample), c.asOfAt(sample), c.verified(sample), c.expiryTag('10/16'), c.sessionTag('10/9'));
      const text = all.join('\n');
      for (const re of EW.BANNED_WORDS) assert.doesNotMatch(text, re, `${loc}: ${re}`);
      // 투자 권유 어휘: «추천»·«recommend» 는 고지 문장(…추천이 아닙니다 / not a recommendation)에서만
      const adv = text.split('\n').filter((s) => /추천|recommend|おすすめ|推奨/i.test(s));
      for (const s of adv) assert.match(s, /아닙니다|not |ではなく|ではありません/i, `${loc}: 권유처럼 읽히는 문장 «${s.slice(0, 60)}»`);
    }
  });
  t('금융 공통어 Max Pain · Call Wall · Put Floor 는 세 언어에서 번역하지 않는다', () => {
    for (const loc of EW.EW_LOCALES) {
      const c = EW.COPY[loc];
      assert.deepEqual([c.col.maxPain, c.col.callWall, c.col.putFloor], ['Max Pain', 'Call Wall', 'Put Floor'], loc);
      assert.ok(c.lead.includes('Max Pain') && c.lead.includes('Call Wall') && c.lead.includes('Put Floor'), `${loc} lead`);
      assert.doesNotMatch(JSON.stringify(c), /맥스페인|マックスペイン|콜월|풋플로어|コールウォール|プットフロア/, loc);
    }
  });
  t('★ 앱 링크 — https://www.signumhq.com/app?from=earnings_week&code=<ko NAVERPRO · ja NOTEJP · en IHPRO> · CTA 문구 3언어', () => {
    assert.equal(EW.appLink('ko'), 'https://www.signumhq.com/app?from=earnings_week&code=NAVERPRO');
    assert.equal(EW.appLink('ja'), 'https://www.signumhq.com/app?from=earnings_week&code=NOTEJP');
    assert.equal(EW.appLink('en'), 'https://www.signumhq.com/app?from=earnings_week&code=IHPRO');
    assert.equal(EW.COPY.ko.cta, '실시간 옵션 흐름·Max Pain 변화는 앱에서 — PRO 1개월 무료(이후 자동 갱신·언제든 해지)');
    assert.match(EW.COPY.ja.cta, /PRO 1か月無料.*自動更新.*解約/); assert.match(EW.COPY.en.cta, /1 month of PRO free.*auto-renews.*cancel anytime/);
  });
  t('★ 쿠폰 화면 문구 — from=earnings_week 는 코드의 채널(네이버 블로그·note·Indie Hackers)이 아니라 «SIGNUM 웹 방문자 전용»', () => {
    assert.equal(COUPON.audienceLine('earnings_week', 'NAVERPRO', 'ko'), 'SIGNUM 웹 방문자 전용');
    assert.equal(COUPON.audienceLine('earnings_week', 'NOTEJP', 'ja'), 'SIGNUMサイト訪問者限定');
    assert.equal(COUPON.audienceLine('earnings_week', 'IHPRO', 'en'), 'For signumhq.com visitors only');
    assert.equal(COUPON.audienceLine('earnings_week_x', 'IHPRO', 'en'), 'For signumhq.com visitors only');   // 뒤에 _가 붙은 변형도
    assert.equal(COUPON.audienceLine('earnings', 'NAVERPRO', 'ko'), '네이버 블로그 독자 전용', '다른 태그는 예전 그대로(코드의 채널)');
    assert.equal(COUPON.audienceLine('home', 'WEBPRO', 'ko'), 'SIGNUM 웹 방문자 전용', '기존 web 태그는 그대로');
  });
  t('범위 — 페이지 태그는 clickHuman 의 24자 상한 안', () => {
    assert.ok(EW.APP_FROM_TAG.length <= 24);
  });

  console.log(`\n${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
