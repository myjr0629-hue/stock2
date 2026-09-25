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
  const line = lines[i].trim();
  // URL 은 붙여넣는다 — 타이핑하면 편집기가 https:// 를 깨뜨린 적이 있다(memory paste-urls-never-type-them)
  if (/^https?:\/\//.test(line)) { await page.keyboard.paste({ text: line }); await L.wait(6000); }
  else if (line) await page.keyboard.type(line, { delay: 5 });
  if (i < lines.length - 1) { await page.keyboard.press('Enter'); await L.wait(130); }
}
await L.wait(2000);
// ★2026-09-26: 게시 «전에» 편집기 안의 글을 잰다 — 표식·링크가 그대로 들어가지 않았으면(일본어 입력 깨짐 등) 올리지 않는다.
const urls = lines.map(function (s) { return s.trim(); }).filter(function (s) { return /^https?:\/\//.test(s); });
const typed = await page.evaluate(function () {
  return [...document.querySelectorAll('[contenteditable="true"]')].map(function (x) { return x.innerText || ''; }).join('\n').replace(/\s+/g, ' ');
});
const missing = [task.mark].concat(urls).filter(function (s) { return s && !typed.includes(s.replace(/\s+/g, ' ')); });
if (missing.length) { console.log('⛔ 편집기 본문에 없음 — 게시하지 않는다:', JSON.stringify(missing).slice(0, 200), '| 편집기:', typed.slice(0, 160)); process.exit(1); }
console.log('편집기 본문 확인: 표식·링크 ' + (1 + urls.length) + '개 모두 있음');
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
// ★2026-09-26 수리: 프로필 맨 위 «고정됨» 글(9/25 부터)을 새 글로 오인했다 → 표식이 든 «고정 아닌» 글의 주소를 찾는다.
const out = await page.evaluate(function (MARK) {
  const hs = [...new Set([...document.querySelectorAll('a[href^="/@signumhq_official/post/"]')].map(function (a) { return a.getAttribute('href').split('?')[0].replace(/\/media$/, ''); }))];
  const rows = hs.map(function (h) { const a = document.querySelector('a[href^="' + h + '"]'); let b = a; for (let i = 0; i < 9 && b && b.parentElement; i++) b = b.parentElement; const t = (b ? b.innerText : '').replace(/\s+/g, ' '); return { h: h, has: t.includes(MARK), pinned: /고정됨|Pinned/.test(t) }; });
  const hit = rows.find(function (r) { return r.has && !r.pinned; });
  return { mine: (document.body.innerText || '').includes(MARK), url: hit ? 'https://www.threads.com' + hit.h : null };
}, MARK);
console.log(JSON.stringify(out));
if (out.url) console.log('✅ 새 글(고정 제외·표식 일치): ' + out.url); else console.log('⚠ 표식이 든 새 글 주소를 못 찾았다 — «발행했다»고 적지 않는다');
