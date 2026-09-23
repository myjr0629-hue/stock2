/* ============================================================================
 * ih-comment — IndieHackers 스레드에 «실측 데이터 댓글» 1건 + 새로고침 후 본문·링크 확인.
 * ★2026-09-24 정본화(/tmp 조각 ih-post*.mjs). IH 는 우리 클릭 2위 채널(21일 35·3일 23) — 인기 스레드에 수치로 답하는 방식이 먹혔다.
 * 사용: /tmp/ego/ih-task.json = {"url":"<스레드 주소 — 받은 값 그대로>","text_file":"/tmp/ego/ih.txt","marks":["본문 고유 문구1","문구2"]}
 *       ego-browser nodejs < scripts/ih-comment.mjs
 * 안전: 작성칸이 «정확히 1개»일 때만(중첩 답글칸 오작동 방지) · 버튼 이름은 공백 정규화 후 «POST COMMENT» · 새로고침 후 문구 확인.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const { readFileSync } = await import('node:fs');
const TASK = JSON.parse(readFileSync('/tmp/ego/ih-task.json', 'utf8'));
const URL_ = TASK.url;
const TEXT = readFileSync(TASK.text_file, 'utf8').trim();

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /indiehackers/, null);
try { await page.goto(URL_, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(8000);

// ① 작성칸은 «하나»뿐임을 매번 확인한다 — 여러 개면 중첩 REPLY 를 잘못 잡은 것이다(9/22 실패 원인).
const pre = await page.evaluate(() => {
  const bs = [...document.querySelectorAll('textarea.comment-box__textarea')];
  if (!bs.length) return { n: 0 };
  const e = bs[0]; e.scrollIntoView({ block: 'center' });
  const b = e.getBoundingClientRect();
  return { n: bs.length, ph: e.getAttribute('placeholder'), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
});
console.log('작성칸:', JSON.stringify(pre));
if (pre.n !== 1) { console.log('⛔ 작성칸이 1개가 아니다 — 중단'); process.exit(1); }

await page.mouse.click(pre.x, pre.y);
await L.wait(600);
await page.keyboard.type(TEXT, { delay: 2 });
await L.wait(1500);

const typed = await page.evaluate(() => {
  const e = document.querySelector('textarea.comment-box__textarea');
  return { len: (e && e.value || '').length, tail: (e && e.value || '').slice(-60) };
});
console.log('입력됨:', JSON.stringify(typed));
if (typed.len < TEXT.length * 0.95) { console.log('⛔ 입력이 잘렸다 — 중단'); process.exit(1); }

// ② 버튼은 «공백 정규화» 후 맞춘다(§normalize-element-text-before-matching)
const btn = await page.evaluate(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const b = [...document.querySelectorAll('button,[role=button],input[type=submit]')]
    .find((e) => norm(e.innerText || e.value) === 'POST COMMENT');
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), disabled: !!b.disabled };
});
console.log('버튼:', JSON.stringify(btn));
if (!btn) { console.log('⛔ POST COMMENT 를 못 찾았다'); process.exit(1); }
await L.wait(400);
await page.mouse.click(btn.x, btn.y);
await L.wait(7000);

// ③ 검증 — 새로고침 후 «본문에 내 문장이 있는가»
try { await page.goto(URL_, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(8000);
const check = await page.evaluate((marks) => {
  const t = (document.body.innerText || '').replace(/\s+/g, ' ');
  return {
    hasMine: marks.every((m) => t.includes(m)),
    hasLink: t.includes('signumhq.com/app?from=indiehackers'),
    comments: (t.match(/REPLY/g) || []).length,
  };
}, TASK.marks || []);
console.log('검증:', JSON.stringify(check));
console.log(check.hasMine ? '✅ 게시·검증 완료: ' + URL_ : '⛔ 본문에서 못 찾았다 — «올렸다»고 적지 않는다');
