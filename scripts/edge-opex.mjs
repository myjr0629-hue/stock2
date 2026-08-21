#!/usr/bin/env node
// ============================================================================
// edge-opex — 「옵션 만기일에 가격이 묶인다(pinning)」가 사실인지 잰다
// ----------------------------------------------------------------------------
// ⛔ 왜 이 방식인가
//   맥스페인 «이력»은 우리에게 없다 (Redis 는 현재값, FMP 는 옵션 미제공).
//   그래서 맥스페인 수렴을 직접 백테스트할 수는 없다.
//   대신 **핀이 진짜라면 가격에 흔적이 남는다** — 만기일의 «일중 변동폭»이 눌린다.
//   그건 일봉만으로 잴 수 있고, 표본이 크다.
//
// 사전등록 (측정 전에 정한다 — 나중에 유리하게 바꾸지 않는다)
//   대상 : 옵션 유동성이 큰 대형주·ETF 12종
//   기간 : 2021-01-01 ~ 2026-08-20
//   정의 : 월간 만기일 = 매월 «셋째 금요일»
//   지표 : 일중 변동폭 = (고가 − 저가) / 종가
//   비교 : 셋째 금요일 vs «나머지 모든 금요일» (요일 효과를 제거하려고 금요일끼리 비교)
//   검정 : Welch t 검정 + 종목별 부호 일치 개수
//
// 사용: node scripts/edge-opex.mjs
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const key = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1];
const SYMS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'AMD', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AVGO', 'MU'];
const FROM = '2021-01-01', TO = '2026-08-20';

const bars = async (s) => {
  const r = await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=${FROM}&to=${TO}&apikey=${key}`);
  const t = await r.text();
  return t.startsWith('[') ? JSON.parse(t).slice().reverse() : null;
};

/** 그 날짜가 그 달의 «셋째 금요일»인가 */
function isThirdFriday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCDay() !== 5) return false;
  // 그 달 첫 금요일 찾기
  let first = 1;
  while (new Date(Date.UTC(y, m - 1, first)).getUTCDay() !== 5) first++;
  return d === first + 14;
}
const isFriday = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;
};

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const varr = (a) => { const m = mean(a); return a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1); };
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const rows = [];
let allOpex = [], allOther = [];
for (const s of SYMS) {
  const b = await bars(s);
  if (!b || b.length < 200) { console.log(`  x ${s}`); continue; }
  const opex = [], other = [];
  for (const x of b) {
    if (!x.high || !x.low || !x.close) continue;
    if (!isFriday(x.date)) continue;
    const rng = (x.high - x.low) / x.close * 100;
    (isThirdFriday(x.date) ? opex : other).push(rng);
  }
  if (opex.length < 20 || other.length < 40) { console.log(`  x ${s} 표본부족`); continue; }
  const mo = mean(opex), mt = mean(other);
  const t = (mo - mt) / Math.sqrt(varr(opex) / opex.length + varr(other) / other.length);
  rows.push({ s, nOpex: opex.length, nOther: other.length, opexMean: +mo.toFixed(3), otherMean: +mt.toFixed(3),
    opexMed: +med(opex).toFixed(3), otherMed: +med(other).toFixed(3),
    diffPct: +((mo / mt - 1) * 100).toFixed(1), t: +t.toFixed(2) });
  allOpex.push(...opex); allOther.push(...other);
  console.log(`  ${s.padEnd(6)} 만기일 ${String(opex.length).padStart(3)}일 ${mo.toFixed(2)}%   나머지금요일 ${String(other.length).padStart(3)}일 ${mt.toFixed(2)}%   차이 ${((mo / mt - 1) * 100).toFixed(1)}%  t=${t.toFixed(2)}`);
}

const MO = mean(allOpex), MT = mean(allOther);
const T = (MO - MT) / Math.sqrt(varr(allOpex) / allOpex.length + varr(allOther) / allOther.length);
const narrower = rows.filter((r) => r.diffPct < 0).length;

console.log('\n  ══ 전체 ══');
console.log(`  만기일(셋째 금요일)  ${allOpex.length}일  평균 일중폭 ${MO.toFixed(3)}%  중앙 ${med(allOpex).toFixed(3)}%`);
console.log(`  나머지 금요일        ${allOther.length}일  평균 일중폭 ${MT.toFixed(3)}%  중앙 ${med(allOther).toFixed(3)}%`);
console.log(`  차이 ${((MO / MT - 1) * 100).toFixed(1)}%   t = ${T.toFixed(2)}  ${Math.abs(T) > 1.96 ? '← 유의' : '(유의 아님)'}`);
console.log(`  종목 ${rows.length}개 중 만기일이 «더 좁은» 종목 ${narrower}개`);

writeFileSync('.agent/_edge_opex.json', JSON.stringify({
  preregistered: { from: FROM, to: TO, syms: SYMS, metric: '(high-low)/close', compare: 'third Friday vs other Fridays' },
  rows, all: { nOpex: allOpex.length, nOther: allOther.length, opexMean: +MO.toFixed(3), otherMean: +MT.toFixed(3),
    opexMed: +med(allOpex).toFixed(3), otherMed: +med(allOther).toFixed(3),
    diffPct: +((MO / MT - 1) * 100).toFixed(1), t: +T.toFixed(2), narrower, total: rows.length },
}, null, 1));
console.log('\n  -> .agent/_edge_opex.json');
