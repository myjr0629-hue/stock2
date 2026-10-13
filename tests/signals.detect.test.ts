/**
 * 내 종목 이상 신호 — 탐지 규칙 시험 (2026-10-13, feat/wl-alerts-v2)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/signals.detect.test.ts
 *
 * 규칙표(lib/signals/detect.ts 머리 주석)를 한 줄씩 고정한다:
 *   레벨 교차(콜월·풋플로어·감마플립) · 맥스페인 이탈 · 다크풀 급증 · OI 급변 · 실적 D-1 — 그리고 «건너뛰는» 경우(낡음·다른 날·정의 위반·표본 부족).
 */
import assert from 'node:assert/strict';
import {
  armSide, crossDirection, detectCross, detectDarkPool, detectEarningsD1, detectMaxPain, detectOiSurge, freshestStored, maxPainDivergenceP90,
  obsFromStored, obsIsRegular, obsUsable, percentile,
} from '../src/lib/signals/detect';
import type { TickerState, WallFacts, MaxPainFacts } from '../src/lib/signals/types';
import { structDoc, T } from './_signalsFixtures';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const DAY = '2026-10-13';

const obsAt = (hh: number, mm: number, o: Parameters<typeof structDoc>[0] extends infer X ? Partial<X> : never = {}) =>
  obsFromStored('NVDA', structDoc({ at: T(DAY, hh, mm), ...(o as object) }))!;

console.log('━━━ 1. 구조 판본 → 관측 ━━━');
t('정상 판본 → 관측(레벨·기준가·시각·세션)', () => {
  const o = obsAt(11, 5, { session: 'REG', price: 249, gf: 245 });
  assert.equal(o.spot, 249); assert.equal(o.callWall, 250); assert.equal(o.putFloor, 230); assert.equal(o.maxPain, 240); assert.equal(o.gammaFlip, 245);
  assert.equal(o.session, 'REG'); assert.equal(o.asOfMs, T(DAY, 11, 5)); assert.equal(o.expiry, '2026-10-16'); assert.equal(o.chainDate, '2026-10-12');
});
t('옵션 없음(options_status≠OK)·시각 없음·기준가 없음 → null', () => {
  assert.equal(obsFromStored('NVDA', structDoc({ at: T(DAY, 11, 5), status: 'PENDING' })), null);
  assert.equal(obsFromStored('NVDA', { data: structDoc({ at: 1 }).data }), null);
  assert.equal(obsFromStored('NVDA', null), null);
  assert.equal(obsFromStored('NVDA', { ...structDoc({ at: T(DAY, 11, 5) }), data: { ...structDoc({ at: 1 }).data, underlyingPrice: 0 } }), null);
});
t('정의 게이트 — 콜월이 현재가 아래면 레벨에서 빠진다(화면과 같은 문)', () => {
  const o = obsAt(11, 5, { price: 249, cw: 240 });
  assert.equal(o.callWall, null);
});
t('freshestStored — 더 최근 판본', () => {
  const a = structDoc({ at: 1000 }), b = structDoc({ at: 2000 });
  assert.equal(freshestStored(a, b)!.timestamp, 2000);
  assert.equal(freshestStored(null, undefined), null);
});
t('정규장 관측 판정 — 세션 표식 REG + 시각이 정규장 안', () => {
  assert.equal(obsIsRegular(obsAt(11, 5, { session: 'REG' })), true);
  assert.equal(obsIsRegular(obsAt(11, 5, { session: 'POST' })), false);
  assert.equal(obsIsRegular(obsAt(9, 5, { session: 'REG' })), false, '09:05 는 정규장 전');
  assert.equal(obsIsRegular(obsAt(16, 5, { session: 'REG' })), false, '16:05 는 마감 뒤');
});

console.log('━━━ 2. 레벨 교차 ━━━');
const NOW_1125 = T(DAY, 11, 25);
const ctx = { now: NOW_1125 };
const stateBelow = (level = 250, at = T(DAY, 9, 5)): TickerState => ({ asOfMs: at, day: DAY, spot: 248.5, arms: { callWall: { level, side: 'below', asOfMs: at, day: DAY } } });

t('armSide·crossDirection — 콜월은 아래→위, 풋플로어는 위→아래만', () => {
  assert.equal(armSide('callWall', 250, 249), 'below'); assert.equal(armSide('callWall', 250, 251), null);
  assert.equal(armSide('putFloor', 230, 231), 'above'); assert.equal(armSide('putFloor', 230, 229), null);
  assert.equal(crossDirection('callWall', { level: 250, side: 'below', asOfMs: 0, day: DAY }, 250.76, 0.003), 'up');
  assert.equal(crossDirection('callWall', { level: 250, side: 'below', asOfMs: 0, day: DAY }, 250.5, 0.003), null, '여유폭(0.3%) 안은 확정 아님');
  assert.equal(crossDirection('putFloor', { level: 230, side: 'above', asOfMs: 0, day: DAY }, 229.3, 0.003), 'down');
});
t('콜월 돌파 — 프리마켓에 아래에서 보던 레벨을 정규장 관측이 여유폭 너머로 넘었다 → 1건', () => {
  const r = detectCross(stateBelow(), obsAt(11, 5, { session: 'REG', price: 251.2, cw: 260 }), ctx);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.event, 'call_wall_break'); assert.equal(e.key, `${DAY}:up`); assert.equal(e.ticker, 'NVDA');
  const f = e.facts as WallFacts;
  assert.equal(f.kind, 'wall'); assert.equal(f.level, 'callWall'); assert.equal(f.levelPrice, 250); assert.equal(f.price, 251.2); assert.equal(f.direction, 'up');
  assert.ok(Math.abs(f.distPct - 0.48) < 0.01, String(f.distPct));
  assert.equal(f.asOfMs, T(DAY, 11, 5));
  // 확정한 레벨로 다시 무장하지 않고, 새로 고른 위쪽 벽(260)으로 무장한다
  assert.equal(r.state!.arms.callWall!.level, 260); assert.equal(r.state!.arms.callWall!.side, 'below');
});
t('여유폭 안(0.1% 위)은 확정 대기 — 알리지 않고 «보던 벽»을 지킨다', () => {
  const r = detectCross(stateBelow(), obsAt(11, 5, { session: 'REG', price: 250.25, cw: 260 }), ctx);
  assert.equal(r.events.length, 0);
  assert.equal(r.state!.arms.callWall!.level, 250, '구조가 벽을 260 으로 다시 골라도 보던 250 을 놓치지 않는다');
});
t('프리마켓 관측은 무장만 한다(알리지 않는다) — 정규장 밖에서 레벨을 넘어도', () => {
  const r = detectCross(null, obsAt(9, 5, { session: 'PRE', price: 249, cw: 250 }), { now: T(DAY, 9, 25) });
  assert.equal(r.events.length, 0);
  assert.equal(r.state!.arms.callWall!.level, 250); assert.equal(r.state!.arms.callWall!.side, 'below');
  const r2 = detectCross(stateBelow(), obsAt(9, 5, { session: 'PRE', price: 252, cw: 260 }), { now: T(DAY, 9, 25) });
  assert.equal(r2.events.length, 0, 'PRE 가격이 레벨 위여도 정규장 관측이 아니면 알림 없음');
});
t('마감 뒤(POST·CLOSED) 관측은 상태를 건드리지 않는다', () => {
  const r = detectCross(stateBelow(), obsAt(17, 5, { session: 'POST', price: 252 }), { now: T(DAY, 17, 25) });
  assert.equal(r.events.length, 0); assert.equal(r.state, null);
});
t('낡은 관측(90분 초과) → 건너뜀', () => {
  const r = detectCross(stateBelow(), obsAt(11, 5, { session: 'REG', price: 251.5 }), { now: T(DAY, 13, 0) });
  assert.equal(r.events.length, 0); assert.equal(r.state, null); assert.ok(r.notes.includes('stale_obs'));
});
t('체인 날짜가 낡았거나 만기가 지났으면 건너뜀', () => {
  assert.ok(detectCross(stateBelow(), obsAt(11, 5, { session: 'REG', price: 251.5, chain: '2026-10-08' }), ctx).notes.includes('stale_chain'));
  assert.ok(detectCross(stateBelow(), obsAt(11, 5, { session: 'REG', price: 251.5, expiry: '2026-10-09' }), ctx).notes.includes('expired_chain'));
  const ok = obsUsable(obsAt(11, 5, { session: 'REG', chain: null }), ctx);
  assert.equal(ok.ok, true, '체인 날짜를 모르는 판본은 막지 않는다(없음 ≠ 낡음)');
});
t('다른 거래일의 무장은 이어받지 않는다', () => {
  const prev: TickerState = { asOfMs: T('2026-10-12', 11, 5), day: '2026-10-12', spot: 248, arms: { callWall: { level: 250, side: 'below', asOfMs: T('2026-10-12', 11, 5), day: '2026-10-12' } } };
  const r = detectCross(prev, obsAt(11, 5, { session: 'REG', price: 251.5, cw: 260 }), ctx);
  assert.equal(r.events.length, 0);
});
t('같은 관측을 두 번 보지 않는다', () => {
  const prev = stateBelow(250, T(DAY, 11, 5));
  const r = detectCross(prev, obsAt(11, 5, { session: 'REG', price: 251.5 }), ctx);
  assert.equal(r.events.length, 0); assert.equal(r.state, null); assert.deepEqual(r.notes, ['seen']);
});
t('두 관측 사이 가격이 15% 넘게 튀면 틱 오류로 건너뜀', () => {
  const r = detectCross(stateBelow(), obsAt(11, 5, { session: 'REG', price: 300, cw: 330 }), ctx);
  assert.equal(r.events.length, 0); assert.ok(r.notes.includes('obs_jump'));
});
t('무장 간격 5시간 초과 → 이어받지 않는다', () => {
  const r = detectCross({ ...stateBelow(250, T(DAY, 4, 5)), asOfMs: T(DAY, 4, 5) }, obsAt(11, 5, { session: 'REG', price: 251.5, cw: 260 }), ctx);
  assert.equal(r.events.length, 0);
});
t('풋플로어 이탈 — 위에서 보던 레벨을 아래로', () => {
  const prev: TickerState = { asOfMs: T(DAY, 9, 5), day: DAY, spot: 232, arms: { putFloor: { level: 230, side: 'above', asOfMs: T(DAY, 9, 5), day: DAY } } };
  const r = detectCross(prev, obsAt(11, 5, { session: 'REG', price: 229, pf: 210, cw: 250, mp: 235 }), ctx);
  const e = r.events.find((x) => x.event === 'put_floor_break')!;
  assert.ok(e); assert.equal(e.key, `${DAY}:down`); assert.equal((e.facts as WallFacts).direction, 'down');
});
t('감마플립 — EXACT 만(근사값으로는 교차를 말하지 않는다)', () => {
  const prev: TickerState = { asOfMs: T(DAY, 9, 5), day: DAY, spot: 244, arms: { gammaFlip: { level: 245, side: 'below', asOfMs: T(DAY, 9, 5), day: DAY } } };
  const up = detectCross(prev, obsAt(11, 5, { session: 'REG', price: 246.5, gf: 245 }), ctx);
  assert.ok(up.events.some((e) => e.event === 'gamma_flip_cross'));
  const first = detectCross(null, obsAt(9, 5, { session: 'PRE', price: 244, gf: 245, gfType: 'ALL_LONG' }), { now: T(DAY, 9, 25) });
  assert.equal(first.state!.arms.gammaFlip, undefined, 'EXACT 가 아니면 무장하지 않는다');
});
t('돌파가 확정되면 같은 레벨은 다시 알리지 않는다(무장이 사라진다)', () => {
  const r1 = detectCross(stateBelow(), obsAt(11, 5, { session: 'REG', price: 251.5, cw: 260 }), ctx);
  assert.equal(r1.events.length, 1);
  const r2 = detectCross(r1.state, obsAt(13, 5, { session: 'REG', price: 252, cw: 260 }), { now: T(DAY, 13, 25) });
  assert.equal(r2.events.length, 0);
});

console.log('━━━ 3. 맥스페인 이탈 ━━━');
const STATS = { p90: 0.02, n: 60 };
const EXP = '2026-10-15';   // 목요일 — 화요일(10/13) 포함 3거래일. 금요일 10/16 은 4거래일째라 아직 «만기 주간» 규칙 밖
t('만기 3거래일 안 · 자기 상위 10% 경계(2%) 이상 → 1건', () => {
  const o = obsAt(11, 5, { session: 'REG', price: 247, mp: 240, expiry: EXP });
  const r = detectMaxPain(o, STATS, ctx);
  assert.ok(r.event); assert.equal(r.event!.event, 'maxpain_divergence'); assert.equal(r.event!.key, EXP);
  const f = r.event!.facts as MaxPainFacts;
  assert.equal(f.maxPain, 240); assert.equal(f.price, 247); assert.ok(Math.abs(f.divPct - 2.9167) < 0.001); assert.equal(f.p90Pct, 2); assert.equal(f.n, 60);
});
t('경계 미만이면 없음 · 만기가 멀면 없음 · 표본 30 미만이면 없음 · 정규장 아니면 없음', () => {
  assert.equal(detectMaxPain(obsAt(11, 5, { session: 'REG', price: 244, mp: 240, expiry: EXP }), STATS, ctx).event, null);          // 1.67% < 2%
  assert.equal(detectMaxPain(obsAt(11, 5, { session: 'REG', price: 250, mp: 240, expiry: '2026-10-16' }), STATS, ctx).event, null);  // 금요일 만기 = 4거래일째(아직 아님)
  assert.equal(detectMaxPain(obsAt(11, 5, { session: 'REG', price: 250, mp: 240, expiry: '2026-10-23' }), STATS, ctx).event, null);   // 만기 8거래일
  assert.equal(detectMaxPain(obsAt(11, 5, { session: 'REG', price: 250, mp: 240, expiry: EXP }), { p90: 0.02, n: 12 }, ctx).event, null);
  assert.equal(detectMaxPain(obsAt(11, 5, { session: 'REG', price: 250, mp: 240, expiry: EXP }), null, ctx).event, null);
  assert.equal(detectMaxPain(obsAt(11, 5, { session: 'POST', price: 250, mp: 240, expiry: EXP }), STATS, ctx).event, null);
});
t('경계가 1% 보다 작은 종목도 1% 는 벌어져야 한다', () => {
  assert.equal(detectMaxPain(obsAt(11, 5, { session: 'REG', price: 240.9, mp: 240, expiry: EXP }), { p90: 0.002, n: 60 }, ctx).event, null);   // 0.375%
  assert.ok(detectMaxPain(obsAt(11, 5, { session: 'REG', price: 242.6, mp: 240, expiry: EXP }), { p90: 0.002, n: 60 }, ctx).event);              // 1.08%
});
t('괴리 분포 — 최근 20거래일 · 오늘 행 제외 · 최근접 순위 90분위', () => {
  const rows: Array<{ session: string; price: number | null; maxPain: number | null }> = [];
  for (let d = 1; d <= 25; d++) rows.push({ session: `2026-09-${String(d).padStart(2, '0')}`, price: 100 + d, maxPain: 100 });   // 괴리 1%..25%
  rows.push({ session: DAY, price: 200, maxPain: 100 });                                                                     // 오늘 행(100%) — 빠져야 한다
  const st = maxPainDivergenceP90(rows, DAY)!;
  // 20거래일 = 9/6..9/25 → 괴리 6%..25% 20개 → ceil(0.9*20)=18번째 = 23%
  assert.equal(st.n, 20); assert.ok(Math.abs(st.p90 - 0.23) < 1e-9, String(st.p90));
  assert.equal(percentile([], 0.9), null); assert.equal(percentile([5], 0.9), 5);
  assert.equal(maxPainDivergenceP90([], DAY), null);
});

console.log('━━━ 4. 다크풀 급증 ━━━');
const darkRow = (o: Partial<{ pct: number; volume: number; volRatio: number; volP: number | null; date: string }> = {}) => ({
  ticker: 'AMD', pct: 52.14, volume: 8_400_000, volRatio: 2.44, volP: 96, date: '2026-10-12', marketAvg: 46.2, ...o,
});
t('거래량 20일 평균의 1.8배 이상 · 백분위 90 이상 · 50만 주 이상 → 1건(숫자 반올림 한 자리)', () => {
  const r = detectDarkPool(darkRow(), { lastClosed: '2026-10-12', isEtf: false });
  assert.ok(r.event); const f = r.event!.facts as any;
  assert.equal(f.kind, 'darkpool'); assert.equal(f.pct, 52.1); assert.equal(f.ratio, 2.4); assert.equal(f.date, '2026-10-12'); assert.equal(r.event!.key, '2026-10-12');
});
t('건너뜀 — 날짜가 마지막 마감과 다름(이월된 행) · 배수 부족 · 거래량 부족 · 백분위 없음/부족 · ETF', () => {
  const o = { lastClosed: '2026-10-12', isEtf: false };
  assert.equal(detectDarkPool(darkRow({ date: '2026-10-09' }), o).event, null);
  assert.equal(detectDarkPool(darkRow({ volRatio: 1.7 }), o).event, null);
  assert.equal(detectDarkPool(darkRow({ volume: 400_000 }), o).event, null);
  assert.equal(detectDarkPool(darkRow({ volP: null }), o).event, null);
  assert.equal(detectDarkPool(darkRow({ volP: 80 }), o).event, null);
  assert.equal(detectDarkPool(darkRow(), { ...o, isEtf: true }).event, null);
});

console.log('━━━ 5. OI 급변(옵션 EOD 묶음) ━━━');
const META = { date: '2026-10-12', prevDate: '2026-10-09' };
const top = (c: Array<{ k: number; e: string; t: 'C' | 'P'; oi: number; d: number | null }>) => ({ callOI: 1_000_000, putOI: 900_000, top: c });
t('명목 합 $50M 이상 · 가장 큰 계약 1,500계약 이상 · 미결제약정 3배 이상 → 1건', () => {
  const v = top([{ k: 230, e: '2026-10-16', t: 'C', oi: 18_000, d: 12_500 }, { k: 220, e: '2026-10-16', t: 'P', oi: 9000, d: 4000 }]);
  const r = detectOiSurge('NVDA', v, META, { lastClosed: '2026-10-12', today: '2026-10-13', isEtf: false });
  assert.ok(r.event); const f = r.event!.facts as any;
  assert.equal(f.kind, 'whale'); assert.equal(f.best.strike, 230); assert.equal(f.best.added, 12_500); assert.equal(f.openedOn, '2026-10-09'); assert.equal(f.jump, 3.3);
  assert.equal(f.notional, 375_500_000);       // 12500×100×230 + 4000×100×220 = 287.5M + 88M
  assert.equal(r.event!.key, '2026-10-09');
});
t('건너뜀 — 명목 부족 · 증가량 부족 · 상대 증가 부족(이미 크던 계약) · 만기 지난 계약 · 묶음이 낡음 · ETF', () => {
  const base = { lastClosed: '2026-10-12', today: '2026-10-13', isEtf: false };
  assert.equal(detectOiSurge('X', top([{ k: 100, e: '2026-10-16', t: 'C', oi: 5000, d: 2000 }]), META, base).event, null, '명목 $20M');
  assert.equal(detectOiSurge('X', top([{ k: 900, e: '2026-10-16', t: 'C', oi: 1400, d: 1000 }]), META, base).event, null, '증가량 1,000');
  assert.equal(detectOiSurge('X', top([{ k: 300, e: '2026-10-16', t: 'C', oi: 40_000, d: 20_000 }]), META, base).event, null, '2배(<3배)');
  assert.equal(detectOiSurge('X', top([{ k: 300, e: '2026-10-12', t: 'C', oi: 40_000, d: 30_000 }]), META, base).event, null, '만기 지남');
  assert.equal(detectOiSurge('X', top([{ k: 300, e: '2026-10-16', t: 'C', oi: 40_000, d: 30_000 }]), { date: '2026-09-30', prevDate: '2026-09-29' }, base).event, null, '묶음 14일 전');
  const stale = detectOiSurge('X', top([{ k: 300, e: '2026-10-16', t: 'C', oi: 40_000, d: 30_000 }]), META, { lastClosed: '2026-10-13', today: '2026-10-14', isEtf: false });
  assert.equal(stale.event, null, '새 묶음(10/13)이 아직 안 왔다 — 마지막 마감 세션과 묶음 날짜가 다르면 «지금 일어난 일»이 아니다'); assert.match(stale.notes[0], /oi:bundle_2026-10-12_vs_2026-10-13/);
  assert.equal(detectOiSurge('SPY', top([{ k: 300, e: '2026-10-16', t: 'C', oi: 40_000, d: 30_000 }]), META, { ...base, isEtf: true }).event, null);
  assert.equal(detectOiSurge('X', undefined, META, base).event, null);
});
t('처음 생긴 계약(오늘 미결제약정 = 증가분)은 배수 없이 통과', () => {
  const r = detectOiSurge('X', top([{ k: 500, e: '2026-10-16', t: 'P', oi: 3000, d: 3000 }]), META, { lastClosed: '2026-10-12', today: '2026-10-13', isEtf: false });
  assert.ok(r.event); assert.equal((r.event!.facts as any).jump, null);
});

console.log('━━━ 6. 실적 D-1 ━━━');
t('다음 거래일이 발표일이면 D-1 · 달력상 내일이면 tomorrow', () => {
  const r = detectEarningsD1({ ticker: 'NFLX', date: '2026-10-14', hour: 'amc', etTime: '16:00' }, { today: '2026-10-13', implied: { pct: 6.14, expiry: '2026-10-16' } });
  assert.ok(r.event); const f = r.event!.facts as any;
  assert.equal(f.tomorrow, true); assert.equal(f.impliedPct, 6.1); assert.equal(f.impliedExpiry, '2026-10-16'); assert.equal(r.event!.key, '2026-10-14');
});
t('금요일 저녁 → 월요일 발표도 D-1(내일이 아님) · 하루 건너뛴 발표는 아직 아니다', () => {
  const r = detectEarningsD1({ ticker: 'X', date: '2026-10-19', hour: 'bmo' }, { today: '2026-10-16' });
  assert.ok(r.event); assert.equal((r.event!.facts as any).tomorrow, false);
  assert.equal(detectEarningsD1({ ticker: 'X', date: '2026-10-15', hour: 'bmo' }, { today: '2026-10-13' }).event, null);
  assert.equal(detectEarningsD1({ ticker: 'X', date: '2026-10-13', hour: 'bmo' }, { today: '2026-10-13' }).event, null, '발표 당일은 D-1 이 아니다');
});
t('예상 변동이 저장본에 없으면 null(지어내지 않는다) · 휴장일엔 보내지 않는다', () => {
  const r = detectEarningsD1({ ticker: 'X', date: '2026-10-14', hour: 'amc' }, { today: '2026-10-13', implied: { pct: null, expiry: null } });
  assert.equal((r.event!.facts as any).impliedPct, null);
  assert.equal(detectEarningsD1({ ticker: 'X', date: '2026-10-14', hour: 'amc' }, { today: '2026-10-10' }).event, null, '토요일에는 오늘이 거래일이 아니다');
});

console.log(`\n${n}개 통과`);
