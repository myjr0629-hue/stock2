/* ============================================================================
 * app-shot — 앱 화면(app-view)을 폰 뷰포트(402×874 @3x = 1206×2622)로 찍는다. ego 판.
 *
 * 왜 (2026-09-29 07:0x 실측): capture-app-screens.mjs(puppeteer)가 크롬을 못 띄웠다 —
 *   «Timed out after 30000 ms while waiting for the WS endpoint URL». 헤더 이미지에 쓸 실적 캘린더를
 *   새로 찍어야 했는데(9/26 캡처는 D−3·금요일 값), 도구가 없어서 사이클이 멈출 뻔했다.
 *   ego 는 이미 로그인·세션이 살아 있는 브라우저라 항상 뜬다.
 *
 * 주의:
 *   - ego 의 page.screenshot() 은 CSS 픽셀(1x)로 찍힌다 → CDP Page.captureScreenshot 을 쓴다.
 *     기기 배율(DSF 3)에 clip.scale 이 «곱해진다»(scale 3 → 9배, 3618px). 그래서 scale 1.
 *   - sig_native=1 쿠키를 심어야 앱 화면이 나온다. 사용자 프로필의 signumhq.com 이 앱 화면으로
 *     바뀌지 않게 찍은 뒤 반드시 지운다(finally).
 *
 * 사용(ego 런타임은 argv 를 못 받는다 → 작업 파일):
 *   echo '{"path":"/ja/app-view/earnings","out":"/tmp/ego/shots/earnings-ja.png","wait":12000}' > /tmp/ego/shot-task.json
 *   bash scripts/ego-run.sh scripts/ego/app-shot.mjs 180
 *   full:true 면 페이지 전체 높이로 찍는다.
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const path = (await import('node:path')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/shot-task.json', 'utf8'));
if (!/^\/(en|ko|ja)\/app-view\//.test(T.path || '')) { console.log('⛔ path 는 /<언어>/app-view/… 여야 한다:', T.path); process.exit(1); }
fs.mkdirSync(path.dirname(T.out), { recursive: true });
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /signumhq\.com/, 'https://www.signumhq.com/robots.txt');
await page.cdp('Network.enable', {});
await page.cdp('Network.setCookie', { name: 'sig_native', value: '1', domain: '.signumhq.com', path: '/', secure: true });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 402, height: 874, deviceScaleFactor: 3, mobile: true });
try {
  await page.goto('https://www.signumhq.com' + T.path);
  await L.wait(T.wait || 12000);
  const info = await page.evaluate(() => ({ url: location.href, h: document.documentElement.scrollHeight, text: document.body.innerText.slice(0, 300) }));
  if (!/\/app-view\//.test(info.url)) { console.log('⛔ 앱 화면이 아니라 다른 곳으로 갔다(쿠키 미적용?):', info.url); process.exit(1); }
  console.log(JSON.stringify(info).slice(0, 500));
  // click: 찍기 전에 눌러 펼칠 것(예: "他4件を表示") — 공백 정규화 후 정규식으로 맞춘다(memory normalize-element-text-before-matching)
  if (T.click) {
    const p = await page.evaluate((src) => {
      const re = new RegExp(src); const nn = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const e = [...document.querySelectorAll('button,[role=button],a,div,span')].filter((x) => re.test(nn(x.innerText)) && x.getBoundingClientRect().width > 0)
        .sort((a, b) => nn(a.innerText).length - nn(b.innerText).length)[0];
      if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), t: nn(e.innerText) };
    }, T.click);
    if (!p) { console.log('⛔ 누를 것을 못 찾았다:', T.click); process.exit(1); }
    await page.mouse.click(p.x, p.y, { label: 'expand section' });
    await L.wait(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await L.wait(500);
    console.log('눌렀다:', p.t);
  }
  const height = T.full && info.h > 874 ? info.h : 874;
  const r = await page.cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 402, height, scale: 1 }, captureBeyondViewport: !!T.full });
  fs.writeFileSync(T.out, Buffer.from(r.data, 'base64'));
  console.log('SHOT', T.out);
} finally {
  await page.cdp('Emulation.clearDeviceMetricsOverride', {});
  await page.cdp('Network.deleteCookies', { name: 'sig_native', domain: '.signumhq.com', path: '/' });
  try { await page.goto('about:blank'); } catch {}
}
