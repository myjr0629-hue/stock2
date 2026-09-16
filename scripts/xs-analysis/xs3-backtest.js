#!/usr/bin/env node
// XS-3.0 로컬 검증 하네스 — Lambda 모듈(scripts/lambda-xs3/index.js)의 «같은 함수»로 8주 원자료를 재생한다.
// 인샘플(백필) 결과다: 코어 4팩터·EMA 0.4 는 이 자료의 8/31 실측에서 골랐으므로 게이트 판정에 쓰지 않는다(PREREG §4).
// 사용: node scripts/xs-analysis/xs3-backtest.js [/tmp/ego/xs-data.json] [/tmp/ego/sp500.json]
'use strict';
const fs = require('fs');
const X = require('../lambda-xs3/index.js');
const ROWS = process.argv[2] || '/tmp/ego/xs-data.json';
const SP = process.argv[3] || '/tmp/ego/sp500.json';
const rows = JSON.parse(fs.readFileSync(ROWS, 'utf8')).filter((r) => r.z && r.t && !r.t.startsWith('_'));
const spList = JSON.parse(fs.readFileSync(SP, 'utf8'));
const sp = new Map((Array.isArray(spList) ? spList : spList.list).map((x) => [X.normT(x.t), x.sector]));
const byDate = new Map(); for (const r of rows) { if (!byDate.has(r.d)) byDate.set(r.d, []); byDate.get(r.d).push(r); }
const dates = [...byDate.keys()].sort();
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
console.log(`rows ${rows.length} · dates ${dates.length} (${dates[0]}→${dates[dates.length - 1]}) · S&P map ${sp.size}`);

// 1) 일별 채점 (EMA 상태 연결)
let prevEma = new Map(); const scoredByDate = new Map(); const tradeByDate = new Map();
for (const d of dates) {
  const { scored, ema } = X.scoreDay(byDate.get(d).map((r) => ({ t: r.t, z: r.z, c: r.c, m: r.m, xs: r.xs })), prevEma, sp);
  prevEma = ema; scoredByDate.set(d, new Map(scored.map((s) => [s.t, s])));
  tradeByDate.set(d, X.tradeList(scored, new Set(), null));
}
// 2) 라벨 (행 자체의 종가: close[D+H]/close[D]−1) + 일별 통계
const H = X.HORIZON; const ledger = []; const closeAt = (d, t) => { const m = scoredByDate.get(d); const s = m && m.get(t); return s && s.close > 0 ? s.close : null; };
for (let i = 0; i + H < dates.length; i++) {
  const d = dates[i], dH = dates[i + H]; const lab = [];
  for (const s of scoredByDate.get(d).values()) { const c0 = closeAt(d, s.t), c1 = closeAt(dH, s.t); if (!c0 || !c1) continue; const f5 = c1 / c0 - 1; if (Math.abs(f5) > 1.5) continue; lab.push({ ...s, f5 }); }
  if (lab.length < 100) continue;
  const mu = mean(lab.map((x) => x.f5)); const spMu = mean(lab.filter((x) => x.sp500).map((x) => x.f5));
  for (const x of lab) { x.adj5 = x.f5 - mu; x.spyAdj5 = x.sp500 ? x.f5 - spMu : null; } // S&P 동일가중 평균을 SPY 대용(proxy)
  const tl = tradeByDate.get(d); const st = X.dayStats(lab, tl.top.map((x) => x.t), tl.topB, tl.topD); st.d = d; st.backfill = true; st.nLab = lab.length; ledger.push(st);
}
const agg = X.aggregate(ledger.map((x) => ({ ...x, backfill: false }))); // 전 구간 통계(인샘플 표기)
// 3) 페이퍼 NAV: 상위 TOP_N S&P · 진입 D+1 종가 · 청산 D+1+H 종가 · 5트랑슈 · 왕복 15bp
const T = 5, cost = X.COST_RT; let nav = 1, peak = 1, mdd = 0; const navPath = []; const legs = []; const spNav = { v: 1, path: [] };
for (let i = 0; i + 1 + H < dates.length; i++) { const d = dates[i], dIn = dates[i + 1], dOut = dates[i + 1 + H]; const top = tradeByDate.get(d).top; const rets = []; for (const x of top) { const a = closeAt(dIn, x.t), b = closeAt(dOut, x.t); if (a && b) rets.push(b / a - 1 - cost); } if (!rets.length) continue; const r = mean(rets); legs.push({ d, n: rets.length, r }); const spR = mean([...scoredByDate.get(dIn).values()].filter((s) => s.sp500).map((s) => { const b = closeAt(dOut, s.t); return b ? b / s.close - 1 : null; }).filter((v) => v != null)); spNav.path.push({ d, r: spR }); }
// 트랑슈: 매일 1/5 진입, 각 트랑슈는 H 세션 후 실현 → 근사: 일별 수익 = 지난 5개 레그 평균/5 … 단순히 각 레그를 1/T 로 NAV 에 순차 반영
for (let k = 0; k < legs.length; k++) { nav *= 1 + legs[k].r / T; peak = Math.max(peak, nav); mdd = Math.min(mdd, nav / peak - 1); spNav.v *= 1 + (spNav.path[k]?.r || 0) / T; navPath.push({ d: legs[k].d, nav: +nav.toFixed(4), sp: +spNav.v.toFixed(4) }); }
const winLegs = legs.filter((l) => l.r > 0).length / legs.length;
// 4) 민감도: TOP_N 10/20/50 · EMA 없음(comp 순위) — 하네스 안에서만 재계산
function topNet(n, key = 'xs3') { const out = []; for (let i = 0; i + 1 + H < dates.length; i++) { const d = dates[i], dIn = dates[i + 1], dOut = dates[i + 1 + H]; const elig = [...scoredByDate.get(d).values()].filter((s) => s.sp500 && s.close >= 5).sort((a, b) => b[key] - a[key]).slice(0, n); const rets = elig.map((x) => { const a = closeAt(dIn, x.t), b = closeAt(dOut, x.t); return a && b ? b / a - 1 - cost : null; }).filter((v) => v != null); if (rets.length) out.push(mean(rets)); } return { legs: out.length, mean: +(mean(out) * 100).toFixed(3), win: +(out.filter((r) => r > 0).length / out.length).toFixed(3), nwT: +X.nwT(out, H - 1).toFixed(2) }; }
const sens = { top10: topNet(10), top20: topNet(20), top50: topNet(50), top20_noEMA: topNet(20, 'comp'), top20_variantB: topNet(20, 'xs3B') };
// 5) XS-2.0 같은 라벨 맞대결 (S&P) 및 데실
const out = { generated: new Date().toISOString(), inSample: true, rows: rows.length, dates: dates.length, span: [dates[0], dates[dates.length - 1]], labeledDays: ledger.length, spPerDay: Math.round(mean(ledger.map((x) => x.nSp))), agg: agg.live, paper: { legs: legs.length, nav: +nav.toFixed(4), spEqualWeight: +spNav.v.toFixed(4), mdd: +mdd.toFixed(4), legWin: +winLegs.toFixed(3), meanLegNet: +(mean(legs.map((l) => l.r)) * 100).toFixed(3), path: navPath }, sensitivity: sens, ledger: ledger.map(({ deciles, ...x }) => x), decilesAvg: agg.live.deciles };
fs.writeFileSync(__dirname + '/xs3-backtest.json', JSON.stringify(out, null, 1));
const L = agg.live; const f = (o) => o ? `mean ${o.mean} · NW t ${o.nwT} · pos ${o.pos} · CI [${o.ci ? o.ci.lo.toFixed(3) + ',' + o.ci.hi.toFixed(3) : '-'}] · n ${o.days}` : '-';
console.log(`\n[인샘플 · 라벨일 ${ledger.length} · S&P 채점/일 ${out.spPerDay}]`);
console.log(`IC(T+5) 전체        : ${f(L.icAll)}`); console.log(`IC(T+5) S&P  A(main): ${f(L.icSp)}`); console.log(`IC(T+5) S&P  B(섹터잔차): ${f(L.icSpB)}`); console.log(`IC(T+5) S&P  D(EMA없음): ${f(L.icSpD)}`); console.log(`IC(T+5) S&P  XS-2.0 : ${f(L.icSpXs2)}`); console.log(`상위20 순수익 B/D: ${JSON.stringify(L.top20B)} / ${JSON.stringify(L.top20D)}`);
console.log(`맞대결 3.0 vs 2.0   : ${JSON.stringify(L.duel)}`); console.log(`데실(S&P, adj5 평균) : ${JSON.stringify(L.deciles)}`); console.log(`상위20 순수익(비용·S&P조정): ${JSON.stringify(L.top20)}`);
console.log(`페이퍼 NAV(top20·5트랑슈·15bp): ${out.paper.nav} vs S&P동일가중 ${out.paper.spEqualWeight} · MDD ${out.paper.mdd} · 레그승률 ${out.paper.legWin} · 레그평균 ${out.paper.meanLegNet}%`);
console.log(`민감도: ${JSON.stringify(sens)}`);
