// 편집: 등록정보(기본/맞춤) 한 언어의 폰 스크린샷을 [list, widget, cmd, dash, flow, guardian] 으로 — 위젯을 2번째에 넣는다
//   방법(9/30 검증된 것): 1번(list)만 남기고 제거 → 라이브러리에서 한 장씩 선택·Add(뒤에 붙는다) → 순서 검증 → Save as draft
//   cfg: ~/signum-ego-io/store/m65-cfg.json {url, lang:'en-US', loc:'en'}
import { space, findPage, wait } from '/Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs';
import fs from 'node:fs';
const OUT = '/Users/eunhoon/signum-ego-io/store';
const CFG = JSON.parse(fs.readFileSync(`${OUT}/m65-cfg.json`, 'utf8'));
const L = CFG.loc;
const WANT = [`p0930-${L}-1-list.png`, `p0930-${L}-W-widget.png`, `p0930-${L}-2-cmd.png`, `p0930-${L}-3-dash.png`, `p0930-${L}-4-flow.png`, `p0930-${L}-5-guardian.png`];
const ts = await space();
const page = await findPage(ts, /play\.google\.com\/console/, null);
await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});
try { await page.goto(CFG.url, { waitUntil: 'commit', timeout: 45000 }); } catch {}
await wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {}
await page.waitForFunction(() => /Select a language to edit|Reference name/.test(document.body?.innerText || ''), undefined, { timeout: 60000 }).catch(() => console.log('편집기 대기 초과'));
await wait(3000);
for (let k = 0; k < 3 && !/Select a language to edit/.test(await page.evaluate(() => document.body.innerText)); k++) {
  const nx = await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => /^\s*Next\s*$/.test(x.innerText || '') && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (!nx) break; await page.mouse.click(nx.x, nx.y, {});
  await page.waitForFunction(() => /Select a language to edit/.test(document.body?.innerText || ''), undefined, { timeout: 12000 }).catch(() => {}); await wait(2500);
}
const langOf = () => page.evaluate(() => (document.body.innerText.replace(/\s+/g, ' ').match(/Select a language to edit\s*(.*?)\s*arrow_drop_down/) || [])[1] || '');
for (let i = 0; i < 14; i++) { if ((await langOf()).includes(CFG.lang)) break; const nb = await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => /Next language/.test(x.innerText || '') && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); if (!nb) break; await page.mouse.click(nb.x, nb.y, {}); await wait(3000); }
if (!(await langOf()).includes(CFG.lang)) { console.log('⛔ 언어 못 찾음'); process.exit(0); }
const phoneShots = () => page.evaluate(() => { const btns = [...document.querySelectorAll('button,[role=button]')].filter(b => /^Remove /.test(b.getAttribute('aria-label') || '')); return btns.filter(b => { let e = b; for (let i = 0; i < 10 && e; i++) { e = e.parentElement; if (e && /Phone screenshots/.test(e.innerText || '') && !/Feature graphic|App icon/.test(e.innerText || '')) return true; } return false; }).map(b => b.getAttribute('aria-label').replace(/^Remove /, '')); });
let cur = await phoneShots();
console.log('BEFORE', JSON.stringify(cur));
if (JSON.stringify(cur) === JSON.stringify(WANT)) { console.log('이미 원하는 순서 — 건너뜀'); process.exit(0); }
if (cur[0] !== WANT[0]) { console.log('⛔ 1번이 예상과 다름 — 손대지 않음'); process.exit(0); }
// 1번만 남기고 뒤에서부터 제거
for (let k = 0; k < 10; k++) {
  cur = await phoneShots(); if (cur.length <= 1) break;
  const r = await page.evaluate((first) => { const btns = [...document.querySelectorAll('button,[role=button]')].filter(b => /^Remove /.test(b.getAttribute('aria-label') || '')); const phone = btns.filter(b => { let e = b; for (let i = 0; i < 10 && e; i++) { e = e.parentElement; if (e && /Phone screenshots/.test(e.innerText || '') && !/Feature graphic|App icon/.test(e.innerText || '')) return true; } return false; }); const t = phone.filter(b => (b.getAttribute('aria-label') || '') !== 'Remove ' + first).pop(); if (!t) return null; const n = t.getAttribute('aria-label'); t.click(); return n; }, WANT[0]);
  if (!r) break; await wait(1100);
}
console.log('AFTER_REMOVE', JSON.stringify(await phoneShots()));
const panelOpen = () => page.evaluate(() => !!document.querySelector('.list-row-container'));
const openPanel = async () => {
  const p = await page.evaluate(() => { const all = [...document.querySelectorAll('button,[role=button],a')].filter(b => /^\s*Add assets\s*$/.test(b.innerText || '')); const hit = all.find(b => { let e = b; for (let i = 0; i < 8 && e; i++) { e = e.parentElement; if (e && /Phone screenshots/.test(e.innerText || '') && !/Feature graphic/.test(e.innerText || '')) return true; } return false; }); if (!hit) return null; hit.scrollIntoView({ block: 'center' }); return true; });
  if (!p) return false; await wait(500);
  const q = await page.evaluate(() => { const all = [...document.querySelectorAll('button,[role=button],a')].filter(b => /^\s*Add assets\s*$/.test(b.innerText || '')); const hit = all.find(b => { let e = b; for (let i = 0; i < 8 && e; i++) { e = e.parentElement; if (e && /Phone screenshots/.test(e.innerText || '') && !/Feature graphic/.test(e.innerText || '')) return true; } return false; }); const r = hit.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(q.x, q.y, {}); await wait(3000); return true;
};
for (const n of WANT.slice(1)) {
  cur = await phoneShots(); if (cur.includes(n)) continue;
  if (!(await panelOpen())) await openPanel();
  const inLib = () => page.evaluate((n) => [...document.querySelectorAll('.list-row-container')].some(r => (r.innerText || '').includes(n)), n);
  if (!(await inLib())) {
    await page.setInputFiles('input[type=file]', [`${OUT}/play-shots/${n}`]);
    for (let i = 0; i < 30; i++) { if (await inLib()) break; await wait(2000); }
    await wait(2500);
  }
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === 'Deselect all'); if (b) b.click(); });
  await wait(900);
  const r = await page.evaluate((n) => { const row = [...document.querySelectorAll('.list-row-container')].find(r => (r.innerText || '').includes(n)); if (!row) return 'no-row'; row.scrollIntoView({ block: 'center' }); const sel = row.querySelector('[aria-label="Select button"]'); if (!sel) return 'no-select'; sel.click(); return 'ok'; }, n);
  await wait(700);
  const selN = await page.evaluate(() => document.querySelectorAll('[aria-label="Deselect button"]').length);
  if (r !== 'ok' || selN !== 1) { console.log('⛔ 선택 실패', n, r, selN); break; }
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === 'Add'); if (b) b.click(); });
  await wait(3200);
}
if (await panelOpen()) { await page.evaluate(() => { const c = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === 'Close side panel'); if (c) c.click(); }); await wait(1000); }
cur = await phoneShots();
const ok = JSON.stringify(cur) === JSON.stringify(WANT);
console.log('FINAL', JSON.stringify(cur), 'ORDER_OK', ok);
if (!ok) { console.log('⛔ 순서 불일치 — 저장하지 않음(새로고침하면 되돌아간다)'); process.exit(0); }
const sd = await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => /^\s*Save as draft\s*$/.test(x.innerText || '') && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
if (sd) { await page.mouse.click(sd.x, sd.y, {}); await wait(6000); }
console.log('SAVED_DRAFT', await page.evaluate(() => /Your changes have been saved|Draft/.test(document.body.innerText)));
