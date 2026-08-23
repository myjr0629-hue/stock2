#!/usr/bin/env node
// _jp-snap — 일본 채널 «전편»의 현재 조회수를 한 번에 찍는다.
//   핵심 검정: 급등이 «세 편만»인가, «채널 전체»인가. 죽은 구판까지 같이 움직이면
//   원인은 영상이 아니라 채널 배포다.
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
const KEY = (env.match(/YOUTUBE_API_KEY=(\S+)/) || [])[1];
const CH  = (env.match(/YT_JP_CHANNEL_ID=(\S+)/) || env.match(/SIGNUM_JP_CHANNEL_ID=(\S+)/) || [])[1];
if (!KEY) { console.error('YOUTUBE_API_KEY 없음'); process.exit(1); }
let ch = CH;
if (!ch) {
  const h = (env.match(/YT_JP_HANDLE=(\S+)/) || [])[1] || 'signum_jp';
  const j = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${h}&key=${KEY}`)).json();
  ch = j.items?.[0]?.id;
}
const c = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics&id=${ch}&key=${KEY}`)).json();
const up = c.items[0].contentDetails.relatedPlaylists.uploads;
console.log(`  채널 총조회 ${c.items[0].statistics.viewCount} · 구독 ${c.items[0].statistics.subscriberCount}`);
const pl = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50&key=${KEY}`)).json();
const ids = pl.items.map((x) => x.contentDetails.videoId);
const v = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(',')}&key=${KEY}`)).json();
const now = Date.now();
const rows = v.items.map((x) => ({
  id: x.id, t: x.snippet.title, pub: x.snippet.publishedAt,
  h: (now - Date.parse(x.snippet.publishedAt)) / 36e5,
  v: +x.statistics.viewCount,
})).sort((a, b) => a.h - b.h);
console.log('\n   나이(h)   조회   ID           제목');
for (const r of rows) console.log(`  ${r.h.toFixed(1).padStart(7)} ${String(r.v).padStart(7)}   ${r.id}  ${r.t.slice(0, 34)}`);
console.log(JSON.stringify({ ts: new Date().toISOString(), rows }), '\n<<<JSON');
