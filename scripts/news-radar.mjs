#!/usr/bin/env node
// ============================================================================
// news-radar — 「세상에 무슨 일이 벌어졌고, 그게 우리 숫자에 어떻게 나타나는가」
// ----------------------------------------------------------------------------
// ⛔ 대표 지적 2026-08-21 — 이게 이 파일이 생긴 이유다
//   "지수 지표만 늘어놓는것이 아니라 스토리로 풀어내야 한다"
//   "경제지표발표가 주는 영향, 지정학적인것이 발생했는데 이것이 주는 영향"
//   "왜 우리 소스가 다 있는데 ... 가디언페이지에도 주요뉴스가 표시되게 해놨는데"
//   "사람들은 수치가 얼마인지보다, 세계에 어떤 일이 벌어지고 그것이 이렇게
//    해석될 수 있구나, 그리고 그것이 이렇게 수치로 나타나는구나에 더 관심이 많다"
//
// ⛔ 그리고 «기준선»은 뒤에 붙이는 것이 아니다
//   지금까지 나는 소재를 「문 × 이상값」으로만 골랐다. 그래서 통계적 이상값은
//   나왔지만 «오늘 밤 확인할 숫자»가 없었고, 결론이 「통화 베팅이다」처럼 추상으로 끝났다.
//   ⇒ 소재는 «네 칸이 다 차야» 소재다. 하나라도 비면 소재가 아니다.
//
//        ① 사건      세상에서 무슨 일이 벌어졌나        (가디언 뉴스·캘린더)
//        ② 영향 경로  그게 «왜» 시장에 닿나              (해석 — 이 한 줄이 스토리다)
//        ③ 우리 수치  그 영향이 «우리 데이터»에 어떻게 찍혔나 (베이스레이트 — 우리만 낸다)
//        ④ 기준선     오늘 밤 확인할 숫자 «하나»          (없으면 소재가 아니다)
//
// 사용: node scripts/news-radar.mjs
// 출력: .agent/NEWS_RADAR_<날짜>.md + .agent/_news_radar.json
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://www.signumhq.com';
const DAY = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)?.[1];

const get = async (u) => { try { const r = await fetch(u, { headers: { accept: 'application/json' } }); const t = await r.text(); return JSON.parse(t); } catch { return null; } };

console.log(`\n  ══ 뉴스 레이더 ${DAY} ══\n`);

// ── ① 세상에서 벌어진 일 ────────────────────────────────────────────────────
const [digest, cal, fed, breaking] = await Promise.all([
  get(`${BASE}/api/guardian/news-digest`),
  get(`${BASE}/api/guardian/economic-calendar`),
  get(`${BASE}/api/guardian/fedwatch`),
  get(`${BASE}/api/guardian/breaking`),
]);

const news = digest?.items || [];
console.log(`  뉴스 ${news.length}건 · 캘린더 ${cal?.events?.length || 0}건 · 속보 ${breaking?.count || 0}건`);
console.log(`  시장맥락: ${digest?.marketContext || '(없음)'}\n`);

// ── ② 오늘·내일 발표되는 지표 — 「지표가 주는 영향」의 재료 ──────────────────
// ⛔ 예상치와 직전값이 «둘 다» 있어야 「세게 나왔다/약하게 나왔다」를 말할 수 있다.
//   숫자 하나만 있으면 그건 수치 나열이지 해석이 아니다.
const soon = (cal?.events || [])
  .filter((e) => e.date >= DAY && e.date <= new Date(Date.parse(DAY) + 2 * 86400000).toISOString().slice(0, 10))
  .filter((e) => e.estimate != null && e.previous != null)
  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

console.log(`  ── 48시간 안에 나오는 지표 (예상·직전 둘 다 있는 것) ${soon.length}건 ──`);
for (const e of soon.slice(0, 8)) {
  const dir = e.estimate > e.previous ? '↑' : e.estimate < e.previous ? '↓' : '=';
  console.log(`   ${e.date} ${e.time}  [${e.impact}] ${e.event}`);
  console.log(`      예상 ${e.estimate} vs 직전 ${e.previous} ${dir}${e.actual != null ? `  → 실제 ${e.actual}` : ''}`);
}

// ── ③ 연준 확률 — 변화가 있어야 이야기가 된다 ───────────────────────────────
if (fed && fed.noChange != null) {
  const d = (k, p) => (fed[k] != null && fed[p] != null) ? +(fed[k] - fed[p]).toFixed(1) : null;
  const dh = d('hike', 'prevHike'), dn = d('noChange', 'prevNoChange'), de = d('ease', 'prevEase');
  console.log(`\n  ── 연준 (FOMC ${fed.daysUntilFomc ?? '?'}일 뒤) ──`);
  console.log(`   인상 ${fed.hike}% (${dh > 0 ? '+' : ''}${dh}p) · 동결 ${fed.noChange}% (${dn > 0 ? '+' : ''}${dn}p) · 인하 ${fed.ease}% (${de > 0 ? '+' : ''}${de}p)`);
  if (Math.abs(dh ?? 0) >= 1.5) console.log(`   ⇒ 인상 확률이 하루 만에 ${Math.abs(dh)}%p 움직였다 — 이게 사건이다`);
}

// ── ④ 우리 실시간 수치 — 뉴스를 «우리 숫자»에 붙인다 ────────────────────────
const unified = await get(`${BASE}/api/dashboard/unified?ticker=SPY`);
const T = unified?.tickers || {};

// 시장맥락 문자열에서 자산 값을 뽑는다 (가디언이 이미 만든 값 — 다시 계산하지 않는다)
const ctx = {};
for (const m of String(digest?.marketContext || '').matchAll(/([A-Za-z0-9 &]+):\s*\$?([\d.,]+)\s*\(([-+][\d.]+)%\)/g)) {
  ctx[m[1].trim()] = { v: m[2], chg: +m[3] };
}

// ── ⑤ 스토리 후보 조립 ──────────────────────────────────────────────────────
// ⛔ 「우리 수치」칸은 «제안»이다. 실제 값은 사전등록 후 edge-*.mjs 로 계산한다.
//   여기서 숫자를 지어내지 않는다 — 무엇을 재야 하는지만 지목한다.
const PROBE = {
  GEOPOLITICAL: '유가가 하루 N% 이상 오른 날 이후 5거래일, 섹터별(XLE·XLU·SMH·SPY) 수익률 베이스레이트',
  MACRO: '10년물이 하루 X bp 오른 날의 주식 방어율 — 시대별로 쪼갠다 (2015~19 / 20~21 / 22~26)',
  US_MARKET: '그 지표가 극단이던 과거 구간의 이후 수익률 분포 — 백분위로',
  SECTOR: '그 섹터가 지수와 갈라진 날의 이후 수렴/발산 베이스레이트',
  GLOBAL: '해당 지역 지표 서프라이즈 이후 미국 지수 반응 베이스레이트',
};

const stories = news
  .filter((n) => n.impact && n.headline)
  .map((n) => {
    const cat = n.category || 'US_MARKET';
    return {
      event: n.headline,
      category: cat,
      impact: n.impact,
      // ② 영향 경로 — 가디언이 이미 «한·영·일» 세 언어로 써뒀다.
      //   ⛔ 처음엔 한국어만 들고 왔다. 일본 채널 대본을 쓸 때 다시 번역하게 되는데,
      //     번역하면 원문의 뉘앙스가 한 번 더 깎인다. 세 개를 다 들고 간다.
      mechanism: (n.analysisKR || '').slice(0, 200),
      mechanismEN: (n.analysisEN || '').slice(0, 200),
      mechanismJP: (n.analysisJP || '').slice(0, 200),
      summaryKR: (n.summaryKR || '').slice(0, 160),
      summaryJP: (n.summaryJP || '').slice(0, 160),
      ourProbe: PROBE[cat] || PROBE.US_MARKET,           // ③ 우리가 «재야 할» 것
      anchor: null,                                       // ④ 기준선 — 아직 비어 있다
      tickers: n.tickers || [],
    };
  });

// ④ 기준선 후보를 «우리 옵션 데이터»에서 붙여준다
const anchors = [];
for (const [sym, o] of Object.entries(T)) {
  if (o?.maxPain) anchors.push(`${sym} 맥스페인 $${o.maxPain}`);
  if (o?.gammaFlipLevel) anchors.push(`${sym} 감마플립 $${o.gammaFlipLevel}`);
}
for (const e of soon.slice(0, 3)) anchors.push(`${e.event} 예상 ${e.estimate} (직전 ${e.previous})`);
if (fed?.hike != null) anchors.push(`FOMC 인상확률 ${fed.hike}%`);

console.log(`\n  ── 스토리 후보 ${stories.length}건 ──`);
for (const s of stories.slice(0, 6)) {
  console.log(`\n   [${s.category} · ${s.impact}] ${s.event.slice(0, 68)}`);
  console.log(`     ② 영향 경로: ${s.mechanism.slice(0, 110)}`);
  console.log(`     ③ 재야 할 것: ${s.ourProbe}`);
  console.log(`     ④ 기준선   : ⛔ 비어 있다 — 아래 후보에서 «하나»를 고른다`);
}

console.log(`\n  ── ④ 기준선 후보 (오늘 밤 확인 가능한 숫자) ${anchors.length}개 ──`);
anchors.slice(0, 12).forEach((a) => console.log(`   · ${a}`));

// ── 브리핑 ──────────────────────────────────────────────────────────────────
const md = [
  `# 뉴스 레이더 ${DAY}`,
  '',
  '자동 생성 — `scripts/news-radar.mjs`. 가디언 뉴스·캘린더·페드워치 + 우리 옵션 데이터.',
  '',
  '## ⛔ 소재는 «네 칸이 다 차야» 소재다',
  '',
  '| 칸 | 뜻 | 어디서 |',
  '|---|---|---|',
  '| ① 사건 | 세상에서 무슨 일이 벌어졌나 | 가디언 뉴스·캘린더 |',
  '| ② 영향 경로 | 그게 **왜** 시장에 닿나 | 해석 — 이 한 줄이 스토리다 |',
  '| ③ 우리 수치 | 그 영향이 **우리 데이터**에 어떻게 찍혔나 | 사전등록 → `edge-*.mjs` |',
  '| ④ 기준선 | **오늘 밤 확인할 숫자 하나** | 아래 후보 |',
  '',
  '**하나라도 비면 만들지 않는다.** ③이 없으면 뉴스 재방송이고, ④가 없으면 추상으로 끝난다.',
  '',
  `## 시장 맥락`,
  '',
  '```',
  digest?.marketContext || '(없음)',
  '```',
  '',
  `## 48시간 안에 나오는 지표`,
  '',
  '| 시각 | 영향 | 지표 | 예상 | 직전 |',
  '|---|---|---|---|---|',
  ...soon.slice(0, 10).map((e) => `| ${e.date} ${e.time} | ${e.impact} | ${e.event} | ${e.estimate} | ${e.previous} |`),
  '',
  `## 연준`,
  '',
  fed?.noChange != null
    ? `인상 **${fed.hike}%** · 동결 ${fed.noChange}% · 인하 ${fed.ease}%  (FOMC ${fed.daysUntilFomc ?? '?'}일 뒤)`
    : '(데이터 없음)',
  '',
  `## 스토리 후보 ${stories.length}건`,
  '',
  ...stories.flatMap((s) => [
    `### [${s.category} · ${s.impact}] ${s.event}`,
    '',
    `- **② 영향 경로**: ${s.mechanism}`,
    `- **② 영향 경로 (JP)**: ${s.mechanismJP || '(없음)'}`,
    `- **③ 재야 할 것**: ${s.ourProbe}`,
    `- **④ 기준선**: ⛔ 미정`,
    '',
  ]),
  `## ④ 기준선 후보`,
  '',
  ...anchors.map((a) => `- ${a}`),
].join('\n');

writeFileSync(`.agent/NEWS_RADAR_${DAY}.md`, md);
writeFileSync('.agent/_news_radar.json', JSON.stringify({ day: DAY, marketContext: digest?.marketContext, stories, soon, fed, anchors }, null, 1));
console.log(`\n  → .agent/NEWS_RADAR_${DAY}.md`);
console.log(`  → .agent/_news_radar.json\n`);
