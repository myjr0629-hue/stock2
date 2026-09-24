/* ============================================================================
 * linkedin-article — LinkedIn 아티클(장문, /pulse/) 1편: 커버 → 제목 → 본문 → 소개 글 → 발행 → 비로그인 검증.
 *
 * ★2026-09-24 첫 아티클을 손으로 단계별 실행해 성공한 흐름을 정본화했다. ★2026-09-25 첫 «통째» 실행 성공 — 10문단 전부 비로그인 페이지에서 확인(«의회 거래 192건» 아티클).
 *   https://www.linkedin.com/pulse/gamma-flip-fixed-line-spys-moved-6-one-afternoon-signum-hq-ar1fc/
 * 함정(전부 실측):
 *   · 편집기는 iframe(/preload/?_bprMode=vanilla) 안 — page.evaluate 로 칸을 못 찾는다. text= 선택자·키보드는 프레임까지 닿는다.
 *   · 커버: «컴퓨터에서 업로드»를 text 선택자로 누르면 파일 선택기가 잡힌다 → 대화상자 «다음»
 *   · 제목: text=제목 클릭은 «입력 불가»(textarea 위 겹침) → textarea 에 focus 로 들어간다. 실패하면 제목이 본문 첫 줄로 들어간다.
 *   · ⚠ 본문에서 Shift+End 는 «문서 끝까지» 선택된다 — 한 줄 지우려다 본문 전체가 지워졌다(초안이라 재입력으로 복구). 줄 편집은 하지 않는다.
 *   · 발행: 상단 «다음 →» → 패널(전체공개·소개 글·예약 시계·«발행») → 주소가 /pulse/…?published=t 로 바뀌면 성공
 * 사용: /tmp/ego/li-art-task.json = {"cover":"/abs/1200x675.png","title":"…","paras":["문단",…,"https://signumhq.com/app?from=linkedin",…],"intro":"피드 소개 한 줄"}
 *       ego-browser nodejs < scripts/linkedin-article.mjs
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/li-art-task.json', 'utf8'));
if (!(T.paras || []).some((p) => /^https:\/\/signumhq\.com\/app\?from=linkedin/.test(p))) { console.log('⛔ 본문에 스마트링크(?from=linkedin) 줄이 없다'); process.exit(1); }
if (!fs.existsSync(T.cover)) { console.log('⛔ 커버 파일 없음'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /linkedin\.com/, null);
const shot = (n) => page.screenshot({ path: `/tmp/ego/li-art-${n}.png` }).catch(() => {});

// 1) 피드의 «글쓰기»(/article/new/) 링크를 눌러 들어간다(주소를 치지 않는다)
try { await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(8000);
const w = await page.evaluate(() => { const a = [...document.querySelectorAll('a[href]')].find((x) => /\/article\/new\//.test(x.getAttribute('href') || '')); if (!a) return null; a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
if (!w) { console.log('⛔ 피드에 «글쓰기» 링크가 없다'); process.exit(1); }
await L.wait(500);
const w2 = await page.evaluate(() => { const a = [...document.querySelectorAll('a[href]')].find((x) => /\/article\/new\//.test(x.getAttribute('href') || '')); const r = a.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
await page.mouse.click(w2.x, w2.y, { label: '글쓰기(아티클)' });
await L.wait(11000);
if (!/\/article\/new\//.test(await page.url())) { console.log('⛔ 편집기로 못 들어갔다:', await page.url()); process.exit(1); }

// 2) 커버
let fc = null;
try { const ch = page.waitForFileChooser({ timeout: 8000 }); await page.click('text=컴퓨터에서 업로드', { label: '커버 업로드' }); fc = await ch; } catch (e) { console.log('커버 선택기 오류:', String(e.message).slice(0, 120)); }
if (!fc) { console.log('⛔ 커버 파일 선택기가 안 열렸다'); process.exit(1); }
await fc.setFiles(T.cover); await L.wait(8000); await shot('1-cover');
await page.mouse.click(1104, 745, { label: '커버 대화상자 다음(뷰포트 1189×903 기준 좌표)' }); await L.wait(6000);

// 3) 제목 — textarea 에 focus(클릭은 겹침 때문에 입력 불가로 거절됐다)
try { await page.focus('textarea[id^="article"]'); } catch (e) { console.log('⛔ 제목 textarea focus 실패 — 본문으로 샐 수 있어 멈춘다:', String(e.message).slice(0, 120)); process.exit(1); }
await L.wait(400);
await page.keyboard.type(T.title, { delay: 6 }); await L.wait(800); await shot('2-title');

// 4) 본문 — contenteditable 에 focus 후 문단별 키 입력(URL 은 붙여넣기)
try { await page.focus('[contenteditable="true"]'); } catch (e) { console.log('⛔ 본문 focus 실패:', String(e.message).slice(0, 120)); process.exit(1); }
await L.wait(400);
for (let i = 0; i < T.paras.length; i++) {
  const p = T.paras[i];
  if (/^https?:\/\//.test(p)) { await page.keyboard.paste({ text: p }); await L.wait(500); } else await page.keyboard.type(p, { delay: 3 });
  if (i < T.paras.length - 1) { await page.keyboard.press('Enter'); await L.wait(250); }
}
await L.wait(2500); await shot('3-body');

// 5) 발행 — «다음 →»(상단) → 소개 글 → «발행»
await page.mouse.click(1035, 87, { label: '다음' }); await L.wait(5000); await shot('4-panel');
if (T.intro) { await page.mouse.click(330, 168, { label: '소개 글 칸' }); await L.wait(400); await page.keyboard.type(T.intro, { delay: 6 }); await L.wait(800); }
await page.mouse.click(913, 727, { label: '발행' }); await L.wait(12000);
const url = (await page.url()).split('?')[0];
if (!/linkedin\.com\/pulse\//.test(url)) { console.log('⛔ 발행 주소가 아니다(초안으로 남았을 수 있다):', url); await shot('5-after'); process.exit(1); }

// 6) 비로그인 검증
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const html = await (await fetch(url, { headers: { 'user-agent': UA } })).text();
const ok = { title: html.includes(T.title.slice(0, 24)), first: html.includes(T.paras[0].slice(0, 30)), link: /signumhq\.com\/app\?from=linkedin/.test(html), ogimg: /og:image/.test(html) };
console.log('공개 검증(비로그인):', JSON.stringify(ok));
if (!Object.values(ok).every(Boolean)) { console.log('⛔ 공개 페이지 확인 실패 —', url); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', url);
console.log('다음: node scripts/mkt-plan.js pub linkedin_articles "' + url + '"');
