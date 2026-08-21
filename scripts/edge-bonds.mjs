#!/usr/bin/env node
// ============================================================================
// edge-bonds — 「채권은 주식이 빠질 때 지켜준다」가 사실인지 잰다
// ----------------------------------------------------------------------------
// C슬롯(EVERGREEN) 소재. 문: `bond yields explained` 소형중앙 64,208 — 우리가 잰 것 중 최상위.
//
// ⛔ 「너도 몰랐지?」가 되려면 «통념을 뒤집는 숫자»가 있어야 한다.
//   통념: 주식이 빠지면 채권이 오른다 (60/40 이 굴러가는 이유)
//   우리가 잴 것: 주식이 «실제로 빠진 날», 채권이 정말 올랐는가 — 베이스레이트
//
// 사전등록 (재기 전에 정한다)
//   기간   2015-01-01 ~ 2026-08-20  (금리 상승기·하락기를 모두 포함)
//   대상   SPY(주식) · TLT(장기채) · IEF(중기채)
//   정의   «하락일» = SPY 일간수익률 <= -1%
//          «지켜줬다» = 그날 채권이 «올랐다» (수익률 > 0)
//   비교   전체 기간의 채권 상승일 비율 (기본 확률)
//   검정   두 비율 z 검정
//
// ⛔ 시대를 쪼갠다. 「지켜준다」가 시기에 따라 달라지면 그게 진짜 답이다.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const key = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1];
const FROM = '2015-01-01', TO = '2026-08-20';

const bars = async (s) => {
  const r = await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=${FROM}&to=${TO}&apikey=${key}`);
  const t = await r.text();
  return t.startsWith('[') ? JSON.parse(t).slice().reverse() : null;
};

const S = {};
for (const s of ['SPY', 'TLT', 'IEF']) {
  const b = await bars(s);
  if (!b) { console.log(`  x ${s}`); process.exit(1); }
  S[s] = Object.fromEntries(b.map((x) => [x.date, x.close]));
}
const dates = Object.keys(S.SPY).filter((d) => S.TLT[d] && S.IEF[d]).sort();
console.log(`  공통 거래일 ${dates.length}  (${dates[0]} ~ ${dates[dates.length - 1]})`);

const ret = (s, i) => S[s][dates[i]] / S[s][dates[i - 1]] - 1;
const rows = [];
for (let i = 1; i < dates.length; i++)
  rows.push({ d: dates[i], spy: ret('SPY', i), tlt: ret('TLT', i), ief: ret('IEF', i) });

const zTest = (x1, n1, x2, n2) => {
  const p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2);
  return (p1 - p2) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
};

const out = { window: `${FROM}~${TO}`, n: rows.length, buckets: [] };

for (const [name, k] of [['TLT (장기채)', 'tlt'], ['IEF (중기채)', 'ief']]) {
  const base = rows.filter((r) => r[k] > 0).length;
  const down = rows.filter((r) => r.spy <= -0.01);
  const saved = down.filter((r) => r[k] > 0).length;
  const z = zTest(saved, down.length, base, rows.length);
  console.log(`\n  ══ ${name} ══`);
  console.log(`   아무 날이나       ${(base / rows.length * 100).toFixed(1)}% 상승  (${base}/${rows.length})`);
  console.log(`   주식 -1% 이하인 날 ${(saved / down.length * 100).toFixed(1)}% 상승  (${saved}/${down.length})`);
  console.log(`   차이 ${((saved / down.length - base / rows.length) * 100).toFixed(1)}%p   z = ${z.toFixed(2)}  ${Math.abs(z) > 1.96 ? '← 유의' : '(유의 아님)'}`);

  // 시대별 — 여기가 진짜 답일 수 있다
  const eras = [['2015-2019 저금리', '2015-01-01', '2019-12-31'],
                ['2020-2021 팬데믹', '2020-01-01', '2021-12-31'],
                ['2022-2026 금리상승', '2022-01-01', '2026-12-31']];
  const eraOut = [];
  for (const [label, a, b] of eras) {
    const seg = rows.filter((r) => r.d >= a && r.d <= b);
    const dn = seg.filter((r) => r.spy <= -0.01);
    if (dn.length < 20) continue;
    const sv = dn.filter((r) => r[k] > 0).length;
    eraOut.push({ era: label, n: dn.length, pct: +(sv / dn.length * 100).toFixed(1) });
    console.log(`     ${label.padEnd(16)} 하락일 ${String(dn.length).padStart(3)}일 중 ${(sv / dn.length * 100).toFixed(1)}% 방어`);
  }
  out.buckets.push({ asset: name, basePct: +(base / rows.length * 100).toFixed(1),
    downN: down.length, savedPct: +(saved / down.length * 100).toFixed(1), z: +z.toFixed(2), eras: eraOut });
}

writeFileSync('.agent/_edge_bonds.json', JSON.stringify(out, null, 1));
console.log('\n  -> .agent/_edge_bonds.json');
