/**
 * ETF 후속 수리(10/4) 시험 — IV 랭크 정의 한 벌 · 감마 판정 유형 · 앱 레짐 문구
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/etfFollowup.test.ts
 *
 *   ① src/lib/ivRank.ts — /api/flow/iv-percentile 의 유일한 정의. 252거래일 IV30 창 미달은 결측. 장중 행 수로 백분위를 내지 않는다.
 *   ② src/lib/optionLevelGate.ts gammaFlipTypeOf — 플립이 없을 때 ALL_LONG/ALL_SHORT(levelsAt 과 같은 정의).
 *   ③ src/lib/app/flowEmptyStates.ts gammaRegimeOf·noFlipRegimeText — 앱 미리보기가 «늘 LONG GAMMA» 가 아니다.
 */
import assert from 'node:assert/strict';
import { ivRankFromHistory, IV_RANK_WINDOW, ivWindowSessions, ivRankNotProvidedText, IV30_DEF } from '../src/lib/ivRank';
import { gammaFlipTypeOf, displayLevels, levelsAt, type OptionLevels } from '../src/lib/optionLevelGate';
import { gammaRegimeOf, noFlipRegimeText, ivHistoryUnavailable, notProvidedText } from '../src/lib/app/flowEmptyStates';

// 고정 분포(10/9 만기)를 시험하는 시각.
Date.now = () => Date.parse('2026-10-08T14:00:00Z');

const tests: Array<[string, () => void]> = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

// ── ① IV 랭크 — 대표 10/19: 252일 정책으로 갱신 ─────────────────────────
const ivDays = ivWindowSessions('2026-10-07');
const ivDaily = ivDays.map((d,i)=>({timestamp:Date.parse(`${d}T20:00:00Z`),iv30Date:d,iv30:20+i/100,iv30Def:IV30_DEF}));
test('ETF 장중 표본 200개로 0%/99%를 내지 않는다',()=>{
 const h=Array.from({length:200},(_,i)=>({...ivDaily[0],timestamp:ivDaily[0].timestamp-i*60000,iv30:30+i/100}));
 const r=ivRankFromHistory(h); assert(!r.ok && r.sampleSize===1);
});
test('252개 일별 IV30이면 배열 순서에 무관한 백분위',()=>{
 const a=ivRankFromHistory(ivDaily),b=ivRankFromHistory(ivDaily.slice().reverse());
 assert(a.ok && b.ok); if(a.ok&&b.ok){assert.equal(a.percentile,0);assert.equal(a.percentile,b.percentile);assert.equal(a.sampleSize,252);}
});
test('이력 결측·누락·낡은 세션은 미제공',()=>{
 assert.equal(ivRankFromHistory([]).ok,false);
 assert.equal(ivRankFromHistory(ivDaily.slice(0,251)).ok,false);
 assert.equal(ivRankFromHistory(ivDaily,{nowMs:Date.parse('2026-10-13T12:00:00Z')}).ok,false);
 assert.equal(ivHistoryUnavailable({percentile:null,_source:'dynamodb-stale'}),true);
});
test('다른 호출자의 미제공 글자 계약은 유지',()=>{
 for(const loc of ['ko','en','ja',null,'de']) assert.equal(ivRankNotProvidedText(loc),notProvidedText(loc));
 assert.equal(IV_RANK_WINDOW,252);
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
