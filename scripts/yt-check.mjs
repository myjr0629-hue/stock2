#!/usr/bin/env node
// ============================================================================
// yt-check — 우리 영상이 «영어권에서 실제로 서비스되는지»를 추측 없이 확인한다
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-14): "추측이 아닌 원인을 명확하게. 실제 미국 시장에서 영어권에서
//   플레이가 되는지도 모르겠고, 추측이 아닌 찾아볼 수 있는 길을 만들어."
//
// 【이 도구가 답하는 것 / 못 답하는 것】
//   ✅ 공개 상태 · 처리 완료 여부 · **지역 차단(regionRestriction)** · 임베드 허용
//   ✅ 선언된 «오디오 언어»와 «기본 언어» — 유튜브가 우리 영상을 몇 개 국어로 보는지
//   ✅ **미국 색인 노출** — regionCode=US 로 검색해 우리 영상이 나오는지
//   ✅ 공개 조회/좋아요/댓글 수
//   ❌ «쇼츠 피드에 실제로 뿌려졌는지» — 이건 공개 API 에 없다. Studio 분석의
//      「지역별」만이 답한다. (그래서 Chrome 확장 연결이 따로 필요하다)
//
// 【키】 .env.local 의 YOUTUBE_API_KEY. 없으면 GEMINI_API_KEY 로 시도한다
//   (같은 구글 프로젝트에 YouTube Data API v3 가 켜져 있으면 통한다).
//   새로 만들려면: console.cloud.google.com → API 및 서비스 → 사용 설정 →
//   "YouTube Data API v3" → 사용 → 사용자 인증 정보 → API 키 만들기.
//
// 사용:  node scripts/yt-check.mjs [@핸들]      기본 @SIGNUMHQ
// ============================================================================

import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
// ⚠️ ^ 앵커를 쓰지 않는다 — .env.local 줄바꿈/인코딩에 따라 안 잡히는 경우가 있다.
//    tts-beats.mjs 와 같은 방식(앵커 없는 단순 매치)으로 맞춘다.
const pick = (k) => (env.match(new RegExp(`${k}=(\\S+)`)) || [])[1];
const KEY = pick('YOUTUBE_API_KEY') || pick('GEMINI_API_KEY');
if (!KEY) { console.error('.env.local 에 YOUTUBE_API_KEY 가 없다'); process.exit(1); }

const HANDLE = (process.argv[2] || '@SIGNUMHQ').replace(/^@?/, '@');
const API = 'https://www.googleapis.com/youtube/v3';

async function get(path, params) {
  const q = new URLSearchParams({ ...params, key: KEY });
  const r = await fetch(`${API}/${path}?${q}`);
  const j = await r.json();
  if (!r.ok) {
    const m = j?.error?.message || r.statusText;
    throw new Error(`${path} → HTTP ${r.status}: ${m}`);
  }
  return j;
}

try {
  // ① 채널 찾기 ------------------------------------------------------------
  const ch = await get('channels', { part: 'contentDetails,statistics,snippet', forHandle: HANDLE });
  if (!ch.items?.length) { console.error(`${HANDLE} 채널을 못 찾았다`); process.exit(1); }
  const c = ch.items[0];
  console.log(`채널  ${c.snippet.title}  (${HANDLE})`);
  console.log(`  국가 ${c.snippet.country ?? '미설정'} · 구독 ${c.statistics.subscriberCount ?? '비공개'}`
    + ` · 영상 ${c.statistics.videoCount} · 총조회 ${c.statistics.viewCount}`);

  // ② 최근 업로드 ----------------------------------------------------------
  const up = c.contentDetails.relatedPlaylists.uploads;
  const pl = await get('playlistItems', { part: 'contentDetails', playlistId: up, maxResults: '15' });
  const ids = pl.items.map((i) => i.contentDetails.videoId);

  const v = await get('videos', {
    part: 'snippet,status,contentDetails,statistics',
    id: ids.join(','),
  });

  console.log(`\n영상 ${v.items.length}편 — 공개 상태 / 지역 / 언어`);
  console.log('─'.repeat(100));
  for (const it of v.items) {
    const s = it.snippet, st = it.status, cd = it.contentDetails;
    const rr = cd.regionRestriction;
    const region = rr?.blocked ? `⛔ 차단 ${rr.blocked.length}국` :
      rr?.allowed ? `⚠️ 허용국만 ${rr.allowed.length}개` : '전세계';
    const lang = `${s.defaultLanguage ?? '?'} / 오디오 ${s.defaultAudioLanguage ?? '?'}`;
    console.log(
      `${(s.title || '').slice(0, 42).padEnd(44)}`
      + ` ${cd.duration.replace('PT', '').padEnd(8)}`
      + ` ${st.privacyStatus.padEnd(7)} ${st.uploadStatus.padEnd(9)}`
      + ` ${region.padEnd(12)} ${lang.padEnd(16)}`
      + ` 조회 ${String(it.statistics.viewCount ?? 0).padStart(5)}`
    );
  }

  // ③ ★ 미국 색인 노출 — regionCode=US 로 검색해 우리 영상이 나오는가 -------
  //   이게 「영어권에서 서비스되는가」의 공개 API 상 가장 직접적인 증거다.
  console.log(`\n미국 색인 검사 (regionCode=US · relevanceLanguage=en)`);
  console.log('─'.repeat(100));
  const newest = v.items.slice(0, 4);
  for (const it of newest) {
    const title = it.snippet.title;
    const r = await get('search', {
      part: 'snippet', q: title, type: 'video',
      regionCode: 'US', relevanceLanguage: 'en', maxResults: '10',
    });
    const rank = r.items.findIndex((x) => x.id.videoId === it.id);
    console.log(`  ${rank >= 0 ? `✅ ${rank + 1}위` : '❌ 미노출'}   ${title.slice(0, 60)}`);
  }

  console.log(`\n⚠️ 여기까지는 «서비스 가능 여부»다. «쇼츠 피드에 실제로 뿌려졌는지»는`);
  console.log(`   공개 API 에 없다 — Studio 분석 → 시청자층 → 지역별 이 유일한 답이다.`);
} catch (e) {
  console.error(`\n실패: ${e.message}`);
  if (/API key not valid|has not been used|disabled/i.test(e.message)) {
    console.error(`\n→ 이 키로는 YouTube Data API 가 안 열린다. 새 키가 필요하다:`);
    console.error(`   console.cloud.google.com → API 및 서비스 → 라이브러리`);
    console.error(`   → "YouTube Data API v3" 검색 → 사용 설정`);
    console.error(`   → 사용자 인증 정보 → API 키 만들기 → .env.local 에 YOUTUBE_API_KEY= 로 추가`);
  }
  process.exit(1);
}
