// 2026-10-22 장중 핫픽스 — /api/market/macro REAL·creditSpread 빈칸(원천 실패 결과를 그대로 저장·반환)
// 재현: ① 불완전 결과는 마지막 정상 관측(원래 관측일 그대로)으로 잇는다 ② 오래된 보관값은 잇지 않는다 ③ 정상 결과는 같은 객체(바이트 동일)
import assert from 'node:assert/strict';
import {
    carryMissingMacroFields, extractLastGood, mergeLastGood, macroSnapshotComplete, weekdaysSince, lastGoodChanged,
    toCarryRecords, fromCarryRecords,
} from '../src/lib/macroSnapshotCarry';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
    try { fn(); passed++; console.log(`PASS ${name}`); } catch (e: any) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}

// 2026-10-21(수) 11:15 ET
const NOW = Date.parse('2026-10-21T15:15:00Z');
const real = (asOf: string, v = 1.75, fromPair?: boolean) => ({ us10y: 4.1, inflationExpectation: 2.35, realYield: v, stance: 'TIGHT' as const, asOf, ...(fromPair ? { fromPair } : {}) });
const cs = (date: string, value = 2.91) => ({ value, date, change20d: 0.05, percentile: 12, regime: 'WIDENING' as const });
const fg = (updatedAt: string, score = 30.2) => ({ score, rating: 'fear', updatedAt });
const base = (over: any = {}): any => ({
    asOfET: 'x', fetchedAtET: '2026-10-21T15:15:00.000Z', ageSeconds: 0, marketStatus: { session: 'REG' },
    factors: { vix: { level: 18 } }, nq: 25000, vix: 18, us10y: 5.12, dxy: 99,
    yieldCurve: { us2y: 4.79, us10y: 5.12, spread2s10s: 0.33, trend: 'NORMAL', date: '2026-10-20' },
    fearGreed: fg('2026-10-21T15:13:38.518Z'),
    realYield: real('2026-10-20'), realYieldObserved: real('2026-10-20'),
    creditSpread: cs('2026-10-19'),
    ...over,
});

test('정상 결과는 같은 객체 그대로(바이트 동일)', () => {
    const s = base();
    const lg = extractLastGood(base({ creditSpread: cs('2026-10-20', 3.5) }));
    const r = carryMissingMacroFields(s, lg, NOW);
    assert.equal(r.snapshot, s);
    assert.deepEqual(r.carried, []);
    assert.equal(JSON.stringify(r.snapshot), JSON.stringify(base()));
});

test('REAL·creditSpread 동시 누락 → 마지막 정상 관측을 원래 관측일 그대로 잇는다, 다른 필드 동일', () => {
    const prev = base();
    const lg = extractLastGood(prev);
    const s = base({ realYield: undefined, realYieldObserved: undefined, creditSpread: undefined, nq: 25111 });
    const r = carryMissingMacroFields(s, lg, NOW);
    assert.deepEqual(r.carried.sort(), ['creditSpread', 'real']);
    // 값·관측일은 그대로, fromPair=true 로 기존 화면 규칙의 관측일(MM/DD) 표시를 켠다
    assert.deepEqual(r.snapshot.realYieldObserved, { ...real('2026-10-20'), fromPair: true });
    assert.equal(r.snapshot.realYieldObserved!.asOf, '2026-10-20');
    assert.deepEqual(r.snapshot.creditSpread, cs('2026-10-19'));
    assert.equal(r.snapshot.nq, 25111);
    assert.equal(r.snapshot.fetchedAtET, s.fetchedAtET);
    assert.equal(r.snapshot.yieldCurve, s.yieldCurve);
    // 원본 객체는 건드리지 않는다
    assert.equal(s.creditSpread, undefined);
});

test('점수·AI 입력 realYield 는 잇지 않는다(관측값을 정시값으로 승격 금지 · 점수 동작 무변경)', () => {
    const lg = extractLastGood(base());
    const r = carryMissingMacroFields(base({ realYield: undefined, realYieldObserved: undefined }), lg, NOW);
    assert.equal(r.snapshot.realYield, undefined);
    assert.ok(r.snapshot.realYieldObserved);
});

test('관측값만 있고 정시값이 없는(같은 날짜 짝) 기존 규칙은 건드리지 않는다', () => {
    const s = base({ realYield: undefined, realYieldObserved: real('2026-10-20', 1.7, true) });
    const r = carryMissingMacroFields(s, extractLastGood(base({ realYieldObserved: real('2026-10-20', 1.9) })), NOW);
    assert.equal(r.snapshot, s);
    assert.equal(r.snapshot.realYieldObserved!.realYield, 1.7);
});

test('개별 누락 — creditSpread 만 빠지면 그것만 잇는다', () => {
    const s = base({ creditSpread: undefined });
    const r = carryMissingMacroFields(s, extractLastGood(base({ realYieldObserved: real('2026-10-20', 9) })), NOW);
    assert.deepEqual(r.carried, ['creditSpread']);
    assert.equal(r.snapshot.realYieldObserved!.realYield, 1.75);
});

test('오래된 보관값(평일 3일 초과)은 잇지 않는다 — 빈칸이 거짓 값보다 낫다', () => {
    // 10/15(목) → 10/21(수): 금·월·화·수 = 4 평일
    const lg = extractLastGood(base({ realYieldObserved: real('2026-10-15'), creditSpread: cs('2026-10-15') }));
    const r = carryMissingMacroFields(base({ realYieldObserved: undefined, realYield: undefined, creditSpread: undefined }), lg, NOW);
    assert.deepEqual(r.carried, []);
    assert.deepEqual(r.missing.sort(), ['creditSpread', 'real']);
    assert.equal(r.snapshot.creditSpread, undefined);
});

test('신용스프레드는 화면에 날짜가 없어 평일 2일까지만, REAL(날짜 표시)은 3일까지', () => {
    const empty = base({ realYieldObserved: undefined, realYield: undefined, creditSpread: undefined });
    // 10/16(금) → 10/21(수) = 월·화·수 3평일
    const r1 = carryMissingMacroFields(empty, extractLastGood(base({ realYieldObserved: real('2026-10-16'), creditSpread: cs('2026-10-16') })), NOW);
    assert.deepEqual(r1.carried, ['real']);
    assert.deepEqual(r1.missing, ['creditSpread']);
    // 10/19(월) → 화·수 2평일 = 원천 정상일 때도 나올 수 있는 범위
    const r2 = carryMissingMacroFields(empty, extractLastGood(base({ creditSpread: cs('2026-10-19') })), NOW);
    assert.ok(r2.carried.includes('creditSpread'));
});

test('주말을 낀 경계 — 금요일 관측은 화요일까지 3평일 안', () => {
    assert.equal(weekdaysSince('2026-10-16', Date.parse('2026-10-20T15:00:00Z')), 2); // 월·화
    assert.equal(weekdaysSince('2026-10-16', Date.parse('2026-10-21T15:00:00Z')), 3);
    assert.equal(weekdaysSince('2026-10-21', NOW), 0);
});

test('공포·탐욕·수익률 곡선은 대상 밖 — 빠져도 잇지 않는다(기존 동작)', () => {
    const lg: any = { ...extractLastGood(base()), fearGreed: fg('2026-10-21T15:00:00Z'), yieldCurve: base().yieldCurve };
    const s = base({ fearGreed: undefined, yieldCurve: undefined });
    const r = carryMissingMacroFields(s, lg, NOW);
    assert.equal(r.snapshot, s);
    assert.equal(macroSnapshotComplete(s), true);
});

test('null·비유한값·잘못된 날짜는 결측으로 본다(보관도 안 함), 측정된 0·음수 REAL 은 유효', () => {
    const bad = base({ creditSpread: { ...cs('2026-10-20'), value: NaN }, realYieldObserved: { ...real('2026-10-20'), asOf: 'bad' } });
    assert.equal(macroSnapshotComplete(bad), false);
    const lg = extractLastGood(bad);
    assert.equal(lg.creditSpread, undefined);
    assert.equal(lg.real, undefined);
    const zero = base({ realYieldObserved: real('2026-10-20', 0), realYield: real('2026-10-20', -0.4) });
    assert.equal(macroSnapshotComplete(zero), true);
    assert.equal(extractLastGood(base({ realYieldObserved: real('2026-10-20', -0.4) })).real!.realYieldObserved.realYield, -0.4);
});

test('보관 병합 — 더 새 관측만 덮고, 늦게 끝난 옛 관측은 새 관측을 되돌리지 못한다', () => {
    const newer = extractLastGood(base({ creditSpread: cs('2026-10-20', 3.0) }));
    const older = extractLastGood(base({ creditSpread: cs('2026-10-19', 2.9) }));
    assert.equal(mergeLastGood(newer, older).creditSpread!.date, '2026-10-20');
    assert.equal(mergeLastGood(older, newer).creditSpread!.date, '2026-10-20');
    // 한쪽만 있는 묶음은 남는다(불완전 결과가 보관본을 지우지 않는다)
    const partial = extractLastGood(base({ creditSpread: undefined, realYieldObserved: undefined }));
    const m = mergeLastGood(newer, partial);
    assert.equal(m.creditSpread!.date, '2026-10-20');
    assert.ok(m.real);
    assert.equal(lastGoodChanged(newer, mergeLastGood(newer, older)), false);
    // 같은 관측일이면 먼저 있던 것(저장소 CAS 와 같은 규칙) — 이은 값(fromPair) 재관측으로 다시 쓰지 않는다
    const same = extractLastGood(base({ realYieldObserved: { ...real('2026-10-20'), fromPair: true } }));
    assert.equal(lastGoodChanged(newer, mergeLastGood(newer, same)), false);
});

test('원자 저장 레코드 — value·asOf 는 CAS 계약(유한값·YYYY-MM-DD), 되읽기는 본문 관측일과 일치할 때만', () => {
    const lg = extractLastGood(base());
    const recs = toCarryRecords(lg);
    assert.deepEqual(recs.map(r => [r.bundle, r.value, r.asOf]), [['real', 1.75, '2026-10-20'], ['creditSpread', 2.91, '2026-10-19']]);
    assert.deepEqual(fromCarryRecords(recs), lg);
    const forged: any = { ...recs[1], asOf: '2026-10-21' };
    assert.equal(fromCarryRecords([forged, null]).creditSpread, undefined);
});

test('보관본이 비어 있으면 아무것도 지어내지 않는다', () => {
    const s = base({ creditSpread: undefined });
    const r = carryMissingMacroFields(s, {}, NOW);
    assert.equal(r.snapshot, s);
    assert.deepEqual(r.missing, ['creditSpread']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
