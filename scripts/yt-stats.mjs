#!/usr/bin/env node
// ============================================================================
// yt-stats — 채널 «지속률·평균 조회율·트래픽 소스»를 직접 뽑는다 (OAuth)
// ----------------------------------------------------------------------------
// 왜: 지금까지 이 수치는 대표가 스튜디오 화면을 보고 불러준 것을 받아적었다.
//     이 채널 작업의 거의 모든 판단이 «평균 조회율»에 걸려 있는데, 그걸
//     매번 사람 손을 거쳐 받으면 느리고 틀린다. 여기서 직접 잰다.
//
// 사전: node scripts/yt-auth.mjs 로 YT_REFRESH_TOKEN 을 받아둔다.
//
// 사용:  node scripts/yt-stats.mjs [일수]      기본 28일
// ============================================================================

import { readFileSync } from 'node:fs';

const DAYS = Number(process.argv[2] || 28);
const env = readFileSync('.env.local', 'utf8');
// ⛔ 채널 스위치 — SIGNUM_YT=jp 면 일본 채널 토큰을 쓴다 (2026-08-21)
//   기본값은 hq. 환경변수를 «안 주면» 지금까지와 완전히 같게 동작한다.
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다» —
//   예전 2분기는 SIGNUM_YT=kr 오타 하나로 한국어 영상이 영어 채널에 올라갔다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');

const CLIENT_ID = pick('YT_CLIENT_ID');
const CLIENT_SECRET = pick('YT_CLIENT_SECRET');
const REFRESH = pick(RTKEY);
const API_KEY = pick('YOUTUBE_API_KEY');
if (!REFRESH) { console.error('YT_REFRESH_TOKEN 이 없다 → node scripts/yt-auth.mjs'); process.exit(1); }

// ── 액세스 토큰 ─────────────────────────────────────────────────────────────
const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: REFRESH, grant_type: 'refresh_token',
  }),
});
const tok = await tr.json();
if (!tok.access_token) { console.error('토큰 갱신 실패:', JSON.stringify(tok).slice(0, 240)); process.exit(1); }
const H = { Authorization: `Bearer ${tok.access_token}` };

const iso = (d) => d.toISOString().slice(0, 10);
const end = new Date(Date.now() - 2 * 864e5);          // 애널리틱스는 1~2일 지연된다
const start = new Date(end - (DAYS - 1) * 864e5);

const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';
const q = (p) => fetch(`${ANALYTICS}?${new URLSearchParams({
  ids: 'channel==MINE', startDate: iso(start), endDate: iso(end), ...p,
})}`, { headers: H }).then((r) => r.json());

console.log(`\n  기간 ${iso(start)} ~ ${iso(end)}  (${DAYS}일 · 애널리틱스는 1~2일 지연)\n`);

// ── ① 영상별 «평균 조회율» — 이 채널의 핵심 지표 ────────────────────────────
const vid = await q({
  metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
  dimensions: 'video', sort: '-views', maxResults: '20',
});
if (vid.error) { console.error('✗ Analytics:', vid.error.message); process.exit(1); }

const ids = (vid.rows || []).map((r) => r[0]);
let titles = {};
if (ids.length && API_KEY) {
  const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.join(',')}&key=${API_KEY}`).then((r) => r.json());
  for (const it of v.items || []) {
    const d = it.contentDetails.duration.match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/);
    titles[it.id] = { t: it.snippet.title, sec: (+(d?.[1] || 0)) * 60 + (+(d?.[2] || 0)) };
  }
}

console.log('  영상별 — ★ 평균 조회율이 쇼츠 배포의 주 신호다');
console.log('  ' + '─'.repeat(94));
console.log('  ' + '제목'.padEnd(42) + '길이'.padStart(5) + '조회'.padStart(7)
  + '평균시청'.padStart(9) + '평균조회율'.padStart(11));
for (const r of vid.rows || []) {
  const m = titles[r[0]] || { t: r[0], sec: 0 };
  const pct = r[4];
  const flag = pct >= 60 ? '✔' : pct >= 45 ? '·' : '✗';
  console.log(`  ${flag} ${m.t.slice(0, 40).padEnd(40)} ${String(m.sec ? m.sec.toFixed(0) + 's' : '-').padStart(5)} `
    + `${String(r[1]).padStart(6)} ${(r[3] + 's').padStart(8)} ${(pct.toFixed(1) + '%').padStart(10)}`);
}

// ── ② 트래픽 소스 — 검색 유입은 «질»이 다르다 ───────────────────────────────
const src = await q({
  metrics: 'views,averageViewDuration,averageViewPercentage',
  dimensions: 'insightTrafficSourceType', sort: '-views',
});
console.log('\n  트래픽 소스');
console.log('  ' + '─'.repeat(70));
console.log('  ' + '소스'.padEnd(30) + '조회'.padStart(8)
  + '평균시청'.padStart(10) + '평균조회율'.padStart(12));
for (const r of src.rows || []) {
  console.log(`  ${String(r[0]).padEnd(30)} ${String(r[1]).padStart(7)} ${(r[2] + 's').padStart(9)} ${(r[3].toFixed(1) + '%').padStart(11)}`);
}

// ── ③ 채널 합계 ─────────────────────────────────────────────────────────────
const tot = await q({ metrics: 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained' });
const t = (tot.rows || [[0, 0, 0, 0]])[0];
console.log(`\n  채널 합계 — 조회 ${t[0]} · 시청 ${t[1]}분 · 평균 조회율 ${Number(t[2]).toFixed(1)}% · 구독 +${t[3]}\n`);
