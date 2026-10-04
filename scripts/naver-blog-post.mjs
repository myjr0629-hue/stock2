#!/usr/bin/env node
/* ============================================================================
 * naver-blog-post — 네이버 블로그(donneum) 한 편을 «처음부터 끝까지» 올린다. (2026-09-23 정리)
 *
 * 왜 한 파일로: 예전 흐름이 /tmp/ego 에 nb-*·nv-* 조각 20여 개로 흩어져 있었다. 세션이 바뀌면
 *   아무도 순서를 모른다. 이 파일이 정본이다. (조작 근거: memory/naver-smarteditor-flow.md)
 *
 * 사용(ego 런타임은 env·argv 를 못 받는다 → 작업 파일):
 *   ~/signum-ego-io/<KST 날짜>/naver-task.json (옛 /tmp/ego 도 읽는다) = {"title","intro":[문단..],"image":"/abs.png","rest":[문단..],
 *                               "url":"https://signumhq.com/app?from=naver_blog&l=ko","footer","tags":[..]}
 *   bash scripts/ego-run.sh scripts/naver-blog-post.mjs 480
 *
 * 2026-09-23 실측으로 확정된 것:
 *   · 편집기는 iframe#mainFrame 안 → 그 src(PostWriteForm.naver)로 직접 이동한다(ego 에 frames() 없음)
 *   · 제목은 .se-title-text 클릭 → keyboard.type, 제목에서 Enter 하면 본문 첫 문단으로 내려간다
 *   · 본문은 keyboard.type 만 먹는다(execCommand 무반응). URL 한 줄 + Enter → OG 카드(se-oglink)
 *   · 사진: 상단 툴바 «사진» → waitForFileChooser 가 «여기서는» 잡힌다(Medium 에서는 안 됐다) →
 *     한 장이면 «개별사진» 대화상자가 안 뜬다. 삽입 위치는 «커서 자리»(인트로 바로 아래에 들어갔다)
 *   · 발행: 헤더 «발행»은 JS click → 패널의 태그칸(placeholder «태그 입력 (최대 30개)») →
 *     패널 안 «발행»(y>200) → 주소가 PostView.naver?…logNo=… 로 바뀌면 성공
 *   · 검증은 로그인 없이 PostView.naver 를 curl — 제목·이미지(se-image-resource)·a[href] 링크
 *   · ★2026-09-30 발행 레이어에서 카테고리 «투자»·주제 «비즈니스·경제»를 눌러서 고른다(작업 파일 category·topic 로 바꿀 수 있다).
 *     안 고르면 첫 칸 «여행»·주제 없음으로 올라간다(9/21~9/30 23편 사고, 기존 글은 9/30 수정 발행으로 옮김).
 *     공개 검증에 categoryNo·postTopics.directory_name 도 포함한다.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const TASK = await L.taskPath('naver-task.json'); L.assertFreshTask(TASK); // ★2026-10-04 낡은 작업 파일 거부(MISTAKES #52)
//   // ~/signum-ego-io/<KST 날짜>/ (옛 /tmp/ego 도 읽는다 — 9/30 재부팅 소실 뒤)
const T = JSON.parse(fs.readFileSync(TASK, 'utf8'));
console.log('작업 파일:', TASK);
if (!/signumhq\.com\/app(-uc|-wim)?\?from=naver_blog/.test(T.url || '')) { console.log('⛔ 스마트링크(?from=naver_blog) 필수'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /blog\.naver\.com/, null);
try { await page.goto('https://blog.naver.com/donneum?Redirect=Write', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
const src = await page.evaluate(() => { const f = document.querySelector('iframe#mainFrame'); return f ? f.src : null; });
if (!src) { console.log('⛔ 편집기 프레임 없음(로그인 확인)'); process.exit(1); }
try { await page.goto(src, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(11000);
const draft = await page.evaluate(() => /작성 중인 글|이어서 작성/.test(document.body.innerText));
if (draft) { console.log('⛔ «작성 중인 글» 팝업 — 기존 초안을 덮지 않도록 멈춘다. 화면에서 확인할 것'); process.exit(1); }

const at = async (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + Math.min(40, r.width / 2)), y: Math.round(r.y + r.height / 2) }; }, sel);
const t = await at('.se-title-text');
if (!t) { console.log('⛔ 제목칸 없음'); process.exit(1); }
await page.mouse.click(t.x, t.y); await L.wait(500);
await page.keyboard.type(T.title, { delay: 12 }); await L.wait(500);
await page.keyboard.press('Enter'); await L.wait(700);
for (const line of T.intro || []) { await page.keyboard.type(line, { delay: 6 }); await page.keyboard.press('Enter'); await L.wait(250); }
await L.wait(800);

let imgOk = false;
if (T.image) {
  const photo = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /사진/.test((x.getAttribute('data-name') || '') + (x.innerText || '') + (x.getAttribute('aria-label') || '')) && x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().y < 140);
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  try {
    const fcP = page.waitForFileChooser();
    await page.mouse.click(photo.x, photo.y);
    const fc = await fcP;
    if (typeof fc.setFiles === 'function') await fc.setFiles(T.image); else await fc.accept([T.image]);
    await L.wait(6000);
    const each = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,label,li,[role=button]')].find((x) => (x.innerText || '').trim() === '개별사진' && x.getBoundingClientRect().width > 0);
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (each) { await page.mouse.click(each.x, each.y); await L.wait(9000); }
    imgOk = await page.evaluate(() => document.querySelectorAll('.se-component.se-image').length > 0);
  } catch (e) { console.log('사진 실패:', String(e.message).slice(0, 80)); }
  if (!imgOk) { console.log('⛔ 앱 화면이 안 들어갔다 — 텍스트만 올리지 않는다(대표 지시). 초안은 남겨 둔다'); process.exit(1); }
}

const lastP = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle'));
  const p = ps[ps.length - 1]; if (!p) return null; p.scrollIntoView({ block: 'center' }); const r = p.getBoundingClientRect();
  return { x: Math.round(r.x + 20), y: Math.round(r.y + r.height / 2) };
});
await L.wait(900);
if (lastP) { await page.mouse.click(lastP.x, lastP.y); await L.wait(400); await page.keyboard.press('End'); }
for (const line of T.rest || []) { await page.keyboard.type(line, { delay: 5 }); await page.keyboard.press('Enter'); await L.wait(220); }
await page.keyboard.press('Enter');
// ★2026-09-26 URL 은 붙여넣는다(절차 · memory paste-urls-never-type-them). 편집기가 붙여넣기를 안 받으면 그때만 타이핑.
const urlIn = () => page.evaluate((u) => document.body.innerText.includes(u)
  || [...document.querySelectorAll('a[href], .se-oglink')].some((a) => String(a.href || a.innerText || '').includes('signumhq.com/app')), T.url);
await page.keyboard.paste({ text: T.url }); await L.wait(1500);
if (!(await urlIn())) { console.log('붙여넣기 미반영 → 타이핑으로 넣는다'); await page.keyboard.type(T.url, { delay: 10 }); }
else console.log('URL 붙여넣기 반영');
await page.keyboard.press('Enter'); await L.wait(5000);
if (T.footer) { await page.keyboard.type(T.footer, { delay: 5 }); await L.wait(1000); }

const st = await page.evaluate(() => ({
  comps: [...document.querySelectorAll('.se-component')].map((c) => (c.className.match(/se-(text|image|oglink|documentTitle)/) || [])[1] || '?').join(','),
  broken: /\u{1F615}/u.test(document.body.innerText),
}));
console.log('작성 상태:', JSON.stringify(st));
if (st.broken || !/oglink/.test(st.comps)) { console.log('⛔ 링크 카드가 없거나 URL 이 깨졌다 — 발행하지 않는다'); process.exit(1); }

await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === '발행' && x.getBoundingClientRect().y < 80); if (b) b.click(); });
await L.wait(3500);
// ★2026-09-30 카테고리·주제(HANDOFF §4 0-za): 발행 레이어를 기본값 그대로 두면 첫 칸 «여행»·«주제 선택 안 함»으로 올라간다
//   → 9/21~9/30 금융 글 23편이 여행 칸·주제 없음 = 네이버 주제 피드(비즈니스·경제)에 한 번도 못 들어갔다.
//   레이어의 «카테고리 목록 버튼»에서 투자(categoryItemText_7)를 «눌러서» 고르고, 주제가 비즈니스·경제인지 확인한다
//   (투자 칸은 주제분류가 비즈니스·경제라 카테고리만 바꿔도 주제가 따라온다 — 9/30 실측 23/23). 둘 중 하나라도 안 되면 발행하지 않는다.
const CAT = T.category || '투자', TOPIC = T.topic || '비즈니스·경제';
const catText = () => page.evaluate(() => (document.querySelector('[aria-label="카테고리 목록 버튼"]')?.innerText || '').replace(/\s+/g, ' ').trim());
const topicText = () => page.evaluate(() => (document.querySelector('[aria-label="주제 목록 버튼"]')?.innerText || '').replace(/\s+/g, ' ').trim());
const centerOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return r.width ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null; }, sel);
const itemOf = (name, sel) => page.evaluate(({ name, sel }) => { const hits = [...document.querySelectorAll(sel)].filter((x) => (x.innerText || '').replace(/\s+/g, ' ').trim() === name && x.getBoundingClientRect().width > 0); const e = hits.find((x) => x.tagName === 'LABEL') || hits[hits.length - 1]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), id: e.getAttribute('data-testid') || '' }; }, { name, sel });
let catNo = null;
if ((await catText()) !== CAT) {
  const cb = await centerOf('[aria-label="카테고리 목록 버튼"]');
  if (cb) { await page.mouse.click(cb.x, cb.y); await L.wait(1500); }
  const it = await itemOf(CAT, '[data-testid^="categoryItemText_"]');
  if (it) { catNo = (it.id.match(/_(\d+)$/) || [])[1] || null; await page.mouse.click(it.x, it.y); await L.wait(1500); }
}
if ((await catText()) !== CAT) { console.log(`⛔ 카테고리 «${CAT}» 선택 실패(현재 «${await catText()}») — 발행하지 않는다`); process.exit(1); }
// 선택된 칸의 번호는 버튼 안 글자의 data-testid(categoryItemText_<번호>)에 있다 — 공개 검증(categoryNo=)에 쓴다
catNo = (await page.evaluate(() => document.querySelector('[aria-label="카테고리 목록 버튼"] [data-testid^="categoryItemText_"]')?.getAttribute('data-testid') || '')).match(/_(\d+)$/)?.[1] || catNo;
if (!(await topicText()).includes(TOPIC)) {
  const tb = await centerOf('[aria-label="주제 목록 버튼"]');
  if (tb) { await page.mouse.click(tb.x, tb.y); await L.wait(1800); }
  const tp = await itemOf(TOPIC, 'label,button,a,span,li');
  if (tp) { await page.mouse.click(tp.x, tp.y); await L.wait(1200); }
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(확인|선택 완료|완료)$/.test((x.innerText || '').trim()) && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
  if (ok) { await page.mouse.click(ok.x, ok.y); await L.wait(1200); }
}
if (!(await topicText()).includes(TOPIC)) { console.log(`⛔ 주제 «${TOPIC}» 선택 실패(현재 «${await topicText()}») — 발행하지 않는다`); process.exit(1); }
console.log(`카테고리 «${await catText()}»${catNo ? `(${catNo})` : ''} · 주제 «${(await topicText()).replace(/\s*>$/, '')}»`);
const tag = await page.evaluate(() => { const e = document.querySelector('input[placeholder*="태그"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
if (tag && (T.tags || []).length) {
  await page.mouse.click(tag.x, tag.y); await L.wait(400);
  for (const tg of T.tags) { await page.keyboard.type(tg, { delay: 30 }); await page.keyboard.press('Enter'); await L.wait(350); }
}
const pub = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => (x.innerText || '').trim() === '발행' && x.getBoundingClientRect().y > 200).pop();
  if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
if (!pub) { console.log('⛔ 패널 발행 버튼 없음'); process.exit(1); }
await page.mouse.click(pub.x, pub.y);
await L.wait(12000);
const href = await page.evaluate(() => location.href);
const logNo = (href.match(/logNo=(\d+)/) || [])[1];
if (!logNo) { console.log('⛔ 발행 후 주소에 logNo 가 없다:', href.slice(0, 90)); process.exit(1); }
const pubUrl = `https://blog.naver.com/donneum/${logNo}`;
const html = await (await fetch(`https://blog.naver.com/PostView.naver?blogId=donneum&logNo=${logNo}`, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
// 글이 든 카테고리 = 본문 위 «blog2_series» 링크(PostList…&categoryNo=N&from=post) — 메뉴의 다른 칸 링크와 섞이지 않게 그 자리에서 읽는다
const pubCat = (html.match(/blog2_series[\s\S]{0,300}?categoryNo=(\d+)/) || html.match(/categoryNo=(\d+)/) || [])[1] || '';
const pubTopic = (() => { try { return JSON.parse((html.match(/var postTopics = (\{.*?\});/) || [])[1] || '{}').directory_name || ''; } catch { return ''; } })();
const ok = { title: html.includes(T.title.slice(0, 12)), image: /se-image-resource/.test(html), link: /signumhq\.com\/app(-uc|-wim)?\?from(=|&#x3D;)naver_blog/.test(html), // ★2026-09-26 app-uc·app-wim 링크도 인정(전엔 /app 만 봐서 멀쩡한 글을 «실패»로 판정)
  category: catNo ? pubCat === String(catNo) : true, topic: pubTopic === TOPIC }; // ★2026-09-30 공개 페이지의 카테고리 번호(글 위 «blog2_series» 링크)·주제(postTopics.directory_name)까지 확인(0-za)
console.log('공개 검증:', JSON.stringify(ok));
if (!Object.values(ok).every(Boolean)) { console.log('⛔ 공개 페이지 확인 실패 — «발행했다»고 적지 않는다:', pubUrl); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', pubUrl);
console.log('다음: node scripts/mkt-plan.js pub naver_blog "' + pubUrl + '"');
