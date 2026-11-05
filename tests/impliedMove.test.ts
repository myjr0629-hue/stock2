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
    IMPLIED_MOVE_DEF, atmStraddleImpliedMove, wallRangePct, impliedMoveFields, readImpliedMoveFields, impliedMoveSessionNote, formatImpliedMovePct,
    taggedImpliedMovePct, etDateString, NO_IMPLIED_MOVE, stampOptionMoveFields, copyImpliedMoveGroup,
    contractQuoteSource, holdSessionLiveMove, eodQuoteRows, type ImpliedMove,
} from '../src/lib/impliedMove';
import { computeImpliedMovePct } from '../src/services/alphaEngine';
import { structureLacksImpliedMove } from '../src/services/impliedMoveService';

// 정의·세션 픽스처의 기준 시각을 고정한다. 만기 경계는 impliedMoveExpiryRoll에서 따로 검사한다.
Date.now = () => Date.parse('2026-09-29T12:00:00-04:00');
let n = 0;
// 정규장 안의 호가 시각(월 9/28 13:37 ET) — [10/4] 정규장 밖 «실시간» 호가는 마감 값(eod)으로 다룬다
const AT_LIVE = Date.parse('2026-09-28T17:37:00Z');
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

t('계약별 호가 출처가 체인 그릭스 표식보다 우선한다', () => {
    const rows = [
        { ...vendor('call', 1000, { mid: 70, mark: 60, rt: true }), _quoteSource: 'live', _quoteObservedAt: new Date(AT_LIVE).toISOString() },
        { ...vendor('put', 1000, { mid: 65, mark: 65, rt: true }), _quoteSource: 'eod' },
    ];
    const im = atmStraddleImpliedMove(rows, 1000, { quotesLive: true, quotesAt: AT_LIVE, chainDate: '2026-09-25', todayEt: TODAY })!;
    assert.equal(im.pct, 12.5);
    assert.equal(im.basis, 'eod');
    assert.equal(im.session, '2026-09-25');
    assert.equal(im.asOf, null);
});

// [11/6 T43] 11/5 마감 직후 AXON 재현 — 실시간 그릭스가 일부 계약에만 실린 체인에서 ATM 한 다리가 전일(11/4) EOD 값.
//   예전: 수집기 슬림 체인은 체인 수준 «realtime» 표식으로 전일 값 다리까지 실시간 → 12.5 가 «live·11/5 세션»으로 나갔다.
t('[T43] 수집기 슬림 체인: 실시간 IV 없는 다리(ivSourceDate)는 출처 «모름» — 전일 12.5 를 live 로도, FMV 를 전일 종가로도 내지 않는다', () => {
    const ax = (type: 'call' | 'put', k: number, mid: number, ivSourceDate: string | null) => ({
        details: { strike_price: k, contract_type: type, expiration_date: EXP }, open_interest: 100,
        last_quote: { midpoint: mid }, ivSourceDate, ivObservedAt: ivSourceDate ? null : new Date(AT_LIVE).toISOString(),
    });
    const opt = { quotesLive: true, quotesAt: AT_LIVE, chainDate: '2026-09-25', todayEt: TODAY };
    // 1000 행사가: 콜은 실시간(70) · 풋은 실시간 IV 빠짐(전일 EOD mark 55 일 수도, IV 만 빠진 FMV 일 수도)
    assert.equal(atmStraddleImpliedMove([ax('call', 1000, 70, null), ax('put', 1000, 55, '2026-09-25')], 1000, opt), null);
    // 두 다리 모두 실시간 IV 빠짐(전일 mark 60+65=12.5) → 값 없음(예전: live 12.5 · 세션 오늘)
    assert.equal(atmStraddleImpliedMove([ax('call', 1000, 60, '2026-09-25'), ax('put', 1000, 65, '2026-09-25')], 1000, opt), null);
    // 다음 행사가가 두 다리 모두 실시간이면 그 행사가로
    const near = atmStraddleImpliedMove([ax('call', 1000, 60, '2026-09-25'), ax('put', 1000, 65, '2026-09-25'), ax('call', 1005, 67, null), ax('put', 1005, 71, null)], 1000, opt)!;
    assert.deepEqual([near.strike, near.basis, near.pct, near.asOf], [1005, 'live', 13.8, AT_LIVE]);
    // 체인이 실시간이 아니면(EOD 체인) ivSourceDate 다리는 예전처럼 EOD 값
    const eodChain = atmStraddleImpliedMove([ax('call', 1000, 60, '2026-09-25'), ax('put', 1000, 65, '2026-09-25')], 1000, { ...opt, quotesLive: false })!;
    assert.deepEqual([eodChain.pct, eodChain.basis, eodChain.session], [12.5, 'eod', '2026-09-25']);
    // 두 다리 모두 실시간 IV 가 있으면 예전처럼 실시간(체인 수준 표식)
    const c = atmStraddleImpliedMove([ax('call', 1000, 70, null), ax('put', 1000, 69, null)], 1000, opt)!;
    assert.deepEqual([c.basis, c.pct, c.asOf], ['live', 13.9, AT_LIVE]);
});

t('[T43] 출처 표식: 만든 곳이 적은 _quoteSource 가 우선 · 가격 일치로 짐작하지 않는다', () => {
    // 직접 경로: 실시간 FMV 가 빠져 midpoint 가 마감 호가 중간(전일)으로 떨어진 행 — 생성기가 'eod' 를 적는다
    const callNoFmv = { ...vendor('call', 1000, { mid: 61, mark: 60.5, bid: 60, ask: 62, rt: true }), _quoteSource: 'eod' };
    const put = { ...vendor('put', 1000, { mid: 64, mark: 63, bid: 63.5, ask: 64.5, rt: true }), _quoteSource: 'eod' };
    const im = atmStraddleImpliedMove([callNoFmv, put], 1000, { todayEt: TODAY, quotesAt: AT_LIVE, chainDate: '2026-09-25' })!;
    assert.deepEqual([im.basis, im.session], ['eod', '2026-09-25']);
    // 실시간 FMV 가 우연히 마감 호가 중간과 같아도 'live' 표식이면 실시간
    const fmvEqual = [{ ...vendor('call', 1000, { mid: 61, mark: 60.5, bid: 60, ask: 62, rt: true }), _quoteSource: 'live' },
        { ...vendor('put', 1000, { mid: 64, mark: 63, bid: 63.5, ask: 64.5, rt: true }), _quoteSource: 'live' }];
    assert.equal(atmStraddleImpliedMove(fmvEqual, 1000, { todayEt: TODAY, quotesAt: AT_LIVE })!.basis, 'live');
    assert.equal(contractQuoteSource({ _quoteSource: 'eod', _rtGreeks: true, last_quote: { midpoint: 70 } }), 'eod');
    assert.equal(contractQuoteSource({ _quoteSource: 'unknown', last_quote: { midpoint: 70 } }), 'unknown');
    assert.equal(contractQuoteSource({ ivSourceDate: '2026-09-25', last_quote: { midpoint: 70 } }, true), 'unknown');
    assert.equal(contractQuoteSource({ ivSourceDate: '2026-09-25', last_quote: { midpoint: 70 } }, false), null);
    assert.equal(contractQuoteSource({ ivSourceDate: null, ivObservedAt: '2026-09-28T17:37:00Z', last_quote: { midpoint: 70 } }, true), null);
    // EOD 전용 행(eodQuoteRows)은 원본의 'live' 표식을 덮는다
    const [row] = eodQuoteRows([{ ...vendor('call', 1000, { mid: 70, mark: 60, bid: 59, ask: 61, rt: true }), _quoteSource: 'live' }]);
    assert.equal(contractQuoteSource(row), 'eod');
});

t('Intrinio 직접: _rtGreeks + FMV(≠ mark) = 실시간 · FMV 가 비어 mark 로 떨어진 다리는 실시간이 아니다', () => {
    const live = [vendor('call', 1000, { mid: 40, mark: 38, rt: true }), vendor('put', 1000, { mid: 39, mark: 37, rt: true })];
    const a = atmStraddleImpliedMove(live, 1000, { todayEt: TODAY, quotesAt: AT_LIVE })!;
    assert.equal(a.basis, 'live');
    assert.equal(a.pct, 7.9);
    assert.equal(a.asOf, AT_LIVE);
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

t('[10/4] 화면 필드 — 실시간 값 + EOD 값도 세션(체인 날짜)과 함께 싣는다(«—» 금지) · liveOnly 는 실시간만', () => {
    const at = Date.parse('2026-09-28T17:37:00Z');
    const live = atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { quotesLive: true, quotesAt: at, todayEt: TODAY });
    assert.deepEqual(impliedMoveFields(live), {
        impliedMovePct: 7.9, impliedMoveExpiry: EXP, impliedMoveBasis: 'live', impliedMoveAsOf: at, impliedMoveDef: IMPLIED_MOVE_DEF, impliedMoveSession: '2026-09-28',
    });
    const eod = atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { todayEt: TODAY, chainDate: '2026-09-28' });
    const f = impliedMoveFields(eod);
    assert.equal(f.impliedMoveBasis, 'eod');
    assert.equal(f.impliedMoveSession, '2026-09-28');
    assert.ok((f.impliedMovePct ?? 0) > 0);
    assert.deepEqual(impliedMoveFields(eod, { liveOnly: true }), { ...NO_IMPLIED_MOVE });
    assert.equal(impliedMoveFields(atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { todayEt: TODAY })).impliedMoveSession, null, '체인 날짜를 모르면 세션 null');
    assert.deepEqual(impliedMoveFields(null), { ...NO_IMPLIED_MOVE });
});

t('[10/4] 세션 꼬리표 — eod «10/2 종가/close/終値» · 장중 실시간은 없음 · 장 끝난 뒤의 실시간 값은 «10/2 장중»', () => {
    const eod = { impliedMovePct: 3.1, impliedMoveBasis: 'eod' as const, impliedMoveSession: '2026-10-02' };
    assert.equal(impliedMoveSessionNote(eod, 'ko'), '10/2 종가');
    assert.equal(impliedMoveSessionNote(eod, 'en'), '10/2 close');
    assert.equal(impliedMoveSessionNote(eod, 'ja'), '10/2終値');
    assert.equal(impliedMoveSessionNote({ ...eod, impliedMoveSession: null }, 'ko'), '전 세션 종가');
    const liveAt = Date.parse('2026-10-02T17:00:00Z');   // 금 13:00 ET
    const live = { impliedMovePct: 3.1, impliedMoveBasis: 'live' as const, impliedMoveSession: '2026-10-02', impliedMoveAsOf: liveAt };
    assert.equal(impliedMoveSessionNote(live, 'ko', Date.parse('2026-10-02T17:05:00Z')), null, '장중 실시간');
    assert.equal(impliedMoveSessionNote(live, 'ko', Date.parse('2026-10-03T15:00:00Z')), '10/2 장중', '토요일');
    assert.equal(impliedMoveSessionNote(live, 'en', Date.parse('2026-10-02T21:00:00Z')), '10/2 intraday', '17:00 ET 마감 뒤');
    assert.equal(impliedMoveSessionNote({ impliedMovePct: null, impliedMoveBasis: 'eod', impliedMoveSession: '2026-10-02' }, 'ko'), null, '값 없으면 꼬리표도 없음');
    assert.equal(formatImpliedMovePct(7.94), '±7.9%');
    assert.equal(formatImpliedMovePct(0), null);
});

t('[10/4] 정규장 밖에서 받은 «실시간» 호가 = 그 세션의 마감 값 — 일요일 운영 표식(greeks REALTIME)이어도 basis eod · 세션 = 금', () => {
    const sun = Date.parse('2026-10-04T15:00:00Z');   // 일 11:00 ET
    const im = atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { quotesLive: true, quotesAt: sun, todayEt: TODAY });
    assert.equal(im?.basis, 'eod');
    assert.equal(im?.session, '2026-10-02');
    assert.equal(im?.asOf, null);
    assert.equal(impliedMoveSessionNote(impliedMoveFields(im), 'ko'), '10/2 종가');
    const thu = Date.parse('2026-10-01T17:00:00Z');   // 목 13:00 ET — 장중
    assert.equal(atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { quotesLive: true, quotesAt: thu, todayEt: TODAY })?.basis, 'live');
    const preOpen = Date.parse('2026-10-05T12:00:00Z');   // 월 08:00 ET — 세션 = 금
    assert.equal(atmStraddleImpliedMove(MU_CHAIN, MU_SPOT, { quotesLive: true, quotesAt: preOpen, todayEt: TODAY })?.session, '2026-10-02');
});

t('[10/4] 호가 시각을 모르는 «실시간» 값(웹소켓 호가를 덮은 FlowRadar) — 지금이 장외면 마감 값(세션 = 금), 장중이면 실시간', () => {
    const ws = [vendor('call', 1000, { mid: 40, mark: 38, rt: true }), vendor('put', 1000, { mid: 39, mark: 37, rt: true })].map((c) => ({ ...c, details: { ...c.details, expiration_date: '2026-10-09' } }));
    const sat = atmStraddleImpliedMove(ws, 1000, { todayEt: TODAY, nowMs: Date.parse('2026-10-04T01:30:00Z') })!;   // 토 21:30 ET
    assert.equal(sat.basis, 'eod');
    assert.equal(sat.session, '2026-10-02');
    assert.equal(impliedMoveSessionNote(impliedMoveFields(sat), 'ko'), '10/2 종가', '«10/3 장중»이 아니다');
    const thu = atmStraddleImpliedMove(ws, 1000, { todayEt: TODAY, nowMs: Date.parse('2026-10-01T17:00:00Z') })!;
    assert.equal(thu.basis, 'live');
});

t('저장본: 표식 없는 impliedMovePct(옛 벽 사이 폭·전일 종가 스트래들)는 버린다', () => {
    assert.deepEqual(readImpliedMoveFields({ impliedMovePct: 9 }), { ...NO_IMPLIED_MOVE }, '9/28 MU 옛 값');
    assert.equal(taggedImpliedMovePct({ impliedMovePct: 18.98 }), null, '벽 사이 폭');
    assert.equal(taggedImpliedMovePct(null), null);
    const row = { impliedMovePct: 7.9, impliedMoveExpiry: EXP, impliedMoveBasis: 'live', impliedMoveAsOf: 9, impliedMoveDef: IMPLIED_MOVE_DEF };
    assert.deepEqual(readImpliedMoveFields(row), { ...row, impliedMoveSession: null });
    assert.equal(readImpliedMoveFields({ ...row, impliedMoveSession: '2026-10-02' }).impliedMoveSession, '2026-10-02');
    assert.equal(taggedImpliedMovePct({ ...row, impliedMovePct: 0 }), null, '0 은 «없음»');
});

t('배치 출구: 표식 없는 예상 변동은 지우고, 벽 사이 폭은 «나가는» 벽으로 다시 계산', () => {
    const rows: any[] = [
        { ticker: 'MU', realtime: { price: MU_SPOT, callWall: 1100, putFloor: 900, impliedMovePct: 18.98 } },   // 옛 값(벽 폭)
        { ticker: 'NVDA', realtime: { price: 228.86, callWall: 250, putFloor: 200, impliedMovePct: 2.9, impliedMoveExpiry: EXP, impliedMoveBasis: 'live', impliedMoveAsOf: 1, impliedMoveDef: IMPLIED_MOVE_DEF } },
        { ticker: 'X', error: 'Analysis failed' },
    ];
    stampOptionMoveFields(rows);
    assert.equal(rows[0].realtime.impliedMovePct, null);
    assert.equal(rows[0].realtime.impliedMoveDef, null);
    assert.equal(rows[0].realtime.wallRangePct, 19);
    assert.equal(rows[1].realtime.impliedMovePct, 2.9);
    assert.equal(rows[1].realtime.wallRangePct, 21.8);
    assert.equal(rows[2].realtime, undefined);
    // 출구에서 벽이 바뀌면(레벨 한 벌 덮기) 폭도 따라간다 — 덮기 «뒤»에 찍기 때문
    rows[0].realtime.putFloor = 1000;
    stampOptionMoveFields(rows);
    assert.equal(rows[0].realtime.wallRangePct, 9.5);
});

t('대시보드 스토어: 응답이 묶음(impliedMoveDef 키)을 실었으면 null 도 덮는다 · 옛 응답 모양은 건드리지 않는다', () => {
    const stored: any = { impliedMovePct: 9, impliedMoveDir: 'bullish' };   // localStorage 의 옛 값
    copyImpliedMoveGroup(stored, { impliedMovePct: null, impliedMoveDef: null });
    assert.equal(stored.impliedMovePct, null);
    const legacy: any = { impliedMovePct: 9 };
    copyImpliedMoveGroup(legacy, { impliedMovePct: 5 });   // 표식 키가 없는 응답 — 이 함수는 손대지 않는다
    assert.equal(legacy.impliedMovePct, 9);
    copyImpliedMoveGroup(stored, { impliedMovePct: 7.9, impliedMoveExpiry: EXP, impliedMoveBasis: 'live', impliedMoveAsOf: 3, impliedMoveDef: IMPLIED_MOVE_DEF });
    assert.equal(stored.impliedMovePct, 7.9);
    assert.equal(stored.impliedMoveExpiry, EXP);
});

t('전환기 판정: 계산은 성공했는데 impliedMove 키가 «없는» 구조 사본만(이 수리 전 사본)', () => {
    assert.equal(structureLacksImpliedMove({ options_status: 'OK', expiration: EXP }), true);
    assert.equal(structureLacksImpliedMove({ options_status: 'OK', impliedMove: null }), false, '새 코드가 «못 구함»으로 계산한 사본');
    assert.equal(structureLacksImpliedMove({ options_status: 'PENDING' }), false);
    assert.equal(structureLacksImpliedMove(null), false);
});

t('ET 날짜 — 01:12 ET(05:12Z)는 그날, 23:30 ET(03:30Z 다음날)도 ET 그날', () => {
    assert.equal(etDateString(Date.parse('2026-09-29T05:12:00Z')), '2026-09-29');
    assert.equal(etDateString(Date.parse('2026-09-30T03:30:00Z')), '2026-09-29');
});

console.log('\nimpliedMove — [T43] 세션 단조(판본 저장 때 실시간 값 유지)');
{
    // 11/5(목) 마감 직후 AXON 11/6 만기 — 16:05 ET 실시간 14.0 → 16:10 ET 재계산이 실시간 다리를 잃고 전일(11/4) EOD 쌍 12.5
    const X = '2026-11-06';
    const T1605 = Date.parse('2026-11-05T21:05:00Z'), T1610 = Date.parse('2026-11-05T21:10:00Z'), T1612 = Date.parse('2026-11-05T21:12:00Z');
    const mv = (o: Partial<ImpliedMove> & { pct: number; basis: 'live' | 'eod'; session: string | null }): ImpliedMove => ({
        def: IMPLIED_MOVE_DEF, straddle: o.pct * 3.8256, strike: 382.5, expiry: X, callPrice: 28, putPrice: 25.5, spot: 382.56,
        asOf: null, chainDate: o.basis === 'eod' ? o.session : null, ...o,
    });
    const live140 = mv({ pct: 14.0, basis: 'live', session: '2026-11-05', asOf: T1605 });
    const prior125 = mv({ pct: 12.5, basis: 'eod', session: '2026-11-04' });
    t('[T43] 마감 직후 재계산이 전일 EOD(12.5)·값 없음이면 같은 만기의 당일 실시간(14.0, 관측 시각 그대로)을 유지', () => {
        assert.equal(holdSessionLiveMove(live140, prior125, X, T1610), live140);
        assert.equal(holdSessionLiveMove(live140, null, X, T1610), live140);
        assert.equal(holdSessionLiveMove(live140, mv({ pct: 12.5, basis: 'eod', session: null }), X, T1610), live140, '세션 모르는 값도 이기지 못한다');
        const f = impliedMoveFields(holdSessionLiveMove(live140, prior125, X, T1610));
        assert.equal(f.impliedMovePct, 14.0);
        assert.equal(f.impliedMoveBasis, 'live');
        assert.equal(f.impliedMoveAsOf, T1605);
        assert.equal(f.impliedMoveSession, '2026-11-05');
    });
    t('[T43] 같은 세션의 더 새 실시간·같은 세션 EOD·더 새 세션은 그대로 새 값(EOD 가 나오면 그 세션 EOD)', () => {
        const live139 = mv({ pct: 13.9, basis: 'live', session: '2026-11-05', asOf: T1612 });
        assert.equal(holdSessionLiveMove(live140, live139, X, T1612), live139);
        const eod1105 = mv({ pct: 14.1, basis: 'eod', session: '2026-11-05' });
        assert.equal(holdSessionLiveMove(live140, eod1105, X, T1612), eod1105);
        const next1106 = mv({ pct: 9.0, basis: 'live', session: '2026-11-06', asOf: Date.parse('2026-11-06T14:40:00Z') });
        assert.equal(holdSessionLiveMove(live140, next1106, X, Date.parse('2026-11-06T14:41:00Z')), next1106);
        // 같은 세션 실시간이라도 관측 시각이 더 이르면(늦게 끝난 옛 캐시 계산) 지금 값 유지
        const older = mv({ pct: 13.0, basis: 'live', session: '2026-11-05', asOf: T1605 - 60_000 });
        assert.equal(holdSessionLiveMove(live140, older, X, T1610), live140);
    });
    t('[T43] 붙들지 않는 경우 — 만기 다름·만기 지남·지금 값이 EOD·4일 넘음', () => {
        const other = mv({ pct: 8.0, basis: 'eod', session: '2026-11-04', expiry: '2026-11-13' });
        assert.equal(holdSessionLiveMove(live140, other, '2026-11-13', T1610), other);
        assert.equal(holdSessionLiveMove(live140, null, X, Date.parse('2026-11-06T21:30:00Z')), null, '11/6 만기 마감 뒤');
        assert.equal(holdSessionLiveMove(mv({ pct: 14.0, basis: 'eod', session: '2026-11-05' }), prior125, X, T1610), prior125);
        assert.equal(holdSessionLiveMove({ ...live140, expiry: '2026-11-20' }, null, '2026-11-20', T1605 + 5 * 86_400_000), null);
        assert.equal(holdSessionLiveMove(null, prior125, X, T1610), prior125);
    });
}

console.log(`\n${n} passed`);
