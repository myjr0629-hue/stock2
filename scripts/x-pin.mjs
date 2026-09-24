/* ============================================================================
 * x-pin — X 게시물 하나를 프로필 «고정»으로 바꾼다(글 메뉴 … → Pin to your profile → Pin).
 * ★2026-09-25 신설: 블루스키 고정 소개 글(from=bluesky_pin)이 2시간에 12클릭 → 같은 형식을 X 에 복제.
 *   X 미국 프로필은 8/31 글이 고정돼 있었다(x_reply 로 온 방문자가 보는 첫 글).
 * 사용: echo '{"handle":"/signumhq","status":"https://x.com/signumhq/status/<id>"}' > /tmp/ego/x-pin.json
 *       ego-browser nodejs < scripts/x-pin.mjs
 * 검증: 프로필 첫 글에 «Pinned» 표시 + 그 글의 status 주소가 방금 것인지.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const { readFileSync } = await import('node:fs');
const task = JSON.parse(readFileSync('/tmp/ego/x-pin.json', 'utf8'));
const id = (task.status.match(/status\/(\d+)/) || [])[1];
if (!id) { console.log('⛔ status 주소가 아니다'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
const page = await L.findPage(ts, /x\.com/, null);
try { await page.goto(task.status, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);
// 본 글(주소의 id 와 같은 article)의 «More»(caret) 버튼
const caret = await page.evaluate((id) => { const arts = [...document.querySelectorAll('article')]; const a = arts.find((x) => [...x.querySelectorAll('a[href*="/status/"]')].some((l) => l.getAttribute('href').includes(id))) || arts[0];
  const b = a && a.querySelector('[data-testid="caret"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }, id);
if (!caret) { console.log('⛔ 글 메뉴(caret) 없음'); process.exit(1); }
await page.mouse.click(caret.x, caret.y, { label: '글 메뉴' }); await L.wait(1800);
const item = await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim(); const m = [...document.querySelectorAll('[role=menuitem]')].find((x) => /Pin to your profile|Unpin from profile|프로필에 고정|고정 해제/.test(n(x.innerText)));
  if (!m) return null; const r = m.getBoundingClientRect(); return { t: n(m.innerText), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
if (!item) { console.log('⛔ 고정 메뉴 없음'); process.exit(1); }
if (/Unpin|해제/.test(item.t)) { console.log('이미 고정돼 있다:', item.t); try { await page.keyboard.press('Escape'); } catch {} process.exit(0); }
await page.mouse.click(item.x, item.y, { label: '프로필에 고정' }); await L.wait(1800);
const ok = await page.evaluate(() => { const b = document.querySelector('[data-testid="confirmationSheetConfirm"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: (b.innerText || '').trim() }; });
if (!ok) { console.log('⛔ 확인 버튼 없음'); process.exit(1); }
await page.mouse.click(ok.x, ok.y, { label: ok.t || 'Pin' }); await L.wait(3000);
// 검증 — 프로필 첫 글
try { await page.goto('https://x.com' + task.handle, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);
const v = await page.evaluate((id) => { const a = document.querySelector('article'); if (!a) return null; return { pinned: /Pinned|고정됨/.test(a.innerText || ''), same: [...a.querySelectorAll('a[href*="/status/"]')].some((l) => l.getAttribute('href').includes(id)) }; }, id);
console.log('검증:', JSON.stringify(v));
if (v && v.pinned && v.same) console.log('✅ 고정 완료:', task.status); else { console.log('⛔ 프로필 첫 글이 방금 고정한 글이 아니다'); process.exit(1); }
