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
L.assertFreshTask('/tmp/ego/thr-task.json'); // ★2026-10-04 낡은 작업 파일 거부(MISTAKES #52)
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
// ★2026-09-27 자기 글에 단 답글(정정 등)은 «답글» 탭이 아니라 원글 아래·프로필 «스레드»로 이어진다 — 실측: 답글 탭 0, 원글·프로필에서 보임.
//   답글 탭에서 못 찾고 대상이 우리 글이면 원글 → 프로필 순으로 다시 찾는다.
const PLACES = ['https://www.threads.com/@signumhq_official/replies'].concat(/\/@signumhq_official\//.test(task.post) ? [task.post.split('?')[0], 'https://www.threads.com/@signumhq_official'] : []);
const TARGET = '/' + task.post.split('?')[0].split('threads.com/')[1]; // 원글 자신은 답글이 아니다
let out = { found: false };
for (const where of PLACES) {
  try { await page.goto(where, { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(9000);
  out = await page.evaluate(function (a) {
    const hs = [...document.querySelectorAll('a[href^="/@signumhq_official/post/"]')].map(function (x) {
      let b = x; for (let i = 0; i < 8 && b.parentElement; i++) b = b.parentElement;
      return { h: x.getAttribute('href').split('?')[0].replace(/\/media$/, ''), has: (b.innerText || '').includes(a.M) };
    });
    const hit = hs.find(function (x) { return x.has && x.h !== a.T; });
    return { found: !!hit, url: hit ? 'https://www.threads.com' + hit.h : null, bodyHas: (document.body.innerText || '').includes(a.M) };
  }, { M: task.mark, T: TARGET });
  console.log(where, JSON.stringify(out));
  if (out.found) break;
}
if (!out.found) { console.log('\n⚠ 답글 탭·원글·프로필에서 mark 를 못 찾았다 — «게시됨»이라 쓰지 않는다'); process.exit(1); }
console.log('\n✅ 게시(내 답글 탭에서 확인):', out.url);
// ★2026-09-25 추가: «내 화면에 보임» ≠ «공개». @yahoofinance 글에 단 답글은 내 로그인 화면·부모 글 아래엔 보였지만
//   비로그인(크롤러)에선 ?error=invalid_post 였다(부모 계정의 답글 필터 또는 스팸 필터 추정). 그래서 공개 여부를 따로 잰다.
await L.wait(20000);
// ★2026-09-30 수리: Threads 는 메타 태그의 한·일 글자를 숫자 엔티티(&#x88dc; …)로 싣는다. 예전엔 &quot;·&amp; 만 풀고 비교해서
//   한국어·일본어 답글은 «항상» 공개 미확인으로 나왔다(9/30 05:5x @reutersjapan 답글 — 크롤러 og:description 에 본문이 있었는데 ⚠).
//   MISTAKES #8(엔티티 미해제 오탐)과 같은 종류. 그리고 «내 답글 주소가 열린다» ≠ «부모 글 아래 보인다» → 부모 글 HTML 에서 내 답글 코드도 찾는다.
const decodeEnt = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();
const CRAWLER = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
try {
  const r = await fetch(out.url, { headers: { 'user-agent': CRAWLER }, redirect: 'follow' });
  const html = await r.text();
  const m = html.match(/property="og:description"[^>]*content="([^"]*)"/);
  const desc = m ? squash(decodeEnt(m[1])) : '';
  const own = !/invalid_post/.test(r.url) && desc.includes(squash(task.mark).slice(0, 20));
  const code = (out.url.match(/\/post\/([A-Za-z0-9_-]+)/) || [])[1];
  let under = null;
  try { const pr = await fetch(task.post, { headers: { 'user-agent': CRAWLER }, redirect: 'follow' }); under = code ? (await pr.text()).includes(code) : null; } catch { /* 부모 확인 실패는 판정 보류 */ }
  console.log(own && under !== false
    ? `✅ 공개 확인(비로그인 크롤러: 내 답글 og:description · 부모 글 아래 ${under ? '보임' : '확인 못 함'})`
    : `⚠ 공개 미확인 — 내 답글 ${own ? '본문 있음' : (r.url.includes('invalid_post') ? 'invalid_post' : '본문 없음')} · 부모 글 아래 ${under === false ? '안 보임' : '확인 못 함'} (부모 계정 답글 필터/스팸 필터 가능). «공개 발행»이라 쓰지 않는다`);
} catch (e) { console.log('공개 확인 실패:', String(e.message).slice(0, 60)); }
