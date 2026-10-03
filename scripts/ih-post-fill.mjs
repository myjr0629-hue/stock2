/* ============================================================================
 * ih-post-fill — Indie Hackers 새 글 — 제목·본문을 «실제 마우스 클릭 + 실제 키 입력»으로 넣고 PREVIEW 로 렌더를 본다(제출 아님). ★2026-10-04 실제 게시에서 검증된 그대로.
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
const LINK = 'https://www.signumhq.com/app?from=indiehackers';
const ts = await L.space();
if (!ts) { console.log('⛔ 작업공간 없음(대표 사용 중) — 중단'); process.exit(3); }
let pages = []; try { pages = await ts.pages(); } catch {}
let page = null;
for (const p of pages) { try { if (/indiehackers\.com\/new-post/.test(await p.url())) { page = p; break; } } catch {} }
if (!page) { for (const p of pages) { try { const u = await p.url(); if (/indiehackers\.com/.test(u) && !/settings/.test(u)) { page = p; break; } } catch {} } }
if (!page) page = await L.findPage(ts, null, null);
try { await page.goto('https://www.indiehackers.com/new-post', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(6000);

const pre = await page.evaluate(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const t = norm(document.body.innerText);
  const gate = /can.?t create posts|not allowed to post|too soon|wait/i.test(t) ? t.slice(0, 300) : null;
  const sg = [...document.querySelectorAll('*')].filter((e) => norm(e.innerText) === 'Select Group' && e.children.length <= 2);
  const grp = sg.slice(0, 2).map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 80), html: e.parentElement.outerHTML.replace(/\s+/g, ' ').slice(0, 500) }));
  const sels = [...document.querySelectorAll('select')].map((s) => ({ cls: String(s.className).slice(0, 60), opts: [...s.options].map((o) => norm(o.text) + '=' + o.value).slice(0, 30) }));
  return { gate, grp, sels, user: (t.match(/@\w+/) || [])[0] };
});
console.log('사전:', JSON.stringify(pre, null, 1));
if (pre.gate) { console.log('⛔ 게이트 문구 — 중단'); process.exit(4); }

// 제목 — 실제 마우스 클릭 + 실제 키 입력
const tp = await page.evaluate(() => { const e = document.querySelector('textarea.post-page__title-field'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
if (!tp) { console.log('⛔ 제목칸 없음'); process.exit(1); }
await L.wait(500);
const tp2 = await page.evaluate(() => { const e = document.querySelector('textarea.post-page__title-field'); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), v: e.value.length }; });
await page.mouse.click(tp2.x, tp2.y, {}); await L.wait(500);
await page.keyboard.type(TITLE, { delay: 4 }); await L.wait(800);

// 본문 — 링크 앞까지 키 입력, 링크는 insertText(입력규칙을 타지 않는다), 나머지 키 입력
const bp = await page.evaluate(() => { const e = document.querySelector('textarea.edit-post__body-field'); if (!e) return null; e.scrollIntoView({ block: 'center' }); return true; });
if (!bp) { console.log('⛔ 본문칸 없음'); process.exit(1); }
await L.wait(700);
const bp2 = await page.evaluate(() => { const e = document.querySelector('textarea.edit-post__body-field'); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 40)), inView: r.top > 0 && r.bottom <= innerHeight + 5 || (r.top > 0 && r.top < innerHeight - 40) }; });
console.log('본문칸 좌표:', JSON.stringify(bp2));
await page.mouse.click(bp2.x, bp2.y, {}); await L.wait(600);
const i = BODY.indexOf(LINK);
const before = BODY.slice(0, i), after = BODY.slice(i + LINK.length);
await page.keyboard.type(before, { delay: 1 }); await L.wait(500);
await page.cdp('Input.insertText', { text: LINK }); await L.wait(400);
await page.keyboard.type(after, { delay: 1 }); await L.wait(1500);

const got = await page.evaluate(() => {
  const t = document.querySelector('textarea.post-page__title-field'), b = document.querySelector('textarea.edit-post__body-field');
  return { title: t && t.value, bodyLen: b && b.value.length, body: b && b.value };
});
const norm = (s) => (s || '').replace(/\r/g, '').trim();
console.log('제목 일치:', norm(got.title) === TITLE, '| 본문 일치:', norm(got.body) === BODY, '| 본문 길이:', got.bodyLen, '/', BODY.length, '| 링크 1회:', (got.body.split(LINK).length - 1) === 1);
if (norm(got.body) !== BODY) {
  // 어디서 달라졌는지
  let k = 0; const a = norm(got.body); while (k < a.length && a[k] === BODY[k]) k++;
  console.log('첫 불일치 위치:', k, JSON.stringify(a.slice(Math.max(0, k - 30), k + 40)), 'vs', JSON.stringify(BODY.slice(Math.max(0, k - 30), k + 40)));
}

// 미리보기 — 눌러서 렌더를 본다(제출 아님)
const pv = await page.evaluate(() => { const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase(); const b = [...document.querySelectorAll('button')].find((e) => norm(e.innerText) === 'PREVIEW'); if (!b) return null; b.scrollIntoView({ block: 'center' }); return true; });
await L.wait(600);
const pvp = await page.evaluate(() => { const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase(); const b = [...document.querySelectorAll('button')].find((e) => norm(e.innerText) === 'PREVIEW'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
console.log('PREVIEW 버튼:', JSON.stringify(pvp));
if (pvp) {
  await page.mouse.click(pvp.x, pvp.y, {}); await L.wait(3000);
  const st = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const t = norm(document.body.innerText);
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      url: location.href, len: t.length, head: t.slice(0, 500), tail: t.slice(-500),
      li: [...document.querySelectorAll('li')].filter(vis).length, strong: [...document.querySelectorAll('strong,b')].filter(vis).length,
      links: [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /signumhq/.test(h)),
      previewEls: [...document.querySelectorAll('[class*=preview]')].filter(vis).map((e) => String(e.className).slice(0, 60)).slice(0, 6),
      buttons: [...document.querySelectorAll('button')].filter(vis).map((e) => norm(e.innerText).slice(0, 30)).filter(Boolean),
      textareas: [...document.querySelectorAll('textarea')].filter(vis).length,
    };
  });
  console.log('미리보기 상태:', JSON.stringify(st, null, 1));
}
