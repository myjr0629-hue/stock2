#!/usr/bin/env node
/* ============================================================================
 * pinterest-post — 핀 1개(앱 화면 + 제목·설명 + 랜딩 ?from=pinterest)를 만들고 공개 핀에서 링크를 확인한다.
 * (2026-09-23 /tmp/ego/pinA·B·C 를 저장소로 — 세션이 바뀌어도 이어서 쓰게)
 *
 * 왜 핀터레스트: 팔로워 3명인데 «월 조회 9,907»(9/19 실측). 검색·추천으로 도는 시각 표면이라 앱 화면이 곧 광고다.
 *   단 클릭은 4편 0 이었다 → 이번부터 «지표의 뜻을 설명하는 에버그린 제목» + 앱 화면 + 랜딩 링크를 반드시 확인한다.
 * 사용: /tmp/ego/pin-task.json = {"image":"/abs.png","title":"…(100자)","desc":"…(500자)","link":"https://www.signumhq.com/app?from=pinterest"}
 *       ego-browser nodejs < scripts/pinterest-post.mjs
 * 조작 정본(채널 메모): /pin-builder/ → input[type=file] → 이미지가 들어가면 폼이 아래로 밀리니 칸 좌표를 «다시» 잰다 →
 *   칸은 placeholder(제목 추가 / 핀에 대해 / 랜딩 페이지 링크)로 찾는다 → 「게시」는 상단(y 120~260)의 DIV.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/pin-task.json', 'utf8'));
if (!/signumhq\.com\/app(-uc|-wim)?\?from=pinterest/.test(T.link || '')) { console.log('⛔ 랜딩 링크는 ?from=pinterest 스마트링크여야 한다'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /pinterest\./, null);
try { await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(11000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button,div')].find((x) => (x.innerText || '').trim() === '알겠어요'); if (b) b.click(); });
await L.wait(1200);
await page.setInputFiles('input[type=file]', T.image);
await L.wait(12000);
const at = (ph) => page.evaluate((p) => {
  const e = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')].find((x) => ((x.placeholder || x.getAttribute('aria-label') || '')).includes(p));
  if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }, ph);
for (const [ph, txt] of [['제목 추가', T.title], ['핀에 대해', T.desc], ['랜딩 페이지 링크', T.link]]) {
  await L.wait(700);
  const p = await at(ph); if (!p) { console.log('⛔ 칸 없음:', ph); process.exit(1); }
  await page.mouse.click(p.x, p.y); await L.wait(600);
  await page.keyboard.type(txt, { delay: 6 }); await L.wait(500);
}
const chk = await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const g = (p) => { const e = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')].find((x) => ((x.placeholder || x.getAttribute('aria-label') || '')).includes(p)); return e ? (e.value || n(e.innerText) || '') : ''; };
  return { t: g('제목 추가').length, d: g('핀에 대해').length, l: g('랜딩 페이지 링크'), img: document.querySelectorAll('img[src^="blob:"]').length }; });
console.log('채움:', JSON.stringify(chk));
if (!chk.img || !chk.t || !/from=pinterest/.test(chk.l)) { console.log('⛔ 이미지·제목·링크 중 빠진 게 있다 — 게시하지 않는다'); process.exit(1); }
await page.evaluate(() => window.scrollTo(0, 0)); await L.wait(900);
const pub = await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const c = [...document.querySelectorAll('div,button')].filter((e) => /^게시$/.test(n(e.innerText)))
    .map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })
    .filter((x) => x.y > 0 && x.y < 260);   // 2026-09-23: 레이아웃이 바뀌어 y=26 에 있었다(예전 184). 상단 260 안이면 받는다
  return c[0] || null; });
if (!pub) { console.log('⛔ 게시 버튼 없음'); process.exit(1); }
// 보드 선택기가 비어 있으면 게시가 조용히 무시된다 — 게시 버튼 왼쪽의 보드 이름을 먼저 읽는다
const board = await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('[data-test-id*="board"], button, div[role=button]')].map((e) => { const r = e.getBoundingClientRect(); return { t: n(e.innerText).slice(0, 30), y: Math.round(r.y), w: Math.round(r.width) }; })
    .filter((c) => c.y < 120 && c.w > 60 && c.t && !/게시|프로필|홈|탐색|만들기/.test(c.t)).slice(0, 4); });
console.log('상단 보드/버튼:', JSON.stringify(board));
const published = async () => page.evaluate(() => /게시되었습니다|핀을 게시했|저장되었습니다|Your Pin|핀 보기|See it now|보기$/.test((document.body.innerText || '')) || document.querySelectorAll('img[src^="blob:"]').length === 0);
await page.mouse.move(pub.x, pub.y); await L.wait(400); await page.mouse.down(); await L.wait(130); await page.mouse.up();
await L.wait(9000);
if (!(await published())) {
  console.log('마우스 클릭이 안 먹었다 → element.click() 로 재시도(role=button 우선)');
  await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('div[role=button],button')].find((e) => /^게시$/.test(n(e.innerText)) && e.getBoundingClientRect().y < 260);
    if (b) b.click(); });
  await L.wait(9000);
}
console.log('게시 판정:', await published());
await L.wait(6000);
try { await page.goto('https://www.pinterest.com/SIGNUMHQ/_created/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(12000);
const first = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="/pin/"]')].map((a) => a.getAttribute('href')).filter((h) => /^\/pin\/\d+\/$/.test(h)))][0] || null);
if (!first) { console.log('⛔ 새 핀 주소를 못 찾았다'); process.exit(1); }
const pinUrl = 'https://www.pinterest.com' + first;
try { await page.goto(pinUrl, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(10000);
const v = await page.evaluate((title) => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const a = [...new Set([...document.querySelectorAll('a[href*="signumhq"]')].map((x) => x.getAttribute('href')))];
  return { link: a[0] || null, title: n(document.body.innerText).includes(title.slice(0, 20)) }; }, T.title);
console.log('검증:', JSON.stringify(v));
if (!v.title || !v.link) { console.log('⛔ 새 핀에서 제목·링크 확인 실패 — «발행했다»고 적지 않는다:', pinUrl); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', pinUrl);
