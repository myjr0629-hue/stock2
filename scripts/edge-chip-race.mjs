#!/usr/bin/env node
// ============================================================================
// edge-chip-race — 미국 레이스 편용 실측 (2026-08-24)
// ----------------------------------------------------------------------------
// ⛔ 왜 레이스인가 (2026-08-24 실측)
//   미국 33편을 포맷으로 가르면: 레이스/스탯 4편 중앙 345.5 · 브리핑 29편 중앙 41 = 8.4배
//   같은 날(08-22) 브리핑 5·14·21회 vs 레이스 344·630회 — 126배.
// ⛔ 왜 이 소재인가
//   제목 수요 앵커별 중앙: 수요0 → 41.5 · 5천~2만 → 266.5 · 2만+ → 14
//   ⇒ «골디락스 구간» 은 5천~2만. chip stocks = 8,724 가 정확히 거기다.
//   ⇒ 2만+ (interest rates 48,195 등) 는 대형 매체와 정면충돌해 최하위였다.
//
// ── 사전등록 ────────────────────────────────────────────────────────────────
//   대상  NVDA · AMD · AVGO (AI 칩 3사)
//   기간  최근 «1년» (2025-08-22 ~ 2026-08-21) — 엔비디아 실적(8/26) 직전 시점
//   지표  1만 달러를 넣었으면 지금 얼마인가 (분할·배당 조정 종가)
//   ⛔ 예측하지 않는다. 확정된 과거 사실만 나란히 놓는다.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1].trim();
const eod = async (s, from) => {
  const j = await (await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=${from}&to=2026-08-22&apikey=${KEY}`)).json();
  return j.slice().sort((a, b) => a.date.localeCompare(b.date));
};
const SYMS = ['NVDA', 'AMD', 'AVGO'];
const data = {};
for (const s of SYMS) data[s] = await eod(s, '2025-08-01');

// 공통 거래일만 쓴다
const common = data.NVDA.map((r) => r.date).filter((d) => SYMS.every((s) => data[s].some((r) => r.date === d)));
const start = common.find((d) => d >= '2025-08-22');
const end = common[common.length - 1];
const px = (s, d) => data[s].find((r) => r.date === d).close;

console.log(`  기간 ${start} → ${end} · 공통 거래일 ${common.filter((d) => d >= start).length}일`);
const out = { start, end, seed: 10000, rows: [], final: {} };
for (const s of SYMS) {
  const v = 10000 * (px(s, end) / px(s, start));
  out.final[s] = { start: px(s, start), end: px(s, end), value: Math.round(v), x: +(v / 10000).toFixed(3) };
  console.log(`   ${s.padEnd(5)} $${px(s, start).toFixed(2)} → $${px(s, end).toFixed(2)}  =  $${Math.round(v).toLocaleString()}  (${(v / 10000).toFixed(2)}배)`);
}

// 월별 궤적 (레이스 애니메이션용)
const months = [];
for (const d of common.filter((x) => x >= start)) {
  const m = d.slice(0, 7);
  if (!months.length || months[months.length - 1].m !== m) months.push({ m, d });
  else months[months.length - 1].d = d;
}
out.rows = months.map((x) => {
  const o = { label: x.m };
  for (const s of SYMS) o[s] = Math.round(10000 * (px(s, x.d) / px(s, start)));
  return o;
});
console.log(`\n  궤적 ${out.rows.length}점`);
console.log('   ' + out.rows.map((r) => r.label.slice(2)).join(' '));
for (const s of SYMS) console.log(`   ${s.padEnd(5)} ` + out.rows.map((r) => String(Math.round(r[s] / 1000)) + 'k').join(' '));

// 최고·최저 시점 (「그 길에 무엇이 있었나」)
for (const s of SYMS) {
  const seq = common.filter((d) => d >= start).map((d) => px(s, d));
  let peak = seq[0], mdd = 0, at = '';
  common.filter((d) => d >= start).forEach((d, i) => {
    if (seq[i] > peak) peak = seq[i];
    const dd = seq[i] / peak - 1;
    if (dd < mdd) { mdd = dd; at = d; }
  });
  out.final[s].mdd = +(mdd * 100).toFixed(1);
  out.final[s].mddAt = at;
  console.log(`   ${s} 최대낙폭 ${(mdd * 100).toFixed(1)}% (${at})`);
}
writeFileSync('.agent/_chip_race.json', JSON.stringify(out, null, 2));
console.log('\n  → .agent/_chip_race.json');
