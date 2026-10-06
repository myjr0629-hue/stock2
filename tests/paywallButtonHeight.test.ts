/**
 * 앱 안 결제 단추 높이(2026-10-06) — app-view.css 의 `.app-viewport button { min-height: 0 !important }`(특이도 0,1,1)가
 *   모듈의 min-height 를 지워, 앱 안에서 페이월 결제 단추(46px)가 21.8px · 링크(32px)가 25.4px · 쿠폰 링크(32px)가 24.8px 로 눌렸다
 *   (로컬 실측, 아이폰 390·안드 412 같음). 결제 계열 모듈은 «클래스 겹침(0,2,0) + !important»로 의도한 min-height 를 되살린다.
 *   이 시험은 ① 되살리는 규칙이 있는지 ② 그 값이 모듈의 원래 값과 같은지(디자인 값을 바꾸면 둘 다 바꾸게) 본다.
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/paywallButtonHeight.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 정확히 이 선택자 하나로 시작하는 규칙들의 min-height(마지막 것) — 없으면 null */
function minHeight(css: string, selector: string): string | null {
  const re = new RegExp(`(?:^|[}\\n])\\s*${esc(selector)}\\s*\\{([^}]*)\\}`, 'g');
  let found: string | null = null;
  for (const m of css.matchAll(re)) {
    const d = /(?:^|;)\s*min-height\s*:\s*([^;]+?)\s*(?:;|$)/.exec(m[1]);
    if (d) found = d[1].trim();
  }
  return found;
}

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };

// 원인 — 전역 규칙이 바뀌면(지우거나 특이도를 올리면) 되살리는 규칙들을 다시 봐야 한다
ok('app-view.css 전역 규칙(원인)이 그대로다', () => {
  assert.match(read('src/styles/app-view.css'), /\.app-viewport button\s*\{[^}]*min-height:\s*0\s*!important/);
});

const CASES: Array<{ file: string; base: string; restore: string; expect: string }> = [
  { file: 'src/components/app/ProPaywall.module.css', base: '.cta', restore: '.cta.cta', expect: '46px' },          // 결제 단추(쿠폰 안내 시트도 같은 .cta)
  { file: 'src/components/app/ProPaywall.module.css', base: '.link', restore: '.link.link', expect: '32px' },        // 구매 복원 · 이용약관 · 개인정보
  { file: 'src/components/app/RedeemCodeLink.module.css', base: '.btn', restore: '.btn.btn', expect: '32px' },     // 🎟 쿠폰 코드 입력(페이월·가치 벽·대시보드 게이트)
  { file: 'src/components/app/watchlist/watchlist.module.css', base: '.links button', restore: '.links.links button', expect: '32px' }, // «내 종목» 시트 링크(9/29부터)
  { file: 'src/components/app/GiftDashButton.module.css', base: '.btn', restore: '.btn.btn', expect: '44px' },          // 대시보드 맨 아래 «친구에게 PRO 1개월 선물» 단추(2026-10-06)
];

for (const c of CASES) {
  ok(`${path.basename(c.file)} ${c.restore} 가 ${c.base} 의 min-height(${c.expect})를 앱 안에서 되살린다`, () => {
    const css = read(c.file);
    const base = minHeight(css, c.base);
    const restore = minHeight(css, c.restore);
    assert.equal(base, c.expect, `${c.base} 의 디자인 값이 바뀌었다 — ${c.restore} 와 이 시험을 같이 바꾼다`);
    assert.ok(restore, `${c.restore} 규칙이 없다 — 앱 안에서 ${c.base} 가 글자 높이로 눌린다`);
    assert.match(restore!, /!important$/, `${c.restore} 는 !important 여야 전역 !important 를 이긴다`);
    assert.equal(restore!.replace(/\s*!important$/, ''), base, `${c.restore}(${restore}) ≠ ${c.base}(${base})`);
  });
}

console.log(`paywallButtonHeight: ${n} passed`);
