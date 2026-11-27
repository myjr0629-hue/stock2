import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRlsiHistoryItem } from '../scripts/ec2-guardian-dynamo.js';

const timestamp = Date.UTC(2026, 10, 27, 17, 30);

test('운영 모양 스냅샷의 기존 키와 보정용 필드를 각각 매핑한다', () => {
    const snapshot = { rlsi: {
        score: 24.36, level: 'DANGER', regime: 'BEAR', session: 'REG', zScore: -1.2,
        components: {
            momentumScore: 31.1, priceActionScore: 42, breadthScore: 53, breadthMcClellanScore: 55,
            rotationScore: 64, sentimentScore: 25, crossAssetMomentumScore: 57,
            vix: 23.4, vixTermStructure: 0.91, volatilityScore: 38, gammaScore: 46,
            liquidityScore: 49, breadthPct: 52.3, yieldRaw: 4.1, yieldPenalty: 3, vixMultiplier: 0.74,
        },
    } };
    assert.deepEqual(buildRlsiHistoryItem(snapshot, timestamp), {
        pk: 'MARKET', timestamp, rlsi: 24.4, regime: 'DANGER', session: 'REG', zScore: -1.2,
        momentum: 31.1, participation: 42, priceTrend: 53, rotation: 64, sentiment: 25,
        crossAssetMomentumScore: 57, vix: 23.4, vixTermStructure: 0.91,
        volatilityScore: 38, gammaScore: 46, liquidityScore: 49, breadthScore: 53,
        breadthPct: 52.3, yieldRaw: 4.1, yieldPenalty: 3, vixMultiplier: 0.74,
    });
});

test('실제 0은 대체 점수보다 우선하며 결측과 비수치는 생략한다', () => {
    const snapshot = { rlsi: {
        score: 0, zScore: 0, session: null,
        components: {
            momentumScore: 0, crossAssetMomentumScore: 71, breadthScore: 0, breadthMcClellanScore: 62,
            priceActionScore: 0, rotationScore: 0, sentimentScore: 0, yieldPenalty: 0,
            liquidityScore: null, vix: '20', gammaScore: NaN, volatilityScore: Infinity, breadthPct: false,
        },
    } };
    assert.deepEqual(buildRlsiHistoryItem(snapshot, timestamp), {
        pk: 'MARKET', timestamp, rlsi: 0, regime: 'NEUTRAL', zScore: 0,
        momentum: 0, participation: 0, priceTrend: 0, rotation: 0, sentiment: 0,
        breadthScore: 0, crossAssetMomentumScore: 71, yieldPenalty: 0,
    });
});

test('기본 점수가 없으면 harvest-history의 대체 점수를 쓴다', () => {
    const snapshot = { rlsi: { score: 50, components: {
        crossAssetMomentumScore: 63, breadthMcClellanScore: 0,
    } } };
    assert.deepEqual(buildRlsiHistoryItem(snapshot, timestamp), {
        pk: 'MARKET', timestamp, rlsi: 50, regime: 'NEUTRAL',
        momentum: 63, priceTrend: 0, crossAssetMomentumScore: 63,
    });
});

test('성분 객체가 없는 이전 스냅샷은 기본 필드만 기록한다', () => {
    for (const components of [null, undefined]) {
        assert.deepEqual(buildRlsiHistoryItem({ rlsi: { score: 55, components } }, timestamp), {
            pk: 'MARKET', timestamp, rlsi: 55, regime: 'NEUTRAL',
        });
    }
});

test('필수 종합 점수가 유한한 숫자가 아니면 이력 행을 만들지 않는다', () => {
    for (const score of [null, undefined, '0', NaN, Infinity]) {
        assert.throws(() => buildRlsiHistoryItem({ rlsi: { score } }, timestamp), TypeError);
    }
});
