// Base rate for the copper story: how unusual is it for copper miners to beat
// Nvidia over a 5-week window — and what happened next?
const KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const r2 = (v) => Number.isFinite(v) ? v.toFixed(2) : '—';

async function bars(t, from, to) {
  const j = await (await fetch(`https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/${from}/${to}?adjusted=true&limit=50000&apiKey=${KEY}`)).json();
  await sleep(200);
  return (j.results || []).map((x) => ({ d: new Date(x.t).toISOString().slice(0, 10), c: x.c }));
}

(async () => {
  const FROM = '2021-01-01', TO = '2026-08-10';
  const [copx, nvda] = await Promise.all([bars('COPX', FROM, TO), bars('NVDA', FROM, TO)]);
  const N = new Map(nvda.map((x) => [x.d, x.c]));
  const rows = copx.filter((x) => N.has(x.d));
  const W = 28; // ~5-6 weeks of trading days (Jul 1 → Aug 10 ≈ 28 sessions)

  let beat = 0, total = 0;
  const fwdAfterBeat = [], fwdAfterNot = [];
  for (let i = W; i + 21 < rows.length; i++) {
    const c0 = rows[i - W].c, c1 = rows[i].c;
    const n0 = N.get(rows[i - W].d), n1 = N.get(rows[i].d);
    const cR = (c1 / c0 - 1) * 100, nR = (n1 / n0 - 1) * 100;
    total++;
    // forward 21 sessions (~1 month) relative performance
    const c2 = rows[i + 21].c, n2 = N.get(rows[i + 21].d);
    const fwd = ((c2 / c1 - 1) - (n2 / n1 - 1)) * 100;
    if (cR > nR) { beat++; fwdAfterBeat.push(fwd); } else fwdAfterNot.push(fwd);
  }
  console.log(`=== 구리광산(COPX) vs 엔비디아, ${W}거래일 창 · 표본 ${total} ===`);
  console.log(`  광산 우위 창: ${beat} (${r2(beat / total * 100)}%)`);
  console.log(`\n=== 그 다음 21거래일 상대성과 (광산 − NVDA) ===`);
  console.log(`  광산 우위 직후: 평균 ${r2(mean(fwdAfterBeat))}%p · 중앙값 ${r2(med(fwdAfterBeat))}%p · 우위지속 ${fwdAfterBeat.filter((v) => v > 0).length}/${fwdAfterBeat.length} (${r2(fwdAfterBeat.filter((v) => v > 0).length / fwdAfterBeat.length * 100)}%)`);
  console.log(`  그 외 구간 직후: 평균 ${r2(mean(fwdAfterNot))}%p · 중앙값 ${r2(med(fwdAfterNot))}%p`);
})();
