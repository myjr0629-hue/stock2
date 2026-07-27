// WIM store-screenshot factory — headless, full-res, saves PNGs to disk.
// 5 scenes × ko/en/ja × {iOS 6.9" 1320x2868, Play phone 1080x2160}.
// Caption copy = WIM_STORE_KIT.md §6 (traffic-optimized per language, not a translation).
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.signumhq.com';
const OUT = path.join(__dirname, 'store-screenshots');

const COPY = {
  ko: [
    '오늘 급등락한 미국주식,<br>왜 움직였나',
    '수급·차트·거시를<br>4지선다로 학습',
    '정답 뒤엔 기관급 데이터<br>(다크풀·옵션)',
    '차트 → 기관 → 거시 → 뉴스<br>4갈래 커리큘럼',
    '매일 바뀌는<br>살아있는 투자 용어사전',
  ],
  en: [
    "Today's biggest stock<br>move — explained",
    'Learn flow, charts &<br>macro — one tap',
    'Institutional data<br>behind every answer',
    'Charts → institutions<br>→ macro → news',
    "A living glossary,<br>updated with today's data",
  ],
  ja: [
    '今日動いた米国株、<br>その理由は？',
    '需給・チャート・マクロを<br>4択で学ぶ',
    '解説の先に機関級データ<br>（ダークプール）',
    'チャート → 機関 → マクロ<br>→ ニュースを体系学習',
    '毎日更新される<br>「生きた」投資用語集',
  ],
};

const SCENES = ['home', 'quiz', 'answer', 'curriculum', 'dictionary'];

const DEVICES = [
  { name: 'ios-6.9', w: 440, h: 956, dsf: 3 },      // -> 1320x2868 (ASC 6.9")
  { name: 'ios-6.5', w: 428, h: 926, dsf: 3 },      // -> 1284x2778 (ASC 6.5" slot)
  { name: 'play-phone', w: 440, h: 880, dsf: 2.4545 }, // -> 1080x2160 (Play 2:1)
  // Play marks both tablet slots required. Render at a tablet CSS width (the app
  // column is max-width 560 and centred, so this is honestly what a tablet shows)
  // and scale up to an exact 9:16 so Play's aspect check can't argue.
  { name: 'play-tablet-7', w: 540, h: 960, dsf: 2 },   // -> 1080x1920
  { name: 'play-tablet-10', w: 720, h: 1280, dsf: 2 }, // -> 1440x2560
];

// Optional device filter: `node make-store-shots.js tablet` shoots only tablets.
const ONLY = process.argv[2];
const RUN = ONLY ? DEVICES.filter((d) => d.name.includes(ONLY)) : DEVICES;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function injectCaption(page, html, scale = 1) {
  await page.evaluate(([html, scale]) => {
    const H = Math.round(150 * scale), F = Math.round(23 * scale);
    const old = document.getElementById('__wimcap'); if (old) old.remove();
    const band = document.createElement('div');
    band.id = '__wimcap';
    band.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:' + H + 'px;z-index:2147483647;background:linear-gradient(135deg,#6E5DEC,#43319F);display:flex;align-items:center;justify-content:center;text-align:center;padding:0 22px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;box-shadow:0 6px 20px rgba(67,49,159,0.28);';
    band.innerHTML = '<div style="color:#fff;font-size:' + F + 'px;font-weight:900;line-height:1.3;letter-spacing:-0.02em;">' + html + '</div>';
    document.body.appendChild(band);
    document.body.style.paddingTop = H + 'px';
    // hide any scrollbars
    document.documentElement.style.overflow = 'hidden';
  }, [html, scale]);
}

async function setupScene(page, scene) {
  if (scene === 'home') { await page.evaluate(() => window.scrollTo(0, 0)); return; }
  if (scene === 'quiz' || scene === 'answer') {
    // click the hero CTA (largest button containing the arrow)
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => /→/.test(b.textContent || ''));
      btns.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
      if (btns[0]) btns[0].click();
    });
    await sleep(1200);
    if (scene === 'answer') {
      // pick the first choice (choice buttons contain an em dash)
      await page.evaluate(() => {
        const c = [...document.querySelectorAll('button')].find((b) => /—/.test(b.textContent || ''));
        if (c) c.click();
      });
      await sleep(1100);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    return;
  }
  if (scene === 'curriculum') {
    await page.evaluate(() => {
      const h = [...document.querySelectorAll('h2')].find((x) => /커리큘럼|Curriculum|カリキュラム|트랙|track/i.test(x.textContent || ''));
      if (h) { h.scrollIntoView({ block: 'start' }); window.scrollBy(0, -170); }
    });
    await sleep(500);
    return;
  }
  if (scene === 'dictionary') {
    await page.evaluate(() => {
      const nav = document.querySelector('nav');
      const items = nav ? [...nav.querySelectorAll('button')] : [];
      if (items[1]) items[1].click(); // 홈/사전 → index 1 = dictionary
    });
    await sleep(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    return;
  }
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  for (const dev of RUN) {
    for (const loc of ['ko', 'en', 'ja']) {
      for (let i = 0; i < SCENES.length; i++) {
        const scene = SCENES[i];
        const page = await browser.newPage();
        const alang = loc === 'ko' ? 'ko-KR,ko' : loc === 'ja' ? 'ja-JP,ja' : 'en-US,en';
        await page.setExtraHTTPHeaders({ 'Accept-Language': alang });
        // Force the shell's locale self-routing to keep the URL locale (this Mac is
        // ko, so navigator.language would otherwise bounce /en and /ja back to /ko).
        await page.evaluateOnNewDocument((loc) => {
          // Pages share one browser context, so the quiz answered while shooting
          // scene 3 leaked into every later capture (movers rail showed all-solved
          // checkmarks on a "first launch" shot). Wipe before each document loads
          // so every screenshot is a genuine fresh-install state.
          try { localStorage.clear(); } catch (e) {}
          try { localStorage.setItem('wim.onboard', '1'); localStorage.setItem('wim.locale', loc); } catch (e) {}
          try {
            Object.defineProperty(navigator, 'language', { get: () => (loc === 'ko' ? 'ko-KR' : loc === 'ja' ? 'ja-JP' : 'en-US') });
            Object.defineProperty(navigator, 'languages', { get: () => [loc] });
          } catch (e) {}
        }, loc);
        await page.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: dev.dsf });
        try {
          await page.goto(`${BASE}/${loc}/wim`, { waitUntil: 'networkidle2', timeout: 45000 });
        } catch (e) { await sleep(1500); }
        await sleep(2600);
        try { await setupScene(page, scene); } catch (e) { console.log('setup fail', loc, scene, String(e)); }
        await injectCaption(page, COPY[loc][i], dev.w / 440);
        await sleep(400);
        const dir = path.join(OUT, dev.name, loc);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${i + 1}-${scene}.png`);
        await page.screenshot({ path: file });
        console.log('saved', path.relative(__dirname, file));
        await page.close();
      }
    }
  }
  await browser.close();
  console.log('DONE');
})();
