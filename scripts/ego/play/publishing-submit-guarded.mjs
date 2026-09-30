// 편집: 게시 개요 — 진행 중 심사 없음 + 제출 전 변경이 «등록정보(기본·맞춤) [+ cfg.release 출시 1건]»뿐일 때만 Submit → 확인 (기본 dry — cfg 의 dry:false 일 때만 누른다)
import { space, findPage, wait } from '/Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs';
import fs from 'node:fs';
const OUT = '/Users/eunhoon/signum-ego-io/store';
const APP = 'https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116';
// 선택지는 cfg 파일로만(환경변수는 ego 안 스크립트에 전달되지 않는다): ~/signum-ego-io/store/submit-cfg.json {"dry": true, "release": "9 (1.3.1)" | null}
let CFG = { dry: true, release: null }; try { CFG = { ...CFG, ...JSON.parse(fs.readFileSync(`${OUT}/submit-cfg.json`, 'utf8')) }; } catch {}
const DRY = CFG.dry !== false;
const ts = await space();
const page = await findPage(ts, /play\.google\.com\/console/, null);
await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});
try { await page.goto(APP + '/publishing', { waitUntil: 'commit', timeout: 45000 }); } catch {}
await wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {}
await page.waitForFunction(() => /Publishing overview/.test(document.body?.innerText || ''), undefined, { timeout: 60000 }).catch(() => {});
await wait(8000);
const p = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
if (/Changes in review/.test(p)) { console.log('⛔ 진행 중 심사 있음 — 보내지 않음(재시작 방지)'); process.exit(0); }
const a = p.indexOf('Changes not yet submitted');
const seg = a >= 0 ? p.slice(a) : '';
fs.writeFileSync(`${OUT}/m67-pending.txt`, seg.slice(0, 60000));
const n = +(seg.match(/Submit (\d+) changes? for review/) || [])[1] || 0;
const listing = (seg.match(/(Default store listing|Custom store listing: [^|]*?) (Change|Add language|Reorder listing)/g) || []).length;
const prod = seg.match(/\d+ \([\d.]+\) Start (full|staged) rollout/g) || [];
const prodOk = CFG.release ? (prod.length === 1 && prod[0].startsWith(CFG.release)) : prod.length === 0;
const prodItems = prod.length;
const foreign = (seg.match(/(Closed testing|Open testing|Internal testing|App content|Pricing|Countries \/ regions|Store settings)/g) || []);
console.log(JSON.stringify({ n, listing, prod, prodItems, prodOk, foreign }));
if (!n || !prodOk || foreign.length || listing + prodItems !== n) { console.log('⛔ 목록이 예상(등록정보 + cfg.release)과 다름 — 보내지 않음'); process.exit(0); }
if (DRY) { console.log('(DRY) 여기까지'); process.exit(0); }
const sb = await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => /^Submit \d+ changes? for review$/.test((x.innerText || '').replace(/\s+/g, ' ').trim()) && x.getBoundingClientRect().width > 0); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(sb.x, sb.y, {}); await wait(3500);
let t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
if (/restart your review/i.test(t)) { await page.evaluate(() => { const c = [...document.querySelectorAll('button')].find(x => /^\s*Cancel\s*$/.test(x.innerText || '') && x.getBoundingClientRect().width > 0); if (c) c.click(); }); console.log('⛔ 재시작 창 — 취소'); process.exit(0); }
const cf = await page.evaluate(() => { const bs = [...document.querySelectorAll('button,[role=button]')].filter(x => /^(Send changes for review|Send \d+ changes? for review|Send for review)$/.test((x.innerText || '').replace(/\s+/g, ' ').trim()) && x.getBoundingClientRect().width > 0); const b = bs[bs.length - 1]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: b.innerText.trim() }; });
if (cf) { await page.mouse.click(cf.x, cf.y, {}); await wait(8000); }
t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
console.log('RESULT', JSON.stringify({ submittedN: n, confirm: cf && cf.t, inReview: /Changes in review/.test(t), quick: /Running quick checks/.test(t), stillPending: (t.match(/Submit \d+ changes? for review/) || [''])[0] }));
await page.screenshot({ path: `${OUT}/m67-after.png` });
