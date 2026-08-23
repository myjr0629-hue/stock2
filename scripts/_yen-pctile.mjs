#!/usr/bin/env node
// _yen-pctile — 「지금의 円安 기여분」이 역사적으로 드문 값인가. 백분위로 잰다.
//   ⛔ 게이트를 통과시키려고 재는 것이 아니다. 드물지 않으면 «드물지 않다»고 쓰고 각도를 바꾼다.
import { readFileSync } from 'node:fs';
const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1].trim();
const eod = async (s) => {
  const j = await (await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=2000-01-01&to=2026-08-22&apikey=${KEY}`)).json();
  return j.slice().sort((a, b) => a.date.localeCompare(b.date));
};
const [spy, fx] = await Promise.all([eod('SPY'), eod('USDJPY')]);
const m = new Map(fx.map((r) => [r.date, r.close]));
const rows = spy.filter((r) => m.has(r.date)).map((r) => ({ d: r.date, u: r.close, r: m.get(r.date) }));
console.log(`  겹치는 거래일 ${rows.length} · ${rows[0].d} → ${rows[rows.length-1].d}`);

for (const [name, W] of [['5년', 1260], ['3년', 756], ['10년', 2520]]) {
  if (rows.length <= W) { console.log(`  ${name}: 창이 데이터보다 길다 — 건너뜀`); continue; }
  const vals = [];
  for (let i = W; i < rows.length; i++) {
    const a = rows[i], b = rows[i - W];
    const xu = a.u / b.u, xj = (a.u * a.r) / (b.u * b.r);
    if (xu <= 0 || xj <= 0 || Math.abs(Math.log(xj)) < 1e-9) continue;
    vals.push({ d: a.d, s: (1 - Math.log(xu) / Math.log(xj)) * 100 });
  }
  const now = vals[vals.length - 1];
  const all = vals.map((v) => v.s).sort((x, y) => x - y);
  const pc = all.filter((x) => x <= now.s).length / all.length * 100;
  const med = all[Math.floor(all.length / 2)];
  const verdict = (pc <= 10 || pc >= 90) ? '✅ 드물다' : '⛔ 평범하다';
  console.log(`\n  ${name} 창 (${W}거래일) · 표본 ${all.length}개`);
  console.log(`   지금 ${now.s.toFixed(1)}%  ·  중앙 ${med.toFixed(1)}%  ·  백분위 ${pc.toFixed(1)}  ${verdict}`);
}
