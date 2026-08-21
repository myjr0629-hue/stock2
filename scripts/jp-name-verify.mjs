#!/usr/bin/env node
// jp-name-verify — 일본 채널명 후보에 들어간 «단어»가 실제로 검색되는지 잰다
// 대표 제공 자료(2026-08-21)의 채널명 후보를 검증한다.
//   주장: 「板情報」이 일본 트레이더가 가장 신뢰하는 단어 · 「新NISA」가 검색량 최대 킬러 키워드
// ⛔ 채널명은 한 번 정하면 오래 간다. 감으로 정하지 않는다.
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

const Q = [
  ['후보어', '板情報'], ['후보어', '板読み'], ['후보어', 'ウォール街'],
  ['후보어', '機関投資家'], ['후보어', 'マックスペイン'], ['후보어', '米国株 板'],
  ['후보어', '新NISA'], ['후보어', 'レバナス'], ['후보어', '米国株 速報'],
  ['비교', '米国株'], ['비교', 'エヌビディア'],
];

const search = (q, n = 20) => {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`;
  const r = spawnSync('yt-dlp', [url, '--flat-playlist', '--dump-json', '--playlist-end', String(n),
    '--no-warnings', '--socket-timeout', '20'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter((d) => typeof d.view_count === 'number' && d.id);
};
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const rows = [];
for (const [cat, q] of Q) {
  const v = search(q);
  if (!v.length) { console.log(`  x ${q}`); continue; }
  const ids = [...new Set(v.map((x) => x.channel_id).filter(Boolean))];
  const subs = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await (await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids.slice(i, i + 50).join(',')}`,
      { headers: { Authorization: `Bearer ${tok}` } })).json();
    for (const it of (j.items || [])) subs[it.id] = +it.statistics.subscriberCount || 0;
  }
  const known = v.filter((x) => subs[x.channel_id] !== undefined);
  const small = known.filter((x) => subs[x.channel_id] < 100000);
  const demand = med(v.map((x) => x.view_count));
  const smallMed = med(small.map((x) => x.view_count));
  const room = known.length ? Math.round(small.length / known.length * 100) : 0;
  rows.push({ cat, q, demand, room, smallMed, n: v.length });
  console.log(`  ${cat}  ${String(demand).padStart(8)}  여지${String(room).padStart(3)}%  소형중앙${String(smallMed).padStart(8)}  ${q}`);
}
writeFileSync('.agent/_jp_name_verify.json', JSON.stringify({ measuredAt: '2026-08-21', rows }, null, 1));
console.log('\n  ══ 소형 채널이 실제로 받는 조회 순 ══');
for (const r of rows.slice().sort((a, b) => b.smallMed - a.smallMed))
  console.log(`   ${String(r.smallMed).padStart(8)}  여지${String(r.room).padStart(3)}%  수요${String(r.demand).padStart(8)}  ${r.q}`);
console.log('\n  -> .agent/_jp_name_verify.json');
