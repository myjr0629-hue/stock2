/* ============================================================================
 * x-reply — 큰 계정 글에 «데이터 한 줄» 답글. 조건 확인 → 실제 키 입력 → 내 답글 탭에서 공개 확인.
 *
 * ★2026-09-23 정본화: 답글 흐름이 /tmp/ego/xr3~xr7 조각으로만 있었다(세션이 바뀌면 사라지는 도구).
 * 규칙(memory/x-reply-ranking-needs-180k-follower-root.md):
 *   · 루트 작성자 팔로워 18만 미만이면 답글 랭킹이 아예 돌지 않는다 → 스크립트가 거부한다
 *   · X 는 채점에 «Reply Was Pasted»를 넣는다 → 붙여넣기 금지, keyboard.type(키 입력)만
 *   · 링크+이미지 답글은 9/18 스팸 분류기에 통째로 숨겨졌다 → 링크를 거부한다(무링크 데이터 답글)
 * 사용: /tmp/ego/xr-task.json = {"status":"/Barchart/status/…","file":"/tmp/ego/xr.txt","mark":"본문 고유 문구"}
 *       정정(자기 글): {"status":"/signumhq_jp/status/…","handle":"/signumhq_jp","correction":true,…} — 계정 전환·팔로워 조건 면제
 *       ego-browser nodejs < scripts/x-reply.mjs
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
L.assertFreshTask('/tmp/ego/xr-task.json'); // ★2026-10-04 낡은 작업 파일 거부(MISTAKES #52)
const T = JSON.parse(fs.readFileSync('/tmp/ego/xr-task.json', 'utf8'));
const text = fs.readFileSync(T.file, 'utf8').trim();
if (/https?:\/\/|www\.|\.com\//i.test(text)) { console.log('⛔ 링크 금지(9/18 링크 답글은 스팸 분류기에 숨겨졌다)'); process.exit(1); }
if (text.length > 280) { console.log(`⛔ ${text.length}/280`); process.exit(1); }
// ★2026-10-04 21시: X 한도는 «가중 글자 수»다(twitter-text v3: 0~4351·8192~8205·8208~8223·8242~8247 = 1, 그 밖(한글·일본어·화살표 →·유니코드 − ·이모지) = 2). 단순 길이만 보면 한 줄 «→»·«−» 로 280 을 넘고도 통과해
//   «버튼 비활성»으로 브라우저를 연 뒤에야 실패한다(9/29 x_us 가 «−» 한 글자 때문에 첫 시도가 게시 안 됨). 브라우저 전에 막는다.
const wlen = [...text].reduce((n, ch) => { const c = ch.codePointAt(0); return n + ((c <= 4351) || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247) ? 1 : 2); }, 0);
if (wlen > 280) { console.log(`⛔ 가중 ${wlen}/280 (한글·일본어·→·−·이모지는 글자당 2)`); process.exit(1); }
console.log(`길이 ${text.length} · 가중 ${wlen}/280`);
if (!T.mark || !text.includes(T.mark)) { console.log('⛔ mark 가 본문에 없다'); process.exit(1); }
const author = (T.status.match(/^\/([A-Za-z0-9_]+)\/status\/\d+$/) || [])[1];
if (!author) { console.log('⛔ status 는 /<계정>/status/<id> 형식(받은 값 그대로)'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /x\.com/, null);

// ① 현재 계정이 @signumhq 인지 — 아니면 멈춘다(계정 전환은 x-post.mjs 가 담당)
try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);
const who = await page.evaluate(() => ([...document.querySelectorAll('nav a[href]')].map((a) => a.getAttribute('href'))
  .filter((h) => h && /^\/[A-Za-z0-9_]+$/.test(h) && !/^\/(home|explore|notifications|messages|i|settings|compose|search|jobs)$/.test(h))[0] || null));
console.log('계정:', who);
// ★2026-09-27 정정 모드: 우리 글(미국·일본 계정)에 다는 «정정 답글»을 같은 도구로 — handle 지정·계정 전환·팔로워 조건 면제
const HANDLE = T.handle || '/signumhq';
let who2 = who;
if (who2 !== HANDLE) {
  const bb = await page.evaluate(() => { const e = document.querySelector('[aria-label="Account menu"], [data-testid="SideNav_AccountSwitcher_Button"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
  if (!bb) { console.log('⛔ 계정 메뉴 없음'); process.exit(1); }
  await page.mouse.click(bb.x, bb.y, { label: '계정 메뉴' }); await L.wait(2200);
  const it = await page.evaluate((h) => { const layer = document.querySelector('#layers') || document.body; const want = '@' + h.replace('/', '');
    const c = [...layer.querySelectorAll('[data-testid="UserCell"],[role=menuitem]')].map((e) => ({ e, t: (e.innerText || '').replace(/\s+/g, ' ').trim(), r: e.getBoundingClientRect() }))
      .filter((o) => o.r.width > 0 && new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_])').test(o.t)); // 부분 문자열 금지(@signumhq ⊂ @signumhq_jp)
    if (!c.length) return null; const r = c[0].r; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, HANDLE);
  if (!it) { console.log('⛔ 전환할 계정 항목 없음'); process.exit(1); }
  await page.mouse.click(it.x, it.y, { label: '계정 전환' }); await L.wait(5500);
  who2 = await page.evaluate(() => ([...document.querySelectorAll('nav a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && /^\/[A-Za-z0-9_]+$/.test(h) && !/^\/(home|explore|notifications|messages|i|settings|compose|search|jobs)$/.test(h))[0] || null));
  console.log('전환 후 계정:', who2);
}
if (who2 !== HANDLE) { console.log('⛔ 현재 계정이 ' + HANDLE + ' 가 아니다'); process.exit(1); }

// ② 루트 작성자 팔로워 ≥ 18만
try { await page.goto('https://x.com/' + author, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(6000);
const fl = await page.evaluate(() => { const t = (document.body.innerText || '').replace(/\s+/g, ' '); const m = t.match(/([\d.,]+)\s*([KM]?)\s*Followers/i); if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, '')); return Math.round(v * (m[2].toUpperCase() === 'M' ? 1e6 : m[2].toUpperCase() === 'K' ? 1e3 : 1)); });
console.log(`@${author} 팔로워:`, fl);
const selfCorrection = T.correction === true && author === HANDLE.slice(1);
if (selfCorrection) console.log('정정 답글(자기 글) — 팔로워 조건 면제: 도달이 아니라 «바로잡기»가 목적');
else if (!fl || fl < 180000) { console.log('⛔ 루트 팔로워 18만 미만 — 답글 랭킹이 돌지 않는다'); process.exit(1); }

// ③ 글 열고 인라인 답글 칸에 «키 입력»
try { await page.goto('https://x.com' + T.status, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);
const box = await page.evaluate(() => { const e = document.querySelector('[data-testid="tweetTextarea_0"]'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }; });
if (!box) { console.log('⛔ 답글 칸이 없다(답글 제한 글일 수 있다)'); process.exit(1); }
await L.wait(600);
const box2 = await page.evaluate(() => { const r = document.querySelector('[data-testid="tweetTextarea_0"]').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }; });
await page.mouse.click(box2.x, box2.y, { label: '답글 칸' }); await L.wait(900);
await page.keyboard.type(text, { delay: 18 }); await L.wait(1500);
const st = await page.evaluate(() => { const e = document.querySelector('[data-testid="tweetTextarea_0"]'); const b = document.querySelector('[data-testid="tweetButtonInline"]');
  if (!b) return null; const r = b.getBoundingClientRect(); return { len: (e?.innerText || '').trim().length, dis: b.getAttribute('aria-disabled'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
console.log('입력:', JSON.stringify(st));
if (!st || st.dis === 'true' || st.len < text.length * 0.9) { console.log('⛔ 입력이 덜 됐거나 버튼 비활성'); process.exit(1); }
await page.mouse.click(st.x, st.y, { label: 'Reply' });
await L.wait(9000);

// ④ 공개 확인 — 내 «답글» 탭에서 mark 가 보이는가(스레드 안은 «스팸 가능성» 접힘에 숨을 수 있다)
// ★2026-09-23: 답글 탭 갱신이 늦어 8초 한 번 확인은 «안 보인다»로 빗나갔다(재확인하니 스레드·탭 모두 노출) → 최대 3번 다시 본다
let v = { seen: false, link: null };
for (let i = 0; i < 3 && !v.seen; i++) {
try { await page.goto('https://x.com' + HANDLE + '/with_replies', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(8000 + i * 4000);
v = await page.evaluate((a2) => {
  const a = [...document.querySelectorAll('article')].find((x) => (x.innerText || '').includes(a2.mark));
  const re = new RegExp('^' + a2.h + '/status/\\d+$');
  const link = a ? [...a.querySelectorAll('a[href*="/status/"]')].map((y) => y.getAttribute('href')).find((h) => re.test(h)) : null;
  return { seen: !!a, link };
}, { mark: T.mark, h: HANDLE });
}
console.log('내 답글 탭:', JSON.stringify(v));
// ★2026-10-04 21시: 답글을 «시도한» 루트 글을 기록한다(보였든 안 보였든 — 안 보여도 제출은 됐다). x-find-reply.mjs 가 같은 글을 다시 후보로 내지 않는다(같은 글 중복 = 반복 게시).
try { fs.appendFileSync(L.ioDir().replace(/\/[^/]+$/, '') + '/x-reply-roots.jsonl', JSON.stringify({ root: T.status, reply: v.link || null, seen: !!v.seen, at: new Date().toISOString() }) + '\n'); } catch {}
if (!v.seen) { console.log('⛔ 답글 탭에서 안 보인다 — «발행했다»고 적지 않는다(스팸 분류 가능성, 스레드에서 따로 확인)'); process.exit(1); }
console.log('\n✅ 답글 게시·확인:', 'https://x.com' + v.link);
console.log('다음: node scripts/mkt-plan.js pub ' + (selfCorrection ? 'correction' : 'x_reply') + ' "https://x.com' + v.link + '"');
