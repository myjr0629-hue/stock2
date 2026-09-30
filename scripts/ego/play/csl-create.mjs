// 편집: 맞춤 스토어 등록정보 1개 생성(국가 대상) — cfg: ~/signum-ego-io/store/m33-cfg.json {"idx":N}
//   1 Setup: 기본 등록정보 복제 · 2 Details: 참조 이름·100%·국가 · 3 Assets: 대상 언어 이름/짧은/전체 + 폰 스크린샷 확인 · 4 Review: «Don't label assets» → Save
import { space, findPage, wait } from '/Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs';
import fs from 'node:fs';
const OUT = '/Users/eunhoon/signum-ego-io/store';
const APP = 'https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116';
const { idx } = JSON.parse(fs.readFileSync(`${OUT}/m33-cfg.json`, 'utf8'));
const C = JSON.parse(fs.readFileSync(`${OUT}/csl-plan.json`, 'utf8'))[idx];
const LOG = [];
const log = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); LOG.push(s); console.log(s); };
const stop = (why) => { log('⛔ 중단:', why); fs.writeFileSync(`${OUT}/m33-${idx}-log.txt`, LOG.join('\n')); process.exit(0); };
log('CSL', C.ref, C.countries);
const ts = await space();
const page = await findPage(ts, /play\.google\.com\/console/, null);
const txt = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const smallest = (src, sel = '*', within = null) => page.evaluate(({ src, sel, within }) => {
  const rx = new RegExp(src); const root = within ? document.querySelector(within) : document; if (!root) return null;
  const els = [...root.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && rx.test((e.innerText || '').replace(/\s+/g, ' ').trim()); });
  els.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
  const e = els[0]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 50) };
}, { src, sel, within });
const clickSmall = async (re, sel, ms = 1200) => { let p = await smallest(re.source, sel); if (!p) return null; await wait(300); p = await smallest(re.source, sel); await page.mouse.click(p.x, p.y, {}); await wait(ms); return p; };
const btn = (re) => page.evaluate((src) => { const rx = new RegExp(src); const b = [...document.querySelectorAll('button,[role=button]')].find(x => rx.test((x.innerText || '').replace(/\s+/g, ' ').trim()) && x.getBoundingClientRect().width > 0); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, dis: b.getAttribute('aria-disabled') }; }, re.source);
const clickBtn = async (re, ms = 4000) => { let b = await btn(re); if (!b) return null; await wait(300); b = await btn(re); if (b.dis === 'true') return 'disabled'; await page.mouse.click(b.x, b.y, {}); await wait(ms); return b; };
const typeReplace = async (pt, text) => { await page.mouse.click(pt.x, pt.y, {}); await wait(300); await page.evaluate(() => { const el = document.activeElement; if (el && el.select) el.select(); else document.execCommand('selectAll'); }); await page.cdp('Input.insertText', { text }); await wait(500); };
// ── 0) 목록 → Create custom listing
try { await page.goto(APP + '/store-listings', { waitUntil: 'commit', timeout: 45000 }); } catch {}
await wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {}
await page.waitForFunction(() => /Create custom listing/.test(document.body?.innerText || ''), undefined, { timeout: 60000 }).catch(() => {});
await wait(2500);
if ((await txt()).includes(C.ref)) stop('같은 참조 이름이 이미 목록에 있다');
if (!(await clickBtn(/^Create custom listing$/, 6000))) stop('Create 버튼 없음');
if (!/custom\/create/.test(await page.url())) stop('마법사로 안 감');
// ── 1) Setup
await clickSmall(/^Duplicate an existing listing$/, 'label,span,div');
let dd = await smallest('^Select listing( arrow_drop_down)?$', '[role=combobox],[role=button],button,div');
if (!dd) stop('Select listing 드롭다운 없음');
await page.mouse.click(dd.x, dd.y, {}); await wait(1500);
const opDef = await smallest('^Default store listing$', '[role=option],material-select-dropdown-item,li,span,div');
if (!opDef) stop('Default store listing 옵션 없음');
await page.mouse.click(opDef.x, opDef.y, {}); await wait(1500);
if (!/Duplicate an existing listing.*Default store listing/.test(await txt())) stop('복제 선택 확인 실패');
await clickBtn(/^Next$/, 5000);
if (!/Reference name/.test(await txt())) stop('2단계 아님');
// ── 2) Details
const refPt = await page.evaluate(() => { const e = [...document.querySelectorAll('input')].filter(x => x.getBoundingClientRect().width > 150)[0]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2, v: e.value }; });
await typeReplace(refPt, C.ref);
const refNow = await page.evaluate(() => [...document.querySelectorAll('input')].filter(x => x.getBoundingClientRect().width > 150)[0]?.value);
log('REF', refNow); if (refNow !== C.ref) stop('참조 이름 입력 실패');
// 롤아웃 100%
let ro = await smallest('^\\d+%( arrow_drop_down)?$', '[role=combobox],[role=button],button,div');
if (ro) { await page.mouse.click(ro.x, ro.y, {}); await wait(1200); const o = await smallest('^100%$', '[role=option],material-select-dropdown-item,li,span,div'); if (o) { await page.mouse.click(o.x, o.y, {}); await wait(1500); } }
// «Roll out to 100%?» 확인 모달 → Yes (우리 맞춤 등록정보의 노출 비율 확인 — 약관 아님)
if (/Roll out to 100%\?/.test(await txt())) { const y = await smallest('^Yes$', 'button,[role=button]'); if (y) { await page.mouse.click(y.x, y.y, {}); await wait(1500); log('ROLLOUT_CONFIRM', 'Yes'); } }
log('ROLLOUT', (await txt()).match(/(\d+)% arrow_drop_down of target audience/)?.[1]);
if (!/100% arrow_drop_down of target audience/.test(await txt())) stop('롤아웃 100% 확인 실패');
// 대상: Country/region
dd = await smallest('^Select an audience( arrow_drop_down)?$', '[role=combobox],[role=button],button,div');
if (!dd) stop('audience 드롭다운 없음');
await page.mouse.click(dd.x, dd.y, {}); await wait(1500);
const oc = await smallest('^Country\\s*/\\s*region', '[role=option],material-select-dropdown-item,li,span,div');
if (!oc) stop('Country/region 옵션 없음');
await page.mouse.click(oc.x, oc.y, {}); await wait(2000);
const addc = await smallest('^add Country / region$', 'button,[role=button],a');
if (!addc) stop('add Country 버튼 없음');
await page.mouse.click(addc.x, addc.y, {}); await wait(2500);
for (const cn of C.countries) {
  const sp = await page.evaluate(() => { const e = [...document.querySelectorAll('input')].find(x => (x.getAttribute('aria-label') || '') === 'Search' && x.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; });
  if (!sp) stop('나라 검색칸 없음');
  await typeReplace(sp, cn); await wait(1500);
  // 검색 결과에서 정확히 그 이름인 행 클릭
  const row = await page.evaluate((cn) => { const els = [...document.querySelectorAll('*')].filter(e => { const t = (e.innerText || '').replace(/\s+/g, ' ').trim(); const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (t === 'check_box_outline_blank ' + cn || t === 'check_box ' + cn); }); els.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height); const e = els[0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + 14, y: r.y + r.height / 2, t: e.innerText.replace(/\s+/g, ' ').trim() }; }, cn);
  if (!row) stop('나라 행 없음: ' + cn);
  if (/^check_box /.test(row.t)) { log('이미 선택', cn); continue; }
  await page.mouse.click(row.x, row.y, {}); await wait(900);
  const ok = await page.evaluate((cn) => [...document.querySelectorAll('*')].some(e => (e.innerText || '').replace(/\s+/g, ' ').trim() === 'check_box ' + cn), cn);
  log('선택', cn, ok); if (!ok) stop('나라 체크 실패: ' + cn);
}
await clickBtn(/^Apply$/, 2500);
const aud = await txt(); const ai = aud.indexOf('Select countries / regions');
log('AUDIENCE_TEXT', aud.slice(ai, ai + 300));
for (const cn of C.countries) if (!aud.slice(ai, ai + 600).includes(cn)) stop('적용 후 나라 표시 없음: ' + cn);
await page.screenshot({ path: `${OUT}/m33-${idx}-step2.png` });
await clickBtn(/^Next$/, 6000);
if (!/Select a language to edit/.test(await txt())) stop('3단계 아님');
// ── 3) Assets
const langOf = () => page.evaluate(() => (document.body.innerText.replace(/\s+/g, ' ').match(/Select a language to edit\s*(.*?)\s*arrow_drop_down/) || [])[1] || '');
const fieldPt = (i) => page.evaluate((i) => { const ins = [...document.querySelectorAll('input, textarea')].filter(e => e.getBoundingClientRect().width > 150); const el = ins[i]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.x + Math.min(b.width / 2, 200), y: b.y + Math.min(b.height / 2, 20) }; }, i);
const vals = () => page.evaluate(() => { const ins = [...document.querySelectorAll('input, textarea')].filter(e => e.getBoundingClientRect().width > 150); return { name: ins[0]?.value, short: ins[1]?.value, full: ins[2]?.value }; });
const phoneShots = () => page.evaluate(() => { const btns = [...document.querySelectorAll('button,[role=button]')].filter(b => /^Remove /.test(b.getAttribute('aria-label') || '')); return btns.filter(b => { let e = b; for (let i = 0; i < 10 && e; i++) { e = e.parentElement; if (e && /Phone screenshots/.test(e.innerText || '') && !/Feature graphic|App icon/.test(e.innerText || '')) return true; } return false; }).map(b => b.getAttribute('aria-label').replace(/^Remove /, '')); });
const todo = Object.keys(C.langs); const done = {};
for (let i = 0; i < 15 && Object.keys(done).length < todo.length; i++) {
  const l = await langOf(); const code = (l.match(/–\s*([a-z]{2,3}(-[A-Za-z0-9]+)?)\s*$/) || [])[1];
  if (C.langs[code] && !done[code]) {
    const p = C.langs[code];
    if (p.name) { await typeReplace(await fieldPt(0), p.name); }
    await typeReplace(await fieldPt(1), p.short);
    // 전체 설명: 전부 선택 후 교체
    const tp = await fieldPt(2); await page.mouse.click(tp.x, tp.y, {}); await wait(300);
    await page.evaluate(() => { const el = document.activeElement; if (el && el.setSelectionRange) { el.setSelectionRange(0, el.value.length); } });
    await page.cdp('Input.insertText', { text: p.full }); await wait(800);
    await page.mouse.click(700, 140, {}); await wait(1200);
    const v = await vals(); const shots = await phoneShots();
    done[code] = { nameOk: p.name ? v.name === p.name : true, shortOk: v.short === p.short, fullOk: v.full === p.full, fullLen: (v.full || '').length, shots };
    log('EDIT', code, done[code]);
    if (!done[code].nameOk || !done[code].shortOk || !done[code].fullOk) stop('문구 입력 검증 실패 ' + code);
  }
  if (Object.keys(done).length >= todo.length) break;
  const nb = await btn(/^Next language/); if (!nb) break; await page.mouse.click(nb.x, nb.y, {}); await wait(3000);
}
if (Object.keys(done).length < todo.length) stop('대상 언어를 못 찾음');
fs.writeFileSync(`${OUT}/m33-${idx}-shots.json`, JSON.stringify(done, null, 1));
await clickBtn(/^Save as draft$/, 6000);
log('DRAFT', (await txt()).match(/Your changes have been saved|saved/) ? 'saved' : '?', await page.url());
await page.screenshot({ path: `${OUT}/m33-${idx}-step3.png` });
fs.writeFileSync(`${OUT}/m33-${idx}-log.txt`, LOG.join('\n'));
