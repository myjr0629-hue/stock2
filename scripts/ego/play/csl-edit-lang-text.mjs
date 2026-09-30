// 편집: 맞춤 등록정보 1개(cfg) — 대상 언어 짧은 설명 교체 + 전체 설명 맨 앞 GEO·위젯 한 줄 → Save as draft (검토 저장은 m35)
import { space, findPage, wait } from '/Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs';
import fs from 'node:fs';
const OUT = '/Users/eunhoon/signum-ego-io/store';
const CFG = JSON.parse(fs.readFileSync(`${OUT}/m61-cfg.json`, 'utf8'));   // {url, lang, short, geo}
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
if (!(await langOf()).includes(CFG.lang)) { console.log('⛔ 언어 못 찾음', await langOf()); process.exit(0); }
const fieldPt = (i) => page.evaluate((i) => { const ins = [...document.querySelectorAll('input, textarea')].filter(e => e.getBoundingClientRect().width > 150); const el = ins[i]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.x + Math.min(b.width / 2, 200), y: b.y + Math.min(b.height / 2, 20) }; }, i);
const vals = () => page.evaluate(() => { const ins = [...document.querySelectorAll('input, textarea')].filter(e => e.getBoundingClientRect().width > 150); return { name: ins[0]?.value, short: ins[1]?.value, full: ins[2]?.value }; });
const v0 = await vals();
let pt = await fieldPt(1); await page.mouse.click(pt.x, pt.y, {}); await wait(300);
await page.evaluate(() => { const el = document.activeElement; if (el && el.select) el.select(); });
await page.cdp('Input.insertText', { text: CFG.short }); await wait(400);
if (!(v0.full || '').startsWith(CFG.geo)) {
  const tp = await fieldPt(2); await page.mouse.click(tp.x, tp.y, {}); await wait(300);
  await page.evaluate(() => { const el = document.activeElement; if (el && el.setSelectionRange) { el.setSelectionRange(0, 0); el.scrollTop = 0; } });
  await page.cdp('Input.insertText', { text: CFG.geo + '\n\n' }); await wait(500);
}
await page.mouse.click(700, 140, {}); await wait(1200);
const v1 = await vals();
const ok = v1.short === CFG.short && (v1.full || '').startsWith(CFG.geo + '\n\n') && (v1.full || '').length <= 4000 && v1.name === v0.name;
console.log('EDIT', CFG.lang, JSON.stringify({ name: v1.name, shortOk: v1.short === CFG.short, geoOk: (v1.full || '').startsWith(CFG.geo + '\n\n'), fullLen: (v1.full || '').length }), 'OK', ok);
if (!ok) { console.log('⛔ 검증 실패 — 저장 안 함'); process.exit(0); }
const sd = await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => /^\s*Save as draft\s*$/.test(x.innerText || '') && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
if (sd) { await page.mouse.click(sd.x, sd.y, {}); await wait(6000); }
console.log('SAVED_DRAFT', await page.evaluate(() => /Your changes have been saved|Draft/.test(document.body.innerText)));
