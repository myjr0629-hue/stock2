/**
 * «내 종목» 행 누름 신호 — 누른 표시(선택 바) 없음 · 햅틱은 한 번(대표 9/30 «바가 나오지 않게 하고 햅틱만»)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/watchlistTapFeedback.test.ts
 *
 * 지키는 것(소스):
 *   1. 햅틱은 한 번 — 앱 레이아웃(app-view/layout.tsx)이 모든 버튼·링크 클릭에 Light 를 한 번 낸다(네이티브만 · 웹은 아무 일도 없다).
 *      대시보드 «내 종목» 행·목록 행은 <button> 이라 이미 받는다 → 행 onClick 이 hapticImpact 를 또 부르면 두 번이다.
 *   2. 누른 표시 없음 — .dRow·.hit 에 :active 배경이 없다 · 탭 강조 투명(main 7a185fa23 그대로)
 *   3. 길게 누르기는 그대로 — 0.4초 뒤 Medium 한 번(다른 신호)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const root = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

const layout = read('src/app/[locale]/app-view/layout.tsx');
const dash = read('src/components/app/watchlist/DashWatchlistSection.tsx');
const page = read('src/app/[locale]/app-view/watchlist/page.tsx');
const cssComp = read('src/components/app/watchlist/watchlist.module.css');
const cssPage = read('src/app/[locale]/app-view/watchlist/watchlist.module.css');
const lp = read('src/components/app/watchlist/useLongPress.tsx');

console.log('━━━ 1. 햅틱은 한 번 ━━━');
t('★ 앱 레이아웃이 모든 버튼 클릭에 Light 를 낸다(네이티브만) — 이것이 «한 번»의 출처', () => {
  assert.ok(/isNativePlatform\(\)/.test(layout), '네이티브에서만');
  assert.ok(/closest\('button, a, \[role="button"\]/.test(layout), '버튼·링크를 잡는다');
  assert.ok(/ImpactStyle\.Light/.test(layout), 'Light');
  assert.ok(/addEventListener\('click', onTap, true\)/.test(layout), '문서 클릭(캡처) 하나');
});
t('★ 대시보드 «내 종목» 행·목록 행은 <button> 이다 — 레이아웃 햅틱을 받는다', () => {
  assert.ok(/<button key=\{x\} type="button" className=\{`\$\{s\.dRow\}/.test(dash), '대시보드 행 = button');
  assert.ok(/<button\s+type="button"\s+className=\{`\$\{p\.hit\}/.test(page), '목록 행 = button(hit)');
});
t('★ 행 onClick 이 hapticImpact 를 또 부르지 않는다(부르면 두 번 — 9/30 main 7a185fa23 에서 생겼다)', () => {
  assert.equal(/hapticImpact\(/.test(dash), false, 'DashWatchlistSection');
  // 대시보드 카드의 종목 행은 «내 종목» 화면으로 간다(종목 상세는 목록 안에서 — 대표 9/30)
  assert.equal(dash.includes('app-view/cmd?t='), false, '대시보드 카드 행이 종목 상세로 바로 가면 안 된다');
  assert.ok(/onClick=\{goAll\}/.test(dash), '대시보드 카드 행 → goAll(내 종목 화면)');
  assert.equal(/hapticImpact\(/.test(page), false, 'watchlist page');
});

console.log('━━━ 2. 누른 표시 없음(main 7a185fa23) ━━━');
t('.dRow·.hit 에 :active 배경이 없다 · 탭 강조 투명', () => {
  assert.equal(/\.dRow:active/.test(cssComp), false);
  assert.equal(/\.hit:active/.test(cssPage), false);
  assert.ok(/\.dRow \{ -webkit-tap-highlight-color: transparent; \}/.test(cssComp));
  assert.ok(/\.hit \{ -webkit-tap-highlight-color: transparent; \}/.test(cssPage));
});

console.log('━━━ 3. 길게 누르기는 그대로 ━━━');
t('0.4초 길게 누르면 Medium 한 번(탭의 Light 와 다른 신호) · 길게 누른 뒤엔 탭 이동이 없다(합성 click 이 없다 → 레이아웃 Light 도 없다)', () => {
  assert.ok(/const DELAY_MS = 400;/.test(lp));
  assert.ok(/hapticImpact\('medium'\)/.test(lp));
  assert.ok(/if \(st\.current\?\.fired\) e\.preventDefault\(\);/.test(lp), 'touchend 에서 합성 click 을 막는다');
});

console.log(`\n${n}/${n} 통과`);
