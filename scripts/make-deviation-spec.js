#!/usr/bin/env node
// ============================================================================
// make-deviation-spec — 「평소 대비 이탈」 랭킹을 영상 스펙으로.
//
// 절대 순위(프리미엄 TOP)와 달리 매일 다른 이름이 나온다. 그게 이 포맷의 전부다.
// 자막은 오늘값·평소값·배수를 «전부» 보여준다 — 배수만 쓰면 검증할 수 없다.
//
// 실행: node scripts/make-deviation-spec.js <ko|en|ja> [frames_dir] > spec.json
//   (먼저 make-deviation-ranking.js 를 돌려 /tmp/deviation-ranking.json 을 만든다)
// ============================================================================
const fs = require('fs');
const path = require('path');
const LOCALE = (process.argv[2] || 'ko').toLowerCase();
const FRAMES = process.argv[3] || '';
const RANK = JSON.parse(fs.readFileSync('/tmp/deviation-ranking.json', 'utf8'));

const T = {
  ko: { ranking: '평소보다 크게 움직인 옵션 {N}종목', sub: '최근 30일 대비 · 미국 정규장',
        today: '오늘', usual: '평소', mult: '배수', unit: '위',
        appCap: '전 종목 실시간으로 앱에서', cta: '무료 · 광고 지원', hook: 'TOP {N}' },
  en: { ranking: '{N} names that broke from their own normal', sub: 'vs their own 30-day median · US session',
        today: 'Today', usual: 'Usual', mult: 'Multiple', unit: '',
        appCap: 'All of it live in the app', cta: 'Free · ad-supported', hook: 'TOP {N}' },
  ja: { ranking: '平常から大きく外れた{N}銘柄', sub: '直近30日中央値との比較 · 米国市場',
        today: '本日', usual: '平常', mult: '倍率', unit: '位',
        appCap: 'アプリでリアルタイム', cta: '無料 · 広告あり', hook: 'TOP {N}' },
}[LOCALE];

const fmt = (metric, v) => {
  if (metric === 'pcr') return Number(v).toFixed(2);
  if (metric === 'dex') return (v / 1e6).toFixed(1) + 'M';
  if (/Score|Probability/i.test(metric)) return String(Math.round(v));
  return Math.round(v).toLocaleString();
};
const logoFor = (t) => {
  const p = path.join(__dirname, '..', 'public', 'shorts', 'logos', `${t}.png`);
  return fs.existsSync(p) ? p : '';
};

const N = RANK.length;
const TITLE = T.ranking.replace('{N}', String(N));

// 자막 — 오늘·평소·배수를 다 넣는다. 배수만 쓰면 시청자가 검증할 수 없다.
function caption(f) {
  const today = fmt(f.metric, f.today), usual = fmt(f.metric, f.baseline);
  const up = f.ratio >= 1;
  const mult = up ? `${f.ratio.toFixed(1)}${LOCALE === 'en' ? 'x' : '배'}` : `${Math.round(f.ratio * 100)}%`;
  const lab = f.label[LOCALE] || f.label.en;
  if (LOCALE === 'ko') return `${lab} ${today} — 평소 ${usual} 대비 ${up ? mult : mult + ' 수준'}`;
  if (LOCALE === 'ja') return `${lab} ${today} — 平常 ${usual} に対し ${mult}`;
  return `${lab} ${today} vs usual ${usual} — ${mult}`;
}

const scenes = [{
  mode: 'card', seconds: 2.6, symbol: T.hook.replace('{N}', String(N)),
  ranking: TITLE, rankingSub: T.sub, foot: 'signumhq.com/app',
  caption: LOCALE === 'ko' ? '절대 크기가 아니라 «그 종목의 평소»와 비교했다'
    : LOCALE === 'ja' ? '絶対値ではなく«その銘柄の平常»と比べた'
      : 'Not the biggest — the furthest from their own normal',
}];

RANK.slice().reverse().forEach((f, i) => {
  const rank = N - i;
  const lab = f.label[LOCALE] || f.label.en;
  scenes.push({
    mode: 'card', seconds: 4.4, accent: rank === 1 ? 'amber' : 'teal',
    ranking: TITLE, rankingSub: T.sub, logo: logoFor(f.ticker),
    rank: String(rank), rankUnit: T.unit, symbol: f.ticker, symbolSub: lab,
    stats: [
      { l: T.today, v: fmt(f.metric, f.today) },
      { l: T.usual, v: fmt(f.metric, f.baseline) },
      { l: T.mult, v: f.ratio >= 1 ? `${f.ratio.toFixed(1)}${LOCALE === 'en' ? 'x' : '배'}` : `${Math.round(f.ratio * 100)}%` },
    ],
    ladder: RANK.map((x, j) => ({
      r: j + 1, s: x.ticker,
      v: x.ratio >= 1 ? `${x.ratio.toFixed(1)}${LOCALE === 'en' ? 'x' : '배'}` : `${Math.round(x.ratio * 100)}%`,
      on: x.ticker === f.ticker, hide: (j + 1) < rank,
    })),
    caption: caption(f), foot: 'signumhq.com/app',
  });
});

if (FRAMES) scenes.push({ seconds: 5.0, kicker: T.sub, lines: [T.appCap], frames: FRAMES, foot: 'signumhq.com/app' });
scenes.push({ mode: 'card', seconds: 2.8, accent: 'amber', symbol: 'SIGNUM', symbolSub: T.cta,
              ranking: TITLE, rankingSub: T.sub, caption: 'signumhq.com/app', foot: 'signumhq.com/app' });

console.log(JSON.stringify({ app: 'signum', scenes }, null, 1));
