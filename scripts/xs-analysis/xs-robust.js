const fs = require('fs');
const XS = JSON.parse(fs.readFileSync('/tmp/ego/xs-data.json', 'utf8'));
const V8 = JSON.parse(fs.readFileSync('/tmp/ego/v8-data.json', 'utf8'));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length; const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function rank(arr) { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
function pearson(x, y) { const n = x.length; if (n < 5) return null; const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null; }
const spearman = (x, y) => pearson(rank(x), rank(y));
function nwT(s, lag) { const n = s.length, m = mean(s), e = s.map(v => v - m); let v = mean(e.map(x => x * x)); for (let l = 1; l <= lag; l++) { const w = 1 - l / (lag + 1); let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l]; v += 2 * w * g / n; } return m / Math.sqrt(v / n); }
const sessions = [...new Set(XS.map(r => r.d))].sort();
const allSessions = sessions.concat([...new Set(V8.map(r => r.d))].filter(d => /^2026-09-0[1-4]$/.test(d))).sort();
const sIdx = new Map(allSessions.map((d, i) => [d, i]));
const closes = new Map(); for (const r of XS) { if (!(r.c > 0)) continue; if (!closes.has(r.t)) closes.set(r.t, new Map()); closes.get(r.t).set(r.d, r.c); }
for (const r of V8) { if (!(r.c > 0) || !closes.has(r.t)) continue; const m = closes.get(r.t); if (!m.has(r.d)) m.set(r.d, r.c); }
const byDate = new Map(); for (const r of XS) { if (!byDate.has(r.d)) byDate.set(r.d, []); byDate.get(r.d).push(r); }
function labelsFor(h) { const out = new Map(); for (const d of sessions) { const i = sIdx.get(d), dh = allSessions[i + h]; if (!dh) continue; const tmp = []; for (const r of byDate.get(d)) { const m = closes.get(r.t), ch = m && m.get(dh); if (!(ch > 0) || !(r.c > 0)) continue; const f = ch / r.c - 1; if (Math.abs(f) > 1.5) continue; tmp.push({ r, f }); } if (tmp.length < 100) continue; const mu = mean(tmp.map(x => x.f)); out.set(d, tmp.map(x => ({ r: x.r, adj: x.f - mu }))); } return out; }
const L3 = labelsFor(3), L5 = labelsFor(5);
const ALIVE = ['revRet3', 'revChg', 'smaExt', 'squeeze'];
const comp = (r, ks) => { let s = 0, n = 0; for (const k of ks) { const z = r.z && r.z[k]; if (typeof z === 'number') { s += z; n++; } } return n >= 2 ? s / n : null; };
const cost = m => m > 5e10 ? 0.001 : m > 1e10 ? 0.002 : m > 2e9 ? 0.004 : 0.01;
function evalScore(scoreFn, labels, filter, topN) { const ics = [], d9 = [], net = []; for (const [d, rows] of labels) { const use = rows.filter(x => !filter || filter(x.r)); const sc = use.map(x => scoreFn(x.r, d)); const ok = sc.map(v => typeof v === 'number' && !Number.isNaN(v)); const s = sc.filter((_, i) => ok[i]), u = use.filter((_, i) => ok[i]); if (s.length < 100) continue; ics.push(spearman(s, u.map(x => x.adj))); const order = s.map((v, i) => i).sort((i, j) => s[j] - s[i]); const k = Math.floor(order.length / 10); d9.push(mean(order.slice(0, k).map(i => u[i].adj))); const top = order.slice(0, topN || 10); net.push(mean(top.map(i => u[i].adj - cost(u[i].r.m)))); } return { days: ics.length, ic: mean(ics), icT: nwT(ics, 2), icir: mean(ics) / sd(ics), pos: ics.filter(x => x > 0).length / ics.length, d9: mean(d9) * 100, d9T: nwT(d9, 2), net: mean(net) * 100, netT: nwT(net, 2), netPos: net.filter(x => x > 0).length / net.length, ics }; }
const P = (lab, s) => console.log(lab.padEnd(52), `days=${s.days} IC=${s.ic.toFixed(4)} NWt=${s.icT.toFixed(2)} ICIR=${s.icir.toFixed(2)} pos=${(s.pos * 100).toFixed(0)}% | D9=${s.d9 >= 0 ? '+' : ''}${s.d9.toFixed(3)}% (t ${s.d9T.toFixed(2)}) | top10 NET=${s.net >= 0 ? '+' : ''}${s.net.toFixed(3)}% (t ${s.netT.toFixed(2)}, pos ${(s.netPos * 100).toFixed(0)}%)`);
const TU = r => r.m >= 2e9 && r.c >= 5;
const excl = ['2026-07-16', '2026-07-28', '2026-07-29', '2026-07-30'];
console.log('=== 1. Concentration check — 4-alive composite excluding the 4 best days ===');
P('4-alive T+3 all days', evalScore(r => comp(r, ALIVE), L3));
P('4-alive T+3 excl top-4 days', evalScore(r => comp(r, ALIVE), new Map([...L3].filter(([d]) => !excl.includes(d)))));
P('shipped xs T+3 excl top-4 days', evalScore(r => r.xs, new Map([...L3].filter(([d]) => !excl.includes(d)))));
console.log('\n=== 2. Best-candidate: 4-alive, trading universe (mcap>=2B, px>=5), T+3 vs T+5, cost-adjusted ===');
P('4-alive TU T+3', evalScore(r => comp(r, ALIVE), L3, TU));
P('4-alive TU T+5', evalScore(r => comp(r, ALIVE), L5, TU));
P('4-alive TU T+5 excl top-4 days', evalScore(r => comp(r, ALIVE), new Map([...L5].filter(([d]) => !excl.includes(d))), TU));
P('shipped xs TU T+5', evalScore(r => r.xs, L5, TU));
P('4-alive mcap>=10B T+5', evalScore(r => comp(r, ALIVE), L5, r => r.m >= 1e10));
console.log('\n=== 3. Rolling walk-forward (expanding window): each day, keep factors whose trailing IC>0.01 (min 8 days), equal-weight; OOS from day 9 ===');
const FACT = ['revChg', 'revRet3', 'smaExt', 'squeeze', 'analystRev', 'gexInv', 'dGex5', 'pcr', 'ivLow', 'darkPool', 'shortVol', 'blockTrades', 'dtc'];
const days3 = [...L3.keys()].sort(); const factIC = {}; for (const k of FACT) factIC[k] = [];
for (const d of days3) { for (const k of FACT) { const rows = L3.get(d).filter(x => typeof (x.r.z && x.r.z[k]) === 'number'); factIC[k].push(rows.length >= 100 ? spearman(rows.map(x => x.r.z[k]), rows.map(x => x.adj)) : null); } }
function rollingSets() { const sets = new Map(); for (let i = 8; i < days3.length; i++) { const keep = FACT.filter(k => { const v = factIC[k].slice(0, i).filter(x => x != null); return v.length >= 6 && mean(v) > 0.01; }); sets.set(days3[i], keep); } return sets; }
const sets = rollingSets(); const oosDays = [...sets.keys()];
console.log('factor sets over time (first/mid/last):', JSON.stringify(sets.get(oosDays[0])), JSON.stringify(sets.get(oosDays[Math.floor(oosDays.length / 2)])), JSON.stringify(sets.get(oosDays[oosDays.length - 1])));
const L3oos = new Map([...L3].filter(([d]) => sets.has(d)));
P('OOS rolling: adaptive factor set, equal-weight', evalScore((r, d) => comp(r, sets.get(d)), L3oos));
P('OOS rolling: shipped xs (same days)', evalScore(r => r.xs, L3oos));
P('OOS rolling: adaptive set, TU', evalScore((r, d) => comp(r, sets.get(d)), L3oos, TU));
const L5oos = new Map([...L5].filter(([d]) => sets.has(d)));
P('OOS rolling: adaptive set, TU, T+5', evalScore((r, d) => comp(r, sets.get(d)), L5oos, TU));
console.log('\n=== 4. Block bootstrap (block=3 days, 2000 resamples) 95% CI for mean IC ===');
function bootCI(ics) { const n = ics.length, B = 2000, out = []; let seed = 42; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; for (let b = 0; b < B; b++) { const s = []; while (s.length < n) { const st = Math.floor(rnd() * n); for (let j = 0; j < 3 && s.length < n; j++) s.push(ics[(st + j) % n]); } out.push(mean(s)); } out.sort((a, b) => a - b); return [out[Math.floor(B * 0.025)], out[Math.floor(B * 0.975)], out.filter(x => x <= 0).length / B]; }
for (const [lab, s] of [['shipped xs T+3', evalScore(r => r.xs, L3)], ['4-alive T+3', evalScore(r => comp(r, ALIVE), L3)], ['4-alive TU T+5', evalScore(r => comp(r, ALIVE), L5, TU)], ['OOS rolling adaptive TU T+5', evalScore((r, d) => comp(r, sets.get(d)), L5oos, TU)]]) { const [lo, hi, p0] = bootCI(s.ics); console.log(`${lab.padEnd(30)} meanIC=${s.ic.toFixed(4)}  95%CI=[${lo.toFixed(4)}, ${hi.toFixed(4)}]  P(IC<=0)=${(p0 * 100).toFixed(1)}%  days=${s.days}`); }
console.log('\n=== 5. Turnover: day-to-day rank autocorrelation (higher = less trading) ===');
function autocorr(scoreFn) { const ac = []; for (let i = 1; i < sessions.length; i++) { const a = byDate.get(sessions[i - 1]), b = byDate.get(sessions[i]); const mb = new Map(b.map(r => [r.t, scoreFn(r)])); const x = [], y = []; for (const r of a) { const v = scoreFn(r), w = mb.get(r.t); if (typeof v === 'number' && typeof w === 'number') { x.push(v); y.push(w); } } if (x.length > 100) ac.push(spearman(x, y)); } return mean(ac); }
console.log('shipped xs (EMA 0.4):', autocorr(r => r.xs).toFixed(3), '| 4-alive raw composite:', autocorr(r => comp(r, ALIVE)).toFixed(3), '| revRet3 alone:', autocorr(r => r.z && r.z.revRet3).toFixed(3));
// EMA-smoothed 4-alive per ticker (alpha 0.4) → IC + autocorr
const emaMap = new Map(); const emaScore = new Map(); for (const d of sessions) { for (const r of byDate.get(d)) { const c = comp(r, ALIVE); if (typeof c !== 'number') continue; const prev = emaMap.get(r.t); const e = prev == null ? c : 0.4 * c + 0.6 * prev; emaMap.set(r.t, e); emaScore.set(r.t + '|' + d, e); } }
P('4-alive EMA(0.4) T+3', evalScore(r => emaScore.get(r.t + '|' + r.d) ?? null, L3));
P('4-alive EMA(0.4) TU T+5', evalScore(r => emaScore.get(r.t + '|' + r.d) ?? null, L5, TU));
console.log('autocorr 4-alive EMA(0.4):', autocorr(r => emaScore.get(r.t + '|' + r.d) ?? null).toFixed(3));
fs.writeFileSync('/tmp/ego/xs-robust.json', JSON.stringify({ oosDays, sets: Object.fromEntries(sets) }, null, 1));
