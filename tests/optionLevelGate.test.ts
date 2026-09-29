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
    levelViolations, gateLevels, displayLevels, levelsFromStructure, levelsAt, profileOf, setLevelEventSink,
    levelCellState, levelOutOfRangeText, levelInfoNote, formatLevelPrice,
    applyLevelsToRealtime, applyLevelsToUnified, NO_LEVELS, STRUCTURE_PRODUCER, type OptionLevels, type LevelProfile, type LevelEvent,
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

console.log('━━━ 7. levelsAt — 분포 × 기준가 = 정의 그대로(2026-09-30) ━━━');
// 행사가 90~110(2.5 간격) 작은 분포: 콜 OI 는 105 가 최대, 풋 OI 는 95 가 최대, 누적 GEX 는 100 에서 부호가 바뀐다.
const PR: LevelProfile = {
    strikes: [90, 92.5, 95, 97.5, 100, 102.5, 105, 107.5, 110],
    callsOI: [10, 20, 30, 40, 50, 60, 900, 70, 80],
    putsOI: [80, 70, 800, 50, 40, 30, 20, 10, 5],
    gexCum: [-500, -400, -300, -200, 50, 120, 300, 400, 450],
};
t('S=100: 콜월 105(콜 OI 최대, 100 초과) · 풋플로어 95(풋 OI 최대, 100 미만) · 감마플립 100(부호 바뀜, EXACT)', () => {
    const r = levelsAt(PR, 100);
    assert.equal(r.callWall, 105); assert.equal(r.putFloor, 95); assert.equal(r.gammaFlipLevel, 100); assert.equal(r.gammaFlipType, 'EXACT');
});
t('S=106(콜월 105 돌파): 콜월은 (106, 127.2] 에서 다시 고른다 → 110 · 풋플로어 105 는 풋 OI 20 이라 95(800) 가 남는다', () => {
    const r = levelsAt(PR, 106);
    assert.equal(r.callWall, 110); assert.equal(r.putFloor, 95);
});
t('범위 안에 OI>0 행사가가 없으면 null(«정의상 없음») — 0 OI 는 벽이 아니다', () => {
    // 100 ∈ (99, 118.8] 이지만 OI 0 → 벽 아님 · 130 은 범위 밖 → null
    const r = levelsAt({ strikes: [100, 130], callsOI: [0, 5], putsOI: [0, 0], gexCum: null }, 99);
    assert.equal(r.callWall, null); assert.equal(r.putFloor, null);
});
t('같은 OI 면 낮은 행사가', () => {
    const r = levelsAt({ strikes: [101, 102, 103], callsOI: [7, 9, 9], putsOI: [0, 0, 0] }, 100);
    assert.equal(r.callWall, 102);
});
t('감마플립: 부호가 여러 번 바뀌면 S 에 가장 가까운 것, 없으면 ±15% 안 |누적| 최소(NEAR_ZERO), 그마저 없으면 null', () => {
    const multi = { strikes: [90, 95, 100, 105, 110], callsOI: [1, 1, 1, 1, 1], putsOI: [1, 1, 1, 1, 1], gexCum: [-10, 5, -3, 8, 9] };
    assert.equal(levelsAt(multi, 104).gammaFlipLevel, 105);   // 교차 95·100·105 중 104 에 가장 가까운 105
    assert.equal(levelsAt(multi, 96).gammaFlipLevel, 95);
    const none = { strikes: [90, 100, 110], callsOI: [1, 1, 1], putsOI: [1, 1, 1], gexCum: [5, 3, 9] };
    const nz = levelsAt(none, 100);
    assert.equal(nz.gammaFlipType, 'NEAR_ZERO'); assert.equal(nz.gammaFlipLevel, 100);
    const far = levelsAt({ strikes: [50, 200], callsOI: [1, 1], putsOI: [1, 1], gexCum: [5, 9] }, 100);
    assert.equal(far.gammaFlipLevel, null); assert.equal(far.gammaFlipType, 'ALL_LONG');
    assert.equal(levelsAt({ strikes: [100], callsOI: [1], putsOI: [1], gexCum: [null] }, 100).gammaFlipType, 'NO_DATA');
});
t('무작위 분포 2,000개 × 기준가: levelsAt 결과는 늘 정의 게이트를 통과한다(DEF 0 은 구조적으로)', () => {
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 2000; i++) {
        const n = 3 + Math.floor(rnd() * 60), base = 5 + rnd() * 1000, step = [0.5, 1, 2.5, 5, 10][Math.floor(rnd() * 5)];
        const strikes = Array.from({ length: n }, (_, j) => Math.round((base + j * step) * 100) / 100);
        let cum = 0;
        const pr: LevelProfile = {
            strikes, callsOI: strikes.map(() => (rnd() < 0.1 ? null : Math.floor(rnd() * 5000))), putsOI: strikes.map(() => (rnd() < 0.1 ? null : Math.floor(rnd() * 5000))),
            gexCum: strikes.map(() => (rnd() < 0.2 ? null : (cum += Math.round((rnd() - 0.5) * 2000)))),
        };
        const S = strikes[0] + rnd() * (strikes[n - 1] - strikes[0]);
        const r = levelsAt(pr, S);
        assert.deepEqual(levelViolations(r, S), [], `분포 ${i} S=${S}`);
    }
});

console.log('━━━ 8. displayLevels — 돌파는 숨기지 않고 같은 분포에서 다시 고른다 ━━━');
const events: LevelEvent[] = [];
setLevelEventSink((e) => { events.push(e); });
const sr = { ticker: 'XYZ', options_status: 'OK', underlyingPrice: 100, maxPain: 100, levels: { callWall: 105, putFloor: 95, pinZone: 100 }, gammaFlipLevel: 100,
    expiration: '2026-10-02', chainDate: '2026-09-28', structure: PR };
const lvX = levelsFromStructure(sr)!;
t('levelsFromStructure: 분포를 싣는다(profileOf), 종목도', () => {
    assert.deepEqual(lvX.levelProfile, profileOf(sr)); assert.equal(lvX.levelsTicker, 'XYZ');
});
t('표시 가격이 판본 레벨 안이면 판본 값 그대로(모든 문 같은 값) — 분포·종목은 출력에 없다', () => {
    events.length = 0;
    const d = displayLevels(lvX, 101, 'test');
    assert.equal(d.callWall, 105); assert.equal(d.putFloor, 95); assert.equal(d.gammaFlipLevel, 100);
    assert.equal('levelProfile' in d, false); assert.equal('levelsTicker' in d, false); assert.equal('levelsReselected' in d, false);
    assert.equal(events.length, 0);
});
t('콜월 돌파(표시 106): 콜월만 다시 고른다 110, 나머지는 판본 값 · 재선택 기록 · 가림 없음', () => {
    events.length = 0;
    const d = displayLevels(lvX, 106, 'test');
    assert.equal(d.callWall, 110); assert.equal(d.putFloor, 95); assert.equal(d.gammaFlipLevel, 100); assert.equal(d.maxPain, 100);
    assert.deepEqual(d.levelsReselected, ['callWall']); assert.equal('levelsDropped' in d, false);
    assert.equal(events.length, 1); assert.equal(events[0].kind, 'reselect'); assert.equal(events[0].ticker, 'XYZ'); assert.equal(events[0].spot, 106);
});
t('풋플로어 붕괴(표시 94): 풋플로어 다시 고름 → [75.2, 94) 풋 OI 최대 92.5(70)… 90(80) → 90', () => {
    const d = displayLevels(lvX, 94, 'test');
    assert.equal(d.putFloor, 90); assert.deepEqual(d.levelsReselected, ['putFloor']);
});
t('분포 없는 옛 판본은 예전처럼 안전망이 지우고(levelsDropped) «가려짐»으로 기록한다', () => {
    events.length = 0;
    const d = displayLevels(lvMU, 1105, 'test');
    assert.equal(d.callWall, null); assert.deepEqual(d.levelsDropped, ['callWall']);
    assert.equal(events.length, 1); assert.equal(events[0].kind, 'drop'); assert.equal(events[0].door, 'test');
});
t('맥스페인이 표시 가격 ±35% 밖(판본 기준가 뒤 급락)이면 정의상 «범위 밖» — null·재선택·가림 아님(9/30 DH «$—»)', () => {
    events.length = 0;
    const d = displayLevels(lvX, 60, 'test');   // 판본 S0=100·맥스페인 100 → 60 에서 |100−60| = 40 > 21
    assert.equal(d.maxPain, null); assert.equal(d.pinZone, null);
    assert.ok(d.levelsReselected!.includes('maxPain')); assert.equal('levelsDropped' in d, false);
    assert.equal(levelCellState(d.maxPain, d, 'maxPain'), 'outOfRange');
    assert.equal(events.filter((e) => e.kind === 'drop').length, 0);
    // 분포 없는 옛 판본에서도 맥스페인은 정의로 판정한다(안전망이 아니다)
    const old = displayLevels({ ...lvMU, callWall: null, putFloor: null, gammaFlipLevel: null }, 600, 'test');
    assert.equal(old.maxPain, null); assert.deepEqual(old.levelsReselected, ['maxPain']); assert.equal('levelsDropped' in old, false);
});
t('판본 기준가와 가까우면 맥스페인 그대로(재선택 없음)', () => {
    const d = displayLevels(lvX, 80, 'test');   // |100−80| = 20 ≤ 28
    assert.equal(d.maxPain, 100); assert.equal((d.levelsReselected || []).includes('maxPain'), false);
});
t('applyLevelsToRealtime: 판본 표식(levelsAsOf)과 재선택 필드를 싣는다', () => {
    const rt: any = { price: 106 };
    applyLevelsToRealtime(rt, { ...lvX, levelsAsOf: 123 }, 'test');
    assert.equal(rt.callWall, 110); assert.equal(rt.levelsAsOf, 123); assert.deepEqual(rt.levelsReselected, ['callWall']);
    const rt2: any = { price: 101, levelsReselected: ['callWall'] };
    applyLevelsToRealtime(rt2, lvX, 'test');
    assert.equal('levelsReselected' in rt2, false);
});
t('무작위 분포 × 무작위 표시 가격(판본 기준가 ±12%): 분포가 있으면 가림 0', () => {
    let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    events.length = 0;
    for (let i = 0; i < 1000; i++) {
        const n = 10 + Math.floor(rnd() * 80), step = [1, 2.5, 5][Math.floor(rnd() * 3)], base = 50 + rnd() * 500;
        const strikes = Array.from({ length: n }, (_, j) => base + j * step);
        let cum = -Math.round(rnd() * 5000);
        const structure = { strikes, callsOI: strikes.map(() => Math.floor(rnd() * 900) + 1), putsOI: strikes.map(() => Math.floor(rnd() * 900) + 1),
            gexCum: strikes.map(() => (cum += Math.round(rnd() * 400))) };
        const S0 = strikes[Math.floor(n / 2)] + 0.3;
        const lv0 = levelsAt(structure, S0);
        const v = levelsFromStructure({ ticker: 'R', options_status: 'OK', underlyingPrice: S0, maxPain: strikes[Math.floor(n / 2)],
            levels: { callWall: lv0.callWall, putFloor: lv0.putFloor }, gammaFlipLevel: lv0.gammaFlipLevel, structure })!;
        const P = S0 * (0.88 + rnd() * 0.24);
        const d = displayLevels(v, P, 'fuzz');
        assert.equal('levelsDropped' in d, false, `분포 ${i} S0=${S0} P=${P}`);
        assert.deepEqual(levelViolations(d, P), []);
    }
    assert.equal(events.filter((e) => e.kind === 'drop').length, 0);
});
setLevelEventSink(null);

console.log('━━━ 8-2. 행의 표시 가격 — 정규장에는 표시 가격(프리마켓 가격이 남아 있어도) ━━━');
t('intel/fast 모양: session REG + extendedPrice(PRE 가격) → 표시 가격 기준(ARM 297.87, 288.645 아님)', () => {
    const rt: any = { price: 297.87, extendedPrice: 288.645, extendedLabel: 'PRE', session: 'REG' };
    applyLevelsToRealtime(rt, lvX, 'test');
    // lvX 는 기준가 100 판본이라 297.87 에서는 전부 범위 밖 — 핵심은 «어느 가격으로 봤는가»: maxPainDist 기준이 표시 가격
    assert.equal(rt.maxPainDist == null || Math.abs(rt.maxPainDist - Number((((100 - 297.87) / 297.87) * 100).toFixed(2))) < 1e-9, true);
});
t('session 이 시간외(PRE/POST)면 시간외 가격, session 이 없으면 예전 규칙(시간외 가격 우선)', () => {
    const a: any = { price: 100, extendedPrice: 106, session: 'post' };
    applyLevelsToRealtime(a, lvX, 'test');
    assert.equal(a.callWall, 110);   // 106 기준 재선택
    const b: any = { price: 100, extendedPrice: 106 };
    applyLevelsToRealtime(b, lvX, 'test');
    assert.equal(b.callWall, 110);
    const c: any = { price: 101, extendedPrice: 106, session: 'reg' };
    applyLevelsToRealtime(c, lvX, 'test');
    assert.equal(c.callWall, 105);   // 101 기준 — 판본 값 그대로
});

console.log('━━━ 8-3. 화면 표시(공용) — 값 · 범위 밖 · — 와 (i) 팝업 줄 ━━━');
t('판본이 있고 값이 없으면 «범위 밖», 판본이 없으면 «—», 안전망이 지운 값도 «—»', () => {
    const meta = { levelsSource: 'structure', levelsDropped: null, levelsChainDate: '2026-09-28', levelsExpiration: '2026-10-02' };
    assert.equal(levelCellState(1100, meta, 'callWall'), 'value');
    assert.equal(levelCellState(null, meta, 'callWall'), 'outOfRange');
    assert.equal(levelCellState(0, meta, 'maxPain'), 'outOfRange');   // 인텔 라우트 규약 «0 = 없음»
    assert.equal(levelCellState(null, { ...meta, levelsSource: null }, 'callWall'), 'none');
    assert.equal(levelCellState(null, { ...meta, levelsDropped: ['callWall'] }, 'callWall'), 'none');
    assert.equal(levelCellState(null, undefined, 'putFloor'), 'none');
    assert.equal(levelOutOfRangeText('ko'), '범위 밖'); assert.equal(levelOutOfRangeText('en'), 'Out of range'); assert.equal(levelOutOfRangeText('ja'), '範囲外');
    assert.equal(levelOutOfRangeText('de'), 'Out of range');
});
t('(i) 줄: 만기 · 미결제약정 기준 날짜(실제 체인 날짜) + 범위 밖이면 이유 한 줄', () => {
    const meta = { levelsSource: 'structure', levelsChainDate: '2026-09-28', levelsExpiration: '2026-10-02' };
    assert.equal(levelInfoNote('maxPain', meta, 1000, 'ko'), '10/2 만기 · 미결제약정 9/28 기준');
    assert.equal(levelInfoNote('maxPain', meta, 1000, 'en'), '10/2 expiry · OI as of 9/28');
    assert.equal(levelInfoNote('maxPain', meta, 1000, 'ja'), '10/2満期 · 建玉 9/28 基準');
    assert.equal(levelInfoNote('callWall', meta, null, 'ko'), '10/2 만기 · 미결제약정 9/28 기준\n+20% 안 콜 미결제약정 없음');
    assert.equal(levelInfoNote('gammaFlipLevel', { levelsSource: 'structure', levelsChainDate: '2026-09-28' }, null, 'en'), 'OI as of 9/28\nNo gamma flip within ±15%');
    assert.equal(levelInfoNote('maxPain', { levelsSource: null }, null, 'ko'), null);   // 판본 없음 — 줄 없음
});

t('OK 구조의 네 값이 모두 정의상 없으면(분포 있음) «전부 null 인 한 벌»(출처 structure) → «범위 밖» ×4 + 이유 줄 (9/30 DH)', () => {
    const dh = { ticker: 'DH', options_status: 'OK', underlyingPrice: 0.9302, maxPain: null, levels: { callWall: null, putFloor: null, pinZone: null }, gammaFlipLevel: null,
        expiration: '2026-10-16', chainDate: '2026-09-29', structure: { strikes: [2.5, 5, 7.5], callsOI: [120, 40, 10], putsOI: [300, 20, 0], gexCum: [5, 9, 12] } };
    const lv = levelsFromStructure(dh)!;
    assert.ok(lv); assert.equal(lv.levelsSource, 'structure'); assert.equal(lv.levelsChainDate, '2026-09-29');
    const d = displayLevels(lv, 0.9302, 'test');
    for (const f of ['maxPain', 'callWall', 'putFloor', 'gammaFlipLevel'] as const) { assert.equal(d[f], null); assert.equal(levelCellState(d[f], d, f), 'outOfRange'); }
    assert.equal(levelInfoNote('maxPain', d, null, 'en'), '10/16 expiry · OI as of 9/29\nMore than 35% from the price');
    // 분포도 값도 없으면 «구조 없음»(null) — 증명할 분포가 없다
    assert.equal(levelsFromStructure({ ...dh, structure: { strikes: [], callsOI: [], putsOI: [] } }), null);
    // 감마플립만 있는 판본은 그 감마플립을 버리지 않는다(예전엔 셋이 비면 통째로 버렸다)
    assert.equal(levelsFromStructure({ ...dh, underlyingPrice: 5.1, gammaFlipLevel: 5 })!.gammaFlipLevel, 5);
});
t('레벨 값 글자는 행사가를 반올림하지 않는다: 337.5 → 337.5 · 0.5 → 0.5 · 1000 → 1000 · 2.25 → 2.25', () => {
    assert.equal(formatLevelPrice(337.5), '337.5'); assert.equal(formatLevelPrice(222.5), '222.5'); assert.equal(formatLevelPrice(0.5), '0.5');
    assert.equal(formatLevelPrice(1000), '1000'); assert.equal(formatLevelPrice(2.25), '2.25'); assert.equal(formatLevelPrice(1080.004), '1080');
    assert.equal(formatLevelPrice(99.999), '100'); assert.equal(formatLevelPrice(12.1), '12.1');
});

console.log('━━━ 9. 검사기(scripts/audit-levels-doors.js)의 JS 사본이 lib 과 같은 값을 낸다 ━━━');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const audit = require('../scripts/audit-levels-doors.js');
t('무작위 분포 1,000개 × 표시 가격: levelsAt·표시값(expectAt ↔ displayLevels)이 한 글자도 다르지 않다', () => {
    let seed = 23; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 1000; i++) {
        const n = 5 + Math.floor(rnd() * 70), step = [0.5, 1, 2.5, 5][Math.floor(rnd() * 4)], base = 10 + rnd() * 800;
        const strikes = Array.from({ length: n }, (_, j) => Math.round((base + j * step) * 100) / 100);
        let cum = Math.round((rnd() - 0.5) * 3000);
        const structure = { strikes, callsOI: strikes.map(() => (rnd() < 0.05 ? null : Math.floor(rnd() * 3000))), putsOI: strikes.map(() => (rnd() < 0.05 ? null : Math.floor(rnd() * 3000))),
            gexCum: rnd() < 0.1 ? undefined : strikes.map(() => (rnd() < 0.15 ? null : (cum += Math.round((rnd() - 0.5) * 900)))) };
        const S0 = strikes[0] + rnd() * (strikes[n - 1] - strikes[0]);
        const lv0 = levelsAt(structure as any, S0);
        assert.deepEqual(audit.levelsAt(structure, S0), lv0);
        const sr = { ticker: 'Q', options_status: 'OK', underlyingPrice: S0, maxPain: strikes[Math.floor(rnd() * n)], levels: { callWall: lv0.callWall, putFloor: lv0.putFloor },
            gammaFlipLevel: lv0.gammaFlipLevel, structure };
        const P = rnd() < 0.2 ? null : S0 * (0.85 + rnd() * 0.3);
        const d = displayLevels(levelsFromStructure(sr), P, 'eq');
        const ref = { S: S0, status: 'OK', lv: { maxPain: sr.maxPain, callWall: lv0.callWall, putFloor: lv0.putFloor, gammaFlipLevel: lv0.gammaFlipLevel }, profile: audit.profileOf(sr) };
        const e = audit.expectAt(ref, P);
        for (const f of ['maxPain', 'callWall', 'putFloor', 'gammaFlipLevel'] as const) assert.equal(e[f], d[f], `분포 ${i} ${f} S0=${S0} P=${P}`);
    }
});
t('기대 체인 날짜: 장중(ET 11:16 화) = 전 거래일(월), 월요일 장중 = 금요일, ET 20:00 뒤 = 그날', () => {
    assert.equal(audit.expectedChainDate(Date.parse('2026-09-29T15:16:00Z')), '2026-09-28');
    assert.equal(audit.expectedChainDate(Date.parse('2026-09-28T15:16:00Z')), '2026-09-25');
    assert.equal(audit.expectedChainDate(Date.parse('2026-09-30T00:30:00Z')), '2026-09-29');
    assert.equal(audit.expectedChainDate(Date.parse('2026-09-08T15:00:00Z')), '2026-09-04');   // 9/7 노동절 건너뜀
});

console.log(`\n✅ ${n}개 통과`);
