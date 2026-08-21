#!/usr/bin/env node
// ============================================================================
// yt-ledger — 채널 «원장». 영상마다 조건과 성적을 한 줄로 쌓는다
// ----------------------------------------------------------------------------
// 왜: 지금까지 판단 근거가 «9편·수동 측정»이었다. 그래서 표본이 바뀔 때마다
//   결론이 흔들렸다(첫컷 상관 -0.90 은 살아남았지만, 상단밝기 +0.13 은 오판이었다).
//   여기서 «조건(길이·게시시각·같은날 편수)»과 «성적(조회·지속률)»을 한곳에 모아
//   상관을 매번 다시 계산한다. 감이 아니라 표본으로 말하기 위해서다.
//
// 출력: .agent/YT_LEDGER.json  (누적) + 화면 요약
// 사용: node scripts/yt-ledger.mjs
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
// ⛔ 채널 스위치 — SIGNUM_YT=jp 면 일본 채널 토큰을 쓴다 (2026-08-21)
//   기본값은 hq. 환경변수를 «안 주면» 지금까지와 완전히 같게 동작한다.
const RTKEY = String(process.env.SIGNUM_YT || 'hq').toLowerCase() === 'jp'
  ? 'YT_JP_REFRESH_TOKEN' : 'YT_REFRESH_TOKEN';
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const KEY = pick('YOUTUBE_API_KEY');

const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: pick('YT_CLIENT_ID'), client_secret: pick('YT_CLIENT_SECRET'),
    refresh_token: pick(RTKEY), grant_type: 'refresh_token',
  }),
})).json();
const H = { Authorization: `Bearer ${tok.access_token}` };

// ── 전 영상 메타 ────────────────────────────────────────────────────────────
const ch = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=@SIGNUMHQ&key=${KEY}`).then((r) => r.json());
const UP = ch.items[0].contentDetails.relatedPlaylists.uploads;
let ids = [], page = '';
do {
  const p = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${UP}&maxResults=50&pageToken=${page}&key=${KEY}`).then((r) => r.json());
  ids.push(...p.items.map((i) => i.contentDetails.videoId));
  page = p.nextPageToken || '';
} while (page);

const meta = {};
for (let i = 0; i < ids.length; i += 50) {
  const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${ids.slice(i, i + 50).join(',')}&key=${KEY}`).then((r) => r.json());
  for (const it of v.items || []) {
    const d = it.contentDetails.duration.match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/);
    meta[it.id] = {
      id: it.id, title: it.snippet.title,
      publishedAt: it.snippet.publishedAt,
      lenSec: (+(d?.[1] || 0)) * 60 + (+(d?.[2] || 0)),
      views: +(it.statistics.viewCount || 0),
      likes: +(it.statistics.likeCount || 0),
    };
  }
}

// ── 지속률 (애널리틱스) ─────────────────────────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10);
const r = await fetch('https://youtubeanalytics.googleapis.com/v2/reports?' + new URLSearchParams({
  ids: 'channel==MINE', startDate: '2026-01-01', endDate: iso(new Date()),
  metrics: 'views,averageViewPercentage,averageViewDuration', dimensions: 'video',
  sort: '-views', maxResults: '200',
}), { headers: H }).then((x) => x.json());
for (const row of r.rows || []) {
  if (meta[row[0]]) { meta[row[0]].pct = row[2]; meta[row[0]].avgSec = row[3]; }
}

// ── 같은 날 몇 편 올렸나 ────────────────────────────────────────────────────
const KST = (s) => new Date(new Date(s).getTime() + 9 * 3600e3);      // 우리 운영 기준 시각
const rows = Object.values(meta).map((m) => ({ ...m, day: iso(KST(m.publishedAt)), hourKST: KST(m.publishedAt).getUTCHours() }));
const perDay = {};
for (const v of rows) perDay[v.day] = (perDay[v.day] || 0) + 1;
for (const v of rows) v.sameDay = perDay[v.day];

mkdirSync('.agent', { recursive: true });
writeFileSync('.agent/YT_LEDGER.json', JSON.stringify({ pulledAt: new Date().toISOString(), videos: rows }, null, 2));

// ── 분석 ────────────────────────────────────────────────────────────────────
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const withPct = rows.filter((v) => v.pct != null);

console.log(`\n  총 ${rows.length}편 · 지속률 있는 편 ${withPct.length}편`);

console.log('\n  ★ «하루 몇 편 올렸는가» ↔ 성적');
console.log('  ' + '─'.repeat(64));
console.log('  같은날 편수   편수   조회 중앙값   지속률 중앙값');
for (const n of [...new Set(rows.map((v) => v.sameDay))].sort()) {
  const g = rows.filter((v) => v.sameDay === n);
  const gp = g.filter((v) => v.pct != null).map((v) => v.pct);
  console.log(`      ${n}편/일 ${String(g.length).padStart(7)}편 ${String(med(g.map((v) => v.views))).padStart(11)} `
    + `${(gp.length ? med(gp).toFixed(1) + '%' : '-').padStart(13)}`);
}

const sp = (a, b) => {
  const rank = (x) => { const s = [...x].map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const rr = Array(x.length); s.forEach(([, i], k) => { rr[i] = k + 1; }); return rr; };
  const ra = rank(a), rb = rank(b), n = a.length;
  if (n < 4) return NaN;
  return 1 - (6 * ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0)) / (n * (n * n - 1));
};
console.log('\n  순위상관 (지속률 기준)');
console.log(`    길이       ${sp(withPct.map(v => v.lenSec), withPct.map(v => v.pct)).toFixed(2)}`);
console.log(`    같은날편수  ${sp(withPct.map(v => v.sameDay), withPct.map(v => v.pct)).toFixed(2)}`);
console.log(`    게시시각    ${sp(withPct.map(v => v.hourKST), withPct.map(v => v.pct)).toFixed(2)}`);

console.log('\n  → .agent/YT_LEDGER.json\n');
