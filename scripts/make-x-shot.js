// ============================================================================
// make-x-shot — X(트위터) 댓글에 붙일 «오늘 데이터» 폰 스크린샷 1장을 만든다.
// ----------------------------------------------------------------------------
// 왜 promo-shots 를 안 쓰나 (2026-08-23 실측):
//   ①합성 캡션 폰트가 「関」을 못 그려 «機⬜資金» 두부글자가 박혔다.
//   ②390px 뷰포트에서 일본어 화면 제목이 두 줄로 깨졌다.
//   대표 지적 「엉성하게 대충 캡쳐한것 말고」에 해당하는 결함이라 별도 공장을 판다.
//
// 차이점: 캡션 밴드 없음(광고가 아니라 «데이터 공유»로 보여야 한다) ·
//         뷰포트 420px(제목 한 줄) · 하단은 탭바 실측선에서 자름 ·
//         워터마크는 이미지 안에(본문에 URL 을 반복하면 X 가 섀도우밴을 건다).
//
// 사용: node scripts/make-x-shot.js <signum|uc|wim> <ko|en|ja> <scene> [ticker]
//   scene: signum = dash|guardian|flow|intel  /  uc = home|diverge|whales  /  wim = home|quiz|library|record
// ============================================================================
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = 'https://www.signumhq.com';
const OUT = process.env.X_SHOT_OUT || path.join(process.env.HOME, 'Desktop', 'X 댓글용 이미지');
const VIEW = { w: 460, h: 900, dsf: 3 };

const SCENES = {
  signum: {
    onboard: ['signumhq.app.onboarding.v1', 'accepted'],
    path: (l, s, t) => `/${l}/app-view/${s}${t ? `?t=${t}` : ''}`,
  },
  uc: { onboard: null, path: (l, s) => `/${l}/undercurrent${s === 'home' ? '' : `?tab=${s}`}` },
  // WIM 도 홍보 대상이다. 세 앱 중 하나만 찍히면 나머지 둘은 영영 홍보가 안 된다.
  wim: { onboard: ['wim.onboard', '1'], path: (l, s) => `/${l}/wim${s === 'home' ? '' : `?tab=${s}`}` },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const [app = 'signum', loc = 'ja', scene = 'flow', ticker] = process.argv.slice(2);
  const cfg = SCENES[app];
  if (!cfg) { console.error('signum | uc | wim'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  const page = await browser.newPage();
  const alang = loc === 'ko' ? 'ko-KR,ko' : loc === 'ja' ? 'ja-JP,ja' : 'en-US,en';
  await page.setExtraHTTPHeaders({ 'Accept-Language': alang });
  await page.evaluateOnNewDocument(([loc, onboard]) => {
    try {
      // 세 앱 모두 자기 로케일 키를 읽는다. 하나라도 빠지면 셀프라우팅이 되돌려
      // «일본어로 찍었는데 한국어가 나오는» 사고가 난다(2026-08-25 WIM 에서 실제 발생).
      localStorage.setItem('signumhq.locale', loc);
      localStorage.setItem('undercurrent.locale', loc);
      localStorage.setItem('wim.locale', loc);
      if (onboard) localStorage.setItem(onboard[0], onboard[1]);
    } catch {}
  }, [loc, cfg.onboard]);
  await page.setViewport({ width: VIEW.w, height: VIEW.h, deviceScaleFactor: VIEW.dsf });

  await page.goto(`${BASE}${cfg.path(loc, scene, ticker)}`, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(7000);

  await page.evaluate(() => {
    document.querySelectorAll('.app-anchor-ad, [aria-label="Sponsored"], .uc-ad, [id*="google_ads"], iframe[src*="ads"]')
      .forEach((el) => el.remove());
    // 프로덕트헌트 런치 배너 제거 — 홍보용 스샷에 다른 배너가 들어가면 안 된다.
    // (배너는 producthunt.com 로 나가는 a 태그를 갖고 있다. 그 조상 블록을 지운다.)
    document.querySelectorAll('a[href*="producthunt.com"]').forEach((a) => {
      const box = a.closest('div');
      if (box && box.parentElement) box.remove();
    });
    for (const v of ['--app-anchor-ad-height', '--uc-ad-h', '--app-tabbar-lift', '--app-bottom-safe', '--uc-lift', '--uc-safe'])
      document.documentElement.style.setProperty(v, '0px');
    window.scrollTo(0, 0);
  });
  await sleep(1200);

  // Command 화면의 다크풀 카드는 «해석»이 접혀 있다. 공유 이미지에서는
  // 숫자보다 해석이 주인공이므로 펼친 상태로 찍는다.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-expanded') === 'false');
    if (b) b.click();
  });
  await sleep(900);

  const bottom = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('nav, [class*="tabbar"], [class*="tab-bar"], [class*="bottom-nav"]')];
    let best = 0;
    for (const b of bars) {
      const r = b.getBoundingClientRect();
      if (r.height > 40 && r.height < 140 && r.bottom > best) best = r.bottom;
    }
    return best || window.innerHeight;
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const raw = path.join('/tmp', `xshot-raw-${app}-${scene}-${loc}.png`);
  await page.screenshot({ path: raw, clip: { x: 0, y: 0, width: VIEW.w, height: Math.round(bottom) } });
  await browser.close();

  const out = path.join(OUT, `${stamp}-${app}-${scene}-${loc}${ticker ? '-' + ticker : ''}.png`);
  execFileSync('python3', [path.join(__dirname, 'x-watermark.py'), raw, out, app, loc], { stdio: 'inherit' });
  console.log(out);
})();
