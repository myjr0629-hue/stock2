/* ==========================================================================
 * threads-pin — Threads(@signumhq_official) 내 글 하나를 프로필 «고정»으로 바꾼다. (2026-10-05 신설 — 리딤 «방식 B 확대»)
 * 사용: echo '{"post":"https://www.threads.com/@signumhq_official/post/<ID>","dry":false}' > ~/signum-ego-io/<KST>/threads-pin.json
 *       bash scripts/ego-run.sh scripts/threads-pin.mjs 200
 * 흐름: 글 주소 열기 → 그 글의 «더 보기»(…) → 메뉴 항목 «프로필에 고정»/«Pin to profile» «만» 누른다(정확 일치 — 삭제·수정 항목은 절대 안 누른다)
 *       → 확인 창이 있으면 «고정»/«Pin» → 프로필 첫 글이 그 글이고 «고정됨/Pinned» 표식이 있는지 확인.
 * dry:true 면 메뉴 항목 목록만 출력하고 아무것도 누르지 않는다.
 * 이미 고정돼 있으면(메뉴에 «고정 해제/Unpin») 그대로 끝낸다.
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync(await L.taskPath('threads-pin.json'), 'utf8'));
const id = (String(T.post || '').match(/\/post\/([A-Za-z0-9_-]+)/) || [])[1];
if (!id) { console.log('⛔ Threads 글 주소가 아니다'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /threads\.(net|com)/, null);
await L.trapDialogs(page);
async function openMenu(url) {
  const pid = (String(url).match(/\/post\/([A-Za-z0-9_-]+)/) || [])[1];
  try { await page.goto(url, { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(9000);
  const more = await page.evaluate((id) => {
    // ★10/5 실측: 글마다의 메뉴는 div[role=button][aria-haspopup=menu] 안의 svg[title="더 보기"](aria-label 아님) — aria-label «더 보기»는 열 머리 메뉴(«열로 추가»)다
    const links = [...document.querySelectorAll('a[href*="/post/"]')].filter((a) => a.getAttribute('href').includes(id));
    const tl = links.find((a) => a.querySelector('time')) || links[0];
    if (!tl) return null;
    const lr = tl.getBoundingClientRect();
    const btns = [...document.querySelectorAll('svg[title="더 보기"], svg[title="More"]')].map((s) => s.closest('[role=button][aria-haspopup=menu]') || s.closest('[role=button]') || s)
      .map((b) => { const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, dy: Math.abs((r.top + r.height / 2) - (lr.top + lr.height / 2)), right: r.left > lr.left }; })
      .filter((o) => o.w > 0 && o.right && o.dy < 40).sort((a, b) => a.dy - b.dy);
    return btns[0] || null;
  }, pid);
  if (!more) return null;
  await page.mouse.click(more.x, more.y, { label: '글 더 보기' }); await L.wait(2200);
  return page.evaluate(() => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const out = [];
    for (const e of document.querySelectorAll('div,span,a,[role=menuitem],[role=button]')) {
      const t = n(e.innerText); if (!t || t.length > 20) continue;
      if ([...e.children].some((c) => n(c.innerText) === t)) continue;
      const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue;
      out.push({ t, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    }
    return out.filter((o) => /고정|Pin|저장|삭제|수정|보관|링크|인사이트|Unpin|Delete|Edit|Save|Copy/.test(o.t));
  });
}
// (선택) 기존 고정 글을 먼저 해제 — ★10/5 실측: 고정 글이 이미 있으면 «프로필에 고정»을 눌러도 바뀌지 않았다(조용히 무시)
if (T.unpin) {
  let ui = null;
  for (let k = 0; k < 2 && !(ui && ui.length); k++) ui = await openMenu(T.unpin);
  console.log('해제 대상 메뉴:', JSON.stringify((ui || []).map((i) => i.t)));
  const un = (ui || []).find((i) => /^(고정 취소|프로필에서 고정 해제|고정 해제|Unpin from profile|Unpin)$/.test(i.t));
  if (T.dry) { console.log('DRY — 해제 항목:', un ? un.t : '(없음)'); }
  else if (un) { if (T.js) console.log('JS 클릭(해제):', await L.jsClick(page, /^(고정 취소|프로필에서 고정 해제|고정 해제|Unpin from profile|Unpin)$/)); else { await page.mouse.move(un.x, un.y); await L.wait(400); await page.mouse.click(un.x, un.y, { label: '기존 고정 해제' }); } await L.wait(3000); console.log('기존 고정 해제 누름:', un.t); }
  else console.log('⚠ 해제 항목 없음 — 기존 고정이 이미 풀렸거나 메뉴가 안 열렸다');
}
let items = null;
for (let k = 0; k < 2 && !(items && items.length); k++) items = await openMenu(T.post);   // 메뉴가 가끔 안 열린다(10/5 실측) — 한 번 더
items = items || [];
console.log('메뉴 후보:', JSON.stringify(items.map((i) => i.t)));
if (items.some((i) => /^(고정 취소|고정 해제|프로필에서 고정 해제|Unpin|Unpin from profile)$/.test(i.t))) { console.log('이미 고정돼 있다'); try { await page.keyboard.press('Escape'); } catch {} process.exit(0); }
const pin = items.find((i) => /^(프로필에 고정|프로필에 고정하기|Pin to profile)$/.test(i.t));
if (T.dry) { console.log('DRY — 누르지 않음. 고정 항목:', pin ? pin.t : '(없음)'); try { await page.keyboard.press('Escape'); } catch {} process.exit(0); }
if (!pin) { console.log('⛔ «프로필에 고정» 항목 없음 — 누르지 않는다'); try { await page.keyboard.press('Escape'); } catch {} process.exit(1); }
await page.screenshot({ path: L.ioDir() + '/threads-pin-menu.png' }).catch(() => {});
if (T.js) { const r = await L.jsClick(page, /^(프로필에 고정|Pin to profile)$/); console.log('JS 클릭:', r); }   // ★10/5: 마우스 클릭이 반영되지 않을 때(조용히 무시) 대안
else { await page.mouse.move(pin.x, pin.y); await L.wait(400); await page.mouse.click(pin.x, pin.y, { label: '프로필에 고정' }); }
await L.wait(2500);
await page.screenshot({ path: L.ioDir() + '/threads-pin-after.png' }).catch(() => {});
// 확인 창(있을 때만) — ★10/5 실측: role=dialog 가 아닐 수 있어 «보이는 짧은 잎 글자» 중 확인 문구를 찾는다(정확 일치만, 취소·삭제는 안 누름)
const dlg = await page.evaluate(() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const e of document.querySelectorAll('div,span,button,[role=button]')) {
    const t = n(e.innerText); if (!t || t.length > 40) continue;
    if ([...e.children].some((c) => n(c.innerText) === t)) continue;
    const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue;
    out.push({ t, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
  }
  return out;
});
const CONF_RE = /^(고정|고정하기|바꾸기|교체|교체하기|변경|확인|Pin|Replace|Change)$/;
console.log('클릭 뒤 확인 후보:', JSON.stringify(dlg.filter((o) => CONF_RE.test(o.t) || /고정|Pin/.test(o.t)).map((o) => o.t).slice(0, 12)));
const conf = dlg.filter((o) => CONF_RE.test(o.t)).pop();
if (conf) { await page.mouse.click(conf.x, conf.y, { label: '고정 확인: ' + conf.t }); await L.wait(3000); }
// 검증 — 프로필 첫 글
try { await page.goto('https://www.threads.com/@signumhq_official', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
const v = await page.evaluate((id) => {
  const t = (document.body.innerText || '');
  const first = [...document.querySelectorAll('a[href*="/post/"]')].map((a) => a.getAttribute('href')).find((h) => /\/@signumhq_official\/post\//.test(h)) || '';
  return { first, same: first.includes(id), pinnedMark: /고정됨|Pinned/.test(t.slice(0, 4000)) };
}, id);
console.log('검증:', JSON.stringify(v));
if (v.same && v.pinnedMark) console.log('✅ 고정 완료:', T.post); else { console.log('⚠ 프로필 첫 글·고정 표식 확인 실패 — «고정했다»고 적지 않는다'); process.exit(1); }
