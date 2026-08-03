#!/usr/bin/env node
// ============================================================================
// capture-app-screens — 실앱 화면을 «맥 없이» 자동 수집한다.
// ----------------------------------------------------------------------------
// 우리 앱 3종은 전부 Capacitor 원격 웹뷰라, 화면에 보이는 UI는 signumhq.com이
// 그리는 «웹 페이지»다. 따라서 네이티브 크롬(상태바·푸시 배너)을 뺀 나머지는
// Puppeteer로 그대로 찍을 수 있다 — 시뮬레이터도 Xcode도 필요 없다.
// (.agent/VIDEO_ENGINE_SPEC.md §5-A)
//
// 핵심: `sig_native=1` 쿠키를 심어야 앱 화면이 나온다. 없으면 미들웨어가
// 마케팅 웹사이트로 보낸다 — iOS가 웹사이트를 띄우던 그 버그의 반대편이다.
//
// 사용:  node scripts/capture-app-screens.mjs [outDir]
// 출력:  <outDir>/{signum-dash,signum-cmd,wim-home,uc-home}.png  (1206x2622 @3x)
// ============================================================================

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const OUT = resolve(process.argv[2] || 'public/shorts/appshots');
const BASE = 'https://www.signumhq.com';

// iPhone 15 Pro 논리 해상도. @3x로 찍어 리모션에서 축소해도 선명하게.
const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const SHOTS = [
  { name: 'signum-dash', path: '/en/app-view/dash', wait: 11000 },
  { name: 'signum-cmd', path: '/en/app-view/cmd?t=SOXL', wait: 14000 },
  { name: 'wim-home', path: '/en/wim', wait: 11000 },
  { name: 'uc-home', path: '/en/undercurrent', wait: 11000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

mkdirSync(OUT, { recursive: true });

for (const shot of SHOTS) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  );
  // 앱으로 인식시키는 쿠키. 이게 없으면 마케팅 사이트가 나온다.
  await page.setCookie(
    { name: 'sig_native', value: '1', domain: 'www.signumhq.com', path: '/' },
    { name: 'sig_native', value: '1', domain: '.signumhq.com', path: '/' },
  );

  try {
    await page.goto(BASE + shot.path, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch {
    // networkidle2가 타임아웃해도 화면은 대개 이미 그려져 있다 — 계속 진행
  }
  await sleep(shot.wait);   // 라이브 시세·차트가 채워질 시간

  // 온보딩 통과. SIGNUM은 «필수 고지» 게이트(체크박스 동의 → 계속)가 2단계 있고,
  // 이걸 안 넘기면 캡처에 앱 화면이 아니라 동의서가 찍힌다 — 실제로 그렇게 나왔다.
  // 최대 6회 반복: 체크박스가 있으면 켜고, 진행/건너뛰기 버튼을 누른다.
  for (let step = 0; step < 6; step++) {
    const moved = await page.evaluate(() => {
      // 1) 동의 체크박스류를 먼저 켠다 (버튼이 비활성일 수 있다)
      for (const el of document.querySelectorAll('input[type=checkbox]')) {
        if (!el.checked) { el.click(); return 'checked'; }
      }
      const clickable = [...document.querySelectorAll('button, [role=checkbox], [role=button]')];
      const agree = clickable.find((b) => /동의|약관.*읽고|I agree|同意/.test(b.innerText || ''));
      if (agree && agree.getAttribute('aria-checked') === 'false') { agree.click(); return 'agree'; }
      // 2) 진행 버튼
      const go = clickable.find((b) => {
        const s = (b.innerText || b.getAttribute('aria-label') || '').trim();
        return /^(계속|다음|시작|Continue|Next|Start|Got it|건너뛰기|Skip|スキップ|続ける|次へ)/.test(s);
      });
      if (go && !go.disabled) { go.click(); return 'go'; }
      return null;
    }).catch(() => null);
    if (!moved) break;
    await sleep(1400);
  }
  await sleep(2500);   // 게이트 통과 후 실데이터가 채워질 시간

  const file = join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  console.log(`  ✔ ${shot.name.padEnd(12)} ${w}x${h} @${VIEWPORT.deviceScaleFactor}x  → ${file}`);
  await page.close();
}

await browser.close();
console.log(`\n완료 — ${OUT}`);
