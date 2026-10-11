#!/usr/bin/env node
/**
 * check-earnings-week — /[locale]/earnings-week 의 숫자를 «운영 API 값»과 대조한다 (2026-10-11)
 * ============================================================================
 * 사용:  node scripts/check-earnings-week.mjs [--base https://www.signumhq.com] [--locales ko,ja,en]
 * 한다:  ① 페이지 HTML 의 행(data-ticker·data-implied·data-expiry·data-maxpain·data-callwall·data-putfloor)을 읽는다
 *        ② 같은 종목을 GET /api/options/implied-move?tickers=T&after=<발표일>&timing=<amc|bmo|unknown> 와 GET /api/live/options/structure?t=T 로 다시 읽어
 *           예상 변동·만기·Max Pain·Call Wall·Put Floor 가 같은지 본다(예상 변동은 정확히, 레벨은 정확히)
 *        ③ 세 언어가 같은 숫자를 싣는지 본다 · 공지 목록(CONFIRMED_EARNINGS)의 이번 주 종목이 모두 행으로 있는지 본다
 * 종료 코드: 어긋남이 하나라도 있으면 1. 키·토큰을 쓰지 않는다(공개 GET 만).
 * 참고: 페이지·API 가 «다른 순간»에 읽으면 장중엔 값이 움직일 수 있다 — 어긋나면 한 번 더 돌려 본다(장외엔 거의 항상 같다).
 * ============================================================================
 */
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const base = arg('--base', 'https://www.signumhq.com').replace(/\/$/, '');
const locales = arg('--locales', 'ko,ja,en').split(',');
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };

const get = async (url) => { const r = await fetch(url, { headers: UA }); return { status: r.status, text: await r.text() }; };
const attr = (s, k) => { const m = new RegExp(`${k}="([^"]*)"`).exec(s); return m ? m[1] : ''; };
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

function parseRows(html) {
  const out = [];
  for (const m of html.matchAll(/<li class="ew-row"([^>]*)>/g)) {
    const a = m[1];
    out.push({
      ticker: attr(a, 'data-ticker'), date: attr(a, 'data-date'), hour: attr(a, 'data-hour'), phase: attr(a, 'data-phase'),
      implied: numOrNull(attr(a, 'data-implied')), expiry: attr(a, 'data-expiry') || null, spot: numOrNull(attr(a, 'data-spot')),
      maxPain: numOrNull(attr(a, 'data-maxpain')), callWall: numOrNull(attr(a, 'data-callwall')), putFloor: numOrNull(attr(a, 'data-putfloor')),
    });
  }
  return out;
}

let bad = 0;
const fail = (m) => { bad += 1; console.log(`  ✗ ${m}`); };
const pages = {};
for (const loc of locales) {
  const r = await get(`${base}/${loc}/earnings-week`);
  console.log(`${loc}: http ${r.status} · ${r.text.length} bytes`);
  if (r.status !== 200) { fail(`${loc} 페이지 ${r.status}`); continue; }
  pages[loc] = parseRows(r.text);
  const og = /<meta property="og:image" content="([^"]+)"/.exec(r.text)?.[1];
  console.log(`  행 ${pages[loc].length} · og:image ${og ? 'O' : 'X'} ${og || ''}`);
  if (!og) fail(`${loc} og:image 없음`);
}

const first = pages[locales[0]] || Object.values(pages)[0] || [];
// ③ 세 언어 같은 숫자
for (const [loc, rows] of Object.entries(pages)) {
  if (rows.length !== first.length) fail(`${loc}: 행 수 ${rows.length} ≠ ${first.length}`);
  for (const r of rows) {
    const f = first.find((x) => x.ticker === r.ticker);
    if (!f) { fail(`${loc}: ${r.ticker} 가 다른 언어에 없다`); continue; }
    for (const k of ['date', 'hour', 'implied', 'expiry', 'maxPain', 'callWall', 'putFloor', 'spot']) {
      if (f[k] !== r[k]) fail(`${loc} ${r.ticker}.${k}: ${r[k]} ≠ ${f[k]}`);
    }
  }
}

// ② 운영 API 와 대조
const timingOf = (h) => (h === 'bmo' ? 'bmo' : h === 'amc' ? 'amc' : 'unknown');
let compared = 0;
for (const r of first) {
  const im = await get(`${base}/api/options/implied-move?tickers=${r.ticker}&after=${r.date}&timing=${timingOf(r.hour)}`);
  const st = await get(`${base}/api/live/options/structure?t=${r.ticker}`);
  let ij = null, sj = null;
  try { ij = JSON.parse(im.text).results?.[0]; } catch { /* */ }
  try { const j = JSON.parse(st.text); sj = j.data ?? j; } catch { /* */ }
  const line = [];
  if (r.phase === 'done') { console.log(`  ${r.ticker.padEnd(5)} 발표 완료 — 예상 변동 칸 없음(대조 생략)`); }
  else if (!ij) fail(`${r.ticker}: implied-move API 응답 없음 (http ${im.status})`);
  else {
    compared += 1;
    const pageImp = r.implied, apiImp = ij.impliedMovePct ?? null;
    if (pageImp !== apiImp) fail(`${r.ticker}: 예상 변동 페이지 ${pageImp} ≠ API ${apiImp}`);
    if ((r.expiry || null) !== (ij.expiry ?? null)) fail(`${r.ticker}: 만기 페이지 ${r.expiry} ≠ API ${ij.expiry}`);
    if (pageImp != null && r.spot !== ij.spot) fail(`${r.ticker}: 기준가 페이지 ${r.spot} ≠ API ${ij.spot}`);
    line.push(`예상 ${pageImp ?? '—'}=${apiImp ?? '—'} (${r.expiry || '—'})`);
  }
  if (sj) {
    const apiLv = { maxPain: sj.maxPain ?? null, callWall: sj.levels?.callWall ?? null, putFloor: sj.levels?.putFloor ?? null };
    for (const k of ['maxPain', 'callWall', 'putFloor']) {
      // 표시 게이트가 지운 값(정의 밖)이면 페이지는 null — API(원본 구조)는 값이 있을 수 있다. 값이 있을 땐 같아야 한다.
      if (r[k] != null && r[k] !== apiLv[k]) fail(`${r.ticker}.${k}: 페이지 ${r[k]} ≠ 구조 API ${apiLv[k]}`);
      if (r[k] == null && apiLv[k] != null) line.push(`${k} 페이지 비움(구조 API ${apiLv[k]} — 표시 게이트 확인)`);
    }
    line.push(`MP ${r.maxPain ?? '—'}/CW ${r.callWall ?? '—'}/PF ${r.putFloor ?? '—'}`);
  } else fail(`${r.ticker}: 구조 API 응답 없음 (http ${st.status})`);
  if (r.phase !== 'done') console.log(`  ${r.ticker.padEnd(5)} ${line.join(' · ')}`);
}

// ③ 공지 목록과 행 대조
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const path = await import('node:path');
const { fileURLToPath } = await import('node:url');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node', esModuleInterop: true } });
const { CONFIRMED_EARNINGS } = require(path.join(ROOT, 'src/lib/earningsConfirmed.ts'));
const weekStart = /data-week-start="([^"]+)"/.exec((await get(`${base}/${locales[0]}/earnings-week`)).text)?.[1];
if (weekStart) {
  const end = new Date(Date.parse(`${weekStart}T12:00:00Z`) + 4 * 86400000).toISOString().slice(0, 10);
  const want = CONFIRMED_EARNINGS.filter((c) => c.date >= weekStart && c.date <= end).map((c) => `${c.ticker}@${c.date}`).sort();
  const have = first.map((r) => `${r.ticker}@${r.date}`).sort();
  if (JSON.stringify(want) !== JSON.stringify(have)) fail(`공지 목록(${weekStart}~${end}) ${want.length}건 ≠ 페이지 ${have.length}건\n      목록 ${want.join(',')}\n      페이지 ${have.join(',')}`);
  else console.log(`공지 목록 ${weekStart}~${end}: ${want.length}건 = 페이지 행`);
}
console.log(bad ? `\n어긋남 ${bad}건` : `\n전부 일치 — 예상 변동 ${compared}종목 · 언어 ${Object.keys(pages).join('·')}`);
process.exit(bad ? 1 : 0);
