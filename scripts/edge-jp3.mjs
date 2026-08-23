#!/usr/bin/env node
// ============================================================================
// edge-jp3 — 일본 채널 «터진 소재 3갈래» 의 새 수치를 잰다 (2026-08-23)
// ----------------------------------------------------------------------------
// ⛔ 왜 새로 쓰나
//   기존 edge-*.mjs 는 FMP «legacy» 엔드포인트를 쓴다. 2026-08-23 실호출에서
//   전부 "Legacy Endpoint ... no longer supported" 를 돌려준다. stable 로 다시 짠다.
//
// ── 사전등록 (재기 «전»에 정한다) ────────────────────────────────────────────
//  A) S&P500 갈래  — 「지수는 조용한데 안은 갈라졌다」의 새 증거
//     지표: SPY(시총가중) vs RSP(동일가중) 1년 수익률 격차.
//           격차가 크면 «소수가 지수를 든다» 는 뜻이다. 종목 500개를 다 안 받아도 된다.
//     가설: SPY - RSP > 0 이고, 그 값이 과거 분포의 상위권이다
//     검정: 2004-2026 전 구간의 «252거래일 격차» 백분위. >=90 이어야 인사이트로 인정
//
//  B) 10년 100만엔 갈래 — 「40배의 정체」
//     지표: NVDA·SPY 10년 일간수익. «상위 N일» 을 빼면 최종 배수가 얼마나 남나
//     ⛔ 이건 검정이 아니라 «분해» 다. 가설검정으로 포장하지 않는다.
//
//  C) ガンマ 갈래 — 「만기 다음 주는 정말 흔들리나」
//     edge-gamma-reset 과 «같은 사전등록» 을 stable 로 재실행. 기간만 오늘까지.
//     검정: 12종목 방향 부호검정
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1].trim();
const eod = async (sym, from, to) => {
  const u = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${sym}&from=${from}&to=${to}&apikey=${KEY}`;
  const j = await (await fetch(u)).json();
  if (!Array.isArray(j)) throw new Error(sym + ' ' + JSON.stringify(j).slice(0, 120));
  return j.slice().sort((a, b) => a.date.localeCompare(b.date));   // 오래된 순
};
const pct = (arr, v) => arr.filter((x) => x <= v).length / arr.length * 100;
const out = {};

// ── A) SPY vs RSP ───────────────────────────────────────────────────────────
{
  const [spy, rsp] = await Promise.all([eod('SPY', '2003-01-01', '2026-08-22'), eod('RSP', '2003-01-01', '2026-08-22')]);
  const m = new Map(rsp.map((r) => [r.date, r.close]));
  const rows = spy.filter((r) => m.has(r.date)).map((r) => ({ d: r.date, s: r.close, r: m.get(r.date) }));
  const W = 252, gaps = [];
  for (let i = W; i < rows.length; i++) {
    const a = rows[i], b = rows[i - W];
    gaps.push({ d: a.date ?? a.d, g: (a.s / b.s - 1) * 100 - (a.r / b.r - 1) * 100,
                sp: (a.s / b.s - 1) * 100, rp: (a.r / b.r - 1) * 100 });
  }
  const now = gaps[gaps.length - 1];
  const all = gaps.map((x) => x.g);
  out.A = {
    asof: now.d, spy1y: +now.sp.toFixed(2), rsp1y: +now.rp.toFixed(2), gap: +now.g.toFixed(2),
    pctile: +pct(all, now.g).toFixed(1), n: gaps.length,
    median: +all.slice().sort((a, b) => a - b)[Math.floor(all.length / 2)].toFixed(2),
    bigger: all.filter((x) => x > now.g).length,
  };
  console.log('\n  ══ A) 지수는 조용한데 안은 갈라졌다 ══');
  console.log(`   기준일 ${now.d} · 1년(252거래일)`);
  console.log(`   SPY(시총가중) ${out.A.spy1y}%  vs  RSP(동일가중) ${out.A.rsp1y}%`);
  console.log(`   격차 ${out.A.gap}%pt  ·  ${out.A.n}개 창 중 상위 ${(100 - out.A.pctile).toFixed(1)}%  (중앙 ${out.A.median}%pt)`);
  console.log(`   이보다 큰 날 ${out.A.bigger}일`);
}

// ── B) 40배의 정체 ──────────────────────────────────────────────────────────
{
  out.B = {};
  for (const sym of ['NVDA', 'SPY']) {
    const rows = await eod(sym, '2016-08-22', '2026-08-22');
    const rets = [];
    for (let i = 1; i < rows.length; i++) rets.push(rows[i].close / rows[i - 1].close - 1);
    const total = rows[rows.length - 1].close / rows[0].close;
    const sorted = rets.slice().sort((a, b) => b - a);
    const drop = (n) => {
      const cut = new Set();
      const idx = rets.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, n).map((x) => x[1]);
      idx.forEach((i) => cut.add(i));
      return rets.reduce((p, v, i) => (cut.has(i) ? p : p * (1 + v)), 1);
    };
    // 최대 낙폭 (일봉 종가 기준)
    let peak = rows[0].close, mdd = 0, mddAt = '';
    for (const r of rows) { if (r.close > peak) peak = r.close; const dd = r.close / peak - 1; if (dd < mdd) { mdd = dd; mddAt = r.date; } }
    out.B[sym] = {
      days: rets.length, x: +total.toFixed(2),
      x10: +drop(10).toFixed(2), x20: +drop(20).toFixed(2), x30: +drop(30).toFixed(2),
      best: +(sorted[0] * 100).toFixed(2), mdd: +(mdd * 100).toFixed(1), mddAt,
      from: rows[0].date, to: rows[rows.length - 1].date, p0: rows[0].close, p1: rows[rows.length - 1].close,
    };
    const b = out.B[sym];
    console.log(`\n  ══ B) ${sym} · ${b.from} → ${b.to} (${b.days}거래일) ══`);
    console.log(`   그대로 두면 ${b.x}배`);
    console.log(`   상위 10일 빼면 ${b.x10}배  ·  20일 ${b.x20}배  ·  30일 ${b.x30}배`);
    console.log(`   상위 10일이 지운 몫 ${((1 - b.x10 / b.x) * 100).toFixed(1)}%  (전체의 ${(10 / b.days * 100).toFixed(2)}% 일수)`);
    console.log(`   최대 낙폭 ${b.mdd}% (${b.mddAt})`);
  }
}

// ── C) 만기 다음 주 ─────────────────────────────────────────────────────────
{
  const SYMS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'AMD', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AVGO', 'MU'];
  const third = (y, m) => {   // 셋째 금요일
    const d = new Date(Date.UTC(y, m, 1)); let c = 0;
    while (true) { if (d.getUTCDay() === 5) { c++; if (c === 3) break; } d.setUTCDate(d.getUTCDate() + 1); }
    return d.toISOString().slice(0, 10);
  };
  const opex = new Set();
  for (let y = 2021; y <= 2026; y++) for (let m = 0; m < 12; m++) opex.add(third(y, m));

  const res = [];
  for (const s of SYMS) {
    const rows = await eod(s, '2021-01-01', '2026-08-22');
    const rng = rows.map((r) => ({ d: r.date, v: (r.high - r.low) / r.close * 100 }));
    const after = new Set();
    for (let i = 0; i < rng.length; i++) if (opex.has(rng[i].d)) for (let k = 1; k <= 5; k++) if (rng[i + k]) after.add(rng[i + k].d);
    const week = new Set();   // 만기 «주» 는 양쪽 어디에도 안 넣는다
    for (let i = 0; i < rng.length; i++) if (opex.has(rng[i].d)) for (let k = 0; k <= 4; k++) if (rng[i - k]) week.add(rng[i - k].d);
    const A = rng.filter((r) => after.has(r.d)).map((r) => r.v);
    const B = rng.filter((r) => !after.has(r.d) && !week.has(r.d)).map((r) => r.v);
    const avg = (x) => x.reduce((p, c) => p + c, 0) / x.length;
    res.push({ s, a: avg(A), b: avg(B), na: A.length, nb: B.length });
  }
  const up = res.filter((r) => r.a > r.b).length;
  // 부호검정 양측 p (n=12)
  const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
  const kk = Math.max(up, 12 - up);
  let p = 0; for (let i = kk; i <= 12; i++) p += C(12, i); p = p / 2 ** 12 * 2;
  out.C = { rows: res.map((r) => ({ s: r.s, a: +r.a.toFixed(3), b: +r.b.toFixed(3), na: r.na, nb: r.nb })), up, p: +p.toFixed(4) };
  console.log('\n  ══ C) 만기 다음 주 vs 평상 주 (일중 변동폭 %) ══');
  for (const r of res) console.log(`   ${r.s.padEnd(6)} 다음주 ${r.a.toFixed(3)} (${r.na}일)  평상 ${r.b.toFixed(3)} (${r.nb}일)  ${r.a > r.b ? '↑' : '↓'}`);
  console.log(`   12종목 중 ${up}종목이 «다음 주가 더 크다» · 부호검정 p=${p.toFixed(4)}`);
}

writeFileSync('.agent/_jp3.json', JSON.stringify(out, null, 2));
console.log('\n  → .agent/_jp3.json');
