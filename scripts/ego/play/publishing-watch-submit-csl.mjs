// 감시(1회): Play 게시 개요 — 진행 중 심사가 끝났으면(«Changes in review» 없음) 대기 중인 맞춤 등록정보 변경만 있을 때 Submit.
//   안전장치: ①다른 종류 변경이 섞이면 누르지 않음 ②«restart your review» 창이 뜨면 Cancel 후 중단 ③반려 문구가 보이면 중단
//   출력 마지막 줄: WATCH {"state": "...", ...} — 셸 루프가 이 줄로 끝낼지 정한다
import { space, findPage, wait } from '/Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs';
import fs from 'node:fs';
const OUT = '/Users/eunhoon/signum-ego-io/store';
const APP = 'https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116';
const say = (o) => { const line = 'WATCH ' + JSON.stringify({ at: new Date().toISOString(), ...o }); console.log(line); fs.appendFileSync(`${OUT}/play-review-watch.jsonl`, line.slice(6) + '\n'); };
const ts = await space();
if (!ts) { say({ state: 'no-space' }); process.exit(0); }
const page = await findPage(ts, /play\.google\.com\/console/, null);
await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});
try { await page.goto(APP + '/publishing', { waitUntil: 'commit', timeout: 45000 }); } catch {}
await wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {}
await page.waitForFunction(() => /Publishing overview/.test(document.body?.innerText || ''), undefined, { timeout: 60000 }).catch(() => {});
await wait(7000);
const p = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const inReview = /Changes in review/.test(p);
const rejected = /rejected|Rejected|was not approved|policy violation/i.test(p);
const last = (p.match(/Last published on ([A-Za-z]+ \d+, \d{4})/) || [])[1];
const a = p.indexOf('Changes not yet submitted'); const b = p.indexOf('Changes in review');
const seg = a >= 0 ? p.slice(a, b > a ? b : a + 80000) : '';
const n = +(seg.match(/Submit (\d+) changes? for review/) || [])[1] || 0;
const items = seg.match(/Custom store listing: [^|]*?(Add language|Reorder listing|Change [a-z ]+)/g) || [];
const foreign = seg.replace(/Custom store listing: [^|]*?(Add language|Reorder listing|Change [a-z ]+)/g, '').match(/(Production|Default store listing|App content|Pricing|Countries \/ regions|Closed testing|Open testing|Internal testing)/g) || [];
if (rejected) { say({ state: 'rejected-text-seen', inReview, last, pending: n }); process.exit(0); }
if (inReview) { say({ state: 'waiting', inReview, last, pending: n }); process.exit(0); }
if (!n) { say({ state: 'nothing-pending', last }); process.exit(0); }
if (items.length !== n || foreign.length) { say({ state: 'mixed-pending-no-submit', n, items: items.length, foreign }); process.exit(0); }
const sb = await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => /^Submit \d+ changes? for review$/.test((x.innerText || '').replace(/\s+/g, ' ').trim()) && x.getBoundingClientRect().width > 0); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
if (!sb) { say({ state: 'no-submit-button', n }); process.exit(0); }
await page.mouse.click(sb.x, sb.y, {}); await wait(3500);
let t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
if (/restart your review/i.test(t)) {
  await page.evaluate(() => { const c = [...document.querySelectorAll('button')].find(x => /^\s*Cancel\s*$/.test(x.innerText || '') && x.getBoundingClientRect().width > 0); if (c) c.click(); });
  say({ state: 'restart-dialog-cancelled', n }); process.exit(0);
}
// 확인 창(있으면) — «Send changes for review» 류 버튼
const cf = await page.evaluate(() => { const bs = [...document.querySelectorAll('button,[role=button]')].filter(x => /^(Send changes for review|Send \d+ changes? for review|Send for review|Submit)$/.test((x.innerText || '').replace(/\s+/g, ' ').trim()) && x.getBoundingClientRect().width > 0); const b = bs[bs.length - 1]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: b.innerText.trim() }; });
if (cf) { await page.mouse.click(cf.x, cf.y, {}); await wait(8000); }
t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const ok = /Changes in review/.test(t) && !/Submit \d+ changes? for review/.test(t);
await page.screenshot({ path: `${OUT}/m48-after-submit.png` });
say({ state: ok ? 'submitted' : 'submit-unclear', n, confirm: cf && cf.t, quick: /Running quick checks/.test(t) });
