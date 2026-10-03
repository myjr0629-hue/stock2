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
const BASE = T.base || 'https://www.signumhq.com'; // ★9/29 프리뷰 도메인도 찍는다(base)
const HOST = new URL(BASE).hostname;
if (!/^\/(en|ko|ja)\/app-view\//.test(T.path || '')) { console.log('⛔ path 는 /<언어>/app-view/… 여야 한다:', T.path); process.exit(1); }
fs.mkdirSync(path.dirname(T.out), { recursive: true });
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, new RegExp(HOST.replace(/\./g, '\\.')), BASE + '/robots.txt');
await page.cdp('Network.enable', {});
await page.cdp('Network.setCookie', { name: 'sig_native', value: '1', domain: HOST.endsWith('signumhq.com') ? '.signumhq.com' : HOST, path: '/', secure: true });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 402, height: 874, deviceScaleFactor: 3, mobile: true });
let prevLS = null; // ★10/3 개선: ls 로 덮어쓴 키의 «이전 값» — 찍은 뒤 되돌린다(사용자 프로필 원점에 해제 토큰·시험 목록이 남지 않게)
try {
  // ls: 찍기 전에 그 원점의 localStorage 에 넣을 값(예: 시험용 «내 종목» 목록) — 같은 원점 페이지에서 넣고 이동한다
  if (T.ls && typeof T.ls === 'object') {
    try { await page.goto(BASE + '/robots.txt'); } catch {}
    prevLS = await page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), Object.keys(T.ls));
    await page.evaluate((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, T.ls);
    console.log('localStorage 설정:', Object.keys(T.ls).join(','));
  }
  await page.goto(BASE + T.path);
  await L.wait(T.wait || 12000);
  // hideText: 이 탭에서만 가릴 겹침 창(예: 첫 실행 «필수 고지» — 동의 클릭은 대표 몫이라 누르지 않고 숨겨서 찍는다) + Vercel 프리뷰 도구 막대
  if (T.hideText) {
    const hidden = await page.evaluate((src) => {
      const re = new RegExp(src); let n = 0;
      for (const e of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(e);
        if ((cs.position === 'fixed' || cs.position === 'absolute') && re.test(e.innerText || '') && e.getBoundingClientRect().height > 200) { e.style.display = 'none'; n++; break; }
      }
      document.querySelectorAll('vercel-live-feedback, #vercel-live-feedback, [data-vercel-toolbar]').forEach((x) => { x.style.display = 'none'; n++; });
      return n;
    }, T.hideText);
    console.log('숨김(이 탭만):', hidden);
    await L.wait(800);
  }
  const info = await page.evaluate(() => ({ url: location.href, h: document.documentElement.scrollHeight, text: document.body.innerText.slice(0, 300) }));
  if (!/\/app-view\//.test(info.url)) { console.log('⛔ 앱 화면이 아니라 다른 곳으로 갔다(쿠키 미적용?):', info.url); process.exit(1); }
  console.log(JSON.stringify(info).slice(0, 500));
  // click: 찍기 전에 눌러 펼칠 것(예: "他4件を表示") — 공백 정규화 후 정규식으로 맞춘다(memory normalize-element-text-before-matching)
  if (T.click) {
    const p = await page.evaluate((src) => {
      const re = new RegExp(src); const nn = (s) => (s || '').replace(/\s+/g, ' ').trim();
      // 글자 없는 아이콘 버튼(검색 등)은 aria-label·title 로도 맞춘다
      const label = (x) => nn(x.innerText) || nn(x.getAttribute('aria-label')) || nn(x.getAttribute('title'));
      const e = [...document.querySelectorAll('button,[role=button],a,div,span')].filter((x) => re.test(label(x)) && x.getBoundingClientRect().width > 0)
        .sort((a, b) => label(a).length - label(b).length)[0];
      if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), t: nn(e.innerText) };
    }, T.click);
    if (!p) { console.log('⛔ 누를 것을 못 찾았다:', T.click); process.exit(1); }
    await page.mouse.click(p.x, p.y, { label: 'expand section' });
    await L.wait(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await L.wait(500);
    console.log('눌렀다:', p.t);
  }
  // scrollText: 앱 화면은 내부 스크롤(.app-main)이라 full 로는 아래가 안 찍힌다 → 글자로 찾아 그 위치로 스크롤한 뒤 찍는다
  if (T.scrollText) {
    const found = await page.evaluate((arg) => {
      const re = new RegExp(arg.src); const nn = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const e = [...document.querySelectorAll('h1,h2,h3,h4,div,span,p,button')].filter((x) => re.test(nn(x.innerText)) && x.getBoundingClientRect().height > 0)
        .sort((a, b) => nn(a.innerText).length - nn(b.innerText).length)[0];
      if (!e) return null; e.scrollIntoView({ block: 'start' });
      // ★10/3 scrollBy(음수 = 위로): 고정 머리줄(종목 탭 막대)이 맨 위를 덮어 카드 제목이 가려졌다 — 가려진 만큼 되돌린다
      if (arg.by) { let n = e.parentElement; while (n) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) break; n = n.parentElement; } (n || document.scrollingElement).scrollBy(0, arg.by); }
      return nn(e.innerText).slice(0, 40);
    }, { src: T.scrollText, by: T.scrollBy || 0 });
    console.log(found ? '스크롤: ' + found : '⛔ 스크롤 대상 못 찾음: ' + T.scrollText);
    await L.wait(1500);
  }
  const height = T.full && info.h > 874 ? info.h : 874;
  const r = await page.cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 402, height, scale: 1 }, captureBeyondViewport: !!T.full });
  fs.writeFileSync(T.out, Buffer.from(r.data, 'base64'));
  console.log('SHOT', T.out);
} finally {
  if (prevLS) {
    try { await page.goto(BASE + '/robots.txt'); } catch {}
    try { await page.evaluate((prev) => { for (const [k, v] of Object.entries(prev)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } }, prevLS); console.log('localStorage 복구:', Object.keys(prevLS).join(',')); } catch (e) { console.log('localStorage 복구 실패:', String(e.message).slice(0, 80)); }
  }
  await page.cdp('Emulation.clearDeviceMetricsOverride', {});
  await page.cdp('Network.deleteCookies', { name: 'sig_native', domain: HOST.endsWith('signumhq.com') ? '.signumhq.com' : HOST, path: '/' });
  try { await page.goto('about:blank'); } catch {}
}
