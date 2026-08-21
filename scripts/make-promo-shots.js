// ============================================================================
// make-promo-shots — SIGNUM · UC 실화면 «합성» 캡처 공장
// ----------------------------------------------------------------------------
// v2 (2026-08-22): 뷰포트 통짜 캡처를 버리고 «합성»으로 바꿨다.
//   v1 의 실패: ①캡션 밴드를 paddingTop 으로 밀어넣어 하단 요소가 잘림
//               ②스폰서 앵커 광고가 콘텐츠를 덮음  ③1080x1919 (규격 1px 미달)
//   v2 방식: 앱 화면만 «광고 제거 상태»로 깨끗이 찍고(960x1620),
//            브랜드 캔버스(1080x1920) 위에 캡션 + 라운드 코너 + 하단 페이드로 합성.
//            잘린 가장자리를 페이드로 «의도된 것»으로 만든다 = 스토어 스샷 표준 기법.
// 산출물: SNS·디렉터리 등재·보도자료 첨부·(차기 바이너리 시)스토어 원판
// 사용:  node scripts/make-promo-shots.js [signum|uc]
// ============================================================================
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = 'https://www.signumhq.com';
const OUT = path.join(__dirname, '..', 'promo-shots');
const RAW = path.join(OUT, '_raw');

// 최종 캔버스 1080x1920 = 캡션 240 + 여백 60 + 앱 1620
const CANVAS = { w: 1080, h: 1920 };
const APP = { w: 960, h: 1620 };            // 앱 이미지 최종 크기
const VIEW = { w: 390, h: 658, dsf: 2.4616 }; // 390*2.4616=960, 658*2.4616=1620

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
      ko: { dash: '기관의 움직임을|한 화면에서', guardian: '시장 리스크를|실시간 감시', flow: '옵션 플로우 · 다크풀|기관 자금의 흔적', intel: '섹터별 AI 리포트|매일 장 마감 후' },
      en: { dash: 'What institutions do,|on one screen', guardian: 'Market risk,|watched in real time', flow: 'Options flow & dark pool|the footprints of big money', intel: 'Sector AI reports,|every close' },
      ja: { dash: '機関投資家の動きを|ひとつの画面で', guardian: '市場リスクを|リアルタイム監視', flow: 'オプションフロー・ダークプール|機関資金の足跡', intel: 'セクター別AIレポート|毎日引け後に' },
    },
    bg: [[14, 42, 60], [5, 10, 20]],   // 캔버스 그라디언트 (네이비)
    fg: [255, 255, 255],
  },
  uc: {
    onboardKey: null,
    scenes: [
      { key: 'home', path: (l) => `/${l}/undercurrent` },
      { key: 'diverge', path: (l) => `/${l}/undercurrent?open=NVDA` },
      { key: 'whales', path: (l) => `/${l}/undercurrent`, tab: 'whales' },
    ],
    copy: {
      ko: { home: '뉴스 뒤에서 움직이는|돈을 읽다', diverge: '뉴스와 자금 흐름의|«괴리»를 포착', whales: '기관·큰손의 움직임을|매일 브리핑' },
      en: { home: 'Read the money|behind the news', diverge: 'Catch the gap between|news and money', whales: 'Whale moves,|briefed daily' },
      ja: { home: 'ニュースの裏で動く|お金を読む', diverge: 'ニュースと資金の|「乖離」を捉える', whales: '機関・クジラの動きを|毎日ブリーフィング' },
    },
    bg: [[11, 107, 87], [11, 61, 44]],  // 그린
    fg: [255, 255, 255],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const appArg = process.argv[2] || 'signum';
  const app = APPS[appArg];
  if (!app) { console.error('signum | uc'); process.exit(1); }

  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(RAW, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  const jobs = [];

  for (const loc of ['ko', 'en', 'ja']) {
    for (const scene of app.scenes) {
      const page = await browser.newPage();
      const alang = loc === 'ko' ? 'ko-KR,ko' : loc === 'ja' ? 'ja-JP,ja' : 'en-US,en';
      await page.setExtraHTTPHeaders({ 'Accept-Language': alang });
      await page.evaluateOnNewDocument(([loc, onboard]) => {
        try {
          localStorage.setItem('signumhq.locale', loc);
          localStorage.setItem('undercurrent.locale', loc);
          if (onboard) localStorage.setItem(onboard[0], onboard[1]);
        } catch {}
      }, [loc, app.onboardKey]);
      await page.setViewport({ width: VIEW.w, height: VIEW.h + 24, deviceScaleFactor: VIEW.dsf });
      try {
        await page.goto(`${BASE}${scene.path(loc)}`, { waitUntil: 'networkidle2', timeout: 90000 });
        await sleep(6500);
        if (scene.tab === 'whales') {
          await page.evaluate(() => {
            const nav = document.querySelector('nav');
            const t = nav && [...nav.querySelectorAll('button')].find((b) => /큰손|Whales|クジラ/i.test(b.textContent || ''));
            if (t) t.click();
          });
          await sleep(2500);
        }
        // 광고·스폰서 앵커 제거 — 스토어 스샷에 광고가 들어가면 안 된다
        await page.evaluate(() => {
          document.querySelectorAll('.app-anchor-ad, [aria-label="Sponsored"], .uc-ad, [id*="google_ads"], iframe[src*="ads"]')
            .forEach((el) => el.remove());
          document.documentElement.style.setProperty('--app-anchor-ad-height', '0px');
          document.documentElement.style.setProperty('--uc-ad-h', '0px');
          // 탭바를 화면 바닥에 «밀착»시킨다. 기본값(lift 12px + safe area)이 만드는
          // 탭바 아래 틈으로 스크롤 콘텐츠가 비쳐 보였다(2026-08-22 실측).
          document.documentElement.style.setProperty('--app-tabbar-lift', '0px');
          document.documentElement.style.setProperty('--app-bottom-safe', '0px');
          document.documentElement.style.setProperty('--uc-lift', '0px');
          document.documentElement.style.setProperty('--uc-safe', '0px');
          window.scrollTo(0, 0);
        });
        await sleep(900);
        // 탭바 «하단 실측» — CSS 변수 주입만으로는 남는 1~3px 잔상을 여기서 확정 제거한다.
        const cropCss = await page.evaluate(() => {
          const bars = [...document.querySelectorAll('nav, [class*="tabbar"], [class*="tab-bar"], [class*="bottom-nav"]')];
          let best = 0;
          for (const b of bars) {
            const r = b.getBoundingClientRect();
            if (r.height > 40 && r.height < 140 && r.bottom > best) best = r.bottom;
          }
          return best || window.innerHeight;
        });
        const raw = path.join(RAW, `${appArg}-${scene.key}-${loc}.png`);
        await page.screenshot({
          path: raw,
          clip: { x: 0, y: 0, width: VIEW.w, height: Math.round(cropCss) },
        });
        jobs.push({ raw, key: scene.key, loc });
        console.log(`  캡처 ✓ ${appArg}-${scene.key}-${loc}`);
      } catch (e) {
        console.log(`  캡처 ✗ ${appArg}-${scene.key}-${loc}: ${e.message.slice(0, 70)}`);
      }
      await page.close();
    }
  }
  await browser.close();

  // ---- 합성 (Python/PIL) ----
  const spec = jobs.map((j) => ({
    raw: j.raw,
    out: path.join(OUT, `${appArg}-${j.key}-${j.loc}-1080x1920.png`),
    caption: app.copy[j.loc][j.key],
    loc: j.loc,
  }));
  fs.writeFileSync(path.join(RAW, 'spec.json'), JSON.stringify({
    spec, bg: app.bg, fg: app.fg, canvas: CANVAS, appSize: APP,
  }));
  console.log('\n합성 중…');
  execFileSync('python3', [path.join(__dirname, 'compose-promo-shots.py'), path.join(RAW, 'spec.json')], { stdio: 'inherit' });
})();
