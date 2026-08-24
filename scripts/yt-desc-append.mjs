#!/usr/bin/env node
// ============================================================================
// yt-desc-append — 이미 올린 영상의 설명 «끝에» 한 덩어리를 덧붙인다
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-24) — 일본 첫 롱폼이 3시간 0회였다. 통로가 없었다.
//   쇼츠 피드는 롱폼을 안 띄우고, 구독 1명이라 탐색·추천도 안 붙는다.
//   ⇒ 우리가 «가진» 통로는 하루 1,000회 도는 쇼츠뿐이다. 거기서 링크한다.
//
// ⛔ 효과는 검증되지 않았다. 쇼츠 설명은 접혀 있고 대부분 안 본다.
//   앱 링크 전환이 0.1% 였던 것을 감안하면 기대치는 낮다 — 그래도 «재는 것» 이 목적이다.
// ⛔ 이미 «공개돼 달리는» 영상은 건드리지 않는다. 예약(비공개) 건에만 붙인다.
// ⛔ 같은 덩어리를 두 번 붙이지 않는다 (마커로 확인).
//
// 사용: node scripts/yt-desc-append.mjs <videoId ...> --text="..."   (SIGNUM_YT=jp)
// ============================================================================
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || null;
const JP = String(process.env.SIGNUM_YT || 'hq').toLowerCase() === 'jp';
const RT = JP ? (g('YT_JP_REFRESH_TOKEN') || g('YT_REFRESH_TOKEN')) : g('YT_REFRESH_TOKEN');
const args = process.argv.slice(2);
const TEXT = (args.find((a) => a.startsWith('--text=')) || '').slice(7);
const IDS = args.filter((a) => !a.startsWith('--'));
if (!TEXT || !IDS.length) { console.error('사용: yt-desc-append <videoId ...> --text="..."'); process.exit(1); }
const MARK = TEXT.split('\n')[0].slice(0, 20);

const tok = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'), refresh_token: RT, grant_type: 'refresh_token' }),
})).json()).access_token;
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

for (const id of IDS) {
  const v = (await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${id}`, { headers: H })).json()).items?.[0];
  if (!v) { console.log(`  ${id} 없음`); continue; }
  if (v.status.privacyStatus === 'public') {
    console.log(`  ${id} ⛔ 이미 공개돼 달린다 — 건드리지 않는다`);
    continue;
  }
  if (v.snippet.description.includes(MARK)) { console.log(`  ${id} 이미 붙어 있다`); continue; }
  const desc = `${v.snippet.description}\n\n${TEXT}`;
  if (desc.length > 4900) { console.log(`  ${id} ⛔ 설명이 너무 길어진다 (${desc.length})`); continue; }
  const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
    method: 'PUT', headers: H,
    body: JSON.stringify({ id, snippet: {
      title: v.snippet.title, description: desc, tags: v.snippet.tags || [],
      categoryId: v.snippet.categoryId,
      defaultLanguage: v.snippet.defaultLanguage, defaultAudioLanguage: v.snippet.defaultAudioLanguage,
    } }),
  });
  console.log(`  ${id} ${r.ok ? '✔ 붙였다' : '실패 ' + r.status + ' ' + (await r.text()).slice(0, 120)}`);
}
