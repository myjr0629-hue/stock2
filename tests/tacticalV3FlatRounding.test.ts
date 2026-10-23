import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// 실모델 10/23 20:33 ET 06:3x: NQ −0.106% 를 «보합»으로 쓴 정상 문장이 index-direction 으로 탈락 → 반올림 값 기준 보합 허용
const src = readFileSync('src/lib/ai/tacticalPrompt.ts', 'utf8');
assert.match(src, /Math\.abs\(Math\.round\(r\.f\.chgPct \* 10\) \/ 10\) <= 0\.1/);
const near = (x: number) => Math.abs(Math.round(x * 10) / 10) <= 0.1;
assert.equal(near(-0.106), true); assert.equal(near(0.149), true); assert.equal(near(-0.16), false); assert.equal(near(0.2), false);
console.log('통과 보합 반올림 기준');
