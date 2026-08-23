#!/usr/bin/env node
// ============================================================================
// channel-archive — 「우리가 올린 영상은 전부 로컬에 원본으로 갖고 있는다」
// ----------------------------------------------------------------------------
// ⛔ 왜 생겼나 (2026-08-24). 대표 지시다.
//   「광고영상 만들어둔 것 걸어봐」를 받고도 그것을 못 찾아 소스에서 새로 구웠고,
//   새로 구운 것을 공개까지 올렸다가 내렸다. 실제로는 채널에 일부공개로 이미 있었다
//   (VUPwd_Fugl0, 27초). 로컬에도 없었다 — 렌더가 지워졌거나 다른 머신에서 만든 것이다.
//
//   원인은 «기억» 이 아니라 «기록과 사본이 없던 것» 이다:
//     · 렌더 산출물(mp4)은 커밋하지 않는다 → 저장소에 흔적이 없다
//     · 채널에 무엇이 올라가 있는지 적어둔 문서가 없었다
//     · 비공개·일부공개는 «공개 API 로 아예 안 보인다» → OAuth 로만 확인된다
//   ⇒ 새 세션은 존재 자체를 알 방법이 없었다. 그래서 사람이 아니라 이 스크립트가 기억한다.
//
// 하는 일
//   ① 두 채널(hq/jp)의 «업로드 전수» 를 OAuth 로 훑는다 — 비공개·일부공개 포함
//   ② 상태·조회·길이·태그수를 .agent/CHANNEL_INVENTORY.json 에 적는다
//   ③ 로컬 사본이 없는 것은 yt-dlp 로 내려받아 media/archive/<ch>/<id>.mp4 로 둔다
//   ④ 사람이 읽을 표를 .agent/CHANNEL_INVENTORY.md 로 다시 쓴다
//
// ⛔ 사본은 «지우지 않는다». 유튜브에서 지워도 로컬이 원본이 된다.
// ⛔ media/archive 는 커밋하지 않는다 (빌드 산출물 금지 규칙). 대신 JSON 기록은 커밋한다.
//
// 사용:
//   node scripts/channel-archive.mjs            (두 채널 다)
//   node scripts/channel-archive.mjs --no-download   (기록만 갱신)
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, copyFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const NO_DL = process.argv.includes('--no-download');
const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const env = readFileSync('.env.local', 'utf8');
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || null;
const CID = g('YT_CLIENT_ID'), CSEC = g('YT_CLIENT_SECRET');

const CHANNELS = [
  { key: 'hq', label: 'SIGNUM HQ (US)', rt: g('YT_REFRESH_TOKEN') },
  { key: 'jp', label: 'SIGNUM JP', rt: g('YT_JP_REFRESH_TOKEN') || g('YT_REFRESH_TOKEN') },
];

async function tokenFor(rt) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token: rt, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`토큰 실패: ${JSON.stringify(j).slice(0, 160)}`);
  return j.access_token;
}

/** 가로 픽셀 — 보관본이 저화질인지 가른다 */
const widthOf = (f) => {
  const r = spawnSync(`${FFDIR}/ffprobe.exe`, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width', '-of', 'csv=p=0', f], { encoding: 'utf8' });
  return +(String(r.stdout || '').trim().split('\n')[0] || 0);
};

/** ISO8601 PT27S → 27 */
const secOf = (d) => {
  const m = String(d || '').match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] || 0)) * 60 + (+(m[2] || 0)) : 0;
};

// ── plan 이 아는 것: 제목 → 렌더 파일 ────────────────────────────────────────
const PLAN_BY_TITLE = new Map();
for (const f of readdirSync('.agent').filter((x) => /^_plan_.*\.json$/.test(x))) {
  try {
    for (const it of [].concat(JSON.parse(readFileSync('.agent/' + f, 'utf8'))))
      if (it.title && it.file) PLAN_BY_TITLE.set(it.title, it.file);
  } catch {}
}

const out = { updatedAt: new Date().toISOString(), channels: {} };

for (const ch of CHANNELS) {
  if (!ch.rt) { console.log(`  ${ch.label}: 토큰 없음 — 건너뜀`); continue; }
  const H = { Authorization: `Bearer ${await tokenFor(ch.rt)}` };
  const me = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true', { headers: H })).json();
  const up = me.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!up) { console.log(`  ${ch.label}: 업로드 목록을 못 읽었다`); continue; }

  let page = '', ids = [];
  do {
    const pl = await (await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50${page ? '&pageToken=' + page : ''}`,
      { headers: H })).json();
    ids.push(...(pl.items || []).map((x) => x.contentDetails.videoId));
    page = pl.nextPageToken || '';
  } while (page);

  const rows = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await (await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,contentDetails,statistics&id=${ids.slice(i, i + 50).join(',')}`,
      { headers: H })).json();
    for (const x of v.items || []) rows.push({
      id: x.id, title: x.snippet.title,
      status: x.status.privacyStatus,
      publishAt: x.status.publishAt || null,
      publishedAt: x.snippet.publishedAt,
      sec: secOf(x.contentDetails.duration),
      views: +(x.statistics?.viewCount || 0),
      comments: +(x.statistics?.commentCount || 0),
      tags: (x.snippet.tags || []).length,
      categoryId: x.snippet.categoryId,
    });
  }
  rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // ── 로컬 사본 ────────────────────────────────────────────────────────────
  const dir = `media/archive/${ch.key}`;
  mkdirSync(dir, { recursive: true });
  for (const r of rows) {
    const f = `${dir}/${r.id}.mp4`;
    // ⛔ 이미 있어도 «저화질이면» 다시 받는다. 처음 판본이 360x640 을 받아 놓았다.
    if (existsSync(f) && statSync(f).size > 10000 && widthOf(f) >= 1000) { r.local = f; continue; }
    if (NO_DL) { r.local = null; continue; }
    // ⛔ 비공개는 yt-dlp 로 못 받는다. 그런데 «우리가 올린 것» 이면 렌더 원본이 로컬에 있다.
    //   plan(.agent/_plan_*.json) 이 제목 → 파일 경로를 갖고 있으니 그걸로 찾아 복사한다.
    //   이게 없으면 「받을 수 없다」로 남고, 정작 원본이 옆에 있는데 기록은 «없음» 이 된다.
    const fromPlan = PLAN_BY_TITLE.get(r.title);
    if (fromPlan && existsSync(fromPlan)) {
      copyFileSync(fromPlan, f);
      r.local = f; r.localNote = '렌더 원본 복사 (' + fromPlan + ')';
      console.log(`   ⧉ ${r.id}  ${r.title.slice(0, 40)} — ${fromPlan}`);
      continue;
    }
    // ⛔ 비공개는 로그인 없이 못 받는다. 받아지는 것만 받고, 못 받은 것은 «기록에 남긴다».
    // ⛔ '-f mp4/best' 는 «progressive mp4» 만 골라 360x640 을 받는다 (2026-08-24 실측).
    //   보관본이 저화질이면 「원본을 갖고 있는다」가 성립하지 않는다.
    //   영상·음성 최고 트랙을 따로 받아 합친다 → ffmpeg 위치를 명시해야 합쳐진다.
    const p = spawnSync('yt-dlp', [
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
      '--merge-output-format', 'mp4', '--ffmpeg-location', FFDIR,
      '-o', f, `https://www.youtube.com/watch?v=${r.id}`,
    ], { encoding: 'utf8' });
    const okDl = existsSync(f) && statSync(f).size > 10000;
    r.local = okDl ? f : null;
    if (!okDl) r.localNote = r.status === 'private' ? '비공개라 받을 수 없다 — 스튜디오에서 내려받아야 한다'
      : (String(p.stderr || '').split('\n').find((l) => /ERROR/.test(l)) || '내려받기 실패').slice(0, 100);
    console.log(`   ${okDl ? '⬇' : '✗'} ${r.id}  ${r.title.slice(0, 40)}${okDl ? '' : ' — ' + r.localNote}`);
  }

  out.channels[ch.key] = { label: ch.label, n: rows.length, rows };
  const miss = rows.filter((r) => !r.local).length;
  console.log(`  ${ch.label}: ${rows.length}편 · 로컬 사본 ${rows.length - miss}편 · 없음 ${miss}편`);
}

writeFileSync('.agent/CHANNEL_INVENTORY.json', JSON.stringify(out, null, 2));

// ── 사람이 읽는 표 ──────────────────────────────────────────────────────────
const L = [];
L.push('# 채널 재고 — 올린 영상 전수 + 로컬 원본');
L.push('');
L.push('> ⛔ 이 파일은 `node scripts/channel-archive.mjs` 가 «다시 쓴다». 손으로 고치지 않는다.');
L.push('> 왜 필요한가: 2026-08-24, 이미 채널에 있던 광고(VUPwd_Fugl0)를 못 찾아 새로 구워');
L.push('> 공개까지 올렸다가 내렸다. 렌더는 커밋하지 않으므로 «기록과 사본» 이 없으면 다음 세션은 모른다.');
L.push('>');
L.push('> **업로드했으면 반드시 이 스크립트를 돌린다.** 비공개·일부공개도 전부 잡힌다.');
L.push('');
L.push(`갱신 ${out.updatedAt}`);
for (const [k, c] of Object.entries(out.channels)) {
  L.push('');
  L.push(`## ${c.label} — ${c.n}편`);
  L.push('');
  L.push('| 상태 | ID | 초 | 조회 | 댓글 | 로컬 | 제목 |');
  L.push('|---|---|---|---|---|---|---|');
  for (const r of c.rows) {
    const st = r.status === 'public' ? '공개' : r.status === 'unlisted' ? '일부공개'
      : r.publishAt ? `예약 ${new Date(Date.parse(r.publishAt) + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ')} (KST/JST)` : '비공개';
    L.push(`| ${st} | \`${r.id}\` | ${r.sec} | ${r.views} | ${r.comments} | ${r.local ? '✔' : '✗ ' + (r.localNote || '')} | ${r.title.replace(/\|/g, '/').slice(0, 52)} |`);
  }
}
writeFileSync('.agent/CHANNEL_INVENTORY.md', L.join('\n') + '\n');
console.log('\n  → .agent/CHANNEL_INVENTORY.json · .agent/CHANNEL_INVENTORY.md');
console.log('  → media/archive/<ch>/<id>.mp4  (커밋하지 않는다 — 기록만 커밋)');
