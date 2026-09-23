#!/usr/bin/env node
/* ============================================================================
 * quora-answer — Quora 질문에 «사람처럼» 답을 쓰고(이미지 1장), 스스로 공개 검증한다.
 *
 * ★2026-09-23 만든 이유:
 *   Quora 발행은 /tmp/ego/q1~q19.mjs 조각으로만 있었다(버튼 찾기·Post 활성화·결과 확인이 파일마다 따로).
 *   세션·모델이 바뀌면 /tmp 는 «기억에만 있는 도구»가 된다 → 다른 발행기처럼 저장소에 한 파일로 둔다.
 *
 * 사용(ego 런타임은 env·argv 를 못 받는다 → 작업 파일):
 *   cat > /tmp/ego/quora-task.json <<'J'
 *   {"url":"https://www.quora.com/unanswered/How-do-I-track-Congress-stock-trades",
 *    "text_file":"/tmp/ego/quora.txt","image":"/abs/data-screen.png","mark":"본문에 있는 고유 문구","dry":true}
 *   J
 *   ego-browser nodejs < scripts/quora-answer.mjs      # dry:true 면 채우기만 하고 스크린샷을 남긴다
 *
 * 안전선(스크립트가 강제한다):
 *   · 본문에 링크(http, www., .com/ 등)가 있으면 거부 — Quora 는 링크 답변을 스팸으로 지운다(9/13~15 5건 중 3건).
 *   · 편집기에 이미 글(초안)이 있으면 멈춘다 — 남의 초안 위에 덧쓰면 두 글이 섞인다.
 *   · Post 는 «내용이 바뀌어야» 열린다(9/16 실측) — 비활성이면 공백 입력·삭제로 변경 이벤트를 준다.
 *   · 게시 후 질문 페이지를 다시 열어 «mark» 문구가 우리 답으로 보이는지 확인. 못 보면 실패로 끝낸다.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;

const TASK = '/tmp/ego/quora-task.json';
let T;
try { T = JSON.parse(fs.readFileSync(TASK, 'utf8')); } catch { console.log('작업 파일이 없다:', TASK); process.exit(1); }
const body = fs.readFileSync(T.text_file, 'utf8').replace(/\r/g, '').trim();
if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|app|gov)\b/i.test(body)) { console.log('⛔ 본문에 링크·도메인이 있다 — Quora 는 스팸으로 지운다'); process.exit(1); }
if (!T.mark || !body.includes(T.mark)) { console.log('⛔ mark 가 본문에 없다'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /quora\.com/, null);
try { await page.goto(T.url, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);
const info = await page.info().catch(() => null);
if (info && info.dialog) { await page.dismissDialog().catch(() => {}); await L.wait(800); }

// 이미 우리 답이 있으면 다시 쓰지 않는다
const pre = await page.evaluate((mark) => (document.body.innerText || '').includes(mark), T.mark);
if (pre) { console.log('이미 같은 답이 보인다 — 중복 발행하지 않는다'); process.exit(0); }

// ① 질문의 «Answer» 버튼(상단 내비의 알림 배지가 아니라 질문 옆 버튼)
const btn = await page.evaluate(() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const c = [...document.querySelectorAll('button,div[role=button],a')]
    .map((e) => ({ e, t: n(e.innerText), r: e.getBoundingClientRect() }))
    // 질문 제목 오른쪽의 «Answer · 2»(답 수가 붙는다) 또는 본문 «Answer». 맨 위 알림 배지(y≈0)는 뺀다
    //   초안이 저장돼 있으면 같은 자리 버튼이 «Edit draft · 2» 로 바뀐다(9/23 실측)
    .filter((o) => /^(Answer|Edit draft)(\s*·\s*\d+)?$/i.test(o.t) && o.r.width > 0 && o.r.top > 40)
    .sort((a, b) => a.r.top - b.r.top)[0];
  return c ? { x: Math.round(c.r.left + c.r.width / 2), y: Math.round(c.r.top + c.r.height / 2) } : null;
});
if (!btn) { console.log('⛔ 본문 Answer 버튼을 못 찾았다'); process.exit(1); }
await page.mouse.move(btn.x - 30, btn.y + 12, { label: 'Answer 버튼으로' }); await L.wait(400);
await page.mouse.click(btn.x, btn.y, { label: 'Answer' });
await L.wait(4500);

// ② 편집기 — 가장 넓은 contenteditable. 초안이 있으면 멈춘다
const ed = await page.evaluate(() => {
  const e = [...document.querySelectorAll('[contenteditable=true]')].map((x) => ({ x, r: x.getBoundingClientRect() }))
    .filter((o) => o.r.width > 200).sort((a, b) => b.r.width - a.r.width)[0];
  return e ? { x: Math.round(e.r.left + 40), y: Math.round(e.r.top + 24), len: (e.x.innerText || '').trim().length } : null;
});
if (!ed) { console.log('⛔ 편집기가 안 열렸다'); process.exit(1); }
await page.mouse.click(ed.x, ed.y, { label: '답변 편집기' }); await L.wait(700);
if (ed.len > 0) {
  // «우리» 초안(mark 가 들어 있음)이면 비우고 다시 쓴다. 남의·모르는 초안이면 멈춘다.
  const ours = await page.evaluate((mark) => [...document.querySelectorAll('[contenteditable=true]')].some((x) => (x.innerText || '').includes(mark)), T.mark);
  if (!ours) { console.log(`⛔ 편집기에 모르는 글 ${ed.len}자(초안) — 섞이지 않게 멈춘다. 대표 확인 필요`); process.exit(1); }
  await page.keyboard.press('Meta+a'); await L.wait(300); await page.keyboard.press('Backspace'); await L.wait(900);
  const left = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('[contenteditable=true]')].map((x) => (x.innerText || '').trim().length)));
  if (left > 0) { console.log(`⛔ 우리 초안을 못 비웠다(${left}자 남음)`); process.exit(1); }
  console.log('우리 초안을 비우고 다시 쓴다');
}

// ③ 사람처럼 친다 — 문단은 Enter, 글머리표는 «•» 글자 그대로(자동 목록 변환을 피한다)
// 빈 줄은 치지 않는다 — Quora 는 Enter 한 번이 문단이고, 빈 문단은 간격을 두 배로 벌린다(9/23 실측)
const paras = body.split('\n').filter((p) => p.trim());
for (let i = 0; i < paras.length; i++) {
  await page.keyboard.type(paras[i], { delay: 4 });
  if (i < paras.length - 1) { await page.keyboard.press('Enter'); await L.wait(120); }
}
await L.wait(1500);

// ④ 이미지 1장 — 편집기 안의 «이미지 파일 입력칸»으로 넣는다(커서 위치 = 글 맨 끝에 붙는다).
//   ★9/23 실측: 합성 드래그앤드롭은 «Drop images here» 덮개만 띄우고 파일은 안 받았다.
if (T.image) {
  await page.evaluate(() => { const e = [...document.querySelectorAll('[contenteditable=true]')][0]; if (e) e.dispatchEvent(new DragEvent('dragleave', { bubbles: true })); });
  await page.setInputFiles('input[type=file][accept="image/*"]', [T.image]);
  let imgs = 0;
  for (let i = 0; i < 20 && !imgs; i++) {
    await L.wait(1500);
    imgs = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('[contenteditable=true]')].map((x) => x.querySelectorAll('img').length)));
  }
  console.log('편집기 안 이미지:', imgs);
  if (!imgs) { console.log('⛔ 이미지가 안 들어갔다 — 발행하지 않는다(앱 화면 없는 글 금지)'); process.exit(1); }
}

const shot = await page.screenshot({ path: '/tmp/ego/quora-filled.png' });
const st = await page.evaluate(() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const b = [...document.querySelectorAll('div[role=button],button')].filter((e) => n(e.innerText) === 'Post' && e.getBoundingClientRect().width > 0).pop();
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const txt = [...document.querySelectorAll('[contenteditable=true]')].sort((a, c) => c.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]?.innerText || '';
  return { dis: b.getAttribute('aria-disabled') === 'true' || b.disabled === true, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), len: txt.length };
});
console.log('채움:', JSON.stringify(st), '스크린샷:', shot);
if (!st) { console.log('⛔ Post 버튼 없음'); process.exit(1); }
if (T.dry) { console.log('DRY — 여기서 멈춘다(편집기는 열어 둔다)'); process.exit(0); }
if (st.dis) {
  await page.keyboard.type(' '); await L.wait(700); await page.keyboard.press('Backspace'); await L.wait(1500);
}
await page.mouse.move(st.x - 20, st.y + 8, { label: 'Post 로' }); await L.wait(300);
await page.mouse.click(st.x, st.y, { label: 'Post' });
await L.wait(12000);
const after = await page.evaluate(() => ({ url: location.href, editor: !!document.querySelector('[contenteditable=true]') }));
console.log('게시 후:', JSON.stringify(after));

// ⑤ 검증 — 질문 페이지를 다시 열어 우리 답(mark)이 보이는지. /unanswered/ 주소는 답이 생기면 일반 주소로 바뀐다
const canon = T.url.replace('/unanswered/', '/');
try { await page.goto(canon, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);
const v = await page.evaluate((mark) => {
  const txt = document.body.innerText || '';
  const a = [...document.querySelectorAll('a[href*="/answer/"]')].map((x) => x.href.split('?')[0]);
  return { seen: txt.includes(mark), answerLinks: [...new Set(a)].slice(0, 5) };
}, T.mark);
console.log('검증(로그인 화면):', JSON.stringify(v));
if (!v.seen) { console.log('⛔ 질문 페이지에서 우리 답이 안 보인다 — «발행했다»고 적지 않는다'); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', canon);
console.log('다음: node scripts/mkt-plan.js pub quora_en "' + (v.answerLinks.find((h) => /signum/i.test(h)) || canon) + '"');
