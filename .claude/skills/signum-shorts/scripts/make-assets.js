// Render outro assets with puppeteer: rounded app icons + store badges (PNG,
// transparent background) so the outro matches the site's app row styling.
const puppeteer = require('C:/Users/seamo/backup/stock2/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'assets');
fs.mkdirSync(OUT, { recursive: true });
const PUB = 'C:/Users/seamo/backup/stock2/public';
const b64 = (p) => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;

const APPLE = 'M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z';

const badge = (glyph, small, big) => `
<div class="badge">
  ${glyph}
  <div class="txt"><span class="s">${small}</span><span class="b">${big}</span></div>
</div>`;

const PLAY = `<svg class="g" viewBox="0 0 24 24" width="34" height="34">
  <path fill="#00D3FF" d="M3.6 1.8c-.3.3-.5.8-.5 1.4v17.6c0 .6.2 1.1.5 1.4l.1.1 9.9-9.9v-.2L3.7 1.7l-.1.1z"/>
  <path fill="#FFCE00" d="M17 15.6l-3.4-3.4v-.2L17 8.6l.1.1 4 2.3c1.1.6 1.1 1.7 0 2.4l-4 2.2z"/>
  <path fill="#FF3A44" d="M17.1 15.5L13.6 12 3.6 22c.4.4 1 .4 1.7.1l11.8-6.6"/>
  <path fill="#00F076" d="M17.1 8.5L5.3 1.9c-.7-.4-1.3-.3-1.7.1l10 10 3.5-3.5z"/>
</svg>`;
const APPLE_SVG = `<svg class="g" viewBox="0 0 24 24" width="34" height="34"><path fill="#fff" d="${APPLE}"/></svg>`;

const HTML = `<html><head><meta charset="utf8"><style>
  body{margin:0;background:transparent;font-family:'Segoe UI',Arial,sans-serif}
  .row{display:flex;gap:28px;padding:10px}
  .icon{width:132px;height:132px;border-radius:30px;display:block;box-shadow:0 6px 18px rgba(0,0,0,.18)}
  .badge{width:268px;height:80px;background:#000;border:1.5px solid #4a4a4a;border-radius:14px;
         display:flex;align-items:center;gap:12px;padding:0 18px;box-sizing:border-box}
  .txt{display:flex;flex-direction:column;line-height:1.05;color:#fff}
  .s{font-size:14px;letter-spacing:.4px;opacity:.92}
  .b{font-size:26px;font-weight:700;letter-spacing:-.2px}
  .g{flex:0 0 34px}
</style></head><body>
  <div class="row" id="icons">
    <img class="icon" id="i1" src="${b64(PUB + '/app-icons/signum.png')}">
    <img class="icon" id="i2" src="${b64(PUB + '/app-icons/uc.png')}">
  </div>
  <div class="row" id="badges">
    <div id="b1">${badge(APPLE_SVG, 'Download on the', 'App Store')}</div>
    <div id="b2">${badge(PLAY, 'GET IT ON', 'Google Play')}</div>
  </div>
</body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 400, deviceScaleFactor: 2 });
  await page.setContent(HTML, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 400));
  for (const [sel, name] of [['#i1', 'app_signum'], ['#i2', 'app_uc'], ['#b1', 'badge_ios'], ['#b2', 'badge_play']]) {
    const el = await page.$(sel);
    await el.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: true });
    console.log('rendered', name);
  }
  await browser.close();
})();
