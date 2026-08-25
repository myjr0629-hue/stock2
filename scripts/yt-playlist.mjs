#!/usr/bin/env node
// ============================================================================
// yt-playlist — 채널 안에 «통로» 를 만든다 (재생목록)
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-24)
//   일본 채널 첫 롱폼이 3시간째 0회였다. 기술적 문제는 없다 — processed·public·거부없음.
//   원인은 «통로가 없다» 였다:
//     · 구독 1명 · 롱폼 이력 0편 → 탐색·추천이 실어줄 근거가 없다
//     · 유입 93~98% 가 Shorts 피드인데, 그 피드는 롱폼을 안 띄운다
//     · 검색 상위에도 없다 (공개 API 로 확인)
//     · 그리고 «재생목록이 0개» 였다 — 채널 안에서 롱폼이 아무데도 연결돼 있지 않다
//
// ⛔ 재생목록이 조회를 만들어준다는 «측정» 은 우리에게 없다. 이건 통로를 «만드는» 것이지
//   효과가 검증된 조치가 아니다. 효과는 다음 롱폼과 비교해서 재야 한다.
//
// 사용:
//   node scripts/yt-playlist.mjs create "<제목>" "<설명>" [videoId ...]
//   node scripts/yt-playlist.mjs add <playlistId> <videoId ...>
//   node scripts/yt-playlist.mjs list
//   SIGNUM_YT=jp 로 일본 채널
// ============================================================================
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || null;
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). «|| HQ토큰» 폴백은 지웠다 — 조용한 오배송 경로였다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }
const RT = g(RTKEY);
if (!RT) { console.error(`  ⛔ .env.local 에 ${RTKEY} 가 없다.`); process.exit(1); }
const tok = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'), refresh_token: RT, grant_type: 'refresh_token' }),
})).json()).access_token;
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'list') {
  const j = await (await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50', { headers: H })).json();
  console.log(`\n  재생목록 ${(j.items || []).length}개`);
  for (const p of j.items || []) console.log(`   ${p.id}  ${String(p.contentDetails.itemCount).padStart(3)}편  ${p.snippet.title}`);
  process.exit(0);
}

async function addTo(pid, vid) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST', headers: H,
    body: JSON.stringify({ snippet: { playlistId: pid, resourceId: { kind: 'youtube#video', videoId: vid } } }),
  });
  return r.ok ? 'ok' : `실패 ${r.status} ${(await r.text()).slice(0, 110)}`;
}

if (cmd === 'create') {
  const [title, desc, ...vids] = rest;
  if (!title) { console.error('제목이 필요하다'); process.exit(1); }
  const r = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
    method: 'POST', headers: H,
    body: JSON.stringify({
      snippet: { title, description: desc || '', defaultLanguage: { hq: 'en', jp: 'ja', kr: 'ko' }[YTW] },
      status: { privacyStatus: 'public' },
    }),
  });
  const j = await r.json();
  if (!r.ok) { console.error('실패', JSON.stringify(j).slice(0, 300)); process.exit(1); }
  console.log(`  ✔ 생성 ${j.id}  「${title}」`);
  for (const v of vids) console.log(`     + ${v} ${await addTo(j.id, v)}`);
  process.exit(0);
}

if (cmd === 'add') {
  const [pid, ...vids] = rest;
  for (const v of vids) console.log(`  ${v} ${await addTo(pid, v)}`);
  process.exit(0);
}
console.error('사용: yt-playlist <create|add|list> ...');
process.exit(1);
