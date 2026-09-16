const fs = require('fs');
const XS = JSON.parse(fs.readFileSync('/tmp/ego/xs-data.json', 'utf8'));
const V8 = JSON.parse(fs.readFileSync('/tmp/ego/v8-data.json', 'utf8'));
// ---------- helpers ----------
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function rank(arr) { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
function pearson(x, y) { const n = x.length; if (n < 5) return null; const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null; }
const spearman = (x, y) => pearson(rank(x), rank(y));
function nwT(series, lag) { const n = series.length; const m = mean(series); const e = series.map(v => v - m); let v = mean(e.map(x => x * x)); for (let l = 1; l <= lag; l++) { const w = 1 - l / (lag + 1); let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l]; v += 2 * w * g / n; } return m / Math.sqrt(v / n); }
const fmt = (x, d = 4) => x == null || Number.isNaN(x) ? 'n/a' : (typeof x === 'number' ? x.toFixed(d) : x);
// ---------- sessions & closes ----------
const sessions = [...new Set(XS.map(r => r.d))].sort();
const v8Dates = [...new Set(V8.map(r => r.d))].sort().filter(d => d > '2026-08-31'); // extra sessions for T+3 of late Aug
const allSessions = sessions.concat(v8Dates.filter(d => /^2026-09-0[1-4]$/.test(d))).sort();
const sIdx = new Map(allSessions.map((d, i) => [d, i]));
const closes = new Map(); // ticker -> Map(date->close)
for (const r of XS) { if (!(r.c > 0)) continue; if (!closes.has(r.t)) closes.set(r.t, new Map()); closes.get(r.t).set(r.d, r.c); }
let v8fill = 0; for (const r of V8) { if (!(r.c > 0) || !closes.has(r.t)) continue; const m = closes.get(r.t); if (!m.has(r.d)) { m.set(r.d, r.c); v8fill++; } }
console.log('sessions XS', sessions.length, '| extended', allSessions.length, '| closes filled from V8 rows:', v8fill);
// ---------- labels: f3 = close[t+3]/close[t]-1 ----------
const rowsByDate = new Map(); for (const r of XS) { if (!rowsByDate.has(r.d)) rowsByDate.set(r.d, []); rowsByDate.get(r.d).push(r); }
const labeled = []; // {d,t,xs,f3,adj,m,z,v}
const dayMean = new Map();
for (const d of sessions) { const i = sIdx.get(d); const d3 = allSessions[i + 3]; if (!d3) continue; const rows = rowsByDate.get(d); const tmp = []; for (const r of rows) { const m = closes.get(r.t); const c3 = m && m.get(d3); if (!(c3 > 0) || !(r.c > 0)) continue; const f3 = c3 / r.c - 1; if (Math.abs(f3) > 1.5) continue; tmp.push({ d, t: r.t, xs: r.xs, f3, m: r.m, z: r.z, v: r.v, c: r.c }); } if (tmp.length < 100) continue; const mu = mean(tmp.map(x => x.f3)); dayMean.set(d, mu); for (const x of tmp) { x.adj = x.f3 - mu; labeled.push(x); } }
const labDates = [...new Set(labeled.map(x => x.d))].sort();
console.log('labeled rows', labeled.length, 'label days', labDates.length, labDates[0], '→', labDates[labDates.length - 1]);
// ---------- daily IC ----------
function dailyIC(filter, key = 'xs') { const out = []; for (const d of labDates) { const rows = labeled.filter(x => x.d === d && (!filter || filter(x)) && typeof (key === 'xs' ? x.xs : x.z && x.z[key]) === 'number'); if (rows.length < 40) continue; const ic = spearman(rows.map(x => key === 'xs' ? x.xs : x.z[key]), rows.map(x => x.adj)); if (ic != null) out.push({ d, ic, n: rows.length }); } return out; }
function icStats(ser) { const v = ser.map(s => s.ic); if (!v.length) return null; return { days: v.length, mean: mean(v), sd: sd(v), t: mean(v) / (sd(v) / Math.sqrt(v.length)), nwT: nwT(v, 2), icir: mean(v) / sd(v), pos: v.filter(x => x > 0).length / v.length }; }
const P = (label, st) => console.log(label.padEnd(44), st ? `days=${st.days} IC=${fmt(st.mean)} sd=${fmt(st.sd)} t=${fmt(st.t, 2)} NW(2)t=${fmt(st.nwT, 2)} ICIR=${fmt(st.icir, 2)} pos=${(st.pos * 100).toFixed(0)}%` : 'n/a');
console.log('\n=== A. XS daily cross-sectional Spearman IC (T+3, market-adjusted) ===');
const icAll = dailyIC(); P('ALL (07-06..08-31)', icStats(icAll));
P('XS-1.x era (ver XS-1.*)', icStats(dailyIC(x => /^XS-1/.test(x.v))));
P('XS-2.0 era (ver XS-2.*)', icStats(dailyIC(x => /^XS-2/.test(x.v))));
P('mcap >= $2B (prereg universe)', icStats(dailyIC(x => x.m >= 2e9)));
P('mcap >= $10B', icStats(dailyIC(x => x.m >= 1e10)));
P('mcap < $2B', icStats(dailyIC(x => x.m < 2e9)));
console.log('daily IC series:', icAll.map(s => s.d.slice(5) + ':' + s.ic.toFixed(3)).join(' '));
// regime: market up vs down (universe mean 1-day return on day d)
const f1 = new Map(); for (const d of sessions) { const i = sIdx.get(d); const prev = allSessions[i - 1]; if (!prev) continue; const rows = rowsByDate.get(d); const v = []; for (const r of rows) { const m = closes.get(r.t); const c0 = m && m.get(prev); if (c0 > 0 && r.c > 0) v.push(r.c / c0 - 1); } if (v.length) f1.set(d, mean(v)); }
P('market UP days (univ mean 1d > 0)', icStats(icAll.filter(s => (f1.get(s.d) || 0) > 0)));
P('market DOWN days', icStats(icAll.filter(s => (f1.get(s.d) || 0) <= 0)));
// ---------- deciles ----------
console.log('\n=== B. Deciles by xsScore (all days) — mean adjF3 %, hit>0 %, N ===');
function deciles(filter) { const buckets = Array.from({ length: 10 }, () => []); for (const d of labDates) { const rows = labeled.filter(x => x.d === d && (!filter || filter(x))); if (rows.length < 100) continue; const sorted = rows.slice().sort((a, b) => a.xs - b.xs); sorted.forEach((x, i) => buckets[Math.min(9, Math.floor(i * 10 / sorted.length))].push(x)); } return buckets.map((b, i) => ({ dec: i, n: b.length, adj: mean(b.map(x => x.adj)) * 100, hit: b.filter(x => x.adj > 0).length / b.length * 100, raw: mean(b.map(x => x.f3)) * 100 })); }
const decAll = deciles(); decAll.forEach(b => console.log(`D${b.dec}  adjF3=${b.adj >= 0 ? '+' : ''}${b.adj.toFixed(3)}%  hit=${b.hit.toFixed(1)}%  rawF3=${b.raw >= 0 ? '+' : ''}${b.raw.toFixed(3)}%  n=${b.n}`));
// LS spread per day, t-stat
function lsSeries(filter) { const out = []; for (const d of labDates) { const rows = labeled.filter(x => x.d === d && (!filter || filter(x))); if (rows.length < 100) continue; const s = rows.slice().sort((a, b) => a.xs - b.xs); const k = Math.floor(s.length / 10); const lo = s.slice(0, k), hi = s.slice(-k); out.push({ d, ls: mean(hi.map(x => x.adj)) - mean(lo.map(x => x.adj)), hi: mean(hi.map(x => x.adj)), lo: mean(lo.map(x => x.adj)) }); } return out; }
const ls = lsSeries(); const lsv = ls.map(x => x.ls); console.log(`D9-D0 spread: mean=${(mean(lsv) * 100).toFixed(3)}%/3d sd=${(sd(lsv) * 100).toFixed(3)} t=${(mean(lsv) / (sd(lsv) / Math.sqrt(lsv.length))).toFixed(2)} NW(2)t=${nwT(lsv, 2).toFixed(2)} posDays=${lsv.filter(x => x > 0).length}/${lsv.length}`);
const hi = ls.map(x => x.hi); console.log(`D9 alone: mean=${(mean(hi) * 100).toFixed(3)}%/3d t=${(mean(hi) / (sd(hi) / Math.sqrt(hi.length))).toFixed(2)} NW(2)t=${nwT(hi, 2).toFixed(2)} posDays=${hi.filter(x => x > 0).length}/${hi.length}`);
console.log('\n--- deciles, mcap>=$2B & close>=$5 (trading universe) ---');
const decTU = deciles(x => x.m >= 2e9 && x.c >= 5); decTU.forEach(b => console.log(`D${b.dec}  adjF3=${b.adj >= 0 ? '+' : ''}${b.adj.toFixed(3)}%  hit=${b.hit.toFixed(1)}%  n=${b.n}`));
const lsTU = lsSeries(x => x.m >= 2e9 && x.c >= 5); const hiTU = lsTU.map(x => x.hi); console.log(`D9 (trading univ): mean=${(mean(hiTU) * 100).toFixed(3)}%/3d NW t=${nwT(hiTU, 2).toFixed(2)} posDays=${hiTU.filter(x => x > 0).length}/${hiTU.length}`);
// era split of D9
for (const [lab, f] of [['XS-1.x', x => /^XS-1/.test(x.v)], ['XS-2.0', x => /^XS-2/.test(x.v)]]) { const s = lsSeries(f); if (s.length) { const h = s.map(x => x.hi), l2 = s.map(x => x.ls); console.log(`${lab}: days=${s.length} D9=${(mean(h) * 100).toFixed(3)}% (NW t ${nwT(h, 2).toFixed(2)})  D9-D0=${(mean(l2) * 100).toFixed(3)}% (NW t ${nwT(l2, 2).toFixed(2)})`); } }
// ---------- cost-adjusted D9 (round-trip by cap tier) ----------
console.log('\n=== C. Cost-adjusted top decile (round-trip cost by cap tier: >$50B 10bp, >$10B 20bp, >$2B 40bp, <$2B 100bp) ===');
const cost = m => m > 5e10 ? 0.001 : m > 1e10 ? 0.002 : m > 2e9 ? 0.004 : 0.01;
for (const [lab, f] of [['all', null], ['mcap>=2B & px>=5', x => x.m >= 2e9 && x.c >= 5], ['mcap>=10B', x => x.m >= 1e10]]) { const g = [], n = []; for (const d of labDates) { const rows = labeled.filter(x => x.d === d && (!f || f(x))); if (rows.length < 100) continue; const s = rows.slice().sort((a, b) => b.xs - a.xs).slice(0, 10); g.push(mean(s.map(x => x.adj))); n.push(mean(s.map(x => x.adj - cost(x.m)))); } console.log(`${lab.padEnd(20)} top10 gross=${(mean(g) * 100).toFixed(3)}%/3d  net=${(mean(n) * 100).toFixed(3)}%/3d  net NW t=${nwT(n, 2).toFixed(2)}  net posDays=${n.filter(x => x > 0).length}/${n.length}`); }
// ---------- factor ICs ----------
console.log('\n=== D. Factor-level IC (z vs adjF3, Spearman, daily) ===');
const factors = ['revChg', 'revRet3', 'smaExt', 'squeeze', 'analystRev', 'gexInv', 'dGex5', 'pcr', 'ivLow', 'darkPool', 'shortVol', 'blockTrades', 'dtc'];
for (const f of factors) { const st = icStats(dailyIC(null, f)); if (st) console.log(`${f.padEnd(12)} days=${st.days} IC=${fmt(st.mean)} t=${fmt(st.t, 2)} NW t=${fmt(st.nwT, 2)} pos=${(st.pos * 100).toFixed(0)}%`); }
// ---------- turnover ----------
const ac = []; for (let i = 1; i < sessions.length; i++) { const a = rowsByDate.get(sessions[i - 1]), b = rowsByDate.get(sessions[i]); const mb = new Map(b.map(r => [r.t, r.xs])); const x = [], y = []; for (const r of a) { if (mb.has(r.t)) { x.push(r.xs); y.push(mb.get(r.t)); } } if (x.length > 100) ac.push(spearman(x, y)); }
console.log(`\n=== E. Score persistence: mean day-to-day rank autocorrelation of xsScore = ${fmt(mean(ac), 3)} (sd ${fmt(sd(ac), 3)}) ===`);
// ---------- V8 head-to-head ----------
console.log('\n=== F. V8 alphaScore vs XS on the same labels (XS-2.0 window) ===');
const v8map = new Map(); for (const r of V8) if (typeof r.a === 'number' && r.v === '8.0.0') v8map.set(r.t + '|' + r.d, r.a);
const h2h = []; for (const d of labDates) { const rows = labeled.filter(x => x.d === d && v8map.has(x.t + '|' + d)); if (rows.length < 100) continue; const icx = spearman(rows.map(x => x.xs), rows.map(x => x.adj)), icv = spearman(rows.map(x => v8map.get(x.t + '|' + d)), rows.map(x => x.adj)); h2h.push({ d, icx, icv, n: rows.length }); }
if (h2h.length) { const x = h2h.map(s => s.icx), v = h2h.map(s => s.icv), dlt = h2h.map((s, i) => x[i] - v[i]); console.log(`days=${h2h.length} XS IC=${fmt(mean(x))} (NW t ${nwT(x, 2).toFixed(2)})  V8 IC=${fmt(mean(v))} (NW t ${nwT(v, 2).toFixed(2)})  Δ=${fmt(mean(dlt))} (NW t ${nwT(dlt, 2).toFixed(2)})  XS wins ${dlt.filter(z => z > 0).length}/${h2h.length}`); const h2 = h2h.filter(s => s.d >= '2026-08-04'); if (h2.length) { const x2 = h2.map(s => s.icx), v2 = h2.map(s => s.icv), d2 = h2.map((s, i) => x2[i] - v2[i]); console.log(`XS-2.0 window (>=08-04): days=${h2.length} XS=${fmt(mean(x2))} V8=${fmt(mean(v2))} Δ=${fmt(mean(d2))} (NW t ${nwT(d2, 2).toFixed(2)}) XS wins ${d2.filter(z => z > 0).length}/${h2.length}`); } }
fs.writeFileSync('/tmp/ego/xs-analysis.json', JSON.stringify({ icAll, decAll, ls, factors: Object.fromEntries(factors.map(f => [f, icStats(dailyIC(null, f))])), h2h, labDays: labDates.length, labeled: labeled.length }, null, 1));
console.log('\nsaved /tmp/ego/xs-analysis.json');
