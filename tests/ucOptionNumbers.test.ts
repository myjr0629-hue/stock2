// Offline checks: direct option claims, units, rounding, and volume/OI scope.
import assert from 'node:assert/strict';
import { ucNumberProblems, type UcLocale } from '../src/lib/ai/ucNumbers';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
    try { fn(); passed++; console.log(`PASS ${name}`); }
    catch (e: any) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
const money = { oiPcr: 0.734, volumePcr: 2.5, squeezeScore: 28 };
const claims: Array<[UcLocale, string, string]> = [
    ['ko', 'P/C 1.40이다.', 'P/C 0.73이다.'],
    ['en', 'P/C is 1.40.', 'P/C is 0.73.'],
    ['ja', 'P/Cは1.40です。', 'P/Cは0.73です。'],
    ['ko', '풋/콜 비율은 1.40이다.', '풋/콜 비율은 0.73이다.'],
    ['en', 'The put/call ratio is 1.40.', 'The put/call ratio is 0.73.'],
    ['ja', 'プット・コール比率は1.40です。', 'プット・コール比率は0.73です。'],
    ['ko', '스퀴즈 점수는 80점이다.', '스퀴즈 점수는 28점이다.'],
    ['en', 'The squeeze score is 80.', 'The squeeze score is 28.'],
    ['ja', 'スクイーズスコアは80点です。', 'スクイーズスコアは28点です。'],
    // Gate 10181910: a parenthetical right after the label must not hide the number.
    ['ko', 'P/C(풋÷콜) 1.40이다.', 'P/C(풋÷콜) 0.73이다.'],
    ['en', 'P/C (put/call) is 1.40.', 'P/C (put/call) is 0.73.'],
    ['ja', 'P/C（プット÷コール）は1.40です。', 'P/C（プット÷コール）は0.73です。'],
    ['ko', '스퀴즈 점수(100점 만점)는 80점이다.', '스퀴즈 점수(100점 만점)는 28점이다.'],
    ['en', 'Put/call ratio (1.40) and squeeze.', 'Put/call ratio (0.73) and squeeze.'],
    ['ja', 'スクイーズスコア（80点）です。', 'スクイーズスコア（28点）です。'],
];
for (const [loc, wrong, right] of claims) test(`${loc}: ${wrong}`, () => {
    assert.equal(ucNumberProblems(loc, wrong, money).length, 1);
    assert.deepEqual(ucNumberProblems(loc, right, money), []);
});
test('same-side stale PCR, fractional scores, zero, and displayed precision', () => {
    assert.equal(ucNumberProblems('en', 'PCR: 0.79', money).length, 1);
    assert.deepEqual(ucNumberProblems('en', 'PCR: 0.7; squeeze score: 28', { ...money, squeezeScore: 28.4 }), []);
    assert.equal(ucNumberProblems('en', 'squeeze score: 80.5', money).length, 1);
    assert.deepEqual(ucNumberProblems('en', 'PCR: 0.00; squeeze score: 0', { oiPcr: 0, squeezeScore: 0 }), []);
    assert.equal(ucNumberProblems('en', 'PCR: 0.73; squeeze score: 28', { oiPcr: 0, squeezeScore: 0 }).length, 2);
});
test('volume put/call is reciprocal; explicit OI cannot match the volume ratio', () => {
    for (const [loc, text] of [
        ['ko', '옵션 포지션은 콜 쪽이 많다(풋÷콜 0.73), 전 거래일 거래량은 콜 쪽이 많다(풋÷콜 0.40).'],
        ['en', 'Open positions: more calls than puts (put/call 0.73); prior-session volume: more calls than puts (put/call 0.40).'],
        ['ja', 'オプション建玉はコールが多い（プット÷コール0.73）、前営業日の出来高はコールが多い（プット÷コール0.40）。'],
    ] as Array<[UcLocale, string]>) assert.deepEqual(ucNumberProblems(loc, text, money), []);
    assert.equal(ucNumberProblems('en', 'OI P/C 0.40', money).length, 1);
    assert.equal(ucNumberProblems('en', 'volume P/C 0.73', money).length, 1);
});
test('gate 10181910: parenthetical volume qualifier selects the volume ratio', () => {
    assert.deepEqual(ucNumberProblems('ko', 'P/C(거래량) 0.40이다.', money), []);
    assert.equal(ucNumberProblems('ko', 'P/C(거래량) 0.73이다.', money).length, 1);
    assert.deepEqual(ucNumberProblems('en', 'P/C (volume) 0.40.', money), []);
});
test('unrelated numbers, generic squeeze wording, and missing evidence stay outside numeric comparison', () => {
    for (const [loc, text] of [
        ['ko', '실적은 10월 28일, 목표가는 80달러다.'],
        ['en', 'Earnings on October 28; target $80; a squeeze may follow in 80 days.'],
        ['ja', '決算は10月28日、目標株価は80ドルです。'],
    ] as Array<[UcLocale, string]>) assert.deepEqual(ucNumberProblems(loc, text, money), []);
    assert.deepEqual(ucNumberProblems('en', 'PCR 1.4; squeeze score 80', {}), []);
    assert.deepEqual(ucNumberProblems('en', 'PCR 1.4', { oiPcr: NaN }), []);
});
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
