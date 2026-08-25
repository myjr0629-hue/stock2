#!/usr/bin/env node
// ============================================================================
// yt-admin — 이미 올린 영상의 «뒷정리». 예약 취소 · 늦은 고정댓글 달기
// ----------------------------------------------------------------------------
// ⛔ 왜 생겼나 (2026-08-24)
//   ① 예약(비공개) 업로드는 댓글 API 가 403 을 낸다 — 비공개 영상에는 댓글을 못 단다.
//     yt-upload 는 그걸 «실패」로 찍고 끝냈고, 공개된 뒤에 다시 다는 사람이 없었다.
//     그래서 예약으로 올린 3편이 «댓글 0» 인 채로 며칠을 돌았다. 대표가 잡아냈다.
//     ⇒ 게시 후에 «반드시» 이 스크립트를 돌린다.
//   ② 소재가 겹치는 영상을 잘못 예약했을 때 되돌릴 방법이 없었다.
//
// ⛔ 삭제 기능은 «넣지 않는다». 삭제는 되돌릴 수 없다.
//   잘못 예약한 것은 «예약만» 푼다 (비공개로 남는다).
//
// 사용:
//   node scripts/yt-admin.mjs unschedule <videoId>
//   node scripts/yt-admin.mjs comment <videoId> <plan.json>   (plan 의 pinnedComment 사용)
//   node scripts/yt-admin.mjs comment <videoId> --text="..."
//   SIGNUM_YT=jp 를 붙이면 일본 채널
//   ⛔ 「고정」 버튼은 API 에 없다 — 스튜디오에서 사람이 누른다.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다» —
//   2분기 시절엔 SIGNUM_YT=kr 오타 하나가 조용히 hq 로 떨어졌다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || null;
const CID = g('YT_CLIENT_ID'), CSEC = g('YT_CLIENT_SECRET');
// ⛔ 예전엔 «|| g('YT_REFRESH_TOKEN')» 폴백이 붙어 있었다 (2026-08-25 제거).
//   그 폴백은 「KR 토큰이 없으면 영어 채널을 고친다」는 뜻이었다 — 조용한 오배송.
const RT = g(RTKEY);
if (!RT) { console.error(`  ⛔ .env.local 에 ${RTKEY} 가 없다.`); process.exit(1); }
if (!CID || !CSEC || !RT) { console.error('.env.local 인증 정보가 없다'); process.exit(1); }

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token: RT, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`토큰 갱신 실패: ${JSON.stringify(j)}`);
  return j.access_token;
}

const [cmd, id, arg3] = process.argv.slice(2);
if (!cmd || (cmd !== 'pending' && !id)) {
  console.error('사용: yt-admin <unschedule|comment|pending> [videoId] [plan.json|--text=...]');
  process.exit(1);
}
const tok = await token();
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

/** 댓글 등록 — 이미 우리 댓글이 있으면 두 번 달지 않는다 */
async function postComment(videoId, text) {
  const th = await (await fetch(
    `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=50`,
    { headers: H })).json();
  const mine = (th.items || []).filter((t) => /signumhq\.com/.test(t.snippet?.topLevelComment?.snippet?.textOriginal || ''));
  if (mine.length) return { ok: true, skipped: true };
  const r = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
    method: 'POST', headers: H,
    body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } }),
  });
  return { ok: r.ok, err: r.ok ? null : `${r.status} ${(await r.text()).slice(0, 140)}` };
}

// ── pending — 예약 업로드 때 못 단 댓글을 «게시된 것부터» 처리한다 ──────────
if (cmd === 'pending') {
  const F = '.agent/PENDING_COMMENTS.jsonl';
  let lines = [];
  try { lines = readFileSync(F, 'utf8').split('\n').filter((l) => l.trim()); }
  catch { console.log('  대기열이 비어 있다'); process.exit(0); }
  const want = YTW;
  const keep = [];
  for (const l of lines) {
    const it = JSON.parse(l);
    if (it.ch !== want) { keep.push(l); continue; }          // 다른 채널 건은 그대로 둔다
    const s = await (await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${it.id}`, { headers: H })).json();
    const v = s.items?.[0];
    if (!v) { console.log(`  ${it.id} 없음 — 대기열에서 뺀다`); continue; }
    if (v.status.privacyStatus !== 'public') {
      console.log(`  ${it.id} 아직 ${v.status.privacyStatus} (예약 ${it.publishAtKST}) — 다음에`);
      keep.push(l); continue;
    }
    const r = await postComment(it.id, it.text);
    if (r.skipped) console.log(`  ${it.id} 이미 댓글 있음 — 건너뜀`);
    else if (r.ok) console.log(`  ✔ ${it.id} 댓글 등록  「${v.snippet.title.slice(0, 28)}」`);
    else { console.log(`  ✗ ${it.id} 실패 ${r.err} — 대기열에 남긴다`); keep.push(l); }
  }
  writeFileSync(F, keep.length ? keep.join('\n') + '\n' : '');
  console.log(`\n  남은 대기 ${keep.length}건`);
  console.log('  ⚠ 「고정」 버튼은 스튜디오에서 사람이 눌러야 한다 (API 없음)');
  process.exit(0);
}

if (cmd === 'unschedule') {
  // 현재 상태를 먼저 읽는다 — 이미 공개된 것을 되돌리지 않기 위해
  const cur = await (await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${id}`, { headers: H })).json();
  const v = cur.items?.[0];
  if (!v) { console.error(`${id} 를 못 찾는다`); process.exit(1); }
  console.log(`  현재  ${v.snippet.title}`);
  console.log(`        ${v.status.privacyStatus} · 예약 ${v.status.publishAt || '없음'}`);
  if (v.status.privacyStatus === 'public') {
    console.error('  ⛔ 이미 «공개»다. 공개된 것을 비공개로 되돌리지 않는다 — 사람이 판단할 일이다.');
    process.exit(1);
  }
  const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', {
    method: 'PUT', headers: H,
    body: JSON.stringify({ id, status: {
      privacyStatus: 'private',
      selfDeclaredMadeForKids: v.status.selfDeclaredMadeForKids ?? false,
    } }),
  });
  const j = await r.json();
  if (!r.ok) { console.error('실패', JSON.stringify(j).slice(0, 300)); process.exit(1); }
  console.log(`  ✔ 예약 취소 — 비공개로 남는다 (삭제하지 않았다). 예약: ${j.status.publishAt || '없음'}`);
  process.exit(0);
}

// ── reschedule — 예약 «시각만» 옮긴다 (2026-08-24) ──────────────────────────
//   슬롯 재배치 때마다 필요했는데 손으로 스튜디오를 열어야 했다. 여기로 들인다.
//   ⛔ 공개된 것은 손대지 않는다 — unschedule 과 같은 원칙.
if (cmd === 'reschedule') {
  const at = process.argv.find((a) => a.startsWith('--at='))?.slice(5);
  const m = String(at || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) { console.error('--at="YYYY-MM-DD HH:MM" (KST/JST) 가 필요하다'); process.exit(1); }
  const cur = await (await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${id}`, { headers: H })).json();
  const v = cur.items?.[0];
  if (!v) { console.error(`${id} 를 못 찾는다`); process.exit(1); }
  console.log(`  현재  ${v.snippet.title}`);
  console.log(`        ${v.status.privacyStatus} · 예약 ${v.status.publishAt || '없음'}`);
  if (v.status.privacyStatus === 'public') {
    console.error('  ⛔ 이미 «공개»다 — 시각을 옮길 수 없다.');
    process.exit(1);
  }
  const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5]))
    .toISOString().replace(/\.\d{3}Z$/, 'Z');
  const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', {
    method: 'PUT', headers: H,
    body: JSON.stringify({ id, status: {
      privacyStatus: 'private', publishAt: utc,
      selfDeclaredMadeForKids: v.status.selfDeclaredMadeForKids ?? false,
    } }),
  });
  const j = await r.json();
  if (!r.ok) { console.error('실패', JSON.stringify(j).slice(0, 300)); process.exit(1); }
  console.log(`  ✔ ${at} (KST/JST) 로 옮겼다 — publishAt ${j.status.publishAt}`);
  process.exit(0);
}

if (cmd === 'comment') {
  let text = null;
  if (arg3?.startsWith('--text=')) text = arg3.slice(7);
  else if (arg3) {
    const items = [].concat(JSON.parse(readFileSync(arg3, 'utf8')));
    text = items.find((x) => x.pinnedComment)?.pinnedComment;
  }
  if (!text) { console.error('댓글 본문이 없다 (plan 의 pinnedComment 또는 --text=)'); process.exit(1); }

  // 이미 우리 댓글이 달려 있으면 «두 번 달지 않는다»
  const th = await (await fetch(
    `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${id}&maxResults=50`,
    { headers: H })).json();
  const mine = (th.items || []).filter((t) => /signumhq\.com/.test(t.snippet.topLevelComment.snippet.textOriginal || ''));
  if (mine.length) {
    console.log(`  이미 우리 댓글이 ${mine.length}개 있다 — 달지 않는다`);
    console.log(`   "${mine[0].snippet.topLevelComment.snippet.textOriginal.slice(0, 60)}"`);
    process.exit(0);
  }

  const r = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
    method: 'POST', headers: H,
    body: JSON.stringify({ snippet: { videoId: id, topLevelComment: { snippet: { textOriginal: text } } } }),
  });
  const j = await r.json();
  if (!r.ok) { console.error('실패', JSON.stringify(j).slice(0, 300)); process.exit(1); }
  console.log(`  ✔ 댓글 등록 ${id}`);
  console.log(`   "${text.split('\n')[0].slice(0, 60)}"`);
  console.log('   ⚠ 「고정」은 스튜디오에서 사람이 눌러야 한다 (API 없음)');
  process.exit(0);
}

console.error(`모르는 명령: ${cmd}`);
process.exit(1);
