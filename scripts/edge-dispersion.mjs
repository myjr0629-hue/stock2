#!/usr/bin/env node
// ============================================================================
// edge-dispersion — 「지수는 안 움직였는데 안에서는 찢어진 날」의 베이스레이트
// ----------------------------------------------------------------------------
// 2026-08-19 마감 실측:
//   NDX +0.11%  ·  TSLA +4.23%  ·  AAPL +2.19%  ·  MSFT +0.56%  ·  NVDA -0.99%  ·  AMD -3.71%
//   → 지수는 가만히 있었는데 «메가캡 최고↔최저» 가 7.94%p 벌어졌다.
//
// 물음: 그런 날 다음 5거래일에 지수는 어떻게 됐나. 통념은 「조용한 날 = 아무 일 없음」이다.
//
// ⛔ 사전 고정: 조건·기간·판정선을 먼저 정하고 결과를 보고 바꾸지 않는다.
//   조건   |QQQ 일간| < 0.30%  AND  메가캡 5종 최고−최저 >= 6.0%p
//   판정   표본 40건 이상 AND 대조군 대비 8%p 이상 차이
//
// 사용: node scripts/edge-dispersion.mjs
// ============================================================================

const KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const FROM = '2021-01-01', TO = '2026-08-19';
const IDX_MAX = 0.30, SPREAD_MIN = 6.0, FWD = 5;
const MEGA = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

async function bars(t) {
  const u = `https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/${FROM}/${TO}?adjusted=true&limit=50000&apiKey=${KEY}`;
  const j = await (await fetch(u)).json();
  await sleep(150);
  if (!j.results) throw new Error(`${t}: ${JSON.stringify(j).slice(0, 160)}`);
  return j.results.map((x) => ({ d: new Date(x.t).toISOString().slice(0, 10), c: x.c }));
}

const qqq = await bars('QQQ');
const legs = {};
for (const t of MEGA) legs[t] = new Map((await bars(t)).map((x) => [x.d, x.c]));

const dates = qqq.map((x) => x.d);
const Q = new Map(qqq.map((x) => [x.d, x.c]));
const ret = (M, i) => {
  const a = M.get(dates[i - 1]), b = M.get(dates[i]);
  return (a > 0 && b > 0) ? (b / a - 1) * 100 : null;
};
const fwdRet = (i, n) => {
  if (i + n >= dates.length) return null;
  const a = Q.get(dates[i]), b = Q.get(dates[i + n]);
  return (a > 0 && b > 0) ? (b / a - 1) * 100 : null;
};

const events = [], control = [];
for (let i = 1; i < dates.length; i++) {
  const q = ret(Q, i);
  if (q === null) continue;
  const rs = MEGA.map((t) => ret(legs[t], i)).filter((v) => v !== null);
  if (rs.length < MEGA.length) continue;
  const spread = Math.max(...rs) - Math.min(...rs);
  const f = fwdRet(i, FWD);
  if (f === null) continue;
  control.push(f);
  if (Math.abs(q) < IDX_MAX && spread >= SPREAD_MIN) events.push({ d: dates[i], q, spread, f });
}

const up = (a) => 100 * a.filter((v) => v > 0).length / a.length;
const eUp = up(events.map((e) => e.f)), cUp = up(control);
const gap = eUp - cUp;

console.log(`\n  조건  |QQQ 일간| < ${IDX_MAX}%  AND  메가캡(${MEGA.join('/')}) 최고−최저 >= ${SPREAD_MIN}%p`);
console.log(`  기간  ${FROM} ~ ${TO} · 이후 ${FWD}거래일 기준\n`);
console.log(`  표본       ${events.length}건`);
console.log(`  대조군     ${control.length}건 (전체 거래일)`);
console.log(`  ${FWD}일 후 상승  이벤트 ${eUp.toFixed(0)}%  vs  대조군 ${cUp.toFixed(0)}%   격차 ${gap >= 0 ? '+' : ''}${gap.toFixed(0)}%p`);
console.log(`  중앙 수익률  이벤트 ${med(events.map((e) => e.f)).toFixed(2)}%  vs  대조군 ${med(control).toFixed(2)}%`);
console.log(`  판정       ${events.length >= 40 && Math.abs(gap) >= 8 ? '★ 소재 가능' : events.length < 40 ? `표본부족(${events.length})` : '우위 없음'}`);
console.log(`\n  최근 발생일`);
for (const e of events.slice(-6))
  console.log(`    ${e.d}  QQQ ${e.q >= 0 ? '+' : ''}${e.q.toFixed(2)}%  스프레드 ${e.spread.toFixed(1)}%p  → 5일 후 ${e.f >= 0 ? '+' : ''}${e.f.toFixed(2)}%`);

// 조건을 못 넘겼을 때를 위해 완화판도 같이 낸다 (사후 채택 금지 — «표본 확보용»으로만 표기)
for (const [im, sm] of [[0.40, 5.0], [0.50, 4.0]]) {
  const ev = [];
  for (let i = 1; i < dates.length; i++) {
    const q = ret(Q, i); if (q === null) continue;
    const rs = MEGA.map((t) => ret(legs[t], i)).filter((v) => v !== null);
    if (rs.length < MEGA.length) continue;
    const f = fwdRet(i, FWD); if (f === null) continue;
    if (Math.abs(q) < im && (Math.max(...rs) - Math.min(...rs)) >= sm) ev.push(f);
  }
  const u = up(ev);
  console.log(`\n  [참고] |QQQ|<${im}% & 스프레드>=${sm}%p → 표본 ${ev.length}  상승 ${u.toFixed(0)}%  격차 ${(u - cUp) >= 0 ? '+' : ''}${(u - cUp).toFixed(0)}%p`);
}
console.log('');
