/* ============================================================================
 * okky-post — OKKY 글 1편: 게시판 선택 → 제목 → 본문(HTML 붙여넣기) → 태그 → 등록 → 비로그인 공개 검증.
 *
 * ★2026-09-24 만든 이유: OKKY 발행은 /tmp/ego/okky-*.mjs 조각 20여 개로만 있었다(9/22·9/23).
 *   세션이 바뀌면 /tmp 는 «기억에만 있는 도구»가 된다 → 다른 발행기처럼 저장소에 한 파일로 둔다.
 * 함정(전부 실측):
 *   · 본문은 tiptap(ProseMirror). 키보드로 치면 «:/» 가 이모지(😕)로 바뀌어 https:// 링크가 깨진다(9/23)
 *     → 본문 전체를 «진짜 붙여넣기»(keyboard.paste {text, html})로 넣는다. 붙여넣기에는 입력 규칙이 안 걸린다.
 *   · 게시판은 «작성 대상을 검색» 칸에 키워드 → 목록에서 «키보드로» 고른다(좌표 클릭은 사이드바를 잡았다, 2회 실패).
 *   · /articles/write 는 404(주소 추측 금지). 작성 화면은 /community/new(9/23 실측 경로).
 * 사용(ego 런타임은 env·argv 를 못 받는다 → 작업 파일):
 *   /tmp/ego/okky-task.json = {"board":"칼럼","pick":0,"title":"…","html":"<p>…</p>","text":"…","tags":["a","b"],
 *                              "must":["본문에 반드시 있어야 할 문구"],"dry":true}
 *   dry=true  → 게시판 후보 목록만 출력하고 아무것도 입력하지 않는다.
 *   ego-browser nodejs < scripts/okky-post.mjs
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/okky-task.json', 'utf8'));
if (!/signumhq\.com\/app(-uc|-wim)?\?from=okky/.test(T.html || '')) { console.log('⛔ 본문에 스마트링크(?from=okky) 가 없다'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /okky\.kr/, null);
const shot = (n) => page.screenshot({ path: `/tmp/ego/okky-${n}.png` }).catch(() => {});
const box = (re) => page.evaluate((src) => {
  const rx = new RegExp(src);
  const e = [...document.querySelectorAll('input')].find((x) => rx.test(x.getAttribute('placeholder') || ''));
  if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
}, re);

try { await page.goto('https://okky.kr/community/new', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
if (!/okky\.kr\/community\/new/.test(await page.url())) { console.log('⛔ 작성 화면이 아니다(로그인 만료?):', await page.url()); await shot('0'); process.exit(1); }

// 1) 게시판 — 검색 후 목록을 읽고 키보드로 고른다
const sb = await box('작성 대상을 검색');
if (!sb) { console.log('⛔ 게시판 검색칸 없음'); await shot('0'); process.exit(1); }
await page.mouse.click(sb.x, sb.y, { label: '게시판 검색칸' }); await L.wait(800);
await page.keyboard.type(T.board, { delay: 70 }); await L.wait(2800);
const opts = await page.evaluate(() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('[role=option],[role=listbox] li,[cmdk-item]')].map((e) => n(e.innerText)).filter(Boolean).slice(0, 12);
});
console.log('게시판 후보:', JSON.stringify(opts));
if (T.dry) { await shot('dry'); console.log('dry — 입력하지 않고 끝낸다'); process.exit(0); }
for (let i = 0; i <= (T.pick || 0); i++) { await page.keyboard.press('ArrowDown'); await L.wait(350); }
await page.keyboard.press('Enter'); await L.wait(3000);

// 2) 제목
const tb = await box('제목을 입력');
if (!tb) { console.log('⛔ 제목칸 없음 — 게시판 선택 실패'); await shot('1'); process.exit(1); }
await page.mouse.click(tb.x, tb.y, { label: '제목칸' }); await L.wait(400);
await page.keyboard.type(T.title, { delay: 8 }); await L.wait(600);

// 3) 본문 — 진짜 붙여넣기(HTML)
const bb = await page.evaluate(() => { const e = document.querySelector('.tiptap.ProseMirror'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: Math.round(b.x + 30), y: Math.round(b.y + 12) }; });
if (!bb) { console.log('⛔ 본문칸 없음'); await shot('1'); process.exit(1); }
await page.mouse.click(bb.x, bb.y, { label: '본문칸' }); await L.wait(500);
await page.keyboard.paste({ text: T.text || '', html: T.html }); await L.wait(3000);

// 4) 태그
const tg = await box('태그를 콤마');
if (tg && (T.tags || []).length) { await page.mouse.click(tg.x, tg.y, { label: '태그칸' }); await L.wait(400); await page.keyboard.type(T.tags.join(','), { delay: 25 }); await L.wait(800); }

// 5) 등록 전 점검 — 빠진 문구·깨진 링크·이모지가 있으면 등록하지 않는다
const pre = await page.evaluate((must) => {
  const el = document.querySelector('.tiptap.ProseMirror'); const t = (el && el.innerText) || '';
  const title = (([...document.querySelectorAll('input')].find((x) => /제목을 입력/.test(x.getAttribute('placeholder') || '')) || {}).value || '');
  return { title, len: t.length, pre: el ? el.querySelectorAll('pre').length : 0,
    links: el ? [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')) : [],
    emoji: /\u{1F615}/u.test(t), missing: must.filter((m) => !t.includes(m)) };
}, T.must || []);
console.log('등록 전:', JSON.stringify(pre));
await shot('2-filled');
if (pre.title !== T.title) { console.log('⛔ 제목 불일치'); process.exit(1); }
if (pre.emoji || pre.missing.length || !pre.links.some((h) => /signumhq\.com\/app(-uc|-wim)?\?from=okky/.test(h || ''))) { console.log('⛔ 본문 점검 실패 — 등록하지 않는다'); process.exit(1); }

const sub = await page.evaluate(() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const e = [...document.querySelectorAll('button')].find((x) => n(x.innerText) === '등록' && x.getBoundingClientRect().width > 0);
  if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
});
if (!sub) { console.log('⛔ 등록 버튼 없음'); process.exit(1); }
await page.mouse.click(sub.x, sub.y, { label: '등록' });
await L.wait(10000);
const url = (await page.url()).split('?')[0];
if (!/okky\.kr\/articles\/\d+/.test(url)) { console.log('⛔ 글 주소로 안 넘어갔다:', url); await shot('3-after'); process.exit(1); }

// 6) 비로그인 공개 검증
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const res = await fetch(url, { headers: { 'user-agent': UA } });
const html = await res.text();
const ok = { status: res.status, title: html.includes(T.title.slice(0, 20)), must: (T.must || []).every((m) => html.includes(m)), link: /signumhq\.com\/app(-uc|-wim)?\?from=okky/.test(html), emoji: !/\u{1F615}/u.test(html) };
console.log('공개 검증(비로그인):', JSON.stringify(ok));
if (!(ok.status === 200 && ok.title && ok.must && ok.link && ok.emoji)) { console.log('⛔ 공개 페이지 확인 실패 —', url); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', url);
console.log('다음: node scripts/mkt-plan.js pub okky "' + url + '"');
