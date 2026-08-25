#!/usr/bin/env node
// ============================================================================
// yt-retention — «어디서 나가는가»를 곡선으로 뽑는다 (audienceRetention)
// ----------------------------------------------------------------------------
// 왜: 「정보가 많아서」「배경이 안 어울려서」 같은 진단은 전부 추측이다.
//   이탈 곡선은 «몇 초에서 빠졌는지»를 직접 알려준다. 승자와 패자의 곡선을
//   겹쳐 보면 무엇이 다른지가 남는다.
//
// 사용:  node scripts/yt-retention.mjs [최대영상수]
// ============================================================================

import { readFileSync } from 'node:fs';

const TOP = Number(process.argv[2] || 8);
const env = readFileSync('.env.local', 'utf8');
// ⛔ 채널 스위치 — SIGNUM_YT=jp 면 일본 채널 토큰을 쓴다 (2026-08-21)
//   기본값은 hq. 환경변수를 «안 주면» 지금까지와 완전히 같게 동작한다.
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다» —
//   예전 2분기는 SIGNUM_YT=kr 오타 하나로 한국어 영상이 영어 채널에 올라갔다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');

const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: pick('YT_CLIENT_ID'), client_secret: pick('YT_CLIENT_SECRET'),
    refresh_token: pick(RTKEY), grant_type: 'refresh_token',
  }),
})).json();
if (!tok.access_token) { console.error('토큰 실패'); process.exit(1); }
const H = { Authorization: `Bearer ${tok.access_token}` };
const KEY = pick('YOUTUBE_API_KEY');

const iso = (d) => d.toISOString().slice(0, 10);
const end = new Date(Date.now() - 2 * 864e5);
const start = new Date(end - 89 * 864e5);            // 90일 — 표본을 넓힌다
const A = 'https://youtubeanalytics.googleapis.com/v2/reports';
const q = (p) => fetch(`${A}?${new URLSearchParams({
  ids: 'channel==MINE', startDate: iso(start), endDate: iso(end), ...p,
})}`, { headers: H }).then((r) => r.json());

// ── 영상 목록 + 성적 ────────────────────────────────────────────────────────
const vid = await q({
  metrics: 'views,averageViewPercentage,averageViewDuration',
  dimensions: 'video', sort: '-views', maxResults: '30',
});
if (vid.error) { console.error('✗', vid.error.message); process.exit(1); }

const ids = (vid.rows || []).map((r) => r[0]);
const meta = {};
for (let i = 0; i < ids.length; i += 50) {
  const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.slice(i, i + 50).join(',')}&key=${KEY}`).then((r) => r.json());
  for (const it of v.items || []) {
    const d = it.contentDetails.duration.match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/);
    meta[it.id] = { t: it.snippet.title, sec: (+(d?.[1] || 0)) * 60 + (+(d?.[2] || 0)) };
  }
}

const rows = (vid.rows || []).map((r) => ({
  id: r[0], views: r[1], pct: r[2], dur: r[3],
  title: meta[r[0]]?.t || r[0], len: meta[r[0]]?.sec || 0,
})).filter((r) => r.views >= 8);

// ── ① 길이 ↔ 조회율 상관 — 「16초로 줄여라」가 맞는지 «데이터로» 본다 ────────
const spearman = (a, b) => {
  const rank = (x) => { const s = [...x].map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = Array(x.length); s.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
  const ra = rank(a), rb = rank(b), n = a.length;
  const d2 = ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
};
console.log(`\n  표본 ${rows.length}편 (90일 · 조회 8회 이상)\n`);
console.log(`  길이 ↔ 평균조회율  순위상관  ${spearman(rows.map(r => r.len), rows.map(r => r.pct)).toFixed(2)}`);
console.log(`  조회수 ↔ 평균조회율 순위상관  ${spearman(rows.map(r => r.views), rows.map(r => r.pct)).toFixed(2)}`);

// ── ② 이탈 곡선 — 승자 vs 패자 ──────────────────────────────────────────────
const byPct = [...rows].sort((a, b) => b.pct - a.pct);
const pickList = [...byPct.slice(0, Math.ceil(TOP / 2)), ...byPct.slice(-Math.floor(TOP / 2))];

console.log('\n  이탈 곡선 — 재생 시작 대비 «남아 있는 비율»');
console.log('  ' + '─'.repeat(92));
for (const v of pickList) {
  const r = await q({
    metrics: 'audienceWatchRatio', dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${v.id}`, sort: 'elapsedVideoTimeRatio',
  });
  if (r.error || !r.rows?.length) { console.log(`  ${v.title.slice(0, 38)}  (곡선 없음 — 표본 부족)`); continue; }
  const pts = r.rows.map(([ratio, w]) => ({ s: ratio * v.len, w }));
  const at = (sec) => { const p = pts.reduce((b, c) => Math.abs(c.s - sec) < Math.abs(b.s - sec) ? c : b); return p.w; };
  const bar = (w) => '█'.repeat(Math.max(0, Math.round(w * 14)));
  const mark = v.pct >= 60 ? '✔' : '✗';
  console.log(`  ${mark} ${v.title.slice(0, 34).padEnd(35)} ${String(v.len) + 's'} · ${v.pct.toFixed(0)}%`);
  console.log(`      1s ${at(1).toFixed(2)} ${bar(at(1))}`);
  console.log(`      3s ${at(3).toFixed(2)} ${bar(at(3))}`);
  console.log(`      5s ${at(5).toFixed(2)} ${bar(at(5))}`);
  console.log(`     끝  ${pts[pts.length - 1].w.toFixed(2)} ${bar(pts[pts.length - 1].w)}`);
}
console.log('');
