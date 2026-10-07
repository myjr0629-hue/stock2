/**
 * Command 화면 «순 프리미엄» 칸 — 값이 «—»(못 쟀음 = 0)일 때 아래 줄이 «콜 우세»(초록)라고 말하던 것 (2026-10-07)
 *
 * 출발점(10/7 운영 실화면 · API 끊김 상태): «순 프리미엄 —» 바로 아래에 «콜 우세». 조건이 `netPremium >= 0` 이라 0(= 못 잼)이 «콜 우위»로 읽혔다.
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/appCmdNetPremiumLabel.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/[locale]/app-view/cmd/page.tsx'), 'utf8');

t('순 프리미엄이 0(못 쟀음)이면 우세 문구 대신 «—» · 색은 중립', () => {
  assert.ok(/color: data\.premium\.netPremium === 0 \? 'var\(--text-muted\)' : data\.premium\.netPremium > 0 \? 'var\(--green\)' : 'var\(--red\)'/.test(src));
  assert.ok(/\{data\.premium\.netPremium === 0\s*\? '—'\s*: data\.premium\.netPremium > 0/.test(src));
});

t('옛 조건(`>= 0` 이면 콜 우세)이 남아 있지 않다 — 양수만 콜 우세 · 음수만 풋 우세', () => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/data\.premium\.netPremium >= 0\s*\?\s*\(locale === 'ko' \? '콜 우세'/.test(code), false);
  assert.equal(/color: data\.premium\.netPremium >= 0 \? 'var\(--green\)'/.test(code), false);
  for (const k of ["'콜 우세'", "'コール優勢'", "'Call dominant'", "'풋 우세'", "'プット優勢'", "'Put dominant'"]) assert.ok(code.includes(k), `${k} 문구는 그대로`);
});

console.log(`\n✅ appCmdNetPremiumLabel: ${n}건 통과`);
