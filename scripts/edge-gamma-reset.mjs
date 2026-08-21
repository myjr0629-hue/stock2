#!/usr/bin/env node
// ============================================================================
// edge-gamma-reset — 「만기가 끝나면 눌러주던 힘이 풀린다」가 사실인지 잰다
// ----------------------------------------------------------------------------
// ★ 소재 = 문 × 이상값  (.agent/CHANNEL_PLAN.md §1 §1-B)
//   문   : 🇯🇵 ガンマ 소형중앙 19,480 · 여지 68% — 우리가 잰 일본 검색어 «1위»
//   사건 : 2026-08-21 이 8월 월간 만기일. 그 «다음 주»가 이 영상이 나가는 시점이다.
//   통념 : 만기 전에는 마켓메이커 헤지가 가격을 누르고, 만기가 지나면 그게 풀려
//          변동성이 커진다. 레퍼런스 채널도 그렇게 말했다 —
//          "만기 앞두고 눌러주는 힘이 있었는데 오늘 그게 풀려. 다음 주부터 출렁임이 커질 수 있다"
//   ⇒ 아무도 재지 않았다. 우리가 잰다.
//
// ── 사전등록 (재기 «전»에 정한다) ────────────────────────────────────────────
//   기간   2021-01-01 ~ 2026-08-20
//   대상   SPY QQQ AAPL NVDA AMD TSLA MSFT AMZN META GOOGL AVGO MU  (edge-opex 와 같은 12종)
//   지표   일중 변동폭 (고가-저가)/종가
//   정의   «만기 다음 주» = 월간 만기일(셋째 금요일) 다음 거래일부터 5거래일
//          «평상 주»     = 그 외 모든 5거래일 구간 (겹치지 않게 만기주도 제외)
//   가설   만기 다음 주 변동폭 > 평상 주 변동폭
//   검정   ① 종목별 평균 비교  ② 12종목 방향 부호검정 (edge-opex 와 같은 방식)
//   ⛔ 유의하지 않으면 «유의하지 않다»고 그대로 쓴다. 통념이 틀렸다는 것도 소재다.
//
// 사용: node scripts/edge-gamma-reset.mjs
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1];
const FROM = '2021-01-01', TO = '2026-08-20';
const SYMS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'AMD', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AVGO', 'MU'];
const WIN = 5;   // 거래일

// 그 달의 셋째 금요일
const thirdFriday = (y, m) => { let d = 1; while (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 5) d++; return d + 14; };
const isOpex = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return d === thirdFriday(y, m) && new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;
};

const bars = async (s) => {
  const r = await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=${FROM}&to=${TO}&apikey=${KEY}`);
  const t = await r.text();
  return t.startsWith('[') ? JSON.parse(t).slice().reverse() : null;   // 과거→현재
};

console.log(`\n  ══ 사전등록 검정: 만기 «다음 주» 변동폭 ══`);
console.log(`  기간 ${FROM} ~ ${TO} · ${SYMS.length}종목 · 창 ${WIN}거래일\n`);

const rows = [];
for (const s of SYMS) {
  const b = await bars(s);
  if (!b || b.length < 200) { console.log(`  x ${s}`); continue; }

  const range = b.map((x) => (x.high - x.low) / x.close * 100);
  // 만기일 인덱스
  const opexIdx = [];
  b.forEach((x, i) => { if (isOpex(x.date)) opexIdx.push(i); });

  // «만기 다음 주» = 만기 다음 거래일부터 5일
  const afterSet = new Set();
  for (const i of opexIdx) for (let k = 1; k <= WIN; k++) if (i + k < b.length) afterSet.add(i + k);
  // ⛔ «만기 주»(만기일 포함 직전 5일)는 어느 쪽에도 넣지 않는다 — 그건 다른 현상이다
  const weekOfSet = new Set();
  for (const i of opexIdx) for (let k = 0; k < WIN; k++) if (i - k >= 0) weekOfSet.add(i - k);

  const after = [], normal = [];
  for (let i = 0; i < b.length; i++) {
    if (afterSet.has(i)) after.push(range[i]);
    else if (!weekOfSet.has(i)) normal.push(range[i]);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  const mA = mean(after), mN = mean(normal);
  // 웰치 t
  const t = (mA - mN) / Math.sqrt(sd(after) ** 2 / after.length + sd(normal) ** 2 / normal.length);
  const row = { s, nAfter: after.length, nNormal: normal.length, afterMean: +mA.toFixed(3), normalMean: +mN.toFixed(3),
    diffPct: +((mA / mN - 1) * 100).toFixed(1), t: +t.toFixed(2) };
  rows.push(row);
  console.log(`  ${s.padEnd(6)} 만기후 ${String(row.nAfter).padStart(4)}일 ${row.afterMean.toFixed(3)}%  ·  평상 ${String(row.nNormal).padStart(4)}일 ${row.normalMean.toFixed(3)}%  ·  차이 ${String(row.diffPct).padStart(6)}%  t=${String(row.t).padStart(6)}`);
}

// ── 전체 ────────────────────────────────────────────────────────────────────
const nA = rows.reduce((a, r) => a + r.nAfter, 0);
const nN = rows.reduce((a, r) => a + r.nNormal, 0);
const wA = rows.reduce((a, r) => a + r.afterMean * r.nAfter, 0) / nA;
const wN = rows.reduce((a, r) => a + r.normalMean * r.nNormal, 0) / nN;
const wider = rows.filter((r) => r.diffPct > 0).length;

// 부호검정 — 12개 중 k개가 같은 방향일 이항확률 (양측)
const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
const binomTwoSided = (k, n) => {
  const hi = Math.max(k, n - k);
  let p = 0; for (let i = hi; i <= n; i++) p += C(n, i);
  return Math.min(1, 2 * p / 2 ** n);
};
const pSign = binomTwoSided(wider, rows.length);

console.log(`\n  ══ 전체 ══`);
console.log(`   만기 다음 주 ${nA}일  평균 ${wA.toFixed(3)}%`);
console.log(`   평상 주      ${nN}일  평균 ${wN.toFixed(3)}%`);
console.log(`   차이 ${((wA / wN - 1) * 100).toFixed(1)}%`);
console.log(`   변동폭이 «커진» 종목 ${wider}/${rows.length}  →  부호검정 p = ${pSign.toFixed(4)}  ${pSign < 0.05 ? '✔ 유의' : '⛔ 유의하지 않다'}`);
console.log(`\n  판정: ${pSign < 0.05
  ? (wider > rows.length / 2 ? '「만기가 지나면 출렁인다」는 사실이다' : '⛔ 통념과 «반대» 방향이 유의하다')
  : '⛔ 통념을 뒷받침하는 증거가 없다 — 그것 자체가 소재다'}`);

writeFileSync('.agent/_edge_gamma_reset.json', JSON.stringify({
  preregistered: { from: FROM, to: TO, syms: SYMS, window: WIN, metric: '(high-low)/close',
    define: '만기 다음 거래일부터 5거래일 vs 만기주를 제외한 나머지 전부',
    hypothesis: '만기 다음 주 변동폭 > 평상 주' },
  rows, all: { nAfter: nA, nNormal: nN, afterMean: +wA.toFixed(3), normalMean: +wN.toFixed(3),
    diffPct: +((wA / wN - 1) * 100).toFixed(1), wider, total: rows.length, pSign: +pSign.toFixed(4) },
}, null, 1));
console.log('\n  → .agent/_edge_gamma_reset.json\n');
