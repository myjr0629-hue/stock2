#!/usr/bin/env node
// ============================================================================
// capture-wim-tabs — WIM 실화면 캡처
// ----------------------------------------------------------------------------
// 함정 두 개 (2026-08-22 실측):
//   ① 온보딩 오버레이가 먼저 뜬다 → «건너뛰기» 를 눌러야 본화면이 나온다
//   ② /en/wim 으로 가도 앱 내부 로케일 저장소가 한국어를 이긴다
//      → localStorage 를 심고 «다시» 로드해야 영어가 된다
// 각 단계마다 «정말 바뀌었는지» 를 확인하고, 아니면 실패로 남긴다.
// ============================================================================
const puppeteer = require('puppeteer');
const path = require('path');
const BASE = 'https://www.signumhq.com';
const OUT = path.join(__dirname, '..', 'promo-shots', '_raw');
const VIEW = { w: 390, h: 658, dsf: 2.4616 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clean = (page) => page.evaluate(() => {
  document.querySelectorAll('.app-anchor-ad,[aria-label="Sponsored"],[id*="google_ads"],iframe[src*="ads"]').forEach((e) => e.remove());
  document.documentElement.style.setProperty('--app-anchor-ad-height', '0px');
  document.documentElement.style.setProperty('--app-tabbar-lift', '0px');
  document.documentElement.style.setProperty('--app-bottom-safe', '0px');
  window.scrollTo(0, 0);
});

const cropAt = (page) => page.evaluate(() => {
  const bars = [...document.querySelectorAll('nav,[class*="tabbar"],[class*="tab-bar"],[class*="bottom-nav"]')];
  const b = bars.map((e) => e.getBoundingClientRect()).filter((r) => r.height > 30 && r.bottom > 300).pop();
  return b ? Math.min(window.innerHeight, Math.ceil(b.bottom)) : window.innerHeight;
});

const clickText = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src.source, src.flags);
  const el = [...document.querySelectorAll('button,a,[role="button"],[role="tab"]')]
    .find((b) => rx.test((b.textContent || '').trim()));
  if (!el) return false; el.click(); return true;
}, { source: re.source, flags: re.flags });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: VIEW.w, height: VIEW.h + 24, deviceScaleFactor: VIEW.dsf });

  await page.goto(`${BASE}/en/wim`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => { try {
    ['signumhq.locale', 'wim.locale', 'app.locale'].forEach((k) => localStorage.setItem(k, 'en'));
  } catch {} });
  await page.goto(`${BASE}/en/wim`, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(8000);

  // 온보딩 건너뛰기 — 최대 4번 (다음 → 이 여러 장일 수 있다)
  for (let i = 0; i < 4; i++) {
    const skipped = await clickText(page, /건너뛰기|^skip$|スキップ/i);
    if (!skipped) break;
    await sleep(1500);
  }
  await sleep(2500);

  const lang = await page.evaluate(() => document.body.innerText.slice(0, 200));
  console.log(`로케일 확인: ${lang.split('\n').filter(Boolean).slice(0,3).join(' | ').slice(0,90)}`);

  await clean(page); await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'wim-home-en.png'), clip: { x:0, y:0, width: VIEW.w, height: await cropAt(page) } });
  console.log('✓ wim-home-en.png');

  // 퀴즈 화면 — 첫 문제를 연다
  const before = await page.evaluate(() => document.body.innerText.slice(0, 300));
  const opened = await clickText(page, /start|begin|play|오늘의|today/i);
  if (opened) {
    await sleep(4000);
    const after = await page.evaluate(() => document.body.innerText.slice(0, 300));
    if (after !== before) {
      await clean(page); await sleep(500);
      await page.screenshot({ path: path.join(OUT, 'wim-quiz-en.png'), clip: { x:0, y:0, width: VIEW.w, height: await cropAt(page) } });
      console.log('✓ wim-quiz-en.png');
    } else console.error('✗ quiz: 화면 안 바뀜');
  } else console.error('✗ quiz: 시작 버튼 없음');

  // Library 탭 — 세 번째 갤러리 컷
  await page.goto(`${BASE}/en/wim`, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(7000);
  for (let i = 0; i < 4; i++) { if (!(await clickText(page, /건너뛰기|^skip$|スキップ/i))) break; await sleep(1200); }
  const b2 = await page.evaluate(() => document.body.innerText.slice(0, 300));
  if (await clickText(page, /^library$/i)) {
    await sleep(4000);
    const a2 = await page.evaluate(() => document.body.innerText.slice(0, 300));
    if (a2 !== b2) {
      await clean(page); await sleep(500);
      await page.screenshot({ path: path.join(OUT, 'wim-library-en.png'), clip: { x:0, y:0, width: VIEW.w, height: await cropAt(page) } });
      console.log('✓ wim-library-en.png');
    } else console.error('✗ library: 화면 안 바뀜');
  } else console.error('✗ library: 버튼 없음');

  await browser.close();
})();
