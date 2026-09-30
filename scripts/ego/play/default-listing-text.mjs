// 편집: 기본 등록정보 en/ko/ja/pt-BR — 짧은 설명 교체 + 전체 설명 맨 앞 GEO·위젯 한 줄 → Save as draft → Review(Don't label) → Save
import { space, findPage, wait } from '/Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs';
import fs from 'node:fs';
const OUT = '/Users/eunhoon/signum-ego-io/store';
const APP = 'https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116';
const P = JSON.parse(fs.readFileSync(`${OUT}/widget-geo-plan.json`, 'utf8'));
const LANGS = ['en-US', 'ja-JP', 'ko-KR', 'pt-BR'];
const ts = await space();
const page = await findPage(ts, /play\.google\.com\/console/, null);
await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});
try { await page.goto(APP + '/store-listings/default/edit', { waitUntil: 'commit', timeout: 45000 }); } catch {}
await wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {}
await page.waitForFunction(() => /Short description/.test(document.body?.innerText || ''), undefined, { timeout: 60000 }).catch(() => console.log('editor wait timeout'));
await wait(4000);
const txt = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const langOf = () => page.evaluate(() => { const t = document.body.innerText.replace(/\s+/g, ' '); const m = t.match(/Select a language to edit\s*(.*?)\s*arrow_drop_down/); const s = m ? m[1] : ''; const c = s.match(/–\s*([a-z]{2,3}(-[A-Za-z0-9]+)?)\s*$/); return c ? c[1] : s; });
const fieldPt = (i) => page.evaluate((i) => { const ins = [...document.querySelectorAll('input, textarea')].filter(e => e.getBoundingClientRect().width > 150); const el = ins[i]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.x + Math.min(b.width / 2, 200), y: b.y + Math.min(b.height / 2, 20) }; }, i);
const vals = () => page.evaluate(() => { const ins = [...document.querySelectorAll('input, textarea')].filter(e => e.getBoundingClientRect().width > 150); return { short: ins[1]?.value, full: ins[2]?.value }; });
const done = {}; const before = {};
for (let i = 0; i < 16 && Object.keys(done).length < LANGS.length; i++) {
  const l = await langOf();
  if (LANGS.includes(l) && !done[l]) {
    const v0 = await vals(); before[l] = v0;
    const short = P.default_short[l]; const geo = P.geo[l];
    let pt = await fieldPt(1); await page.mouse.click(pt.x, pt.y, {}); await wait(300);
    await page.evaluate(() => { const el = document.activeElement; if (el && el.select) el.select(); });
    await page.cdp('Input.insertText', { text: short }); await wait(400);
    if (!(v0.full || '').startsWith(geo)) {
      const tp = await fieldPt(2); await page.mouse.click(tp.x, tp.y, {}); await wait(300);
      await page.evaluate(() => { const el = document.activeElement; if (el && el.setSelectionRange) { el.setSelectionRange(0, 0); el.scrollTop = 0; } });
      await page.cdp('Input.insertText', { text: geo + '\n\n' }); await wait(500);
    }
    await page.mouse.click(700, 140, {}); await wait(1200);
    const v1 = await vals();
    done[l] = { shortOk: v1.short === short, geoOk: (v1.full || '').startsWith(geo + '\n\n'), fullLen: (v1.full || '').length, warn: /may not be promoted/.test(await txt()) };
    console.log('EDIT', l, JSON.stringify(done[l]));
    if (!done[l].shortOk || !done[l].geoOk || done[l].fullLen > 4000) { console.log('⛔ 검증 실패 — 저장 안 함'); fs.writeFileSync(`${OUT}/m60-before.json`, JSON.stringify(before, null, 1)); process.exit(0); }
  }
  if (Object.keys(done).length >= LANGS.length) break;
  const nb = await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => /Next language/.test(x.innerText || '') && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (!nb) break; await page.mouse.click(nb.x, nb.y, {}); await wait(3000);
}
fs.writeFileSync(`${OUT}/m60-before.json`, JSON.stringify(before, null, 1));
if (Object.keys(done).length < LANGS.length) { console.log('⛔ 언어 일부 못 찾음', Object.keys(done)); process.exit(0); }
const btn = (re) => page.evaluate((src) => { const rx = new RegExp(src); const b = [...document.querySelectorAll('button,[role=button]')].find(x => rx.test((x.innerText || '').replace(/\s+/g, ' ').trim()) && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, dis: b.getAttribute('aria-disabled') }; }, re.source);
let b = await btn(/^Save as draft$/); await page.mouse.click(b.x, b.y, {}); await wait(6000);
console.log('DRAFT', /Your changes have been saved/.test(await txt()));
for (let k = 0; k < 4 && !/AI asset declaration/.test(await txt()); k++) { b = await btn(/^Next$/); if (!b) break; await page.mouse.click(b.x, b.y, {}); for (let j = 0; j < 10; j++) { await wait(1000); if (/AI asset declaration/.test(await txt())) break; } }
if (!/AI asset declaration/.test(await txt())) { console.log('⛔ Review 단계로 못 감(초안은 저장됨)'); process.exit(0); }
const checkedLabel = () => page.evaluate(() => { const r = [...document.querySelectorAll('[role=radio]')].find(x => x.getAttribute('aria-checked') === 'true'); if (!r) return null; const lab = document.querySelector(`label[for="${r.id}"]`); return (lab ? lab.innerText : '').trim().slice(0, 40); });
let cl = await checkedLabel();
if (!/^Don't label assets/.test(cl || '')) {
  const r = await page.evaluate(() => { for (const x of document.querySelectorAll('[role=radio]')) { const lab = document.querySelector(`label[for="${x.id}"]`); if (lab && /^Don't label assets/.test(lab.innerText.trim())) { x.scrollIntoView({ block: 'center' }); const q = x.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; } } return null; });
  if (r) { await page.mouse.click(r.x, r.y, {}); for (let i = 0; i < 15; i++) { await wait(1000); cl = await checkedLabel(); if (/^Don't label assets/.test(cl || '')) break; } }
}
console.log('AI_DECL', cl);
if (!/^Don't label assets/.test(cl || '')) { console.log('⛔ 신고 선택 확인 실패'); process.exit(0); }
b = await btn(/^Save$/); if (b && b.dis !== 'true') { await page.mouse.click(b.x, b.y, {}); await wait(9000); }
console.log('STATUS', /Changes ready to send for review/.test(await txt()) ? 'ready-to-send' : '?');
await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find(y => /^\s*Not now\s*$/.test(y.innerText || '')); if (x) x.click(); });
