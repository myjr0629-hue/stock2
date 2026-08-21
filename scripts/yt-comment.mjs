#!/usr/bin/env node
// ============================================================================
// yt-comment — 「공개된 뒤」 고정 댓글을 붙인다
// ----------------------------------------------------------------------------
// ⛔ 왜 따로 있나 (2026-08-21 실측)
//   유튜브는 **비공개(private) 영상에 댓글 스레드를 만들 수 없다** — 403
//   "insufficient permissions". 12초 간격 5회 재시도가 전부 403 이었다.
//   업로드 «직후 처리중»(400) 과는 다른 «구조적» 제약이다.
//   ⇒ 예약 게시(publishAt)를 쓰면 고정 댓글은 «게시 시각 이후»에 붙여야 한다.
//
// 사용: node scripts/yt-comment.mjs <plan.json> [videoId]
//   videoId 를 생략하면 .agent/PUBLISH_LOG.md 의 마지막 항목에서 찾는다
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const PLAN = process.argv[2];
if (!PLAN || !existsSync(PLAN)) { console.error('사용: yt-comment <plan.json> [videoId]'); process.exit(1); }
const plan = [].concat(JSON.parse(readFileSync(PLAN, 'utf8')));

const env = readFileSync('.env.local', 'utf8');
// ⛔ 채널 스위치 — SIGNUM_YT=jp 면 일본 채널 토큰을 쓴다 (2026-08-21)
//   기본값은 hq. 환경변수를 «안 주면» 지금까지와 완전히 같게 동작한다.
const RTKEY = String(process.env.SIGNUM_YT || 'hq').toLowerCase() === 'jp'
  ? 'YT_JP_REFRESH_TOKEN' : 'YT_REFRESH_TOKEN';
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g(RTKEY), grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!j.access_token) { console.error('토큰 실패', j); process.exit(1); }
  return j.access_token;
}

function idsFromLog() {
  const p = '.agent/PUBLISH_LOG.md';
  if (!existsSync(p)) return [];
  const t = readFileSync(p, 'utf8');
  return [...t.matchAll(/`([A-Za-z0-9_-]{11})`/g)].map((m) => m[1]);
}

const tok = await token();
const argId = process.argv[3];
const logIds = idsFromLog();
let bad = 0;

for (let i = 0; i < plan.length; i++) {
  const it = plan[i];
  const id = argId || logIds[logIds.length - plan.length + i];
  if (!id) { console.log(`  ✗ ${it.title} — videoId 를 못 찾았다`); bad++; continue; }
  if (!it.pinnedComment) { console.log(`  ✗ ${it.title} — pinnedComment 없음`); bad++; continue; }

  // 공개 상태인지 먼저 본다 — 비공개면 붙지 않는다
  const s = await (await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=status&id=${id}`,
    { headers: { Authorization: `Bearer ${tok}` } })).json();
  const priv = s.items?.[0]?.status?.privacyStatus;
  if (priv === 'private') {
    console.log(`  ✗ ${id} — 아직 «비공개»다. 게시(${it.publishAtKST || '?'}) 후에 다시 실행한다`);
    bad++; continue;
  }

  let done = false, last = '';
  for (let k = 0; k < 5 && !done; k++) {
    if (k) await new Promise((r) => setTimeout(r, 10000));
    const r = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: { videoId: id, topLevelComment: { snippet: { textOriginal: it.pinnedComment } } } }),
    });
    if (r.ok) done = true; else last = `${r.status} ${(await r.text()).slice(0, 140)}`;
  }
  console.log(done
    ? `  ✔ ${id}  고정 댓글 등록 (${priv})  — 「고정」만 스튜디오에서 누른다`
    : `  ✗ ${id}  실패 ${last}`);
  if (!done) bad++;
}
process.exit(bad ? 1 : 0);
