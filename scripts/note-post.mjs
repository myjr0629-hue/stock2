/* ============================================================================
 * note-post — note.com(@signumhq) 새 글: 제목·본문(키 입력) → 見出し画像(파일 선택기) → 해시태그 → 投稿 → 비로그인 검증.
 *
 * ★2026-09-24 정본화: 발행 흐름이 /tmp/ego/note-*.mjs 조각 6개로만 있었다(세션이 바뀌면 사라지는 도구).
 * 규칙(OUTREACH-LOG 9/15·9/20·9/22 실측):
 *   · 본문은 문단 단위로 키 입력 + Enter. URL 은 «줄 단독» + 3.5초 대기 → note 가 링크 카드로 바꾼다
 *   · 見出し画像 = 편집기 위쪽 이미지 버튼 → (메뉴가 뜨면 «画像をアップロード») → 파일 선택기 → 자르기 모달 «保存»
 *   · 해시태그 칸 placeholder = 「ハッシュタグを追加する」. note 가 본문에서 쓸모없는 태그를 자동 추출하면 칩을 지운다
 *   · 일본 시계 05:30~08:00 JST 에 발행(ENGINE §17-3) · 태그는 #米国株 중심(3개 이상은 스팸 표식이라는 커뮤니티 규범 — ENGINE §17-3)
 * 사용: /tmp/ego/note-task.json = {"title":"…","lines":["문단",…,"https://signumhq.com/app?from=note&l=ja",…],
 *                                  "header":"/abs/1280x670.png","tags":["米国株","ダークプール"],"dry":true}
 *       ego-browser nodejs < scripts/note-post.mjs      (dry:true 면 下書き까지만, 스크린샷 /tmp/ego/note-draft.png)
 *       {"edit_url":"https://editor.note.com/notes/<id>/edit/", …} 를 주면 그 초안을 발행만 한다
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/note-task.json', 'utf8'));
const URL_RE = /^https:\/\/signumhq\.com\/app(-uc|-wim)?\?from=note(&l=ja)?$/;
if (!T.edit_url) {
  if (!(T.lines || []).some((l) => URL_RE.test(l))) { console.log('⛔ 본문에 스마트링크(?from=note) 줄이 없다'); process.exit(1); }
  if ((T.lines || []).some((l) => /^\s*(\d+[.)]|[-*•])\s/.test(l))) { console.log('⛔ 줄 머리 번호·글머리표 금지(자동 목록)'); process.exit(1); }
  if (T.header && !fs.existsSync(T.header)) { console.log('⛔ 見出し画像 파일 없음:', T.header); process.exit(1); }
}
if ((T.tags || []).length > 3) { console.log('⛔ 태그는 3개까지(ENGINE §17-3)'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /note\.com/, null);
const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
const clickText = async (re, label, sel = 'button,[role=button],a') => {
  const p = await page.evaluate((a) => { const re = new RegExp(a.src); const nn = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const e = [...document.querySelectorAll(a.sel)].filter((x) => re.test(nn(x.innerText) || x.getAttribute('aria-label') || '') && x.getBoundingClientRect().width > 0).pop();
    if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; }, { src: re.source, sel });
  if (!p) return false; await L.wait(300); await page.mouse.click(p.x, p.y, { label }); return true;
};

if (T.edit_url) {
  try { await page.goto(T.edit_url, { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(10000);
} else {
  try { await page.goto('https://note.com/notes/new', { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(11000);
  // 제목
  const t = await page.evaluate(() => { const e = [...document.querySelectorAll('textarea')].find((x) => /記事タイトル/.test(x.getAttribute('placeholder') || ''));
    if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; });
  if (!t) { console.log('⛔ 제목칸 없음(로그인·편집기 확인):', await page.url()); process.exit(1); }
  await page.mouse.click(t.x, t.y, { label: '제목' }); await L.wait(600);
  await page.keyboard.type(T.title, { delay: 6 }); await L.wait(800);
  // 본문
  const bd = await page.evaluate(() => { const e = [...document.querySelectorAll('[contenteditable="true"]')].find((x) => x.getBoundingClientRect().width > 200);
    if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x + 40), y: Math.round(b.y + 14) }; });
  if (!bd) { console.log('⛔ 본문칸 없음'); process.exit(1); }
  await page.mouse.click(bd.x, bd.y, { label: '본문' }); await L.wait(700);
  for (const line of T.lines) {
    await page.keyboard.type(line, { delay: 4 }); await page.keyboard.press('Enter');
    await L.wait(URL_RE.test(line) ? 3500 : 260);
  }
  await L.wait(2500);
  // 見出し画像 — 편집기 위쪽 이미지 버튼(aria-label 또는 글자) → 선택기
  if (T.header) {
    let chooser = page.waitForFileChooser({ timeout: 8000 }).catch(() => null);
    const opened = await clickText(/画像を追加|見出し画像|画像をアップロード/, '見出し画像');
    let fc = opened ? await chooser : null;
    if (opened && !fc) {
      chooser = page.waitForFileChooser({ timeout: 8000 }).catch(() => null);
      if (await clickText(/画像をアップロード/, '画像をアップロード')) fc = await chooser;
    }
    if (!fc) { console.log('⛔ 見出し画像 선택기가 안 열렸다 — 버튼 후보:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button,[role=button]')].map((e) => { const b = e.getBoundingClientRect(); return { t: (e.innerText || '').trim().slice(0, 16), a: e.getAttribute('aria-label') || '', y: Math.round(b.y) }; }).filter((c) => c.y < 400 && (c.t || c.a)).slice(0, 12)))); process.exit(1); }
    await fc.setFiles(T.header); await L.wait(6000);
    if (!(await clickText(/^保存$/, '자르기 保存'))) console.log('(자르기 모달 없음 — 그대로 진행)');
    await L.wait(5000);
  }
}

const st = await page.evaluate((a) => { const t = (document.body.innerText || '').replace(/\s+/g, ' ');
  return { title: a.title ? t.includes(a.title.slice(0, 12)) : true, link: t.includes('signumhq') || !!document.querySelector('a[href*="signumhq.com/app"]') || !!document.querySelector('iframe[src*="signumhq"], [data-src*="signumhq"]'),
    header: [...document.querySelectorAll('img')].some((i) => /assets\.st-note\.com|note-cakes|blob:/.test(i.src) && i.getBoundingClientRect().width > 400) }; }, { title: T.title || '' });
console.log('초안:', JSON.stringify(st), '주소:', await page.url());
await page.screenshot({ path: '/tmp/ego/note-draft.png' });
if (!st.title || !st.link) { console.log('⛔ 초안이 불완전 — 발행하지 않는다'); process.exit(1); }
if (T.dry) { await clickText(/下書き保存/, '下書き保存'); await L.wait(3000); console.log('DRY — 下書き까지만. 편집 주소:', await page.url()); process.exit(0); }

// 발행 — 公開に進む → 해시태그 → 投稿する(주소가 /publish 를 떠날 때까지 최대 3번)
if (!(await clickText(/^公開に進む$/, '公開に進む'))) { console.log('⛔ 公開に進む 없음'); process.exit(1); }
await L.wait(7000);
for (const tag of (T.tags || [])) {
  const inp = await page.evaluate(() => { const e = [...document.querySelectorAll('input')].find((x) => /ハッシュタグ/.test(x.getAttribute('placeholder') || '') && x.getBoundingClientRect().width > 0);
    if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: Math.round(b.x + 30), y: Math.round(b.y + b.height / 2) }; });
  if (!inp) { console.log('(해시태그 칸 없음 — 태그 없이 진행, 발행 뒤 更新する 로 추가)'); break; }
  await page.mouse.click(inp.x, inp.y, { label: '해시태그' }); await L.wait(400);
  await page.keyboard.type(tag, { delay: 30 }); await L.wait(900); await page.keyboard.press('Enter'); await L.wait(900);
}
let pubUrl = null;
for (let i = 1; i <= 3 && !pubUrl; i++) {
  if (!(await clickText(/^投稿する$/, '投稿する'))) { console.log(`[${i}] 投稿する 없음`); break; }
  await L.wait(9000);
  const u = await page.url();
  if (!/\/publish\/?/.test(u)) pubUrl = u;
}
if (!pubUrl) {
  // 게시 뒤 이동이 없을 수 있다 — 프로필 최신 글에서 제목으로 찾는다
  try { await page.goto('https://note.com/signumhq', { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(8000);
  pubUrl = await page.evaluate((ttl) => { const a = [...document.querySelectorAll('a[href*="/signumhq/n/"]')].find((x) => (x.innerText || '').includes(ttl.slice(0, 12))); return a ? a.href : null; }, T.title || '');
}
if (!pubUrl || !/note\.com\/signumhq\/n\/n[0-9a-f]+/.test(pubUrl)) { console.log('⛔ 공개 주소를 못 찾았다 — «발행했다»고 적지 않는다:', pubUrl); process.exit(1); }
pubUrl = pubUrl.split('?')[0];

// 비로그인 검증
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const res = await fetch(pubUrl, { headers: { 'user-agent': UA } });
const html = await res.text();
const ok = { status: res.status, title: html.includes((T.title || '').slice(0, 12)), link: /signumhq\.com(\/|%2F)app(\?|%3F)from(=|%3D)note/.test(html), ogimg: /property="og:image"/.test(html) };
console.log('공개 검증(비로그인):', JSON.stringify(ok));
if (!(ok.status === 200 && ok.title && ok.link)) { console.log('⛔ 공개 페이지 확인 실패 —', pubUrl); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', pubUrl);
console.log('다음: node scripts/mkt-plan.js pub note_jp "' + pubUrl + '"');
