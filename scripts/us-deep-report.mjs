#!/usr/bin/env node
// us-deep-report — us-deep 결과를 «테마 단위»로 판정한다
// ⛔ 질의 하나하나는 흔들린다. 테마로 묶어야 판단이 선다.
import { readFileSync } from 'node:fs';
const D = JSON.parse(readFileSync('.agent/MARKET_WANTS_US_DEEP.json', 'utf8'));
const R = D.rows;
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const byTheme = {};
for (const r of R) (byTheme[r.theme] ||= []).push(r);

const rows = Object.entries(byTheme).map(([t, rs]) => ({
  theme: t, n: rs.length,
  demand: med(rs.map((r) => r.demand)),
  room: Math.round(med(rs.map((r) => r.room))),
  smallMed: med(rs.map((r) => r.smallMed)),
  smallMax: Math.max(...rs.map((r) => r.smallMax)),
  best: rs.slice().sort((a, b) => b.smallMed - a.smallMed)[0],
})).sort((a, b) => b.smallMed - a.smallMed);

console.log(`\n  ══ 테마 판정 (질의 ${R.length}개) — «소형 채널이 실제로 받는 조회» 순 ══\n`);
console.log(`  ${'테마'.padEnd(13)}${'질의'.padStart(4)}${'수요중앙'.padStart(10)}${'여지'.padStart(6)}${'소형중앙'.padStart(10)}${'소형최고'.padStart(11)}  대표 검색어`);
for (const r of rows)
  console.log(`  ${r.theme.padEnd(13)}${String(r.n).padStart(4)}${r.demand.toLocaleString().padStart(10)}${(r.room + '%').padStart(6)}${r.smallMed.toLocaleString().padStart(10)}${r.smallMax.toLocaleString().padStart(11)}  ${r.best?.q ?? ''}`);

console.log(`\n  ══ 질의 상위 25 — 소형 채널 기준 ══\n`);
const top = R.slice().sort((a, b) => b.score - a.score).slice(0, 25);
console.log(`  ${'#'.padStart(2)} ${'점수'.padStart(5)} ${'수요'.padStart(9)} ${'여지'.padStart(5)} ${'소형중앙'.padStart(9)} ${'소형최고'.padStart(10)}  테마 · 검색어`);
top.forEach((r, i) => console.log(
  `  ${String(i + 1).padStart(2)} ${String(r.score).padStart(5)} ${r.demand.toLocaleString().padStart(9)} ${(r.room + '%').padStart(5)} ${r.smallMed.toLocaleString().padStart(9)} ${r.smallMax.toLocaleString().padStart(10)}  ${r.theme} · ${r.q}`));

console.log(`\n  ══ 만들지 말 것 — 수요는 크나 소형 채널이 못 받는 것 ══\n`);
const trap = R.filter((r) => r.demand > 20000 && r.smallMed < 2000).sort((a, b) => b.demand - a.demand).slice(0, 12);
console.log(`  ${'수요'.padStart(9)} ${'여지'.padStart(5)} ${'소형중앙'.padStart(9)}  검색어`);
for (const r of trap) console.log(`  ${r.demand.toLocaleString().padStart(9)} ${(r.room + '%').padStart(5)} ${r.smallMed.toLocaleString().padStart(9)}  ${r.q}`);
