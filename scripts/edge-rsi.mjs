#!/usr/bin/env node
// ============================================================================
// edge-rsi — 「RSI 70 넘으면 과열이라 떨어진다」는 통념을 전수로 검증한다
// ----------------------------------------------------------------------------
// 왜 이 소재인가: 남은 개념 7개의 검색 수요를 실측했더니 RSI 가 1위였다.
//   rsi indicator explained  중앙 33,947 (최고 615K)  ← 1위
//   vwap 26,831 · market makers 15,881 · dark pool 404
//   ⇒ 내가 계획서에 «8순위»로 적어둔 소재가 실제로는 1위였다. 수요가 순서를 정한다.
//
// 우리 색: 개념 설명은 남들도 한다. 우리는 «그래서 실제로 어땠나»를 센다.
//
// ⛔ 사전 고정 — 결과 보고 조건을 바꾸지 않는다
//   대상   대형주 12종 (유동성·데이터 품질)
//   조건   RSI(14) 가 70 을 «상향 돌파»한 날 (전일 <=70, 당일 >70)
//   관측   이후 5거래일 종가 수익률
//   대조   같은 종목의 «모든 날» 5거래일 수익률
//   판정   표본 40+ AND 대조군 대비 8%p+
//
// 사용: node scripts/edge-rsi.mjs
// ============================================================================

const KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const FROM = '2021-01-01', TO = '2026-08-19';
const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA', 'META', 'AMZN', 'GOOGL', 'AVGO', 'MU', 'QCOM', 'INTC'];
const RSI_N = 14, HI = 70, FWD = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const up = (a) => (a.length ? 100 * a.filter((v) => v > 0).length / a.length : NaN);

async function bars(t) {
  const u = `https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/${FROM}/${TO}?adjusted=true&limit=50000&apiKey=${KEY}`;
  const j = await (await fetch(u)).json();
  await sleep(140);
  return (j.results || []).map((x) => ({ d: new Date(x.t).toISOString().slice(0, 10), c: x.c }));
}

/** Wilder RSI — 표준 정의. 단순평균으로 하면 값이 달라져 «다른 지표»가 된다 */
function rsi(closes, n = RSI_N) {
  const out = new Array(closes.length).fill(null);
  let ag = 0, al = 0;
  for (let i = 1; i <= n; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) ag += ch; else al -= ch;
  }
  ag /= n; al /= n;
  out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = n + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(0, ch)) / n;
    al = (al * (n - 1) + Math.max(0, -ch)) / n;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

const ev = [], ctl = [];
const perTicker = [];
for (const t of TICKERS) {
  const b = await bars(t);
  if (b.length < 200) { console.log(`  ${t} 데이터 부족`); continue; }
  const c = b.map((x) => x.c);
  const R = rsi(c);
  const e = [];
  for (let i = RSI_N + 1; i < c.length - FWD; i++) {
    const f = (c[i + FWD] / c[i] - 1) * 100;
    ctl.push(f);
    if (R[i - 1] !== null && R[i - 1] <= HI && R[i] > HI) { ev.push(f); e.push({ d: b[i].d, r: R[i], f }); }
  }
  perTicker.push({ t, n: e.length, up: up(e.map((x) => x.f)), med: med(e.map((x) => x.f)) });
  process.stdout.write(`\r  수집 ${perTicker.length}/${TICKERS.length}`);
}
console.log('');

const eUp = up(ev), cUp = up(ctl), gap = eUp - cUp;
console.log(`\n  조건  RSI(14) 가 ${HI} 을 상향 돌파한 날 · 대형주 ${perTicker.length}종 · ${FROM}~${TO}`);
console.log(`  관측  이후 ${FWD}거래일 종가 수익률\n`);
console.log(`  표본        ${ev.length}건`);
console.log(`  대조군      ${ctl.length}일 (같은 종목 전체)`);
console.log(`  ${FWD}일 후 상승  이벤트 ${eUp.toFixed(0)}%  vs  대조군 ${cUp.toFixed(0)}%   격차 ${gap >= 0 ? '+' : ''}${gap.toFixed(0)}%p`);
console.log(`  중앙 수익률  이벤트 ${med(ev).toFixed(2)}%  vs  대조군 ${med(ctl).toFixed(2)}%`);
console.log(`  판정        ${ev.length >= 40 && Math.abs(gap) >= 8 ? '★ 소재 가능' : ev.length < 40 ? `표본부족(${ev.length})` : '통념과 반대이거나 차이 없음'}`);

// 2표본 z 검정 — 「차이 없다」를 말하려면 검정이 필요하다
const p = (eUp / 100 * ev.length + cUp / 100 * ctl.length) / (ev.length + ctl.length);
const se = Math.sqrt(p * (1 - p) * (1 / ev.length + 1 / ctl.length));
const z = (eUp / 100 - cUp / 100) / se;
console.log(`  검정        z = ${z.toFixed(2)}  → ${Math.abs(z) > 2.58 ? '99% 유의' : Math.abs(z) > 1.96 ? '95% 유의' : '우연 범위'}`);

console.log('\n  종목별');
console.log('  ' + '티커'.padEnd(8) + '표본'.padStart(6) + '상승%'.padStart(8) + '중앙%'.padStart(8));
for (const r of perTicker.sort((a, b) => b.n - a.n))
  console.log('  ' + r.t.padEnd(8) + String(r.n).padStart(6) + r.up.toFixed(0).padStart(7) + '%' + r.med.toFixed(2).padStart(8));
console.log('');
