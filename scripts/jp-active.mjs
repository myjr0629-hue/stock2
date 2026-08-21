#!/usr/bin/env node
// ============================================================================
// jp-active — 「일본 시청자는 몇 시에 활동하는가」를 실측한다
// ----------------------------------------------------------------------------
// ⛔ 앞서 잰 것과 «다른 질문»이다 (대표 지적 2026-08-21)
//   jp-hour.mjs 는 «올린 시각»을 쟀다 → 채널 크기 교란으로 판정 불가였다.
//   여기서 재는 것은 «시청자가 깨어 있는 시각»이다. 이건 잴 수 있다.
//
// 어떻게: 댓글 타임스탬프.
//   유튜브 댓글은 전부 publishedAt 이 공개다. 누군가 그 시각에 그 영상을 보고
//   글을 남겼다는 «행동 기록»이다. 조회 시각 자체는 아니지만, 조회 시각의 대리값으로
//   쓸 수 있고 무엇보다 «대량»으로 구할 수 있다.
//
// ⛔ 한계 (보고에 같이 적는다)
//   ① 댓글은 조회가 아니다. 댓글 다는 사람은 전체 시청자의 일부다.
//   ② 오래된 댓글이 섞이면 «그때의 습관»이 섞인다 → 최근 것만 본다.
//   ③ 영상이 올라온 직후에 댓글이 몰린다 → 업로드 시각이 댓글 시각을 끌어당긴다.
//      ⇒ 이 편향을 지우려고 «업로드 후 48시간 이내» 댓글은 «빼고» 센다.
//        남은 것은 «영상과 무관하게 그 시간에 유튜브를 보고 있던» 사람들이다.
//
// 사용: node scripts/jp-active.mjs [영상수]     기본 80편
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const N_VIDEOS = Number(process.argv[2] || 80);
const SKIP_HOURS = 48;          // 업로드 직후 몰림 제거
const OUT = '.agent/JP_ACTIVE.json';

const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const RTKEY = String(process.env.SIGNUM_YT || 'hq').toLowerCase() === 'jp'
  ? 'YT_JP_REFRESH_TOKEN' : 'YT_REFRESH_TOKEN';

const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g(RTKEY), grant_type: 'refresh_token' }),
  })).json();
  if (!j.access_token) { console.error('  토큰 실패'); process.exit(1); }
  return j.access_token;
})();
const api = async (p) => (await fetch(`https://www.googleapis.com/youtube/v3/${p}`,
  { headers: { Authorization: `Bearer ${tok}` } })).json();

// ── 대상: 앞서 모은 일본어 미국주식 영상 풀 ─────────────────────────────────
if (!existsSync('.agent/_jp_hour_raw.json')) { console.error('  먼저 jp-hour.mjs 를 돌린다'); process.exit(1); }
const raw = JSON.parse(readFileSync('.agent/_jp_hour_raw.json', 'utf8'));
const pool = Object.entries(raw.detail)
  .map(([id, v]) => ({ id, ...v }))
  .filter((v) => v.views > 500)                 // 댓글이 붙을 만큼은 돌아간 것
  .sort((a, b) => b.views - a.views)
  .slice(0, N_VIDEOS);

console.log(`  대상 영상 ${pool.length}편 (일본어 미국주식 검색 결과)`);

// ── 댓글 수집 ───────────────────────────────────────────────────────────────
const rows = [];
let noComments = 0, err = 0;
for (const v of pool) {
  const j = await api(`commentThreads?part=snippet&videoId=${v.id}&maxResults=100&order=time`);
  if (j.error) { err++; continue; }
  const items = j.items || [];
  if (!items.length) { noComments++; continue; }
  const upAt = Date.parse(v.pub);
  for (const it of items) {
    const s = it.snippet.topLevelComment.snippet;
    const t = Date.parse(s.publishedAt);
    // ⛔ 업로드 직후 몰림 제거 — 그건 «영상 시각»이지 «시청자 습관»이 아니다
    if (t - upAt < SKIP_HOURS * 3600000) continue;
    const jst = new Date(t + 9 * 3600000);
    rows.push({ h: jst.getUTCHours(), dow: jst.getUTCDay(), vid: v.id });
  }
  if (rows.length && rows.length % 500 < 100) process.stdout.write(`\r  댓글 ${rows.length}건 수집…`);
}
console.log(`\r  댓글 ${rows.length}건  (댓글 없음 ${noComments}편 · 오류 ${err}편)          `);

if (rows.length < 300) {
  console.log('  ⛔ 표본 부족 — 판정하지 않는다.');
  writeFileSync(OUT, JSON.stringify({ measuredAt: '2026-08-21', n: rows.length, verdict: 'INSUFFICIENT' }, null, 1));
  process.exit(0);
}

// ── 시간대 분포 ─────────────────────────────────────────────────────────────
const byHour = Array.from({ length: 24 }, (_, h) => rows.filter((r) => r.h === h).length);
const total = rows.length;
const expect = total / 24;                       // 균등하다면 이만큼
console.log(`\n  ══ JST 시간대별 활동 (댓글 ${total}건 · 균등 기대 ${expect.toFixed(0)}건/시간) ══`);
const bar = (n) => '█'.repeat(Math.round(n / Math.max(...byHour) * 34));
for (let h = 0; h < 24; h++) {
  const idx = byHour[h] / expect;
  console.log(`   ${String(h).padStart(2, '0')}시 ${String(byHour[h]).padStart(5)}  ${(idx * 100).toFixed(0).padStart(4)}%  ${bar(byHour[h])}`);
}

// ── 카이제곱 — 「시간대에 차이가 없다」를 검정한다 ───────────────────────────
const chi2 = byHour.reduce((a, o) => a + (o - expect) ** 2 / expect, 0);
// 자유도 23, 유의수준 0.05 임계값 35.17
console.log(`\n  카이제곱 = ${chi2.toFixed(1)}  (자유도 23 · 임계 35.17)`);
console.log(`  → ${chi2 > 35.17 ? '✔ 시간대에 «분명한» 차이가 있다' : '⛔ 균등과 구별되지 않는다'}`);

const ranked = byHour.map((n, h) => ({ h, n, idx: n / expect })).sort((a, b) => b.n - a.n);
console.log(`\n  상위 5: ${ranked.slice(0, 5).map((r) => `${String(r.h).padStart(2, '0')}시(${(r.idx * 100).toFixed(0)}%)`).join('  ')}`);
console.log(`  하위 5: ${ranked.slice(-5).map((r) => `${String(r.h).padStart(2, '0')}시(${(r.idx * 100).toFixed(0)}%)`).join('  ')}`);

// ── 4시간 블록 ──────────────────────────────────────────────────────────────
console.log('\n  ══ 4시간 블록 ══');
const B = [[0, 4, '심야 00-04'], [4, 8, '새벽 04-08'], [8, 12, '오전 08-12'],
           [12, 16, '낮 12-16'], [16, 20, '저녁 16-20'], [20, 24, '밤 20-24']];
const blocks = B.map(([a, b, l]) => {
  const n = byHour.slice(a, b).reduce((x, y) => x + y, 0);
  return { block: l, n, share: +(n / total * 100).toFixed(1) };
});
for (const bl of blocks) console.log(`   ${bl.block.padEnd(14)} ${String(bl.n).padStart(6)}건  ${String(bl.share).padStart(5)}%`);

const DN = ['일', '월', '화', '수', '목', '금', '토'];
console.log('\n  ══ 요일 ══');
const dows = DN.map((d, i) => ({ d, n: rows.filter((r) => r.dow === i).length }));
for (const d of dows) console.log(`   ${d.d}  ${String(d.n).padStart(6)}건  ${(d.n / total * 100).toFixed(1)}%`);

writeFileSync(OUT, JSON.stringify({
  measuredAt: '2026-08-21', method: 'comment timestamps, JST, excluding first 48h after upload',
  nVideos: pool.length, nComments: total, byHour, blocks, dows, chi2: +chi2.toFixed(1),
  significant: chi2 > 35.17,
}, null, 1));
console.log(`\n  → ${OUT}`);
console.log('  ⛔ 댓글은 «조회»가 아니다. 활동 시간대의 대리값으로만 읽는다.\n');
