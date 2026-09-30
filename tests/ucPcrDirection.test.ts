/**
 * UC 풋÷콜 방향 — volumePcr(이름과 반대로 콜÷풋)를 AI 입력·화면에서 풋÷콜로 바꾼다
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/ucPcrDirection.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { volumePutCall, storyPayload } from '../src/app/api/undercurrent/shared';
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
t('volumePutCall: 콜÷풋 2.48(NVDA 9/29, 콜 우세) → 풋÷콜 0.4 · 0·없음 → null', () => {
  assert.equal(volumePutCall(2.48), 0.4);
  assert.equal(volumePutCall(0.5), 2);
  assert.equal(volumePutCall(0), null);
  assert.equal(volumePutCall(null), null);
});
t('storyPayload: AI 입력에 volumePcr(콜÷풋) 대신 volumePutCallRatio(풋÷콜)', () => {
  const p = JSON.parse(storyPayload([{ ticker: 'NVDA', title: 'x', money: { volumePcr: 2.48, oiPcr: 0.81, newOiNotional: 3.254e9 } as any }], 'ko'));
  assert.equal(p[0].money.volumePutCallRatio, 0.4);
  assert.equal('volumePcr' in p[0].money, false);
  assert.equal(p[0].money.newOiNotionalText, '약 33억 달러');
});
t('지시문: 두 비율 모두 풋÷콜로 정의 · UC 화면 P/C 는 volumePcr 를 뒤집어 쓴다(소스)', () => {
  const src = fs.readFileSync('src/app/api/undercurrent/shared.ts', 'utf8');
  assert.ok(src.includes('are BOTH put ÷ call'));
  const page = fs.readFileSync('src/app/[locale]/undercurrent/page.tsx', 'utf8');
  assert.ok(page.includes('1 / m.volumePcr'));
  assert.ok(!page.includes('const pcr = m.oiPcr ?? m.volumePcr;'));
});
console.log(`\n✅ ucPcrDirection: ${n}건 통과`);
