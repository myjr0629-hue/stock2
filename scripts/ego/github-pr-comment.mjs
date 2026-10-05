/* GitHub PR·이슈 «댓글 달기·고치기» — 로그인된 브라우저 세션으로 우리 PR 에 답글을 달거나 «내가 쓴» 댓글을 고친다 (2026-10-05 15시 회차 신설)
 * 왜: wilsonfreitas/awesome-quant #648(★29.5K) 에 관리자가 9/12 22:30 UTC 에 «무료 등급 증빙 요청»을 남겼는데 23일간 답이 없었다
 *     (channels.json 노트는 «지적사항 0» — 새 댓글을 읽는 도구가 없었다 → scripts/github-pr-status.py 가 읽고, 이 스크립트가 답한다).
 *     이 맥에는 저장소 쓰기 토큰이 없다(t165) → 로그인된 브라우저 세션을 쓴다(데이터셋 업로드 github-upload.mjs 와 같은 방식).
 * 실행: ~/signum-ego-io/<KST 날짜>/gh-comment-task.json
 *         새 댓글: {"pr":"https://github.com/<owner>/<repo>/pull/<n>","lines":["문단","","문단"]}
 *         고치기 : {"pr":"…","edit":<댓글 id(숫자)>,"lines":[…]}   ← 내 계정이 쓴 댓글만(API 로 작성자를 확인한다)
 *       bash scripts/ego-run.sh scripts/ego/github-pr-comment.mjs 150   → 결과 gh-comment-result.json
 * 규칙: ① ★줄바꿈은 «Enter 키 이벤트»가 아니라 insertText 안의 «\n» 으로 넣는다 — 10/5 14:07 첫 게시에서 lib.typeInto 의 Enter 키(keyDown/keyUp, text 없음)가
 *         textarea 에 줄바꿈을 못 넣어 문단 4개가 한 덩어리로 붙어 올라갔다(API 본문 newlines=0). typeInto 는 contenteditable 편집기용이다.
 *       ② 본문에 목록 문법(줄 맨 앞 «- »·«1. »)·@멘션·#번호를 쓰지 않는다(GitHub 자동 이어쓰기·멘션 자동완성).
 *       ③ 로그인 계정이 myjr0629-hue 가 아니면 멈춘다(로그인·비밀번호는 만지지 않는다).
 *       ④ 새 댓글은 같은 첫 줄 댓글이 이미 있으면 달지 않는다(중복 방지 — MISTAKES #73·#83) · 작업 파일은 25분 안 것만(MISTAKES #52).
 *       ⑤ 검증은 «비로그인 공개 API»로 — 글자 앞부분만이 아니라 «줄바꿈 수»까지 기대와 맞춘다(편집기 화면은 증거가 아니다).
 */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const ME = 'myjr0629-hue';
const tp = await L.taskPath('gh-comment-task.json');
L.assertFreshTask(tp, 25);
const task = JSON.parse(fs.readFileSync(tp, 'utf8'));
const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)$/.exec(task.pr || '');
if (!m) { console.log('⛔ pr 주소 형식이 아니다: ' + task.pr); process.exit(1); }
const [, owner, repo, , num] = m;
const lines = Array.isArray(task.lines) ? task.lines : [];
const text = lines.join('\n');
const first = (lines.find((s) => s && s.trim()) || '').trim();
if (!first) { console.log('⛔ 본문이 비었다'); process.exit(1); }
const nl = (s) => (s || '').replace(/\r\n/g, '\n');
const editId = task.edit ? String(task.edit) : null;
const GH = { 'user-agent': 'signum-gh-check' };
const API = `https://api.github.com/repos/${owner}/${repo}/issues/${num}/comments?per_page=100`;
const readComments = async () => { try { const r = await fetch(API, { headers: GH }); return r.ok ? await r.json() : null; } catch { return null; } };
const mine = (arr) => (arr || []).find((c) => c.user && c.user.login === ME && nl(c.body).trim().startsWith(first.slice(0, 40)));
const before = await readComments();
if (before === null) { console.log('⛔ 공개 API 읽기 실패 — 달기 전 확인을 못 한다(건드리지 않는다)'); process.exit(1); }
if (editId) {
  const t = before.find((c) => String(c.id) === editId);
  if (!t) { console.log('⛔ 그 id 의 댓글이 이 글에 없다: ' + editId); process.exit(1); }
  if (!t.user || t.user.login !== ME) { console.log('⛔ 내 계정이 쓴 댓글이 아니다 — 고치지 않는다'); process.exit(1); }
} else if (mine(before)) { console.log('이미 같은 첫 줄 댓글이 있다 — 달지 않는다: ' + mine(before).html_url); process.exit(0); }

const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await L.findPage(ts, /github\.com/, null);
try { await page.goto(task.pr + (editId ? '#issuecomment-' + editId : ''), { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch { /* 느려도 그려진다 */ }
await L.wait(8000);
const me = await page.evaluate(() => (document.querySelector('meta[name="user-login"]') || {}).content || '');
if (me !== ME) { console.log(`⛔ 로그인 계정이 ${ME} 가 아니다(${me || '비로그인'}) — 대표 로그인 필요. 건드리지 않는다`); process.exit(1); }

// 입력칸 고르기: 고치기 = 그 댓글 안의 «수정 중» textarea · 새 댓글 = 맨 아래 comment[body] 중 보이는 마지막
const PICK = `(function(editId){
  const vis = (t) => t.getBoundingClientRect().width > 100;
  if (editId) { const c = document.querySelector('#issuecomment-' + editId) || document.getElementById('issuecomment-' + editId); const r = c ? [...c.querySelectorAll('textarea')].filter(vis) : []; return r[0] || null; }
  return [...document.querySelectorAll('textarea')].filter((t) => /comment\\[body\\]|new_comment_field/.test((t.name || '') + ' ' + (t.id || '')) && vis(t)).pop() || null;
})`;
const findBox = () => page.evaluate(({ PICK, editId }) => {
  const ta = eval(PICK)(editId); if (!ta) return null;
  ta.scrollIntoView({ block: 'center' });
  const r = ta.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), inView: r.top > 0 && r.bottom < innerHeight, len: (ta.value || '').length };
}, { PICK, editId });

if (editId) {
  // 댓글 머리의 «⋯»(summary.timeline-comment-action — aria-label 이 없고 아이콘뿐이다)를 «실제 마우스»로 열고 메뉴의 Edit 를 누른다.
  // ★«actions|options» 정규식으로 찾지 말 것: «Add or remove reactions» 가 걸려 반응 선택창을 열었다(10/5 14:08 실측 · 반응은 고르지 않았다).
  const k = await page.evaluate((id) => {
    const c = document.getElementById('issuecomment-' + id); const kb = c && c.querySelector('summary.timeline-comment-action');
    if (!kb) return null; kb.scrollIntoView({ block: 'center' }); const r = kb.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, editId);
  if (!k) { console.log('⛔ 댓글 «⋯» 메뉴(summary.timeline-comment-action)를 못 찾았다 — 화면 구조 변경'); process.exit(1); }
  await L.wait(400);
  await page.mouse.click(k.x, k.y, {});
  let editPt = null;
  for (let i = 0; i < 6 && !editPt; i++) {            // 메뉴 내용이 늦게 붙을 수 있어 최대 6초
    await L.wait(1000);
    editPt = await page.evaluate((id) => {
      const c = document.getElementById('issuecomment-' + id); if (!c) return null;
      const b = c.querySelector('.js-comment-edit-button') || [...c.querySelectorAll('button,a,li,span')].find((x) => (x.innerText || '').replace(/\s+/g, ' ').trim() === 'Edit' && x.getBoundingClientRect().width > 0);
      if (!b) return null; const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), cls: String(b.className || '').slice(0, 40) };
    }, editId);
  }
  if (!editPt) { console.log('⛔ 메뉴에서 Edit 항목을 못 찾았다(내 댓글이 아니거나 화면 구조 변경)'); process.exit(1); }
  console.log('수정 항목:', JSON.stringify(editPt));
  if (editPt.w > 0) await page.mouse.click(editPt.x, editPt.y, {});
  else await page.evaluate((id) => { document.getElementById('issuecomment-' + id).querySelector('.js-comment-edit-button').click(); }, editId);
  await L.wait(2500);
}

let box = await findBox();
if (!box) { console.log('⛔ 입력칸을 못 찾았다(잠긴 글이거나 화면 구조 변경)'); process.exit(1); }
await L.wait(600); box = await findBox();            // 스크롤 «뒤» 좌표를 다시 잰다
if (!editId && box.len > 0) { console.log('⛔ 입력칸이 비어 있지 않다(' + box.len + '자) — 남은 초안을 덮어쓰지 않는다'); process.exit(1); }
await page.mouse.click(box.x, box.y, {}); await L.wait(600);
if (editId) {   // 기존 글 전체 선택 → 아래 insertText 가 «덮어쓴다»
  await page.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4, commands: ['selectAll'] });
  await page.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4 });
  await L.wait(300);
}
for (let j = 0; j < text.length; j += 400) { await page.cdp('Input.insertText', { text: text.slice(j, j + 400) }); await L.wait(250); }   // ★줄바꿈은 «\n» 문자로
await L.wait(800);
const typed = nl(await page.evaluate(({ PICK, editId }) => { const ta = eval(PICK)(editId); return ta ? ta.value : ''; }, { PICK, editId }));
const wantNl = text.split('\n').length - 1;
const gotNl = typed.split('\n').length - 1;
console.log(`입력 확인: ${typed.length}자 / 기대 ${text.length}자 · 줄바꿈 ${gotNl}/${wantNl} · 첫 줄 일치=${typed.startsWith(first.slice(0, 40))}`);
if (typed !== text) {
  console.log('⛔ 입력 칸의 글이 기대와 «완전히» 같지 않다 — 올리지 않는다(칸에 남은 초안은 사람이 본다)');
  console.log('   기대 끝 40자: ' + JSON.stringify(text.slice(-40)) + ' / 실제 끝 40자: ' + JSON.stringify(typed.slice(-40)));
  process.exit(1);
}
// 제출 버튼 — 같은 form 안, 공백 정규화 후 정확일치(«Comment» / «Update comment»), 켜진 것
const btn = await page.evaluate(({ PICK, editId }) => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const ta = eval(PICK)(editId); const form = ta && ta.closest('form');
  const want = editId ? 'Update comment' : 'Comment';
  const bs = [...(form || document).querySelectorAll('button')].filter((b) => norm(b.innerText) === want && !b.disabled && b.getBoundingClientRect().width > 30);
  const b = bs[bs.length - 1]; if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: norm(b.innerText) };
}, { PICK, editId });
if (!btn) { console.log('⛔ 제출 버튼(' + (editId ? 'Update comment' : 'Comment') + ')이 없거나 꺼져 있다'); process.exit(1); }
await L.wait(500);
await page.mouse.click(btn.x, btn.y, {});
await L.wait(9000);

// 공개 확인 — 비로그인 공개 API(캐시가 늦을 수 있어 3번까지) · 글자 «전체»와 줄바꿈 수가 기대와 같을 때만 성공
let hit = null;
for (let i = 0; i < 3; i++) {
  const arr = await readComments();
  hit = editId ? (arr || []).find((c) => String(c.id) === editId) : mine(arr);
  if (hit && nl(hit.body).trim() === text.trim()) break;
  await L.wait(6000);
}
const exact = !!hit && nl(hit.body).trim() === text.trim();
const out = { pr: task.pr, edit: editId, ok: exact, url: hit ? hit.html_url : null, updatedAt: hit ? (hit.updated_at || hit.created_at) : null, chars: text.length, newlines: hit ? (nl(hit.body).split('\n').length - 1) : null };
fs.writeFileSync(L.ioDir() + '/gh-comment-result.json', JSON.stringify(out, null, 1));
console.log(exact ? `✅ 공개 확인(비로그인 API · 본문 전체·줄바꿈 ${out.newlines}개 일치): ${hit.html_url} · ${out.updatedAt}` : '⛔ 공개 API 의 본문이 기대와 다르다 — 발행했다고 쓰지 않는다(PR 화면을 새로 열어 확인할 것)');
