#!/usr/bin/env node
// jp-us-scan — 「일본 사람이 미국 시장에 대해 무엇을 찾는가」만 따로 잰다
// 대표 질문 2026-08-21: "일본 미국 주식시장에 대한 영상은 그래서 어떤것을 주면 되는것이야?"
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g('YT_REFRESH_TOKEN'), grant_type: 'refresh_token' }) })).json();
  return j.access_token;
})();

// 축을 나눠서 깐다: 공포 / 선택 / 환율연결 / 개별주 / 제도(NISA) / 지수
const Q = [
  ['공포',   '米国株 危ない'], ['공포', '米国株 暴落'], ['공포', 'ナスダック 暴落'], ['공포', 'アメリカ 景気後退 株'],
  ['선택',   'オルカン S&P500 どっち'], ['선택', '新NISA S&P500'], ['선택', '米国株 いつ買う'],
  ['환율',   '米国株 円安 影響'], ['환율', '円安 米国株 為替ヘッジ'], ['환율', 'ドル建て資産 円安'],
  ['개별주', 'エヌビディア 今後'], ['개별주', 'テスラ 株 今後'], ['개별주', 'アップル 株'],
  ['정책',   'FRB 利下げ 日本株'], ['정책', 'アメリカ 金利 日本 影響'], ['정책', 'トランプ 関税 株価'],
  ['지수',   'S&P500 これから'], ['지수', 'ダウ平均 予想'], ['지수', '米国株 積立 やめた'],
];

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
for (const [axis, q] of Q) {
  const v = search(q);
  if (!v.length) { console.log(`  ✗ ${q}`); continue; }
  const ids = [...new Set(v.map((x) => x.channel_id).filter(Boolean))];
  const subs = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids.slice(i, i + 50).join(',')}`,
      { headers: { Authorization: `Bearer ${tok}` } })).json();
    for (const it of (j.items || [])) subs[it.id] = +it.statistics.subscriberCount || 0;
  }
  const known = v.filter((x) => subs[x.channel_id] !== undefined);
  const small = known.filter((x) => subs[x.channel_id] < 100000);
  const demand = med(v.map((x) => x.view_count));
  const room = known.length ? small.length / known.length : 0;
  const top = v.slice().sort((a, b) => b.view_count - a.view_count)[0];
  rows.push({ axis, q, demand, room: +(room * 100).toFixed(0), smallMed: med(small.map((x) => x.view_count)),
    score: +(Math.log10(demand + 1) * room).toFixed(2),
    topT: top?.title?.slice(0, 44), topV: top?.view_count, topSec: top?.duration });
  console.log(`  ${axis}  ${String(demand).padStart(8)}  여지${String(rows[rows.length - 1].room).padStart(3)}%  ${q}`);
}
rows.sort((a, b) => b.score - a.score);
writeFileSync('.agent/MARKET_WANTS_JP_US.json', JSON.stringify({ measuredAt: '2026-08-21', rows }, null, 1));
console.log('\n  ══ 일본에서 «미국 시장» 소재 순위 ══');
console.log(`  ${'#'.padStart(2)} ${'점수'.padStart(5)} ${'수요'.padStart(8)} ${'여지'.padStart(5)} ${'소형중앙'.padStart(8)}  축   검색어`);
rows.forEach((r, i) => console.log(
  `  ${String(i + 1).padStart(2)} ${String(r.score).padStart(5)} ${String(r.demand).padStart(8)} ${(r.room + '%').padStart(5)} ${String(r.smallMed).padStart(8)}  ${r.axis}  ${r.q}`));
console.log('\n  ── 축별 최고 조회작 ──');
for (const ax of [...new Set(rows.map((r) => r.axis))]) {
  const b = rows.filter((r) => r.axis === ax).sort((a, b) => b.topV - a.topV)[0];
  if (b) console.log(`   [${ax}] ${String(b.topV).padStart(9)}회 ${b.topSec ? Math.round(b.topSec) + 's' : ''}  ${b.topT}`);
}
