/* ============================================================================
 * threads-reply — 남의 Threads 글에 «데이터 답글»을 단다(+앱 화면 선택) + 내 답글 탭에서 확인.
 * (2026-09-25 신설 — threads_reply 채널이 규칙만 있고 도구가 없었다)
 * 사용: echo '{"post":"https://www.threads.com/@user/post/ID","file":"/tmp/ego/thr.txt","image":"/abs.png","mark":"본문에 반드시 있는 문구"}' > /tmp/ego/thr-task.json
 *       ego-browser nodejs < scripts/threads-reply.mjs
 * 규칙: 링크 없이(대화면 링크는 스팸으로 읽힌다) · 원문을 읽고 그 글의 질문에 답한다 · 예측·권유 금지.
 * 한국어 UI(9/25 실측 흐름): 글 아래 «<작성자>님에게 답글 남기기...» 칸 클릭(=스크롤) → 편집기 다시 재서 클릭 → 입력(Shift+Enter)
 *   → «작성 도구 확장» 모달(본문이 옮겨짐·파일칸 생김) → 이미지 → 모달 안 «게시» → 내 답글 탭에서 확인.
 * 이미지는 모달의 input[type=file] >> nth=0 로 넣고, 안 붙으면 텍스트만 올린다(답글은 대화라 텍스트만도 성립).
 * 확인: /@signumhq_official/replies 에서 mark 가 든 답글의 주소를 찾아 출력한다(없으면 «게시됨»이라 쓰지 않는다).
 * ========================================================================== */
import { readFileSync } from 'node:fs';
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const task = JSON.parse(readFileSync('/tmp/ego/thr-task.json', 'utf8'));
const text = readFileSync(task.file, 'utf8').trim();
if (/https?:\/\//i.test(text)) { console.log('⛔ 답글 본문에 링크 금지'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts;
try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /threads\.(net|com)/, null);
await L.trapDialogs(page);
try { await page.goto(task.post, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
const box = await page.evaluate(function () {
  const norm = function (s) { return (s || '').replace(/\s+/g, ' ').trim(); };
  const c = [...document.querySelectorAll('div,span,p')].map(function (e) { return { t: norm(e.innerText), r: e.getBoundingClientRect() }; })
    .filter(function (o) { return /님에게 답글 남기기/.test(o.t) && o.t.length < 60 && o.r.width > 80 && o.r.height > 10; })
    .sort(function (a, b) { return (a.r.top - b.r.top) || (a.r.width - b.r.width); });
  if (!c.length) return null;
  const r = c[0].r; return { x: Math.round(r.left + Math.min(r.width / 2, 160)), y: Math.round(r.top + r.height / 2), t: c[0].t };
});
if (!box) { console.log('NO_REPLY_BOX'); process.exit(1); }
console.log('답글 칸:', box.t);
await page.mouse.click(box.x, box.y); await L.wait(2500);
// ★2026-09-25 실측: 첫 클릭은 칸을 «화면 위로 스크롤»만 한다. 편집기를 다시 재서 가운데로 가져온 뒤 클릭해야 입력이 들어간다.
await page.evaluate(function () { const e = document.querySelector('[contenteditable="true"]'); if (e) e.scrollIntoView({ block: 'center' }); });
await L.wait(900);
const ed = await page.evaluate(function () { const e = document.querySelector('[contenteditable="true"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + 60), y: Math.round(r.top + r.height / 2) }; });
if (!ed) { console.log('NO_EDITOR'); process.exit(1); }
await page.mouse.click(ed.x, ed.y); await L.wait(900);
const lines = text.split('\n');
// 줄바꿈은 Shift+Enter(인라인 답글 칸에서 Enter 는 전송일 수 있다)
for (let i = 0; i < lines.length; i++) { if (lines[i].trim()) await page.keyboard.type(lines[i].trim(), { delay: 5 }); if (i < lines.length - 1) { await page.keyboard.press('Shift+Enter'); await L.wait(100); } }
await L.wait(1200);
const typed = await page.evaluate(function (M) { return [...document.querySelectorAll('[contenteditable="true"]')].some(function (x) { return (x.innerText || '').includes(M); }); }, task.mark);
if (!typed) { console.log('⛔ 편집기에 본문이 안 들어갔다 — 게시하지 않는다'); process.exit(1); }
// 이미지: 인라인 칸은 글자를 치면 사진 아이콘이 사라진다 → «작성 도구 확장»(aria-label)으로 모달을 열면 본문이 옮겨지고 input[type=file] 이 생긴다.
const ex = await page.evaluate(function () { const s = [...document.querySelectorAll('[aria-label="작성 도구 확장"]')].filter(function (e) { return e.getBoundingClientRect().width > 0; })[0]; if (!s) return null; const r = s.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
if (!ex) { console.log('NO_EXPAND'); process.exit(1); }
await page.mouse.click(ex.x, ex.y); await L.wait(4000);
const dlgOk = await page.evaluate(function (M) { const d = document.querySelector('[role=dialog]'); return !!d && (d.innerText || '').includes(M); }, task.mark);
if (!dlgOk) { console.log('⛔ 확장 모달에 본문이 없다 — 게시하지 않는다'); process.exit(1); }
if (task.image) {
  let n = 0;
  try { await page.setInputFiles('input[type=file] >> nth=0', task.image); await L.wait(7000);
        n = await page.evaluate(function () { const d = document.querySelector('[role=dialog]'); return d ? d.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length : 0; }); } catch (e) { console.log('첨부 예외:', String(e.message).slice(0, 70)); }
  console.log('첨부 이미지:', n, n ? '' : '(텍스트만 올린다)');
}
const p = await page.evaluate(function () {
  const d = document.querySelector('[role=dialog]'); const norm = function (s) { return (s || '').replace(/\s+/g, ' ').trim(); };
  const c = [...d.querySelectorAll('div[role=button],button')].map(function (x) { return { t: norm(x.innerText), r: x.getBoundingClientRect(), dis: x.getAttribute('aria-disabled') === 'true' }; })
    .filter(function (o) { return /^게시$/.test(o.t) && o.r.width > 30 && !o.dis; });
  if (!c.length) return null; const r = c[0].r; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
if (!p) { console.log('NO_POST_BUTTON'); process.exit(1); }
await page.mouse.click(p.x, p.y); await L.wait(14000);
try { await page.goto('https://www.threads.com/@signumhq_official/replies', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
const out = await page.evaluate(function (M) {
  const hs = [...document.querySelectorAll('a[href^="/@signumhq_official/post/"]')].map(function (a) {
    let b = a; for (let i = 0; i < 8 && b.parentElement; i++) b = b.parentElement;
    return { h: a.getAttribute('href').split('?')[0], has: (b.innerText || '').includes(M) };
  });
  const hit = hs.find(function (x) { return x.has; });
  return { found: !!hit, url: hit ? 'https://www.threads.com' + hit.h.replace(/\/media$/, '') : null, bodyHas: (document.body.innerText || '').includes(M) };
}, task.mark);
console.log(JSON.stringify(out));
if (out.found) console.log('\n✅ 게시·확인(내 답글 탭):', out.url);
else console.log('\n⚠ 내 답글 탭에서 mark 를 못 찾았다 — «게시됨»이라 쓰지 않는다');
