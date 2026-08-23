#!/usr/bin/env node
// ============================================================================
// yt-location — 영상별 «촬영 위치» 메타데이터를 넣는다 (recordingDetails)
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-24 대표 지시)
//   「올리는 시점의 지역이 초기 배포에 영향이 있다」는 말이 업계에 돈다.
//   VPN 을 쓰기 전에, «VPN 없이 지금 당장 할 수 있는» 같은 성격의 조치가 하나 있다 —
//   YouTube 가 공식으로 제공하는 «영상별» 위치 필드다. 우리 영상은 전부 비어 있었다.
//
// ⛔ 효과는 «검증되지 않았다». 이건 테스트지 개선이 아니다.
//   반대 증거를 먼저 적어 둔다: 우리 일본 영상 9편은 전부 «한국 IP(전주)» 에서 올렸고,
//   그중 3편이 1,000회를 넘겼다. 업로드 지역이 배포를 «막지는» 않는다는 뜻이다.
//
// ⛔ 이미 «공개된» 영상에는 넣지 않는다. 초기 시드가 이미 끝났으므로 의미가 없고,
//   달리는 영상을 건드리는 위험만 남는다. 게시 «전» 인 것에만 넣는다.
//
// ⛔ 두 변수를 한꺼번에 바꾸지 않는다 (위치 · VPN). 한 단계씩 쌓아야 나중에 가른다.
//   조건은 .agent/GEO_TEST.json 에 «영상별로» 기록한다 — 안 적으면 판정 못 한다.
//
// 사용:
//   node scripts/yt-location.mjs <videoId> tokyo        (SIGNUM_YT=jp 필요)
//   node scripts/yt-location.mjs <videoId> newyork
//   node scripts/yt-location.mjs --list                 기록만 본다
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PLACES = {
  tokyo:   { lat: 35.6812, lng: 139.7671, desc: '東京, 日本' },
  osaka:   { lat: 34.7025, lng: 135.4959, desc: '大阪, 日本' },
  newyork: { lat: 40.7069, lng: -74.0113, desc: 'New York, NY, USA' },
  chicago: { lat: 41.8789, lng: -87.6359, desc: 'Chicago, IL, USA' },
};
const LOG = '.agent/GEO_TEST.json';
const readLog = () => (existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : { note: '지역 테스트 기록 — 영상별 조건', rows: [] });

if (process.argv.includes('--list')) {
  const d = readLog();
  console.log(`\n  기록 ${d.rows.length}건`);
  console.log(`  ${'ID'.padEnd(13)}${'채널'.padEnd(5)}${'위치'.padEnd(10)}${'VPN'.padEnd(6)}일시`);
  for (const r of d.rows)
    console.log(`  ${r.id.padEnd(13)}${r.ch.padEnd(5)}${(r.place || '-').padEnd(10)}${(r.vpn || 'なし').padEnd(6)}${r.at.slice(0, 16)}`);
  process.exit(0);
}

const [ID, PLACE] = process.argv.slice(2);
if (!ID || !PLACES[PLACE]) {
  console.error(`사용: yt-location <videoId> <${Object.keys(PLACES).join('|')}>`);
  process.exit(1);
}
const env = readFileSync('.env.local', 'utf8');
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || null;
const JP = String(process.env.SIGNUM_YT || 'hq').toLowerCase() === 'jp';
const RT = JP ? (g('YT_JP_REFRESH_TOKEN') || g('YT_REFRESH_TOKEN')) : g('YT_REFRESH_TOKEN');
const tok = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'), refresh_token: RT, grant_type: 'refresh_token' }),
})).json()).access_token;
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

const cur = (await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,recordingDetails&id=${ID}`, { headers: H })).json()).items?.[0];
if (!cur) { console.error(`${ID} 를 못 찾는다`); process.exit(1); }
console.log(`\n  ${cur.snippet.title.slice(0, 44)}`);
console.log(`  현재 ${cur.status.privacyStatus} · 위치 ${JSON.stringify(cur.recordingDetails || {})}`);

// ⛔ 공개된 영상은 건드리지 않는다 — 시드가 끝났고, 달리는 것을 손대는 위험만 남는다
if (cur.status.privacyStatus === 'public') {
  console.error('  ⛔ 이미 공개된 영상이다. 초기 배포가 끝났으므로 넣어도 의미가 없다 — 넣지 않는다.');
  process.exit(1);
}

const p = PLACES[PLACE];
const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=recordingDetails', {
  method: 'PUT', headers: H,
  body: JSON.stringify({ id: ID, recordingDetails: {
    location: { latitude: p.lat, longitude: p.lng },
    locationDescription: p.desc,
  } }),
});
const j = await r.json();
if (!r.ok) { console.error('  실패', JSON.stringify(j).slice(0, 300)); process.exit(1); }
console.log(`  ✔ 위치 설정 ${p.desc} (${p.lat}, ${p.lng})`);
console.log(`  확인 ${JSON.stringify(j.recordingDetails)}`);

const d = readLog();
d.rows = d.rows.filter((x) => x.id !== ID);
d.rows.push({ id: ID, ch: JP ? 'jp' : 'hq', place: PLACE, vpn: process.env.SIGNUM_VPN || null,
  title: cur.snippet.title, at: new Date().toISOString() });
writeFileSync(LOG, JSON.stringify(d, null, 2));
console.log(`  → ${LOG} 에 조건 기록 (판정하려면 조건을 남겨야 한다)`);
