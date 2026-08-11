// DAILY CANDIDATE SCAN (sourcing lane #1)
// "What actually moved unusually today, and can we build a base rate on it?"
//
// For each instrument: latest daily return, z-score vs the trailing 60 days,
// then a count of historical analogs (same sign, same-or-bigger magnitude) and
// what happened 3/5 sessions after them. Gate ① (computability, n>=30) is
// answered automatically, so topic selection starts from data, not headlines.
//
//   node scan-candidates.js            → today's ranked candidates
//   node scan-candidates.js 2026-08-10 → as of a given date
const KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const std = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const r2 = (v) => Number.isFinite(v) ? v.toFixed(2) : '—';

const UNIVERSE = [
  ['SPY', 'S&P 500', 'index'], ['QQQ', 'Nasdaq 100', 'index'], ['IWM', 'Small caps', 'index'],
  ['XLE', 'Energy', 'sector'], ['XLF', 'Financials', 'sector'], ['XLK', 'Technology', 'sector'],
  ['XLV', 'Health care', 'sector'], ['XLI', 'Industrials', 'sector'], ['XLY', 'Discretionary', 'sector'],
  ['XLP', 'Staples', 'sector'], ['XLU', 'Utilities', 'sector'], ['XLB', 'Materials', 'sector'],
  ['XLRE', 'Real estate', 'sector'], ['XLC', 'Communication', 'sector'],
  ['USO', 'Crude oil', 'commodity'], ['UNG', 'Natural gas', 'commodity'], ['GLD', 'Gold', 'commodity'],
  ['SLV', 'Silver', 'commodity'], ['COPX', 'Copper miners', 'commodity'], ['URA', 'Uranium', 'commodity'],
  ['TLT', 'Long bonds', 'rates'], ['HYG', 'High yield', 'credit'], ['UUP', 'US dollar', 'fx'],
  ['NVDA', 'Nvidia', 'mega'], ['AAPL', 'Apple', 'mega'], ['MSFT', 'Microsoft', 'mega'],
  ['AMZN', 'Amazon', 'mega'], ['GOOGL', 'Alphabet', 'mega'], ['META', 'Meta', 'mega'], ['TSLA', 'Tesla', 'mega'],
];

async function bars(t, from, to) {
  const j = await (await fetch(`https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/${from}/${to}?adjusted=true&limit=50000&apiKey=${KEY}`)).json();
  await sleep(160);
  return (j.results || []).map((x) => ({ d: new Date(x.t).toISOString().slice(0, 10), c: x.c }));
}

(async () => {
  const asOf = process.argv[2] || new Date().toISOString().slice(0, 10);
  const from = new Date(Date.parse(asOf) - 6 * 365 * 86400000).toISOString().slice(0, 10);
  const spy = await bars('SPY', from, asOf);
  const spyMap = new Map(spy.map((x) => [x.d, x.c]));
  const cal = spy.map((x) => x.d);

  const out = [];
  for (const [t, name, kind] of UNIVERSE) {
    let rows;
    try { rows = await bars(t, from, asOf); } catch { continue; }
    if (rows.length < 200) continue;
    const rets = [];
    for (let i = 1; i < rows.length; i++) rets.push({ d: rows[i].d, r: (rows[i].c / rows[i - 1].c - 1) * 100, i });
    const last = rets[rets.length - 1];
    const trail = rets.slice(-61, -1).map((x) => x.r);
    const z = (last.r - mean(trail)) / std(trail);

    // Historical analogs: same sign, magnitude >= a threshold. Anchoring the
    // threshold to today's exact move starves the sample on the most extreme
    // (i.e. most newsworthy) days — so step the bar down until n >= 30 and
    // report the threshold actually used. Honest and usable.
    const hist = rets.slice(0, -1);
    const sign = Math.sign(last.r);
    const MIN_N = 30, FLOOR = 1.2;
    let thr = Math.abs(last.r);
    let analogs = hist.filter((x) => Math.sign(x.r) === sign && Math.abs(x.r) >= thr);
    for (const f of [0.85, 0.7, 0.6, 0.5, 0.4]) {
      if (analogs.length >= MIN_N) break;
      const cand = Math.max(FLOOR, Math.abs(last.r) * f);
      if (cand === thr) continue;
      thr = cand;
      analogs = hist.filter((x) => Math.sign(x.r) === sign && Math.abs(x.r) >= thr);
    }
    // what happened next, for the instrument itself and for SPY
    const fwd = (arr, idx, n) => { const j = idx + n; return j < arr.length ? (arr[j].c / arr[idx].c - 1) * 100 : null; };
    const self5 = [], spy5 = [];
    for (const a of analogs) {
      const s = fwd(rows, a.i, 5);
      if (s != null) self5.push(s);
      const k = cal.indexOf(a.d);
      if (k >= 0 && k + 5 < cal.length) {
        const p0 = spyMap.get(cal[k]), p1 = spyMap.get(cal[k + 5]);
        if (p0 > 0 && p1 > 0) spy5.push((p1 / p0 - 1) * 100);
      }
    }
    out.push({
      t, name, kind, ret: last.r, z,
      n: analogs.length, thr,
      self5med: med(self5), self5up: self5.length ? self5.filter((v) => v > 0).length / self5.length * 100 : NaN,
      spy5med: med(spy5), spy5up: spy5.length ? spy5.filter((v) => v > 0).length / spy5.length * 100 : NaN,
    });
  }

  out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  console.log(`\n=== 소재 스캔 ${asOf} · 유니버스 ${out.length} ===`);
  console.log('※ z = 오늘 움직임이 최근 60일 분포에서 몇 시그마인가 · n = 과거 유사 이벤트 수(게이트①: 30 이상 필요)\n');
  console.log('  티커  이름              오늘     z      기준     n    본인 5일후(중앙/승률)  S&P 5일후(중앙/승률)  게이트');
  for (const o of out.slice(0, 12)) {
    const gate = o.n >= 30 && Math.abs(o.z) >= 1.5 ? 'PASS' : (o.n < 30 ? 'n부족' : 'z낮음');
    console.log(
      `  ${o.t.padEnd(5)} ${o.name.padEnd(16)} ${(o.ret >= 0 ? '+' : '') + r2(o.ret)}%  ${r2(o.z).padStart(5)}σ  ${('±' + r2(o.thr) + '%').padStart(7)}  ${String(o.n).padStart(4)}   `
      + `${(r2(o.self5med) + '% / ' + r2(o.self5up) + '%').padEnd(20)}  ${(r2(o.spy5med) + '% / ' + r2(o.spy5up) + '%').padEnd(18)}  ${gate}`
    );
  }
  const passed = out.filter((o) => o.n >= 30 && Math.abs(o.z) >= 1.5);
  console.log(`\n게이트① 통과 후보: ${passed.length}건 → ${passed.slice(0, 5).map((o) => o.t).join(', ') || '없음(캘린더/구조 테마 레인으로)'}`);
  console.log('다음 단계: 통과 후보에 대해 통념 확인(게이트②) → 점수표 → 최고점 1개 제작\n');
})();
