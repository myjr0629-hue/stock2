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
  await page.evaluateOnNewDocument(([loc, onboard, unlock]) => {
    try {
      // 세 앱 모두 자기 로케일 키를 읽는다. 하나라도 빠지면 셀프라우팅이 되돌려
      // «일본어로 찍었는데 한국어가 나오는» 사고가 난다(2026-08-25 WIM 에서 실제 발생).
      localStorage.setItem('signumhq.locale', loc);
      localStorage.setItem('undercurrent.locale', loc);
      localStorage.setItem('wim.locale', loc);
      if (onboard) localStorage.setItem(onboard[0], onboard[1]);
      // X_SHOT_UNLOCK=1 — «광고 보고 1시간 해제»를 한 사용자와 같은 화면(잠금 카드 대신 실제 데이터)을 찍는다.
      //   앱의 실제 해제 저장값(adManager.grantPremiumAccess)과 같은 모양이다.
      if (unlock) localStorage.setItem('signum_ad_unlock', JSON.stringify({ unlockedUntil: Date.now() + 3600000, tier: 'premium' }));
    } catch {}
  }, [loc, cfg.onboard, !!process.env.X_SHOT_UNLOCK]);
  await page.setViewport({ width: VIEW.w, height: VIEW.h, deviceScaleFactor: VIEW.dsf });
  // ⚠️ 캐시를 끄지 않으면 «배포는 됐는데 이미지는 옛 화면»이 나온다.
  //    URL 쿼리로는 안 막혔다(puppeteer 자체 캐시). 실제로 겪었다.
  await page.setCacheEnabled(false);

  // 캐시된 옛 페이지를 찍으면 «배포했는데 화면은 옛것»이 그대로 이미지가 된다.
  // 실제로 겪었다(다크풀 판독 수정 직후). 캐시 무력화 파라미터를 붙인다.
  const bust = `${cfg.path(loc, scene, ticker)}${cfg.path(loc, scene, ticker).includes('?') ? '&' : '?'}_cb=${Date.now()}`;
  // ⚠️ networkidle2 를 쓰면 안 된다 — 이 화면은 30초 갱신 · WebSocket ·
  //    인접 종목 프리페치가 계속 돌아서 «유휴»에 도달하지 않는다(2026-08-31 실제로
  //    타임아웃으로 캡처가 죽었다). 내용 확인은 아래 검수 게이트가 이미 한다.
  await page.goto(`${BASE}${bust}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
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

  // ★ 발행 전 검수 게이트 — 2026-08-31 FNGR Command 화면이 «Loading...» 스켈레톤인
  //   채로 이미지가 만들어졌다. 그대로 X 에 붙였으면 빈 앱을 홍보한 꼴이 된다.
  //   화면이 안 채워졌으면 한 번 더 기다리고, 그래도 안 되면 저장하지 않는다.
  const inspect = () => page.evaluate(() => {
    const t = document.body.innerText || '';
    // ⚠️ [2026-09-03] 숫자 개수만 세면 «핵심 칸이 빈» 카드가 통과한다.
    //    실측: TSLA 플로우 카드가 MAX PAIN 「$—」·TOTAL PREMIUM 「—」 인데
    //    RSI·VWAP·데이레인지 덕에 숫자 6개를 넘겨 게이트를 통과했다.
    //    카드의 존재 이유가 맥스페인·감마플립인데 그게 비면 홍보물로 못 쓴다.
    //    (한 번 더 만들면 채워진다 — 렌더 타이밍 문제라 재시도로 낫는다)
    const dash = /(MAX PAIN|GAMMA FLIP|TOTAL PREMIUM)\s*\n?\s*[$]?[—–-]\s*$/m.test(t)
      || /\$—|＄—/.test(t);
    return {
      loading: /Loading\.\.\.|로딩\s*중|読み込み/.test(t),
      nums: (t.match(/\$-?[\d,.]+|-?[\d,.]+%/g) || []).length,
      blankCell: dash,
      len: t.length,
    };
  });
  let st = await inspect();
  // 한 번만 더 기다리면 «주말·장마감» 처럼 느린 경로에서 그냥 실패한다.
  // 실패를 늘리지 말고 몇 번 더 기다린다 — 게이트는 유지된다.
  const bad = (x) => x.loading || x.nums < 6 || x.blankCell;
  for (let i = 0; i < (Number(process.env.X_SHOT_RETRIES) || 3) && bad(st); i++) {
    await sleep(9000);
    st = await inspect();
    console.log(`[재시도 ${i + 1}] loading=${st.loading} 숫자=${st.nums} 빈칸=${st.blankCell}`);
  }
  if (bad(st)) {
    console.error(`[검수 실패] 화면이 안 채워졌다 — loading=${st.loading} 숫자=${st.nums} 빈칸=${st.blankCell} 글자=${st.len}. 저장하지 않는다.`);
    await browser.close();
    process.exit(2);
  }

  // ★2026-09-23 추가 — 화면 «한가운데 카드»를 찍고 싶을 때(예: Command 의 «의회 거래» 카드).
  //   X_SHOT_SCROLL_TEXT="Congress Trades" 처럼 카드 제목을 주면 그 카드가 화면 위쪽에 오도록 스크롤한다.
  //   주지 않으면 이전과 완전히 같다(맨 위부터 찍는다).
  // 탭 안에 있는 카드면 먼저 그 탭을 누른다(예: Command 의 «HOLDERS» 탭 안 «의회 거래»).
  if (process.env.X_SHOT_CLICK_TEXT) {
    const clicked = await page.evaluate((txt) => {
      const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const b = [...document.querySelectorAll('button,[role=tab],a')].find((e) => n(e.innerText) === txt && e.getBoundingClientRect().width > 0);
      if (!b) return false; b.click(); return true;
    }, process.env.X_SHOT_CLICK_TEXT);
    console.log(`[탭] «${process.env.X_SHOT_CLICK_TEXT}» ${clicked ? '누름' : '못 찾음'}`);
    await sleep(6000);
  }
  if (process.env.X_SHOT_SCROLL_TEXT) {
    // 카드 «제목»이 고정 헤더(뒤로·종목칩, 약 85px) 바로 아래에 오게 맞춘다.
    // ★2026-09-23 두 번 지나쳤다: ① closest() 로 큰 컨테이너를 잡아서 ② 스크롤 뒤 위쪽 스켈레톤이 줄어들어서.
    //   그래서 «한 번 스크롤»이 아니라 «맞추고 → 기다리고 → 다시 재서 맞추기»를 반복하고, 스크롤 주체도
    //   window 로 단정하지 않는다(앱 화면은 안쪽 컨테이너가 스크롤할 수 있다). 최종 위치를 찍어 남긴다.
    const pad = Number(process.env.X_SHOT_SCROLL_PAD) || 100;
    let top = null;
    for (let i = 0; i < 4; i++) {
      top = await page.evaluate((txt, pad) => {
        const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const el = [...document.querySelectorAll('h1,h2,h3,h4,div,span,p')].find((e) => n(e.innerText) === txt && e.getBoundingClientRect().height > 0);
        if (!el) return null;
        const before = el.getBoundingClientRect().top;
        if (Math.abs(before - pad) > 8) {
          let sc = el.parentElement;
          while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
          if (sc) sc.scrollTop += before - pad; else window.scrollBy(0, before - pad);
        }
        return Math.round(el.getBoundingClientRect().top);
      }, process.env.X_SHOT_SCROLL_TEXT, pad);
      if (top === null) break;
      await sleep(1500);
    }
    console.log(`[스크롤] «${process.env.X_SHOT_SCROLL_TEXT}» ${top === null ? '못 찾음 — 맨 위로 찍는다' : `제목 위치 y=${top}px(목표 ${pad})`}`);
  }

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
