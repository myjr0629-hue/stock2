const fs = require('fs');
const XS = JSON.parse(fs.readFileSync('/tmp/ego/xs-data.json', 'utf8'));
const V8 = JSON.parse(fs.readFileSync('/tmp/ego/v8-data.json', 'utf8'));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length; const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const sessions = [...new Set(XS.map(r => r.d))].sort();
const allSessions = sessions.concat([...new Set(V8.map(r => r.d))].filter(d => /^2026-09-0[1-4]$/.test(d))).sort();
const sIdx = new Map(allSessions.map((d, i) => [d, i]));
const closes = new Map(); for (const r of XS) { if (!(r.c > 0)) continue; if (!closes.has(r.t)) closes.set(r.t, new Map()); closes.get(r.t).set(r.d, r.c); }
for (const r of V8) { if (!(r.c > 0) || !closes.has(r.t)) continue; const m = closes.get(r.t); if (!m.has(r.d)) m.set(r.d, r.c); }
const byDate = new Map(); for (const r of XS) { if (!byDate.has(r.d)) byDate.set(r.d, []); byDate.get(r.d).push(r); }
const ALIVE = ['revRet3', 'revChg', 'smaExt', 'squeeze'];
const comp = r => { let s = 0, n = 0; for (const k of ALIVE) { const z = r.z && r.z[k]; if (typeof z === 'number') { s += z; n++; } } return n >= 2 ? s / n : null; };
const cost = m => m > 5e10 ? 0.001 : m > 1e10 ? 0.002 : m > 2e9 ? 0.004 : 0.01;
// EMA(0.4) of 4-alive per ticker (turnover control)
const ema = new Map(), emaS = new Map(); for (const d of sessions) for (const r of byDate.get(d)) { const c = comp(r); if (typeof c !== 'number') continue; const p = ema.get(r.t); const e = p == null ? c : 0.4 * c + 0.6 * p; ema.set(r.t, e); emaS.set(r.t + '|' + d, e); }
// period return of a basket: enter at close of d (proxy: signal day close; real entry next open), exit at close of d+h; market-adjusted by universe mean; cost applied once per round trip
function simulate(scoreFn, filter, h, topFrac, label) {
  const per = []; // per-signal-day basket return
  for (const d of sessions) {
    const i = sIdx.get(d), dh = allSessions[i + h]; if (!dh) continue;
    const rows = byDate.get(d).filter(r => (!filter || filter(r)) && typeof scoreFn(r, d) === 'number');
    const uni = []; for (const r of byDate.get(d)) { const m = closes.get(r.t), ch = m && m.get(dh); if (ch > 0 && r.c > 0 && Math.abs(ch / r.c - 1) < 1.5) uni.push(ch / r.c - 1); }
    if (rows.length < 100 || uni.length < 100) continue; const mkt = mean(uni);
    const sorted = rows.slice().sort((a, b) => scoreFn(b, d) - scoreFn(a, d)); const k = Math.max(5, Math.floor(sorted.length * topFrac)); const top = sorted.slice(0, k);
    const rets = []; for (const r of top) { const m = closes.get(r.t), ch = m && m.get(dh); if (!(ch > 0)) continue; const f = ch / r.c - 1; if (Math.abs(f) > 1.5) continue; rets.push({ gross: f, adj: f - mkt, net: f - mkt - cost(r.m) }); }
    if (rets.length < 5) continue; per.push({ d, n: rets.length, gross: mean(rets.map(x => x.gross)), adj: mean(rets.map(x => x.adj)), net: mean(rets.map(x => x.net)), mkt });
  }
  // tranche equity curve: capital split into h tranches, each tranche rolls every h days → daily NAV ≈ average of overlapping baskets
  const nav = [1]; for (let i = 0; i < per.length; i++) { /* approximate: each period return realized 1/h per day over h days */ }
  const netR = per.map(p => p.net), adjR = per.map(p => p.adj), grossR = per.map(p => p.gross);
  const ann = x => Math.pow(1 + mean(x), 252 / h) - 1; const sharpe = x => (mean(x) / sd(x)) * Math.sqrt(252 / h);
  // overlapping-tranche equity: NAV_t+1 = NAV_t * (1 + mean of the h most recent period returns / h) — approximates h tranches each holding one basket
  let N = 1, peak = 1, mdd = 0; const curve = []; for (let i = 0; i < per.length; i++) { const win = per.slice(Math.max(0, i - h + 1), i + 1); const dr = mean(win.map(p => p.net)) / h; N *= 1 + dr; peak = Math.max(peak, N); mdd = Math.min(mdd, N / peak - 1); curve.push(N); }
  console.log(`${label.padEnd(38)} periods=${per.length} names/basket≈${Math.round(mean(per.map(p => p.n)))} | gross ${(mean(grossR) * 100).toFixed(2)}%/p | mkt-adj ${(mean(adjR) * 100).toFixed(2)}%/p | NET mkt-adj ${(mean(netR) * 100).toFixed(2)}%/p  win ${netR.filter(x => x > 0).length}/${netR.length} (${(netR.filter(x => x > 0).length / netR.length * 100).toFixed(0)}%) | ann.net(mkt-adj) ${(ann(netR) * 100).toFixed(0)}%  Sharpe ${sharpe(netR).toFixed(2)} | tranche NAV ${N.toFixed(3)} MDD ${(mdd * 100).toFixed(1)}% | mkt/p ${(mean(per.map(p => p.mkt)) * 100).toFixed(2)}%`);
  return per;
}
console.log('=== Long-only top basket, hold h sessions, market-adjusted, round-trip cost by cap tier (>$50B 10bp / >$10B 20bp / >$2B 40bp / <$2B 100bp). Periods are overlapping signal days (07-06..08-31). ===');
const TU = r => r.m >= 2e9 && r.c >= 5, BIG = r => r.m >= 1e10;
simulate(r => r.xs, TU, 3, 0.1, 'A. shipped xs, TU, top10%, T+3');
simulate(r => r.xs, TU, 3, 10 / 620, 'A2. shipped xs, TU, top10 names, T+3 (=paper)');
simulate(r => emaS.get(r.t + '|' + r.d) ?? null, TU, 5, 0.1, 'B. 4-alive EMA, TU, top10%, T+5');
simulate(r => emaS.get(r.t + '|' + r.d) ?? null, BIG, 5, 0.1, 'C. 4-alive EMA, >=$10B, top10%, T+5');
simulate(r => comp(r), BIG, 5, 0.1, 'C2. 4-alive raw, >=$10B, top10%, T+5');
simulate(r => emaS.get(r.t + '|' + r.d) ?? null, BIG, 5, 0.2, 'C3. 4-alive EMA, >=$10B, top20%, T+5');
simulate(r => comp(r), TU, 5, 0.05, 'D. 4-alive raw, TU, top5%, T+5');
console.log('\n=== Long-short (top decile minus bottom decile), market-neutral, T+5, cost both legs ===');
function ls(scoreFn, filter, h, label) { const per = []; for (const d of sessions) { const i = sIdx.get(d), dh = allSessions[i + h]; if (!dh) continue; const rows = byDate.get(d).filter(r => (!filter || filter(r)) && typeof scoreFn(r, d) === 'number'); if (rows.length < 100) continue; const s = rows.slice().sort((a, b) => scoreFn(a, d) - scoreFn(b, d)); const k = Math.floor(s.length / 10); const ret = r => { const m = closes.get(r.t), ch = m && m.get(dh); if (!(ch > 0)) return null; const f = ch / r.c - 1; return Math.abs(f) < 1.5 ? f - cost(r.m) : null; }; const lo = s.slice(0, k).map(ret).filter(x => x != null), hi = s.slice(-k).map(ret).filter(x => x != null); if (lo.length < 5 || hi.length < 5) continue; per.push(mean(hi) - mean(lo)); } console.log(`${label.padEnd(38)} periods=${per.length} NET L-S ${(mean(per) * 100).toFixed(2)}%/p win ${per.filter(x => x > 0).length}/${per.length} (${(per.filter(x => x > 0).length / per.length * 100).toFixed(0)}%) ann ${((Math.pow(1 + mean(per), 252 / h) - 1) * 100).toFixed(0)}% Sharpe ${((mean(per) / sd(per)) * Math.sqrt(252 / h)).toFixed(2)}`); }
ls(r => r.xs, TU, 3, 'shipped xs TU T+3');
ls(r => emaS.get(r.t + '|' + r.d) ?? null, TU, 5, '4-alive EMA TU T+5');
ls(r => emaS.get(r.t + '|' + r.d) ?? null, BIG, 5, '4-alive EMA >=$10B T+5');
