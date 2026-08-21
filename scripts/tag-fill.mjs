#!/usr/bin/env node
// ============================================================================
// tag-fill — 태그 500자를 «끝까지» 채운다
// ----------------------------------------------------------------------------
// ⛔ 대표 지적 2026-08-21:
//   "500자나 되는데 왜 활용을 안 해? 지금 가릴 때냐? 가장 인기있는 그런 것을 넣어야지"
//   "누가 정확하지 않다고 나가냐? 주식 관련 들어왔다가 그냥 보는 것이지"
//
//   내가 12개 · 142자만 쓰고 있었다. 태그는 «넣는다고 손해 볼 게 없다» —
//   그런데 나는 「우리 내용과 정확히 일치하는 것만」이라는 «내가 만든 제약» 때문에
//   358자를 버리고 있었다. 그건 신중함이 아니라 그냥 낭비다.
//
// ⛔ 다만 «한 줄»은 지킨다: 금융·주식 «영역 안»에서만 채운다.
//   요리·게임 태그를 넣으면 추천 시스템에 채널 주제를 잘못 알린다 — 그건 실제 비용이다.
//   영역 안이면 정확도가 조금 떨어져도 비용이 없다. 대표 말이 맞다.
//
// 우선순위
//   ① 이 영상의 «고유» 태그 (종목·개념)          — 가장 정확한 것을 앞에
//   ② .agent/DEMAND.json 실측 수요 상위          — 실제로 검색되는 말
//   ③ 일반 인기 금융어                            — 남는 자리를 채운다
//
// 사용: node scripts/tag-fill.mjs <plan.json> [--write]
//       SIGNUM_YT=jp node scripts/tag-fill.mjs <plan.json> [--write]   (일본어 수요표)
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { demandFor } from './_demand.mjs';

const PLAN = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!PLAN) { console.error('사용: tag-fill <plan.json> [--write]'); process.exit(1); }

// ⛔ 대표 지적 2026-08-21 (2차): "티커를 넣어. 사람들이 티커나 nvidia 라고 검색을 하지
//   누가 옵션이며 그런 것을 검색하냐"
//   맞다. 「options trading explained」는 «우리가 잰 수요»지만, 사람이 검색창에 치는 말은
//   대부분 «종목 이름»이다. 티커와 회사명을 «둘 다», 그리고 «맨 앞»에 둔다.
const TICKERS_EN = [
  'nvidia', 'nvda', 'tesla', 'tsla', 'apple', 'aapl', 'amazon', 'amzn',
  'google', 'googl', 'microsoft', 'msft', 'meta', 'amd', 'micron', 'mu',
  'broadcom', 'avgo', 'palantir', 'pltr', 'intel', 'intc', 'netflix', 'nflx',
  'coinbase', 'coin', 'spy', 'qqq', 'nvidia stock', 'tesla stock', 'apple stock',
  'amd stock', 'nvidia earnings', 'sp500', 'nasdaq', 'dow jones',
];
const TICKERS_JA = [
  'エヌビディア', 'nvda', 'テスラ', 'tsla', 'アップル', 'aapl', 'アマゾン',
  'グーグル', 'マイクロソフト', 'msft', 'amd', 'マイクロン', 'ブロードコム',
  'パランティア', 'インテル', 'メタ', 'spy', 'qqq', 'エヌビディア 株',
  'テスラ株', 'アップル株', 'ナスダック', 'sp500',
];

// ⛔ 수요표에 «다른 언어»가 섞여 있다 (DEMAND.json 에 일본어 항목이 들어가 있었다).
//   영어 영상에 「ゴールド 買い時」가 태그로 붙었다 — 2026-08-21 실제 사고.
const hasCJK = (t) => /[぀-ヿ㐀-鿿]/.test(t);
const langOk = (t, lang) => (lang === 'ja' ? true : !hasCJK(t));

const LIMIT = 500;
const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
const items = [].concat(plan);

// ③ 남는 자리를 채우는 일반 인기 금융어 — 영역 «안»에서만
const FILLER_EN = [
  // ⛔ «사람이 검색창에 실제로 치는 말»만 넣는다 (대표 지시 2026-08-21).
  //   우리 수요표에는 「is it a bubble stock market」 같은 항목도 있는데,
  //   그건 우리가 «측정한 질의»지 사람이 태그로 떠올릴 말은 아니다.
  'stock market today', 'stocks to buy', 'stocks to buy now', 'stock market news',
  'stock market', 'stocks', 'investing', 'investing for beginners', 'how to invest',
  'day trading', 'day trading for beginners', 'swing trading', 'options trading',
  'options for beginners', 'stock analysis', 'technical analysis', 'trading strategy',
  'wall street', 'finance', 'personal finance', 'money', 'passive income',
  'nasdaq', 'sp500', 's&p 500', 'dow jones', 'us stocks', 'us stock market',
  'tech stocks', 'ai stocks', 'semiconductor stocks', 'growth stocks', 'dividend stocks',
  'etf', 'etf investing', 'index funds', 'earnings', 'earnings report',
  'federal reserve', 'interest rates', 'inflation', 'recession', 'market crash',
  'bull market', 'bear market', 'stock tips', 'trading tips', 'financial education',
];
const FILLER_JA = [
  // 사람이 실제로 치는 말 — 조사·군더더기 없이
  '米国株', '株', '株式投資', '投資', '米国株投資', '株価', '資産運用',
  '新nisa', 'nisa', '投資初心者', '米国株 初心者', '株 初心者',
  'ナスダック', 'sp500', 'ダウ', '米国株 おすすめ', '高配当株',
  'インデックス投資', '積立nisa', '投資信託', '配当金', '株 稼ぐ',
  '相場', '経済', '金融', 'マネー', '決算', '為替', '円安', 'ドル円',
  '半導体', 'ai株', '成長株', '暴落', '株価 予想', '株式市場',
  'ウォール街', '米国経済', '投資 勉強', 'お金', '資産形成',
];

for (const it of items) {
  const lang = String(it.lang || 'en').toLowerCase();
  const D = demandFor(lang).terms;
  const filler = lang === 'ja' ? FILLER_JA : FILLER_EN;

  const seen = new Set();
  const out = [];
  const room = () => LIMIT - (out.join(', ').length + (out.length ? 2 : 0));
  const push = (t) => {
    const k = t.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    if (!langOk(k, lang)) return false;   // ⛔ 다른 언어 태그를 넣지 않는다
    // ⛔ 태그 하나가 30자를 넘으면 유튜브가 잘라먹는다
    if (k.length > 30) return false;
    const cost = k.length + (out.length ? 2 : 0);
    if (cost > room()) return false;
    seen.add(k); out.push(k); return true;
  };

  // ① 원래 태그 — 이 영상의 고유 개념
  for (const t of (it.tags || [])) push(t);
  const nOwn = out.length;

  // ② 티커·회사명 — 사람이 «실제로 검색창에 치는 말». 이게 수요어보다 앞이다.
  //   이 영상에 나오는 종목을 먼저, 그다음 인기 대형주.
  const tickers = lang === 'ja' ? TICKERS_JA : TICKERS_EN;
  const mine = tickers.filter((t) => (it.title + ' ' + (it.description || '')).toLowerCase().includes(t));
  for (const t of mine) push(t);
  for (const t of tickers) push(t);
  const nTicker = out.length - nOwn;

  // ③ 자연 검색어 — 사람이 태그로 떠올릴 «말». 수요표보다 «먼저» 채운다.
  //   ⛔ 수요표에는 「is it a bubble stock market」 「why companies are laying off」 처럼
  //     «질문 형태»가 있다. 그건 우리가 측정한 질의지 태그가 아니다.
  //     자연 검색어를 앞에 두면 그런 것들은 자리가 없어 자동으로 빠진다.
  for (const t of filler) push(t);
  const nFill = out.length - nOwn - nTicker;

  // ④ 그래도 자리가 남으면 실측 수요어 — 단 «질문 형태»는 뺀다
  const QUESTIONY = /^(is |are |why |how |what |does |do |can |should |when )/i;
  const byDemand = Object.entries(D).sort((a, b) => b[1] - a[1]).map(([k]) => k)
    .filter((k) => !QUESTIONY.test(k) && k.split(' ').length <= 3);
  for (const t of byDemand) push(t);
  const nDemand = out.length - nOwn - nTicker - nFill;

  const chars = out.join(', ').length;
  console.log(`\n  ${it.title || PLAN}`);
  console.log(`   ${(it.tags || []).length}개 · ${(it.tags || []).join(', ').length}자  →  ${out.length}개 · ${chars}/${LIMIT}자`);
  console.log(`   고유 ${nOwn} · 티커 ${nTicker} · 자연검색어 ${nFill} · 수요표 ${nDemand}`);
  console.log(`   ${out.join(', ')}`);
  it.tags = out;
}

if (WRITE) {
  writeFileSync(PLAN, JSON.stringify(plan, null, 2));
  console.log(`\n  → ${PLAN} 갱신`);
} else {
  console.log('\n  ── 미리보기만 했다. 반영하려면 --write ──');
}
