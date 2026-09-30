// iOS 위젯 인앱 이벤트 이미지 — 카드 16:9(1920x1080)·상세 9:16(1080x1920), ko/en/ja
// 애플 규정(in-app events): 글자·로고·CTA 넣지 않음(애플이 이름·짧은 설명을 덮는다) · 테두리·그라디언트 넣지 않음 → 단색 남색 + 하트 버튼 + 실제 위젯(배경화면 모서리 잘라냄)
// 원본: 코디네이터 simctl 스크린샷 크롭 ~/signum-ego-io/widget/ios-widget-{medium,small}-<loc>.png (NVDA·META·AMZN, 9/29 종가)
const puppeteer = require(require('path').join(process.env.HOME, '.gemini/antigravity/scratch/stock2/node_modules/puppeteer'));
const fs = require('fs'); const path = require('path');
const SRC = path.join(process.env.HOME, 'signum-ego-io/widget');
const OUT = path.join(process.env.HOME, 'Documents/signum-work/2026-09-30/store-1.10.0/event-widget');
const BG = '#070C17';
const HEART = 'M12 19.85C10.14 18.18 5.9 14.56 4.07 11.12A4.4 4.4 0 1 1 12 7.33A4.4 4.4 0 1 1 19.93 11.12C18.1 14.56 13.86 18.18 12 19.85z';
const heartSvg = (px) => `<svg viewBox="3 4.2 18 16.2" width="${px}" height="${Math.round(px * 16.2 / 18)}" style="display:block"><path d="${HEART}" fill="#FBBF24" stroke="#F59E0B" stroke-width="0.9" stroke-linejoin="round"/></svg>`;
const heartBtn = (w, h) => `<div style="width:${w}px;height:${h}px;border-radius:${Math.round(h * 0.235)}px;background:rgba(251,191,36,.12);border:${Math.max(2, Math.round(h / 60))}px solid rgba(251,191,36,.35);display:flex;align-items:center;justify-content:center;box-sizing:border-box">${heartSvg(Math.round(h * 0.56))}</div>`;
// 위젯 사각형(원본 px): medium x 24..1066 y 15..506 · small x 24..510 y 15..507 (9/30 실측) → 2px 안쪽, 모서리 64px
const RECT = { medium: [26, 17, 1064, 504], small: [26, 17, 508, 505] };
function widget(dataUrl, kind, cssW) {
  const [x0, y0, x1, y1] = RECT[kind]; const w = x1 - x0, h = y1 - y0; const s = cssW / w; const full = kind === 'medium' ? [1089, 518] : [538, 518];
  return `<div style="position:relative;width:${cssW}px;height:${Math.round(h * s)}px;border-radius:${Math.round(64 * s)}px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,.45)">
    <img src="${dataUrl}" style="position:absolute;left:${-x0 * s}px;top:${-y0 * s}px;width:${full[0] * s}px;height:${full[1] * s}px;max-width:none"/></div>`;
}
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  for (const loc of ['ko', 'en', 'ja']) {
    const med = 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, `ios-widget-medium-${loc}.png`)).toString('base64');
    const sml = 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, `ios-widget-small-${loc}.png`)).toString('base64');
    // 카드 1280x720 @1.5 = 1920x1080 : 왼쪽 하트 버튼 + 오른쪽 중형 위젯
    const card = `<html><body style="margin:0;width:1280px;height:720px;background:${BG};position:relative;overflow:hidden">
      <div style="position:absolute;left:150px;top:150px">${heartBtn(270, 210)}</div>
      <div style="position:absolute;left:520px;top:120px">${widget(med, 'medium', 660)}</div></body></html>`;
    // 상세 720x1280 @1.5 = 1080x1920 : 위 하트 버튼, 중형 위젯, 소형 위젯 — 아래 40%는 애플 글자 자리로 비운다
    const detail = `<html><body style="margin:0;width:720px;height:1280px;background:${BG};position:relative;overflow:hidden">
      <div style="position:absolute;left:260px;top:70px">${heartBtn(200, 156)}</div>
      <div style="position:absolute;left:40px;top:270px">${widget(med, 'medium', 640)}</div>
      <div style="position:absolute;left:210px;top:600px">${widget(sml, "small", 300)}</div></body></html>`;
    for (const [kind, html, vw, vh] of [['card', card, 1280, 720], ['detail', detail, 720, 1280]]) {
      const page = await browser.newPage();
      await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1.5 });
      await page.setContent(html, { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 400));
      const file = path.join(OUT, `event-widget-${kind}-${loc}-${kind === 'card' ? '1920x1080' : '1080x1920'}.png`);
      await page.screenshot({ path: file });
      await page.close();
      console.log('✓', path.basename(file));
    }
  }
  await browser.close();
})();
