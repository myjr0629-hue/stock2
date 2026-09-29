/**
 * 예상 변동(Implied Move)·벽 사이 폭(Wall Range) «정의 한 벌» 시험 — src/lib/impliedMove.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/impliedMove.test.ts
 *
 * 픽스처는 실측 모양을 따른다:
 *   · MU 2026-09-28 종가 $1,053.98 · 10/2 만기 체인(운영 /api/live/ticker?t=MU 의 flow.rawChain, 9/29 01:12 ET 수집)
 *     1055 콜 중간값 41.50 + 풋 41.925 = 83.425 → ±7.9%  (같은 체인의 전일 종가 62.5 + 32.5 = 95.0 → «±9.0%» 가 나가던 값)
 *     구조 서비스 콜월 1100 · 풋플로어 900 → 벽 사이 폭 19.0%(예상 변동이 아니다)
 *   · Intrinio 직접 경로 계약(_rtGreeks · day.vwap = EOD mark · last_quote.bid/ask = 전일 종가 호가)
 *   · 알림 제공자(feat/watchlist-alerts)가 넘기는 모양: { details, last_trade: { price: 실시간 중간값 } }
 */
import assert from 'node:assert/strict';
import {
    IMPLIED_MOVE_DEF, atmStraddleImpliedMove, wallRangePct, impliedMoveFields, readImpliedMoveFields,
    taggedImpliedMovePct, etDateString, NO_IMPLIED_MOVE,
} from '../src/lib/impliedMove';
import { computeImpliedMovePct } from '../src/services/alphaEngine';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

const TODAY = '2026-09-29';
const EXP = '2026-10-02';
const MU_SPOT = 1053.98;

/** 슬림 체인 계약(/api/live/ticker rawChain·수집기 캐시 모양) — 계약별 실시간 표식이 없다 */
const slim = (k: number, type: 'call' | 'put', mid: number, close: number, exp = EXP) => ({
    details: { strike_price: k, contract_type: type, expiration_date: exp },
    open_interest: 100,
    day: { volume: 10, close },
    last_quote: { midpoint: mid },
});

// 9/29 01:12 ET 운영 체인에서 1035~1072.5 (행사가·중간값·전일 종가 그대로)
const MU_ROWS: Array<[number, number, number, number, number]> = [
    // strike, callMid, callClose, putMid, putClose
    [1035, 51.4, 74.63, 31.85, 24.83],
    [1040, 48.85, 68.5, 34.25, 26.75],
    [1045, 46.275, 66.56, 36.75, 28.29],
    [1050, 43.9, 63.22, 39.225, 30.6],
    [1055, 41.5, 62.5, 41.925, 32.5],
    [1060, 39.075, 57.83, 44.575, 32.84],
    [1062.5, 38.025, 58, 46.05, 34.45],
    [1065, 36.875, 57.85, 47.45, 37.45],
    [1070, 35, 53.31, 50.375, 39.6],
];
// 체인 순서는 벤더 순서(행사가 내림차순·콜 먼저) — «첫 계약»을 고르던 옛 구현이 흔들린 이유
const muChain = (exp = EXP) => MU_ROWS.slice().reverse().flatMap(([k, cm, cc, pm, pc]) => [slim(k, 'call', cm, cc, exp), slim(k, 'put', pm, pc, exp)]);
const MU_CHAIN = muChain();
/** computeImpliedMovePct 는 «오늘»을 주입받지 않는다 — 시계가 지나도 깨지지 않게 먼 만기로 같은 체인을 만든다 */
const FAR = '2099-01-16';
const MU_CHAIN_FAR = muChain(FAR);

console.log('impliedMove — ATM 스트래들 정의');

t('MU 9/28: 10/2 만기 1055 스트래들 중간값 83.425 ÷ 1,053.98 = ±7.9% (실시간 호가 체인)', () => {
    const im = atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { quotesLive: true, quotesAt: 1_790_000_000_000, todayEt: TODAY });
    assert.ok(im);
    assert.equal(im.pct, 7.9);
    assert.equal(im.strike, 1055);
    assert.equal(im.expiry, EXP);
    assert.equal(im.basis, 'live');
    assert.equal(im.callPrice, 41.5);
    assert.equal(im.putPrice, 41.925);
    assert.ok(Math.abs(im.straddle - 83.43) < 0.011);
    assert.equal(im.asOf, 1_790_000_000_000);
    assert.equal(im.def, IMPLIED_MOVE_DEF);
});

t('같은 체인 — 체인의 실시간 여부를 모르면 «EOD»로 라벨(값은 같고 asOf 없음) · 실시간만 요구하면 없음', () => {
    const im = atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { todayEt: TODAY, chainDate: '2026-09-25' });
    assert.ok(im);
    assert.equal(im.pct, 7.9);
    assert.equal(im.basis, 'eod');
    assert.equal(im.asOf, null);
    assert.equal(im.chainDate, '2026-09-25');
    assert.equal(atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { todayEt: TODAY, liveOnly: true }), null);
});

t('전일 종가(day.close)는 쓰지 않는다 — 중간값이 없으면 «없음»(±9.0% 를 만들던 입력)', () => {
    const closesOnly = MU_CHAIN_FAR.map((c) => ({ details: c.details, open_interest: 100, day: { close: c.day.close } }));
    assert.equal(atmStraddleImpliedMove(closesOnly, MU_SPOT, { todayEt: TODAY }), null);
    assert.equal(computeImpliedMovePct(closesOnly, MU_SPOT), null);
    // 옛 값의 정체: 1055 전일 종가 62.5 + 32.5 = 95.0 → 9.0%
    assert.equal(Math.round((62.5 + 32.5) / MU_SPOT * 1000) / 10, 9);
});

t('alphaEngine.computeImpliedMovePct 도 같은 정의 — MU 7.9 (예전 ±2% 창 «첫 계약» + 전일 종가 아님)', () => {
    assert.equal(computeImpliedMovePct(MU_CHAIN_FAR, MU_SPOT), 7.9);
    assert.equal(computeImpliedMovePct([], MU_SPOT), null);
    assert.equal(computeImpliedMovePct(MU_CHAIN_FAR, 0), null);
});

t('벽 사이 폭은 다른 숫자다 — 콜월 1100 · 풋플로어 900 → 19.0% (± 도 «예상 변동»도 아니다)', () => {
    assert.equal(wallRangePct(1100, 900, MU_SPOT), 19);
    assert.notEqual(wallRangePct(1100, 900, MU_SPOT), atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { todayEt: TODAY })!.pct);
    assert.equal(wallRangePct(900, 1100, MU_SPOT), null, '콜월 ≤ 풋플로어면 폭이 아니다');
    assert.equal(wallRangePct(0, 900, MU_SPOT), null);
    assert.equal(wallRangePct(1100, 900, 0), null);
    assert.equal(wallRangePct(null, undefined, MU_SPOT), null);
});

console.log('\nimpliedMove — 행사가·만기 선택');

t('두 다리는 «같은 행사가» — 1055 풋이 비면 1055 콜 + 1050 풋을 섞지 않고 1050 스트래들', () => {
    const chain = MU_CHAIN.filter((c) => !(c.details.strike_price === 1055 && c.details.contract_type === 'put'));
    const im = atmStraddleImpliedMove(chain, MU_SPOT, { quotesLive: true, todayEt: TODAY })!;
    assert.equal(im.strike, 1050);
    assert.equal(im.callPrice, 43.9);
    assert.equal(im.putPrice, 39.225);
    assert.equal(im.pct, 7.9);   // 83.125 / 1053.98
});

t('가장 가까운 만기 — 오늘 0DTE 이전 만기는 버리고, minExpiry(실적 뒤 첫 만기)·지정 만기를 따른다', () => {
    const chain = [
        slim(100, 'call', 9, 9, '2026-09-25'), slim(100, 'put', 9, 9, '2026-09-25'),   // 지난 만기
        slim(100, 'call', 2, 2, '2026-10-02'), slim(100, 'put', 2, 2, '2026-10-02'),   // 주간
        slim(100, 'call', 4, 4, '2026-10-09'), slim(100, 'put', 4, 4, '2026-10-09'),   // 다음 주
    ];
    assert.equal(atmStraddleImpliedMove(chain, 100, { todayEt: TODAY })!.expiry, '2026-10-02');
    assert.equal(atmStraddleImpliedMove(chain, 100, { todayEt: TODAY })!.pct, 4);
    const after = atmStraddleImpliedMove(chain, 100, { todayEt: TODAY, minExpiry: '2026-10-03' })!;
    assert.equal(after.expiry, '2026-10-09');
    assert.equal(after.pct, 8);
    assert.equal(atmStraddleImpliedMove(chain, 100, { expiry: '2026-10-09' })!.pct, 8);
    assert.equal(atmStraddleImpliedMove(chain, 100, { expiry: '2026-10-16' }), null, '없는 만기를 다른 만기로 바꾸지 않는다');
    const expiredOnly = chain.slice(0, 2);
    assert.equal(atmStraddleImpliedMove(expiredOnly, 100, { todayEt: TODAY }), null, '지난 만기만 든 캐시 체인');
});

t('ATM 은 현물 5% 안 — 먼 행사가뿐이면 없음 · 같은 거리면 낮은 행사가', () => {
    const far = [slim(120, 'call', 1, 1), slim(120, 'put', 21, 21)];
    assert.equal(atmStraddleImpliedMove(far, 100, { todayEt: TODAY }), null);
    const tie = [slim(95, 'call', 7, 7), slim(95, 'put', 2, 2), slim(105, 'call', 2.5, 2.5), slim(105, 'put', 7.5, 7.5)];
    assert.equal(atmStraddleImpliedMove(tie, 100, { todayEt: TODAY })!.strike, 95);
});

t('체인 오염 방어 — 스트래들 ≥ 현물이면 없음', () => {
    assert.equal(atmStraddleImpliedMove([slim(100, 'call', 60, 60), slim(100, 'put', 50, 50)], 100, { todayEt: TODAY }), null);
});

console.log('\nimpliedMove — 가격 기준(실시간 vs 전일)');

/** Intrinio 직접 경로 계약 — midpoint = synthetic_price ?? mark ?? (close_bid+close_ask)/2 */
const vendor = (type: 'call' | 'put', k: number, opt: { mid?: number; mark?: number; bid?: number; ask?: number; rt: boolean }) => ({
    details: { strike_price: k, contract_type: type, expiration_date: EXP },
    open_interest: 100,
    day: { close: 99, vwap: opt.mark ?? 0 },
    last_quote: { midpoint: opt.mid ?? 0, bid: opt.bid ?? 0, ask: opt.ask ?? 0 },
    _rtGreeks: opt.rt,
});

t('Intrinio 직접: _rtGreeks + FMV(≠ mark) = 실시간 · FMV 가 비어 mark 로 떨어진 다리는 실시간이 아니다', () => {
    const live = [vendor('call', 1000, { mid: 40, mark: 38, rt: true }), vendor('put', 1000, { mid: 39, mark: 37, rt: true })];
    const a = atmStraddleImpliedMove(live, 1000, { todayEt: TODAY, quotesAt: 5 })!;
    assert.equal(a.basis, 'live');
    assert.equal(a.pct, 7.9);
    assert.equal(a.asOf, 5);
    // 풋의 midpoint 가 mark 와 같다 = 실시간 FMV 없음 → 두 다리 모두 EOD mark 로(기준을 섞지 않는다)
    const mixed = [vendor('call', 1000, { mid: 40, mark: 38, rt: true }), vendor('put', 1000, { mid: 37, mark: 37, rt: true })];
    const b = atmStraddleImpliedMove(mixed, 1000, { todayEt: TODAY })!;
    assert.equal(b.basis, 'eod');
    assert.equal(b.callPrice, 38);
    assert.equal(b.putPrice, 37);
    assert.equal(atmStraddleImpliedMove(mixed, 1000, { todayEt: TODAY, liveOnly: true }), null);
    // 실시간 그릭스가 없던 계약(_rtGreeks:false) — midpoint 는 mark 또는 종가 호가 중간값 = EOD
    const eod = [vendor('call', 1000, { mid: 38, rt: false }), vendor('put', 1000, { bid: 36, ask: 38, rt: false })];
    const c = atmStraddleImpliedMove(eod, 1000, { todayEt: TODAY })!;
    assert.equal(c.basis, 'eod');
    assert.equal(c.putPrice, 37);
    assert.equal(c.pct, 7.5);
});

t('알림 제공자 모양({details, last_trade.price}) — computeImpliedMovePct 가 그대로 받는다', () => {
    const fromAlerts = [
        { details: { contract_type: 'call', strike_price: 1000, expiration_date: FAR }, last_trade: { price: 40 } },
        { details: { contract_type: 'put', strike_price: 1000, expiration_date: FAR }, last_trade: { price: 39 } },
    ];
    assert.equal(computeImpliedMovePct(fromAlerts, 1000), 7.9);
    // 구조화 API 는 체결가를 기본으로 받지 않는다(기준을 모른다)
    assert.equal(atmStraddleImpliedMove(fromAlerts, 1000, { todayEt: TODAY }), null);
});

console.log('\nimpliedMove — 출구 필드·저장본 표식');

t('화면 필드는 실시간만 — EOD 값은 싣지 않는다(allowEod 는 스스로 라벨을 붙이는 소비처 전용)', () => {
    const live = atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { quotesLive: true, quotesAt: 7, todayEt: TODAY });
    assert.deepEqual(impliedMoveFields(live), {
        impliedMovePct: 7.9, impliedMoveExpiry: EXP, impliedMoveBasis: 'live', impliedMoveAsOf: 7, impliedMoveDef: IMPLIED_MOVE_DEF,
    });
    const eod = atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { todayEt: TODAY });
    assert.deepEqual(impliedMoveFields(eod), { ...NO_IMPLIED_MOVE });
    assert.equal(impliedMoveFields(eod, { allowEod: true }).impliedMoveBasis, 'eod');
    assert.deepEqual(impliedMoveFields(null), { ...NO_IMPLIED_MOVE });
});

t('저장본: 표식 없는 impliedMovePct(옛 벽 사이 폭·전일 종가 스트래들)는 버린다', () => {
    assert.deepEqual(readImpliedMoveFields({ impliedMovePct: 9 }), { ...NO_IMPLIED_MOVE }, '9/28 MU 옛 값');
    assert.equal(taggedImpliedMovePct({ impliedMovePct: 18.98 }), null, '벽 사이 폭');
    assert.equal(taggedImpliedMovePct(null), null);
    const row = { impliedMovePct: 7.9, impliedMoveExpiry: EXP, impliedMoveBasis: 'live', impliedMoveAsOf: 9, impliedMoveDef: IMPLIED_MOVE_DEF };
    assert.deepEqual(readImpliedMoveFields(row), row);
    assert.equal(taggedImpliedMovePct({ ...row, impliedMovePct: 0 }), null, '0 은 «없음»');
});

t('ET 날짜 — 01:12 ET(05:12Z)는 그날, 23:30 ET(03:30Z 다음날)도 ET 그날', () => {
    assert.equal(etDateString(Date.parse('2026-09-29T05:12:00Z')), '2026-09-29');
    assert.equal(etDateString(Date.parse('2026-09-30T03:30:00Z')), '2026-09-29');
});

console.log(`\n${n} passed`);
