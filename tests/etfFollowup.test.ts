/**
 * ETF 후속 수리(10/4) 시험 — IV 랭크 정의 한 벌 · 감마 판정 유형 · 앱 레짐 문구
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/etfFollowup.test.ts
 *
 *   ① src/lib/ivRank.ts — /api/flow/iv-percentile 의 유일한 정의. 창(200개) 미달은 «미제공», 창이 찬 종목은 옛 계산과 같은 값.
 *   ② src/lib/optionLevelGate.ts gammaFlipTypeOf — 플립이 없을 때 ALL_LONG/ALL_SHORT(levelsAt 과 같은 정의).
 *   ③ src/lib/app/flowEmptyStates.ts gammaRegimeOf·noFlipRegimeText — 앱 미리보기가 «늘 LONG GAMMA» 가 아니다.
 */
import assert from 'node:assert/strict';
import { ivRankFromHistory, IV_RANK_WINDOW, IV_RANK_MIN_IV_SAMPLES, ivRankNotProvidedText } from '../src/lib/ivRank';
import { gammaFlipTypeOf, displayLevels, levelsAt, type OptionLevels } from '../src/lib/optionLevelGate';
import { gammaRegimeOf, noFlipRegimeText, ivHistoryUnavailable, notProvidedText } from '../src/lib/app/flowEmptyStates';

const tests: Array<[string, () => void]> = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

// 10/4 이전 /api/flow/iv-percentile 계산(창 판정 없음) — 신구 대조용으로 그대로 옮겼다
function oldRoute(history: any[]) {
    if (!history || history.length < 5) return { percentile: null, _source: 'dynamodb-insufficient' };
    const ivValues = history.map((h) => h.atmIv).filter((v) => v != null && v > 0).sort((a, b) => a - b);
    if (ivValues.length < 5) return { percentile: null, _source: 'dynamodb-insufficient-iv' };
    const withIv = history.filter((h) => h?.atmIv != null && Number(h.atmIv) > 0).sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    const currentIv = withIv.length ? Number(withIv[0].atmIv) : null;
    if (!currentIv) return { percentile: null, _source: 'dynamodb-no-current' };
    const below = ivValues.filter((v) => v < currentIv).length;
    return {
        percentile: Math.round((below / ivValues.length) * 100), currentIv: Math.round(currentIv * 100) / 100,
        sampleSize: ivValues.length, min: Math.round(ivValues[0] * 100) / 100, max: Math.round(ivValues[ivValues.length - 1] * 100) / 100,
        median: Math.round(ivValues[Math.floor(ivValues.length / 2)] * 100) / 100,
    };
}
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const rows = (n: number, f: (i: number) => any) => Array.from({ length: n }, (_, i) => ({ timestamp: 1_700_000_000_000 + i * 900_000, ...f(i) }));

// ── ① IV 랭크 ──────────────────────────────────────────────────────────────
test('창 미달(새로 수집 목록에 든 ETF — 같은 날 같은 값 30개) → 미제공(insufficient), 0% 를 내지 않는다', () => {
    const r = ivRankFromHistory(rows(30, () => ({ atmIv: 21.4 })));
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, 'insufficient');
    // 옛 계산은 같은 입력에 «0%» 를 냈다(자기보다 낮은 표본 없음) — 숫자처럼 보이지만 뜻이 없다
    assert.equal(oldRoute(rows(30, () => ({ atmIv: 21.4 }))).percentile, 0);
});
test('이력 0건 → insufficient · 앱 판정(ivHistoryUnavailable)이 «미제공»으로 읽는 _source', () => {
    const r = ivRankFromHistory([]);
    assert.equal(!r.ok && r.reason, 'insufficient');
    assert.equal(ivHistoryUnavailable({ percentile: null, _source: 'dynamodb-insufficient' }), true);
    assert.equal(ivHistoryUnavailable({ percentile: null, _source: 'dynamodb-insufficient-iv' }), true);
});
test('창은 찼는데 ATM IV 표본이 10개 미만 → insufficient-iv', () => {
    const r = ivRankFromHistory(rows(IV_RANK_WINDOW, (i) => ({ atmIv: i < IV_RANK_MIN_IV_SAMPLES - 1 ? 20 + i : null })));
    assert.equal(!r.ok && r.reason, 'insufficient-iv');
});
test('창이 찬 종목(기존 수집 종목)은 옛 계산과 값이 같다 — 무작위 300회', () => {
    for (let k = 0; k < 300; k++) {
        const h = rows(IV_RANK_WINDOW, () => ({ atmIv: rnd() < 0.05 ? null : Math.round((10 + rnd() * 60) * 100) / 100 }));
        const shuffled = h.slice().sort(() => rnd() - 0.5);   // 정렬 순서에 기대지 않는다
        const n = ivRankFromHistory(shuffled), o: any = oldRoute(shuffled);
        assert.equal(n.ok, true);
        if (n.ok) {
            assert.equal(n.percentile, o.percentile); assert.equal(n.currentIv, o.currentIv);
            assert.equal(n.sampleSize, o.sampleSize); assert.equal(n.min, o.min); assert.equal(n.max, o.max); assert.equal(n.median, o.median);
        }
    }
});
test('«현재»는 timestamp 가 가장 큰 행 — 배열 순서 무관', () => {
    const h = rows(IV_RANK_WINDOW, (i) => ({ atmIv: 10 + (i % 50) }));
    h[IV_RANK_WINDOW - 1].atmIv = 99;   // 가장 최근이 최고값
    const r1 = ivRankFromHistory(h), r2 = ivRankFromHistory(h.slice().reverse());
    assert.ok(r1.ok && r2.ok);
    if (r1.ok && r2.ok) { assert.equal(r1.currentIv, 99); assert.equal(r1.percentile, Math.round(((IV_RANK_WINDOW - 1) / IV_RANK_WINDOW) * 100)); assert.equal(r2.percentile, r1.percentile); }
});
test('미제공 글자 ko·en·ja — 앱 notProvidedText 와 같다', () => {
    for (const l of ['ko', 'en', 'ja', null, 'de']) assert.equal(ivRankNotProvidedText(l), notProvidedText(l));
    assert.equal(ivRankNotProvidedText('ko'), '미제공');
});

// ── ② 감마 판정 유형 ───────────────────────────────────────────────────────
const S = 100;
const strikes = [80, 85, 90, 95, 100, 105, 110, 115, 120];
const lvWith = (gexCum: (number | null)[] | null, extra: Partial<OptionLevels> = {}): OptionLevels => ({
    maxPain: 100, callWall: 110, putFloor: 90, pinZone: 100, gammaFlipLevel: null,
    levelsExpiration: '2026-10-09', levelsChainDate: '2026-10-02', levelsSource: 'structure', levelsSpot: S, levelsAsOf: 1,
    levelProfile: gexCum === undefined ? null : { strikes, callsOI: strikes.map((k) => (k > S ? 1000 + k : 10)), putsOI: strikes.map((k) => (k < S ? 1000 + (200 - k) : 10)), gexCum },
    ...extra,
});
test('전 구간 롱(누적 GEX 모두 +) → ALL_LONG · 플립 null(«범위 밖»)', () => {
    const lv = lvWith(strikes.map((_, i) => 100 + i * 50));
    const d = displayLevels(lv, S, 'test');
    assert.equal(d.gammaFlipLevel, null);
    assert.equal(gammaFlipTypeOf(lv, d, S), 'ALL_LONG');
    assert.equal(levelsAt(lv.levelProfile, S).gammaFlipType, 'ALL_LONG');
});
test('전 구간 숏(누적 GEX 모두 −) → ALL_SHORT — 예전 화면은 여기서도 «LONG GAMMA»', () => {
    const lv = lvWith(strikes.map((_, i) => -100 - i * 50));
    const d = displayLevels(lv, S, 'test');
    assert.equal(gammaFlipTypeOf(lv, d, S), 'ALL_SHORT');
});
test('교차가 있으면 EXACT (값이 있는 칸)', () => {
    const lv = lvWith([-500, -400, -300, -100, 50, 200, 300, 400, 500], { gammaFlipLevel: 100 });
    const d = displayLevels(lv, S, 'test');
    assert.equal(d.gammaFlipLevel, 100);
    assert.equal(gammaFlipTypeOf(lv, d, S), 'EXACT');
});
test('감마 분포가 없는 옛 판본 → NO_DATA · 판본 없음 → null', () => {
    const lv = lvWith(null as any);
    lv.levelProfile = { strikes, callsOI: strikes.map(() => 1), putsOI: strikes.map(() => 1), gexCum: null };
    assert.equal(gammaFlipTypeOf(lv, displayLevels(lv, S, 'test'), S), 'NO_DATA');
    assert.equal(gammaFlipTypeOf(null, displayLevels(null, S, 'test'), S), null);
});

// ── ③ 앱 레짐 문구 ─────────────────────────────────────────────────────────
test('gammaRegimeOf — 플립이 있으면 현재가 비교, 없으면 판정 유형, 모르면 unknown(롱으로 지어내지 않는다)', () => {
    assert.equal(gammaRegimeOf(105, 100, 'EXACT'), 'long');
    assert.equal(gammaRegimeOf(95, 100, 'EXACT'), 'short');
    assert.equal(gammaRegimeOf(95, 0, 'ALL_LONG'), 'long');
    assert.equal(gammaRegimeOf(95, 0, 'ALL_SHORT'), 'short');
    assert.equal(gammaRegimeOf(95, 0, 'NO_DATA'), 'unknown');
    assert.equal(gammaRegimeOf(95, null, undefined), 'unknown');   // 옛 응답(필드 없음) — 예전엔 늘 «LONG GAMMA»
});
test('noFlipRegimeText — ko·en·ja 전 구간 롱/숏 · NO_DATA 는 미제공 · 응답 없음은 dash', () => {
    assert.equal(noFlipRegimeText('short', 'ALL_SHORT', 'ko', '—'), 'SHORT GAMMA (전 구간)');
    assert.equal(noFlipRegimeText('long', 'ALL_LONG', 'en', '—'), 'LONG GAMMA (NO FLIP)');
    assert.equal(noFlipRegimeText('short', 'ALL_SHORT', 'ja', '—'), 'SHORT GAMMA (全域)');
    assert.equal(noFlipRegimeText('long', 'ALL_LONG', 'ko', '—', 'position'), '전 구간 롱감마');
    assert.equal(noFlipRegimeText('unknown', 'NO_DATA', 'ja', '—'), '未提供');
    assert.equal(noFlipRegimeText('unknown', null, 'ko', '범위 밖'), '범위 밖');
});

let pass = 0;
for (const [n, f] of tests) {
    try { f(); pass++; console.log('  ✓', n); } catch (e: any) { console.log('  ✗', n, '\n    ', e?.message?.split('\n')[0]); }
}
console.log(`\n${pass}/${tests.length} 통과`);
if (pass !== tests.length) process.exit(1);
