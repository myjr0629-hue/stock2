// INSIGHT ENGINE prototype — compute the historical base rate for the exact
// situation in today's story, from raw prices. This is the layer a news
// summary cannot have: "here is what actually happened the last N times."
const KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const r2 = (v) => Number.isFinite(v) ? v.toFixed(2) : '—';

async function bars(t, from, to) {
  const j = await (await fetch(`https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/${from}/${to}?adjusted=true&limit=50000&apiKey=${KEY}`)).json();
  await sleep(180);
  return (j.results || []).map((x) => ({ d: new Date(x.t).toISOString().slice(0, 10), c: x.c }));
}

(async () => {
  const FROM = '2021-01-01', TO = '2026-08-10';
  const [uso, spy, xle, xlk, copx] = await Promise.all([
    bars('USO', FROM, TO), bars('SPY', FROM, TO), bars('XLE', FROM, TO), bars('XLK', FROM, TO), bars('COPX', FROM, TO),
  ]);
  const map = (a) => new Map(a.map((x) => [x.d, x.c]));
  const S = map(spy), E = map(xle), K = map(xlk), C = map(copx);
  const dates = spy.map((x) => x.d);
  const idx = new Map(dates.map((d, i) => [d, i]));
  const fwd = (M, d, n) => {
    const i = idx.get(d); if (i == null || i + n >= dates.length) return null;
    const a = M.get(dates[i]), b = M.get(dates[i + n]);
    return (a > 0 && b > 0) ? (b / a - 1) * 100 : null;
  };

  // event: oil ETF up >= 4% in a day (proxy for a Brent shock like Aug 10)
  const events = [];
  for (let i = 1; i < uso.length; i++) {
    const ret = (uso[i].c / uso[i - 1].c - 1) * 100;
    if (ret >= 4 && idx.has(uso[i].d)) events.push({ d: uso[i].d, oil: ret });
  }
  console.log(`=== 유가 하루 +4% 이상 충격 (2021-01 ~ 2026-08): ${events.length}회 ===`);

  const rows = { spy3: [], spy5: [], spread5: [], copx5: [] };
  for (const ev of events) {
    const s3 = fwd(S, ev.d, 3), s5 = fwd(S, ev.d, 5);
    const e5 = fwd(E, ev.d, 5), k5 = fwd(K, ev.d, 5), c5 = fwd(C, ev.d, 5);
    if (s3 != null) rows.spy3.push(s3);
    if (s5 != null) rows.spy5.push(s5);
    if (e5 != null && k5 != null) rows.spread5.push(e5 - k5);
    if (c5 != null) rows.copx5.push(c5);
  }
  const stat = (name, a) => console.log(`  ${name.padEnd(22)} 평균 ${r2(mean(a))}%  중앙값 ${r2(med(a))}%  양수 ${a.filter((v) => v > 0).length}/${a.length} (${r2(a.filter((v) => v > 0).length / a.length * 100)}%)`);
  stat('S&P 3거래일 후', rows.spy3);
  stat('S&P 5거래일 후', rows.spy5);
  stat('에너지-기술 5일 스프레드', rows.spread5);
  stat('구리광산 5일 후', rows.copx5);

  // second angle: what happens to SPY after a record high that immediately slips
  const recs = [];
  let peak = 0;
  for (let i = 1; i < spy.length; i++) {
    if (spy[i - 1].c > peak) peak = spy[i - 1].c;
    const isRecordPrev = spy[i - 1].c >= peak;
    const slipped = spy[i].c < spy[i - 1].c;
    if (isRecordPrev && slipped) recs.push(spy[i].d);
  }
  const after = recs.map((d) => fwd(S, d, 5)).filter((v) => v != null);
  console.log(`\n=== 사상 최고 다음날 하락 → 이후 5거래일 (${after.length}회) ===`);
  stat('S&P 5거래일 후', after);
})();
