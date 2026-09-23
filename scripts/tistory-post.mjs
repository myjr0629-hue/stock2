#!/usr/bin/env node
/* ============================================================================
 * tistory-post — 티스토리(smartbox.tistory.com) 한 편: 제목·본문·앱 화면·링크·태그 → «공개 발행» → RSS 로 공개 확인.
 * (2026-09-23 정본화 — /tmp/ego/ti* 조각을 한 파일로)
 *
 * 2026-09-23 실측:
 *   · 로그인은 살아 있었다(tistory.com 첫 화면에 「글쓰기·내 블로그·관리」). session-audit 이 /manage 의
 *     문구로 «끊김» 오판을 했던 것 — 점검 대상을 첫 화면으로 바꿨다.
 *   · 제목 #post-title-inp · 본문은 TinyMCE iframe #editor-tistory_ifr · 줄마다 keyboard.type + Enter
 *   · 앱 화면: 본문 iframe 문서에 drop 주입이 먹었다(파일 입력 0개). 인트로 바로 아래 커서 자리에 들어간다
 *   · 발행: 「완료」 → 레이어(공개 라디오 open20 기본) → 「공개 발행」 → /manage/posts/ 로 이동
 *   · 공개 확인: smartbox.tistory.com/rss 의 첫 item link → curl 로 제목·a[href] 확인(로그인 없이)
 * 사용: /tmp/ego/tistory-task.json = {title,intro[],image,rest[],url(?from=tistory),footer,tags[]}
 *       ego-browser nodejs < scripts/tistory-post.mjs
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String(e && e.message || e).slice(0, 70)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/tistory-task.json', 'utf8'));
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /tistory/, null);
try { await page.goto('https://smartbox.tistory.com/manage/newpost/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(12000);
await L.trapDialogs(page);   // «작성 중인 글» confirm 은 취소(새 글)로 닫힌다
console.log('URL:', (await page.evaluate(() => location.href)).slice(0, 70));
const tp = await page.evaluate(() => { const e = document.querySelector('#post-title-inp'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), v: e.value }; });
if (!tp) { console.log('⛔ 제목칸 없음'); process.exit(1); }
if (tp.v) { console.log('⛔ 제목칸에 이미 글이 있다(기존 초안) — 덮지 않는다:', tp.v.slice(0, 30)); process.exit(1); }
await page.mouse.click(tp.x, tp.y); await L.wait(600);
await page.keyboard.type(T.title, { delay: 8 }); await L.wait(900);
const pt = await page.evaluate(() => { const f = document.querySelector('#editor-tistory_ifr'); if (!f) return null; const r = f.getBoundingClientRect(); return { x: Math.round(r.left + 80), y: Math.round(r.top + 40) }; });
if (!pt) { console.log('⛔ 본문 iframe 없음'); process.exit(1); }
await page.mouse.click(pt.x, pt.y); await L.wait(800);
for (const t of T.intro) { await page.keyboard.type(t, { delay: 3 }); await page.keyboard.press('Enter'); await L.wait(150); }
await L.wait(800);
// 앱 화면 — 본문 iframe 문서에 drop 주입(인트로 바로 아래 커서 자리)
const b64 = fs.readFileSync(T.image).toString('base64');
const inj = await page.evaluate(async (b) => {
  const bin = atob(b); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const file = new File([arr], 'signum-cost-ko.png', { type: 'image/png' });
  const out = { inputs: 0, drop: false };
  const ins = [...document.querySelectorAll('input[type=file]')].filter((i) => /image|\*/.test(i.accept || '*'));
  out.inputs = ins.length;
  const f = document.querySelector('#editor-tistory_ifr'); const d = f && f.contentDocument;
  if (d) { const dt = new DataTransfer(); dt.items.add(file); const tgt = d.body; for (const ty of ['dragenter', 'dragover', 'drop']) tgt.dispatchEvent(new DragEvent(ty, { bubbles: true, cancelable: true, dataTransfer: dt })); out.drop = true; }
  return out;
}, b64);
console.log('이미지 주입:', JSON.stringify(inj));
await L.wait(12000);
let imgs = await page.evaluate(() => { const d = document.querySelector('#editor-tistory_ifr')?.contentDocument; return d ? d.querySelectorAll('img').length : -1; });
if (!imgs) {
  // 폴백: 숨은 file input 에 직접(첫 번째 이미지용)
  try { await page.setInputFiles('input[type=file] >> nth=0', T.image); await L.wait(12000); } catch (e) { console.log('setInputFiles 예외:', String(e.message).slice(0, 60)); }
  imgs = await page.evaluate(() => { const d = document.querySelector('#editor-tistory_ifr')?.contentDocument; return d ? d.querySelectorAll('img').length : -1; });
}
console.log('본문 이미지 수:', imgs);
// 나머지 — 문서 끝으로
await page.mouse.click(pt.x, pt.y); await L.wait(400);
await page.keyboard.press('Meta+ArrowDown'); await L.wait(300);
await page.keyboard.press('Enter');
for (const t of T.rest) { await page.keyboard.type(t, { delay: 3 }); await page.keyboard.press('Enter'); await L.wait(150); }
await page.keyboard.type(T.url, { delay: 8 }); await page.keyboard.press('Enter'); await L.wait(3500);
await page.keyboard.type(T.footer, { delay: 3 }); await L.wait(1500);
const st = await page.evaluate(() => { const d = document.querySelector('#editor-tistory_ifr')?.contentDocument;
  return { title: (document.querySelector('#post-title-inp')?.value || '').slice(0, 40), len: (d?.body?.innerText || '').length, imgs: d ? d.querySelectorAll('img').length : -1,
    links: [...(d?.querySelectorAll('a[href]') || [])].map((a) => a.getAttribute('href')).filter((h) => /signumhq/.test(h)).slice(0, 2), broken: /\u{1F615}/u.test(d?.body?.innerText || '') }; });
console.log('작성 상태:', JSON.stringify(st));

// ── 발행 ──
const click = async (label, re, scopeSel) => { const b = await page.evaluate((a) => { const rx = new RegExp(a.re); const n = (s) => (s || '').replace(/\s+/g, ' ').trim(); const root = a.scope ? document.querySelector(a.scope) || document : document; const e = [...root.querySelectorAll('button,a,label,[role=button]')].find((x) => rx.test(n(x.innerText)) && x.getBoundingClientRect().width > 0); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: n(e.innerText).slice(0, 20) }; }, { re: re.source, scope: scopeSel || null }); console.log(label, JSON.stringify(b)); if (b) { await page.mouse.click(b.x, b.y); await L.wait(3000); } return b; };
// 태그
const tagIn = await page.evaluate(() => { const e = document.querySelector('#tagText, input[placeholder*="태그"]'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
if (tagIn) { await page.mouse.click(tagIn.x, tagIn.y); await L.wait(400); for (const t of T.tags) { await page.keyboard.type(t, { delay: 25 }); await page.keyboard.press('Enter'); await L.wait(300); } }
console.log('태그칸', JSON.stringify(tagIn));
await click('① 완료', /^완료$/);
await L.wait(2000);
const layer = await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim(); return { radios: [...document.querySelectorAll('input[type=radio]')].map((r) => { const l = r.closest('label') || document.querySelector(`label[for="${r.id}"]`); return { id: r.id, checked: r.checked, label: n(l ? l.innerText : '').slice(0, 20) }; }).slice(0, 8), btns: [...document.querySelectorAll('button')].map((b) => n(b.innerText)).filter((t) => /발행|공개|저장/.test(t)).slice(0, 6) }; });
console.log('발행 레이어:', JSON.stringify(layer));
// «공개» 선택
await click('② 공개', /^공개$/);
await L.wait(1000);
const pubBtn = await click('③ 발행', /^(공개 발행|발행)$/);
await L.wait(10000);
console.log('발행 후:', await page.evaluate(() => location.href));

// ── 공개 확인(로그인 없이, RSS) ──
await L.wait(5000);
const rss = await (await fetch('https://smartbox.tistory.com/rss', { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
const first = (rss.match(/<item>[\s\S]*?<link>([\s\S]*?)<\/link>/) || [])[1];
const html = first ? await (await fetch(first, { headers: { 'user-agent': 'Mozilla/5.0' } })).text() : '';
const ok = { title: html.includes(T.title.slice(0, 10)), link: /href="https:\/\/signumhq\.com\/app\?from=tistory/.test(html) };
console.log('공개 검증:', JSON.stringify(ok), first);
if (!ok.title || !ok.link) { console.log('⛔ 공개 확인 실패 — «발행했다»고 적지 않는다'); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', first);
