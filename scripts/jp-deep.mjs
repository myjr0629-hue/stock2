#!/usr/bin/env node
// ============================================================================
// jp-deep — 일본 시장을 «넓게» 훑어 우리가 들어갈 문을 찾는다
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-21)
//   지금 일본어 수요표는 11개뿐이다. 그것도 «채널명 후보»를 검증하려고 잰 것이라
//   소재 축이 아니다. 상위 2개(マックスペイン·エヌビディア)를 1호에 다 썼다.
//   11개로 「일본에서 가장 인기 있는 소재」를 말하면 그건 추측이다.
//
// ⛔ 미국 us-deep.mjs 와 «같은 자»로 잰다
//   값 = 소형채널(구독 10만 미만) 조회 중앙.  자가 다르면 비교가 거짓이 된다.
//   (08-21 「금 84,262 vs 실제 256」 사건이 자를 섞어서 났다)
//
// 점수 = log10(소형중앙+1) × (0.4 + 0.6×여지)
//   여지 = 상위 결과 중 «구독 10만 미만» 채널이 차지한 비율.
//   수요만 크고 여지가 없으면 신생 채널은 못 들어간다 (エヌビディア 14,658 인데 여지 20%).
//
// 쿼리마다 저장한다 — 중간에 끊겨도 이어서 돈다.
// 사용: node scripts/jp-deep.mjs
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const STORE = '.agent/_jp_deep.json';
const OUT = '.agent/JP_DEEP.json';

// ── 주제 축 × 검색어 ────────────────────────────────────────────────────────
// ⛔ «우리가 실제로 만들 수 있는 것»만 넣는다. 못 만드는 주제의 문을 재봐야 소용없다.
const THEMES = {
  '옵션·수급': ['マックスペイン', 'オプション 米国株', '建玉', 'ガンマ', 'コールオプション',
    'プットオプション', 'オプション取引 やり方', '機関投資家 手口', 'ダークプール', '空売り 米国株'],
  '지수·시황': ['米国株', 'ナスダック', 'S&P500', '米国株 暴落', '米国株 速報',
    '米国株 見通し', '相場解説', 'ウォール街', '株価 なぜ下がる', '調整局面'],
  '금리·매크로': ['FRB', '利下げ', '米国 金利', 'ドル円', '円安',
    'インフレ 米国', '雇用統計', 'CPI 米国', '長期金利', 'リセッション'],
  '반도체·AI': ['エヌビディア', '半導体株', 'AI株', 'マイクロン', 'ブロードコム',
    '半導体 サイクル', 'AIバブル', 'データセンター 投資'],
  '개별종목': ['テスラ株', 'アップル株', 'アマゾン株', 'グーグル株', 'マイクロソフト株',
    'パランティア', '決算 米国株', '決算 見方'],
  '투자기초': ['米国株 初心者', '米国株 買い方', 'インデックス投資', '配当株 米国',
    'ETF 米国株', 'ドルコスト平均法', 'PER 見方', 'ボラティリティ とは'],
  '리스크·심리': ['暴落 前兆', 'バブル 崩壊', '投資 失敗', '狼狽売り',
    'リスク管理 投資', '恐怖指数'],
};

const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다» —
//   예전 2분기는 SIGNUM_YT=kr 오타 하나로 한국어 영상이 영어 채널에 올라갔다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }
const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g(RTKEY), grant_type: 'refresh_token' }),
  })).json();
  if (!j.access_token) { console.error('  토큰 실패'); process.exit(1); }
  return j.access_token;
})();

const search = (q, n = 25) => {
  // sp=EgIYAQ%3D%3D = 쇼츠만
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`;
  const r = spawnSync('yt-dlp', [url, '--flat-playlist', '--dump-json', '--playlist-end', String(n),
    '--no-warnings', '--socket-timeout', '20'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter((d) => typeof d.view_count === 'number' && d.channel_id);
};
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {};
const ALL = Object.entries(THEMES).flatMap(([t, qs]) => qs.map((q) => [t, q]));
console.log(`  ${Object.keys(THEMES).length}개 축 · ${ALL.length}개 검색어\n`);

for (const [theme, q] of ALL) {
  if (store[q]) { console.log(`  · ${q} (완료)`); continue; }
  const v = search(q);
  if (!v.length) { console.log(`  x ${q} — 결과 없음`); store[q] = { theme, q, n: 0 }; writeFileSync(STORE, JSON.stringify(store)); continue; }
  const ids = [...new Set(v.map((x) => x.channel_id))];
  const subs = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await (await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids.slice(i, i + 50).join(',')}`,
      { headers: { Authorization: `Bearer ${tok}` } })).json();
    for (const it of (j.items || [])) subs[it.id] = +it.statistics.subscriberCount || 0;
  }
  const known = v.filter((x) => subs[x.channel_id] !== undefined);
  const small = known.filter((x) => subs[x.channel_id] < 100000);
  const row = {
    theme, q, n: v.length,
    demand: med(v.map((x) => x.view_count)),                    // 전체 조회 중앙 (참고)
    smallMed: med(small.map((x) => x.view_count)),              // ★ 우리 자 — 소형채널 조회 중앙
    room: known.length ? Math.round(small.length / known.length * 100) : 0,
    smallN: small.length, knownN: known.length,
  };
  row.score = +(Math.log10(row.smallMed + 1) * (0.4 + 0.6 * row.room / 100)).toFixed(3);
  store[q] = row;
  writeFileSync(STORE, JSON.stringify(store));
  console.log(`  ✔ ${String(row.score).padStart(5)}  소형중앙 ${String(row.smallMed).padStart(7)}  여지${String(row.room).padStart(4)}%  ${q}`);
}

// ── 집계 ────────────────────────────────────────────────────────────────────
const rows = Object.values(store).filter((r) => r.n);
rows.sort((a, b) => b.score - a.score);

console.log('\n  ══ 점수 상위 20 (문이 넓고 소형채널이 실제로 받는 순) ══');
console.log('   점수   소형중앙    여지   전체중앙   축            검색어');
for (const r of rows.slice(0, 20))
  console.log(`   ${String(r.score).padStart(5)}  ${String(r.smallMed).padStart(8)}  ${String(r.room).padStart(4)}%  ${String(r.demand).padStart(8)}   ${r.theme.padEnd(12)} ${r.q}`);

console.log('\n  ══ 축별 (소형중앙 중앙값) ══');
const byTheme = {};
for (const r of rows) (byTheme[r.theme] ||= []).push(r);
const themeRows = Object.entries(byTheme).map(([t, rs]) => ({
  theme: t, n: rs.length, smallMed: med(rs.map((r) => r.smallMed)),
  room: med(rs.map((r) => r.room)), score: +med(rs.map((r) => r.score)).toFixed(3),
})).sort((a, b) => b.score - a.score);
for (const t of themeRows)
  console.log(`   ${String(t.score).padStart(5)}  소형중앙 ${String(t.smallMed).padStart(7)}  여지${String(t.room).padStart(4)}%  ${t.theme}  (검색어 ${t.n}개)`);

console.log('\n  ══ ⛔ 수요는 큰데 여지가 없는 것 (신생 채널이 들어가면 안 되는 문) ══');
for (const r of rows.filter((x) => x.smallMed > 3000 && x.room < 40).slice(0, 8))
  console.log(`   소형중앙 ${String(r.smallMed).padStart(7)}  여지 ${String(r.room).padStart(3)}%  ${r.q}`);

writeFileSync(OUT, JSON.stringify({ measuredAt: '2026-08-21', metric: '소형채널(구독 10만 미만) 조회 중앙', rows, themes: themeRows }, null, 1));
console.log(`\n  → ${OUT}\n`);
