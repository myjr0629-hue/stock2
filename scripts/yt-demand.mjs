#!/usr/bin/env node
// ============================================================================
// yt-demand — 「사람들이 실제로 검색하는 말」 × 「공급이 약한 자리」
// ----------------------------------------------------------------------------
// 왜: 우리 유입 검색어만 보면 «이미 우리를 찾은 사람»만 보인다. 새 소재를 찾으려면
//     시장 전체의 수요를 봐야 한다.
//
// 두 신호를 교차한다
//   ① 수요 — 유튜브 자동완성. 구글이 인기순으로 돌려주는 «실제 타이핑 문자열»
//   ② 공급 — 그 검색어의 상위 쇼츠 조회수·최신성
//
// ⛔ 1차본의 결함 (2026-08-20 실측): 동음이의어가 상위를 먹었다.
//    dark poolrooms(공포 게임) 99.8만 · max pain rap(노래) 34만 · intel stock cooler(CPU쿨러) 21만.
//    조회수만 보면 «금맥»처럼 보이지만 우리와 무관하다.
//    → 상위 영상 «제목»을 읽어 금융 관련성을 검사하고, 통과 못 하면 버린다.
//
// ⚠️ search.list 는 1회 100유닛 (일 10,000).
//
// 사용: node scripts/yt-demand.mjs [질의수=40]
// 출력: .agent/TOPIC_BANK.json
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const LIMIT = Number(process.argv[2] || 40);
const env = readFileSync('.env.local', 'utf8');
const KEY = (env.match(/^YOUTUBE_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) { console.error('YOUTUBE_API_KEY 없음'); process.exit(1); }

// ── 씨앗 — «시장 전체». 종목만이 아니라 지수·매크로·이벤트·개념까지 ──────────
const SEEDS = [
  // 지수·시장 전반
  'stock market crash', 'stock market today explained', 'sp500 forecast', 'nasdaq today',
  'why stocks are falling', 'is the market going to crash',
  // 매크로 이벤트
  'fed rate cut', 'cpi report', 'jobs report stocks', 'inflation stocks', 'recession 2026',
  'bond yields explained', 'dollar index explained',
  // 옵션·구조 (우리 고유 영역)
  'options explained', 'max pain options', 'gamma squeeze stock', 'dark pool trading',
  'unusual options activity', 'market makers manipulation', 'why my option lost money',
  // 섹터·테마
  'ai stocks', 'semiconductor stocks', 'quantum computing stocks', 'nuclear energy stocks',
  'defense stocks', 'gold price forecast', 'bitcoin price prediction',
  // 종목 (검색량 큰 것)
  'nvidia stock', 'tesla stock', 'amd stock', 'palantir stock', 'apple stock',
];

/** 금융 맥락인지 — 상위 영상 «제목»으로 판정한다 */
const FIN = /\b(stock|stocks|market|shares?|earnings|options?|calls?|puts?|trading|trader|invest|investor|investing|nasdaq|s&p|sp500|dow|fed|inflation|cpi|rate|yield|bond|etf|portfolio|bullish|bearish|rally|crash|selloff|dividend|valuation|ticker|nyse|premarket|price target|analyst)\b/i;
const NOISE = /\b(cooler|rap|ost|lyrics|song|album|anime|movie|trailer|game|gaming|backrooms|poolrooms|minecraft|roblox|recipe|workout|asmr)\b/i;

async function suggest(q) {
  const u = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    return (JSON.parse(await r.text())[1] || []).filter((s) => typeof s === 'string');
  } catch { return []; }
}

console.log('\n  ① 수요 — 자동완성 수집 (씨앗 ' + SEEDS.length + '개)');
const pool = new Map();
for (const s of SEEDS) {
  (await suggest(s)).forEach((q, i) => {
    if (!pool.has(q) && !NOISE.test(q)) pool.set(q, { q, seed: s, rank: i });
  });
}
console.log(`  후보 ${pool.size}개 (노이즈 단어 사전 제거 후)`);

const cands = [...pool.values()]
  .filter((c) => c.q.length > 9 && !SEEDS.includes(c.q))
  .sort((a, b) => a.rank - b.rank)
  .slice(0, LIMIT);

console.log(`\n  ② 공급 — 상위 쇼츠 실측 + 관련성 검사 (${cands.length}건 · ${cands.length * 100}유닛)\n`);
const out = [], dropped = [];
for (const c of cands) {
  const s = await fetch('https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({
    part: 'snippet', q: c.q, type: 'video', videoDuration: 'short',
    maxResults: '10', regionCode: 'US', relevanceLanguage: 'en', order: 'relevance', key: KEY,
  })).then((r) => r.json());
  if (s.error) { console.error('  ✗ 쿼터/오류:', s.error.message); break; }
  const ids = (s.items || []).map((i) => i.id.videoId).filter(Boolean);
  if (ids.length < 4) continue;
  const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids.join(',')}&key=${KEY}`).then((r) => r.json());
  const items = (v.items || []).map((it) => ({
    title: it.snippet.title,
    views: +(it.statistics.viewCount || 0),
    ageD: (Date.now() - new Date(it.snippet.publishedAt)) / 864e5,
  }));
  if (items.length < 4) continue;

  // ★ 관련성 — 상위 제목의 절반 이상이 금융이어야 통과
  const rel = items.filter((x) => FIN.test(x.title) && !NOISE.test(x.title)).length / items.length;
  if (rel < 0.5) { dropped.push({ q: c.q, rel: Math.round(rel * 100) }); continue; }

  const fin = items.filter((x) => FIN.test(x.title) && !NOISE.test(x.title));
  const sorted = fin.map((x) => x.views).sort((a, b) => a - b);
  const medViews = sorted[Math.floor(sorted.length / 2)];
  const fresh = fin.filter((x) => x.ageD <= 30).length;
  const medAge = Math.round(fin.map((x) => x.ageD).sort((a, b) => a - b)[Math.floor(fin.length / 2)]);
  out.push({ ...c, medViews, fresh, medAge, rel: Math.round(rel * 100), top: fin.slice(0, 2).map((x) => x.title.slice(0, 52)) });
  console.log(`  ${c.q.slice(0, 40).padEnd(42)} 조회중앙 ${String(medViews).padStart(8)} · 최근30일 ${fresh}편 · 관련 ${Math.round(rel * 100)}%`);
}

if (dropped.length) {
  console.log(`\n  ⛔ 관련성 미달로 버린 검색어 ${dropped.length}개 — ` + dropped.slice(0, 6).map((d) => `${d.q}(${d.rel}%)`).join(' · '));
}

// 점수 — 수요(조회 로그) 높고, 최근 공급 적고, 기존 것이 낡을수록
for (const o of out) {
  const demand = Math.log10(Math.max(o.medViews, 1));
  const gap = (10 - o.fresh) / 10 + Math.min(o.medAge / 365, 1);
  o.score = Math.round((demand * 1.6 + gap * 2.4) * 10) / 10;
}
out.sort((a, b) => b.score - a.score);

console.log('\n  ★ 들어갈 자리 — 수요 × 공백 (금융 관련성 통과분만)');
console.log('  ' + '─'.repeat(88));
for (const o of out.slice(0, 14)) {
  console.log(`  ${String(o.score).padStart(5)}  ${o.q.slice(0, 40).padEnd(42)}`
    + `${String(o.medViews).padStart(9)}${String(o.fresh + '편').padStart(7)}${String(o.medAge + '일').padStart(8)}`);
  console.log(`         └ 상위: ${o.top[0] || ''}`);
}

mkdirSync('.agent', { recursive: true });
writeFileSync('.agent/TOPIC_BANK.json', JSON.stringify({
  pulledAt: new Date().toISOString(),
  note: '수요=자동완성 순위 · 공급=상위 쇼츠 조회중앙/최근편수 · rel=상위 제목 중 금융 비율(50% 미만 폐기)',
  candidates: out, droppedForRelevance: dropped,
}, null, 2));
console.log('\n  → .agent/TOPIC_BANK.json\n');
