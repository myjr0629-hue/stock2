/* Play 콘솔 통계 «스토어 등록정보 취득(Store listing acquisitions)» 읽기 — 트래픽 소스·UTM 출처·검색어별 (읽기 전용, 2026-10-05 14시 회차 신설)
 * 왜: 스마트링크(storeRedirect.playUrlWithReferrer)는 Play 링크에 referrer=utm_source=<from>… 를 붙인다. Device acquisitions(play-acquisitions.mjs)는
 *     «Paid and direct» 한 덩어리뿐이라 «안드로이드 설치가 어디서 오나»를 못 가른다. 이 도구는 통계 화면의 «Legacy Store listing performance →
 *     Store listing acquisitions(All users)» 지표를 얹고 차원(Traffic source · UTM source · Search term)별 날짜 표를 읽어 열 합계를 낸다.
 * 실행: bash scripts/ego-run.sh scripts/ego/play/play-listing-acq.mjs 240
 *       · 기본 = 트래픽 소스 + UTM 출처 두 표(약 90초). 바꾸려면 ~/signum-ego-io/<KST>/play-listing-acq-cfg.json {"presets":["traffic","utm","search"]} (python json.dump)
 *       · cfg 에 "open":[정규식…] 을 주면 «메뉴 눌러 보기» 탐침이 된다(정규식 뒤 «#2» = 같은 글자 메뉴의 둘째 항목) · "table":true 면 표를 출력
 *       → 요약 PLAY_LISTING_SUMMARY(차원별 열 합계) + play-listing-acq.json·png (~/signum-ego-io/<KST>/)
 * 첫 실측(10/5, 9/6~10/3 창 · 이 지표의 마지막 데이터 일은 9/24 — 7일+ 지연, «미집계»≠0): 등록정보 취득 26 = «Ads and referrals»(우리 링크 등) 17 +
 *       «Google Play explore» 9 · 검색어 차원: 이름 붙은 검색어 0 · «No search terms specified» 17(=referrals와 같은 수) · «Other» 9(=explore와 같은 수 — 가설: Play 안(검색 포함)에서 온 설치, 개별 검색어는 Play 가 숨김) · UTM: 출처 지정 없음 21 / 있음 5 — Play 가 UTM «값» 목록을 주지 않아(All·No UTM 둘뿐) 채널별 귀속은 불가.
 * 읽기 전용 — 링크·메뉴 «열기/고르기»만 누른다(저장/제출/변경 없음 · 보고서 «Save this report»·Export 금지).
 */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const APP = 'https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116';
const T0 = Date.now(); const el = () => Math.round((Date.now() - T0) / 1000) + 's';
const log = (...a) => console.log(`[${el()}]`, ...a);
const out = { at: new Date().toISOString(), steps: [], summaries: [] };
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(L.ioDir() + '/play-listing-acq-cfg.json', 'utf8')); } catch {}
if (!cfg.open && !cfg.href && !cfg.anchors && !cfg.presets) cfg.presets = ['traffic', 'utm'];   // 설정이 없으면 기본 읽기
const DIM = { traffic: '^Traffic source How the user got to your store listing#2', utm: '^UTM source The value of the utm_source', search: '^Search term The term the user searched', campaign: '^UTM campaign The value' };
const CUR = '^(Traffic source|UTM source|UTM campaign|Search term|Country / region|Store listing|Language) arrow_drop_down';   // 현재 차원 단추(펼치는 용도)
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await L.findPage(ts, /play\.google\.com\/console/, null);
await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});

const WALK = `const walk = (root, acc) => { const k = root.querySelectorAll ? root.querySelectorAll('*') : []; for (const e of k) { if (e.shadowRoot) walk(e.shadowRoot, acc); acc.push(e); } return acc; };`;
const anchors = () => page.evaluate(`(() => { ${WALK} return walk(document, []).filter((e) => e.tagName === 'A' && e.href).map((a) => ({ href: a.href, t: (a.innerText || a.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 50) })); })()`);
const clickHref = (src) => page.evaluate(`(() => { ${WALK} const rx = new RegExp(${JSON.stringify(src)}); const a = walk(document, []).find((e) => e.tagName === 'A' && e.href && rx.test(e.href)); if (!a) return null; a.scrollIntoView({ block: 'center' }); a.click(); return a.href; })()`);
// 보이는 «조작 요소»(버튼·콤보박스·탭·메뉴항목) 목록 — 글자·aria-label·위치(탐침용)
const controls = () => page.evaluate(`(() => { ${WALK}
  return walk(document, []).filter((e) => { const r = e.getAttribute && e.getAttribute('role'); return (e.tagName === 'BUTTON' || ['button','combobox','tab','listbox','option','menuitem','menuitemradio','checkbox','radio'].includes(r)) && e.getBoundingClientRect().width > 0; })
    .map((e) => { const b = e.getBoundingClientRect(); return { role: e.getAttribute('role') || e.tagName.toLowerCase(), t: ((e.innerText || '') + ' ' + (e.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').trim().slice(0, 70), x: Math.round(b.x), y: Math.round(b.y) }; })
    .filter((o) => o.t); })()`);
// 정규식에 맞는 «조작 요소»를 JS 로 누른다 — 글자는 공백 정규화·trim 뒤에 맞춘다(MISTAKES #45) · 뒤의 «#n» = n번째 일치(같은 글자 메뉴가 둘일 때)
const clickControl = (src0) => { const m = String(src0).match(/^(.*)#(\d+)$/); const src = m ? m[1] : src0; const nth = m ? Number(m[2]) - 1 : 0; return page.evaluate(`(() => { ${WALK} const rx = new RegExp(${JSON.stringify(src)}, 'i');
  const all = walk(document, []).filter((e) => { const r = e.getAttribute && e.getAttribute('role'); return (e.tagName === 'BUTTON' || ['button','combobox','tab','option','menuitem','menuitemradio','checkbox'].includes(r)) && e.getBoundingClientRect().width > 0 && rx.test(((e.innerText || '') + ' ' + (e.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').trim()); });
  const e = all[${nth}]; if (!e) return null; e.scrollIntoView({ block: 'center' }); e.click(); return ((e.innerText || '') + ' ' + (e.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').trim().slice(0, 80); })()`); };
const press = async (o) => { const c = await clickControl(o); out.steps.push({ open: o, clicked: c }); log('누름', c || ('못 찾음 ← ' + o.slice(0, 50))); await L.wait(cfg.wait || 3500); return c; };

// 데이터 표 읽기(섀도 DOM 포함) — 10행씩 쪽으로 나뉜다 → «다음 쪽»(읽기 전용 이동)
const readRows = () => page.evaluate(`(() => { ${WALK} const rs = walk(document, []).filter((e) => e.tagName === 'TR' || (e.getAttribute && e.getAttribute('role') === 'row'));
  return rs.map((r) => { const cells = [...(r.querySelectorAll ? r.querySelectorAll('td,th,[role=cell],[role=gridcell],[role=columnheader]') : [])].map((c) => (c.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean); return cells.length ? cells.join(' | ') : (r.innerText || '').replace(/\\s+/g, ' ').trim(); }).filter((t) => t && t.length < 400); })()`);
const nextPage = () => page.evaluate(`(() => { ${WALK} const b = walk(document, []).find((e) => (e.tagName === 'BUTTON' || (e.getAttribute && e.getAttribute('role') === 'button')) && /next page|다음 페이지/i.test(e.getAttribute('aria-label') || e.getAttribute('title') || '') && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && e.getBoundingClientRect().width > 0); if (!b) return false; b.click(); return true; })()`);
async function allRows() {
  let rows = await readRows(); const seen = new Set(rows);
  for (let i = 0; i < (cfg.pages || 6); i++) { const mv = await nextPage(); if (!mv) break; await L.wait(1800); const more = (await readRows()).filter((t) => !seen.has(t)); if (!more.length) break; more.forEach((t) => seen.add(t)); rows = rows.concat(more); }
  return rows;
}
// 요약 — «Days | Device… | 등록정보 열들» 머리줄로 열 이름을 잡아 날짜행 열 합계를 낸다(0 인 날은 «-» · 날짜행이 없으면 null = 판독 실패)
function summarize(rows, name) {
  const hdr = rows.find((t) => /^Days \| /.test(t) && !/countries \/ regions/.test(t));
  const heads = hdr ? hdr.split(' | ').slice(1) : [];
  const sums = {}; let days = 0, firstDay = null;
  for (const t of rows) {
    const mm = t.match(/^([A-Z][a-z]{2} \d{1,2}, \d{4}) Percentage of total \| (.*)$/); if (!mm) continue;
    days++; firstDay = firstDay || mm[1];
    mm[2].split(' | ').forEach((c, i) => { if (i < 1) return; const key = (heads[i] || ('열' + i)) + (i === 1 ? ' (전체)' : ''); const n = (c.match(/^(\d+)\b/) || [])[1]; sums[key] = (sums[key] || 0) + (n ? Number(n) : 0); });   // i=0 은 Device acquisition 열(이 지표가 아님)
  }
  if (!days) return null;
  return { preset: name, range: ((out.url || '').match(/dateRange=([0-9_\-]+)/) || [])[1] || '?', dayRowsWithData: days, newestDayInTable: firstDay, sums, head: hdr };
}

let u = await page.url();
if (!/statistics\?metrics=/.test(u) || cfg.fresh !== false) {   // 기본은 «처음부터»(이미 얹은 지표가 남은 화면에서 또 얹으면 꼬인다) — 탐침으로 이어서 볼 땐 "fresh":false
  try { await page.goto(APP + '/app-dashboard', { waitUntil: 'commit', timeout: 45000 }); } catch {}
  await L.wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {}
  await L.wait(9000);
  let links = await anchors();
  let stat = links.find((l) => /statistics\?metrics=DEVICE_ACQUISITION/.test(l.href));
  if (!stat) { await clickHref('/grow-overview|/grow-users|/grow'); await L.wait(9000); links = await anchors(); stat = links.find((l) => /statistics\?metrics=DEVICE_ACQUISITION/.test(l.href)); }
  log('통계 링크', stat ? '있음' : '없음');
  if (stat) { const c = await clickHref('statistics\\?metrics=DEVICE_ACQUISITION'); out.steps.push({ stat: c }); await L.wait(11000); }
  u = await page.url();
}
out.url = u; log('현재 주소', u.slice(0, 160));
if (/accounts\.google\.com|signin|ServiceLogin/.test(u)) { console.log('SESSION_EXPIRED — 대표(회사 구글) 로그인 필요. 판독 실패'); process.exit(0); }

if (cfg.href) { const c = await clickHref(cfg.href); out.steps.push({ href: cfg.href, clicked: c }); log('링크 클릭', c); await L.wait(cfg.wait || 9000); }
if (cfg.anchors) { const an = await anchors(); const rx = new RegExp(cfg.anchors, 'i'); out.anchors = an.filter((a) => rx.test(a.href) || rx.test(a.t)).slice(0, 60); console.log('ANCHORS ' + JSON.stringify(out.anchors)); }
for (const o of [].concat(cfg.open || [])) await press(o);   // 탐침 — 메뉴를 차례로 누른다

let failed = false;
if (cfg.presets) {
  // 지표 «Store listing acquisitions / All users» 를 한 번 얹는다(첫 차원은 이 단계에서 «현재 차원»이 그대로)
  for (const o of ['^Select another metric', '^Legacy Store listing performance arrow_right', '^Store listing acquisitions The number', '^All users All your new and returning users']) await press(o);
  for (const name of [].concat(cfg.presets)) {
    if (!DIM[name]) { log('모르는 차원', name); continue; }
    await press(CUR); await press(DIM[name]); await L.wait(5000);
    out.url = await page.url();
    const rows = await allRows(); out.rows = rows.slice(0, 200);
    const sm = summarize(rows, name);
    if (!sm) { failed = true; console.log(`판독 실패 — «${name}» 표에서 날짜행을 못 읽었다(0 이 아니다). 행 ${rows.length}`); continue; }
    out.summaries.push(sm); console.log('PLAY_LISTING_SUMMARY ' + JSON.stringify(sm));
  }
} else if (cfg.table) {
  out.rows = (await allRows()).slice(0, 200); console.log('ROWS ' + out.rows.length); for (const r of out.rows.slice(0, cfg.show || 40)) console.log('  ' + r.slice(0, 260));
}
if (!cfg.presets) {   // 탐침 모드: 화면의 조작 요소·머리 글자를 덤프
  const ctl = await controls(); out.controls = ctl.slice(0, 120);
  if (!cfg.table) { console.log('CONTROLS ' + ctl.length); for (const c of ctl.slice(0, 80)) console.log(`  ${c.role} (${c.x},${c.y}) ${c.t}`); }
}
out.url = await page.url();
try { await page.screenshot({ path: L.ioDir() + '/play-listing-acq.png' }); } catch (e) { log('스크린샷 실패', String(e && e.message).slice(0, 80)); }
fs.writeFileSync(L.ioDir() + '/play-listing-acq.json', JSON.stringify(out, null, 1));
console.log('ok=' + (!failed && (cfg.presets ? out.summaries.length > 0 : true)) + ' · 저장: ' + L.ioDir() + '/play-listing-acq.json');
