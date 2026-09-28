#!/usr/bin/env node
/* ============================================================================
 * quora-space-post — 우리 Quora Space(SIGNUM HQ — US Stock Market Intelligence)에 글 1편 + 이미지 + 앱 링크.
 *
 * ★2026-09-23 정본화: Space 는 «브랜드명·앱 링크·스크린샷이 허용되는 유일한 Quora 자리»다(답변은 링크 금지).
 *   9/20 에 손으로 올리며 밟은 함정 2개를 스크립트가 막는다:
 *     ① 이미지 file input 이 hidden → setInputFiles 가 «0 visible»로 거절 → style 로 노출한 뒤 넣는다
 *     ② URL 은 붙여넣기(paste) 한 번, Enter 없이 끝낸다 — 미리보기 카드가 생기며 카드 안에 URL 이 두 번 보이는 것은 정상
 *
 * 사용: /tmp/ego/qs-task.json = {"title":"…","text_file":"/tmp/ego/qs.txt","image":"/abs.png",
 *                                "url":"https://signumhq.com/app?from=quora_space","mark":"본문 고유 문구","dry":false}
 *       ego-browser nodejs < scripts/quora-space-post.mjs
 * 검증: Space 게시물 수 증가 + 새 글 페이지에서 mark·이미지·<a href=…from=quora_space> 확인.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const SPACE = 'https://signumhqusstockmarketintelligence.quora.com/';
let T;
try { T = JSON.parse(fs.readFileSync('/tmp/ego/qs-task.json', 'utf8')); } catch { console.log('작업 파일 없음'); process.exit(1); }
if (!/signumhq\.com\/app(-uc|-wim)?\?from=quora_space/.test(T.url || '')) { console.log('⛔ 스마트링크(?from=quora_space) 필수'); process.exit(1); }
const body = fs.readFileSync(T.text_file, 'utf8').replace(/\r/g, '').trim();
if (/https?:\/\//.test(body)) { console.log('⛔ 본문에는 URL 을 넣지 않는다 — 끝에 한 번만 붙인다'); process.exit(1); }
if (!body.includes(T.mark)) { console.log('⛔ mark 가 본문에 없다'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /quora\.com/, null);
try { await page.goto(SPACE, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);
let info = await page.info().catch(() => null); if (info && info.dialog) await page.dismissDialog();
const countPosts = () => page.evaluate(() => Number(((document.body.innerText || '').match(/(\d+)\s+posts?\b/i) || [])[1] || -1));
const before = await countPosts();

// ① «Post in SIGNUM HQ…» 입력 상자
const box = await page.evaluate(() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const e = [...document.querySelectorAll('div,span,button')].filter((x) => /^Post in SIGNUM HQ/.test(n(x.innerText)) && x.getBoundingClientRect().width > 0)
    .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
  if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect();
  return { x: Math.round(r.left + 60), y: Math.round(r.top + r.height / 2) };
});
if (!box) { console.log('⛔ «Post in SIGNUM HQ» 상자를 못 찾았다'); process.exit(1); }
await L.wait(600);
const box2 = await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const e = [...document.querySelectorAll('div,span,button')].filter((x) => /^Post in SIGNUM HQ/.test(n(x.innerText)) && x.getBoundingClientRect().width > 0)
    .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0]; const r = e.getBoundingClientRect();
  return { x: Math.round(r.left + 60), y: Math.round(r.top + r.height / 2) }; });
await page.mouse.click(box2.x, box2.y, { label: 'Space 글쓰기 상자' });
await L.wait(4500);

// ② 편집기(가장 넓은 contenteditable). 우리 초안이면 비우고, 모르는 글이면 멈춘다
const ed = await page.evaluate(() => {
  const e = [...document.querySelectorAll('[contenteditable=true]')].map((x) => ({ x, r: x.getBoundingClientRect() })).filter((o) => o.r.width > 200).sort((a, b) => b.r.width - a.r.width)[0];
  return e ? { x: Math.round(e.r.left + 40), y: Math.round(e.r.top + 20), len: (e.x.innerText || '').trim().length } : null;
});
if (!ed) { console.log('⛔ 편집기가 안 열렸다'); process.exit(1); }
await page.mouse.click(ed.x, ed.y, { label: '편집기' }); await L.wait(600);
if (ed.len > 0) {
  const ours = await page.evaluate((m) => [...document.querySelectorAll('[contenteditable=true]')].some((x) => (x.innerText || '').includes(m)), T.mark);
  if (!ours) { console.log(`⛔ 편집기에 모르는 글 ${ed.len}자 — 멈춘다`); process.exit(1); }
  await page.keyboard.press('Meta+a'); await L.wait(300); await page.keyboard.press('Backspace'); await L.wait(800);
}

// ③ 제목 줄 + 본문(빈 줄은 치지 않는다 — Enter 한 번이 문단)
const lines = [T.title, ...body.split('\n').filter((p) => p.trim())];
for (let i = 0; i < lines.length; i++) {
  await page.keyboard.type(lines[i], { delay: 4 });
  await page.keyboard.press('Enter'); await L.wait(120);
}
// ④ 이미지 — hidden input 을 드러낸 뒤 넣는다(커서 자리 = 본문 끝)
if (T.image) {
  await page.evaluate(() => { for (const i of document.querySelectorAll('input[type=file][accept="image/*"]')) i.setAttribute('style', 'position:fixed;left:0;top:0;opacity:1;display:block;width:10px;height:10px;z-index:99999'); });
  await page.setInputFiles('input[type=file][accept="image/*"] >> nth=0', [T.image]);
  let imgs = 0;
  for (let i = 0; i < 20 && !imgs; i++) { await L.wait(1500); imgs = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('[contenteditable=true]')].map((x) => x.querySelectorAll('img').length))); }
  console.log('편집기 안 이미지:', imgs);
  if (!imgs) { console.log('⛔ 이미지가 안 들어갔다 — 발행하지 않는다'); process.exit(1); }
  await page.keyboard.press('Enter'); await L.wait(300);
}
// ⑤ 링크 — 붙여넣기 한 번, Enter 없음
await page.keyboard.paste({ text: T.url }); await L.wait(2500);
const st = await page.evaluate((url) => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const edt = [...document.querySelectorAll('[contenteditable=true]')].sort((a, c) => c.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const txt = edt?.innerText || '';
  const b = [...document.querySelectorAll('div[role=button],button')].filter((e) => n(e.innerText) === 'Post' && e.getBoundingClientRect().width > 0).pop();
  const r = b ? b.getBoundingClientRect() : null;
  return { urlCount: txt.split(url).length - 1, len: txt.length, btn: r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), dis: b.getAttribute('aria-disabled') === 'true' } : null };
}, T.url);
console.log('채움:', JSON.stringify(st));
await page.screenshot({ path: '/tmp/ego/qs-filled.png' });
// 붙여넣은 URL 은 «링크 미리보기 카드»가 된다 — 카드가 제목 자리와 주소 줄에 URL 을 두 번 보여 준다(9/23 화면 확인).
//   9/20 의 «한 줄에 두 번»도 이것이었다. 그러므로 1~2 는 정상, 3 이상이면 진짜 중복이다.
if (st.urlCount < 1 || st.urlCount > 2) { console.log('⛔ 링크 개수 이상(' + st.urlCount + ') — 멈춘다'); process.exit(1); }
if (!st.btn) { console.log('⛔ Post 버튼 없음'); process.exit(1); }
if (T.dry) { console.log('DRY — 멈춘다'); process.exit(0); }
if (st.btn.dis) { await page.keyboard.type(' '); await L.wait(600); await page.keyboard.press('Backspace'); await L.wait(1200); }
await page.mouse.click(st.btn.x, st.btn.y, { label: 'Post' });
await L.wait(12000);

// ⑥ 검증 — Space 게시물 수 + 새 글 페이지
try { await page.goto(SPACE, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);
const after = await countPosts();
// 새 글 주소는 «제목 앞 단어로 만든 슬러그»로 찾는다. Space 목록은 인기순이라 새 글이 화면에 없을 수 있고,
//   앵커 글자에 제목이 안 들어 있는 경우도 있었다(9/23 실측: 게시물 4→5 인데 제목 글자 매칭은 실패).
// ★2026-09-25: Quora 슬러그는 문장부호를 «지우지» 않고 «-»로 바꾼다(today's → today-s). 지우면 todays 가 되어 못 찾았다.
const slug = T.title.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).slice(0, 4).join('-').toLowerCase();
const link = await page.evaluate((slug) => {
  const a = [...document.querySelectorAll('a[href*="signumhqusstockmarketintelligence.quora.com/"]')].find((x) => x.href.toLowerCase().includes(slug));
  return a ? a.href.split('?')[0] : null;
}, slug);
console.log('게시물 수:', before, '→', after, '· 새 글:', link);
if (!link) { console.log('⛔ 새 글 주소를 못 찾았다 — «발행했다»고 적지 않는다'); process.exit(1); }
try { await page.goto(link, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);
const v = await page.evaluate((a) => ({
  // ★2026-09-25: Quora 는 곧은 따옴표(')를 둥근 따옴표(’)로 바꿔 보여 준다 → 양쪽을 같은 모양으로 맞춰 비교
  mark: (document.body.innerText || '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').includes(a.mark.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')),
  img: [...document.querySelectorAll('img')].filter((i) => /qimg/.test(i.src)).length,
  href: [...document.querySelectorAll('a[href]')].some((x) => /signumhq\.com\/app(-uc|-wim)?\?from=quora_space/.test(decodeURIComponent(x.href))),
}), { mark: T.mark });
console.log('새 글 검증(로그인 화면):', JSON.stringify(v));
if (!(v.mark && v.img && v.href)) { console.log('⛔ 검증 실패'); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', link);
