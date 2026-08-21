#!/usr/bin/env node
// ============================================================================
// edge-earnings — 「실적 발표일에 주가는 실제로 얼마나 움직이나」
// ----------------------------------------------------------------------------
// ★ 네 칸
//   ① 사건    NVDA 실적 2026-08-26 (FMP stable/earnings 확인 · 과거 간격 91~98일로 교차검증)
//   ② 영향경로 실적 전에는 옵션이 «예상 변동폭»을 값으로 매긴다. 사람들은 그 값을 안 보고
//             「오를까 내릴까」만 본다. 실제 분포를 보면 방향보다 «폭»이 이야기다.
//   ③ 우리수치 여기서 계산 — 실적일 변동폭 vs 평상일, 그리고 «방향은 예측 가능한가»
//   ④ 기준선   계산 후
//
//   문: 🇯🇵 決算 見方 1,964 · 여지 88%  ·  エヌビディア 14,658
//
// ── 사전등록 ─────────────────────────────────────────────────────────────────
//   대상   NVDA · AMD · MU · AVGO · AAPL · MSFT · GOOGL · AMZN · META · TSLA
//   기간   2021-01-01 ~ 2026-08-20
//   정의   «실적일 반응» = 실적 발표 «다음» 거래일의 종가 수익률 (장마감 후 발표가 대부분)
//   지표   ① |수익률| 평균 vs 평상일   ② 방향(상승) 비율 — 동전 던지기와 다른가
//   검정   ① 웰치 t   ② 이항 검정 (50% 대비)
//   ⛔ 「오른다/내린다」를 맞히려는 게 아니다. «맞힐 수 없다»가 결론이면 그대로 쓴다.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1];
const SYMS = ['NVDA', 'AMD', 'MU', 'AVGO', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];
const FROM = '2021-01-01', TO = '2026-08-20';

const j = async (u) => { const t = await (await fetch(u)).text(); return t.startsWith('[') || t.startsWith('{') ? JSON.parse(t) : null; };

const rows = [], byS = {};
for (const s of SYMS) {
  const bars = await j(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=${FROM}&to=${TO}&apikey=${KEY}`);
  const earn = await j(`https://financialmodelingprep.com/stable/earnings?symbol=${s}&apikey=${KEY}`);
  if (!Array.isArray(bars) || !Array.isArray(earn)) { console.log(`  x ${s}`); continue; }
  const b = bars.slice().reverse();
  const idx = Object.fromEntries(b.map((x, i) => [x.date, i]));
  const ret = (i) => b[i].close / b[i - 1].close - 1;

  const eDates = earn.map((e) => e.date).filter((d) => d >= FROM && d <= TO);
  const reactIdx = new Set();
  for (const d of eDates) {
    // 발표일 «다음» 거래일. 그날이 거래일이 아니면 그 뒤 첫 거래일.
    let k = idx[d];
    if (k === undefined) { const after = b.findIndex((x) => x.date > d); if (after < 1) continue; k = after - 1; }
    if (k + 1 < b.length) reactIdx.add(k + 1);
  }
  const react = [], normal = [];
  for (let i = 1; i < b.length; i++) (reactIdx.has(i) ? react : normal).push(ret(i));
  if (react.length < 8) { console.log(`  x ${s} 실적 표본 ${react.length}`); continue; }

  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  const aR = react.map(Math.abs), aN = normal.map(Math.abs);
  const t = (mean(aR) - mean(aN)) / Math.sqrt(sd(aR) ** 2 / aR.length + sd(aN) ** 2 / aN.length);
  const up = react.filter((x) => x > 0).length;
  byS[s] = { n: react.length, reactAbs: +(mean(aR) * 100).toFixed(2), normalAbs: +(mean(aN) * 100).toFixed(2),
    ratio: +(mean(aR) / mean(aN)).toFixed(2), t: +t.toFixed(2), up, upPct: +(up / react.length * 100).toFixed(1) };
  rows.push({ s, ...byS[s] });
  console.log(`  ${s.padEnd(6)} 실적 ${String(byS[s].n).padStart(2)}회  변동폭 ${String(byS[s].reactAbs).padStart(5)}% vs 평상 ${String(byS[s].normalAbs).padStart(5)}%  (${byS[s].ratio}배, t=${byS[s].t})  상승 ${byS[s].upPct}%`);
}

const totN = rows.reduce((a, r) => a + r.n, 0);
const totUp = rows.reduce((a, r) => a + r.up, 0);
const wR = rows.reduce((a, r) => a + r.reactAbs * r.n, 0) / totN;
const wN = rows.reduce((a, r) => a + r.normalAbs * r.n, 0) / totN;
// 이항 정규근사
const z = (totUp - totN / 2) / Math.sqrt(totN * 0.25);

console.log(`\n  ══ 전체 ══`);
console.log(`   실적 반응일 ${totN}회 · 평균 변동폭 ${wR.toFixed(2)}%`);
console.log(`   평상일           평균 변동폭 ${wN.toFixed(2)}%`);
console.log(`   배수 ${(wR / wN).toFixed(2)}배`);
console.log(`\n   ── 방향은 맞힐 수 있는가 ──`);
console.log(`   상승 ${totUp}/${totN} = ${(totUp / totN * 100).toFixed(1)}%   z = ${z.toFixed(2)}`);
console.log(`   판정  ${Math.abs(z) > 1.96 ? '✔ 동전 던지기와 다르다' : '⛔ 동전 던지기와 «구별되지 않는다» — 방향은 못 맞힌다'}`);
console.log(`\n  ⇒ 실적일은 «폭»이 ${(wR / wN).toFixed(1)}배지만 «방향»은 ${(totUp / totN * 100).toFixed(0)}% 로 반반이다.`);

writeFileSync('.agent/_edge_earnings.json', JSON.stringify({
  preregistered: { syms: SYMS, from: FROM, to: TO, define: '실적 발표 다음 거래일 종가 수익률',
    tests: ['|수익률| 웰치 t', '상승 비율 이항검정'] },
  rows, all: { n: totN, reactAbs: +wR.toFixed(2), normalAbs: +wN.toFixed(2), ratio: +(wR / wN).toFixed(2), up: totUp, upPct: +(totUp / totN * 100).toFixed(1), z: +z.toFixed(2) },
}, null, 1));
console.log('\n  → .agent/_edge_earnings.json\n');
