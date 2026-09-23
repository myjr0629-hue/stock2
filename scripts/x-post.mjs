/* ============================================================================
 * x-post — X 계정 전환 + 원글 발행 + 프로필에서 공개 검증. (2026-09-23 /tmp 에서 저장소로 옮김)
 *
 * 왜 저장소로: 이 스크립트가 /tmp/ego 에만 있었다. 세션·모델이 바뀌면(9/23 Opus 5.5 전환) /tmp 는
 *   «기억에만 있는 도구»가 된다. 인수인계가 되려면 도구도 저장소에 있어야 한다.
 *
 * 사용(ego 런타임은 env·argv 를 못 받는다 → 작업 파일):
 *   echo '{"handle":"/signumhq_jp","file":"/tmp/ego/x.txt","image":"/abs/app-screen.png"}' > /tmp/ego/x-task.json
 *   ego-browser nodejs < scripts/x-post.mjs
 *   handle: "/signumhq"(미국) 또는 "/signumhq_jp"(일본). image 는 선택(앱 화면을 붙이면 카드 대신 사진이 뜬다).
 * 주의: 계정 이름은 «부분 문자열»로 맞추지 않는다('@signumhq' 는 '@signumhq_jp' 에도 들어 있다).
 *       X 는 CJK 를 2자로 센다 — 일본어는 가중 280 을 먼저 계산한다.
 * ========================================================================== */
import { readFileSync } from 'node:fs';
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const task = JSON.parse(readFileSync('/tmp/ego/x-task.json','utf8'));
const page = await L.findPage(ts, /x\.com/, null);
try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(8000);
const cur = () => page.evaluate(() => ([...document.querySelectorAll('nav a[href]')].map(a=>a.getAttribute('href'))
  .filter(h=>h&&/^\/[A-Za-z0-9_]+$/.test(h)&&!/^\/(home|explore|notifications|messages|i|settings|compose|search|jobs)$/.test(h))[0]||null));
let who = await cur();
if (who !== task.handle) {
  const b = await page.evaluate(()=>{const e=document.querySelector('[aria-label="Account menu"], [data-testid="SideNav_AccountSwitcher_Button"]');
    if(!e)return null;const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
  if(!b){console.log('NO_ACCT');process.exit(1);} await page.mouse.click(b.x,b.y); await L.wait(2200);
  const it = await page.evaluate((h)=>{const layer=document.querySelector('#layers')||document.body;
    const want='@'+h.replace('/','');
    const c=[...layer.querySelectorAll('[data-testid="UserCell"],[role=menuitem]')]
      .map(e=>({e,t:(e.innerText||'').replace(/\s+/g,' ').trim(),r:e.getBoundingClientRect()}))
      // ⚠ 부분 문자열 금지: '@signumhq' 는 '@signumhq_jp' 에도 들어 있다(2026-09-23 실측, 전환 실패).
      //    뒤에 영문·숫자·밑줄이 오지 않는 경우만 «그 계정»이다.
      .filter(o=>o.r.width>0 && new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![A-Za-z0-9_])').test(o.t));
    if(!c.length)return null;const r=c[0].r;return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};}, task.handle);
  if(!it){console.log('NO_ITEM');process.exit(1);} await page.mouse.click(it.x,it.y); await L.wait(5500);
  who = await cur();
}
console.log('계정:', who);
if (who !== task.handle) { console.log('WRONG'); process.exit(1); }
const cb = await page.evaluate(()=>{const e=document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
  if(!e)return null;const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
await page.mouse.click(cb.x, cb.y); await L.wait(3000);
const ed = await page.evaluate(()=>{const e=document.querySelector('[data-testid="tweetTextarea_0"]');
  if(!e)return null;const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
if(!ed){console.log('NO_EDITOR');process.exit(1);}
await page.mouse.click(ed.x, ed.y); await L.wait(600);
const lines = readFileSync(task.file,'utf8').trim().split('\n');
for(let i=0;i<lines.length;i++){ if(lines[i]) await page.keyboard.type(lines[i],{delay:5});
  if(i<lines.length-1){await page.keyboard.press('Enter');await L.wait(110);} }
await L.wait(2500);
if (task.image) {
  try {
    await page.setInputFiles('input[data-testid="fileInput"] >> nth=0', task.image);
    await L.wait(9000);
    const n = await page.evaluate(() => document.querySelectorAll('[data-testid="attachments"] img, [data-testid="attachments"] [role=img]').length);
    console.log('첨부 이미지:', n);
    if (!n) { console.log('⛔ 이미지가 안 붙었다 — 게시하지 않는다'); process.exit(1); }
  } catch (e) { console.log('⛔ 이미지 첨부 실패:', String(e.message).slice(0, 80)); process.exit(1); }
}
await L.wait(5500);
await page.keyboard.down('Meta'); await page.keyboard.press('Enter'); await page.keyboard.up('Meta');
await L.wait(9000);
try { await page.goto('https://x.com'+task.handle, { waitUntil:'domcontentloaded' }); } catch {}
await L.wait(6000);
// 검증 — 고정글을 빼고 «가장 최근 원글»의 status 주소를 뽑는다.
// ⚠ 2026-09-23 수리: 예전엔 템플릿 안의 정규식 이스케이프가 두 번 먹어 href 가 항상 null 이었다(글은 올라가 있었다).
const top = await page.evaluate((h) => {
  const handle = h.replace('/', '').toLowerCase();
  return [...document.querySelectorAll('article[data-testid="tweet"]')].slice(0, 4).map((a) => {
    const own = [...a.querySelectorAll('a[href*="/status/"]')].map((x) => x.getAttribute('href'))
      .find((x) => x.toLowerCase().startsWith('/' + handle + '/status/') && /\/status\/\d+$/.test(x)) || null;
    return { pinned: /Pinned|고정/.test(a.innerText), status: own, img: a.querySelectorAll('[data-testid="tweetPhoto"] img').length,
      text: (a.innerText || '').replace(/\s+/g, ' ').slice(0, 40) };
  });
}, task.handle);
const newest = top.find((t) => !t.pinned && t.status);
console.log(JSON.stringify(top));
if (newest) console.log('\n✅ 공개 URL: https://x.com' + newest.status + ' · 이미지 ' + newest.img);
else console.log('⛔ 새 글의 주소를 못 찾았다 — «발행했다»고 적지 않는다');
