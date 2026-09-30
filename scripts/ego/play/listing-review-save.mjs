// 편집: 현재 맞춤 등록정보 편집 화면 → Next(Review) → «Don't label assets» → Save (심사 전송은 따로)
import { space, findPage, wait } from '/Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs';
import fs from 'node:fs';
const OUT = '/Users/eunhoon/signum-ego-io/store';
const ts = await space();
const page = await findPage(ts, /play\.google\.com\/console/, null);
let url = await page.url();
try { const cfg = JSON.parse(fs.readFileSync(`${OUT}/m35-cfg.json`, 'utf8')); if (cfg.url && !url.startsWith(cfg.url)) { try { await page.goto(cfg.url, { waitUntil: 'commit', timeout: 45000 }); } catch {} await wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {} await page.waitForFunction(() => /Next/.test(document.body?.innerText || ''), undefined, { timeout: 60000 }).catch(() => {}); await wait(4000); url = await page.url(); } } catch {}
console.log('URL', url);
if (!/store-listings\/(\d+|default)\/edit|custom\/create/.test(url)) { console.log('맞춤 등록정보 편집 화면이 아니다'); process.exit(0); }
const txt = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const btn = (re) => page.evaluate((src) => { const rx = new RegExp(src); const b = [...document.querySelectorAll('button,[role=button]')].find(x => rx.test((x.innerText || '').replace(/\s+/g, ' ').trim()) && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, dis: b.getAttribute('aria-disabled') }; }, re.source);
for (let attempt = 0; attempt < 4 && !/AI asset declaration/.test(await txt()); attempt++) {
  // 저장 직후 첫 «Next» 는 화면이 안 넘어가는 일이 있다(9/30 실측: 두 번째 시도에 넘어감) → 최대 4번
  const nx = await btn(/^Next$/); if (!nx) { console.log('Next 없음'); break; }
  await page.mouse.click(nx.x, nx.y, {});
  for (let i = 0; i < 10; i++) { await wait(1000); if (/AI asset declaration/.test(await txt())) break; }
  console.log('NEXT_ATTEMPT', attempt + 1, /AI asset declaration/.test(await txt()));
}
if (!/AI asset declaration/.test(await txt())) { console.log('Review 단계 아님'); process.exit(0); }
const checkedLabel = () => page.evaluate(() => { const r = [...document.querySelectorAll('[role=radio]')].find(x => x.getAttribute('aria-checked') === 'true'); if (!r) return null; const lab = document.querySelector(`label[for="${r.id}"]`); let t = lab ? lab.innerText : ''; if (!t) { let e = r; for (let i = 0; i < 5 && e; i++) { e = e.parentElement; const s = (e.innerText || '').replace(/\s+/g, ' ').trim(); if (s) { t = s; break; } } } return t.slice(0, 60); });
let cl = await checkedLabel();
if (!/^Don't label assets/.test(cl || '')) {
  const r = await page.evaluate(() => { const rs = [...document.querySelectorAll('[role=radio]')]; for (const x of rs) { const lab = document.querySelector(`label[for="${x.id}"]`); const t = lab ? lab.innerText : (x.parentElement?.parentElement?.innerText || ''); if (/^Don't label assets/.test(t.trim())) { x.scrollIntoView({ block: 'center' }); const b = x.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } } return null; });
  if (!r) { console.log('라디오 못 찾음'); process.exit(0); }
  await page.mouse.click(r.x, r.y, {});
  for (let i = 0; i < 15; i++) { await wait(1000); cl = await checkedLabel(); if (/^Don't label assets/.test(cl || '')) break; }
}
console.log('CHECKED', cl);
if (!/^Don't label assets/.test(cl || '')) { console.log('선택 확인 실패 — 저장 안 함'); process.exit(0); }
const sv = await btn(/^Save$/); if (!sv || sv.dis === 'true') { console.log('Save 불가', JSON.stringify(sv)); process.exit(0); }
await page.mouse.click(sv.x, sv.y, {}); await wait(9000);
const t = await txt();
console.log('STATUS', (t.match(/(Changes ready to send for review|Draft changes|Draft|Changes in review|In review)[^|]{0,40}/) || [''])[0]);
await page.screenshot({ path: `${OUT}/m35-after.png` });
const saved = /Your change has been saved/.test(t) || /Go to Publishing overview\?/.test(t);
console.log('SAVED', saved);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^\s*Not now\s*$/.test(x.innerText || '')); if (b) b.click(); });
await wait(1000);
