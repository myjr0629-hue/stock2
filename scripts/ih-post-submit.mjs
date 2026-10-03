/* ============================================================================
 * ih-post-submit — Indie Hackers 새 글 — 내용 일치를 다시 확인하고 SUBMIT POST 를 눌러 게시 URL(응답 주소 그대로)을 출력한다. ★2026-10-04 검증된 그대로 — «게시했다»는 공개 확인(비로그인 브라우저) 뒤에만 적는다.
 * 준비: ~/signum-ego-io/<KST 날짜>/ih-title.txt · ih-body.txt (본문에 https://www.signumhq.com/app?from=indiehackers 가 «정확히 1회» — 링크는 Input.insertText 로 넣는다)
 * 순서(10/4 08시대 실제 게시와 같다): bash scripts/ego-run.sh scripts/ih-post-fill.mjs 200 → scripts/ih-post-group.mjs 120 → scripts/ih-post-submit.mjs 120
 * 규칙: IH 본문칸은 plain textarea(마크다운) · 가입한 그룹이 0이면 그룹 없이 게시(그룹 가입 = 계정 변경이라 안 함) · 글 «편집» 컨트롤은 못 찾았다(고칠 점은 보충 댓글로) ·
 *       공개 확인은 «비로그인 브라우저»로 — IH 글 페이지는 curl·Node fetch 가 Cloudflare 403 이고 공개 페이지는 몇 분간 캐시 스냅샷이다(주소 뒤 ?v=N 를 바꿔 다시 열면 갱신본이 온다).
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const { readFileSync } = await import('node:fs');
const dir = L.ioDir();
const TITLE = readFileSync(`${dir}/ih-title.txt`, 'utf8').trim();
const BODY = readFileSync(`${dir}/ih-body.txt`, 'utf8').replace(/\s+$/, '');
const ts = await L.space();
if (!ts) { console.log('⛔ 작업공간 없음'); process.exit(3); }
let pages = []; try { pages = await ts.pages(); } catch {}
let page = null;
for (const p of pages) { try { if (/indiehackers\.com\/new-post/.test(await p.url())) { page = p; break; } } catch {} }
if (!page) { console.log('⛔ new-post 탭 없음'); process.exit(1); }
// 열려 있는 그룹 드롭다운을 Escape 로 닫는다(그룹은 고르지 않는다 — 가입한 그룹이 없다)
await page.cdp('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
await page.cdp('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
await L.wait(800);
const chk = await page.evaluate(() => { const t = document.querySelector('textarea.post-page__title-field'), b = document.querySelector('textarea.edit-post__body-field'); const dd = document.querySelector('.group-selector__empty-message'); return { tl: t ? t.value.length : -1, bl: b ? b.value.length : -1, ddOpen: !!(dd && dd.getBoundingClientRect().width > 0) }; });
console.log('제출 전 확인:', JSON.stringify(chk), '기대:', TITLE.length, BODY.length);
if (chk.tl !== TITLE.length || chk.bl !== BODY.length) { console.log('⛔ 내용이 다르다 — 중단'); process.exit(1); }
if (chk.ddOpen) { // 바깥(빈 곳) 클릭으로 닫기
  await page.mouse.click(1100, 700, {}); await L.wait(600);
}
const m1 = await page.evaluate(() => { const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase(); const b = [...document.querySelectorAll('button')].find((e) => norm(e.innerText) === 'SUBMIT POST'); if (!b) return null; b.scrollIntoView({ block: 'center' }); return true; });
if (!m1) { console.log('⛔ SUBMIT POST 버튼 없음'); process.exit(1); }
await L.wait(700);
const bp = await page.evaluate(() => { const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase(); const b = [...document.querySelectorAll('button')].find((e) => norm(e.innerText) === 'SUBMIT POST'); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), inView: r.top > 0 && r.bottom < innerHeight, disabled: !!b.disabled }; });
console.log('SUBMIT POST:', JSON.stringify(bp));
if (!bp.inView || bp.disabled) { console.log('⛔ 눌 수 없는 상태 — 중단'); process.exit(1); }
await page.mouse.click(bp.x, bp.y, {});
await L.wait(9000);
const res = await page.evaluate(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const t = norm(document.body.innerText);
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return {
    url: location.href, title: document.title, head: t.slice(0, 260),
    errs: [...document.querySelectorAll('[class*=error],[class*=alert],[class*=flash],[class*=toast],[class*=modal]')].filter(vis).map((e) => norm(e.innerText).slice(0, 160)).filter(Boolean).slice(0, 6),
    gate: /can.?t create posts|not allowed|try again|too many/i.test(t) ? t.slice(0, 300) : null,
    buttons: [...document.querySelectorAll('button')].filter(vis).map((e) => norm(e.innerText).slice(0, 30)).filter(Boolean).slice(0, 12),
  };
});
console.log('제출 후:', JSON.stringify(res, null, 1));
