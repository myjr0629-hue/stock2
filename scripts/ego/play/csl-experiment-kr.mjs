// 편집: KR 맞춤 등록정보 실험(현지화 ko-KR, 짧은 설명 A/B) — cfg m69-cfg.json {"start": false|true}
//   start:false → Assets 단계에서 변형 칸 구조만 읽고 멈춘다(저장 없음) · start:true → 변형 입력 → Review → 시작/저장
import { space, findPage, wait } from '/Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs';
import fs from 'node:fs';
const OUT = '/Users/eunhoon/signum-ego-io/store';
const APP = 'https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116';
const CFG = JSON.parse(fs.readFileSync(`${OUT}/m69-cfg.json`, 'utf8'));
const NAME = 'kr-short-hook-vs-keywords-0930';
const VARIANT_SHORT = '미국주식 앱. 주식 위젯과 관심종목 실시간 주가, 실적발표 일정, 프리마켓, 옵션 흐름, 다크풀까지 한눈에';
const ts = await space();
const page = await findPage(ts, /play\.google\.com\/console/, null);
await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});
try { await page.goto(APP + '/store-listings/4835248894002847302/experiments/create', { waitUntil: 'commit', timeout: 45000 }); } catch {}
await wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {}
await page.waitForFunction(() => /Experiment type/.test(document.body?.innerText || ''), undefined, { timeout: 60000 }).catch(() => {});
await wait(3500);
const txt = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const small = (src, sel) => page.evaluate(({ src, sel }) => { const rx = new RegExp(src); const els = [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && rx.test((e.innerText || '').replace(/\s+/g, ' ').trim()); }); els.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height); const e = els[0]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + Math.min(20, r.width / 2), y: r.y + r.height / 2 }; }, { src, sel });
const nm = await page.evaluate(() => { const e = [...document.querySelectorAll('input')].filter(x => x.getBoundingClientRect().width > 150)[0]; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; });
await page.mouse.click(nm.x, nm.y, {}); await page.evaluate(() => { const el = document.activeElement; if (el && el.select) el.select(); }); await page.cdp('Input.insertText', { text: NAME }); await wait(400);
let p = await small('^Experiment on a localized listing$', 'label,span,div'); await page.mouse.click(p.x, p.y, {}); await wait(2000);
let dd = await small('^Default – English \\(United States\\) – en-US( arrow_drop_down)?$', '[role=button],[role=combobox],button,div');
if (dd) { await page.mouse.click(dd.x, dd.y, {}); await wait(1500); const ko = await small('Korean – ko-KR', '[role=option],material-select-dropdown-item,[role=menuitem],[role=menuitemcheckbox],li,span,div'); if (ko) { await page.mouse.click(ko.x, ko.y, {}); await wait(1500); } await page.keyboard.press('Escape'); await wait(800); }
if (!/Korean – ko-KR arrow_drop_down/.test(await txt())) { console.log('⛔ ko-KR 선택 실패'); process.exit(0); }
const v = await small('^View advanced settings$', 'button,a,[role=button],span'); if (v) { await page.mouse.click(v.x, v.y, {}); await wait(2000); }
const mde = await small('^2\\.5%( arrow_drop_down)?$', '[role=button],[role=combobox],button,div');
if (mde) { await page.mouse.click(mde.x, mde.y, {}); await wait(1500); const six = await small('^6\\.0%', '[role=option],material-select-dropdown-item,[role=menuitem],li,span,div'); if (six) { await page.mouse.click(six.x, six.y, {}); await wait(1500); } }
let t = await txt(); console.log('DETAILS', (t.match(/Minimum detectable effect[^|]{0,80}/) || [''])[0], '|', (t.match(/Est\. unique user install clicks needed [\d,]+/) || [''])[0]);
// 실험 대상 비율(좁은 숫자 칸) = 50
const pctInputs = await page.evaluate(() => [...document.querySelectorAll('input')].filter(e => e.getBoundingClientRect().width > 0 && (e.type === 'number' || /%|percent/i.test((e.getAttribute('aria-label') || '') + (e.closest('div')?.innerText || '').slice(0, 80)))).map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, v: e.value, t: e.type, w: Math.round(r.width) }; }));
console.log('PCT_INPUTS', JSON.stringify(pctInputs));
const pct = pctInputs.find(x => x.w < 150);
if (pct && !pct.v) { await page.mouse.click(pct.x, pct.y, {}); await wait(200); await page.evaluate(() => { const el = document.activeElement; if (el && el.select) el.select(); }); await page.cdp('Input.insertText', { text: '50' }); await wait(600); await page.mouse.click(700, 140, {}); await wait(800); }
console.log('PCT_NOW', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 150).map(e => e.value))));
// Next → Assets («Step 2 of 3» 가 보일 때까지)
for (let k = 0; k < 4 && !/Step 2 of 3/.test(await txt()); k++) { const nx = await small('^Next$', 'button,[role=button]'); if (!nx) break; await page.mouse.click(nx.x, nx.y, {}); await wait(5000); }
console.log('STEP2', /Step 2 of 3/.test(await txt()), (await txt()).match(/[^.]{0,80}(error|required|must)[^.]{0,80}/i)?.[0] || '');
t = await txt(); fs.writeFileSync(`${OUT}/m69-assets.txt`, t);
const i = t.indexOf('Step 2'); console.log('ASSETS', t.slice(Math.max(0, t.indexOf('Assets') - 50), t.indexOf('Assets') + 2500));
const fields = await page.evaluate(() => [...document.querySelectorAll('input,textarea')].filter(e => e.getBoundingClientRect().width > 150).map(e => ({ tag: e.tagName, val: (e.value || '').slice(0, 60), aria: e.getAttribute('aria-label') || '', y: Math.round(e.getBoundingClientRect().y) })));
console.log('FIELDS', JSON.stringify(fields));
await page.screenshot({ path: `${OUT}/m69-assets.png` });
// Add asset → «Short description» 체크박스 → 팝업 닫기
let ad = await small('^add Add asset$|^Add asset$', 'button,[role=button],a');
if (ad) { await page.mouse.click(ad.x, ad.y, {}); await wait(1500);
  const cb = await page.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => /^Short description$/.test((e.innerText || '').trim()) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 400); els.sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width); const e = els[0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x - 32, y: r.y + r.height / 2 }; });
  console.log('CB', JSON.stringify(cb));
  if (cb) { await page.mouse.click(cb.x, cb.y, {}); await wait(1500); }
  const checked = await page.evaluate(() => [...document.querySelectorAll('[role=checkbox],input[type=checkbox],mat-checkbox')].filter(e => e.getBoundingClientRect().width > 0).map(e => (e.getAttribute('aria-checked') || e.checked) + ':' + ((e.closest('li,[role=option],div')?.innerText) || '').replace(/\s+/g, ' ').trim().slice(0, 30)));
  console.log('CHECKED', JSON.stringify(checked));
  const x = await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(e => /^close$/.test((e.innerText || e.getAttribute('aria-label') || '').trim()) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().y < 500); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (x) { await page.mouse.click(x.x, x.y, {}); await wait(1500); }
}
t = await txt(); fs.writeFileSync(`${OUT}/m69-assets2.txt`, t);
console.log('AFTER_ADD', t.slice(t.indexOf('Asset type'), t.indexOf('Asset type') + 1500));
console.log('FIELDS2', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input,textarea')].filter(e => e.getBoundingClientRect().width > 150).map(e => ({ tag: e.tagName, val: (e.value || '').slice(0, 70), y: Math.round(e.getBoundingClientRect().y) })))));
await page.screenshot({ path: `${OUT}/m69-assets2.png` });
if (CFG.start) {
  const ins = await page.evaluate(() => [...document.querySelectorAll('input,textarea')].filter(e => e.getBoundingClientRect().width > 150).map(e => { const r = e.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2, v: e.value, lab: (e.closest('div')?.parentElement?.innerText || '').replace(/\s+/g, ' ').slice(0, 60) }; }));
  console.log('INPUTS', JSON.stringify(ins));
  if (ins.length < 2) { console.log('⛔ 변형 칸(이름·짧은 설명)이 안 보인다'); process.exit(0); }
  await page.mouse.click(ins[0].x, ins[0].y, {}); await page.evaluate(() => { const el = document.activeElement; if (el && el.select) el.select(); }); await page.cdp('Input.insertText', { text: 'B app-intent keywords' }); await wait(500);
  const sdIn = ins[ins.length - 1];
  await page.mouse.click(sdIn.x, sdIn.y, {}); await page.evaluate(() => { const el = document.activeElement; if (el && el.select) el.select(); }); await page.cdp('Input.insertText', { text: VARIANT_SHORT }); await wait(800);
  await page.mouse.click(700, 140, {}); await wait(800);
  const vv = await page.evaluate(() => [...document.querySelectorAll('input,textarea')].filter(e => e.getBoundingClientRect().width > 150).map(e => e.value));
  console.log('VALUES', JSON.stringify(vv));
  if (!vv.includes(VARIANT_SHORT)) { console.log('⛔ 변형 짧은 설명 입력 확인 실패'); process.exit(0); }
  for (let k = 0; k < 4 && !/Step 3 of 3/.test(await txt()); k++) { const nx = await small('^Next$', 'button,[role=button]'); if (!nx) break; await page.mouse.click(nx.x, nx.y, {}); await wait(5000); }
  t = await txt(); fs.writeFileSync(`${OUT}/m69-review.txt`, t);
  console.log('REVIEW', t.slice(t.indexOf('Set up store listing experiment'), t.indexOf('Set up store listing experiment') + 1500));
  const st = await small('^(Start experiment|Start|Save)$', 'button,[role=button]');
  console.log('START_BTN', JSON.stringify(st));
  if (st) { await page.mouse.click(st.x, st.y, {}); await wait(6000); }
  t = await txt();
  if (/restart your review/i.test(t)) { await page.evaluate(() => { const c = [...document.querySelectorAll('button')].find(x => /^\s*Cancel\s*$/.test(x.innerText || '') && x.getBoundingClientRect().width > 0); if (c) c.click(); }); console.log('⛔ 재시작 창 — 취소'); process.exit(0); }
  const cf = await small('^(Start experiment|Start|Confirm|OK)$', 'button,[role=button]'); if (cf && /Start|Confirm/.test(t)) { await page.mouse.click(cf.x, cf.y, {}); await wait(6000); }
  console.log('AFTER_START', (await page.url()), (await txt()).slice(0, 400));
  await page.screenshot({ path: `${OUT}/m69-after-start.png` });
  process.exit(0);
}
if (!CFG.start) { await page.evaluate(() => { window.onbeforeunload = null; }); try { await page.goto(APP + '/store-listings', { waitUntil: 'commit', timeout: 45000 }); } catch {} await wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {} console.log('LEFT(저장 안 함)'); process.exit(0); }
