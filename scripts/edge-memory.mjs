#!/usr/bin/env node
// ============================================================================
// edge-memory — 「메모리가 지수를 거스른 날」의 베이스레이트
// ----------------------------------------------------------------------------
// 2026-08-21 ET 11:28 실측: QQQ -0.61% 인데 MU +2.02 · WDC +2.04 · SNDK +1.70.
//   메모리 평균이 지수를 3%p 가까이 앞선다.
// 통념: "칩이 오르면 지수도 오른다 / 지수가 빠지면 다 빠진다"
//
// ⛔ 사전 고정
//   조건  QQQ 일간 <= 0%  AND  (메모리3 평균 - QQQ) >= 2.0%p
//   관측  이후 5거래일 «메모리3 평균» 수익률
//   대조  같은 기간 모든 날의 메모리3 평균 5일 수익률
//   판정  표본 40+ AND 대조군 대비 8%p+
// ============================================================================
const KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const FROM = '2021-01-01', TO = '2026-08-20';
const MEM = ['MU', 'WDC', 'STX'];            // SNDK 는 상장 이력이 짧다 → STX 로 대체
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const up = (a) => (a.length ? 100 * a.filter((v) => v > 0).length / a.length : NaN);
async function bars(t) {
  const j = await (await fetch(`https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/${FROM}/${TO}?adjusted=true&limit=50000&apiKey=${KEY}`)).json();
  await sleep(140);
  return (j.results || []).map((x) => ({ d: new Date(x.t).toISOString().slice(0, 10), c: x.c }));
}
const qqq = await bars('QQQ');
const M = {};
for (const t of MEM) M[t] = new Map((await bars(t)).map((x) => [x.d, x.c]));
const D = qqq.map((x) => x.d);
const Q = new Map(qqq.map((x) => [x.d, x.c]));
const ret = (map, i) => { const a = map.get(D[i - 1]), b = map.get(D[i]); return (a > 0 && b > 0) ? (b / a - 1) * 100 : null; };
const fwdMem = (i, n) => {
  if (i + n >= D.length) return null;
  const rs = MEM.map((t) => { const a = M[t].get(D[i]), b = M[t].get(D[i + n]); return (a > 0 && b > 0) ? (b / a - 1) * 100 : null; }).filter((v) => v !== null);
  return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
};
const ev = [], ctl = [];
for (let i = 1; i < D.length - 5; i++) {
  const q = ret(Q, i); if (q === null) continue;
  const rs = MEM.map((t) => ret(M[t], i)).filter((v) => v !== null);
  if (rs.length < MEM.length) continue;
  const memAvg = rs.reduce((a, b) => a + b, 0) / rs.length;
  const f = fwdMem(i, 5); if (f === null) continue;
  ctl.push(f);
  if (q <= 0 && (memAvg - q) >= 2.0) ev.push({ d: D[i], q, memAvg, f });
}
const eUp = up(ev.map((e) => e.f)), cUp = up(ctl), gap = eUp - cUp;
console.log(`\n  조건  QQQ <= 0%  AND  메모리3(${MEM.join('/')}) 평균 - QQQ >= 2.0%p`);
console.log(`  관측  이후 5거래일 메모리3 평균\n`);
console.log(`  표본        ${ev.length}건 · 대조군 ${ctl.length}일`);
console.log(`  5일 후 상승  이벤트 ${eUp.toFixed(0)}%  vs  대조군 ${cUp.toFixed(0)}%   격차 ${gap >= 0 ? '+' : ''}${gap.toFixed(0)}%p`);
console.log(`  중앙 수익률  이벤트 ${med(ev.map((e) => e.f)).toFixed(2)}%  vs  대조군 ${med(ctl).toFixed(2)}%`);
const p = (eUp / 100 * ev.length + cUp / 100 * ctl.length) / (ev.length + ctl.length);
const se = Math.sqrt(p * (1 - p) * (1 / ev.length + 1 / ctl.length));
const z = (eUp / 100 - cUp / 100) / se;
console.log(`  검정        z = ${z.toFixed(2)}  → ${Math.abs(z) > 2.58 ? '99% 유의' : Math.abs(z) > 1.96 ? '95% 유의' : '우연 범위'}`);
console.log(`  판정        ${ev.length >= 40 && Math.abs(gap) >= 8 ? '★ 소재 가능' : ev.length < 40 ? `표본부족(${ev.length})` : '차이 없음'}`);
// ── 방향이 아니라 «폭» 인가 ────────────────────────────────────────────────
//    최근 사례가 +12.1 / -16.1 / +2.5 / -9.3 / +8.5 / -7.7 로 방향은 반반인데 폭이 크다.
//    방향(상승률)이 아니라 «절대 변동폭»을 재본다.
const absE = ev.map((e) => Math.abs(e.f)), absC = ctl.map((v) => Math.abs(v));
const bigE = 100 * absE.filter((v) => v >= 8).length / absE.length;
const bigC = 100 * absC.filter((v) => v >= 8).length / absC.length;
console.log('');
console.log('  == 방향이 아니라 «폭» ==');
console.log(`  5일 절대변동 중앙   이벤트 ${med(absE).toFixed(2)}%  vs  대조군 ${med(absC).toFixed(2)}%`);
console.log(`  8% 이상 움직인 비율  이벤트 ${bigE.toFixed(0)}%  vs  대조군 ${bigC.toFixed(0)}%   격차 ${(bigE - bigC) >= 0 ? '+' : ''}${(bigE - bigC).toFixed(0)}%p`);
{
  const pp = (bigE / 100 * absE.length + bigC / 100 * absC.length) / (absE.length + absC.length);
  const se2 = Math.sqrt(pp * (1 - pp) * (1 / absE.length + 1 / absC.length));
  const z2 = (bigE / 100 - bigC / 100) / se2;
  console.log(`  검정               z = ${z2.toFixed(2)}  -> ${Math.abs(z2) > 2.58 ? '99% 유의' : Math.abs(z2) > 1.96 ? '95% 유의' : '우연 범위'}`);
}
console.log('\n  최근 발생');
for (const e of ev.slice(-6)) console.log(`   ${e.d}  QQQ ${e.q.toFixed(2)}%  메모리 ${e.memAvg >= 0 ? '+' : ''}${e.memAvg.toFixed(2)}%  → 5일 후 ${e.f >= 0 ? '+' : ''}${e.f.toFixed(2)}%`);
console.log('');
