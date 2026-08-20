#!/usr/bin/env node
// ============================================================================
// market-wants — 「시장이 원하는 것」을 찾아 소재로 뱉는 깔때기
// ----------------------------------------------------------------------------
// 대표 지시 2026-08-21:
//   "원하는것을 떠먹여 주는 구조로 (…) 우리만 좋은것이 아닌 시장이 원하는것을
//    찾아내서 주도록하는 구조로 잡아 **일본도 미국도**"
//
// ⛔ 감으로 소재를 고르지 않는다. 매번 이걸 돌려서 «순위표»를 받고 위에서부터 만든다.
//
// 깔때기 4단
//   ① 수요    검색 상위 쇼츠의 조회 중앙 (사람이 실제로 보는 양)
//   ② 여지    상위권에서 «소형 채널(구독 10만 미만)»이 차지한 비중
//             — 수요가 커도 거대 채널이 독식하면 우리 자리가 없다
//   ③ 신선도  최근 30일 안에 올라온 상위작 비중 (지금도 도는 소재인가)
//   ④ 실증    우리 데이터로 숫자를 만들 수 있는가 (사람이 판단해 evidence 에 적는다)
//
//   점수 = log10(수요) × 여지비중 × (0.5 + 0.5 × 신선도)
//   ⛔ 이 점수는 «정렬용»이지 판정이 아니다. 근거 수치를 항상 같이 본다.
//
// 사용: node scripts/market-wants.mjs <us|jp> [--full]
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const MARKET = (process.argv[2] || 'us').toLowerCase();
const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g('YT_REFRESH_TOKEN'), grant_type: 'refresh_token' }) })).json();
  return j.access_token;
})();

// ⛔ 검색어는 «시장이 쓰는 말»이다. 우리가 쓰는 말이 아니다.
const QUERIES = {
  us: [
    // ── 시장 전반 ──────────────────────────────────────────────
    'stock market crash coming', 'is the stock market going to crash', 'stock market correction',
    'sp500 all time high', 'is it a bubble stock market', 'when will the market recover',
    // ── AI·기술 ────────────────────────────────────────────────
    'is the ai bubble popping', 'ai stocks explained', 'will ai take my job',
    'nvidia stock', 'palantir stock', 'tesla stock', 'apple stock',
    // ── 섹터 ───────────────────────────────────────────────────
    'semiconductor stocks explained', 'bank stocks safe', 'energy stocks explained',
    // ── 경제 지표 ──────────────────────────────────────────────
    'inflation explained', 'cpi report explained', 'jobs report explained',
    'gdp explained simply', 'unemployment rate rising',
    // ── 연준·금리 ──────────────────────────────────────────────
    'what happens if the fed cuts rates', 'federal reserve explained', 'interest rates explained',
    'bond yields explained', 'yield curve inversion', 'why bond market matters',
    // ── 부동산·생활 ────────────────────────────────────────────
    'mortgage rates explained', 'housing market crash', 'why are houses so expensive',
    'cost of living crisis', 'credit card debt crisis', 'student loan forgiveness',
    // ── 고용 ───────────────────────────────────────────────────
    'why companies are laying off', 'job market is bad', 'hiring freeze explained',
    // ── 정책·지정학 ────────────────────────────────────────────
    'tariffs explained', 'trade war explained', 'national debt explained',
    'government shutdown economy', 'china economy explained',
    // ── 통화·원자재 ────────────────────────────────────────────
    'why is the dollar falling', 'de dollarization explained', 'why gold is going up',
    'oil prices explained', 'silver price explained',
    // ── 암호화폐 ───────────────────────────────────────────────
    'bitcoin explained simply', 'is it too late to buy bitcoin',
    // ── 개인 재무 ──────────────────────────────────────────────
    'index funds explained', 'how to start investing', 'is my money safe in the bank',
    '401k explained', 'how much do i need to retire', 'wealth gap explained',
    // ── 시장 구조 ──────────────────────────────────────────────
    'options trading explained', 'short selling explained', 'market makers explained',
    'dark pool trading', 'stock buyback explained',
  ],
  jp: [
    '金価格 上昇 理由', 'ゴールド 買い時', '純金 インゴット', '円安 理由', '円安 いつまで',
    '利上げ 影響', '住宅ローン 金利 上昇', 'トヨタ 株価', '日本経済 これから',
    '米国株 危ない', '新NISA 失敗', '年金 いくら もらえる',
  ],
};
const QS = QUERIES[MARKET];
if (!QS) { console.error('사용: market-wants <us|jp>'); process.exit(1); }

const search = (q) => {
  const r = spawnSync('yt-dlp', [`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`,
    '--flat-playlist', '--dump-json', '--playlist-end', '16', '--no-warnings', '--socket-timeout', '20'],
    { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter((d) => typeof d.view_count === 'number' && d.id);
};
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const rows = [];
for (const q of QS) {
  const vids = search(q);
  if (!vids.length) { console.log(`  ✗ ${q}`); continue; }
  const ids = [...new Set(vids.map((v) => v.channel_id).filter(Boolean))];
  const subs = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids.slice(i, i + 50).join(',')}`,
      { headers: { Authorization: `Bearer ${tok}` } })).json();
    for (const it of (j.items || [])) subs[it.id] = +it.statistics.subscriberCount || 0;
  }
  const known = vids.filter((v) => subs[v.channel_id] !== undefined);
  const small = known.filter((v) => subs[v.channel_id] < 100000);
  const room = known.length ? small.length / known.length : 0;
  // 신선도 — 상위작에 upload_date 가 붙는 경우만 (flat-playlist 에선 자주 비어 있다)
  const dated = vids.filter((v) => v.upload_date);
  const fresh = dated.length
    ? dated.filter((v) => (Date.parse(`${v.upload_date.slice(0, 4)}-${v.upload_date.slice(4, 6)}-${v.upload_date.slice(6, 8)}`) > Date.parse('2026-07-22'))).length / dated.length
    : null;
  const demand = med(vids.map((v) => v.view_count));
  const score = Math.log10(demand + 1) * room * (fresh === null ? 1 : (0.5 + 0.5 * fresh));
  rows.push({ q, demand, n: vids.length, room: +(room * 100).toFixed(0), roomN: `${small.length}/${known.length}`,
    smallMed: med(small.map((v) => v.view_count)), fresh: fresh === null ? null : +(fresh * 100).toFixed(0),
    score: +score.toFixed(2),
    top: vids.slice().sort((a, b) => b.view_count - a.view_count)[0]?.title?.slice(0, 46) });
  console.log(`  ${String(demand).padStart(8)}  여지${String(rows[rows.length - 1].room).padStart(3)}%  ${q}`);
}

rows.sort((a, b) => b.score - a.score);
writeFileSync(`.agent/MARKET_WANTS_${MARKET.toUpperCase()}.json`,
  JSON.stringify({ market: MARKET, measuredAt: '2026-08-21', rows }, null, 1));

console.log(`\n  ══ ${MARKET.toUpperCase()} — 만들 순서 ══`);
console.log(`  ${'#'.padStart(2)}  ${'점수'.padStart(5)}  ${'수요'.padStart(8)}  ${'여지'.padStart(6)}  ${'소형중앙'.padStart(8)}  검색어`);
rows.forEach((r, i) => console.log(
  `  ${String(i + 1).padStart(2)}  ${String(r.score).padStart(5)}  ${String(r.demand).padStart(8)}  ${(r.room + '%').padStart(6)}  ${String(r.smallMed).padStart(8)}  ${r.q}`));
console.log(`\n  → .agent/MARKET_WANTS_${MARKET.toUpperCase()}.json\n`);
