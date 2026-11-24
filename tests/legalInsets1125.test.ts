/**
 * 첫 실행 법적 고지 — 안드 패널을 상태바·내비게이션 바 사이에 둔다 (2026-11-25, src/components/app/AppFirstRunOnboarding.module.css)
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/legalInsets1125.test.ts
 *
 * 배경: Capacitor 8 + 웹뷰 140+ + viewport-fit=cover 이면 웹뷰가 시스템 바 밑까지 그린다. 패널 상한이 «100dvh − 32px»로 바와 무관해
 *   글이 긴 안드 화면에서 패널 위는 상태바 밑, [계속] 아래쪽은 3버튼 내비게이션 바 밑으로 들어갔다(360×800·글꼴 115%·바 36/48: 버튼 7px 가림).
 * 지키는 것
 *  ① 새 규칙은 html.native-android 안에서만(iOS·웹 배치 불변) · max()/min() 지원 검사 블록 안
 *  ② 여백 = max(16px, 바 + 8px) → 바 0 이면 16·16, 상한 100dvh − 32px(예전과 같은 자리·크기)
 *  ③ 아래 바 = --app-bottom-safe(탭바와 같은 보정값) · 위 바 env 는 env 지원 검사 블록 안 · 64px 상한
 *  ④ 기존 공용 규칙(.shell 패딩 max(22px, env) · .panel 상한 100dvh − 32px · dvh 미지원 vh 폴백) 그대로
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const css = fs.readFileSync(path.join(__dirname, '..', 'src/components/app/AppFirstRunOnboarding.module.css'), 'utf8');

/** 중괄호 짝을 맞춰 «@supports (조건) { … }» 블록 본문을 꺼낸다 */
function block(startToken: string): string {
  const i = css.indexOf(startToken);
  assert.ok(i >= 0, startToken);
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') { depth--; if (depth === 0) return css.slice(open + 1, j); }
  }
  throw new Error('짝 없음 ' + startToken);
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

console.log('법적 고지 안드 시스템 바 여백(11/25)');

t('① 안드 규칙은 html.native-android 안에서만 · max/min 지원 검사 블록 안', () => {
  const body = stripComments(css);
  const androidSel = body.match(/[^{}]*native-android[^{}]*\{/g) || [];
  assert.ok(androidSel.length >= 3);
  for (const s of androidSel) assert.ok(/html:global\(\.native-android\) \.(shell|panel) \{$/.test(s.trim()), s);
  const mm = block('@supports (padding-top: max(0px, min(1px, 2px)))');
  assert.ok(/html:global\(\.native-android\) \.shell \{/.test(mm));
  assert.ok(/html:global\(\.native-android\) \.panel \{/.test(mm));
});

t('② 여백 = max(16px, 바 + 8px) · 패널 상한 = 100dvh − 두 여백(vh 폴백 먼저)', () => {
  const mm = block('@supports (padding-top: max(0px, min(1px, 2px)))');
  assert.ok(mm.includes('--onb-gap-top: max(16px, calc(var(--onb-sa-top) + 8px));'));
  assert.ok(mm.includes('--onb-gap-bottom: max(16px, calc(var(--onb-sa-bottom) + 8px));'));
  assert.ok(mm.includes('padding-top: var(--onb-gap-top);'));
  assert.ok(mm.includes('padding-bottom: var(--onb-gap-bottom);'));
  const vh = mm.indexOf('max-height: calc(100vh - var(--onb-gap-top) - var(--onb-gap-bottom));');
  const dvh = mm.indexOf('max-height: calc(100dvh - var(--onb-gap-top) - var(--onb-gap-bottom));');
  assert.ok(vh > 0 && dvh > vh, 'dvh 를 모르면 vh 줄이 남는다');
  // 바 0 → 16 + 16 = 32 (예전 상한 100dvh − 32px 와 같다)
  const gap = (bar: number) => Math.max(16, bar + 8);
  assert.equal(gap(0) + gap(0), 32);
  assert.equal(gap(48), 56);
});

t('③ 아래 바 = --app-bottom-safe · 위 바 env 는 env 지원 검사 블록 안 · 64px 상한', () => {
  const mm = block('@supports (padding-top: max(0px, min(1px, 2px)))');
  assert.ok(mm.includes('--onb-sa-bottom: min(64px, var(--app-bottom-safe, 0px));'));
  assert.ok(mm.includes('--onb-sa-top: min(64px, var(--sig-top-floor, 0px));'));
  assert.ok(!/env\(/.test(stripComments(mm)), 'env() 는 env 지원 검사 블록에만');
  const env = block('@supports (padding-top: max(0px, env(safe-area-inset-top)))');
  assert.ok(env.includes('--onb-sa-top: min(64px, max(env(safe-area-inset-top, 0px), var(--sig-top-floor, 0px)));'));
});

t('④ 공용 규칙(iOS·웹) 그대로', () => {
  assert.ok(/\.shell \{\s*width: min\(100%, 430px\);\s*min-height: 100dvh;\s*padding: max\(22px, env\(safe-area-inset-top\)\) 18px max\(22px, env\(safe-area-inset-bottom\)\);/.test(css));
  assert.ok(/\.panel \{\s*width: 100%;\s*max-height: calc\(100dvh - 32px\);\s*overflow-y: auto;/.test(css));
  const old = block('@supports not (height: 100dvh)');
  assert.ok(old.includes('max-height: calc(100vh - 32px);'));
});

console.log(`\n${n} passed`);
