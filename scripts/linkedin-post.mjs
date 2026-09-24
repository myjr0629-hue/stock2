#!/usr/bin/env node
/* ============================================================================
 * linkedin-post — LinkedIn 피드 글 1편(앱 화면 시도 → 안 되면 링크 카드) + 공개 확인. (2026-09-23 /tmp/ego/li13 을 정본화)
 * 사용: /tmp/ego/li-task.json = {"file":"/tmp/ego/li.txt","image":"/abs/app.png"(선택),"mark":"본문에 반드시 있는 문구"}
 *       ego-browser nodejs < scripts/linkedin-post.mjs
 * 규칙(채널 메모): 카드 위를 클릭하지 않는다 · 작성기는 «글 올리기» 상자 → 모달 · URL 줄 뒤 카드가 붙을 때까지 대기.
 *   PC 독자가 대부분 — /app 은 PC 에게 «폰 넘겨주기 QR» 페이지를 준다(2026-09-23)
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/li-task.json', 'utf8'));
const lines = fs.readFileSync(T.file, 'utf8').trim().split('\n');
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /linkedin/, null);
await L.trapDialogs(page);
try { await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(10000);
const box = await page.evaluate(() => { window.scrollTo(0, 0); const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const c = [...document.querySelectorAll('div,span,button')].map((e) => ({ t: n(e.innerText), r: e.getBoundingClientRect() }))
    .filter((o) => o.r.width > 200 && o.r.height > 24 && o.r.top > 60 && o.r.top < 220 && /^(글 올리기|Start a post)$/.test(o.t)).sort((a, b) => a.r.top - b.r.top);
  if (!c.length) return null; const r = c[0].r; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
if (!box) { console.log('⛔ 「글 올리기」 상자 없음(로그인 확인)'); process.exit(1); }
await page.mouse.click(box.x, box.y); await L.wait(7000);
const ed = await page.evaluate(() => { const e = [...document.querySelectorAll('[contenteditable="true"]')].map((x) => ({ r: x.getBoundingClientRect() })).filter((o) => o.r.width > 300).sort((a, b) => b.r.height - a.r.height)[0]; return e ? { x: Math.round(e.r.left + 60), y: Math.round(e.r.top + 20) } : null; });
if (!ed) { console.log('⛔ 작성기 없음'); process.exit(1); }
await page.mouse.click(ed.x, ed.y); await L.wait(600);
for (let i = 0; i < lines.length; i++) {
  if (lines[i]) await page.keyboard.type(lines[i], { delay: 4 });
  if (i < lines.length - 1) { await page.keyboard.press('Enter'); await L.wait(120); }
  if (/^https?:\/\//.test(lines[i])) await L.wait(7000);   // 링크 카드가 붙을 때까지
}
await L.wait(2000);
let imgOk = false;
if (T.image) {
  try { await page.setInputFiles('input[type=file] >> nth=0', T.image); await L.wait(9000);
    imgOk = await page.evaluate(() => document.querySelectorAll('.share-box img, [class*="media"] img[src^="blob:"], img[src^="blob:"]').length > 0); } catch (e) { console.log('이미지 경로 예외(카드로 간다):', String(e.message).slice(0, 60)); }
  if (imgOk) { const nx = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(다음|Next|완료|Done)$/.test((x.innerText || '').trim()) && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); if (nx) { await page.mouse.click(nx.x, nx.y); await L.wait(4000); } }
}
console.log('이미지 첨부:', imgOk, '(안 되면 링크 카드의 OG 이미지 = 앱 화면 카드)');
const pre = await page.evaluate((mark) => ({ text: (document.body.innerText || '').includes(mark), card: !!document.querySelector('[class*="preview"], [class*="article-card"], [data-test-id*="preview"]') }), T.mark || '');
console.log('게시 전:', JSON.stringify(pre));
if (!pre.text) { console.log('⛔ 본문이 작성기에 없다'); process.exit(1); }
const p = await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim(); const c = [...document.querySelectorAll('button')].map((e) => ({ t: n(e.innerText), r: e.getBoundingClientRect(), d: e.disabled })).filter((o) => o.r.width > 30 && /^(게시|게시물|Post)$/.test(o.t) && !o.d).sort((a, b) => b.r.top - a.r.top); if (!c.length) return null; const r = c[0].r; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
if (!p) { console.log('⛔ 게시 버튼 없음'); process.exit(1); }
await page.mouse.click(p.x, p.y); await L.wait(12000);
// 공개 확인 — 프로필 활동에서 표식 문구가 있는 최신 글의 urn 을 뽑는다.
// ⚠ 2026-09-23: /in/me/recent-activity 는 빈 화면이었다 → 실제 슬러그 /in/signumhq/ 를 쓴다.
//   글 요소 선택자([data-urn])도 0개였다(클래스가 난독화됨) → HTML 에서 urn 정규식으로 뽑는다.
try { await page.goto('https://www.linkedin.com/in/signumhq/recent-activity/all/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(14000);
// ★2026-09-25: HTML 의 «첫 번째» urn 은 새 글이 아니었다(프로필 상단 글·기사 활동이 먼저 나온다) → 도구가
//   예전 기사 주소를 «게시·검증 완료»로 찍었다. 활동 id 는 시간순(스노플레이크)이다: 큰 것부터 후보로 두고,
//   «로그아웃 공개 페이지에 표식 문구가 실제로 있는» urn 만 채택한다. 못 찾으면 발행했다고 쓰지 않는다.
const v = await page.evaluate((mark) => { const t = (document.body.innerText || '').replace(/\s+/g, ' ');
  const urns = [...new Set((document.documentElement.innerHTML.match(/urn:li:activity:\d{15,}/g) || []))];
  return { has: t.includes(mark), urns }; }, T.mark || '');
const cands = (v.urns || []).sort((a, b) => (BigInt(b.split(':').pop()) > BigInt(a.split(':').pop()) ? 1 : -1)).slice(0, 4);
console.log('활동 확인:', JSON.stringify({ has: v.has, cands }));
if (!v.has || !cands.length) { console.log('⛔ 내 활동에서 새 글을 못 찾았다 — «발행했다»고 적지 않는다'); process.exit(1); }
const CUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const unesc = (h) => h.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
let hit = null;
for (const u of cands) {
  try {
    const r = await fetch('https://www.linkedin.com/feed/update/' + u + '/', { headers: { 'user-agent': CUA }, redirect: 'follow' });
    const h = unesc(await r.text());
    const ok = r.status === 200 && h.includes(T.mark || '');
    console.log('공개 확인', u, r.status, ok ? '표식 있음' : '표식 없음');
    if (ok) { hit = { urn: u, link: /from(=|%3D)linkedin/.test(h) }; break; }
  } catch (e) { console.log('공개 확인 실패', u, String(e.message).slice(0, 60)); }
}
if (!hit) { console.log('⛔ 로그아웃 공개 페이지에서 표식 문구를 가진 글을 못 찾았다 — «발행했다»고 적지 않는다'); process.exit(1); }
console.log('공개 링크(from=linkedin):', hit.link);
console.log('\n✅ 게시·검증 완료: https://www.linkedin.com/feed/update/' + hit.urn + '/  (링크는 linkedin.com/safety/go 래퍼 안에 from=linkedin 으로 남는다)');
