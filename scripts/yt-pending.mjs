#!/usr/bin/env node
// ============================================================================
// yt-pending — 「올렸는데 고정 댓글이 안 붙은 영상」을 찾는다
// ----------------------------------------------------------------------------
// ⛔ 왜 생겼나 (2026-08-21)
//   ke34mBPAfNQ 를 «비공개+05:00 예약» 으로 올렸다. 유튜브는 비공개 영상에
//   댓글을 못 달게 하므로(403) 05:06 에 예약 작업을 걸었다.
//   작업은 **05:06:27 에 실제로 실행됐는데 댓글은 붙지 않았다.**
//   (승인 대기에서 멈춘 것으로 보이나 로그가 남지 않아 확증은 못 한다)
//   ⇒ 예약 작업에 «의존»하지 않는다. 매 세션 이걸 돌려서 직접 확인한다.
//
// 사용: node scripts/yt-pending.mjs        (최근 15편 점검)
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
// ⛔ 채널 스위치 — SIGNUM_YT=jp 면 일본 채널 토큰을 쓴다 (2026-08-21)
//   기본값은 hq. 환경변수를 «안 주면» 지금까지와 완전히 같게 동작한다.
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다» —
//   예전 2분기는 SIGNUM_YT=kr 오타 하나로 한국어 영상이 영어 채널에 올라갔다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };

const t = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
    refresh_token: g(RTKEY), grant_type: 'refresh_token' }),
})).json();
const tok = t.access_token;
if (!tok) { console.error('토큰 실패'); process.exit(1); }

const L = existsSync('.agent/YT_LEDGER.json')
  ? JSON.parse(readFileSync('.agent/YT_LEDGER.json', 'utf8')).videos.slice(0, 15) : [];
if (!L.length) { console.error('원장이 비었다 — node scripts/yt-ledger.mjs 먼저'); process.exit(1); }

const j = await (await fetch(
  `https://www.googleapis.com/youtube/v3/videos?part=status,statistics,snippet&id=${L.map((v) => v.id).join(',')}`,
  { headers: { Authorization: `Bearer ${tok}` } })).json();

const bad = [];
console.log(`\n  ${'영상'.padEnd(13)}${'상태'.padEnd(11)}${'댓글'.padStart(4)}  제목`);
for (const it of (j.items || [])) {
  const priv = it.status.privacyStatus;
  const n = +(it.statistics.commentCount || 0);
  const miss = priv === 'public' && n === 0;
  if (miss) bad.push(it.id);
  console.log(`  ${miss ? '✗' : '✔'} ${it.id.padEnd(11)}${priv.padEnd(11)}${String(n).padStart(4)}  ${it.snippet.title.slice(0, 40)}`);
}
if (!bad.length) { console.log('\n  ✅ 공개된 영상 전부 댓글이 있다\n'); process.exit(0); }
console.log(`\n  ⛔ 고정 댓글이 없는 공개 영상 ${bad.length}건:`);
for (const id of bad) console.log(`     node scripts/yt-comment.mjs <해당 plan.json> ${id}`);
console.log('  (「고정」 버튼은 스튜디오에서 사람이 누른다)\n');
process.exit(1);
