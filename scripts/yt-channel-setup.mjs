#!/usr/bin/env node
// ============================================================================
// yt-channel-setup — 「왜 구독해야 하는가」에 답하는 채널로 만든다
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-21 실측)
//   7/1~8/21  조회 1,458 · 구독 증가 1 · 좋아요 1 · 공유 1.
//   24편을 올려 구독자 2명. 보긴 보는데 남지 않는다.
//   채널을 열어보니 **재생목록 0 · 섹션 0 · 트레일러 없음** —
//   쇼츠에서 넘어온 사람이 «정리 안 된 영상 더미»만 본다.
//
// 하는 일: 시리즈 재생목록 생성 → 영상 배치 → 채널 섹션으로 노출
// 사용: node scripts/yt-channel-setup.mjs [--dry]
// ============================================================================
import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const env = readFileSync('.env.local', 'utf8');
// ⛔ 채널 스위치 — SIGNUM_YT=jp 면 일본 채널 토큰을 쓴다 (2026-08-21)
//   기본값은 hq. 환경변수를 «안 주면» 지금까지와 완전히 같게 동작한다.
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다» —
//   예전 2분기는 SIGNUM_YT=kr 오타 하나로 한국어 영상이 영어 채널에 올라갔다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g(RTKEY), grant_type: 'refresh_token' }),
  })).json();
  return j.access_token;
})();
const api = async (path, opt = {}) => {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    ...opt, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(opt.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};

const APP = 'https://www.signumhq.com/app';
const TAIL = `\n\nFree on iOS and Android: ${APP}\nEducational only. Not investment advice.`;

// ── 시리즈 설계 — 실제 24편을 내용으로 묶었다 ───────────────────────────────
const SERIES = [
  { key: 'why',
    title: 'Why The Market Moved',
    desc: 'One measured reason a price moved, in under a minute. Every number is computed from daily closes and the options book, not repeated from a headline.',
    ids: ['ke34mBPAfNQ', 'o9vKV6vk3m4', 'PhW_NKew_rU', 'LNfVRCLaMtw', 'JSP5wqQGMRQ', 'oio0oVQkKf4'] },
  { key: 'chips',
    title: 'Chip Watch',
    desc: 'AMD, Nvidia, Micron, Broadcom, SanDisk. What the tape said, and what the options book said underneath it.',
    ids: ['Itfjyh55NCY', 'aGXtdRXHOzw', 'QJPIkEu5AU8', '_d5dWZnneIo', 'IIAmiA1qhtA', 'lgbQ3EbUzVs', 'iMX6ve1oDIk', 'aKIfRuBvpwU'] },
  { key: 'macro',
    title: 'Macro Decoded',
    desc: 'CPI, payrolls, rate odds, mortgages. The prints that move every stock, read in plain language with the actual figures on screen.',
    ids: ['lM5KPHDajvI', 'zdi5NVUI_7Q', 'QtHWyf8joco', 'sYnF75l5fLc', 'LXFHnhb3Nr8', 'WDi7xlkTh-o', 'TyksJ4R4Zug'] },
  { key: 'flow',
    title: 'Options And Flow',
    desc: 'Max pain, gamma flip, dark pool prints, squeeze pressure. What institutional order flow leaves behind, and how to read it.',
    ids: ['wIFt1lcy07c', '6tPJa20fjeE', 'BDJVD_H8syU'] },
];

console.log(DRY ? '\n  [DRY RUN] 실제로 만들지 않는다\n' : '\n  채널 정리 시작\n');

const made = [];
for (const s of SERIES) {
  console.log(`  ▶ ${s.title}  (${s.ids.length}편)`);
  if (DRY) { made.push({ ...s, id: 'DRY' }); continue; }
  const pl = await api('playlists?part=snippet,status', {
    method: 'POST',
    body: JSON.stringify({ snippet: { title: s.title, description: s.desc + TAIL, defaultLanguage: 'en' },
      status: { privacyStatus: 'public' } }),
  });
  console.log(`     생성 ${pl.id}`);
  let n = 0;
  for (const vid of s.ids) {
    try {
      await api('playlistItems?part=snippet', { method: 'POST',
        body: JSON.stringify({ snippet: { playlistId: pl.id, resourceId: { kind: 'youtube#video', videoId: vid } } }) });
      n++;
    } catch (e) { console.log(`     ✗ ${vid} ${String(e.message).slice(0, 80)}`); }
  }
  console.log(`     영상 ${n}/${s.ids.length} 추가`);
  made.push({ ...s, id: pl.id });
}

// ── 채널 섹션 — 재생목록을 채널 첫 화면에 올린다 ────────────────────────────
if (!DRY) {
  console.log('\n  ▶ 채널 섹션');
  let pos = 0;
  for (const m of made) {
    try {
      await api('channelSections?part=snippet,contentDetails', { method: 'POST',
        body: JSON.stringify({ snippet: { type: 'singlePlaylist', style: 'horizontalRow', position: pos++ },
          contentDetails: { playlists: [m.id] } }) });
      console.log(`     ✔ ${m.title}`);
    } catch (e) { console.log(`     ✗ ${m.title} ${String(e.message).slice(0, 120)}`); }
  }
}
console.log('\n  완료\n');
