/* Play 콘솔 «유입 경로별 취득(Device acquisitions)» 읽기 — 읽기 전용 (2026-10-05 11시 회차 신설)
 * 왜: 홍보 사이클의 «실적»(설치)은 iOS(ASC·RevenueCat)만 읽혔고, 사람 클릭이 많은 «안드로이드 설치»는 9/20 이후 한 번도 안 읽혔다
 *     (안드로이드 «Paid and direct»=우리 링크·광고 직접 유입. ★Play 표는 «7일 지연»이다 — 9/20 판독의 마지막 데이터가 9/13 이었고 10/5 판독은 9/28. 그래서 9/20 기준선 «8/23~9/19 Paid and direct 2»는 과소였다(같은 기간 지금 9/6~9/19 = 8). 최근 일자 = «미집계»≠0). android_install_banner·
 *     play_custom_listings 게이트가 «Play 콘솔 판독 스크립트 없음»으로 번번이 미판독이었다(10/3).
 * 실행: bash scripts/ego-run.sh scripts/ego/play/play-acquisitions.mjs 170   → 결과 ~/signum-ego-io/<KST>/play-acq-result.json (+ 화면 png)
 * 경로(실측 정본 — OUTREACH-LOG 9/20): Play 콘솔은 «주소를 지어내면 계정 페이지로 튕긴다» → 화면이 주는 <a href> 를 JS 로 찾아 .click().
 *       앱 대시보드 → (Grow users / grow-overview 링크) → statistics?metrics=DEVICE_ACQUISITION… 링크 → 페이지 맨 아래 Data table.
 * 읽기 전용 — 눌러서 이동만 한다(링크 .click() 뿐 · 저장/제출/변경 버튼·입력 없음). 못 읽으면 «판독 실패»로 찍는다(0 으로 적지 않는다, MISTAKES #18).
 */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const APP = 'https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116';
const T0 = Date.now(); const el = () => Math.round((Date.now() - T0) / 1000) + 's';
const log = (...a) => console.log(`[${el()}]`, ...a);
const out = { at: new Date().toISOString(), steps: [], ok: false };
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await L.findPage(ts, /play\.google\.com\/console/, null);
await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});

// 섀도 DOM 까지 훑어 <a> 목록(href·글자)을 돌려준다
const anchors = () => page.evaluate(() => {
  const walk = (root, acc) => { const k = root.querySelectorAll ? root.querySelectorAll('*') : []; for (const e of k) { if (e.shadowRoot) walk(e.shadowRoot, acc); acc.push(e); } return acc; };
  return walk(document, []).filter((e) => e.tagName === 'A' && e.href)
    .map((a) => ({ href: a.href, t: (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 50) }));
});
// href 에 정규식이 맞는 첫 <a> 를 JS 로 «누른다»(좌표 클릭은 허공에 떨어질 수 있다 — RUNBOOK §9-②)
const clickHref = (src) => page.evaluate((s) => {
  const rx = new RegExp(s);
  const walk = (root, acc) => { const k = root.querySelectorAll ? root.querySelectorAll('*') : []; for (const e of k) { if (e.shadowRoot) walk(e.shadowRoot, acc); acc.push(e); } return acc; };
  const a = walk(document, []).find((e) => e.tagName === 'A' && e.href && rx.test(e.href));
  if (!a) return null; a.scrollIntoView({ block: 'center' }); a.click(); return a.href;
}, src);

try { await page.goto(APP + '/app-dashboard', { waitUntil: 'commit', timeout: 45000 }); } catch {}
await L.wait(1500); try { const inf = await page.info(); if (inf && inf.dialog) await page.acceptDialog(); } catch {}
await L.wait(9000);
let u = await page.url();
log('대시보드 열림', u.slice(0, 120));
if (/accounts\.google\.com|signin|ServiceLogin/.test(u)) { console.log('SESSION_EXPIRED — 대표(회사 구글) 로그인 필요. 판독 실패'); out.fail = 'session'; fs.writeFileSync(L.ioDir() + '/play-acq-result.json', JSON.stringify(out)); process.exit(0); }

// ① 통계 링크가 대시보드에 바로 있으면 그것을, 없으면 Grow 링크를 먼저 누른다
let links = await anchors();
const pick = (rx) => links.find((l) => rx.test(l.href));
let stat = pick(/statistics\?metrics=DEVICE_ACQUISITION/);
log('대시보드 링크', links.length, '· 통계 링크', stat ? '있음' : '없음');
if (!stat) {
  const g = await clickHref('/grow-overview|/grow-users|/grow');
  out.steps.push({ grow: g });
  log('Grow 링크 클릭', g ? g.slice(0, 120) : '못 찾음');
  await L.wait(9000);
  links = await anchors();
  stat = pick(/statistics\?metrics=DEVICE_ACQUISITION/);
  log('Grow 화면 링크', links.length, '· 통계 링크', stat ? '있음' : '없음');
  if (!stat) out.sample = links.filter((l) => /statistics|grow|acqui|install/i.test(l.href)).slice(0, 12);
}
if (stat) {
  const c = await clickHref('statistics\\?metrics=DEVICE_ACQUISITION');
  out.steps.push({ stat: c });
  log('통계 링크 클릭', c ? c.slice(0, 160) : '못 찾음');
  await L.wait(11000);
}
u = await page.url(); out.url = u; log('현재 주소', u.slice(0, 160));

// ② 표 읽기 — role=row / tr 을 «셀 | 셀» 로(섀도 DOM 포함). 데이터 표는 10행씩 «쪽»으로 나뉜다 → «다음 쪽»(읽기 전용 이동)을 눌러 끝까지 읽는다
const readRows = () => page.evaluate(() => {
  const walk = (root, acc) => { const k = root.querySelectorAll ? root.querySelectorAll('*') : []; for (const e of k) { if (e.shadowRoot) walk(e.shadowRoot, acc); acc.push(e); } return acc; };
  const all = walk(document, []);
  const rs = all.filter((e) => e.tagName === 'TR' || e.getAttribute?.('role') === 'row');
  return rs.map((r) => {
    const cells = [...(r.querySelectorAll ? r.querySelectorAll('td,th,[role=cell],[role=gridcell],[role=columnheader]') : [])]
      .map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    return cells.length ? cells.join(' | ') : (r.innerText || '').replace(/\s+/g, ' ').trim();
  }).filter((t) => t && t.length < 300);
});
const nextPage = () => page.evaluate(() => {
  const walk = (root, acc) => { const k = root.querySelectorAll ? root.querySelectorAll('*') : []; for (const e of k) { if (e.shadowRoot) walk(e.shadowRoot, acc); acc.push(e); } return acc; };
  const b = walk(document, []).find((e) => (e.tagName === 'BUTTON' || e.getAttribute?.('role') === 'button')
    && /next page|다음 페이지/i.test(e.getAttribute('aria-label') || e.getAttribute('title') || '')
    && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && e.getBoundingClientRect().width > 0);
  if (!b) return false; b.click(); return true;
});
let rows = await readRows();
const seen = new Set(rows);
for (let i = 0; i < 6; i++) {            // 28일 = 최대 3쪽(0 인 날은 빠진다) — 여유로 6번까지
  const moved = await nextPage(); if (!moved) break;
  await L.wait(1800);
  const more = (await readRows()).filter((t) => !seen.has(t));
  if (!more.length) break;
  more.forEach((t) => seen.add(t)); rows = rows.concat(more);
}
out.rows = rows.slice(0, 120);
const head = await page.evaluate(() => {
  const walk = (root, acc) => { const k = root.querySelectorAll ? root.querySelectorAll('*') : []; for (const e of k) { if (e.shadowRoot) walk(e.shadowRoot, acc); acc.push(e); } return acc; };
  const leaf = walk(document, []).filter((e) => e.children && e.children.length === 0 && (e.innerText || '').trim().length > 0 && e.getBoundingClientRect().width > 0)
    .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim());
  return leaf.filter((t) => /Device acquisitions|Last \d+ days|Google Play (search|explore)|Paid and direct|Not attributed|Total|Traffic source|Data table|conversion rate|acquisitions/i.test(t)).slice(0, 40);
});
out.head = head;
try { await page.screenshot({ path: L.ioDir() + '/play-acq.png' }); } catch (e) { log('스크린샷 실패', String(e && e.message).slice(0, 80)); }

// ③ 요약 — «취득» 표(첫 칸에 «Percentage of total» 이 붙은 행)만 열별 합계. 칸은 «3 42.86%» 또는 «-» (0 인 날은 «-»)
const acq = rows.filter((t) => /^[A-Z][a-z]{2} \d{1,2}, \d{4} Percentage of total \|/.test(t));
const heads = (rows.find((t) => /^Days \| Google Play explore/.test(t)) || 'Days | Google Play explore | Paid and direct | Not attributed').split(' | ').slice(1);
const sums = Object.fromEntries(heads.map((h) => [h, 0])); const days = [];
for (const t of acq) {
  const [d, ...cells] = t.split(' | '); const day = d.replace(' Percentage of total', '');
  const n = cells.map((c) => { const m = c.match(/^(\d+)\b/); return m ? Number(m[1]) : 0; });
  heads.forEach((h, i) => { sums[h] += n[i] || 0; }); days.push({ day, n });
}
const range = (u.match(/dateRange=([0-9_\-]+)/) || [])[1] || '?';
const convDays = rows.filter((t) => /^[A-Z][a-z]{2} \d{1,2}, \d{4} \| [\d.]+% \|/.test(t)).map((t) => t.split(' | ').slice(0, 2));
out.summary = { range, sums, total: Object.values(sums).reduce((a, b) => a + b, 0), lastDataDay: days[0] && days[0].day, daysWithData: days.length, conv: convDays.slice(0, 3) };
out.ok = acq.length > 0;
out.dataRows = acq.slice(0, 60);
fs.writeFileSync(L.ioDir() + '/play-acq-result.json', JSON.stringify(out, null, 1));
console.log('PLAY_ACQ_HEAD ' + JSON.stringify(head));
console.log('PLAY_ACQ_ROWS ' + rows.length + ' · 취득 날짜행 ' + acq.length);
console.log('PLAY_ACQ_SUMMARY ' + JSON.stringify(out.summary));
for (const r of acq.slice(0, 40)) console.log('  ' + r);
if (!acq.length) console.log('판독 실패 — 취득 표를 못 읽었다(0 이 아니다). 주소·샘플: ' + JSON.stringify(out.sample || null));
console.log('저장: ' + L.ioDir() + '/play-acq-result.json');
