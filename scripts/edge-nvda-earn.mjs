#!/usr/bin/env node
// ============================================================================
// edge-nvda-earn — 엔비디아 실적(2026-08-26) 소재를 위한 «새 각도» 사전등록 검정
// ----------------------------------------------------------------------------
// ⛔ 이미 다룬 각도는 다시 하지 않는다
//   SCRIPT_JPEARN 「幅は読める、方向は読めない」 (228회 실적, 부호검정) — 일본 312회
//   SCRIPT_LFEARN 「The earnings trade is worse than you think」 — 미국
//   ⇒ 「방향 예측 불가」는 끝났다. 아래 네 각도는 전부 «다른 질문» 이다.
//
// ── 사전등록 (재기 «전»에 적는다) ────────────────────────────────────────────
//  A) 「엔비디아 실적은 시장 전체를 흔든다」
//     지표: NVDA 실적 다음 거래일의 SPY 일중 변동폭 vs 평상일
//     검정: Welch t · 판정 p<0.05
//  B) 「덩치가 커질수록 덜 움직인다」
//     지표: 실적 다음날 |NVDA 수익률| 의 시간 추세
//     검정: 스피어만 rho (순서 ↔ 절대변동) · 판정 p<0.05
//  C) 「첫날 반응이 그 주를 결정한다」
//     지표: 실적 다음날 수익률 ↔ 그 뒤 5거래일 수익률의 상관
//     검정: 상관 t · 판정 p<0.05
//  D) 「반도체 전체가 같이 움직인다」
//     지표: 실적 다음날 NVDA 와 AMD·AVGO·MU 의 «같은 방향» 비율
//     검정: 부호검정 · 판정 p<0.05
//
// ⛔ 넷 다 실패하면 「넷 다 유의하지 않았다」고 그대로 쓰고 각도를 다시 찾는다.
// ⛔ 인과 금지. 매수·매도 권유 금지.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1].trim();
const get = async (u) => (await (await fetch(u + '&apikey=' + KEY)).json());
const eod = async (s) => {
  const j = await get(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=2015-01-01&to=2026-08-22`);
  return j.slice().sort((a, b) => a.date.localeCompare(b.date));
};

const er = (await get('https://financialmodelingprep.com/stable/earnings?symbol=NVDA&limit=60'))
  .filter((x) => x.epsActual !== null).map((x) => x.date).sort();
console.log(`  엔비디아 과거 실적 ${er.length}회 · ${er[0]} ~ ${er[er.length - 1]}`);

const [nv, spy, amd, avgo, mu] = await Promise.all(['NVDA', 'SPY', 'AMD', 'AVGO', 'MU'].map(eod));
const idx = (rows) => new Map(rows.map((r, i) => [r.date, i]));
const iN = idx(nv), iS = idx(spy);
const out = {};

/** 실적일 «다음» 거래일의 인덱스 (실적은 장 마감 후 발표) */
const nextIdx = (rows, ix, d) => {
  let k = rows.findIndex((r) => r.date > d);
  return k > 0 ? k : -1;
};
const ret = (rows, k) => rows[k].close / rows[k - 1].close - 1;
const rng = (rows, k) => (rows[k].high - rows[k].low) / rows[k].close;

const events = er.map((d) => ({ d, n: nextIdx(nv, iN, d), s: nextIdx(spy, iS, d) }))
  .filter((e) => e.n > 0 && e.s > 0 && e.n < nv.length && e.s < spy.length);
console.log(`  가격이 붙은 이벤트 ${events.length}회`);

// ── A) 시장 전체를 흔드는가 ─────────────────────────────────────────────────
{
  const evDays = new Set(events.map((e) => spy[e.s].date));
  const A = [], B = [];
  for (let k = 1; k < spy.length; k++) (evDays.has(spy[k].date) ? A : B).push(rng(spy, k) * 100);
  const m = (x) => x.reduce((a, b) => a + b, 0) / x.length;
  const v = (x, mm) => x.reduce((a, b) => a + (b - mm) ** 2, 0) / (x.length - 1);
  const ma = m(A), mb = m(B), va = v(A, ma), vb = v(B, mb);
  const t = (ma - mb) / Math.sqrt(va / A.length + vb / B.length);
  out.A = { n: A.length, evAvg: +ma.toFixed(3), normAvg: +mb.toFixed(3), t: +t.toFixed(2), ratio: +(ma / mb).toFixed(2) };
  console.log(`\n  A) 실적 다음날 SPY 일중폭 ${ma.toFixed(3)}% vs 평상 ${mb.toFixed(3)}% · ${(ma / mb).toFixed(2)}배 · t=${t.toFixed(2)} ${Math.abs(t) > 1.96 ? '✅' : '⛔'}`);
}

// ── B) 커질수록 덜 움직이는가 ───────────────────────────────────────────────
{
  const mv = events.map((e, i) => ({ i, a: Math.abs(ret(nv, e.n)) * 100, d: e.d }));
  const rank = (arr) => { const s = [...arr].sort((x, y) => x - y); return arr.map((x) => s.indexOf(x) + 1); };
  const rx = rank(mv.map((x) => x.i)), ry = rank(mv.map((x) => x.a));
  const n = rx.length;
  const dd = rx.reduce((a, _, k) => a + (rx[k] - ry[k]) ** 2, 0);
  const rho = 1 - (6 * dd) / (n * (n * n - 1));
  const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
  out.B = { n, rho: +rho.toFixed(3), t: +t.toFixed(2),
    first5: +(mv.slice(0, 5).reduce((a, b) => a + b.a, 0) / 5).toFixed(2),
    last5: +(mv.slice(-5).reduce((a, b) => a + b.a, 0) / 5).toFixed(2),
    max: mv.reduce((a, b) => b.a > a.a ? b : a) };
  console.log(`  B) 실적 다음날 절대변동 시간추세 rho=${rho.toFixed(3)} t=${t.toFixed(2)} ${Math.abs(t) > 1.96 ? '✅' : '⛔'}`);
  console.log(`     초기 5회 평균 ${out.B.first5}% → 최근 5회 ${out.B.last5}% · 최대 ${out.B.max.a.toFixed(1)}% (${out.B.max.d})`);
}

// ── C) 첫날이 그 주를 결정하는가 ────────────────────────────────────────────
{
  const P = events.filter((e) => e.n + 5 < nv.length)
    .map((e) => ({ d1: ret(nv, e.n) * 100, w: (nv[e.n + 5].close / nv[e.n].close - 1) * 100 }));
  const m = (x) => x.reduce((a, b) => a + b, 0) / x.length;
  const a = P.map((x) => x.d1), b = P.map((x) => x.w), ma = m(a), mb = m(b);
  let s = 0, x2 = 0, y2 = 0;
  for (let i = 0; i < P.length; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; x2 += x * x; y2 += y * y; }
  const r = s / Math.sqrt(x2 * y2), t = r * Math.sqrt((P.length - 2) / (1 - r * r));
  const same = P.filter((x) => Math.sign(x.d1) === Math.sign(x.w)).length;
  out.C = { n: P.length, r: +r.toFixed(3), t: +t.toFixed(2), same, samePct: +(same / P.length * 100).toFixed(1) };
  console.log(`  C) 첫날 ↔ 이후 5일 상관 r=${r.toFixed(3)} t=${t.toFixed(2)} ${Math.abs(t) > 1.96 ? '✅' : '⛔'} · 같은 방향 ${same}/${P.length}`);
}

// ── D) 반도체가 같이 가는가 ─────────────────────────────────────────────────
{
  const peers = { AMD: amd, AVGO: avgo, MU: mu };
  const res = {};
  for (const [s, rows] of Object.entries(peers)) {
    const ix = idx(rows);
    let same = 0, tot = 0;
    for (const e of events) {
      const k = nextIdx(rows, ix, e.d);
      if (k > 0 && k < rows.length) { tot++; if (Math.sign(ret(nv, e.n)) === Math.sign(ret(rows, k))) same++; }
    }
    res[s] = { same, tot, pct: +(same / tot * 100).toFixed(1) };
  }
  const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
  const tot = Object.values(res).reduce((a, b) => a + b.tot, 0);
  const same = Object.values(res).reduce((a, b) => a + b.same, 0);
  let p = 0; const kk = Math.max(same, tot - same);
  for (let i = kk; i <= tot; i++) p += C(tot, i);
  p = p / 2 ** tot * 2;
  out.D = { peers: res, same, tot, pct: +(same / tot * 100).toFixed(1), p: +p.toFixed(6) };
  console.log(`  D) 반도체 동조 ${same}/${tot} = ${(same / tot * 100).toFixed(1)}% · 부호검정 p=${p.toExponential(2)} ${p < 0.05 ? '✅' : '⛔'}`);
  for (const [s, r] of Object.entries(res)) console.log(`     ${s} ${r.same}/${r.tot} = ${r.pct}%`);
}

writeFileSync('.agent/_nvda_earn.json', JSON.stringify(out, null, 2));
console.log('\n  → .agent/_nvda_earn.json');
