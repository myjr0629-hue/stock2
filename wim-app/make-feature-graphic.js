// Play Store feature graphic (1024x500), one per locale.
// Play crops/scales this in several places, so keep the logo and words well
// inside the frame and away from the edges — Google's guidance is that nothing
// essential should sit in the outer ~5%. No device frames, no store badges, no
// "#1"-style ranking claims (all are policy violations).
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'store-graphics');
const ICON = path.join(__dirname, 'assets', 'icon-only.png');

const COPY = {
  ko: { title: "Why'd It Move?", sub: '오늘 움직인 미국주식,<br>왜 움직였을까' },
  en: { title: "Why'd It Move?", sub: "Today's real movers,<br>explained in 3 minutes" },
  ja: { title: "Why'd It Move?", sub: '今日動いた米国株、<br>その理由は' },
};

const iconData = 'data:image/png;base64,' + fs.readFileSync(ICON).toString('base64');

const html = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1024px;height:500px;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',system-ui,sans-serif;
    background:linear-gradient(135deg,#6E5DEC 0%,#5440D4 45%,#43319F 100%);
    display:flex;align-items:center;gap:44px;padding:0 84px;position:relative}
  .glow{position:absolute;border-radius:50%;pointer-events:none}
  .g1{width:520px;height:520px;right:-120px;top:-160px;
    background:radial-gradient(circle,rgba(255,200,98,0.22),transparent 62%)}
  .g2{width:460px;height:460px;left:-140px;bottom:-200px;
    background:radial-gradient(circle,rgba(255,255,255,0.16),transparent 65%)}
  .icon{width:172px;height:172px;border-radius:40px;flex-shrink:0;position:relative;
    box-shadow:0 18px 44px rgba(20,10,60,0.42)}
  .txt{position:relative;color:#fff}
  h1{font-size:52px;font-weight:900;letter-spacing:-0.02em;line-height:1.05}
  p{margin-top:16px;font-size:29px;font-weight:700;line-height:1.34;color:rgba(255,255,255,0.93)}
  .tag{margin-top:22px;display:inline-block;font-size:19px;font-weight:800;
    color:#3A2B8F;background:#FFC862;border-radius:99px;padding:9px 20px}
</style></head><body>
  <div class="glow g1"></div><div class="glow g2"></div>
  <img class="icon" src="${iconData}" alt="">
  <div class="txt">
    <h1>${c.title}</h1>
    <p>${c.sub}</p>
    <span class="tag">${c.tag}</span>
  </div>
</body></html>`;

const TAG = { ko: '실제 데이터 · 하루 3분', en: 'Real data · 3 minutes a day', ja: '実データ · 1日3分' };

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  fs.mkdirSync(OUT, { recursive: true });
  for (const loc of ['ko', 'en', 'ja']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
    await page.setContent(html({ ...COPY[loc], tag: TAG[loc] }), { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 400));
    const file = path.join(OUT, `feature-${loc}.png`);
    await page.screenshot({ path: file });
    console.log('saved', path.relative(__dirname, file));
    await page.close();
  }
  await browser.close();
  console.log('DONE');
})();
