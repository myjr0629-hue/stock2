#!/usr/bin/env node
// ============================================================================
// capture-scroll-frames — 앱이 «움직이는» 프레임을 뽑는다 (GIF 재료)
// ----------------------------------------------------------------------------
// 왜: Product Hunt 갤러리·썸네일은 GIF 를 받고 «hover 시 재생»된다.
//     피드에서 움직이는 카드는 거의 없다 — 정지 이미지 사이에서 눈에 띈다.
//     가짜 모션이 아니라 «실제 앱을 스크롤한 화면»이어야 설득력이 있다.
// ============================================================================
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'https://www.signumhq.com';
const VIEW = { w: 390, h: 658, dsf: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = {
  uc:     { url: '/en/undercurrent', skip: null,               scrollTo: 1500 },
  signum: { url: '/en/app-view/dash', skip: null,              scrollTo: 1400, cookie: true },
  wim:    { url: '/en/wim', skip: /건너뛰기|^skip$/i,           scrollTo: 1200 },
};

(async () => {
  const key = process.argv[2];
  const t = TARGETS[key];
  if (!t) { console.error('사용: node scripts/capture-scroll-frames.js <uc|signum|wim>'); process.exit(1); }
  const out = path.join(__dirname, '..', 'promo-shots', '_frames', key);
  fs.mkdirSync(out, { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: VIEW.w, height: VIEW.h + 24, deviceScaleFactor: VIEW.dsf });
  if (t.cookie) await page.setCookie({ name: 'sig_native', value: '1', domain: 'www.signumhq.com', path: '/' });

  await page.goto(BASE + t.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => { try {
    ['signumhq.locale','undercurrent.locale','wim.locale','app.locale'].forEach(k => localStorage.setItem(k,'en'));
  } catch {} });
  await page.goto(BASE + t.url, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(9000);

  if (t.skip) {
    for (let i = 0; i < 4; i++) {
      const ok = await page.evaluate((src) => {
        const re = new RegExp(src.source, src.flags);
        const b = [...document.querySelectorAll('button,a')].find(x => re.test((x.textContent||'').trim()));
        if (!b) return false; b.click(); return true;
      }, { source: t.skip.source, flags: t.skip.flags });
      if (!ok) break;
      await sleep(1500);
    }
    await sleep(2500);
  }

  // 광고 제거 + 탭바 밀착
  await page.evaluate(() => {
    document.querySelectorAll('.app-anchor-ad,[aria-label="Sponsored"],[id*="google_ads"],iframe[src*="ads"]').forEach(e=>e.remove());
    ['--app-anchor-ad-height','--uc-ad-h','--app-tabbar-lift','--app-bottom-safe'].forEach(v=>document.documentElement.style.setProperty(v,'0px'));
    window.scrollTo(0,0);
  });
  await sleep(1200);

  // 탭바 하단에서 자른다 (아래로 새는 콘텐츠 차단)
  const crop = await page.evaluate(() => {
    const bars=[...document.querySelectorAll('nav,[class*="tabbar"],[class*="tab-bar"],[class*="bottom-nav"]')];
    const b=bars.map(e=>e.getBoundingClientRect()).filter(r=>r.height>30&&r.bottom>300).pop();
    return b?Math.min(window.innerHeight,Math.ceil(b.bottom)):window.innerHeight;
  });

  // ★ 스크롤 컨테이너 «실측» 탐지 (2026-08-22):
  //   선택자 추측(.app-main 등)으로 찾았더니 window 로 잘못 판정해
  //   14프레임이 전부 «맨 위» 였다. 뉴스 이미지가 갱신돼 픽셀 차이는 났고,
  //   그래서 «움직였다»고 착각할 뻔했다.
  //   이제 모든 요소를 훑어 실제로 스크롤 여지가 가장 큰 놈을 고르고,
  //   scrollTop 을 넣어본 뒤 «정말 바뀌었는지»까지 확인한다.
  const scrollInfo = await page.evaluate(() => {
    let best = null, bestGap = 0;
    for (const el of document.querySelectorAll('*')) {
      const gap = el.scrollHeight - el.clientHeight;
      if (gap > bestGap && el.clientHeight > 300) {
        const ov = getComputedStyle(el).overflowY;
        if (ov === 'auto' || ov === 'scroll' || el === document.scrollingElement) { best = el; bestGap = gap; }
      }
    }
    const docGap = document.documentElement.scrollHeight - window.innerHeight;
    if (docGap > bestGap) { best = null; bestGap = docGap; }
    if (best) { best.setAttribute('data-scroll-target', '1'); }
    return { useWindow: !best, gap: bestGap };
  });
  if (scrollInfo.gap < 200) console.error('⚠ 스크롤 여지가 거의 없다:', scrollInfo.gap);
  const scroller = scrollInfo.useWindow ? null : 'data-scroll-target';

  const N = 14;
  for (let i = 0; i < N; i++) {
    const y = Math.round((t.scrollTo * i) / (N - 1));
    await page.evaluate((y, sel) => {
      if (sel) {
        const c = document.querySelector('[data-scroll-target="1"]');
        if (c) { c.scrollTop = y; return; }
      }
      window.scrollTo(0, y);
    }, y, scroller);
    await sleep(450);
    await page.screenshot({ path: path.join(out, `f${String(i).padStart(2,'0')}.png`),
      clip: { x: 0, y: 0, width: VIEW.w, height: crop } });
  }
  // 마지막 프레임이 정말 내려가 있는지 «위치»로 확인한다
  const finalY = await page.evaluate((sel) => {
    if (sel) { const c = document.querySelector('[data-scroll-target="1"]'); if (c) return c.scrollTop; }
    return window.scrollY;
  }, scroller);
  console.log(`✓ ${key}: ${N}프레임 · 스크롤러=${scroller ? '컨테이너' : 'window'} · 여지=${scrollInfo.gap} · 최종위치=${finalY} · crop=${crop}`);
  if (finalY < 100) console.error('✗ 스크롤이 실제로 일어나지 않았다 — GIF 를 만들지 말 것');
  await browser.close();
})();
