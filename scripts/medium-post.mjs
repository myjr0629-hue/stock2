/* ============================================================================
 * medium-post — Medium 새 글: 제목·본문(키 입력) → 앱 화면(드롭) → AI 지원 표시 → 발행 → 비로그인 검증.
 *
 * ★2026-09-24 정본화: /tmp/ego/medium-*.mjs 조각 9개(초안·발행·이미지가 따로, 이미지는 존재하지 않는 page.$ 사용).
 * 규칙(memory/medium-undisclosed-ai-cuts-reach-to-zero.md):
 *   · AI 지원 표시가 없으면 배포가 «작성자 팔로워»로 잘린다(우리 팔로워 ≈ 0) → 표시 문장이 본문에 없으면 거부
 *   · 링크는 스마트링크 ?from=medium 1개
 * 사용: /tmp/ego/medium-task.json = {"title":"…","before":["문단",…],"image":"/abs.png","after":["문단",…],
 *                                    "url":"https://signumhq.com/app?from=medium","disclosure":"Written with AI assistance. …",
 *                                    "topics":["Investing","Stock Market"],"dry":true}
 *       ego-browser nodejs < scripts/medium-post.mjs      (dry:true 면 초안까지만 만들고 스크린샷)
 *       {"edit_url":"https://medium.com/p/<id>/edit", …} 를 주면 새 글을 만들지 않고 그 초안을 발행만 한다
 * ★2026-09-24 실측: 발행 패널(/p/<id>/submission)의 확정 버튼 글자는 «Publish»다(«Publish now» 아님 — 첫 실행이 여기서 멈췄다).
 *   비로그인 검증은 온전한 크롬 UA 로만 200 이다(«Mozilla/5.0 (Macintosh)» 는 403, curl 도 403).
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/medium-task.json', 'utf8'));
if (!/signumhq\.com\/app(-uc|-wim)?\?from=medium/.test(T.url || '')) { console.log('⛔ 스마트링크(?from=medium) 필수'); process.exit(1); }
// ★2026-09-24: «1. …»로 시작하는 줄은 Medium 이 자동 번호 목록으로 바꿔 뒤 문단·링크·표시문까지 목록이 됐다 → 거부
if ([...(T.before || []), ...(T.after || [])].some((l) => /^\s*(\d+[.)]|[-*•])\s/.test(l))) { console.log('⛔ 줄 머리에 번호·글머리표 금지(Medium 자동 목록)'); process.exit(1); }
if (!/AI assistance/i.test(T.disclosure || '')) { console.log('⛔ AI 지원 표시 문장이 없다 — 배포가 팔로워(0)로 잘린다'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /medium\.com/, null);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
if (T.edit_url) {
  // 기존 초안 발행만 — 본문은 이미 검증된 초안(초안 주소는 이전 실행이 출력한 값을 그대로)
  if (!/^https:\/\/medium\.com\/p\/[0-9a-f]+\/edit$/.test(T.edit_url)) { console.log('⛔ edit_url 은 https://medium.com/p/<id>/edit'); process.exit(1); }
  try { await page.goto(T.edit_url, { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(9000);
  const d = await page.evaluate(() => { const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    return { disclosure: t.includes('AI assistance'), url: t.includes('from=medium') || !!document.querySelector('a[href*="from=medium"]'), imgs: document.querySelectorAll('[contenteditable="true"] img, figure img').length }; });
  console.log('기존 초안:', JSON.stringify(d));
  if (!d.disclosure || !d.url || !d.imgs) { console.log('⛔ 초안에 AI 표시·스마트링크·앱 화면 중 빠진 것이 있다 — 발행하지 않는다'); process.exit(1); }
} else {
try { await page.goto('https://medium.com/new-story', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
const ed = await page.evaluate(() => {
  const all = [...document.querySelectorAll('[contenteditable="true"]')].map((e) => ({ e, r: e.getBoundingClientRect() })).filter((o) => o.r.width > 200 && o.r.x >= 0);
  const o = all.sort((a, b) => b.r.width - a.r.width)[0];
  if (!o) return null; return { x: Math.round(o.r.x + 60), y: Math.round(o.r.y + 20) };
});
if (!ed) { console.log('⛔ 편집기 없음(로그인 확인)'); process.exit(1); }
await page.mouse.click(ed.x, ed.y, { label: 'Medium 편집기' }); await L.wait(700);
await page.keyboard.type(T.title, { delay: 4 }); await page.keyboard.press('Enter'); await L.wait(400);
for (const line of T.before || []) { await page.keyboard.type(line, { delay: 2 }); await page.keyboard.press('Enter'); await L.wait(200); }

// 앱 화면 — 빈 문단에서 편집기에 파일 드롭(메모리: Medium 은 드롭이 먹혔다)
if (T.image) {
  const b64 = fs.readFileSync(T.image).toString('base64');
  const n = await page.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'signum-app.png', { type: 'image/png' });
    const sel = window.getSelection(); const node = sel && sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement) : null;
    const target = (node && node.closest('[contenteditable="true"] p, [contenteditable="true"] div')) || document.querySelector('[contenteditable="true"]');
    const r = target.getBoundingClientRect(); const dt = new DataTransfer(); dt.items.add(file);
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.x + 10, clientY: r.y + 5 }));
    await new Promise((z) => setTimeout(z, 9000));
    return document.querySelectorAll('[contenteditable="true"] img, figure img').length;
  }, b64);
  console.log('본문 이미지:', n);
  if (!n) { console.log('⛔ 이미지가 안 들어갔다 — 발행하지 않는다(앱 화면 없는 글 금지)'); process.exit(1); }
  // 이미지 아래로 커서를 옮긴다 — 편집기 끝으로
  await page.keyboard.press('Meta+ArrowDown'); await L.wait(300); await page.keyboard.press('Enter'); await L.wait(300);
}
for (const line of T.after || []) { await page.keyboard.type(line, { delay: 2 }); await page.keyboard.press('Enter'); await L.wait(200); }
await page.keyboard.paste({ text: T.url }); await L.wait(600); await page.keyboard.press('Enter'); await L.wait(3000);
await page.keyboard.type(T.disclosure, { delay: 2 }); await L.wait(1500);

const st = await page.evaluate((a) => { const t = (document.body.innerText || '').replace(/\s+/g, ' ');
  return { title: t.includes(a.title.slice(0, 30)), url: t.includes('from=medium') || !!document.querySelector('a[href*="from=medium"]'), disclosure: t.includes('AI assistance'), imgs: document.querySelectorAll('[contenteditable="true"] img, figure img').length }; }, { title: T.title });
console.log('초안:', JSON.stringify(st), '주소:', await page.url());
await page.screenshot({ path: '/tmp/ego/medium-draft.png' });
if (!st.title || !st.disclosure || !st.imgs) { console.log('⛔ 초안이 불완전 — 발행하지 않는다'); process.exit(1); }
if (T.dry) { console.log('DRY — 초안까지만(발행 안 함)'); process.exit(0); }
}

// 발행 — 상단 «Publish» → 패널에서 주제 입력 → «Publish now»
const clickText = async (re, label) => {
  const p = await page.evaluate((src) => { const re = new RegExp(src); const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const e = [...document.querySelectorAll('button,[role=button]')].find((x) => re.test(n(x.innerText)) && x.getBoundingClientRect().width > 0);
    if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; }, re.source);
  if (!p) return false; await page.mouse.click(p.x, p.y, { label }); return true;
};
if (!(await clickText(/^Publish$/, 'Publish'))) { console.log('⛔ Publish 버튼 없음'); process.exit(1); }
await L.wait(6000);
if ((T.topics || []).length) {
  const inp = await page.evaluate(() => { const e = [...document.querySelectorAll('input')].find((x) => /topic/i.test(x.getAttribute('placeholder') || '') && x.getBoundingClientRect().width > 0);
    if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x + 20), y: Math.round(b.y + b.height / 2) }; });
  if (inp) { await page.mouse.click(inp.x, inp.y, { label: '주제 입력' }); for (const tp of T.topics.slice(0, 5)) { await page.keyboard.type(tp, { delay: 30 }); await L.wait(1200); await page.keyboard.press('Enter'); await L.wait(700); } }
}
// 패널 확정 버튼 — 패널 안에서는 «Publish» 하나뿐(상단 막대는 사라진다). 옛 문구 «Publish now» 도 받는다
if (!/\/submission/.test(await page.url())) { console.log('⛔ 발행 패널(/submission)이 안 열렸다:', await page.url()); process.exit(1); }
if (!(await clickText(/^Publish( now)?$/, 'Publish 확정'))) { console.log('⛔ 패널 확정 버튼 없음 — 초안으로 남았다:', await page.url()); process.exit(1); }
await L.wait(14000);
const pub = (await page.url()).split('?')[0];
if (!/medium\.com\/@[^/]+\/[^/]+-[0-9a-f]{8,}$/.test(pub)) { console.log('⛔ 발행 주소가 아니다:', pub); process.exit(1); }
console.log('발행 후 주소:', pub);

// 비로그인 검증 — 제목·이미지·링크
const res = await fetch(pub, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' } });
const html = await res.text();
console.log('공개 응답:', res.status, html.length);
const ok = { title: html.includes(T.title.slice(0, 30).replace(/&/g, '&amp;')) || html.includes(T.title.slice(0, 30)), img: /miro\.medium\.com\/v2/.test(html), link: /signumhq\.com\/app\?from(=|&#x3D;)medium/.test(html), disclosure: html.includes('AI assistance') };
console.log('공개 검증(비로그인):', JSON.stringify(ok));
if (!Object.values(ok).every(Boolean)) { console.log('⛔ 공개 페이지 확인 실패 — «발행했다»고 적지 않는다'); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', pub);
