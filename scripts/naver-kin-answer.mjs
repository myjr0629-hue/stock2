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
 * 사용: /tmp/ego/kin-task.json = {"docId":"495278635","dirId":"40102","lines":[...문단],"mark":"공개 확인용 고유 문구"}
 *       ego-browser nodejs < scripts/naver-kin-answer.mjs
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/kin-task.json', 'utf8'));
if (T.lines.some((l) => /https?:\/\//.test(l))) { console.log('⛔ 본문 링크 금지(지식iN 광고 신고 대상)'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /kin\.naver\.com/, null);
// d1id(최상위 분류)는 질문마다 다르다 — 모르면 빼고 dirId+docId 로 연다(2026-09-23 실측: 그래도 열린다)
const Q = `https://kin.naver.com/qna/detail.naver?${T.d1id ? `d1id=${T.d1id}&` : ''}dirId=${T.dirId || '40102'}&docId=${T.docId}`;
try { await page.goto(Q, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(2500);
let info = await page.info(); if (info && info.dialog) { console.log('⛔ 질문 페이지 대화상자:', JSON.stringify(info.dialog).slice(0, 100)); await page.dismissDialog(); process.exit(1); }
await L.wait(3500);
const pre = await page.evaluate((mark) => { const t = (document.body.innerText || '').replace(/\s+/g, ' ');
  const me = /byth\*{4}님/.test(t);   // 로그인된 우리 계정 표식(«byth****님, 정보를 공유해 주세요»)
  const mine = t.includes(mark);
  const btn = [...document.querySelectorAll('a,button')].filter((b) => /답변하기/.test(b.innerText) && b.getBoundingClientRect().y + window.scrollY > 200 && b.getBoundingClientRect().width > 0).length;
  return { me, mine, btn }; }, T.mark);
console.log('사전 확인:', JSON.stringify(pre));
if (pre.mine) { console.log('이미 우리 답변이 있다 — 중복 금지'); process.exit(0); }
if (!pre.btn) { console.log('⛔ 본문 쪽 «답변하기» 버튼이 없다 — 닫힌 질문'); process.exit(1); }
const bpos = async () => page.evaluate(() => { const e = [...document.querySelectorAll('a,button')].find((x) => /답변하기/.test(x.innerText) && x.getBoundingClientRect().y + window.scrollY > 200 && x.getBoundingClientRect().width > 0); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
await bpos(); await L.wait(900);
const b = await bpos();
await page.mouse.move(b.x - 12, b.y + 4, { label: '답변하기로 이동' }); await L.wait(350);
await page.mouse.click(b.x, b.y, { label: '답변하기 누르기' });
await L.wait(5500);
// 편집 영역 — 안내 문구(placeholder) 자리를 실제로 클릭한다
const area = await page.evaluate(() => { const c = [...document.querySelectorAll('.se-content, .se-canvas, [class*=se-component-content], .se-placeholder, [contenteditable]')].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + 40), y: Math.round(r.y + 24), w: r.width, h: r.height }; }).filter((o) => o.w > 300 && o.h > 20 && o.y > 100 && o.y < 700);
  return c[0] || null; }) || { x: 404, y: 273 };
console.log('편집 영역:', JSON.stringify(area));
await page.mouse.click(area.x, area.y, { label: '답변 본문 클릭' }); await L.wait(700);
for (let i = 0; i < T.lines.length; i++) {
  if (T.lines[i]) await page.keyboard.type(T.lines[i], { delay: 7 });
  if (i < T.lines.length - 1) { await page.keyboard.press('Enter'); await L.wait(160); }
}
await L.wait(1500);
const typed = await page.evaluate((mark) => (document.body.innerText || '').replace(/\s+/g, ' ').includes(mark), T.mark);
console.log('입력 확인:', typed);
if (!typed) { console.log('⛔ 본문이 편집기에 안 들어갔다 — 등록하지 않는다'); process.exit(1); }
const reg = await page.evaluate(() => { const e = [...document.querySelectorAll('button,a')].find((x) => (x.innerText || '').replace(/\s+/g, ' ').trim() === '등록' && x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().y < 200); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
if (!reg) { console.log('⛔ 등록 버튼 없음'); process.exit(1); }
await page.mouse.move(reg.x - 8, reg.y + 3, { label: '등록으로 이동' }); await L.wait(300);
await page.mouse.click(reg.x, reg.y, { label: '답변 등록' });
await L.wait(4000);
info = await page.info(); if (info && info.dialog) { console.log('등록 후 대화상자:', JSON.stringify(info.dialog).slice(0, 160)); await page.acceptDialog(); await L.wait(4000); }
await L.wait(4000);
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
