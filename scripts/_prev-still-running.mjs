#!/usr/bin/env node
// ============================================================================
// 직전 편이 «아직 달리고 있는가» — 달리고 있으면 다음 편을 올리면 안 된다.
// ----------------------------------------------------------------------------
// ⛔ 왜 생겼나 (2026-08-23)
//   테스트1(wfO7CbK8-xQ)이 30분째 2차 파동으로 오르는 중에 테스트2를 올렸다.
//   테스트1은 그 순간 280회에서 «완전히 멎었고», 배포가 테스트2로 옮겨갔다.
//   유튜브는 그 채널의 «가장 최신 쇼츠»에 배포를 몰아준다 — 새 편이 직전 편을 자른다.
//
//   나는 이 결론(같은 날 몰아올리면 5배 손해 · z=3.02)을 «직접 재서 보고까지 해놓고»
//   30분 뒤에 어겼다. 기억에 맡겨두면 안 되는 것을 기억에 맡겨둔 것이다.
//   ⇒ 사람 판단을 빼고 «업로드 경로에서» 막는다. shorts-gate 와 같은 원리다.
//
// 판정: 직전 편의 조회수를 90초 간격으로 3번 재서 «하나라도 늘면» 아직 달리는 것이다.
//   ⛔ 「잠깐 멎었다」로는 부족하다 — 테스트1 은 15~18분에 3분간 0 이었다가
//     24/분으로 다시 붙었다. 그래서 최근 «30분» 이 전부 0 이어야 안전하다고 본다.
//
// 사용: node scripts/_prev-still-running.mjs          (직전 공개편 자동 탐색)
//       node scripts/_prev-still-running.mjs <videoId>
// 종료코드: 0 = 올려도 된다 · 1 = 아직 달린다(올리지 말 것)
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const RTKEY = String(process.env.SIGNUM_YT || 'hq').toLowerCase() === 'jp'
  ? 'YT_JP_REFRESH_TOKEN' : 'YT_REFRESH_TOKEN';

const AT = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET,
    refresh_token: env[RTKEY], grant_type: 'refresh_token',
  }),
})).json()).access_token;
const H = { headers: { authorization: `Bearer ${AT}` } };

let ID = process.argv[2];
if (!ID) {
  const ch = (await (await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', H)).json()).items[0];
  const pl = await (await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${ch.contentDetails.relatedPlaylists.uploads}&maxResults=10`, H)).json();
  const ids = (pl.items || []).map((i) => i.contentDetails.videoId);
  const vs = await (await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics&id=${ids.join(',')}`, H)).json();
  const pub = (vs.items || []).filter((v) => v.status.privacyStatus === 'public')
    .sort((a, b) => Date.parse(b.snippet.publishedAt) - Date.parse(a.snippet.publishedAt));
  if (!pub.length) { console.log('  직전 공개편이 없다 — 올려도 된다'); process.exit(0); }
  ID = pub[0].id;
}

const get = async () => {
  const j = await (await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ID}`, H)).json();
  const v = j.items?.[0];
  return v ? { views: +v.statistics.viewCount, t: v.snippet.title, pub: Date.parse(v.snippet.publishedAt) } : null;
};

const first = await get();
if (!first) { console.log(`  ${ID} 를 못 읽었다 — 안전하게 «올리지 않는다»로 본다`); process.exit(1); }
const ageMin = (Date.now() - first.pub) / 60000;

// ⛔ Data API 의 viewCount 는 «뒤처진다» (2026-08-23 확인).
//   같은 시각에 스튜디오 418 · Data API 337 이었다 — 약 80회, 수 분치 차이.
//   그래서 「API 가 평평하다」가 「실제로 멈췄다」를 뜻하지 않는다.
//   기울기만 믿으면 아직 달리는 편 위에 새 편을 얹게 된다.
//   ⇒ 절대 시간 하한을 같이 건다. 발행 90분 안에는 기울기와 무관하게 막는다.
const MIN_AGE_MIN = 90;
if (ageMin < MIN_AGE_MIN) {
  console.log(`
  ⛔ 직전 편이 아직 ${ageMin.toFixed(0)}분밖에 안 됐다 (하한 ${MIN_AGE_MIN}분).`);
  console.log(`     Data API 는 스튜디오보다 뒤처져서, 「평평하다」가 「멈췄다」를 뜻하지 않는다.`);
  console.log(`     기울기만으로 판단하지 않는다 — 시간이 지나야 API 가 따라잡는다.
`);
  process.exit(1);
}
console.log(`\n  직전 편  ${first.t.slice(0, 52)}`);
console.log(`           ${ID} · 발행 ${ageMin.toFixed(0)}분 전 · 현재 ${first.views}회`);

// ── ① 기록된 궤적이 있으면 «최근 30분» 을 먼저 본다 (API 호출보다 정확하다) ──
const tsv = `.agent/_track_${ID}.tsv`;
if (existsSync(tsv)) {
  const rows = readFileSync(tsv, 'utf8').trim().split('\n').slice(1)
    .map((l) => l.split('\t')).filter((c) => c.length >= 3 && c[1] !== 'ERR')
    .map((c) => ({ ms: Date.parse(c[0]), views: +c[2] }));
  const cutoff = Date.now() - 30 * 60000;
  const recent = rows.filter((r) => r.ms >= cutoff);
  if (recent.length >= 3) {
    const grew = recent[recent.length - 1].views - recent[0].views;
    console.log(`  최근 30분 기록 ${recent.length}표본 · 증가 ${grew}회`);
    if (grew > 0) {
      console.log(`\n  ⛔ 직전 편이 «아직 달린다» — 올리면 잘린다. 올리지 않는다.\n`);
      process.exit(1);
    }
  } else {
    console.log(`  최근 30분 기록이 ${recent.length}표본뿐 — 직접 재서 확인한다`);
  }
}

// ── ② 지금 90초 간격으로 3번 재서 «하나라도 늘면» 달리는 것이다 ──────────
let prev = first.views, grew = 0;
for (let i = 0; i < 2; i++) {
  await new Promise((r) => setTimeout(r, 90000));
  const now = await get();
  if (!now) continue;
  const d = now.views - prev;
  console.log(`  +${(i + 1) * 1.5}분  ${now.views}회  (증가 ${d})`);
  if (d > 0) grew += d;
  prev = now.views;
}
if (grew > 0) {
  console.log(`\n  ⛔ 직전 편이 «아직 달린다» (3분간 +${grew}회) — 올리지 않는다.\n`);
  process.exit(1);
}
console.log(`\n  ✅ 직전 편이 멎었다 — 올려도 된다.\n`);
process.exit(0);
