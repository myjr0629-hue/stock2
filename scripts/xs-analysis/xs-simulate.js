const fs = require('fs');
const XS = JSON.parse(fs.readFileSync('/tmp/ego/xs-data.json', 'utf8'));
const V8 = JSON.parse(fs.readFileSync('/tmp/ego/v8-data.json', 'utf8'));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length; const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function rank(arr) { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
function pearson(x, y) { const n = x.length; if (n < 5) return null; const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null; }
const spearman = (x, y) => pearson(rank(x), rank(y));
function nwT(s, lag) { const n = s.length, m = mean(s), e = s.map(v => v - m); let v = mean(e.map(x => x * x)); for (let l = 1; l <= lag; l++) { const w = 1 - l / (lag + 1); let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l]; v += 2 * w * g / n; } return m / Math.sqrt(v / n); }
const f4 = x => x == null ? 'n/a' : x.toFixed(4);
// sessions/closes
const sessions = [...new Set(XS.map(r => r.d))].sort();
const allSessions = sessions.concat([...new Set(V8.map(r => r.d))].filter(d => /^2026-09-0[1-4]$/.test(d))).sort();
const sIdx = new Map(allSessions.map((d, i) => [d, i]));
const closes = new Map(); for (const r of XS) { if (!(r.c > 0)) continue; if (!closes.has(r.t)) closes.set(r.t, new Map()); closes.get(r.t).set(r.d, r.c); }
for (const r of V8) { if (!(r.c > 0) || !closes.has(r.t)) continue; const m = closes.get(r.t); if (!m.has(r.d)) m.set(r.d, r.c); }
const byDate = new Map(); for (const r of XS) { if (!byDate.has(r.d)) byDate.set(r.d, []); byDate.get(r.d).push(r); }
// generic labels for horizon h
function labelsFor(h) { const out = new Map(); for (const d of sessions) { const i = sIdx.get(d), dh = allSessions[i + h]; if (!dh) continue; const rows = byDate.get(d); const tmp = []; for (const r of rows) { const m = closes.get(r.t), ch = m && m.get(dh); if (!(ch > 0) || !(r.c > 0)) continue; const f = ch / r.c - 1; if (Math.abs(f) > 1.5) continue; tmp.push({ r, f }); } if (tmp.length < 100) continue; const mu = mean(tmp.map(x => x.f)); out.set(d, tmp.map(x => ({ r: x.r, adj: x.f - mu }))); } return out; }
const L3 = labelsFor(3);
const FACT = ['revChg', 'revRet3', 'smaExt', 'squeeze', 'analystRev', 'gexInv', 'dGex5', 'pcr', 'ivLow', 'darkPool', 'shortVol', 'blockTrades', 'dtc'];
// composite from z with weights (z already sign-aligned: higher = "bullish" per engine); weights may be negative to flip
function composite(r, w) { let s = 0, n = 0; for (const k in w) { const z = r.z && r.z[k]; if (typeof z !== 'number') continue; s += w[k] * z; n += Math.abs(w[k]); } return n ? s / n : null; }
function evalScore(scoreFn, labels, filter) { const ics = [], d9 = [], ls = []; for (const [d, rows] of labels) { const use = rows.filter(x => !filter || filter(x.r)); const sc = use.map(x => scoreFn(x.r, d)); const ok = use.map((x, i) => typeof sc[i] === 'number' && !Number.isNaN(sc[i])); const s = sc.filter((_, i) => ok[i]), a = use.filter((_, i) => ok[i]).map(x => x.adj); if (s.length < 100) continue; ics.push(spearman(s, a)); const order = s.map((v, i) => i).sort((i, j) => s[i] - s[j]); const k = Math.floor(order.length / 10); const lo = order.slice(0, k).map(i => a[i]), hi = order.slice(-k).map(i => a[i]); d9.push(mean(hi)); ls.push(mean(hi) - mean(lo)); } if (!ics.length) return null; return { days: ics.length, ic: mean(ics), icT: nwT(ics, 2), icir: mean(ics) / sd(ics), d9: mean(d9) * 100, d9T: nwT(d9, 2), ls: mean(ls) * 100, lsT: nwT(ls, 2), pos: ics.filter(x => x > 0).length / ics.length }; }
const P = (lab, s) => console.log(lab.padEnd(50), s ? `days=${s.days} IC=${f4(s.ic)} NWt=${s.icT.toFixed(2)} ICIR=${s.icir.toFixed(2)} pos=${(s.pos * 100).toFixed(0)}% | D9=${s.d9 >= 0 ? '+' : ''}${s.d9.toFixed(3)}% (t ${s.d9T.toFixed(2)}) | D9-D0=${s.ls.toFixed(3)}% (t ${s.lsT.toFixed(2)})` : 'n/a');
console.log('=== 1. Transform decomposition (same labels, T+3) ===');
P('xsScore (final: ensemble→residual→EMA→pct)', evalScore(r => r.xs, L3));
P('res (peer-residualized, pre-EMA)', evalScore(r => typeof r.res === 'number' ? r.res : null, L3));
P('raw (ensemble, no residual, no EMA)', evalScore(r => typeof r.raw === 'number' ? r.raw : null, L3));
const CUR = { revChg: 0.2114, revRet3: 0.2671, gexInv: -0.0369, dGex5: -0.0464, pcr: 0.0075, ivLow: -0.0718, squeeze: 0.0759, darkPool: 0.0108, shortVol: -0.0247, blockTrades: 0.0111, analystRev: 0.0354, smaExt: 0.1711, dtc: -0.03 };
P('recomposed from z with 08-31 adaptive weights', evalScore(r => composite(r, CUR), L3));
console.log('\n=== 2. Factor-subset composites (equal weight on rank-z) — IN-SAMPLE, hypothesis only ===');
const EQ = ks => Object.fromEntries(ks.map(k => [k, 1]));
P('all 13 equal-weight (+ signs as stored)', evalScore(r => composite(r, EQ(FACT)), L3));
P('4 alive: revRet3+revChg+smaExt+squeeze', evalScore(r => composite(r, EQ(['revRet3', 'revChg', 'smaExt', 'squeeze'])), L3));
P('2 reversal only: revRet3+revChg', evalScore(r => composite(r, EQ(['revRet3', 'revChg'])), L3));
P('4 alive + FLIP ivLow,dGex5,gexInv (sign-corrected)', evalScore(r => composite(r, { revRet3: 1, revChg: 1, smaExt: 1, squeeze: 1, ivLow: -1, dGex5: -1, gexInv: -1 }), L3));
P('all 13 minus wrong-signed (drop ivLow,dGex5,gexInv,pcr,dtc)', evalScore(r => composite(r, EQ(['revRet3', 'revChg', 'smaExt', 'squeeze', 'analystRev', 'darkPool', 'shortVol', 'blockTrades'])), L3));
console.log('\n=== 3. Walk-forward: estimate factor ICs on first 20 label days, trade IC-weighted composite on remaining days (OOS) ===');
const labDays = [...L3.keys()].sort(); const train = labDays.slice(0, 20), test = new Map([...L3].filter(([d]) => d >= labDays[20]));
const fic = {}; for (const k of FACT) { const v = []; for (const d of train) { const rows = L3.get(d).filter(x => typeof (x.r.z && x.r.z[k]) === 'number'); if (rows.length < 100) continue; v.push(spearman(rows.map(x => x.r.z[k]), rows.map(x => x.adj))); } fic[k] = v.length ? mean(v) : 0; }
console.log('train-window factor ICs:', Object.entries(fic).map(([k, v]) => k + ':' + v.toFixed(3)).join(' '));
const wIC = Object.fromEntries(FACT.map(k => [k, fic[k]])); const wICpos = Object.fromEntries(FACT.filter(k => fic[k] > 0.01).map(k => [k, fic[k]]));
P('OOS: xsScore as shipped (test days)', evalScore(r => r.xs, test));
P('OOS: IC-weighted all 13 (signed by train IC)', evalScore(r => composite(r, wIC), test));
P('OOS: IC-weighted, only train-IC>0.01 factors', evalScore(r => composite(r, wICpos), test));
P('OOS: 4 alive equal-weight', evalScore(r => composite(r, EQ(['revRet3', 'revChg', 'smaExt', 'squeeze'])), test));
console.log('\n=== 4. Horizon: xsScore IC at T+1 / T+2 / T+3 / T+5 ===');
for (const h of [1, 2, 3, 5]) P(`T+${h}`, evalScore(r => r.xs, labelsFor(h)));
console.log('\n=== 5. Liquidity / price filters (xsScore, T+3) ===');
P('mcap>=2B & px>=5', evalScore(r => r.xs, L3, r => r.m >= 2e9 && r.c >= 5));
P('mcap>=10B', evalScore(r => r.xs, L3, r => r.m >= 1e10));
P('mcap>=2B, 4-alive composite', evalScore(r => composite(r, EQ(['revRet3', 'revChg', 'smaExt', 'squeeze'])), L3, r => r.m >= 2e9 && r.c >= 5));
console.log('\n=== 6. Regime gating: trade only after market DOWN day vs UP day (universe mean 1d) ===');
const f1 = new Map(); for (const d of sessions) { const i = sIdx.get(d), prev = allSessions[i - 1]; if (!prev) continue; const v = []; for (const r of byDate.get(d)) { const m = closes.get(r.t), c0 = m && m.get(prev); if (c0 > 0 && r.c > 0) v.push(r.c / c0 - 1); } if (v.length) f1.set(d, mean(v)); }
P('after DOWN day', evalScore(r => r.xs, new Map([...L3].filter(([d]) => (f1.get(d) || 0) <= 0))));
P('after UP day', evalScore(r => r.xs, new Map([...L3].filter(([d]) => (f1.get(d) || 0) > 0))));
console.log('\n=== 7. Concentration: IC without the 4 best days (07-16, 07-28, 07-29, 07-30) ===');
P('xsScore excl. top-4 days', evalScore(r => r.xs, new Map([...L3].filter(([d]) => !['2026-07-16', '2026-07-28', '2026-07-29', '2026-07-30'].includes(d)))));
