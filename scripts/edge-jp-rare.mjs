#!/usr/bin/env node
// ============================================================================
// edge-jp-rare — 남은 두 편의 「드물다는 증거」를 «사전등록» 하고 잰다 (2026-08-24)
// ----------------------------------------------------------------------------
// ⛔ 두 편 다 지금은 «분해» 만 있고 희소성 근거가 없어 insight 게이트를 못 넘는다.
//   통과시키려고 재는 것이 아니다 — 드물지 않으면 «드물지 않다»가 그 자체로 대본이 된다.
//
// ── A) JP10D: 「상위 10일이 8할을 만든다」가 NVDA 만의 일인가 ────────────────
//   지표  10년 일간 로그수익 중 «상위 10일» 이 차지하는 몫
//   대상  대형주 30종 (사전에 고정. 결과를 보고 바꾸지 않는다)
//   가설  «세우지 않는다» — 두 결과 다 쓸 수 있는 질문이다:
//         NVDA 가 상위권이면 → 「이 종목이 유난히 몰려 있다」
//         한복판이면        → 「어느 종목을 골랐든 마찬가지다」 (이쪽이 더 쓸모 있다)
//   판정  백분위를 그대로 적는다
//
// ── B) JPYEN: 「円安 기여가 5년 40.8% → 3년 13.1% 로 꺾였다」가 드문가 ──────
//   지표  (5년창 기여분) - (3년창 기여분)
//   기간  겹치는 전 구간
//   판정  백분위 <=10 또는 >=90 이어야 «드물다»
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1].trim();
const eod = async (s, from) => {
  const j = await (await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=${from}&to=2026-08-22&apikey=${KEY}`)).json();
  return Array.isArray(j) ? j.slice().sort((a, b) => a.date.localeCompare(b.date)) : null;
};
const out = {};

// ── A ───────────────────────────────────────────────────────────────────────
{
  const SYMS = ['NVDA','AAPL','MSFT','AMZN','GOOGL','META','TSLA','AVGO','AMD','MU','INTC','QCOM',
                'TXN','ADBE','CRM','NFLX','ORCL','CSCO','JPM','BAC','WFC','GS','XOM','CVX',
                'JNJ','PFE','UNH','WMT','COST','HD'];
  const res = [];
  for (const s of SYMS) {
    const rows = await eod(s, '2016-08-22');
    if (!rows || rows.length < 2000) { continue; }
    const lr = [];
    for (let i = 1; i < rows.length; i++) lr.push(Math.log(rows[i].close / rows[i - 1].close));
    const total = lr.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;                       // 10년 마이너스면 «몫» 이 뜻을 잃는다
    const top10 = lr.slice().sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
    res.push({ s, days: lr.length, share: top10 / total * 100, x: Math.exp(total) });
  }
  res.sort((a, b) => b.share - a.share);
  const nv = res.find((r) => r.s === 'NVDA');
  const pc = res.filter((r) => r.share <= nv.share).length / res.length * 100;
  const med = res.map((r) => r.share).sort((a, b) => a - b)[Math.floor(res.length / 2)];
  out.A = { n: res.length, nvda: +nv.share.toFixed(1), median: +med.toFixed(1),
            pctile: +pc.toFixed(1), rank: res.findIndex((r) => r.s === 'NVDA') + 1,
            rows: res.map((r) => ({ s: r.s, share: +r.share.toFixed(1), x: +r.x.toFixed(2) })) };
  console.log(`\n  ══ A) 상위 10일이 10년 수익에서 차지하는 몫 · 대형주 ${res.length}종 ══`);
  for (const r of res.slice(0, 6)) console.log(`   ${r.s.padEnd(6)} ${r.share.toFixed(1).padStart(6)}%   (${r.x.toFixed(1)}배)`);
  console.log(`   ...`);
  for (const r of res.slice(-4)) console.log(`   ${r.s.padEnd(6)} ${r.share.toFixed(1).padStart(6)}%   (${r.x.toFixed(1)}배)`);
  console.log(`\n   NVDA ${out.A.nvda}%  ·  ${res.length}종 중 ${out.A.rank}위  ·  백분위 ${out.A.pctile}  ·  중앙 ${out.A.median}%`);
  console.log(`   ${(out.A.pctile <= 10 || out.A.pctile >= 90) ? '✅ 드물다' : '⛔ 평범하다 — 「종목을 가리지 않는다」가 답이다'}`);
}

// ── B ───────────────────────────────────────────────────────────────────────
{
  const [spy, fx] = await Promise.all([eod('SPY', '2000-01-01'), eod('USDJPY', '2000-01-01')]);
  const m = new Map(fx.map((r) => [r.date, r.close]));
  const rows = spy.filter((r) => m.has(r.date)).map((r) => ({ d: r.date, u: r.close, r: m.get(r.date) }));
  const share = (i, W) => {
    const a = rows[i], b = rows[i - W];
    const xu = a.u / b.u, xj = (a.u * a.r) / (b.u * b.r);
    if (xu <= 0 || xj <= 0 || Math.abs(Math.log(xj)) < 1e-9) return null;
    return (1 - Math.log(xu) / Math.log(xj)) * 100;
  };
  const vals = [];
  for (let i = 1260; i < rows.length; i++) {
    const a = share(i, 1260), b = share(i, 756);
    if (a === null || b === null) continue;
    vals.push({ d: rows[i].d, g: a - b });
  }
  const now = vals[vals.length - 1];
  const all = vals.map((v) => v.g).sort((a, b) => a - b);
  const pc = all.filter((x) => x <= now.g).length / all.length * 100;
  out.B = { asof: now.d, gap: +now.g.toFixed(1), n: all.length, pctile: +pc.toFixed(1),
            median: +all[Math.floor(all.length / 2)].toFixed(1) };
  console.log(`\n  ══ B) 円安 기여분 «5년창 - 3년창» ══`);
  console.log(`   기준일 ${now.d} · 지금 ${out.B.gap}%pt  ·  중앙 ${out.B.median}%pt`);
  console.log(`   표본 ${out.B.n}개 · 백분위 ${out.B.pctile}`);
  console.log(`   ${(pc <= 10 || pc >= 90) ? '✅ 드물다' : '⛔ 평범하다 — 이 각도는 버린다'}`);
}

writeFileSync('.agent/_jp_rare.json', JSON.stringify(out, null, 2));
console.log('\n  → .agent/_jp_rare.json');
