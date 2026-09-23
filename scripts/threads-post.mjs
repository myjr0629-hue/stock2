/* ============================================================================
 * threads-post — Threads(@signumhq_official) 원글 + 앱 화면 첨부 + 공개 확인. (2026-09-23 /tmp 에서 저장소로)
 * 사용: echo '{"file":"/tmp/ego/th.txt","image":"/abs/app.png","mark":"본문에 반드시 있는 문구"}' > /tmp/ego/th-task.json
 *       ego-browser nodejs < scripts/threads-post.mjs
 * 작성기는 한국어 UI(「새로운 소식이 있나요?」·「게시」). URL 은 줄 단독 + 6초 대기 → 링크 카드.
 * 이미지는 본문 입력 뒤 input[type=file] >> nth=0 로 넣고, 안 되면 게시하지 않는다(텍스트만 올리지 않는다).
 * ========================================================================== */
import { readFileSync } from 'node:fs';
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts;
try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /threads\.(net|com)/, null);
try { await page.goto('https://www.threads.com/@signumhq_official', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
await L.trapDialogs(page);
const b = await page.evaluate(function () {
  window.scrollTo(0, 0);
  const norm = function (s) { return (s || '').replace(/\s+/g, ' ').trim(); };
  const c = [...document.querySelectorAll('div,span')].map(function (e) { return { e: e, t: norm(e.innerText), r: e.getBoundingClientRect() }; })
    .filter(function (o) { return o.r.width > 100 && o.r.height > 14 && o.r.top > 40 && o.r.top < 700 && /^새로운 소식이 있나요\?$/.test(o.t); })
    .sort(function (a, b) { return a.r.top - b.r.top; });
  if (!c.length) return null;
  const r = c[0].r;
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
if (!b) { console.log('NO_BOX'); process.exit(1); }
await page.mouse.click(b.x, b.y); await L.wait(6000);
const ed = await page.evaluate(function () {
  const e = [...document.querySelectorAll('[contenteditable="true"]')].map(function (x) { return { r: x.getBoundingClientRect() }; })
    .filter(function (o) { return o.r.width > 150; }).sort(function (a, b) { return b.r.height - a.r.height; })[0];
  return e ? { x: Math.round(e.r.left + e.r.width / 2), y: Math.round(e.r.top + 20) } : null;
});
if (!ed) { console.log('NO_EDITOR'); process.exit(1); }
await page.mouse.click(ed.x, ed.y); await L.wait(700);
const task = JSON.parse(readFileSync('/tmp/ego/th-task.json', 'utf8'));
const lines = readFileSync(task.file, 'utf8').trim().split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim()) await page.keyboard.type(lines[i].trim(), { delay: 5 });
  if (i < lines.length - 1) { await page.keyboard.press('Enter'); await L.wait(130); }
  if (/^https?:\/\//.test(lines[i].trim())) await L.wait(6000);
}
await L.wait(2000);
if (task.image) {
  let n = 0;
  try { await page.setInputFiles('input[type=file] >> nth=0', task.image); await L.wait(8000);
        n = await page.evaluate(function () { return [...document.querySelectorAll('[contenteditable="true"]')].length && document.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length; }); } catch (e) { console.log('첨부 예외:', String(e.message).slice(0, 70)); }
  console.log('첨부 이미지:', n);
  if (!n) { console.log('⛔ 앱 화면이 안 붙었다 — 텍스트만 올리지 않는다'); process.exit(1); }
}
const p = await page.evaluate(function () {
  const norm = function (s) { return (s || '').replace(/\s+/g, ' ').trim(); };
  const c = [...document.querySelectorAll('div[role=button],button')].map(function (x) { return { x: x, t: norm(x.innerText), r: x.getBoundingClientRect() }; })
    .filter(function (o) { return o.r.width > 30 && o.r.height > 14 && /^게시$/.test(o.t); })
    .sort(function (a, b) { return b.r.top - a.r.top; });
  if (!c.length) return null;
  const r = c[0].r;
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
if (!p) { console.log('NO_POST'); process.exit(1); }
await page.mouse.click(p.x, p.y); await L.wait(11000);
const MARK = task.mark || '';
const out = await page.evaluate(function (MARK) {
  return { mine: (document.body.innerText || '').includes(MARK),
           own: [...document.querySelectorAll('a[href^="/@signumhq_official/post/"]')].map(function (a) { return a.getAttribute('href'); }).slice(0, 2) };
}, MARK);
console.log(JSON.stringify(out));
