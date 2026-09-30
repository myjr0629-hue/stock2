// ============================================================================
// store-shots-capture — 스토어 이미지용 운영 앱 화면 캡처(내 종목 시드 · 광고 앵커 제거 · 가격 실패 재시도 · 게이트 종목 노출 검사)
// 2026-09-30 인앱 이벤트 «My Watchlist»·CPP «watchlist (kw search)»·Play 맞춤 등록정보 이미지를 이걸로 만들었다.
//   · 내 종목은 localStorage 'sg-watchlist-v1' 로 시드한다(WL=쉼표 목록, 기본은 9/30 나스닥 체인 대조 «통과» 종목).
//   · 게이트 실패 종목(BLOCK 정규식)이 «보이는 영역»에 있으면 로그에 «차단종목=…» 으로 찍힌다 — 그 캡처는 쓰지 않는다.
//   · 운영에서 «가격을 불러오지 못했습니다»가 간헐적으로 떴다(9/30 15건 중 2건) → 25초 뒤 다시 연다(최대 3회).
// 사용: node scripts/store-shots-capture.cjs <출력폴더> <cpp|play|event> [ko,en,ja] [list,cmd,dash,flow,guardian,intel,heatmap]
// ============================================================================
// 운영(www.signumhq.com) «내 종목» 앱 화면 캡처 — make-promo-shots.js 와 같은 방식(퍼페티어·광고 앵커 제거)
// 사용: node capture.cjs <출력폴더> <모드:cpp|event> [로케일들] [장면들]
//   cpp   : 390x801 @2.8308 (= 1104x2268, 기본 스크린샷 합성 규격과 동일)
//   event : 402x(높이) @3     (= 1206 폭, 이벤트 카드·상세 크롭용)
// 장면마다 파일을 바로 저장한다(중간에 끊겨도 이어서 할 수 있게 — 있는 파일은 건너뜀, FORCE=1 이면 다시).
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.signumhq.com';
const OUT = process.argv[2];
const MODE = process.argv[3] || 'event';
const LOCS = (process.argv[4] || 'ko,en,ja').split(',');
const SCENES_ARG = (process.argv[5] || 'list,dash,cmd').split(',');
const TICKERS = (process.env.WL || 'NVDA,META,AMZN,GOOGL,PLTR').split(',');
const VIEW = MODE === 'cpp'
  ? { w: 390, h: 801, dsf: 2.8308 }
  : MODE === 'play'
    ? { w: 390, h: 658, dsf: 2.4616 }   // Play 1080x1920 합성용(앱 960x1620) — make-promo-shots 와 같은 규격
    : { w: 402, h: Number(process.env.VH || 1100), dsf: 3 };

const SCENES = {
  list: (l) => `/${l}/app-view/watchlist`,
  dash: (l) => `/${l}/app-view/dash`,
  cmd: (l) => `/${l}/app-view/cmd?t=${process.env.CMD_T || 'NVDA'}`,
  flow: (l) => `/${l}/app-view/flow`,
  guardian: (l) => `/${l}/app-view/guardian`,
  intel: (l) => `/${l}/app-view/intel`,
  heatmap: (l) => `/${l}/app-view/heatmap`,
};
// 9/30 홍보 게이트(나스닥 전체 체인 대조) 실패 종목 — 이 종목 수치는 스토어 이미지에 보이면 안 된다
const BLOCK = process.env.BLOCK || '\\b(MU|TSLA|AAPL|AMD|SPY|MSFT|IWM|ORCL)\\b|마이크론|테슬라|애플|マイクロン|テスラ|アップル|Micron|Tesla|Apple|Microsoft|Oracle';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  const now = Date.now();
  const wl = JSON.stringify({ v: 1, items: TICKERS.map((t, i) => ({ t, addedAt: now - (TICKERS.length - i) * 60000, src: 'cmd' })) });
  for (const loc of LOCS) {
    for (const key of SCENES_ARG) {
      const file = path.join(OUT, `${MODE}-${key}-${loc}.png`);
      if (fs.existsSync(file) && !process.env.FORCE) { console.log('  건너뜀(있음)', path.basename(file)); continue; }
      const page = await browser.newPage();
      const alang = loc === 'ko' ? 'ko-KR,ko' : loc === 'ja' ? 'ja-JP,ja' : 'en-US,en';
      await page.setExtraHTTPHeaders({ 'Accept-Language': alang });
      await page.evaluateOnNewDocument(([loc, wl]) => {
        try {
          localStorage.setItem('signumhq.locale', loc);
          localStorage.setItem('signumhq.app.locale', loc);
          localStorage.setItem('signumhq.app.onboarding.v1', 'accepted');
          localStorage.setItem('sg-watchlist-v1', wl);
          localStorage.setItem('sg-watchlist-sort-v1', 'change');
        } catch {}
      }, [loc, wl]);
      await page.setViewport({ width: VIEW.w, height: VIEW.h + (MODE === 'cpp' || MODE === 'play' ? 24 : 0), deviceScaleFactor: VIEW.dsf });
      // SIG_NATIVE=1: 네이티브 셸과 같은 쿠키(sig_native=1)로 연다 — 웹 전용 배너·안내가 앱처럼 숨는다(NativeAppProvider 가 앱에서 거는 값)
      if (process.env.SIG_NATIVE === '1') await page.setCookie({ name: 'sig_native', value: '1', domain: 'www.signumhq.com', path: '/' });
      try {
        await page.goto(`${BASE}${SCENES[key](loc)}`, { waitUntil: 'networkidle2', timeout: 90000 });
        await sleep(Number(process.env.WAIT || 9000));
        // 실패 상태(가격 못 받음)면 기다렸다 다시 연다 — 최대 3회(운영에서 간헐적으로 난다: 9/30 실측)
        for (let k = 0; k < 3; k++) {
          const bad = await page.evaluate(() => /불러오지 못|Couldn.t load|読み込めません/.test(document.body.innerText || ''));
          if (!bad) break;
          console.log('    가격 실패 상태 — 25초 뒤 다시', k + 1);
          await sleep(25000);
          await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
          await sleep(Number(process.env.WAIT || 9000));
        }
        await page.evaluate(() => {
          document.querySelectorAll('.app-anchor-ad, [aria-label="Sponsored"], [id*="google_ads"], iframe[src*="ads"]').forEach((el) => el.remove());
          document.documentElement.style.setProperty('--app-anchor-ad-height', '0px');
          document.documentElement.style.setProperty('--app-tabbar-lift', '0px');
          document.documentElement.style.setProperty('--app-bottom-safe', '0px');
          window.scrollTo(0, 0);
        });
        await sleep(1200);
        let clipH = VIEW.h;
        if (MODE === 'cpp' || MODE === 'play') {
          clipH = await page.evaluate(() => {
            const bars = [...document.querySelectorAll('nav, [class*="tabbar"], [class*="tab-bar"], [class*="bottom-nav"]')];
            let best = 0;
            for (const b of bars) {
              const r = b.getBoundingClientRect();
              if (r.height > 40 && r.height < 140 && r.bottom > best) best = r.bottom;
            }
            return Math.round(best || window.innerHeight);
          });
        }

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
        }, clipH, BLOCK);
        // 화면 상태 기록(빈칸·로딩 문구 점검용)
        const probe = await page.evaluate(() => {
          const txt = (document.body.innerText || '').replace(/\s+/g, ' ');
          return {
            skeletons: document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"], [aria-busy="true"]').length,
            pending: /갱신 대기|pending|更新待ち|불러오지 못|Couldn|取得できません/.test(txt),
            head: txt.slice(0, 260),
          };
        });
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: VIEW.w, height: clipH } });
        fs.writeFileSync(file.replace(/\.png$/, '.probe.json'), JSON.stringify({ at: new Date().toISOString(), url: SCENES[key](loc), view: VIEW, clipH, blocked, ...probe }, null, 1));
        console.log(`  캡처 ✓ ${path.basename(file)}  skel=${probe.skeletons} pending=${probe.pending} 차단종목=${blocked.length ? blocked.join(' / ') : '없음'}`);
      } catch (e) {
        console.log(`  캡처 ✗ ${key}-${loc}: ${String(e.message).slice(0, 90)}`);
      }
      await page.close();
    }
  }
  await browser.close();
})();
