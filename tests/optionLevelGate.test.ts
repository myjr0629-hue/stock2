/**
 * 옵션 레벨 «정의 게이트»·«구조 한 벌» 시험 — src/lib/optionLevelGate.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/optionLevelGate.test.ts
 *
 * 2026-09-28 운영 watchlist/batch?mode=price 실측이 출발점이다:
 *   MU 현재가 1038.87 에 콜월 1000(현재가 아래)·풋플로어 60·감마플립 530, TSLA 풋플로어 200·감마플립 280.
 *   값의 출처는 DynamoDB signum-gex-history(수집 Lambda) — 벽 = 체인 전체 최대 OI(가격 범위 없음),
 *   감마플립 = (콜월+풋플로어)/2. 정의: 콜월 (S, 1.2S] · 풋플로어 [0.8S, S) · 감마플립 |K−S| ≤ 0.15S · 맥스페인 |K−S| ≤ 0.35S.
 */
import assert from 'node:assert/strict';
import {
    levelViolations, gateLevels, displayLevels, levelsFromStructure,
    applyLevelsToRealtime, applyLevelsToUnified, NO_LEVELS, STRUCTURE_PRODUCER, type OptionLevels,
} from '../src/lib/optionLevelGate';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const sorted = (xs: string[]) => [...xs].sort();

console.log('━━━ 1. 9/28 운영 실측값 — 정의 위반을 잡는가 ━━━');
t('MU S=1038.87: 콜월 1000(현재가 아래)·풋플로어 60·감마플립 530 → 셋 다 위반, 맥스페인 955 는 통과', () => {
    assert.deepEqual(sorted(levelViolations({ callWall: 1000, putFloor: 60, gammaFlipLevel: 530, maxPain: 955 }, 1038.87)),
        ['callWall', 'gammaFlipLevel', 'putFloor']);
});
t('TSLA S=357.45: 풋플로어 200·감마플립 280 위반, 콜월 400 통과', () => {
    assert.deepEqual(sorted(levelViolations({ callWall: 400, putFloor: 200, gammaFlipLevel: 280, maxPain: 370 }, 357.45)),
        ['gammaFlipLevel', 'putFloor']);
});
t('TSLA 감마플립 300(=벽 중간값) 도 ±15% 밖(16.1%) → 위반', () => {
    assert.deepEqual(levelViolations({ gammaFlipLevel: 300 }, 357.45), ['gammaFlipLevel']);
});
t('NVDA S=228.86: 콜월 220 은 현재가 아래 → 위반', () => {
    assert.deepEqual(levelViolations({ callWall: 220, putFloor: 200, gammaFlipLevel: 210, maxPain: 215 }, 228.86), ['callWall']);
});
t('AAPL S=338.4: 벽 중간값 337.5 는 우연히 ±15% 안 — 게이트로는 못 잡는다(그래서 «한 벌» 규칙이 따로 필요하다)', () => {
    assert.deepEqual(levelViolations({ callWall: 345, putFloor: 330, gammaFlipLevel: 337.5, maxPain: 330 }, 338.4), []);
});

console.log('━━━ 2. 경계 — 계산 코드(structureService)와 같은 부등호 ━━━');
const S = 100;
t('콜월 = 1.2S 는 통과, = S 는 위반, 1.2S 보다 조금 크면 위반', () => {
    assert.deepEqual(levelViolations({ callWall: 120 }, S), []);
    assert.deepEqual(levelViolations({ callWall: 100 }, S), ['callWall']);
    assert.deepEqual(levelViolations({ callWall: 120.01 }, S), ['callWall']);
});
t('부동소수 경계: S=338.4 에서 1.2S = 406.08 은 통과', () => {
    assert.deepEqual(levelViolations({ callWall: 338.4 * 1.2 }, 338.4), []);
    assert.deepEqual(levelViolations({ callWall: 406.08 }, 338.4), []);
});
t('풋플로어 = 0.8S 는 통과, = S 는 위반, 0.8S 보다 조금 작으면 위반', () => {
    assert.deepEqual(levelViolations({ putFloor: 80 }, S), []);
    assert.deepEqual(levelViolations({ putFloor: 100 }, S), ['putFloor']);
    assert.deepEqual(levelViolations({ putFloor: 79.99 }, S), ['putFloor']);
});
t('감마플립 ±15% 는 통과, 그 밖은 위반(위·아래 모두)', () => {
    assert.deepEqual(levelViolations({ gammaFlipLevel: 115 }, S), []);
    assert.deepEqual(levelViolations({ gammaFlipLevel: 85 }, S), []);
    assert.deepEqual(levelViolations({ gammaFlipLevel: 115.01 }, S), ['gammaFlipLevel']);
    assert.deepEqual(levelViolations({ gammaFlipLevel: 84.99 }, S), ['gammaFlipLevel']);
});
t('맥스페인 ±35%(sanitizeMaxPain 과 같다)', () => {
    assert.deepEqual(levelViolations({ maxPain: 135 }, S), []);
    assert.deepEqual(levelViolations({ maxPain: 65 }, S), []);
    assert.deepEqual(levelViolations({ maxPain: 135.01 }, S), ['maxPain']);
    assert.deepEqual(levelViolations({ maxPain: 64.99 }, S), ['maxPain']);
});
t('기준 현물이 없으면 판단하지 않는다(null·0·NaN)', () => {
    for (const s of [null, undefined, 0, -1, NaN]) assert.deepEqual(levelViolations({ callWall: 1, putFloor: 999 }, s as any), []);
});
t('0 이하·숫자 아님·null 은 «없음»이지 위반이 아니다', () => {
    assert.deepEqual(levelViolations({ callWall: 0, putFloor: null, gammaFlipLevel: -5, maxPain: 'x' as any }, S), []);
});

console.log('━━━ 3. gateLevels — 위반 필드만 null, 핀존은 맥스페인을 따른다 ━━━');
t('MU: 벽·플립만 지우고 맥스페인·핀존은 남긴다, levelsDropped 에 이유', () => {
    const g = gateLevels({ maxPain: 955, pinZone: 955, callWall: 1000, putFloor: 60, gammaFlipLevel: 530 }, 1038.87);
    assert.equal(g.maxPain, 955); assert.equal(g.pinZone, 955);
    assert.equal(g.callWall, null); assert.equal(g.putFloor, null); assert.equal(g.gammaFlipLevel, null);
    assert.deepEqual(sorted(g.levelsDropped!), ['callWall', 'gammaFlipLevel', 'putFloor']);
});
t('맥스페인이 지워지면 핀존도 null', () => {
    const g = gateLevels({ maxPain: 200, pinZone: 200 }, 100);
    assert.equal(g.maxPain, null); assert.equal(g.pinZone, null);
});
t('여러 기준(계산 현물 S0 → 화면 현물)의 위반을 모두 모은다', () => {
    // S0=100 에서 콜월 110 은 정상, 화면 현물 111 에서는 현재가 아래 → 지운다
    const g = gateLevels({ callWall: 110, putFloor: 90 }, 100, 111);
    assert.equal(g.callWall, null); assert.equal(g.putFloor, 90);
    assert.deepEqual(g.levelsDropped, ['callWall']);
});
t('위반이 없으면 levelsDropped 키 자체가 없다', () => {
    const g = gateLevels({ callWall: 110, putFloor: 90 }, 100);
    assert.equal('levelsDropped' in g, false);
});
t('0 은 null 로 정규화(0 은 «0 달러»라는 주장이 된다)', () => {
    const g = gateLevels({ callWall: 0, putFloor: 0, maxPain: 0, pinZone: 0, gammaFlipLevel: 0 }, 100);
    assert.equal(g.callWall, null); assert.equal(g.putFloor, null); assert.equal(g.maxPain, null); assert.equal(g.pinZone, null); assert.equal(g.gammaFlipLevel, null);
});

console.log('━━━ 4. 구조 한 벌 — 없으면 전부 null, 다른 생산자의 값을 남기지 않는다 ━━━');
const lvMU: OptionLevels = {
    maxPain: 970, callWall: 1100, putFloor: 900, pinZone: 970, gammaFlipLevel: 1010,
    levelsExpiration: '2026-10-02', levelsChainDate: '2026-09-25', levelsSource: 'structure', levelsAsOf: 1, levelsSpot: 1038.87,
};
t('displayLevels(null) = NO_LEVELS(출처도 null) — 새 객체', () => {
    const d = displayLevels(null, 100);
    assert.deepEqual(d, { ...NO_LEVELS });
    assert.notEqual(d, NO_LEVELS);
});
t('displayLevels: 구조 값은 계산 현물과 화면 현물 둘 다 통과해야 남는다', () => {
    assert.equal(displayLevels(lvMU, 1038.87).callWall, 1100);
    // 화면 현물이 1100 을 넘으면 콜월은 더 이상 «위의 벽»이 아니다
    const moved = displayLevels(lvMU, 1105);
    assert.equal(moved.callWall, null); assert.equal(moved.putFloor, 900);
    assert.deepEqual(moved.levelsDropped, ['callWall']);
});
t('levelsFromStructure: OK 가 아니면 null', () => {
    assert.equal(levelsFromStructure({ options_status: 'PENDING', maxPain: 1 }), null);
    assert.equal(levelsFromStructure(null), null);
});
t('levelsFromStructure: 깨진 구조(수집 Lambda 모양의 벽)가 들어와도 자기 현물로 걸러진다', () => {
    const lv = levelsFromStructure({ options_status: 'OK', underlyingPrice: 1038.87, maxPain: 955, levels: { callWall: 1000, putFloor: 60 }, gammaFlipLevel: 530, expiration: '2026-10-02' })!;
    assert.equal(lv.maxPain, 955); assert.equal(lv.callWall, null); assert.equal(lv.putFloor, null); assert.equal(lv.gammaFlipLevel, null);
    assert.equal(lv.levelsSpot, 1038.87); assert.equal(lv.levelsSource, 'structure');
});
t('levelsFromStructure: 맥스페인 35% 밖은 null(예전 sanitizeMaxPain 과 같은 결과)', () => {
    const lv = levelsFromStructure({ options_status: 'OK', underlyingPrice: 100, maxPain: 60, levels: { callWall: 110, putFloor: 95 } })!;
    assert.equal(lv.maxPain, null); assert.equal(lv.pinZone, null); assert.equal(lv.callWall, 110);
});

console.log('━━━ 5. 배치 행(realtime) — 9/28 MU 가 다시 나갈 수 없는가 ━━━');
t('구조 저장본이 없으면 분석 캐시·AWS 폴백의 값이 전부 지워진다', () => {
    const rt: any = { price: 1038.87, maxPain: 955, maxPainDist: -8.07, callWall: 1000, putFloor: 60, gammaFlipLevel: 530 };
    applyLevelsToRealtime(rt, undefined);
    assert.equal(rt.maxPain, null); assert.equal(rt.maxPainDist, null); assert.equal(rt.callWall, null);
    assert.equal(rt.putFloor, null); assert.equal(rt.gammaFlipLevel, null); assert.equal(rt.levelsSource, null);
});
t('구조가 있으면 그 한 벌 + maxPainDist 는 시간외 가격 기준(예전 규칙 그대로)', () => {
    const rt: any = { price: 1038.87, extendedPrice: 1053.98, callWall: 1000, putFloor: 60 };
    applyLevelsToRealtime(rt, lvMU);
    assert.equal(rt.callWall, 1100); assert.equal(rt.putFloor, 900); assert.equal(rt.gammaFlipLevel, 1010); assert.equal(rt.maxPain, 970);
    assert.equal(rt.maxPainDist, Number((((970 - 1053.98) / 1053.98) * 100).toFixed(2)));
    assert.equal(rt.levelsSource, 'structure'); assert.equal('levelsDropped' in rt, false);
});
t('portfolio 모양(extPrice)도 같은 기준', () => {
    const rt: any = { price: 1038.87, extPrice: 1105 };
    applyLevelsToRealtime(rt, lvMU);
    assert.equal(rt.callWall, null); assert.deepEqual(rt.levelsDropped, ['callWall']);
});
t('다시 덮을 때 이전 levelsDropped 가 남지 않는다', () => {
    const rt: any = { price: 1038.87, levelsDropped: ['callWall'] };
    applyLevelsToRealtime(rt, lvMU);
    assert.equal('levelsDropped' in rt, false);
});

console.log('━━━ 6. command/unified 모양 — 가짜 구조(DynamoDB·분석 캐시)는 표식이 없다 ━━━');
const fakeStructure = { options_status: 'OK', maxPain: 955, levels: { callWall: 1000, putFloor: 60, pinZone: 955 }, gammaFlipLevel: 530, validation: { confidence: 'HIGH', source: 'dynamodb-gex' } };
t('저장본이 없고 구조가 가짜면 레벨 전부 null · 감마플립(volatility.flipLevel)도', () => {
    const out = applyLevelsToUnified({ structure: fakeStructure, volatility: { flipLevel: 530 } }, null);
    assert.equal(out.structure.maxPain, null); assert.equal(out.structure.levels.callWall, null);
    assert.equal(out.structure.levels.putFloor, null); assert.equal(out.structure.gammaFlipLevel, null);
    assert.equal(out.volatility.flipLevel, null); assert.equal(out.structure.levelsSource, null);
    assert.equal(out.structure.validation.source, 'dynamodb-gex');   // 다른 필드는 건드리지 않는다
});
t('저장본이 없어도 이 요청이 만든 «진짜» 구조(표식)면 그 값을 쓴다', () => {
    const own = { levelsProducer: STRUCTURE_PRODUCER, options_status: 'OK', underlyingPrice: 1038.87, maxPain: 970, levels: { callWall: 1100, putFloor: 900, pinZone: 970 }, gammaFlipLevel: 1010, expiration: '2026-10-02' };
    const out = applyLevelsToUnified({ structure: own }, null);
    assert.equal(out.structure.levels.callWall, 1100); assert.equal(out.structure.levelsSource, 'structure');
});
t('저장본이 있으면 그 한 벌(표식 무관), 원본 객체는 바꾸지 않는다', () => {
    const data = { structure: fakeStructure };
    const out = applyLevelsToUnified(data, lvMU);
    assert.equal(out.structure.levels.callWall, 1100); assert.equal(out.structure.expiration, '2026-10-02');
    assert.equal(fakeStructure.levels.callWall, 1000);
});
t('structure 가 없으면 페이로드를 그대로 돌려준다', () => {
    const data = { structure: null, x: 1 };
    assert.equal(applyLevelsToUnified(data, lvMU), data);
});

console.log(`\n✅ ${n}개 통과`);
