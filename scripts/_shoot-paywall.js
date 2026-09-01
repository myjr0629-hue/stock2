// 구독 심사용 스크린샷 — 애플은 «사용자가 보는 페이월»을 요구한다.
const puppeteer = require('puppeteer');
(async () => {
  const out = process.argv[2];
  const url = process.argv[3];
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--hide-scrollbars'] });
  const p = await b.newPage();
  // iPhone 15 Pro 논리 해상도 × 3 = 1179×2556 (앱스토어 허용 크기)
  await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise(r => setTimeout(r, 4500));
  // 웹사이트 크롬을 전부 숨긴다 — 심사자가 «앱 화면»으로 읽어야 한다.
  await p.evaluate(() => {
    const keep = document.querySelector('[role="dialog"]');
    document.querySelectorAll('body *').forEach((el) => {
      if (keep && (el.contains(keep) || keep.contains(el) || el === keep)) return;
      const st = getComputedStyle(el);
      if (st.position === 'fixed' || st.position === 'sticky') el.style.display = 'none';
    });
    document.querySelectorAll('header, nav, footer').forEach((el) => { el.style.display = 'none'; });
    // Next.js 개발 배지 (셰도우 DOM 포털)
    document.querySelectorAll('nextjs-portal, [data-nextjs-dialog], #__next-build-watcher')
      .forEach((el) => { el.remove(); });
    if (keep) { keep.style.background = 'transparent'; keep.style.backdropFilter = 'none'; }
    document.body.style.background =
      'radial-gradient(60% 40% at 20% 15%, rgba(56,189,248,.20), transparent 60%),' +
      'radial-gradient(50% 40% at 85% 70%, rgba(16,185,129,.16), transparent 60%),' +
      'linear-gradient(180deg,#0a1020,#050912)';
  });
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: out });
  await b.close();
  console.log(out);
})();
