#!/usr/bin/env node
// ============================================================================
// make-appreel-capture — 앱 «실화면 녹화» 프레임을 뽑는다(정지 캡처가 아니라).
//
// 왜 (2026-08-31 대표 지적):
//   「틱톡에서 조회수 폭발하는 영상을 만들어야 한다」. 정지 카드를 이어 붙이면
//   슬라이드쇼로 보이고 피드에서 넘겨진다. 우리한테 남들이 못 가진 자산은
//   «실제로 움직이는 앱 화면»이다. 그걸 이미지가 아니라 «영상»으로 쓴다.
//
// 검수 게이트는 캡처 공장과 같은 이유로 필수다 — 로딩 화면을 녹화하면
// 그게 그대로 발행된다.
//
// 실행: node scripts/make-appreel-capture.js <ko|en|ja> <scene> [ticker] [프레임수] [app]
//   app: signum(기본) | uc | wim  — 세 앱을 다 찍어야 한 앱만 홍보되지 않는다
// ============================================================================
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.signumhq.com';
const OUT = process.env.REEL_FRAMES || '/tmp/rshots/reel';
// 폰 비율(9:19.5). dsf 2 면 840×1820 — 1080 폭 릴에서 폰이 커도 선명하다.
const VIEW = { w: 420, h: 910, dsf: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const [loc = 'ko', scene = 'cmd', ticker = 'NVDA', nRaw, app = 'signum'] = process.argv.slice(2);
  // ⚠️ 앱마다 경로도 온보딩 키도 다르다. 하나만 하드코딩해 두면 나머지 둘은 영영 못 찍는다.
  const APPS = {
    signum: { onboard: ['signumhq.app.onboarding.v1', 'accepted'], path: () => `/${loc}/app-view/${scene}?t=${ticker}` },
    uc: { onboard: null, path: () => `/${loc}/undercurrent${scene === 'home' ? '' : `?tab=${scene}`}` },
    wim: { onboard: ['wim.onboard', '1'], path: () => `/${loc}/wim${scene === 'home' ? '' : `?tab=${scene}`}` },
  };
  const cfg = APPS[app] || APPS.signum;
  const N = Number(nRaw) || 96;
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  const page = await browser.newPage();
  const alang = loc === 'ko' ? 'ko-KR,ko' : loc === 'ja' ? 'ja-JP,ja' : 'en-US,en';
  await page.setExtraHTTPHeaders({ 'Accept-Language': alang });
  await page.evaluateOnNewDocument(([l, onboard]) => {
    try {
      // 세 앱이 각자 자기 로케일 키를 읽는다 — 하나라도 빠지면 셀프라우팅이 언어를 되돌린다
      localStorage.setItem('signumhq.locale', l);
      localStorage.setItem('undercurrent.locale', l);
      localStorage.setItem('wim.locale', l);
      if (onboard) localStorage.setItem(onboard[0], onboard[1]);
    } catch {}
  }, [loc, cfg.onboard]);
  await page.setViewport({ width: VIEW.w, height: VIEW.h, deviceScaleFactor: VIEW.dsf });
  await page.setCacheEnabled(false);

  const p0 = cfg.path();
  const url = `${BASE}${p0}${p0.includes('?') ? '&' : '?'}_cb=${Date.now()}`;
  // ⚠️ networkidle2 를 쓰면 안 된다 — 이 화면은 30초 갱신 · WebSocket ·
  //    인접 종목 프리페치가 계속 돌아서 «유휴»에 도달하지 않는다(2026-08-31 실제로
  //    타임아웃으로 캡처가 죽었다). 내용 확인은 아래 검수 게이트가 이미 한다.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(7000);

  // 광고·오버레이 제거 — 광고가 찍히면 그대로 발행된다
  await page.evaluate(() => {
    document.querySelectorAll('.app-anchor-ad, [aria-label="Sponsored"], [id*="google_ads"], iframe[src*="ads"]')
      .forEach((el) => el.remove());
  });

  // ⚠️ 앱은 «문서»가 아니라 내부 컨테이너를 스크롤한다. document.scrollingElement 만
  //    보면 높이가 뷰포트와 같게 나와 스크롤 0px 로 «정지 영상»이 찍힌다(실제로 겪었다).
  //    실제로 넘치는 엘리먼트를 찾아서 그걸 굴린다.
  const inspect = () => page.evaluate(() => {
    let best = document.scrollingElement, bestOver = 0;
    for (const el of document.querySelectorAll('*')) {
      const over = el.scrollHeight - el.clientHeight;
      const st = getComputedStyle(el);
      if (over > bestOver && el.clientHeight > 300 && /auto|scroll/.test(st.overflowY)) {
        best = el; bestOver = over;
      }
    }
    window.__reelScroller = best;
    return {
      loading: /Loading|로딩|読み込み/.test(document.body.innerText),
      nums: (document.body.innerText.match(/\d[\d,.]*/g) || []).length,
      height: best.scrollHeight,
      view: best.clientHeight,
      tag: best === document.scrollingElement ? 'document' : (best.tagName + '.' + (best.className || '').toString().slice(0, 40)),
    };
  });
  let st = await inspect();
  for (let i = 0; i < 4 && (st.loading || st.nums < 6); i++) {
    await sleep(9000);
    st = await inspect();
    console.log(`[재시도 ${i + 1}] loading=${st.loading} 숫자=${st.nums}`);
  }
  if (st.loading || st.nums < 6) {
    console.error(`[검수 실패] loading=${st.loading} 숫자=${st.nums} — 녹화하지 않는다.`);
    await browser.close();
    process.exit(2);
  }

  // 스크롤 구간 — 끝까지 가지 않는다. 하단 여백까지 찍으면 «빈 화면»이 나온다.
  const span = Math.max(0, Math.min(st.height - st.view, st.view * 2.2));
  console.log(`[녹화] 스크롤러 ${st.tag} · 높이 ${st.height}px · 스크롤 ${Math.round(span)}px · ${N}프레임`);
  if (span < 200) console.warn('[경고] 스크롤 폭이 작다 — 거의 정지 영상이 된다');

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // 가속·감속 — 기계적인 등속 스크롤은 «자동»으로 보인다
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.evaluate((y) => { (window.__reelScroller || document.scrollingElement).scrollTop = y; }, Math.round(span * ease));
    await sleep(45);
    await page.screenshot({ path: path.join(OUT, `${String(i).padStart(4, '0')}.png`) });
  }
  await browser.close();
  console.log(`${OUT}  ${N}프레임 · ${VIEW.w * VIEW.dsf}×${VIEW.h * VIEW.dsf}`);
})().catch((e) => { console.error(e); process.exit(1); });
