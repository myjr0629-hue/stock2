// ============================================================================
// make-promo-shots — SIGNUM · UC 실화면 캡처 공장 (WIM make-store-shots.js 이식판)
// ----------------------------------------------------------------------------
// 산출물 용도: SNS 포스트(앱 실화면), 디렉터리 등재 이미지, 보도자료 첨부,
//             (차기 바이너리 때) 스토어 스크린샷 원판.
// WIM 공장과 같은 뼈대 — 로케일 셀프라우팅 고정, 캡션 밴드 주입, dsf 로 해상도 확보.
// SIGNUM 은 온보딩 게이트(signumhq.app.onboarding.v1=accepted)를 미리 심어 통과한다.
// 사용:  node scripts/make-promo-shots.js [signum|uc] [social|store]
// ============================================================================
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.signumhq.com';
const OUT = path.join(__dirname, '..', 'promo-shots');

const APPS = {
  signum: {
    onboardKey: ['signumhq.app.onboarding.v1', 'accepted'],
    scenes: [
      { key: 'dash', path: (l) => `/${l}/app-view/dash` },
      { key: 'guardian', path: (l) => `/${l}/app-view/guardian` },
      { key: 'flow', path: (l) => `/${l}/app-view/flow` },
      { key: 'intel', path: (l) => `/${l}/app-view/intel` },
    ],
    copy: {
      ko: {
        dash: '기관의 움직임을<br>한 화면에서',
        guardian: '시장 리스크를<br>실시간 감시',
        flow: '옵션 플로우 · 다크풀<br>기관 자금의 흔적',
        intel: '섹터별 AI 리포트<br>매일 장 마감 후',
      },
      en: {
        dash: 'What institutions do,<br>on one screen',
        guardian: 'Market risk,<br>watched in real time',
        flow: 'Options flow & dark pool —<br>the footprints of big money',
        intel: 'Sector AI reports,<br>every close',
      },
      ja: {
        dash: '機関投資家の動きを<br>ひとつの画面で',
        guardian: '市場リスクを<br>リアルタイム監視',
        flow: 'オプションフロー・ダークプール<br>機関資金の足跡',
        intel: 'セクター別AIレポート<br>毎日引け後に',
      },
    },
    band: 'linear-gradient(135deg,#0E2A3C,#050A14)',
  },
  uc: {
    onboardKey: null,
    scenes: [
      { key: 'home', path: (l) => `/${l}/undercurrent` },
      { key: 'diverge', path: (l) => `/${l}/undercurrent?open=NVDA` },
      { key: 'whales', path: (l) => `/${l}/undercurrent` , tab: 'whales' },
    ],
    copy: {
      ko: {
        home: '뉴스 뒤에서 움직이는<br>돈을 읽다',
        diverge: '뉴스와 자금 흐름의<br>«괴리»를 포착',
        whales: '기관·큰손의 움직임을<br>매일 브리핑',
      },
      en: {
        home: 'Read the money<br>behind the news',
        diverge: 'Catch the gap between<br>news and money',
        whales: 'Whale moves,<br>briefed daily',
      },
      ja: {
        home: 'ニュースの裏で動く<br>お金を読む',
        diverge: 'ニュースと資金の<br>「乖離」を捉える',
        whales: '機関・クジラの動きを<br>毎日ブリーフィング',
      },
    },
    band: 'linear-gradient(135deg,#0B6B57,#0B3D2C)',
  },
};

// social = X/디렉터리용 세로 1080×1920 급, store = ASC 6.9" 원판
const DEVICES = {
  social: [{ name: 'social-1080', w: 390, h: 693, dsf: 2.769 }],
  store: [
    { name: 'ios-6.9', w: 440, h: 956, dsf: 3 },
    { name: 'play-phone', w: 440, h: 880, dsf: 2.4545 },
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function injectCaption(page, html, band, scale = 1) {
  await page.evaluate(([html, band, scale]) => {
    const H = Math.round(140 * scale), F = Math.round(22 * scale);
    const old = document.getElementById('__cap'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = '__cap';
    el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:' + H + 'px;z-index:2147483647;background:' + band + ';display:flex;align-items:center;justify-content:center;text-align:center;padding:0 20px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;';
    el.innerHTML = '<div style="color:#fff;font-size:' + F + 'px;font-weight:900;line-height:1.32;letter-spacing:-0.02em;">' + html + '</div>';
    document.body.appendChild(el);
    document.body.style.paddingTop = H + 'px';
    document.documentElement.style.overflow = 'hidden';
  }, [html, band, scale]);
}

(async () => {
  const appArg = process.argv[2] || 'signum';
  const modeArg = process.argv[3] || 'social';
  const app = APPS[appArg];
  if (!app) { console.error('signum | uc'); process.exit(1); }
  const devices = DEVICES[modeArg] || DEVICES.social;

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  let made = 0;

  for (const dev of devices) {
    for (const loc of ['ko', 'en', 'ja']) {
      for (const scene of app.scenes) {
        const page = await browser.newPage();
        const alang = loc === 'ko' ? 'ko-KR,ko' : loc === 'ja' ? 'ja-JP,ja' : 'en-US,en';
        await page.setExtraHTTPHeaders({ 'Accept-Language': alang });
        await page.evaluateOnNewDocument(([loc, onboard]) => {
          // 셀프라우팅 고정 (WIM 공장과 동일 수법)
          try {
            localStorage.setItem('signumhq.locale', loc);
            localStorage.setItem('undercurrent.locale', loc);
            localStorage.setItem('wim.locale', loc);
            if (onboard) localStorage.setItem(onboard[0], onboard[1]);
          } catch {}
        }, [loc, app.onboardKey]);
        await page.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: dev.dsf });
        try {
          await page.goto(`${BASE}${scene.path(loc)}`, { waitUntil: 'networkidle2', timeout: 90000 });
          await sleep(6000);
          if (scene.tab === 'whales') {
            await page.evaluate(() => {
              const nav = document.querySelector('nav');
              const btns = nav ? [...nav.querySelectorAll('button')] : [];
              const target = btns.find((b) => /큰손|Whales|クジラ/i.test(b.textContent || ''));
              if (target) target.click();
            });
            await sleep(2500);
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          await injectCaption(page, app.copy[loc][scene.key], app.band, 1);
          await sleep(600);
          const file = path.join(OUT, `${appArg}-${scene.key}-${loc}-${dev.name}.png`);
          await page.screenshot({ path: file });
          const kb = Math.round(fs.statSync(file).size / 1024);
          console.log(`✓ ${path.basename(file)}  ${kb}KB`);
          made++;
        } catch (e) {
          console.log(`✗ ${appArg}-${scene.key}-${loc}: ${e.message.slice(0, 80)}`);
        }
        await page.close();
      }
    }
  }
  await browser.close();
  console.log(`\n완료: ${made}장 → promo-shots/`);
})();
