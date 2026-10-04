#!/usr/bin/env node
/* ============================================================================
 * naver-kin-answer — 네이버 지식iN 답변 1건: «쓸 수 있는 질문인지» 먼저 확인 → 실제 클릭·타이핑 → 등록 → 공개 확인.
 * (2026-09-23 정본화. 대표: 「지식인은 광범위하게, 등급을 올릴 정도로, 실제 인간이 클릭하듯」)
 *
 * 규칙(채널 메모 + memory/confirm-you-can-post-before-writing):
 *   · 쓰기 가능 판정 = 본문 쪽(y>200) 「답변하기」 버튼이 «있는가». 답변 수가 아니다(닫힌 질문엔 버튼이 없다)
 *   · 상단 GNB 의 「답변하기」는 «답변할 질문 목록» 메뉴다 — 누르지 않는다
 *   · 질문 페이지를 열 때 뜨는 JS 대화상자(삭제된 질문 등)는 page.info().dialog → dismissDialog() 로 닫고 건너뛴다
 *   · 본문 링크 금지(광고 신고 대상) · 앱 이름은 0~1회 — 쓸 때는 «내가 만든 앱»이라고 밝힌다(운영정책: 대가·이해관계 공개)
 *   · 투자 조언 요청(«사도 될까요»)·«AI 답변 사절» 표기 질문에는 답하지 않는다
 * 사용: ~/signum-ego-io/<KST 날짜>/kin-task.json (옛 /tmp/ego/kin-task.json 도 읽는다) = {"docId":"495278635","dirId":"40102","lines":[...문단],"mark":"공개 확인용 고유 문구", "acceptDialog":"(선택) 수락할 대화상자 문구 일부"}
 *       bash scripts/ego-run.sh scripts/naver-kin-answer.mjs 300   (종료 코드 3 = 확인창에서 멈춤 → ~/signum-ego-io/<날짜>/kin-last-dialog.json 원문 확인)
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const TASK = await L.taskPath('kin-task.json');   // ~/signum-ego-io/<KST 날짜>/kin-task.json (옛 /tmp/ego 도 읽는다)
L.assertFreshTask(TASK); // ★2026-10-04 낡은 작업 파일 거부(MISTAKES #52)
const T = JSON.parse(fs.readFileSync(TASK, 'utf8'));
console.log('작업 파일:', TASK);
// ★2026-09-24: 표식은 본문에 «그대로» 있어야 한다 — «1,000만원당 2만원»을 표식으로 주고 본문엔 «약 2만원»이라 써서
//   다 쳐 놓고도 «입력 실패»로 멈췄다. 치기 전에 여기서 거른다.
if (!(T.lines || []).join('\n').replace(/\s+/g, ' ').includes(T.mark)) { console.log('⛔ 표식(mark)이 본문(lines)에 그대로 없다 — 표식을 본문에서 복사해 넣을 것'); process.exit(1); }
if (T.lines.some((l) => /https?:\/\//.test(l))) { console.log('⛔ 본문 링크 금지(지식iN 광고 신고 대상)'); process.exit(1); }
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 160)));
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch (e) { console.log('⛔ 작업 공간을 못 잡았다(대표 사용 중일 수 있다):', String(e.message).slice(0, 160)); process.exit(1); }
await L.cleanupPages(ts, 2);
// 재시작 뒤 복원된 지식iN 탭(관리 밖)이 있으면 새 탭을 늘리지 말고 그 탭을 쓴다
let page = null;
for (const t of await ts.tabs()) { if (!t.label && /kin\.naver\.com/.test(t.url || '')) { try { page = await ts.adopt(t.page); break; } catch {} } }
if (!page) page = await L.findPage(ts, /kin\.naver\.com/, null);
// ★2026-09-30 09시: 대화상자 게이트 — 9/29 21시·9/30 07시 두 번 «나스닥 선물» 질문에서 JS 대화상자가 떠 발행기가 죽고 문구가 유실됐다.
//   원칙: ①문구를 먼저 «원문 그대로» 남긴다(/tmp/ego/kin-last-dialog.json) ②알림(확인 단추 하나)은 닫고 화면 상태를 본다
//   ③확인/입력 대화상자는 기본 «취소 + 멈춤» — 사람이 문구를 읽고, 등록 확인이면 kin-task.json 의 acceptDialog 에 문구 일부를 넣어 다시 돌린다
//   ④«등록» 누른 뒤의 확인창은 등록 확인이므로 수락(단 제한·오류 낱말이 있으면 멈춤)
const DLG_LOG = L.ioDir() + '/kin-last-dialog.json';
const seenDlg = [];
const BAD = /제한|불가|없습니다|권한|정지|제재|차단|오류|실패|위반|금지|신고/;
async function dialogGate(stage) {
  let inf = null; try { inf = await page.info(); } catch (e) { console.log('(info 오류)', String(e.message).slice(0, 100)); return 'none'; }
  const d = inf && inf.dialog; if (!d) return 'none';
  const msg = String(d.message || d.text || ''); const type = String(d.type || d.dialogType || '').toLowerCase();
  seenDlg.push({ at: new Date().toISOString(), stage, docId: T.docId, url: inf.url, dialog: d });
  try { fs.writeFileSync(DLG_LOG, JSON.stringify(seenDlg, null, 1)); } catch {}
  console.log(`⚠ 대화상자[${stage}] 종류=${type || '?'} 원문=${JSON.stringify(msg)} 전체=${JSON.stringify(d).slice(0, 400)}`);
  if (T.acceptDialog && msg.includes(T.acceptDialog)) { await page.acceptDialog(); console.log('→ 지정 문구(acceptDialog)와 일치 — 수락'); await L.wait(1500); return 'accepted'; }
  if (stage.startsWith('after-register') && !BAD.test(msg)) { await page.acceptDialog(); console.log('→ 등록 뒤 확인창 — 수락'); await L.wait(1500); return 'accepted'; }
  if (type === 'alert') { await page.acceptDialog(); console.log('→ 알림(확인 단추 하나) — 닫고 화면 상태를 본다'); await L.wait(1500); return 'alert'; }
  await page.dismissDialog(); console.log('→ 확인/입력 대화상자 — 취소로 닫고 멈춘다(문구를 읽고 판단: 등록 확인이면 kin-task.json acceptDialog 에 문구 일부)'); process.exit(3);
}
async function settle(stage, ms) { const out = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await dialogGate(stage); if (r !== 'none') out.push(r); await L.wait(600); } return out; }
async function ev(fn, arg, stage) {
  for (let i = 0; i < 4; i++) { try { return await page.evaluate(fn, arg); } catch (e) { const r = await dialogGate(stage + '/평가 중'); if (r === 'none') throw e; } }
  throw new Error('대화상자가 반복된다: ' + stage);
}
{ const r0 = await dialogGate('start'); if (r0 !== 'none') console.log('(시작 시 남아 있던 대화상자 처리:', r0 + ')'); }
// d1id(최상위 분류)는 질문마다 다르다 — 모르면 빼고 dirId+docId 로 연다(2026-09-23 실측: 그래도 열린다)
const Q = `https://kin.naver.com/qna/detail.naver?${T.d1id ? `d1id=${T.d1id}&` : ''}dirId=${T.dirId || '40102'}&docId=${T.docId}`;
try { await page.goto(Q, { waitUntil: 'domcontentloaded' }); } catch (e) { console.log('(goto)', String(e.message).slice(0, 100)); }
// 9/29 21시 실측: 대화상자가 로드 «몇 초 뒤»에 떴다 → 8초 동안 지켜본다
const atLoad = await settle('load', 8000);
if (atLoad.length) console.log('로드 중 대화상자 처리:', atLoad.join(','));
const pre = await ev((mark) => { const t = (document.body.innerText || '').replace(/\s+/g, ' ');
  const me = /byth\*{4}님/.test(t);   // 로그인된 우리 계정 표식(«byth****님, 정보를 공유해 주세요»)
  const mine = t.includes(mark);
  const btn = [...document.querySelectorAll('a,button')].filter((b) => /답변하기/.test(b.innerText) && b.getBoundingClientRect().y + window.scrollY > 200 && b.getBoundingClientRect().width > 0).length;
  return { me, mine, btn }; }, T.mark, 'pre');
console.log('사전 확인:', JSON.stringify(pre));
if (!pre.me) { console.log('⛔ 로그인 표식(byth****님)이 안 보인다 — 로그인이 풀렸을 수 있다. 비밀번호 입력은 내 몫이 아니다 → 멈춤'); process.exit(1); }
if (pre.mine) { console.log('이미 우리 답변이 있다 — 중복 금지'); process.exit(0); }
if (!pre.btn) { console.log('⛔ 본문 쪽 «답변하기» 버튼이 없다 — 닫힌 질문'); process.exit(1); }
const bpos = async () => ev(() => { const e = [...document.querySelectorAll('a,button')].find((x) => /답변하기/.test(x.innerText) && x.getBoundingClientRect().y + window.scrollY > 200 && x.getBoundingClientRect().width > 0); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }, null, 'button');
await bpos(); await L.wait(900);
const b = await bpos();
await page.mouse.move(b.x - 12, b.y + 4, { label: '답변하기로 이동' }); await L.wait(350);
const rc = await page.mouse.click(b.x, b.y, { label: '답변하기 누르기' });
if (rc && rc.dialog) console.log('클릭 영수증 대화상자:', JSON.stringify(rc.dialog).slice(0, 300));
// ★2026-09-30 08:1x: «답변하기» 직후 JS 대화상자가 떠서 다음 evaluate 가 PageDialogOpenedError 로 죽었다(답변 미등록·문구 유실).
//   → 위 dialogGate 가 문구를 남기고, 알림이면 닫은 뒤 편집기가 실제로 열렸는지로 판정한다.
const atClick = await settle('after-answer-click', 7000);
if (atClick.length) console.log('답변하기 뒤 대화상자 처리:', atClick.join(','));
// 편집 영역 — 안내 문구(placeholder) 자리를 실제로 클릭한다(못 찾으면 멈춘다: 짐작 좌표 클릭 금지)
const area = await ev(() => { const c = [...document.querySelectorAll('.se-content, .se-canvas, [class*=se-component-content], .se-placeholder, [contenteditable]')].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + 40), y: Math.round(r.y + 24), w: r.width, h: r.height }; }).filter((o) => o.w > 300 && o.h > 20 && o.y > 100 && o.y < 700);
  return c[0] || null; }, null, 'editor');
console.log('편집 영역:', JSON.stringify(area));
if (!area) { console.log('⛔ 답변 편집기가 열리지 않았다' + (seenDlg.length ? ' — 대화상자 원문: ' + JSON.stringify(seenDlg.map((x) => x.dialog && (x.dialog.message || x.dialog.text))) : '') + ' → 등록하지 않는다'); process.exit(1); }
await page.mouse.click(area.x, area.y, { label: '답변 본문 클릭' }); await L.wait(700);
for (let i = 0; i < T.lines.length; i++) {
  if (T.lines[i]) await page.keyboard.type(T.lines[i], { delay: 7 });
  if (i < T.lines.length - 1) { await page.keyboard.press('Enter'); await L.wait(160); }
}
await L.wait(1500);
const typed = await ev((mark) => (document.body.innerText || '').replace(/\s+/g, ' ').includes(mark), T.mark, 'typed');
console.log('입력 확인:', typed);
if (!typed) { console.log('⛔ 본문이 편집기에 안 들어갔다 — 등록하지 않는다'); process.exit(1); }
const reg = await ev(() => { const e = [...document.querySelectorAll('button,a')].find((x) => (x.innerText || '').replace(/\s+/g, ' ').trim() === '등록' && x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().y < 200); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }, null, 'register-button');
if (!reg) { console.log('⛔ 등록 버튼 없음'); process.exit(1); }
await page.mouse.move(reg.x - 8, reg.y + 3, { label: '등록으로 이동' }); await L.wait(300);
const rc2 = await page.mouse.click(reg.x, reg.y, { label: '답변 등록' });
if (rc2 && rc2.dialog) console.log('등록 클릭 영수증 대화상자:', JSON.stringify(rc2.dialog).slice(0, 300));
const atReg = await settle('after-register', 8000);
if (atReg.length) console.log('등록 뒤 대화상자 처리:', atReg.join(','));
await L.wait(3000);
// 공개 확인 — 등록 직후 주소에 붙는 answerNo 로 «그 답변» 페이지를 로그인 없이 받아 문구를 찾는다.
// ⚠ 2026-09-23: 질문 기본 주소는 «최적 답변 몇 개»만 서버에서 그려서 새 답변이 안 보였다(오판 직전).
//   화면에는 «byth****님! 답변 고맙습니다.» 가 뜨고 주소가 …&answerNo=6 으로 바뀐다 — 그 주소가 정답이다.
const after = await page.url();
const ansNo = (after.match(/answerNo=(\d+)/) || [])[1];
const V = ansNo ? `${Q}&answerNo=${ansNo}` : Q;
const html = await (await fetch(V, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh)' } })).text();
// ★2026-09-24: 표식에 «S&P» 가 있으면 HTML 은 &amp; 로 적는다 → 엔티티를 풀고 비교(이걸 몰라 공개된 답변을 «안 보인다»고 판정했다)
const decode = (x) => x.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;|&#x27;/gi, "'").replace(/&nbsp;/g, ' ');
let ok = decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').includes(T.mark);
if (!ok) {
  // 질문 페이지는 답변 5개만 그린다 — 나머지는 공개 API(로그인 없음)로 페이지를 넘기며 찾는다(9/24 실측: page=2&count=5 에 9번째 답변)
  for (let pg = 1; pg <= 6 && !ok; pg++) {
    const api = `https://kin.naver.com/ajax/detail/answerList.naver?dirId=${T.dirId}&docId=${T.docId}&answerSortType=&answerViewType=DETAIL&answerNo=&page=${pg}&count=5`;
    const j = await (await fetch(api, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh)', referer: Q, 'x-requested-with': 'XMLHttpRequest' } })).text().catch(() => '');
    ok = decode(JSON.parse(JSON.stringify(j)).replace(/<[^>]*>/g, ' ')).replace(/\\u0026/g, '&').replace(/\s+/g, ' ').includes(T.mark);
    if (!/"detailAnswerList":\[\{/.test(j)) break;
  }
}
console.log('답변 번호:', ansNo || '(없음)');
console.log('공개 확인(로그인 없이):', ok);
if (!ok) { console.log('⛔ 공개 페이지에 우리 답변이 안 보인다 — «올렸다»고 적지 않는다(검수 대기일 수 있다)'); process.exit(1); }
console.log('\n✅ 답변 등록·공개 확인:', V);
