/* ============================================================================
 * x-switch — X 계정만 전환한다(글은 쓰지 않는다). x-reply.mjs 는 @signumhq 에서만 돌기 때문에
 * 세션이 @signumhq_jp 에 있으면 먼저 이걸로 돌린다. 전환 로직은 x-post.mjs 와 같다.
 * ★2026-09-24 만든 이유: 답글 차례에 세션이 JP 계정이라 x-reply 가 멈췄다 — 전환만 하는 도구가 없었다.
 * 사용: echo '{"handle":"/signumhq"}' > /tmp/ego/x-switch.json ; ego-browser nodejs < scripts/x-switch.mjs
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const { readFileSync } = await import('node:fs');
const task = JSON.parse(readFileSync('/tmp/ego/x-switch.json', 'utf8'));
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
const page = await L.findPage(ts, /x\.com/, null);
try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(8000);
const cur = () => page.evaluate(() => ([...document.querySelectorAll('nav a[href]')].map((a) => a.getAttribute('href'))
  .filter((h) => h && /^\/[A-Za-z0-9_]+$/.test(h) && !/^\/(home|explore|notifications|messages|i|settings|compose|search|jobs)$/.test(h))[0] || null));
let who = await cur();
if (who !== task.handle) {
  const b = await page.evaluate(() => { const e = document.querySelector('[aria-label="Account menu"], [data-testid="SideNav_AccountSwitcher_Button"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
  if (!b) { console.log('NO_ACCT'); process.exit(1); }
  await page.mouse.click(b.x, b.y, { label: '계정 메뉴' }); await L.wait(2200);
  const it = await page.evaluate((h) => {
    const layer = document.querySelector('#layers') || document.body; const want = '@' + h.replace('/', '');
    // 부분 문자열 금지: '@signumhq' 는 '@signumhq_jp' 에도 들어 있다 — 뒤에 영문·숫자·밑줄이 없을 때만 그 계정
    const c = [...layer.querySelectorAll('[data-testid="UserCell"],[role=menuitem]')].map((e) => ({ t: (e.innerText || '').replace(/\s+/g, ' ').trim(), r: e.getBoundingClientRect() }))
      .filter((o) => o.r.width > 0 && new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_])').test(o.t));
    if (!c.length) return null; const r = c[0].r; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }, task.handle);
  if (!it) { console.log('NO_ITEM'); process.exit(1); }
  await page.mouse.click(it.x, it.y, { label: '계정 전환' }); await L.wait(5500);
  who = await cur();
}
console.log('계정:', who);
if (who !== task.handle) { console.log('WRONG'); process.exit(1); }
