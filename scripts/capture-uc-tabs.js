#!/usr/bin/env node
// ============================================================================
// capture-uc-tabs — UC «Diverge / Whales» 탭 실화면 캡처
// ----------------------------------------------------------------------------
// 왜 별도 스크립트인가 (2026-08-22 실측):
//   make-promo-shots.js 의 탭 이동이 조용히 실패해서 diverge·whales 로 저장된
//   3장이 «전부 홈 화면»이었다. 갤러리 3장 중 2장이 같은 화면이면
//   «화면이 하나뿐인 앱»으로 보인다 — 발견 못 했으면 그대로 나갈 뻔했다.
//
// 여기서는 탭 클릭 후 «화면이 실제로 바뀌었는지»를 DOM 텍스트로 확인하고,
// 안 바뀌면 실패로 종료한다. 조용한 실패를 허용하지 않는다.
// ============================================================================
const puppeteer = require('puppeteer');
const path = require('path');

const BASE = 'https://www.signumhq.com';
const OUT = path.join(__dirname, '..', 'promo-shots', '_raw');
const VIEW = { w: 390, h: 658, dsf: 2.4616 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TABS = [
  { key: 'diverge', label: /diverge/i },
  { key: 'whales', label: /whales/i },
  { key: 'stories', label: /stories/i },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: VIEW.w, height: VIEW.h + 24, deviceScaleFactor: VIEW.dsf });

  await page.goto(`${BASE}/en/undercurrent`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => {
    try {
      localStorage.setItem('signumhq.locale', 'en');
      localStorage.setItem('undercurrent.locale', 'en');
      localStorage.setItem('uc.onboarded', '1');
    } catch {}
  });

  for (const t of TABS) {
    await page.goto(`${BASE}/en/undercurrent`, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(7000);

    const before = await page.evaluate(() => document.body.innerText.slice(0, 400));

    const clicked = await page.evaluate((src) => {
      const re = new RegExp(src.source, src.flags);
      const nav = document.querySelector('nav') || document.body;
      const btn = [...nav.querySelectorAll('button, a, [role="tab"]')]
        .find((b) => re.test((b.textContent || '').trim()));
      if (!btn) return false;
      btn.click();
      return true;
    }, { source: t.label.source, flags: t.label.flags });

    if (!clicked) { console.error(`✗ ${t.key}: 탭 버튼을 못 찾음`); process.exitCode = 1; continue; }
    await sleep(4500);

    const after = await page.evaluate(() => document.body.innerText.slice(0, 400));
    if (after === before) { console.error(`✗ ${t.key}: 클릭했지만 화면이 안 바뀜`); process.exitCode = 1; continue; }

    // 광고 제거 + 탭바 밀착 (프로모 이미지에 광고가 들어가면 안 된다)
    await page.evaluate(() => {
      document.querySelectorAll('.app-anchor-ad, [aria-label="Sponsored"], .uc-ad, [id*="google_ads"], iframe[src*="ads"]')
        .forEach((el) => el.remove());
      document.documentElement.style.setProperty('--app-anchor-ad-height', '0px');
      document.documentElement.style.setProperty('--uc-ad-h', '0px');
      document.documentElement.style.setProperty('--app-tabbar-lift', '0px');
      document.documentElement.style.setProperty('--app-bottom-safe', '0px');
      window.scrollTo(0, 0);
    });
    await sleep(700);

    // 탭바 하단을 실측해 거기서 자른다 — 아래로 새는 스크롤 콘텐츠를 막는다
    const cropCss = await page.evaluate(() => {
      const bars = [...document.querySelectorAll('nav, [class*="tabbar"], [class*="tab-bar"], [class*="bottom-nav"]')];
      const b = bars.map((e) => e.getBoundingClientRect()).filter((r) => r.height > 30 && r.bottom > 300).pop();
      return b ? Math.min(window.innerHeight, Math.ceil(b.bottom)) : window.innerHeight;
    });

    const out = path.join(OUT, `uc-${t.key}-en.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: VIEW.w, height: cropCss } });
    console.log(`✓ ${t.key} → ${path.basename(out)}  (첫줄: ${after.split('\n')[0].slice(0, 46)})`);
  }

  await browser.close();
})();
