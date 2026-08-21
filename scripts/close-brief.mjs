#!/usr/bin/env node
// ============================================================================
// close-brief — 미국 장이 닫힌 «직후», 그날의 소재를 자동으로 캐낸다 (B슬롯)
// ----------------------------------------------------------------------------
// ⛔ 대표 지시 2026-08-21: "장마감 브리핑은 자동으로 돌아가게해서 하는것으로 하자"
//   "종목위주로 풀어내고 가장 이슈되는것에 대한 인사이트가 있어야한다"
//
// ⛔ 무엇을 «자동화하고» 무엇을 «안 하는가»
//   자동: 데이터 수집 · 이상값 탐지 · 근거 문장 생성 · 순위
//   수동: 대본·제목  ← 여기를 자동화하면 «상황 설명»이 나온다. 그건 우리가 안 만드는 것이다.
//   즉 이 스크립트는 «브리핑»을 만든다. 영상은 그 브리핑을 읽고 사람이 짠다.
//
// ⛔ 이상값은 «자기 역사»와 비교한다
//   "AMD 가 5% 올랐다"는 소재가 아니다. "AMD 가 5% 올랐는데 그건 이 종목 기준
//   상위 3% 움직임이다"가 소재다. 비교 기준 없는 수준값은 인사이트가 아니다.
//
// 사용: node scripts/close-brief.mjs [YYYY-MM-DD]
// 출력: .agent/CLOSE_BRIEF_<날짜>.md  +  .agent/_close_brief.json
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const DAY = process.argv[2] || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1];

// 우리가 계속 추적하는 이름들 — edge-opex 와 같은 집합 + 지수
const NAMES = ['SPY', 'QQQ', 'NVDA', 'AMD', 'MU', 'AVGO', 'TSLA', 'AAPL', 'MSFT',
               'AMZN', 'META', 'GOOGL', 'SMH', 'PLTR', 'INTC', 'COIN'];

const HIST_FROM = '2024-01-01';   // z점수·백분위의 바탕
const j = async (u) => { const r = await fetch(u); const t = await r.text(); try { return JSON.parse(t); } catch { return null; } };

console.log(`\n  ══ 장마감 브리핑 ${DAY} ══\n`);

// ── ① 일봉 이력 ─────────────────────────────────────────────────────────────
const bars = {};
for (const s of NAMES) {
  const d = await j(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=${HIST_FROM}&apikey=${KEY}`);
  if (!Array.isArray(d) || d.length < 60) { console.log(`  x ${s} 이력 부족`); continue; }
  bars[s] = d.slice().reverse();      // 과거→현재
}
console.log(`  이력 확보 ${Object.keys(bars).length}/${NAMES.length}종목`);

// ── ② 우리 옵션 데이터 (프로덕션 실호출) ────────────────────────────────────
let opt = {};
try {
  const u = await j('https://www.signumhq.com/api/dashboard/unified?ticker=SPY');
  opt = u?.tickers || {};
} catch { /* 없으면 없는 대로 간다 — 지어내지 않는다 */ }
console.log(`  옵션 데이터 ${Object.keys(opt).length}종목 (maxPain·gammaFlip·PCR·다크풀)`);

// ── ③ 이상값 탐지 ───────────────────────────────────────────────────────────
const pct = (arr, v) => arr.filter((x) => x <= v).length / arr.length * 100;
const found = [];

for (const [s, b] of Object.entries(bars)) {
  const last = b[b.length - 1];
  if (last.date !== DAY && last.date > DAY) continue;     // 아직 그날 봉이 없다
  const rets = [];
  for (let i = 1; i < b.length; i++) rets.push(b[i].close / b[i - 1].close - 1);
  const r = rets[rets.length - 1];
  const abs = rets.map(Math.abs);
  const sd = Math.sqrt(rets.reduce((a, x) => a + x * x, 0) / rets.length);

  // ⓐ 그 종목 기준 «큰 하루»인가 — 자기 역사와 비교
  const p = pct(abs, Math.abs(r));
  if (p >= 95 && Math.abs(r) >= 0.03) {
    found.push({
      kind: '극단', sym: s, score: p,
      line: `${s} ${(r * 100).toFixed(2)}% — 2024년 이후 일간 변동폭 상위 ${(100 - p).toFixed(1)}% (z=${(r / sd).toFixed(2)}, n=${rets.length})`,
      evidence: `FMP 일봉 ${HIST_FROM}~${DAY} · n=${rets.length} · |수익률| 백분위 ${p.toFixed(1)}`,
    });
  }

  // ⓑ 실현변동성이 «지금» 극단인가 (20일)
  // ⛔ 하루짜리 데이터 오류가 60% 같은 값을 만든다 (2026-08-21 MSFT 사건). 걸러낸다.
  const clean = rets.filter((x) => Math.abs(x) < 0.12);
  const win = 20;
  const rv = [];
  for (let i = win; i <= clean.length; i++) {
    const w = clean.slice(i - win, i);
    rv.push(Math.sqrt(w.reduce((a, x) => a + x * x, 0) / win) * Math.sqrt(252) * 100);
  }
  const nowRv = rv[rv.length - 1];
  const prv = pct(rv, nowRv);
  if (prv >= 92 || prv <= 8) {
    found.push({
      kind: '변동성', sym: s, score: Math.max(prv, 100 - prv),
      line: `${s} 20일 실현변동성 ${nowRv.toFixed(1)}% — 자기 역사 백분위 ${prv.toFixed(0)} (창 ${rv.length}개)`,
      evidence: `FMP 일봉 · 20일 롤링 · 창 ${rv.length}개 · |일간|>12% 제외(데이터 오류 방어)`,
    });
  }

  // ⓒ 옵션 레벨과의 거리 — 우리만 낼 수 있는 값
  const o = opt[s];
  if (o?.maxPain && o?.gammaFlip !== undefined) {
    const price = last.close;
    const dMP = (price - o.maxPain) / price * 100;
    const dGF = (price - o.gammaFlipLevel) / price * 100;
    if (Math.abs(dMP) >= 4) {
      found.push({
        kind: '괴리', sym: s, score: 60 + Math.min(35, Math.abs(dMP)),
        line: `${s} 종가 $${price} — 맥스페인 $${o.maxPain} 에서 ${dMP > 0 ? '위로' : '아래로'} ${Math.abs(dMP).toFixed(1)}% 벌어져 있다`,
        evidence: `signumhq.com/api/dashboard/unified · maxPain ${o.maxPain} · gammaFlip ${o.gammaFlipLevel} · PCR ${o.pcr}`,
      });
    }
    if (Math.sign(dGF) !== 0 && Math.abs(dGF) <= 1.0) {
      found.push({
        kind: '임박', sym: s, score: 70 + (1 - Math.abs(dGF)) * 25,
        line: `${s} 종가 $${price} 가 감마플립 $${o.gammaFlipLevel} 바로 ${dGF > 0 ? '위' : '아래'} (${Math.abs(dGF).toFixed(2)}%)`,
        evidence: `signumhq.com/api/dashboard/unified · gammaFlip ${o.gammaFlipLevel} · 다크풀 ${o.darkPoolPct}%`,
      });
    }
  }
}

// ── ④ 지수 대비 «따로 논» 종목 ──────────────────────────────────────────────
if (bars.SPY) {
  const spyB = bars.SPY;
  const spyR = spyB[spyB.length - 1].close / spyB[spyB.length - 2].close - 1;
  for (const [s, b] of Object.entries(bars)) {
    if (s === 'SPY' || b.length < 2) continue;
    const r = b[b.length - 1].close / b[b.length - 2].close - 1;
    const gap = (r - spyR) * 100;
    if (Math.abs(gap) >= 3) {
      found.push({
        kind: '괴리', sym: s, score: 55 + Math.min(35, Math.abs(gap) * 4),
        line: `${s} ${(r * 100).toFixed(2)}% vs SPY ${(spyR * 100).toFixed(2)}% — 지수와 ${Math.abs(gap).toFixed(1)}%p 갈렸다`,
        evidence: `FMP 일봉 ${DAY} 종가 기준 · SPY 대비 초과수익 ${gap.toFixed(2)}%p`,
      });
    }
  }
}

found.sort((a, b) => b.score - a.score);

// ── ⑤ 브리핑 ────────────────────────────────────────────────────────────────
const top = found.slice(0, 10);
console.log(`\n  이상값 ${found.length}건 (상위 10 표시)\n`);
for (const f of top) console.log(`   [${f.kind}] ${f.line}`);

const md = [
  `# 장마감 브리핑 ${DAY}`,
  '',
  `자동 생성 — \`scripts/close-brief.mjs\`. 전부 실측이고 근거 줄이 붙어 있다.`,
  '',
  '⛔ 이건 «브리핑»이지 대본이 아니다. 여기서 하나를 골라 대본을 짠다.',
  '⛔ 「가장 큰 숫자」를 고르지 않는다. **문(수요)이 있는 것** 중에서 고른다.',
  `   🇺🇸 \`.agent/DEMAND.json\` · 🇯🇵 \`.agent/DEMAND_JA.json\` · 여지 낮은 문은 버린다.`,
  '',
  `## 이상값 ${found.length}건`,
  '',
  '| 종류 | 종목 | 내용 | 근거 |',
  '|---|---|---|---|',
  ...top.map((f) => `| ${f.kind} | ${f.sym} | ${f.line} | ${f.evidence} |`),
  '',
  '## B슬롯 후보 (마감 후 = 어젯밤 벌어진 것)',
  '',
  `- 🇺🇸 06:00 KST · 🇯🇵 08:00 JST`,
  `- 제목은 «반드시» 시장별로 가른다 — 문이 다르다 (\`.agent/CHANNEL_PLAN.md\` §2)`,
  `- 종목이 나오면 \`hook.syms\` 필수 (게이트가 막는다)`,
  '',
  '## ⛔ 인사이트 조건',
  '',
  '고른 소재가 아래 넷을 못 채우면 만들지 않는다 (`scripts/insight-check.mjs`).',
  '',
  '1. 우리가 계산한 값',
  '2. 비교 기준 (중앙값·이전창·평시)',
  '3. n >= 20',
  '4. p < 0.05 또는 백분위 <=10 / >=90',
].join('\n');

writeFileSync(`.agent/CLOSE_BRIEF_${DAY}.md`, md);
writeFileSync('.agent/_close_brief.json', JSON.stringify({ day: DAY, found, opt }, null, 1));
console.log(`\n  → .agent/CLOSE_BRIEF_${DAY}.md`);
console.log(`  → .agent/_close_brief.json\n`);
