#!/usr/bin/env node
// ============================================================================
// edge-consumer-ai — 「마트 돈은 줄고 AI 설비 돈은 는다」가 얼마나 극단인가
// ----------------------------------------------------------------------------
// ★ 소재 = 네 칸
//   ① 사건    미국 실물 소비 둔화 vs AI 인프라 투자 양극화
//   ② 영향경로 소비가 식으면 경기민감주가 밀린다. 그런데 AI 설비투자는 경기와 «무관하게» 간다.
//             지수 하나만 보면 두 힘이 상쇄돼 아무것도 안 보인다.
//   ③ 우리수치 여기서 계산 — 두 축의 «격차»가 역사적으로 몇 번째인가
//   ④ 기준선   계산 후 결정
//
// ⛔ 왜 ETF 가 아니라 FRED 인가
//   FMP 일일 한도가 소진됐다 (2026-08-21). 그런데 그게 오히려 낫다 —
//   ETF 는 «주가»고, FRED 는 «실제로 얼마를 썼는지»다.
//   레퍼런스 채널은 「월마트 -9.2%, 디어 +7%」로 그날 두 종목을 든다.
//   우리는 «미국 전체가 실제로 쓴 돈»을 든다. 이게 우리가 이기는 방식이다.
//
// ── 사전등록 ─────────────────────────────────────────────────────────────────
//   소비   RSAFS  소매판매 (월간, 계절조정)
//   AI설비  A34SNO 제조업 신규주문: 컴퓨터·전자제품 (월간)
//   지표   각각 전년동월 대비 증가율(YoY%) → 그 «격차» = AI - 소비
//   가설   최근 격차가 역사적 극단이다
//   검정   백분위 (<=10 또는 >=90 이어야 인사이트로 인정)
//   기간   계열이 겹치는 전 구간 (1992~ )
//   ⛔ 극단이 아니면 그대로 적고 이 각도를 버린다.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = readFileSync('.env.local', 'utf8').match(/^FRED_API_KEY=(.+)$/m)[1].trim();
const get = async (id) => {
  const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${KEY}&file_type=json&observation_start=1992-01-01`;
  const j = await (await fetch(u)).json();
  const o = {};
  for (const x of (j.observations || [])) if (x.value !== '.') o[x.date] = Number(x.value);
  return o;
};

const CONS = await get('RSAFS');     // 소매판매
const AI = await get('A34SNO');      // 컴퓨터·전자제품 신규주문
console.log(`\n  소매판매 ${Object.keys(CONS).length}개월  ·  컴퓨터·전자 신규주문 ${Object.keys(AI).length}개월`);

// 전년동월 대비
const yoy = (S) => {
  const out = {};
  for (const d of Object.keys(S)) {
    const [y, m] = d.split('-');
    const prev = `${+y - 1}-${m}-01`;
    if (S[prev]) out[d] = (S[d] / S[prev] - 1) * 100;
  }
  return out;
};
const yC = yoy(CONS), yA = yoy(AI);
const dates = Object.keys(yC).filter((d) => yA[d] !== undefined).sort();
const gap = dates.map((d) => ({ d, c: yC[d], a: yA[d], g: yA[d] - yC[d] }));
console.log(`  공통 ${gap.length}개월  (${gap[0].d} ~ ${gap[gap.length - 1].d})`);

const pct = (arr, v) => arr.filter((x) => x <= v).length / arr.length * 100;
const now = gap[gap.length - 1];
const all = gap.map((x) => x.g);
const p = pct(all, now.g);
const sorted = all.slice().sort((a, b) => a - b);

console.log(`\n  ══ 최근 (${now.d}) ══`);
console.log(`   소매판매        ${now.c >= 0 ? '+' : ''}${now.c.toFixed(2)}%  (전년대비)`);
console.log(`   컴퓨터·전자 주문 ${now.a >= 0 ? '+' : ''}${now.a.toFixed(2)}%  (전년대비)`);
console.log(`   격차            ${now.g >= 0 ? '+' : ''}${now.g.toFixed(2)}%p`);
console.log(`\n   백분위 ${p.toFixed(1)}   (표본 ${gap.length}개월, ${gap[0].d.slice(0, 4)}년~)`);
console.log(`   분포  최저 ${sorted[0].toFixed(1)} · 중앙 ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} · 최고 ${sorted[sorted.length - 1].toFixed(1)}`);
console.log(`   판정  ${p >= 90 || p <= 10 ? '✔ 극단 — 인사이트 기준 충족' : '⛔ 평범 — 이 각도는 버린다'}`);

// 최근 12개월 추이
console.log(`\n  ══ 최근 12개월 ══`);
console.log('   월        소비YoY   AI주문YoY    격차');
for (const x of gap.slice(-12))
  console.log(`   ${x.d.slice(0, 7)}  ${x.c.toFixed(2).padStart(8)}%  ${x.a.toFixed(2).padStart(8)}%  ${x.g.toFixed(2).padStart(8)}%p`);

// 격차가 이보다 컸던 달이 몇 번인가
const bigger = all.filter((x) => x > now.g).length;
console.log(`\n  ⇒ ${gap.length}개월 중 지금보다 격차가 «큰» 달은 ${bigger}번.`);

writeFileSync('.agent/_edge_consumer_ai.json', JSON.stringify({
  preregistered: { consumer: 'RSAFS 소매판매', ai: 'A34SNO 컴퓨터·전자제품 신규주문',
    metric: '전년동월대비 증가율 격차 (AI - 소비)', test: '백분위 <=10 또는 >=90', source: 'FRED' },
  n: gap.length, from: gap[0].d, to: now.d,
  now: { date: now.d, consumerYoY: +now.c.toFixed(2), aiYoY: +now.a.toFixed(2), gap: +now.g.toFixed(2), percentile: +p.toFixed(1), biggerMonths: bigger },
  last12: gap.slice(-12),
}, null, 1));
console.log('\n  → .agent/_edge_consumer_ai.json\n');
