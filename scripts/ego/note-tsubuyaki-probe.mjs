/* ============================================================================
 * note-tsubuyaki-probe — note 의 «つぶやき»(짧은 글) 작성 화면까지 «눌러서» 들어가 구조만 읽는다(읽기 전용 — 입력·게시·체크 없음). 2026-10-05 09시 회차 신설.
 * 왜: channels.json candidates `note_tsubuyaki`(9/30 10:4x 확장 발굴)가 «메뉴를 좌표(1151,32)로 눌러 항목이 안 잡혀» 작성창까지 못 간 채 «미게시»로 남았다.
 *   일본 폰(note 앱) 독자용 새 레인인데 화면 구조(메뉴 항목·약관 체크 유무·이미지 버튼·글자 수)를 모르면 캡·창·게이트를 못 정한다(MISTAKES #47·#49).
 * 방법: note.com 홈 → 머리줄의 «投稿メニュー»(aria-label 또는 글자) 버튼을 «실제 마우스»로 눌러 메뉴 항목 글자를 읽고 → «つぶやき» 항목이 있으면 눌러 작성창을 연 뒤
 *   창의 글자·입력칸(placeholder·글자수)·체크박스(약관 여부)·버튼 글자를 읽는다 → Escape 로 닫는다. 아무것도 입력·체크·제출하지 않는다.
 * 사용: bash scripts/ego-run.sh scripts/ego/note-tsubuyaki-probe.mjs 120   (작업 파일 없음) · 결과 JSON + 스크린샷은 ioDir 의 note-tsubuyaki-probe.json/.png
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /note\.com/, 'https://note.com/');
await L.trapDialogs(page);
const R = { at: new Date().toISOString(), steps: [] };
const step = (k, v) => { R.steps.push({ k, v }); console.log(k, JSON.stringify(v).slice(0, 600)); };
try { await page.goto('https://note.com/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(6500);
step('url', await page.evaluate(() => location.href));
// 1) 머리줄 «投稿メニュー» 버튼(없으면 «投稿» 글자 근처 버튼) 위치 — 클릭은 «재측정 뒤» 실제 마우스로
const where = () => page.evaluate(() => {
  const nn = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const c = [...document.querySelectorAll('button,[role=button],a')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.y < 90; })
    .map((e) => { const b = e.getBoundingClientRect(); return { label: nn(e.getAttribute('aria-label') || ''), text: nn(e.innerText || '').slice(0, 20), href: (e.getAttribute('href') || '').slice(0, 40), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width) }; });
  return c;
});
const header = await where();
step('머리줄 버튼', header);
const menuBtn = header.find((b) => /投稿メニュー/.test(b.label + ' ' + b.text)) || null;
if (!menuBtn) { step('결과', '투고 메뉴 버튼을 못 찾음(로그아웃·화면 변경 가능)'); fs.writeFileSync(L.ioDir() + '/note-tsubuyaki-probe.json', JSON.stringify(R, null, 1)); process.exit(0); }
await L.wait(500);
const mb2 = (await where()).find((b) => /投稿メニュー/.test(b.label + ' ' + b.text));
await page.mouse.click(mb2.x, mb2.y);
await L.wait(1800);
// 2) 메뉴 항목 글자 — 역할(role)에 기대지 않고 «머리줄 아래 오른쪽 영역에 새로 뜬 글자 잎 노드»를 읽는다(첫 시험 roles 가정이 빈 목록이었다)
try { await page.screenshot({ path: L.ioDir() + '/note-tsubuyaki-menu.png', type: 'png' }); } catch {}
const items = await page.evaluate(() => {
  const nn = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.children.length > 0) continue;
    const t = nn(e.innerText || e.textContent);
    if (!t || t.length > 30) continue;
    const b = e.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0 || b.y < 50 || b.y > 520 || b.x < 700) continue;
    const c = e.closest('a,button,[role=menuitem],[role=button],li');
    const cb = (c || e).getBoundingClientRect();
    out.push({ t, tag: e.tagName, host: c ? c.tagName : '', href: ((c && c.getAttribute('href')) || '').slice(0, 50), x: Math.round(cb.x + cb.width / 2), y: Math.round(cb.y + cb.height / 2) });
  }
  return out;
});
const seen = new Set(); const uniq = items.filter((i) => { const k = i.t + '|' + i.href; if (seen.has(k)) return false; seen.add(k); return true; });
step('메뉴 항목', uniq.slice(0, 20));
const tsu = uniq.find((i) => /つぶやき/.test(i.t));
if (!tsu) { step('결과', '메뉴에 «つぶやき» 항목 없음'); await page.keyboard.press('Escape'); fs.writeFileSync(L.ioDir() + '/note-tsubuyaki-probe.json', JSON.stringify(R, null, 1)); process.exit(0); }
await L.wait(400);
await page.mouse.click(tsu.x, tsu.y);
await L.wait(3000);
// 3) 작성창 구조(읽기만)
const dlg = await page.evaluate(() => {
  const nn = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const d = [...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(vis)[0] || document.body;
  return {
    url: location.href,
    text: nn(d.innerText).slice(0, 500),
    editors: [...d.querySelectorAll('textarea,[contenteditable=true],input[type=text]')].filter(vis).map((e) => ({ tag: e.tagName, ph: e.getAttribute('placeholder') || e.getAttribute('data-placeholder') || e.getAttribute('aria-label') || '', len: (e.value || e.innerText || '').length })),
    checkboxes: [...d.querySelectorAll('input[type=checkbox],[role=checkbox]')].filter(vis).map((e) => nn((e.closest('label') || e.parentElement || e).innerText).slice(0, 80)),
    files: [...d.querySelectorAll('input[type=file]')].length,
    buttons: [...d.querySelectorAll('button,[role=button]')].filter(vis).map((e) => nn(e.getAttribute('aria-label') || e.innerText).slice(0, 24)).filter(Boolean).slice(0, 14),
  };
});
step('작성창', dlg);
try { await page.screenshot({ path: L.ioDir() + '/note-tsubuyaki-probe.png', type: 'png' }); } catch (e) { step('스크린샷 실패', String(e && e.message).slice(0, 80)); }
await page.keyboard.press('Escape'); await L.wait(800);
fs.writeFileSync(L.ioDir() + '/note-tsubuyaki-probe.json', JSON.stringify(R, null, 1));
console.log('끝 — 입력·체크·게시 없음(읽기 전용)');
