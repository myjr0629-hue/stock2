#!/usr/bin/env node
/* ============================================================================
 * naver-blog-post — 네이버 블로그(donneum) 한 편을 «처음부터 끝까지» 올린다. (2026-09-23 정리)
 *
 * 왜 한 파일로: 예전 흐름이 /tmp/ego 에 nb-*·nv-* 조각 20여 개로 흩어져 있었다. 세션이 바뀌면
 *   아무도 순서를 모른다. 이 파일이 정본이다. (조작 근거: memory/naver-smarteditor-flow.md)
 *
 * 사용(ego 런타임은 env·argv 를 못 받는다 → 작업 파일):
 *   /tmp/ego/naver-task.json = {"title","intro":[문단..],"image":"/abs.png","rest":[문단..],
 *                               "url":"https://signumhq.com/app?from=naver_blog&l=ko","footer","tags":[..]}
 *   ego-browser nodejs < scripts/naver-blog-post.mjs
 *
 * 2026-09-23 실측으로 확정된 것:
 *   · 편집기는 iframe#mainFrame 안 → 그 src(PostWriteForm.naver)로 직접 이동한다(ego 에 frames() 없음)
 *   · 제목은 .se-title-text 클릭 → keyboard.type, 제목에서 Enter 하면 본문 첫 문단으로 내려간다
 *   · 본문은 keyboard.type 만 먹는다(execCommand 무반응). URL 한 줄 + Enter → OG 카드(se-oglink)
 *   · 사진: 상단 툴바 «사진» → waitForFileChooser 가 «여기서는» 잡힌다(Medium 에서는 안 됐다) →
 *     한 장이면 «개별사진» 대화상자가 안 뜬다. 삽입 위치는 «커서 자리»(인트로 바로 아래에 들어갔다)
 *   · 발행: 헤더 «발행»은 JS click → 패널의 태그칸(placeholder «태그 입력 (최대 30개)») →
 *     패널 안 «발행»(y>200) → 주소가 PostView.naver?…logNo=… 로 바뀌면 성공
 *   · 검증은 로그인 없이 PostView.naver 를 curl — 제목·이미지(se-image-resource)·a[href] 링크
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/naver-task.json', 'utf8'));
if (!/signumhq\.com\/app(-uc|-wim)?\?from=naver_blog/.test(T.url || '')) { console.log('⛔ 스마트링크(?from=naver_blog) 필수'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /blog\.naver\.com/, null);
try { await page.goto('https://blog.naver.com/donneum?Redirect=Write', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
const src = await page.evaluate(() => { const f = document.querySelector('iframe#mainFrame'); return f ? f.src : null; });
if (!src) { console.log('⛔ 편집기 프레임 없음(로그인 확인)'); process.exit(1); }
try { await page.goto(src, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(11000);
const draft = await page.evaluate(() => /작성 중인 글|이어서 작성/.test(document.body.innerText));
if (draft) { console.log('⛔ «작성 중인 글» 팝업 — 기존 초안을 덮지 않도록 멈춘다. 화면에서 확인할 것'); process.exit(1); }

const at = async (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + Math.min(40, r.width / 2)), y: Math.round(r.y + r.height / 2) }; }, sel);
const t = await at('.se-title-text');
if (!t) { console.log('⛔ 제목칸 없음'); process.exit(1); }
await page.mouse.click(t.x, t.y); await L.wait(500);
await page.keyboard.type(T.title, { delay: 12 }); await L.wait(500);
await page.keyboard.press('Enter'); await L.wait(700);
for (const line of T.intro || []) { await page.keyboard.type(line, { delay: 6 }); await page.keyboard.press('Enter'); await L.wait(250); }
await L.wait(800);

let imgOk = false;
if (T.image) {
  const photo = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /사진/.test((x.getAttribute('data-name') || '') + (x.innerText || '') + (x.getAttribute('aria-label') || '')) && x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().y < 140);
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  try {
    const fcP = page.waitForFileChooser();
    await page.mouse.click(photo.x, photo.y);
    const fc = await fcP;
    if (typeof fc.setFiles === 'function') await fc.setFiles(T.image); else await fc.accept([T.image]);
    await L.wait(6000);
    const each = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,label,li,[role=button]')].find((x) => (x.innerText || '').trim() === '개별사진' && x.getBoundingClientRect().width > 0);
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (each) { await page.mouse.click(each.x, each.y); await L.wait(9000); }
    imgOk = await page.evaluate(() => document.querySelectorAll('.se-component.se-image').length > 0);
  } catch (e) { console.log('사진 실패:', String(e.message).slice(0, 80)); }
  if (!imgOk) { console.log('⛔ 앱 화면이 안 들어갔다 — 텍스트만 올리지 않는다(대표 지시). 초안은 남겨 둔다'); process.exit(1); }
}

const lastP = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle'));
  const p = ps[ps.length - 1]; if (!p) return null; p.scrollIntoView({ block: 'center' }); const r = p.getBoundingClientRect();
  return { x: Math.round(r.x + 20), y: Math.round(r.y + r.height / 2) };
});
await L.wait(900);
if (lastP) { await page.mouse.click(lastP.x, lastP.y); await L.wait(400); await page.keyboard.press('End'); }
for (const line of T.rest || []) { await page.keyboard.type(line, { delay: 5 }); await page.keyboard.press('Enter'); await L.wait(220); }
await page.keyboard.press('Enter');
// ★2026-09-26 URL 은 붙여넣는다(절차 · memory paste-urls-never-type-them). 편집기가 붙여넣기를 안 받으면 그때만 타이핑.
const urlIn = () => page.evaluate((u) => document.body.innerText.includes(u)
  || [...document.querySelectorAll('a[href], .se-oglink')].some((a) => String(a.href || a.innerText || '').includes('signumhq.com/app')), T.url);
await page.keyboard.paste({ text: T.url }); await L.wait(1500);
if (!(await urlIn())) { console.log('붙여넣기 미반영 → 타이핑으로 넣는다'); await page.keyboard.type(T.url, { delay: 10 }); }
else console.log('URL 붙여넣기 반영');
await page.keyboard.press('Enter'); await L.wait(5000);
if (T.footer) { await page.keyboard.type(T.footer, { delay: 5 }); await L.wait(1000); }

const st = await page.evaluate(() => ({
  comps: [...document.querySelectorAll('.se-component')].map((c) => (c.className.match(/se-(text|image|oglink|documentTitle)/) || [])[1] || '?').join(','),
  broken: /\u{1F615}/u.test(document.body.innerText),
}));
console.log('작성 상태:', JSON.stringify(st));
if (st.broken || !/oglink/.test(st.comps)) { console.log('⛔ 링크 카드가 없거나 URL 이 깨졌다 — 발행하지 않는다'); process.exit(1); }

await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === '발행' && x.getBoundingClientRect().y < 80); if (b) b.click(); });
await L.wait(3500);
const tag = await page.evaluate(() => { const e = document.querySelector('input[placeholder*="태그"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
if (tag && (T.tags || []).length) {
  await page.mouse.click(tag.x, tag.y); await L.wait(400);
  for (const tg of T.tags) { await page.keyboard.type(tg, { delay: 30 }); await page.keyboard.press('Enter'); await L.wait(350); }
}
const pub = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => (x.innerText || '').trim() === '발행' && x.getBoundingClientRect().y > 200).pop();
  if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
if (!pub) { console.log('⛔ 패널 발행 버튼 없음'); process.exit(1); }
await page.mouse.click(pub.x, pub.y);
await L.wait(12000);
const href = await page.evaluate(() => location.href);
const logNo = (href.match(/logNo=(\d+)/) || [])[1];
if (!logNo) { console.log('⛔ 발행 후 주소에 logNo 가 없다:', href.slice(0, 90)); process.exit(1); }
const pubUrl = `https://blog.naver.com/donneum/${logNo}`;
const html = await (await fetch(`https://blog.naver.com/PostView.naver?blogId=donneum&logNo=${logNo}`, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
const ok = { title: html.includes(T.title.slice(0, 12)), image: /se-image-resource/.test(html), link: /href="https:\/\/signumhq\.com\/app\?from&#x3D;naver_blog/.test(html) || /signumhq\.com\/app\?from=naver_blog/.test(html) };
console.log('공개 검증:', JSON.stringify(ok));
if (!Object.values(ok).every(Boolean)) { console.log('⛔ 공개 페이지 확인 실패 — «발행했다»고 적지 않는다:', pubUrl); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', pubUrl);
console.log('다음: node scripts/mkt-plan.js pub naver_blog "' + pubUrl + '"');
