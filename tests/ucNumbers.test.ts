/**
 * UC 카드 문구 «배수·가격대 거리/방향 = 카드 자금 숫자» — src/lib/ai/ucNumbers.ts · shared.enforceLean(생성·캐시 출구 공통)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/ucNumbers.test.ts
 * 출발점(2026-10-04 운영 /api/undercurrent/feed 실측): en AAPL «$4 below max pain»(실제 $3.69 위) · ko COIN «5.9배»(5.75) · ko PLTR «2.9배»(2.97)
 *   · 재측정 en AMZN «$4 below the call wall at $260»(실제 $8.48 아래)
 */
import assert from 'node:assert/strict';
import { ucNumberProblems } from '@/lib/ai/ucNumbers';
import { enforceLean } from '@/app/api/undercurrent/shared';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
// 운영 카드 money(10/4 08:5x KST)
const M: Record<string, any> = {
    TSLA: { price: 370.59, maxPain: 355, callWall: 375, putFloor: 350, volumePcr: 1.73, oiPcr: 0.92 },
    INTC: { price: 119.33, maxPain: 110, callWall: 130, putFloor: 110, volumePcr: 2.16, oiPcr: 0.93 },
    AMZN: { price: 251.52, maxPain: 247.5, callWall: 260, putFloor: 240, volumePcr: 2.22, oiPcr: 0.6 },
    COIN: { price: 183, maxPain: 190, callWall: 200, putFloor: 170, volumePcr: 5.75, oiPcr: 1.86 },
    DIS: { price: 102.19, maxPain: 105, callWall: 110, putFloor: 100, volumePcr: 2.72, oiPcr: 0.59 },
    META: { price: 728.08, maxPain: 720, callWall: 750, putFloor: 645, volumePcr: 2.03, oiPcr: 0.75 },
    MU: { price: 1074.89, maxPain: 1015, callWall: 1200, putFloor: 900, volumePcr: 1.36, oiPcr: 1.15 },
    PLTR: { price: 188.75, maxPain: 185, callWall: 200, putFloor: 170, volumePcr: 2.97, oiPcr: 1.22 },
    GS: { price: 902.56, maxPain: 935, callWall: 930, putFloor: 860, volumePcr: 1.37, oiPcr: 1.15 },
    NVDA: { price: 233.95, maxPain: 227.5, callWall: 235, putFloor: 220, volumePcr: 1.42, oiPcr: 1.25 },
    AAPL: { price: 333.69, maxPain: 330, callWall: 340, putFloor: 330, volumePcr: 1.93, oiPcr: 0.78 },
    JPM: { price: 332.38, maxPain: 340, callWall: 355, putFloor: 330, volumePcr: 3.42, oiPcr: 0.83 },
};
const KO_OK: Array<[string, string]> = [
    ['TSLA', '목요일 약 3억 달러 규모의 새 풋 포지션이 열렸으나, 같은 날 거래량 기준으로는 콜이 풋의 1.7배 많아 의견이 엇갈리고 있다.'],
    ['INTC', '거래량 기준 콜이 풋의 2.2배로 강한 상승 쏠림을 보이고 있다.'],
    ['DIS', '거래량 기준 콜이 풋의 2.7배로 상승 쏠림을 보이고 있다.'],
    ['META', '거래량 기준 콜이 풋의 2배 이상으로 상승 기대감을 반영하고 있다.'],
    ['MU', '거래량 기준 콜이 풋의 1.4배로 상승 쏠림을 보이나, 기존 포지션 기준으로는 콜과 풋이 비슷하다.'],
    ['NVDA', '거래량 기준 콜이 풋의 1.4배로 상승 쏠림을 보이나, 기존 포지션 기준으로는 풋이 콜의 1.25배 많다.'],
    ['AAPL', '거래량 기준 콜이 풋의 1.9배로 상승 쏠림을 보이고 있다.'],
    ['COIN', '거래량 기준 콜이 풋의 약 6배로 쏠렸다.'],  // 정수 반올림 표기
    ['PLTR', '거래량 기준 콜이 풋의 3.0배, 기존 포지션 기준으로는 풋이 콜의 1.22배 많다.'],
];
const EN_OK: Array<[string, string]> = [
    ['TSLA', 'On Thursday, $272M in new put positions opened, signaling defensive hedging despite the stock sitting $15 above max pain.'],
    ['INTC', 'call-heavy flow dominated, but the stock sits $9 above max pain with low squeeze pressure.'],
    ['MU', 'standing positions are balanced and the stock sits $60 above max pain.'],
    ['GS', 'but the stock sits $33 below max pain and balanced standing positions suggest hedging.'],
    ['JPM', 'and the stock sits $8 below max pain, showing traders are betting on a relief rally.'],
    ['AMZN', 'and the stock sits $8 below the call wall at $260, showing aggressive upside positioning.'],
    ['AAPL', 'calls outnumber puts nearly 2 to 1 and the stock sits about 1.1% above max pain.'],
];

t('운영 ko 배수 문장 — 맞는 9건(반올림·«이상»·정수 표기 포함)은 통과', () => {
    for (const [tk, s] of KO_OK) assert.deepEqual(ucNumberProblems('ko', s, M[tk]), [], `${tk}: ${s}`);
});
t('운영 ko COIN «5.9배»(5.75)·PLTR «2.9배»(2.97)는 걸리고, 같은 문장의 «풋이 콜의 1.86배/1.22배»는 통과', () => {
    const coin = ucNumberProblems('ko', '거래량 기준 콜이 풋의 5.9배로 매우 강한 상승 쏠림을 보이나, 기존 포지션 기준으로는 풋이 콜의 1.86배 많아 방어 태세를 유지하고 있다.', M.COIN);
    assert.equal(coin.length, 1, coin.join(' | '));
    assert.ok(coin[0].startsWith('multiplier:call/put 5.9'));
    const pltr = ucNumberProblems('ko', '거래량 기준 콜이 풋의 2.9배로 강한 상승 쏠림을 보이나, 기존 포지션 기준으로는 풋이 콜의 1.22배 많다.', M.PLTR);
    assert.equal(pltr.length, 1, pltr.join(' | '));
});
t('운영 en 가격대 문장 — 맞는 7건은 통과', () => {
    for (const [tk, s] of EN_OK) assert.deepEqual(ucNumberProblems('en', s, M[tk]), [], `${tk}: ${s}`);
});
t('운영 en AAPL «$4 below max pain»(실제 $3.69 위)·AMZN «$4 below the call wall at $260»(실제 $8.48)·틀린 수준 값은 걸린다', () => {
    const a = ucNumberProblems('en', 'On Thursday, $373M in new call positions opened with call-heavy flow, and the stock sits $4 below max pain, showing traders are betting on a rally.', M.AAPL);
    assert.equal(a.length, 1); assert.ok(a[0].startsWith('direction:maxPain'), a[0]);
    const z = ucNumberProblems('en', 'and the stock sits $4 below the call wall at $260, showing aggressive upside positioning.', M.AMZN);
    assert.equal(z.length, 1); assert.ok(z[0].startsWith('distance:callWall'), z[0]);
    assert.equal(ucNumberProblems('en', 'the stock sits $8 below the call wall at $270', M.AMZN).length, 1);
});
t('ko·ja 가격대 문장 — 방향·거리', () => {
    assert.deepEqual(ucNumberProblems('ko', '주가는 최대 고통 가격보다 약 4달러 높다.', M.AAPL), []);
    assert.equal(ucNumberProblems('ko', '주가는 최대 고통 가격보다 약 4달러 낮다.', M.AAPL).length, 1);
    assert.deepEqual(ucNumberProblems('ja', '株価はマックスペインより約4ドル上にある。', M.AAPL), []);
    assert.equal(ucNumberProblems('ja', '株価はマックスペインより約4ドル下にある。', M.AAPL).length, 1);
    assert.deepEqual(ucNumberProblems('ko', '맥스페인이 주가보다 4달러 아래에 있다.', M.AAPL), []); // 주어가 거꾸로인 문장은 판정 안 함
});
t('ja 괄호 비율(0.17)·숫자 없는 문장·money 없음은 판정하지 않는다', () => {
    assert.deepEqual(ucNumberProblems('ja', '取引量でもコール圧倒的優位（0.17）だが、建玉ではプットが多く（1.86）。', M.COIN), []);
    assert.deepEqual(ucNumberProblems('en', 'call-heavy flow dominated', M.INTC), []);
    assert.deepEqual(ucNumberProblems('en', 'the stock sits $4 below max pain', null), []);
});
t('enforceLean(생성·캐시 출구 공통) — 숫자가 틀린 moneyRead 는 사실 문장으로, 맞는 카드는 그대로', () => {
    const cards: any[] = [
        { ticker: 'AAPL', money: M.AAPL, moneyRead: 'On Thursday, $373M in new call positions opened, and the stock sits $4 below max pain.' },
        { ticker: 'TSLA', money: M.TSLA, moneyRead: EN_OK[0][1] },
    ];
    const fixed = enforceLean('en', cards);
    assert.equal(fixed, 1);
    assert.ok(!cards[0].moneyRead.includes('$4 below'), cards[0].moneyRead);
    assert.ok(/put\/call/.test(cards[0].moneyRead), cards[0].moneyRead);
    assert.equal(cards[1].moneyRead, EN_OK[0][1]);
    const ko: any[] = [{ ticker: 'COIN', money: { ...M.COIN, newOiNotional: 4.1e8, newOiSide: 'call', optionsDate: '2026-10-01' }, moneyRead: '목요일 약 4억 달러 규모의 새 콜 포지션이 열렸고, 거래량 기준 콜이 풋의 5.9배로 매우 강한 상승 쏠림을 보인다.' }];
    assert.equal(enforceLean('ko', ko), 1);
    assert.ok(!ko[0].moneyRead.includes('5.9배') && ko[0].moneyRead.includes('풋÷콜'), ko[0].moneyRead);
});
console.log(`\n${n} passed`);
