import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tacticalFuturesDirection, TACTICAL_FUTURES_FLAT_PCT } from '@/lib/ai/tacticalFuturesRules';
// 실모델 10/23 20:33 ET 06:3x: NQ −0.106% 를 «보합»으로 쓴 정상 문장이 index-direction 으로 탈락 → 반올림 값 기준 보합 허용
const src = readFileSync('src/lib/ai/tacticalPrompt.ts', 'utf8');
// 공용 경계 추출 뒤에도 출구가 같은 함수를 쓰며, 기존 반올림 결과를 그대로 유지하는지 검사한다.
assert.match(src, /const nearFlat = tacticalFuturesDirection\(r\.f\.chgPct\) === 0/);
assert.equal(TACTICAL_FUTURES_FLAT_PCT, 0.1);
const near = (x: number) => tacticalFuturesDirection(x) === 0;
assert.equal(near(-0.106), true); assert.equal(near(0.149), true); assert.equal(near(-0.16), false); assert.equal(near(0.2), false);
console.log('통과 보합 반올림 기준');
