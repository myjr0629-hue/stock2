/* ============================================================================
 * note-magazine-add — 내 note 글을 내 マガジン 에 «추가»한다(글 화면 «記事を追加» → 창의 마가진 행 «追加»).
 *
 * 왜 (2026-10-04): slot 의 «실행 2순위 note_magazine» 이 9일째 재배정됐다. 마가진은 9/25 에 이미 만들어져 있고(14글) 그 뒤 글이 안 들어갔다 —
 *   «만들기»는 끝났는데 «새 글 추가» 도구가 없어서 매번 헛걸음이었다(MISTAKES #21·#39 와 같은 종류: 반복 배정 = 도구가 없다는 신호).
 *   화면 실측: 글 페이지의 아이콘 버튼 aria-label=«記事を追加» → 창 «記事を追加 / マガジン / <이름> N本 [追加] / 非公開 あとで読む 0本 [追加] / マガジンを新規作成 / 閉じる».
 * 사용(ego 는 argv·env 를 못 받는다 → 작업 파일 note-mag-task.json — ioDir 또는 /tmp/ego):
 *   {"magazine":"米国株の需給を実測で読む","keys":["nafc2d05ba187","n601cc99c09e2"]}
 *   bash scripts/ego-run.sh scripts/note-magazine-add.mjs 240
 * 이미 담긴 글은 건너뛴다(행의 버튼 글자가 «追加» 가 아니면). 확인은 공개 API: https://note.com/api/v1/magazines/<key> 의 note_count.
 * 안전: 내 계정의 내 마가진에 내 글을 넣을 뿐(계정 생성·약관·결제 없음). «マガジンを新規作成» 은 누르지 않는다.
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync(await L.taskPath('note-mag-task.json'), 'utf8'));
if (!T.magazine || !Array.isArray(T.keys) || !T.keys.length || T.keys.some((k) => !/^n[0-9a-f]{12}$/.test(k))) { console.log('⛔ 작업 파일: {magazine, keys:[n…12자리]} 필요'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /note\.com/, 'https://note.com/signumhq');
const findBtn = (src) => page.evaluate((s) => { // 글 화면의 «記事を追加» 첫 버튼(스크롤 뒤 좌표)
  const e = [...document.querySelectorAll('button,[role=button]')].filter((x) => x.getAttribute('aria-label') === s && x.getBoundingClientRect().width > 0)[0];
  if (!e) return null; e.scrollIntoView({ block: 'center' }); return true; }, src);
const clickAt = async (fnSrc, arg = null) => { // evaluate 인자는 undefined 불가(JSON 직렬화) → 기본 null // 스크롤이 끝난 뒤 «다시» 재서 누른다(MISTAKES §4-4)
  await L.wait(600);
  const p = await page.evaluate(fnSrc, arg);
  if (!p) return false; await page.mouse.click(p.x, p.y); return true; };
const modalInfo = () => page.evaluate((mag) => {
  const nn = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const dlg = [...document.querySelectorAll('[role=dialog]')].find((d) => d.getBoundingClientRect().width > 0 && /マガジンを新規作成/.test(d.innerText || ''));
  if (!dlg) return null;
  const btns = [...dlg.querySelectorAll('button,[role=button]')].filter((b) => b.getBoundingClientRect().width > 0);
  const rows = btns.map((b) => { let r = b; for (let i = 0; i < 4 && r && !(r.innerText || '').includes(mag); i++) r = r.parentElement; const bb = b.getBoundingClientRect();
    return { label: nn(b.innerText), row: nn((r && r.innerText) || '').slice(0, 80), x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2), hit: !!(r && (r.innerText || '').includes(mag)) }; });
  return { text: nn(dlg.innerText).slice(0, 260), rows };
}, T.magazine);
const out = [];
for (const k of T.keys) {
  try { await page.goto(`https://note.com/signumhq/n/${k}`, { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(6500);
  if (!(await findBtn('記事を追加'))) { out.push({ k, r: 'NO_ADD_BUTTON' }); continue; }
  const ok = await clickAt(() => { const e = [...document.querySelectorAll('button,[role=button]')].filter((x) => x.getAttribute('aria-label') === '記事を追加' && x.getBoundingClientRect().width > 0)[0];
    if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; });
  await L.wait(3200);
  const m = await modalInfo();
  if (!ok || !m) { out.push({ k, r: 'NO_MODAL' }); continue; }
  const target = m.rows.find((r) => r.hit && r.label === '追加');
  if (!target) { out.push({ k, r: 'SKIP(이미 담김 또는 행 없음)', rows: m.rows.filter((r) => r.hit).map((r) => r.label) }); await page.keyboard.press('Escape'); continue; }
  await page.mouse.click(target.x, target.y); await L.wait(3000);
  const m2 = await modalInfo();
  out.push({ k, r: 'ADDED?', after: m2 ? m2.text : null });
  await page.keyboard.press('Escape'); await L.wait(800);
}
console.log(JSON.stringify(out, null, 1));
