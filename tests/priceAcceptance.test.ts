/**
 * 가격 채택 규칙 하나(src/lib/priceAcceptance.ts) — 설계서 ③ 채택 순서 · ④ 세션×입력 · ⑦ T·A 표의 순수 함수 시험(무네트워크).
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/priceAcceptance.test.ts
 * 관문 재현(실제 화면·저장소·UC 경로)은 tests/priceAcceptanceGates.test.ts.
 */
import assert from 'node:assert/strict';
import {
  acceptObservation, marketSessionAt, tradeInLaneWindow, wsObservationLive, regularBaselineFromRow, ownSessionBaseline,
  changePctFrom, pickExtObservation, regularCloseHHMM, WS_RECEIVE_IDLE_MS, type PriceObservation, type PriceLane,
} from '../src/lib/priceAcceptance';
import { acceptQuote, wsTickFresh, type QuoteValue } from '../src/lib/sourceStamp';
import { usEquitySessionAt, etLastCompletedSessionDate } from '../src/lib/marketCalendar';
import { liveDisplay, mergeQuotesByStamp, type RestQuote } from '../src/utils/liveQuote';

let n = 0, failed = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); n++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; process.exitCode = 1; console.log(`  ✗ ${name}\n      ${String(e?.message ?? e).split('\n')[0]}`); }
};
const EDT = (ymd: string, hh: number, mm = 0, ss = 0, ms = 0) => Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}-04:00`);
const EST = (ymd: string, hh: number, mm = 0, ss = 0, ms = 0) => Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}-05:00`);
const near = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≠ ${b}`);

const obs = (o: Partial<PriceObservation> & { price: number }): PriceObservation => ({
  lane: 'regular', sourceSessionDate: null, tradeTime: null, receivedAt: 0, basis: 'trade', origin: 'server', finality: 'provisional', revision: null, ...o,
});
const MON_PRE = EDT('2026-10-19', 8, 30);
const MON_REG = EDT('2026-10-19', 10, 30);
const MON_POST = EDT('2026-10-19', 16, 30);
const pick = (prev: PriceObservation | null, next: PriceObservation | null, now: number) => acceptObservation(prev, next, marketSessionAt(now));

console.log('━━━ 1. 세션 문맥 — 달력 하나(조기 폐장·휴장·주말·DST) ━━━');
t('A05 경계 03:59/04:00 · 09:29/09:30 · 15:59/16:00 · 19:59/20:00 · 자정 — 달력(usEquitySessionAt)과 같은 판정', () => {
  const cases: Array<[number, string]> = [
    [EDT('2026-10-19', 3, 59), 'CLOSED'], [EDT('2026-10-19', 4), 'PRE'], [EDT('2026-10-19', 9, 29), 'PRE'], [EDT('2026-10-19', 9, 30), 'REG'],
    [EDT('2026-10-19', 15, 59), 'REG'], [EDT('2026-10-19', 16), 'POST'], [EDT('2026-10-19', 19, 59), 'POST'], [EDT('2026-10-19', 20), 'CLOSED'],
    [EDT('2026-10-20', 0), 'CLOSED'],
  ];
  for (const [ms, ph] of cases) {
    assert.equal(marketSessionAt(ms).phase, ph, new Date(ms).toISOString());
    const s = usEquitySessionAt(ms);
    assert.equal(ph, s === 'regular' ? 'REG' : s.toUpperCase());
  }
});
t('조기 폐장 11/27 — 12:59 REG · 13:00 POST · 완료일은 당일 · 마감 13:00 · 다음 경계 20:00', () => {
  const a = marketSessionAt(EST('2026-11-27', 12, 59));
  assert.equal(a.phase, 'REG'); assert.equal(a.earlyClose, true); assert.equal(a.regularCloseMinutes, 780);
  assert.equal(a.lastCompletedRegularDate, '2026-11-25');
  assert.equal(a.nextBoundaryAt, EST('2026-11-27', 13));
  const b = marketSessionAt(EST('2026-11-27', 13, 30));
  assert.equal(b.phase, 'POST'); assert.equal(b.lastCompletedRegularDate, '2026-11-27');
  assert.equal(b.regularCloseAt, EST('2026-11-27', 13));
  assert.equal(regularCloseHHMM('2026-11-27'), '13:00'); assert.equal(regularCloseHHMM('2026-12-24'), '13:00'); assert.equal(regularCloseHHMM('2027-11-26'), '13:00');
  assert.equal(regularCloseHHMM('2026-10-19'), '16:00');
});
t('A06 같은 epoch → 같은 거래일·세션(실행 환경 TZ 무관) · DST 전환 전후(11/2 EST 시작)', () => {
  const before = marketSessionAt(EDT('2026-10-30', 9, 30));
  const after = marketSessionAt(EST('2026-11-02', 9, 30));
  assert.equal(before.phase, 'REG'); assert.equal(after.phase, 'REG');
  assert.equal(after.regularOpenAt, EST('2026-11-02', 9, 30)); assert.equal(before.regularOpenAt, EDT('2026-10-30', 9, 30));
  const tz = process.env.TZ;
  for (const z of ['America/New_York', 'UTC', 'Asia/Seoul']) {
    process.env.TZ = z;
    assert.equal(marketSessionAt(MON_REG).etDate, '2026-10-19');
    assert.equal(marketSessionAt(MON_REG).phase, 'REG');
  }
  process.env.TZ = tz;
});
t('A07 주말·휴장 — CLOSED · 완료일 = 직전 거래일(휴장 다음 날 PRE 의 기준도 그날)', () => {
  const sat = marketSessionAt(EDT('2026-10-17', 11));
  assert.equal(sat.phase, 'CLOSED'); assert.equal(sat.tradingDay, false); assert.equal(sat.lastCompletedRegularDate, '2026-10-16');
  const tg = marketSessionAt(EST('2026-11-26', 11));
  assert.equal(tg.phase, 'CLOSED'); assert.equal(tg.lastCompletedRegularDate, '2026-11-25');
  const fri = marketSessionAt(EST('2026-11-27', 8));
  assert.equal(fri.phase, 'PRE'); assert.equal(fri.lastCompletedRegularDate, '2026-11-25');
  assert.equal(etLastCompletedSessionDate(EST('2026-11-27', 13, 0)), '2026-11-27');
});

console.log('━━━ 2. 칸 시간 창 — 정규장 마감 첫 1초 · 조기 폐장 13:00:00.xxx ━━━');
t('조기 폐장 13:00:00.xxx 체결은 정규장 마감 체결 · 13:00:01 부터 POST · 12:59 는 REG', () => {
  assert.equal(tradeInLaneWindow('regular', EST('2026-11-27', 12, 59, 30)), true);
  assert.equal(tradeInLaneWindow('regular', EST('2026-11-27', 13, 0, 0, 400)), true);
  assert.equal(tradeInLaneWindow('post', EST('2026-11-27', 13, 0, 0, 400)), false);
  assert.equal(tradeInLaneWindow('post', EST('2026-11-27', 13, 0, 1)), true);
  assert.equal(tradeInLaneWindow('regular', EST('2026-11-27', 13, 0, 1)), false);
  assert.equal(tradeInLaneWindow('regular', EDT('2026-10-19', 16, 0, 0, 500)), true);
  assert.equal(tradeInLaneWindow('pre', EDT('2026-10-19', 9, 29, 59)), true);
  assert.equal(tradeInLaneWindow('pre', EDT('2026-10-19', 9, 30)), false);
  assert.equal(tradeInLaneWindow('regular', EDT('2026-10-17', 11)), false, '토요일');
});

console.log('━━━ 3. 채택 순서(설계서 ③) ━━━');
t('① 값이 틀린 후보(0·음수·NaN) → 이전 실제 값 유지 · A11', () => {
  const prev = obs({ price: 100, sourceSessionDate: '2026-10-19', tradeTime: MON_REG - 60_000 });
  for (const price of [0, -1, NaN, Infinity]) assert.equal(pick(prev, obs({ price }), MON_REG).value, prev);
});
t('② 미래 체결·날짜와 체결 시각 모순 → 거부(현재 시각으로 날짜 보정 금지) · A11', () => {
  const prev = obs({ price: 100, sourceSessionDate: '2026-10-19', tradeTime: MON_REG - 60_000 });
  assert.equal(pick(prev, obs({ price: 101, sourceSessionDate: '2026-10-19', tradeTime: MON_REG + 60_000 }), MON_REG).decision.reason, 'future-trade');
  assert.equal(pick(prev, obs({ price: 101, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-16', 11) }), MON_REG).decision.reason, 'date-time-contradiction');
});
t('③ PRE/POST 체결이 그 칸 시간 밖 → 거부 · 정규장 칸의 마감 뒤 관측도 직전 정규장 값이 있으면 거부(T35)', () => {
  const prevPre = obs({ lane: 'pre', price: 102, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 8, 20) });
  assert.equal(pick(prevPre, obs({ lane: 'pre', price: 103, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 9, 45) }), MON_REG).value, prevPre);
  const reg = obs({ price: 110, sourceSessionDate: '2026-11-27', tradeTime: EST('2026-11-27', 12, 59, 50) });
  const mid = obs({ price: 111, sourceSessionDate: '2026-11-27', tradeTime: EST('2026-11-27', 13, 25), basis: 'quote-mid' });
  assert.equal(pick(reg, mid, EST('2026-11-27', 13, 30)).value, reg);
  assert.equal(pick(null, mid, EST('2026-11-27', 13, 30)).value, mid, '직전 값이 없으면 칸을 비우지 않는다');
});
t('④ T28·A03 확정 종가는 같은 날 장중 값(관측 시각 있어도)으로 되돌리지 않는다 — 10분·1일 경과 무관', () => {
  const close = obs({ price: 110, sourceSessionDate: '2026-10-19', finality: 'confirmed', basis: 'official-close', receivedAt: MON_POST - 1000 });
  const late = obs({ price: 105, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 15, 55), receivedAt: MON_POST });
  for (const now of [MON_POST, MON_POST + 10 * 60_000, EDT('2026-10-20', 8)]) assert.equal(pick(close, late, now).value, close);
  // 확정 종가 정정(같은 날 확정끼리)은 받는다
  const fix = obs({ price: 110.05, sourceSessionDate: '2026-10-19', finality: 'confirmed', basis: 'official-close' });
  assert.equal(pick(close, fix, MON_POST).value, fix);
  // 다음 거래일 새 체결은 받는다
  const tue = obs({ price: 111, sourceSessionDate: '2026-10-20', tradeTime: EDT('2026-10-20', 9, 31) });
  assert.equal(pick(close, tue, EDT('2026-10-20', 9, 32)).value, tue);
});
t('⑤ A04 같은 권위의 정정 — 더 높은 순번만(정정 응답 역전 0%→10%→0% 에서 최신 유효 정정 유지)', () => {
  const r = (order: number, price: number) => obs({ price, sourceSessionDate: '2026-10-19', finality: 'confirmed', revision: { authority: 'vendor', order } });
  assert.equal(pick(r(1, 100), r(2, 110), MON_POST).value!.price, 110);
  assert.equal(pick(r(2, 110), r(1, 100), MON_POST).value!.price, 110);
  assert.equal(pick(r(2, 110), r(3, 100), MON_POST).value!.price, 100);
});
t('⑥ T01·T20 옛 원천 날짜는 새 날짜를 덮지 못한다(개장 전 금요일 100 뒤 목요일 응답)', () => {
  const fri = obs({ price: 100, sourceSessionDate: '2026-10-16', finality: 'confirmed' });
  const thu = obs({ price: 98, sourceSessionDate: '2026-10-15', finality: 'confirmed' });
  assert.equal(pick(fri, thu, MON_PRE).value, fri);
  assert.equal(pick(thu, fri, MON_PRE).value, fri);
});
t('⑦ T16 같은 날 체결 시각 비교 — PRE 08:25 102 뒤 08:20 101 → 102 유지 · A02 같은 가격 더 새 체결은 원천 시각 갱신', () => {
  const a = obs({ lane: 'pre', price: 102, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 8, 25) });
  const b = obs({ lane: 'pre', price: 101, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 8, 20) });
  assert.equal(pick(a, b, MON_PRE).value, a);
  const c = obs({ lane: 'pre', price: 102, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 8, 28) });
  assert.equal(pick(a, c, MON_PRE).value, c);
  // 같은 체결 시각의 다른 값 — 서버 우선 · 서버끼리는 기존 유지
  const wsSame = obs({ lane: 'pre', price: 102.5, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 8, 25), origin: 'ws', receivedAt: MON_PRE });
  assert.equal(pick(a, wsSame, MON_PRE).value, a);
  const srvSame = obs({ lane: 'pre', price: 102.5, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 8, 25) });
  assert.equal(pick(a, srvSame, MON_PRE).decision.reason, 'same-time-conflict');
});
t('⑧ A01 서버·소켓 체결 시각 유/무 4조합 × PRE/REG/POST — 비교 가능하면 체결 순서 · 불가능하면 서버', () => {
  const lanes: Array<[PriceLane, number, number]> = [
    ['pre', MON_PRE, EDT('2026-10-19', 8, 20)], ['regular', MON_REG, EDT('2026-10-19', 10, 29)], ['post', MON_POST, EDT('2026-10-19', 16, 20)],
  ];
  for (const [lane, now, srvT] of lanes) {
    const srv = (time: boolean) => obs({ lane, price: 100, sourceSessionDate: '2026-10-19', tradeTime: time ? srvT : null, receivedAt: now - 30_000 });
    const ws = (time: number | null) => obs({ lane, price: 100.4, sourceSessionDate: '2026-10-19', tradeTime: time, origin: 'ws', receivedAt: now - 100 });
    // 둘 다 시각 · 소켓이 새것 → 소켓 / 옛것 → 서버
    assert.equal(pick(srv(true), ws(srvT + 60_000), now).value!.origin, 'ws', lane);
    assert.equal(pick(srv(true), ws(srvT - 60_000), now).value!.origin, 'server', lane);
    // 서버 시각 없음 — 서버가 받은 시각보다 늦은 소켓 체결만
    assert.equal(pick(srv(false), ws(now - 1000), now).value!.origin, 'ws', lane);
    assert.equal(pick(srv(false), ws(now - 60_000), now).value!.origin, 'server', lane);
    // 소켓 시각 없음 — 서버(가격이 같아도 출처를 소켓으로 바꾸지 않는다)
    assert.equal(pick(srv(true), ws(null), now).value!.origin, 'server', lane);
    assert.equal(pick(srv(false), { ...ws(null), price: 100 }, now).value!.origin, 'server', lane);
  }
});
t('T06·T23·T25 금요일 소켓(99.8·100.5·100.90)은 월요일 서버 값(PRE·REG)을 덮지 못한다 — 가격 근접성과 무관', () => {
  const preSrv = obs({ lane: 'pre', price: 100, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 8, 20) });
  for (const price of [99.8, 100.9]) {
    const friWs = obs({ lane: 'pre', price, sourceSessionDate: '2026-10-16', tradeTime: EDT('2026-10-16', 19, 59), origin: 'ws', receivedAt: MON_PRE - 100 });
    assert.equal(pick(preSrv, friWs, MON_PRE).value, preSrv);
  }
  const regSrv = obs({ price: 100, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 10, 29) });
  const friReg = obs({ price: 100.5, sourceSessionDate: '2026-10-16', tradeTime: EDT('2026-10-16', 15, 59), origin: 'ws', receivedAt: MON_REG - 100 });
  assert.equal(pick(regSrv, friReg, MON_REG).value, regSrv);
});
t('T13·T14 90분 전 받은 소켓 틱은 거부 · 지금 받은 15분 지연 체결은 같은 세션·더 새 관측이면 채택', () => {
  const srv = obs({ price: 100, sourceSessionDate: '2026-10-19', tradeTime: null, receivedAt: MON_REG - 30 * 60_000 });
  const old = obs({ price: 101, sourceSessionDate: '2026-10-19', tradeTime: MON_REG - 91 * 60_000, origin: 'ws', receivedAt: MON_REG - 90 * 60_000 });
  assert.equal(pick(srv, old, MON_REG).decision.reason, 'ws-receive-idle');
  const delayed = obs({ lane: 'pre', price: 101, sourceSessionDate: '2026-10-19', tradeTime: MON_PRE - 15 * 60_000, origin: 'ws', receivedAt: MON_PRE - 100 });
  const srvPre = obs({ lane: 'pre', price: 100, sourceSessionDate: '2026-10-19', tradeTime: MON_PRE - 20 * 60_000 });
  assert.equal(pick(srvPre, delayed, MON_PRE).value, delayed);
  assert.equal(WS_RECEIVE_IDLE_MS, 10 * 60_000);
});
t('마감·주말엔 소켓을 쓰지 않는다(허브의 굳은 마지막 체결) — 직전 정규장 실제 값 유지', () => {
  const sat = EDT('2026-10-17', 11);
  const fri = obs({ price: 100, sourceSessionDate: '2026-10-16', finality: 'confirmed' });
  const hub = obs({ price: 99.95, sourceSessionDate: '2026-10-16', tradeTime: EDT('2026-10-16', 15, 59), origin: 'ws', receivedAt: sat - 100 });
  assert.equal(pick(fri, hub, sat).decision.reason, 'ws-market-closed');
  assert.equal(wsObservationLive(hub, marketSessionAt(sat)).accepted, false);
});

console.log('━━━ 4. 기준 종가(설계서 ④) ━━━');
const ctx = (ms: number) => marketSessionAt(ms);
t('T04 목 98·금 100·월 PRE 100 — 정규장·PRE 기준 = 금 종가 100 → PRE 0.00% (금요일 +2.04% 재사용 금지)', () => {
  const pre = { price: 100, previousClose: 98, session: 'pre' };
  assert.equal(regularBaselineFromRow(pre, ctx(MON_PRE)), 100);
  assert.equal(ownSessionBaseline(pre), 100);
  assert.equal(changePctFrom(100, regularBaselineFromRow(pre, ctx(MON_PRE))), 0);
  near(changePctFrom(100, 98), 200 / 98);
});
t('T22·T29 월 REG — 보존된 금 PRE/POST/CLOSED 행(원천 날짜 금)의 기준 = 금 종가 100 → REG 100.50 = +0.50%', () => {
  for (const session of ['pre', 'post', 'closed']) {
    for (const dated of [true, false]) {
      const row = { price: 100, previousClose: 98, session, ...(dated ? { sourceSessionDate: '2026-10-16' } : {}) };
      assert.equal(regularBaselineFromRow(row, ctx(MON_REG)), 100, `${session} dated=${dated}`);
    }
  }
  near(changePctFrom(100.5, 100), 0.5);
});
t('A13 본장 110·전일 100·POST 111 — 본장 +10% · POST +0.91%(그날 종가 대비) · 기준 필드 분리', () => {
  const post = { price: 110, previousClose: 100, session: 'post', sourceSessionDate: '2026-10-19' };
  assert.equal(regularBaselineFromRow(post, ctx(MON_POST)), 100);
  near(changePctFrom(110, 100), 10);
  near(changePctFrom(111, post.price)!, (111 / 110 - 1) * 100);
});
t('CLOSED 평일 00:00~04:00·주말·휴장 — 직전 거래일 실제 정규장 값의 일간 등락 기준(전전 거래일 종가)', () => {
  const row = { price: 100, previousClose: 98, session: 'closed' };
  assert.equal(regularBaselineFromRow(row, ctx(EDT('2026-10-20', 2))), 98);
  assert.equal(regularBaselineFromRow(row, ctx(EDT('2026-10-17', 11))), 98);
  assert.equal(regularBaselineFromRow({ ...row, sourceSessionDate: '2026-10-16' }, ctx(EDT('2026-10-17', 11))), 98);
});
t('A15 기준이 없으면 등락 null(0 을 지어내지 않는다) · 실제 0% 는 보존 · 날짜가 두 세션 넘게 옛 행은 기준 null', () => {
  assert.equal(changePctFrom(100, null), null);
  assert.equal(changePctFrom(null, 100), null);
  assert.equal(changePctFrom(100, 100), 0);
  assert.equal(regularBaselineFromRow({ price: 100, previousClose: 98, session: 'pre', sourceSessionDate: '2026-10-14' }, ctx(MON_REG)), null);
  assert.equal(regularBaselineFromRow(null, ctx(MON_REG)), null);
});

console.log('━━━ 5. 시간외 칸(pickExtObservation) — 체결 시각으로만 ━━━');
t('T06 서버 PRE 100(08:00) · 금 소켓 99.8 → 100 / 월 08:00:30 소켓 → 소켓 · 서버 시각 없으면 같은 값일 때만', () => {
  const srvT = new Date(EDT('2026-10-19', 8)).toISOString();
  assert.deepEqual(pickExtObservation(99.8, 100, { serverTime: srvT, wsTimeMs: EDT('2026-10-16', 19, 59) }), { price: 100, fromWs: false });
  assert.deepEqual(pickExtObservation(100.9, 100, { serverTime: srvT, wsTimeMs: EDT('2026-10-19', 8, 0, 30) }), { price: 100.9, fromWs: true });
  assert.deepEqual(pickExtObservation(99.8, 100), { price: 100, fromWs: false });
  assert.deepEqual(pickExtObservation(100, 100), { price: 100, fromWs: true });
  assert.deepEqual(pickExtObservation(100.1, 0), { price: 0, fromWs: false }, '서버가 시간외 체결을 확인하지 않았으면 칸을 비운 채');
});

console.log('━━━ 6. 화면 묶음 어댑터(sourceStamp.acceptQuote · liveQuote) — 같은 규칙 ━━━');
const qv = (o: Partial<QuoteValue> & { price: number }): QuoteValue => ({
  changePct: null, session: 'reg', previousClose: null, source: 'rest',
  stamp: { sourceSessionDate: null, observedAt: null, receivedAt: 0, basis: 'last-session' }, ...o,
});
t('acceptQuote = acceptObservation 투영 — T28 eod 110 뒤 같은 날 live 105(관측 시각 있음) → 110', () => {
  const close = qv({ price: 110, changePct: 10, previousClose: 100, stamp: { sourceSessionDate: '2026-10-19', observedAt: null, receivedAt: MON_POST - 1000, basis: 'eod' } });
  const late = qv({ price: 105, changePct: 5, previousClose: 100, stamp: { sourceSessionDate: '2026-10-19', observedAt: EDT('2026-10-19', 15, 55), receivedAt: MON_POST, basis: 'live' } });
  assert.equal(acceptQuote(close, late, MON_POST), close);
});
t('T27 소켓 10:30 101 을 채택하면 가격과 시각이 같은 관측에서 나온다', () => {
  const srv = qv({ price: 100, previousClose: 99, stamp: { sourceSessionDate: '2026-10-19', observedAt: EDT('2026-10-19', 10), receivedAt: EDT('2026-10-19', 10, 0, 5), basis: 'live' } });
  const ws = qv({ price: 101, source: 'ws', previousClose: 99, stamp: { sourceSessionDate: '2026-10-19', observedAt: EDT('2026-10-19', 10, 30), receivedAt: MON_REG, basis: 'live' } });
  const r = acceptQuote(srv, ws, MON_REG + 1000)!;
  assert.equal(r.price, 101); assert.equal(r.stamp.observedAt, EDT('2026-10-19', 10, 30));
  near(r.changePct, (101 / 99 - 1) * 100);
});
t('T24 소켓 끊김 — 정상 REST 101(새 관측)이 메모리 옛 소켓 101 과 값이 같아도 REST 를 쓴다', () => {
  const rest: RestQuote = { price: 101, previousClose: 100, changePercent: 1, session: 'regular', sourceSessionDate: '2026-10-19', observedAt: MON_REG - 5000, basis: 'live' };
  const d = liveDisplay(rest, { price: 101, changePct: 1, ts: MON_REG - 20 * 60_000, priceTime: MON_REG - 20 * 60_000 }, { wsConnected: false, restAt: MON_REG, nowMs: MON_REG })!;
  assert.equal(d.price, 101); assert.equal(d.live, false);
});
t('T15·A08 한 묶음 실패로 빠진 종목 — 이전 실제 가격·날짜 유지(합성 0·50 금지)', () => {
  const prev: Record<string, RestQuote> = {};
  for (let i = 0; i < 31; i++) prev[`T${i}`] = { price: 50 + i, previousClose: 49, session: 'regular', sourceSessionDate: '2026-10-19', basis: 'live', receivedAt: MON_REG - 30_000 };
  const next: Record<string, RestQuote> = {};
  for (let i = 0; i < 30; i++) next[`T${i}`] = { ...prev[`T${i}`], receivedAt: MON_REG };
  const m = mergeQuotesByStamp(prev, next, MON_REG, { asked: Object.keys(prev), session: 'regular' });
  assert.equal(m.data.T30.price, 80); assert.equal(m.data.T30.sourceSessionDate, '2026-10-19');
});
t('T19 REG 110·PRE CLOSE 102 → POST 전환 직후 결측 — 본장 110 유지 · 102 를 POST 로 표시하지 않음', () => {
  const prev: Record<string, RestQuote> = { X: { price: 110, previousClose: 100, changePercent: 10, session: 'regular', extendedPrice: 102, extendedLabel: 'PRE', extendedKind: 'close',
    sourceSessionDate: '2026-10-19', basis: 'live', receivedAt: MON_POST - 60_000 } };
  const m = mergeQuotesByStamp(prev, { X: { price: 0, error: 'x', session: 'post' } as any }, MON_POST, { asked: ['X'], session: 'post' });
  const d = liveDisplay(m.data.X, undefined, { wsConnected: false, restAt: MON_POST, nowMs: MON_POST })!;
  assert.equal(d.price, 110); assert.equal(d.ext, false);
});
t('A09 순서 교환 — 같은 후보 집합(서버 08:20 100 · 소켓 08:25 100.4)이면 도착 순서와 무관하게 같은 결과', () => {
  const c = ctx(MON_PRE);
  const s = obs({ lane: 'pre', price: 100, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 8, 20), receivedAt: MON_PRE - 60_000 });
  const w = obs({ lane: 'pre', price: 100.4, sourceSessionDate: '2026-10-19', tradeTime: EDT('2026-10-19', 8, 25), origin: 'ws', receivedAt: MON_PRE - 100 });
  const a = acceptObservation(acceptObservation(null, s, c).value, w, c).value;
  const b = acceptObservation(acceptObservation(null, w, c).value, s, c).value;
  assert.equal(a, w); assert.equal(b, w);
});
t('wsTickFresh(수신 상태 정책)와 공용 소켓 판정이 같은 시간 창을 쓴다 — 조기 폐장 13:00:00.400 은 정규장', () => {
  const now = EST('2026-11-27', 13, 0, 5);
  assert.equal(wsTickFresh({ priceTime: EST('2026-11-27', 13, 0, 0, 400), receivedAt: now - 100 }, 'reg', now), true);
  assert.equal(wsTickFresh({ priceTime: EST('2026-11-27', 13, 0, 0, 400), receivedAt: now - 100 }, 'post', now), false);
  const o = obs({ price: 1, tradeTime: EST('2026-11-27', 13, 0, 0, 400), origin: 'ws', receivedAt: now - 100, sourceSessionDate: '2026-11-27' });
  assert.equal(wsObservationLive(o, ctx(now)).accepted, true);
  assert.equal(wsObservationLive({ ...o, lane: 'post' }, ctx(now)).accepted, false);
});

console.log(`\n${failed ? '❌' : '✅'} priceAcceptance: ${n}개 통과 · ${failed}개 실패`);
