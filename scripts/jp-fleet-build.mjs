#!/usr/bin/env node
// jp-fleet-build — 일본 레퍼런스 «측정 대상»을 고른다 (videoId 포함)
// 축을 고르게: 분류마다 «거대채널 상위» + «소형채널 상위» 를 섞는다. 62초 이하만.
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

const CATS = {
  '금':     ['金価格 上昇 理由', '金 投資 初心者', 'ゴールド 買い時', '純金 インゴット'],
  '엔':     ['円安 理由', '円安 いつまで', 'ドル円 予想'],
  '금리':   ['利上げ 影響', '住宅ローン 金利 上昇'],
  '종목':   ['トヨタ 株価', 'ソフトバンク 株'],
  '경기':   ['景気後退 くる', '日本経済 これから'],
};
const search = (q) => {
  const r = spawnSync('yt-dlp', [`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`,
    '--flat-playlist', '--dump-json', '--playlist-end', '16', '--no-warnings', '--socket-timeout', '20'],
    { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter((d) => typeof d.view_count === 'number' && d.id && d.duration && d.duration <= 62);
};

const pool = [];
for (const [cat, qs] of Object.entries(CATS)) for (const q of qs)
  for (const d of search(q)) pool.push({ cat, id: d.id, v: d.view_count, sec: Math.round(d.duration), t: d.title, chId: d.channel_id, ch: d.channel });

const ids = [...new Set(pool.map((p) => p.chId).filter(Boolean))];
const subs = {};
for (let i = 0; i < ids.length; i += 50) {
  const j = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids.slice(i, i + 50).join(',')}`,
    { headers: { Authorization: `Bearer ${tok}` } })).json();
  for (const it of (j.items || [])) subs[it.id] = +it.statistics.subscriberCount || 0;
}

const seen = new Set(), fleet = [];
for (const cat of Object.keys(CATS)) {
  const vs = pool.filter((p) => p.cat === cat).sort((a, b) => b.v - a.v);
  const big = vs.slice(0, 2);
  const small = vs.filter((p) => (subs[p.chId] ?? 1e9) < 100000).slice(0, 2);
  for (const v of [...big, ...small]) {
    if (seen.has(v.id) || v.v < 3000) continue;
    seen.add(v.id);
    fleet.push({ tag: `jp-${cat}-${fleet.length}`, url: `https://www.youtube.com/watch?v=${v.id}`,
      cat, views: v.v, sec: v.sec, subs: subs[v.chId] ?? null, title: v.t, ch: v.ch });
  }
}
writeFileSync('.agent/_jp_fleet.json', JSON.stringify(fleet, null, 1));
console.log(`  함대 ${fleet.length}편`);
for (const f of fleet) console.log(`   ${String(f.views).padStart(9)} ${String(f.sec).padStart(3)}s 구독${String(f.subs).padStart(9)}  ${f.title.slice(0, 40)}`);
