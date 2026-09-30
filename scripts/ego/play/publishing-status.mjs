// 읽기(가벼움): Play 게시 개요 — 진행 중 심사 여부만
import { space, findPage, wait } from '/Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs';
const APP = 'https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116';
const ts = await space();
const page = await findPage(ts, /play\.google\.com\/console/, null);
await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});
try { await page.goto(APP + '/publishing', { waitUntil: 'commit', timeout: 45000 }); } catch {}
await wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {}
await page.waitForFunction(() => /Publishing overview/.test(document.body?.innerText || ''), undefined, { timeout: 60000 }).catch(() => {});
await wait(6000);
const p = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
console.log('PLAY ' + JSON.stringify({ inReview: /Changes in review/.test(p), quick: /Running quick checks/.test(p), rejected: /rejected|Rejected|not approved/.test(p), last: (p.match(/Last published on ([A-Za-z]+ \d+, \d{4})/) || [])[1], pending: (p.match(/Submit (\d+) changes? for review/) || [])[1] || 0 }));
