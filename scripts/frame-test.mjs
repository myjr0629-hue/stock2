#!/usr/bin/env node
// ============================================================================
// frame-test — 「어떤 프레임의 제목이 이기는가」를 잰다
// ----------------------------------------------------------------------------
// ⛔ 왜 만드는가 (대표 지적 2026-08-21)
//   "너는 그런데 왜 이렇게 이런관점으로 조사를 못하냐?"
//   내 조사는 «어느 문으로 들어갈까»(수요·여지)만 쟀다.
//   «들어가서 어떻게 붙잡을까»(프레임·논조)는 한 번도 재지 않았다 — 방법의 구멍이었다.
//
// 재는 것: 이미 수집한 모든 영상의 «제목»을 프레임으로 분류하고,
//   같은 주제 안에서 프레임별 조회 분포를 비교한다.
//
// 프레임 분류 (배타 아님 — 하나가 여러 개일 수 있다)
//   음모·함정   trap / rigged / nobody tells you / the truth about / 罠 / 手口 / カモ / 真実
//   경고·위험   warning / danger / dont buy / mistake / 危ない / 損 / やめろ
//   비밀·내부   secret / insider / what they dont / 裏側 / 知らない
//   질문        ? / how / why / なぜ / どっち / いくら
//   숫자단정    앞머리에 숫자·퍼센트
//   중립설명    explained / guide / 解説 / とは
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const F = {
  '음모·함정': /\b(trap|rigged|scam|manipulat|nobody tells you|the truth about|lie|lying|fooled|played)\b|罠|手口|カモ|真実|騙|仕掛/i,
  '경고·위험': /\b(warning|danger|dangerous|dont buy|do not buy|mistake|avoid|too late|risk)\b|危ない|損|やめ|注意|暴落|ヤバ/i,
  '비밀·내부': /\b(secret|insider|hidden|what they|behind the)\b|裏側|知らな|内緒|こっそり/i,
  '질문형': /\?|^(why|how|what|is|are|should|will|can|do)\b|なぜ|どっち|いくら|ですか|のか/i,
  '숫자단정': /^[^a-zA-Z぀-ヿ一-龯]*[\d０-９]/,
  '중립설명': /\b(explained|explain|guide|basics|101|introduction|tutorial)\b|解説|とは|入門|基礎/i,
};

// 수집해둔 모든 스캔에서 제목+조회를 모은다
const SRC = [
  ['.agent/_jp_demand.json', (j) => j.all.map((v) => ({ t: v.t, v: v.v, mkt: 'JP', cat: v.cat }))],
  ['.agent/_topic_pool.json', (j) => j.map((v) => ({ t: v.t, v: v.v, mkt: 'US', cat: v.q }))],
  ['.agent/_jp_report_verify.json', (j) => j.rows.filter((r) => r.topT).map((r) => ({ t: r.topT, v: r.topV, mkt: 'JP', cat: r.q }))],
  ['.agent/MARKET_WANTS_US_DEEP.json', (j) => j.rows.filter((r) => r.topT).map((r) => ({ t: r.topT, v: r.topV, mkt: 'US', cat: r.theme }))],
  ['.agent/MARKET_WANTS_JP_US.json', (j) => j.rows.filter((r) => r.topT).map((r) => ({ t: r.topT, v: r.topV, mkt: 'JP', cat: r.axis }))],
];

const rows = [];
for (const [p, fn] of SRC) {
  if (!existsSync(p)) continue;
  try { rows.push(...fn(JSON.parse(readFileSync(p, 'utf8'))).filter((r) => r.t && typeof r.v === 'number')); }
  catch (e) { console.log(`  x ${p} ${String(e.message).slice(0, 60)}`); }
}
// 중복 제거
const seen = new Set(), all = [];
for (const r of rows) { const k = r.t.slice(0, 40) + '|' + r.v; if (!seen.has(k)) { seen.add(k); all.push(r); } }

const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const tag = (t) => Object.entries(F).filter(([, re]) => re.test(t)).map(([k]) => k);

for (const r of all) r.frames = tag(r.t);

console.log(`\n  표본 ${all.length}편 (US ${all.filter((r) => r.mkt === 'US').length} · JP ${all.filter((r) => r.mkt === 'JP').length})\n`);

for (const mkt of ['US', 'JP']) {
  const M = all.filter((r) => r.mkt === mkt);
  const base = med(M.map((r) => r.v));
  console.log(`  ══ ${mkt} — 전체 조회 중앙 ${base.toLocaleString()} ══`);
  console.log(`  ${'프레임'.padEnd(11)}${'편수'.padStart(5)}${'조회중앙'.padStart(10)}${'배수'.padStart(7)}${'최고'.padStart(12)}`);
  const out = [];
  for (const k of Object.keys(F)) {
    const s = M.filter((r) => r.frames.includes(k));
    if (s.length < 4) continue;
    const m = med(s.map((r) => r.v));
    out.push([m / (base || 1), k, s.length, m, Math.max(...s.map((r) => r.v))]);
  }
  const none = M.filter((r) => !r.frames.length);
  if (none.length >= 4) out.push([med(none.map((r) => r.v)) / (base || 1), '(무프레임)', none.length, med(none.map((r) => r.v)), Math.max(...none.map((r) => r.v))]);
  out.sort((a, b) => b[0] - a[0]);
  for (const [x, k, n, m, mx] of out)
    console.log(`  ${k.padEnd(11)}${String(n).padStart(5)}${m.toLocaleString().padStart(10)}${(x.toFixed(2) + 'x').padStart(7)}${mx.toLocaleString().padStart(12)}`);
  console.log('');
}

// 음모·함정 프레임의 실제 제목 예시
console.log('  ── 「음모·함정」 프레임 상위 제목 ──');
for (const r of all.filter((r) => r.frames.includes('음모·함정')).sort((a, b) => b.v - a.v).slice(0, 10))
  console.log(`   ${r.v.toLocaleString().padStart(10)}  [${r.mkt}] ${r.t.slice(0, 58)}`);

writeFileSync('.agent/_frame_test.json', JSON.stringify({ n: all.length, rows: all.map((r) => ({ t: r.t, v: r.v, mkt: r.mkt, frames: r.frames })) }, null, 1));
console.log('\n  → .agent/_frame_test.json');
