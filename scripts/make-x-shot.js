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

// ★2026-10-04: 전체 시간 상한(기본 150초 · X_SHOT_TIMEOUT_S 로 조정). 10/4 06시 회차에서 GLD «옵션 플로우» 화면이 안 채워지자(스켈레톤 4·숫자 0)
//   재시도 루프가 상한 없이 39분을 돌았고 그동안 회차 전체가 멈췄다(게시 0). 5분 넘게 진전이 없으면 건너뛴다는 규칙을 도구가 스스로 지키게 한다.
//   종료코드 124 = 시간 초과(ego-run.sh 와 같은 값). 오류 때 열린 크롬은 puppeteer 의 exit 훅이 정리한다.
{ const HARD_S = Number(process.env.X_SHOT_TIMEOUT_S) > 0 ? Number(process.env.X_SHOT_TIMEOUT_S) : 150;
  setTimeout(() => { console.error(`⛔ make-x-shot ${HARD_S}초 초과 — 강제 종료(화면이 안 채워졌을 수 있다: ETF 는 «옵션 플로우» 카드가 비는 경우가 있다 — 다른 화면·종목으로)`); process.exit(124); }, HARD_S * 1000).unref(); }

const BASE = 'https://www.signumhq.com';
const OUT = process.env.X_SHOT_OUT || path.join(process.env.HOME, 'Desktop', 'X 댓글용 이미지');
// X_SHOT_VIEW="390x801@2.8308" — 스토어 규격 원본(1104×2268 = App Store 6.5\" 캔버스의 앱 영역)을 찍을 때
const VIEW = (() => { const m = String(process.env.X_SHOT_VIEW || '').match(/^(\d+)x(\d+)@([\d.]+)$/);
  return m ? { w: +m[1], h: +m[2], dsf: +m[3] } : { w: 460, h: 900, dsf: 3 }; })();

const SCENES = {
  signum: {
    onboard: ['signumhq.app.onboarding.v1', 'accepted'],
    path: (l, s, t) => `/${l}/app-view/${s}${t ? `?t=${t}` : ''}`,
  },
  // ★2026-09-27 앱의 딥링크 값은 ?tab=macro|div|whale|stories|search 다(undercurrent/page.tsx). 예전엔 diverge·whales 를
  //   그대로 보내 «홈»이 찍혔다(두 장이 바이트까지 같았다). 사람이 쓰는 이름을 앱의 값으로 바꿔 보낸다.
  uc: { onboard: null, path: (l, s) => { const t = ({ diverge: 'div', whales: 'whale' })[s] || s; return `/${l}/undercurrent${t === 'home' ? '' : `?tab=${t}`}`; } },
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
  // ★2026-10-04 «요청 종목 ≠ 화면 종목» 게이트용 — flow 화면에서만(선택된 종목 = 맨 위 검색칸의 값).
  //   10/4 08시 회차: `flow GOOGL` 이 META 카드로 «통과»해 GOOGL 이름의 META 이미지가 만들어졌다(GOOGL·META 두 파일이 바이트까지 같았다).
  //   위 검수는 «채워졌나»만 봤고 «요청한 종목이 맞나»는 안 봤다 — 눈으로 열어 보기 전까지 아무도 몰랐을 사고다.
  const WANT_T = (app === 'signum' && scene === 'flow' && ticker) ? String(ticker).toUpperCase() : '';
  const inspect = () => page.evaluate((want) => {
    const t = document.body.innerText || '';
    // ⚠️ [2026-09-03] 숫자 개수만 세면 «핵심 칸이 빈» 카드가 통과한다.
    //    실측: TSLA 플로우 카드가 MAX PAIN 「$—」·TOTAL PREMIUM 「—」 인데
    //    (2026-10-04 그 칸 이름을 값에 맞춰 NET PREMIUM·순 프리미엄·ネットプレミアム 으로 바꿨다 — 값은 콜 − 풋 «순» 금액, 합계가 아니다)
    //    RSI·VWAP·데이레인지 덕에 숫자 6개를 넘겨 게이트를 통과했다.
    //    카드의 존재 이유가 맥스페인·감마플립인데 그게 비면 홍보물로 못 쓴다.
    //    (한 번 더 만들면 채워진다 — 렌더 타이밍 문제라 재시도로 낫는다)
    const dash = /(MAX PAIN|GAMMA FLIP|TOTAL PREMIUM|NET PREMIUM|순 프리미엄|ネットプレミアム)\s*\n?\s*[$]?[—–-]\s*$/m.test(t)
      || /\$—|＄—/.test(t);
    // ★2026-09-26 추가: 스켈레톤(회색 막대 자리표시)은 글자가 없어 위 검사를 통과했다 — 일본어 가디언 «実体経済» 칸이
    //   빈 막대로 찍혔다. 화면에 보이는 스켈레톤/펄스 요소가 있으면 «덜 그려짐»으로 본다.
    const skel = [...document.querySelectorAll('[class*="skeleton" i], [class*="Skeleton"], .animate-pulse, [class*="shimmer" i]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 6 && r.top < window.innerHeight && r.bottom > 0; }).length;
    // 선택된 종목 = 검색칸의 값. 칸이 비어 있으면 본문에 요청 종목이 «단어»로 있는지로 대신 본다(BRK.B 같은 점은 이스케이프).
    let shown = '';
    if (want) {
      const inp = [...document.querySelectorAll('input')].find((e) => e.getBoundingClientRect().width > 80 && String(e.value || '').trim());
      shown = inp ? String(inp.value).trim().toUpperCase() : '';
    }
    const wrongTicker = !!want && (shown
      ? shown !== want
      : !new RegExp('(^|[^A-Z0-9.])' + want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Z0-9.]|$)').test(t));
    return {
      skeleton: skel,
      loading: /Loading\.\.\.|로딩\s*중|読み込み/.test(t),
      nums: (t.match(/\$-?[\d,.]+|-?[\d,.]+%/g) || []).length,
      blankCell: dash,
      len: t.length,
      shown, wrongTicker,
    };
  }, WANT_T);
  let st = await inspect();
  // 한 번만 더 기다리면 «주말·장마감» 처럼 느린 경로에서 그냥 실패한다.
  // 실패를 늘리지 말고 몇 번 더 기다린다 — 게이트는 유지된다.
  // (종목 불일치도 같은 재시도에 태운다 — 인접 종목을 불러오는 동안 기본 종목이 잠깐 보이는 느린 경로일 수 있다)
  const bad = (x) => x.loading || x.nums < 6 || x.blankCell || x.skeleton > 0 || x.wrongTicker;
  for (let i = 0; i < (Number(process.env.X_SHOT_RETRIES) || 3) && bad(st); i++) {
    await sleep(9000);
    st = await inspect();
    console.log(`[재시도 ${i + 1}] loading=${st.loading} 숫자=${st.nums} 빈칸=${st.blankCell} 스켈레톤=${st.skeleton}${WANT_T ? ` 종목=요청 ${WANT_T}/화면 ${st.shown || '?'}` : ''}`);
  }
  if (st.wrongTicker) {
    console.error(`[종목 불일치] 요청 «${ticker}» 인데 화면은 «${st.shown || '?'}» — 저장하지 않는다(종료 3). 이 종목은 버리고 다른 종목으로 간다(앱의 ?t= 처리 문제는 웹 담당 참고 — 홍보 사이클은 라이브 코드를 못 고친다).`);
    await browser.close();
    process.exit(3);
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

  // X_SHOT_NOADS=1 — 스토어 스크린샷용: 광고·스폰서 카드를 지운다(make-promo-shots.js 와 같은 선택자).
  //   스토어 스샷에 광고가 들어가면 안 된다. SNS 용 캡처에는 쓰지 않는다(앱의 실제 모습 그대로).
  if (process.env.X_SHOT_NOADS) {
    const n = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.app-anchor-ad, [aria-label="Sponsored"], .uc-ad, [id*="google_ads"], iframe[src*="ads"]')];
      // 본문 안 «SPONSOR» 하우스 카드도 뺀다(글자로 찾는다)
      for (const e of document.querySelectorAll('div')) { if (/^SPONSOR/.test((e.innerText || '').trim()) && e.getBoundingClientRect().height < 160 && e.getBoundingClientRect().height > 40) els.push(e); }
      els.forEach((el) => el.remove());
      document.documentElement.style.setProperty('--app-anchor-ad-height', '0px');
      return els.length;
    });
    console.log(`[광고 제거] ${n}개`);
    await sleep(800);
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
  // ★2026-10-04 09시: 원본 임시 파일 이름에 «종목·프로세스 번호»를 넣는다. 예전엔 `xshot-raw-<앱>-<장면>-<언어>.png` 한 이름이라
  //   같은 앱·장면·언어를 병렬로 찍으면(종목만 다르게) 서로의 원본을 덮어써 워터마크 단계가 남의 장면을 읽거나 터졌다
  //   (08시 «GOOGL 요청이 META 로 찍힘 — 두 파일 바이트까지 동일»의 실제 원인 후보 · 09시 AVGO 캡처가 워터마크 단계에서 종료 1).
  const raw = path.join('/tmp', `xshot-raw-${app}-${scene}-${loc}${ticker ? '-' + ticker : ''}-${process.pid}.png`);
  await page.screenshot({ path: raw, clip: { x: 0, y: 0, width: VIEW.w, height: Math.round(bottom) } });
  await browser.close();

  const out = path.join(OUT, `${stamp}-${app}-${scene}-${loc}${ticker ? '-' + ticker : ''}.png`);
  execFileSync('python3', [path.join(__dirname, 'x-watermark.py'), raw, out, app, loc], { stdio: 'inherit' });
  try { fs.unlinkSync(raw); } catch {}
  console.log(out);
})();
