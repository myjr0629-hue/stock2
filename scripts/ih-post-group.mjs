/* ============================================================================
 * ih-post-group — Indie Hackers 새 글 — 미리보기 모드면 EDIT 로 돌아와 내용(제목·본문 길이)을 다시 확인하고 «Select Group» 목록을 읽는다. 가입한 그룹이 없으면 종료코드 5(정상 — 그룹 없이 제출). ★2026-10-04 검증된 그대로.
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
const centerOf = (label) => page.evaluate((label) => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const b = [...document.querySelectorAll('button')].find((e) => norm(e.innerText) === label);
  if (!b) return null; b.scrollIntoView({ block: 'center' }); return true;
}, label);
// 미리보기 모드면 EDIT 로 돌아온다
let st = await page.evaluate(() => ({ ta: document.querySelectorAll('textarea.edit-post__body-field').length, edit: [...document.querySelectorAll('button')].some((b) => /^\s*EDIT\s*$/i.test(b.innerText)) }));
console.log('상태:', JSON.stringify(st));
if (!st.ta && st.edit) {
  await centerOf('EDIT'); await L.wait(600);
  const p = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /^\s*EDIT\s*$/i.test(e.innerText)); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
  await page.mouse.click(p.x, p.y, {}); await L.wait(2000);
}
const chk = await page.evaluate(() => { const t = document.querySelector('textarea.post-page__title-field'), b = document.querySelector('textarea.edit-post__body-field'); return { tl: t ? t.value.length : -1, bl: b ? b.value.length : -1, bodyHead: b ? b.value.slice(0, 40) : null }; });
console.log('편집 복귀 확인:', JSON.stringify(chk), '기대:', TITLE.length, BODY.length);
if (chk.tl !== TITLE.length || chk.bl !== BODY.length) { console.log('⛔ 내용이 다르다 — 중단'); process.exit(1); }

// 그룹 드롭다운 열기
const trig = await page.evaluate(() => { const e = document.querySelector('.group-selector__trigger'); if (!e) return null; e.scrollIntoView({ block: 'center' }); return true; });
await L.wait(600);
const tp = await page.evaluate(() => { const e = document.querySelector('.group-selector__trigger'); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: e.innerText.replace(/\s+/g, ' ').trim() }; });
console.log('트리거:', JSON.stringify(tp));
await page.mouse.click(tp.x, tp.y, {}); await L.wait(1500);
const opts = await page.evaluate(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const root = document.querySelector('.group-selector') || document.body;
  const leaves = [...root.querySelectorAll('*')].filter((e) => e.children.length === 0 && norm(e.innerText) && e.getBoundingClientRect().width > 0);
  return { html: root.outerHTML.replace(/\s+/g, ' ').slice(0, 300), items: leaves.map((e) => { const r = e.getBoundingClientRect(); return { t: norm(e.innerText).slice(0, 50), cls: String(e.className).slice(0, 50), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), top: Math.round(r.top) }; }) };
});
console.log('옵션:', JSON.stringify(opts.items.map((o) => o.t + ' [' + o.cls + '] @' + o.x + ',' + o.y)));
const prefs = [/^marketing$/i, /marketing/i, /^growth$/i, /growth/i, /analytics|data/i, /build.*public/i, /lesson|learn|story|stories/i, /mobile|app/i];
let pick = null;
for (const re of prefs) { pick = opts.items.find((o) => re.test(o.t) && !/^select group$/i.test(o.t)); if (pick) break; }
if (!pick) { console.log('⛔ 마땅한 그룹 없음 — 선택 안 하고 멈춘다(목록 위 참조)'); process.exit(5); }
console.log('고른 그룹:', JSON.stringify(pick));
if (pick.top < 0 || pick.top > 880) { console.log('⛔ 화면 밖 좌표 — 중단'); process.exit(6); }
await page.mouse.click(pick.x, pick.y, {}); await L.wait(1500);
const after = await page.evaluate(() => { const e = document.querySelector('.group-selector__label'); const t = document.querySelector('textarea.edit-post__body-field'); return { label: e ? e.innerText.replace(/\s+/g, ' ').trim() : null, bodyLen: t ? t.value.length : -1 }; });
console.log('선택 후:', JSON.stringify(after));
