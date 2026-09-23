#!/usr/bin/env node
/* ============================================================================
 * instagram-post — 인스타그램(@signumhq_official) 게시물 1개: 앱 화면 + 캡션 → 공유 → 프로필 최신 글로 확인.
 * (2026-09-23 정본화. 조작 근거는 channels.json instagram 노트의 좌표 정본)
 * 사용: /tmp/ego/ig-task.json = {"image":"/abs.png","caption_file":"/tmp/ego/cap.txt","mark":"캡션 첫 줄 일부"}
 *       ego-browser nodejs < scripts/instagram-post.mjs
 * 캡션의 링크는 눌리지 않는다 → «Link in bio: signumhq.com/app» 로 쓰고, bio 에는 스마트링크가 있다.
 * 버튼은 «글자로 찾고», 못 찾으면 정본 좌표로 간다(메뉴 텍스트 스캔을 slice 로 자르지 말 것 — 릴스만 잡힌다).
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/ig-task.json', 'utf8'));
const cap = fs.readFileSync(T.caption_file, 'utf8').trim().split('\n');
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /instagram/, null);
try { await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(10000);
const byText = async (re, fb) => { const b = await page.evaluate((src) => { const rx = new RegExp(src); const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const c = [...document.querySelectorAll('a,button,div[role=button],span,svg')].filter((e) => { const t = n(e.innerText || e.getAttribute('aria-label') || ''); const r = e.getBoundingClientRect(); return rx.test(t) && r.width > 0 && r.height > 0; })
    .map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), a: r.width * r.height }; }).sort((a, b) => a.a - b.a);
  return c[0] || null; }, re.source); const pt = b || fb; if (!pt) return false; await page.mouse.click(pt.x, pt.y); await L.wait(3500); return true; };
// 첫 화면을 가리는 팝업(알림 설정 등)은 «나중에 하기»로 닫는다 — 알림을 켜지 않는다(2026-09-23 이것 때문에 클릭이 전부 허공에 떨어졌다)
await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim(); const b = [...document.querySelectorAll('button')].find((x) => /^(나중에 하기|Not Now|나중에)$/.test(n(x.innerText))); if (b) b.click(); });
await L.wait(2000);
// «만들기»·«게시물»은 글자로 못 찾는다(채널 노트) → 정본 좌표로 먼저 누르고, 파일 입력이 생겼는지 본다
await page.mouse.click(36, 504); await L.wait(3000);
await page.mouse.click(112, 554); await L.wait(3500);
let fin = await page.evaluate(() => document.querySelectorAll('input[type=file]').length);
if (!fin) { await byText(/^(만들기|Create)$/, null); await byText(/^(게시물|Post)$/, null); fin = await page.evaluate(() => document.querySelectorAll('input[type=file]').length); }
console.log('파일 입력:', fin);
await L.wait(2500);
try { await page.setInputFiles('input[type=file] >> nth=0', T.image); } catch (e) { console.log('⛔ 파일 입력 실패:', String(e.message).slice(0, 70)); process.exit(1); }
await L.wait(8000);
await byText(/^(자르기 선택|Select crop)$/, { x: 285, y: 783 });
await byText(/^(원본|Original)$/, { x: 315, y: 580 });
await byText(/^(다음|Next)$/, { x: 908, y: 109 }); await L.wait(3000);
await byText(/^(다음|Next)$/, { x: 1078, y: 109 }); await L.wait(3000);
const ce = await page.evaluate(() => { const e = [...document.querySelectorAll('[contenteditable="true"]')].find((x) => x.getBoundingClientRect().width > 200); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + 40), y: Math.round(r.y + 20) }; }) || { x: 937, y: 275 };
await page.mouse.click(ce.x, ce.y); await L.wait(600);
// ★2026-09-23: execCommand('insertText') 는 «화면엔 보이는데 저장되지 않았다»(캡션 없는 글이 올라감 → 수정으로 복구).
//   실제 키보드 입력만 편집기 상태(Lexical)에 들어간다.
for (let i = 0; i < cap.length; i++) { await page.keyboard.type(cap[i], { delay: 4 }); if (i < cap.length - 1) { await page.keyboard.press('Enter'); await L.wait(120); } }
await L.wait(1200);
const len = await page.evaluate(() => { const e = [...document.querySelectorAll('[contenteditable="true"]')].find((x) => x.getBoundingClientRect().width > 200); return e ? (e.innerText || '').length : 0; });
console.log('캡션 길이:', len);
if (len < 100) { console.log('⛔ 캡션이 안 들어갔다 — 공유하지 않는다'); process.exit(1); }
// «공유하기» — 모달 머리(y<200)의 role=button 을 element.click() 으로(좌표 클릭은 9/23 에 허공에 떨어졌다)
const shared = await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const c = [...document.querySelectorAll('div[role=button],button,[role=button]')].filter((e) => /^(공유하기|Share)$/.test(n(e.innerText)) && e.getBoundingClientRect().y < 200 && e.getBoundingClientRect().width > 0);
  if (!c.length) return false; c[0].click(); return true; });
console.log('공유하기 클릭:', shared);
if (!shared) await byText(/^(공유하기|Share)$/, { x: 1066, y: 109 });
// 업로드가 끝나면 «게시물이 공유되었습니다» 류 문구가 뜬다 — 최대 40초 기다린다
for (let i = 0; i < 8; i++) { await L.wait(5000); const done = await page.evaluate(() => /공유되었습니다|게시물이 공유|Your post has been shared|Post shared/.test(document.body.innerText || '')); if (done) { console.log('공유 완료 문구 확인'); break; } }
try { await page.goto('https://www.instagram.com/signumhq_official/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
const first = await page.evaluate(() => [...document.querySelectorAll('a[href*="/p/"]')].map((a) => a.href)[0] || null);
if (!first) { console.log('⛔ 프로필에서 글을 못 찾았다'); process.exit(1); }
try { await page.goto(first, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(8000);
const ok = await page.evaluate((mark) => (document.body.innerText || '').replace(/\s+/g, ' ').includes(mark), T.mark);
console.log('검증:', first, ok);
if (!ok) { console.log('⛔ 최신 글에 캡션 표식이 없다 — «발행했다»고 적지 않는다'); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', first);
