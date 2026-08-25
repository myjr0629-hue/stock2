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
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다» —
//   예전 2분기는 SIGNUM_YT=kr 오타 하나로 한국어 영상이 영어 채널에 올라갔다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }

const AT = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET,
    refresh_token: env[RTKEY], grant_type: 'refresh_token',
  }),
})).json()).access_token;
const H = { headers: { authorization: `Bearer ${AT}` } };

let ID = process.argv.slice(2).find((a) => !a.startsWith('--'));
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
// ⛔ 예약 업로드면 «게시될 시각» 기준으로 간격을 본다 (2026-08-24).
//   앞서 시각 가드는 고쳤는데 이 간격 가드는 «지금 시점» 을 계속 봤다.
//   실제로 「17:00 게시」 건이 막혔다 — 직전 편(14:00)과의 «게시 간격» 은 180분인데,
//   가드는 「직전 편이 지금 78분밖에 안 됐다」를 보고 반려했다. 검사 대상이 틀린 것이다.
//   ⇒ --at="YYYY-MM-DD HH:MM" (KST/JST) 가 오면 그 시각을 기준시로 쓴다.
const AT_ARG = (process.argv.find((a) => a.startsWith('--at=')) || '').slice(5);
const atM = AT_ARG.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
const REF = atM
  ? Date.UTC(+atM[1], +atM[2] - 1, +atM[3], +atM[4] - 9, +atM[5])
  : Date.now();
if (atM) console.log(`  «게시 예정» ${AT_ARG} (KST/JST) 기준으로 간격을 본다`);
const ageMin = (REF - first.pub) / 60000;

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

// ⛔ 오래된 편은 이 검사의 대상이 아니다 (2026-08-25 실측 사고)
//   이 가드는 «몇 분~몇 시간 전에 올린 편» 위에 새 편을 얹지 않기 위한 것이다.
//   21시간 전에 게시된 편을 3분 표본으로 재서 막았다 — 게다가 그 새 편은
//   «4시간 반 뒤» 게시 예약이라 실제 간격이 25시간이었다. 막을 이유가 없다.
const MAX_AGE_MIN = 360;
if (ageMin > MAX_AGE_MIN) {
  console.log(`\n  ✅ 직전 편이 ${(ageMin / 60).toFixed(1)}시간 전이다 (상한 ${MAX_AGE_MIN / 60}시간) — 초기 배급은 끝났다. 올려도 된다.\n`);
  process.exit(0);
}

// ── ② 지금 90초 간격으로 3번 재서 «순증» 이 있으면 달리는 것이다 ──────────
// ⛔ 예전엔 «양수 증가분만» 더했다 (if (d > 0) grew += d). 그래서 조회수가
//   723 → 855 → 723 으로 제자리에 돌아와도 grew=132 가 되어 막혔다.
//   유튜브 조회수는 보정되며 위아래로 흔들린다 — 잡음이 «성장» 으로 읽힌 것이다.
//   ⇒ 마지막 값에서 첫 값을 뺀 «순증» 으로 본다. 잡음은 서로 상쇄된다.
let prev = first.views;
const seen = [first.views];
for (let i = 0; i < 2; i++) {
  await new Promise((r) => setTimeout(r, 90000));
  const now = await get();
  if (!now) continue;
  console.log(`  +${(i + 1) * 1.5}분  ${now.views}회  (변화 ${now.views - prev})`);
  seen.push(now.views);
  prev = now.views;
}
const net = seen[seen.length - 1] - seen[0];
if (net > 0) {
  console.log(`\n  ⛔ 직전 편이 «아직 달린다» (3분간 순증 +${net}회) — 올리지 않는다.\n`);
  process.exit(1);
}
if (seen.some((v, i) => i && v !== seen[i - 1]))
  console.log(`  (오르내렸지만 순증 ${net} — 조회수 보정으로 본다)`);
console.log(`\n  ✅ 직전 편이 멎었다 — 올려도 된다.\n`);
process.exit(0);
