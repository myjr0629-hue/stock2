#!/usr/bin/env node
// yt-sync-meta — 이미 올린 영상의 제목·설명·태그를 plan.json 과 «다시 맞춘다»
//   사용: node scripts/yt-sync-meta.mjs <plan.json> <videoId>
// ⛔ 영상 파일은 교체할 수 없다(유튜브 사양). 메타데이터만 동기화한다.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const [, , PLAN, ID] = process.argv;
if (!PLAN || !ID) { console.error('사용: yt-sync-meta <plan.json> <videoId>'); process.exit(1); }
// 게이트를 먼저 통과해야 한다 — 메타 수정도 규격 밖으로 나갈 수 없다
if (spawnSync(process.execPath, ['scripts/shorts-gate.mjs', PLAN], { stdio: 'inherit' }).status !== 0) {
  console.error('  게이트 불통과 — 동기화 중단'); process.exit(1);
}
const env = readFileSync('.env.local', 'utf8');
// ⛔ 채널 스위치 — SIGNUM_YT=jp 면 일본 채널 토큰을 쓴다 (2026-08-21)
//   기본값은 hq. 환경변수를 «안 주면» 지금까지와 완전히 같게 동작한다.
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다» —
//   예전 2분기는 SIGNUM_YT=kr 오타 하나로 한국어 영상이 영어 채널에 올라갔다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
    refresh_token: g(RTKEY), grant_type: 'refresh_token' }) });
const { access_token } = await r.json();
const it = JSON.parse(readFileSync(PLAN, 'utf8'))[0];
const cur = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ID}`,
  { headers: { Authorization: `Bearer ${access_token}` } })).json();
const sn = cur.items?.[0]?.snippet;
if (!sn) { console.error('영상을 못 찾았다'); process.exit(1); }
const up = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', { method: 'PUT',
  headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: ID, snippet: { categoryId: sn.categoryId, title: it.title,
    description: it.description, tags: it.tags, defaultLanguage: 'en', defaultAudioLanguage: 'en' } }) });
const j = await up.json();
if (!up.ok) { console.error('실패', JSON.stringify(j).slice(0, 300)); process.exit(1); }
console.log(`  ${ID} 메타 동기화 완료`);
console.log(`  설명 첫 줄: ${j.snippet.description.split('\n')[0]}`);
