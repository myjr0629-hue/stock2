#!/usr/bin/env node
// ============================================================================
// edge-nvda-band — 「이번엔 얼마나 움직이나」를 «과거 분포» 로만 말한다
// ----------------------------------------------------------------------------
// ⛔ 예측이 아니다. 「최근 N회가 어느 폭에 들어왔는가」 라는 «과거 사실» 이다.
//   그 구분을 대본에서도 지킨다 — 「이만큼 움직인다」가 아니라
//   「최근 8회 중 7회가 이 폭 안이었다」 로만 쓴다.
//
// ── 사전등록 ────────────────────────────────────────────────────────────────
//   최근 8회·12회의 실적 다음날 |수익률| 분포에서 중앙·최소·최대·분위수를 낸다
//   그리고 «방향» 은 세지 않는다 (이미 SCRIPT_JPEARN 이 다뤘고, 여기서 섞으면 중복이다)
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1].trim();
const get = async (u) => (await (await fetch(u + '&apikey=' + KEY)).json());
const er = (await get('https://financialmodelingprep.com/stable/earnings?symbol=NVDA&limit=60'))
  .filter((x) => x.epsActual !== null).map((x) => x.date).sort();
const nv = (await get('https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=NVDA&from=2015-01-01&to=2026-08-22'))
  .slice().sort((a, b) => a.date.localeCompare(b.date));

const ev = [];
for (const d of er) {
  const k = nv.findIndex((r) => r.date > d);
  if (k > 0) ev.push({ d, day: nv[k].date, r: (nv[k].close / nv[k - 1].close - 1) * 100 });
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

const out = { asof: nv[nv.length - 1].date, last: nv[nv.length - 1].close, spans: {} };
for (const n of [8, 12, 20]) {
  const w = ev.slice(-n), abs = w.map((x) => Math.abs(x.r));
  const band = q(abs, 0.9);
  out.spans[n] = {
    n, median: +q(abs, 0.5).toFixed(2), min: +Math.min(...abs).toFixed(2), max: +Math.max(...abs).toFixed(2),
    p90: +band.toFixed(2), within: w.filter((x) => Math.abs(x.r) <= band).length,
    up: w.filter((x) => x.r > 0).length,
  };
  const o = out.spans[n];
  console.log(`\n  최근 ${n}회 · 실적 다음날 절대변동`);
  console.log(`   중앙 ${o.median}%  ·  최소 ${o.min}%  ·  최대 ${o.max}%`);
  console.log(`   상위10% 경계 ${o.p90}% — ${o.within}/${n} 회가 이 안에 들어왔다`);
  console.log(`   상승 ${o.up}/${n} (방향은 이 편에서 쓰지 않는다)`);
}
out.recent = ev.slice(-8).map((x) => ({ d: x.d, day: x.day, r: +x.r.toFixed(2) }));
console.log('\n  최근 8회 실제 수익률');
for (const x of out.recent) console.log(`   ${x.d} → ${x.day}  ${x.r > 0 ? '+' : ''}${x.r}%`);
writeFileSync('.agent/_nvda_band.json', JSON.stringify(out, null, 2));
console.log('\n  → .agent/_nvda_band.json');
