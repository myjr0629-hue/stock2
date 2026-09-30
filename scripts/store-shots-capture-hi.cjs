// ============================================================================
// store-shots-capture-hi — 이벤트 카드·상세용 고해상도(402pt@4 = 1608px) «내 종목» 캡처 + 요소 좌표(JSON)
// compose-event-media.cjs 가 이 좌표로 목록 카드를 잘라 쓴다. 게이트 종목 검사·가격 실패 재시도 포함.
// 사용: node scripts/store-shots-capture-hi.cjs <출력폴더> [ko,en,ja]
// ============================================================================
// 이벤트 이미지용 고해상도 캡처(402pt @4 = 1608px) + 요소 좌표 측정 — 운영 www.signumhq.com, 읽기만
const puppeteer = require('puppeteer');
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2]; const LOCS = (process.argv[3] || 'ko,en,ja').split(',');
const TICKERS = (process.env.WL || 'NVDA,META,AMZN,GOOGL,PLTR').split(',');
const DSF = 4, VW = 402, VH = 1000;
const BLOCK = process.env.BLOCK || '\\b(MU|TSLA|AAPL|AMD|SPY|MSFT|IWM|ORCL)\\b|마이크론|테슬라|애플|マイクロン|テスラ|アップル|Micron|Tesla|Apple|Microsoft|Oracle';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  const now = Date.now();
  const wl = JSON.stringify({ v: 1, items: TICKERS.map((t, i) => ({ t, addedAt: now - (TICKERS.length - i) * 60000, src: 'cmd' })) });
  for (const loc of LOCS) {
    const file = path.join(OUT, `hi-list-${loc}.png`);
    if (fs.existsSync(file) && !process.env.FORCE) { console.log('  건너뜀', path.basename(file)); continue; }
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': loc === 'ko' ? 'ko-KR,ko' : loc === 'ja' ? 'ja-JP,ja' : 'en-US,en' });
    await page.evaluateOnNewDocument(([loc, wl]) => { try {
      localStorage.setItem('signumhq.locale', loc); localStorage.setItem('signumhq.app.locale', loc);
      localStorage.setItem('signumhq.app.onboarding.v1', 'accepted'); localStorage.setItem('sg-watchlist-v1', wl);
      localStorage.setItem('sg-watchlist-sort-v1', 'change'); } catch {} }, [loc, wl]);
    await page.setViewport({ width: VW, height: VH, deviceScaleFactor: DSF });
    await page.goto(`https://www.signumhq.com/${loc}/app-view/watchlist`, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(9000);
    // 실패 상태(가격 못 받음)·뼈대면 기다렸다 다시 연다 — 최대 3회
    for (let k = 0; k < 3; k++) {
      const bad = await page.evaluate(() => {
        const t = document.body.innerText || '';
        return /불러오지 못|Couldn.t load|読み込めません/.test(t) || !!document.querySelector('[aria-busy="true"]') || !/\$\d/.test(t);
      });
      if (!bad) break;
      console.log('    실패/로딩 상태 — 25초 뒤 다시', k + 1);
      await sleep(25000);
      await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
      await sleep(9000);
    }
    await page.evaluate(() => {
      document.querySelectorAll('.app-anchor-ad, [aria-label="Sponsored"]').forEach((el) => el.remove());
      document.documentElement.style.setProperty('--app-anchor-ad-height', '0px'); window.scrollTo(0, 0);
    });
    await sleep(1000);
    const m = await page.evaluate(() => {
      const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const list = document.querySelector('[role="list"]');
      const rows = [...document.querySelectorAll('[role="listitem"]')].map((r) => ({ t: (r.innerText || '').split('\n')[0], ...R(r) }));
      const h1 = [...document.querySelectorAll('h1, [class*="ttl"]')][0];
      const sorts = document.querySelector('[role="tablist"]');
      const bg = getComputedStyle(document.body).backgroundColor;
      return { list: R(list), rows, title: R(h1), sorts: R(sorts), bg, skel: document.querySelectorAll('[aria-busy="true"]').length, fail: /불러오지 못|Couldn.t load|読み込めません/.test(document.body.innerText || '') };
    });

        // 게이트 실패 종목(9/30 나스닥 전체 체인 대조 실패)이 «보이는 영역»에 있는지 — 있으면 쓰면 안 된다
        const blocked = await page.evaluate((limitY, BLOCK_RE) => {
          const BAD = new RegExp(BLOCK_RE);
          const out = new Set();
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walker.nextNode())) {
            const t = (n.textContent || '').trim();
            if (!t || !BAD.test(t)) continue;
            const el = n.parentElement; if (!el) continue;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (r.bottom <= 0 || r.top >= limitY || r.right <= 0 || r.left >= window.innerWidth) continue;
            out.add(t.slice(0, 60));
          }
          return [...out];
        }, VH, BLOCK);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: VW, height: VH } });
    fs.writeFileSync(file.replace('.png', '.json'), JSON.stringify({ at: new Date().toISOString(), dsf: DSF, blocked, ...m }, null, 1));
    console.log(`  ✓ ${path.basename(file)} rows=${m.rows.map((r) => r.t).join(',')} skel=${m.skel} fail=${m.fail} 차단종목=${blocked.length ? blocked.join(' / ') : '없음'}`);
    await page.close();
  }
  await browser.close();
})();
