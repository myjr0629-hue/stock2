#!/usr/bin/env node
// len-scan — 「잘 되는 쇼츠의 길이」를 «외부 대량 표본»으로 잰다
// ⛔ 우리 19편은 표본이 아니다 (대표 지적). 남의 것을 대량으로 긁어서 본다.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const STORE = '.agent/_len_scan.json';
const Q = process.argv[2] === 'en' ? [
  'stock market today','options trading','nvidia stock','stocks to buy','day trading',
  'investing for beginners','stock market crash','federal reserve','tesla stock','sp500',
  'nasdaq','earnings report','interest rates','market makers','short selling',
] : [
  '米国株','マックスペイン','エヌビディア','ナスダック','株 初心者','決算','ドル円','半導体株',
];
const LANG = process.argv[2] || 'en';

const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g('YT_REFRESH_TOKEN'), grant_type: 'refresh_token' }) })).json();
  return j.access_token;
})();

const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {};
store[LANG] = store[LANG] || { ids: {}, detail: {}, subs: {} };
const S = store[LANG];

for (const q of Q) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`;
  const r = spawnSync('yt-dlp', [url, '--flat-playlist', '--dump-json', '--playlist-end', '40',
    '--no-warnings', '--socket-timeout', '20'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  const got = (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x?.id);
  for (const v of got) S.ids[v.id] = q;
  console.log(`  ✔ ${q}  +${got.length}  (누적 ${Object.keys(S.ids).length})`);
  writeFileSync(STORE, JSON.stringify(store));
}

const ids = Object.keys(S.ids).filter((x) => !S.detail[x]);
for (let i = 0; i < ids.length; i += 50) {
  const j = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(',')}`,
    { headers: { Authorization: `Bearer ${tok}` } })).json();
  for (const it of (j.items || [])) {
    const d = it.contentDetails.duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/) || [];
    S.detail[it.id] = { dur: (+(d[1] || 0)) * 60 + (+(d[2] || 0)), views: +it.statistics.viewCount || 0, ch: it.snippet.channelId };
  }
  writeFileSync(STORE, JSON.stringify(store));
}
const chIds = [...new Set(Object.values(S.detail).map((d) => d.ch))].filter((c) => S.subs[c] === undefined);
for (let i = 0; i < chIds.length; i += 50) {
  const j = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${chIds.slice(i, i + 50).join(',')}`,
    { headers: { Authorization: `Bearer ${tok}` } })).json();
  for (const it of (j.items || [])) S.subs[it.id] = +it.statistics.subscriberCount || 0;
  writeFileSync(STORE, JSON.stringify(store));
}
console.log(`\n  ${LANG}: 영상 ${Object.keys(S.detail).length} · 채널 ${Object.keys(S.subs).length}`);
