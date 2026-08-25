#!/usr/bin/env node
// ============================================================================
// jp-hour — 「일본 시청자에게 몇 시에 올려야 하는가」를 실측한다
// ----------------------------------------------------------------------------
// ⛔ 왜 우리 채널 데이터로 하지 않는가
//   우리 채널(@SIGNUMHQ) 22편으로 잰 게시 시간대 효과는 «잡히지 않았다».
//   구간 중앙 40~86, 전부 겹침, 구간당 n=2~7. 그 표본으로는 아무 말도 못 한다.
//   ⇒ 일본어 미국주식 쇼츠를 «대량»으로 긁어서 잰다.
//
// ⛔ 최대 함정: 나이(age)
//   오래된 영상일수록 조회가 많다. 시간대를 안 보고 나이를 보게 된다.
//   ⇒ 나이 구간을 좁게 자르고(기본 7~90일), 구독자로 나눠 채널 크기도 지운다.
//
// ⛔ 두 번째 함정: 소표본 결론
//   구간당 n 이 작으면 중앙값이 요동친다. n 을 «반드시» 같이 찍고,
//   n < MIN_BUCKET 인 구간은 «판정 불가»로 표시한다. (대표 지시: 소표본 결론 금지)
//
// 사용:  node scripts/jp-hour.mjs            (수집 + 분석)
//        node scripts/jp-hour.mjs --analyze  (이미 모은 것만 다시 분석)
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const RAW = '.agent/_jp_hour_raw.json';
const OUT = '.agent/JP_HOUR.json';
const ANALYZE_ONLY = process.argv.includes('--analyze');

const AGE_MIN = 7, AGE_MAX = 90;     // 나이 구간 (일)
const SUB_MAX = 100000;              // 우리와 같은 처지 — 소형 채널만
const DUR_MAX = 90;                  // 쇼츠
const MIN_BUCKET = 15;               // 이보다 적으면 판정하지 않는다

// 실측 상위어 위주 (.agent/_jp_name_verify.json)
const QUERIES = [
  'マックスペイン', '米国株', 'エヌビディア', '機関投資家', '板読み',
  '米国株 速報', 'ナスダック', '決算', '相場解説', 'オプション取引',
  '米国株 投資', 'ウォール街', '半導体株', '金利', 'ドル円',
  'FRB', '株価 急落', '米国株 初心者', 'S&P500', '空売り',
];

const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다» —
//   예전 2분기는 SIGNUM_YT=kr 오타 하나로 한국어 영상이 영어 채널에 올라갔다.
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[YTW];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }

const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g(RTKEY), grant_type: 'refresh_token' }),
  })).json();
  if (!j.access_token) { console.error('  토큰 실패'); process.exit(1); }
  return j.access_token;
})();

const api = async (path) => (await fetch(`https://www.googleapis.com/youtube/v3/${path}`,
  { headers: { Authorization: `Bearer ${tok}` } })).json();

// ── 수집 ────────────────────────────────────────────────────────────────────
let store = existsSync(RAW) ? JSON.parse(readFileSync(RAW, 'utf8')) : { ids: {}, done: [] };

if (!ANALYZE_ONLY) {
  for (const q of QUERIES) {
    if (store.done.includes(q)) { console.log(`  · ${q} (이미 함)`); continue; }
    // sp=EgIYAQ%3D%3D = 쇼츠 필터
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`;
    const r = spawnSync('yt-dlp', [url, '--flat-playlist', '--dump-json', '--playlist-end', '50',
      '--no-warnings', '--socket-timeout', '20'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
    const got = (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x?.id);
    for (const v of got) store.ids[v.id] = q;
    store.done.push(q);
    writeFileSync(RAW, JSON.stringify(store));
    console.log(`  ✔ ${q.padEnd(14)} +${got.length}  (누적 ${Object.keys(store.ids).length})`);
  }
}

const ids = Object.keys(store.ids);
console.log(`\n  수집된 영상 ${ids.length}편 — 상세를 받는다`);

// ── 상세 (게시시각·조회·길이) ───────────────────────────────────────────────
const detail = store.detail || {};
for (let i = 0; i < ids.length; i += 50) {
  const chunk = ids.slice(i, i + 50).filter((x) => !detail[x]);
  if (!chunk.length) continue;
  const j = await api(`videos?part=snippet,statistics,contentDetails&id=${chunk.join(',')}`);
  for (const it of (j.items || [])) {
    const d = it.contentDetails.duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/) || [];
    detail[it.id] = {
      pub: it.snippet.publishedAt,
      views: +it.statistics.viewCount || 0,
      ch: it.snippet.channelId,
      dur: (+(d[1] || 0)) * 60 + (+(d[2] || 0)),
    };
  }
  store.detail = detail; writeFileSync(RAW, JSON.stringify(store));
}
console.log(`  상세 확보 ${Object.keys(detail).length}편`);

// ── 채널 구독자 ─────────────────────────────────────────────────────────────
const subs = store.subs || {};
const chIds = [...new Set(Object.values(detail).map((d) => d.ch))].filter((c) => subs[c] === undefined);
for (let i = 0; i < chIds.length; i += 50) {
  const j = await api(`channels?part=statistics&id=${chIds.slice(i, i + 50).join(',')}`);
  for (const it of (j.items || [])) subs[it.id] = +it.statistics.subscriberCount || 0;
  store.subs = subs; writeFileSync(RAW, JSON.stringify(store));
}
console.log(`  채널 ${Object.keys(subs).length}개`);

// ── 필터 ────────────────────────────────────────────────────────────────────
const NOW = Date.parse('2026-08-21T00:00:00Z');
const rows = [];
for (const [id, d] of Object.entries(detail)) {
  const age = (NOW - Date.parse(d.pub)) / 86400000;
  const s = subs[d.ch];
  if (age < AGE_MIN || age > AGE_MAX) continue;
  if (s === undefined || s <= 0 || s > SUB_MAX) continue;
  if (d.dur > DUR_MAX) continue;
  // JST = UTC+9
  const jst = new Date(Date.parse(d.pub) + 9 * 3600000);
  rows.push({
    id, hour: jst.getUTCHours(), dow: jst.getUTCDay(), age, subs: s, views: d.views,
    per: d.views / s,                      // 구독자당 조회 — 채널 크기를 지운다
  });
}
console.log(`\n  분석 대상 ${rows.length}편  (나이 ${AGE_MIN}~${AGE_MAX}일 · 구독 ${SUB_MAX.toLocaleString()} 미만 · ${DUR_MAX}초 이하)`);

if (rows.length < 60) {
  console.log('  ⛔ 표본이 너무 적다. 결론 내지 않는다.');
  writeFileSync(OUT, JSON.stringify({ measuredAt: '2026-08-21', n: rows.length, verdict: 'INSUFFICIENT' }, null, 1));
  process.exit(0);
}

const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// ── 시간대별 ────────────────────────────────────────────────────────────────
console.log('\n  ══ JST 시간대별 (구독자당 조회 중앙값) ══');
console.log('   시각   n     중앙      조회중앙    판정');
const buckets = [];
for (let h = 0; h < 24; h++) {
  const b = rows.filter((r) => r.hour === h);
  const ok = b.length >= MIN_BUCKET;
  buckets.push({ hour: h, n: b.length, per: +med(b.map((r) => r.per)).toFixed(3), views: med(b.map((r) => r.views)), ok });
  if (!b.length) continue;
  console.log(`   ${String(h).padStart(2, '0')}시  ${String(b.length).padStart(4)}  ${med(b.map((r) => r.per)).toFixed(3).padStart(8)}  ${String(med(b.map((r) => r.views))).padStart(9)}    ${ok ? '' : '판정불가(n부족)'}`);
}

const usable = buckets.filter((b) => b.ok);
console.log(`\n  판정 가능한 구간 ${usable.length}/24  (n>=${MIN_BUCKET})`);

if (usable.length >= 3) {
  const sorted = usable.slice().sort((a, b) => b.per - a.per);
  const all = med(rows.map((r) => r.per));
  console.log(`\n  전체 중앙 ${all.toFixed(3)}`);
  console.log('  상위 3구간: ' + sorted.slice(0, 3).map((b) => `${String(b.hour).padStart(2, '0')}시(${b.per}, n=${b.n})`).join('  '));
  console.log('  하위 3구간: ' + sorted.slice(-3).map((b) => `${String(b.hour).padStart(2, '0')}시(${b.per}, n=${b.n})`).join('  '));
  const hi = sorted[0], lo = sorted[sorted.length - 1];
  const ratio = lo.per > 0 ? hi.per / lo.per : 0;
  console.log(`\n  최고/최저 배수 ${ratio.toFixed(2)}배`);
  // ⛔ 배수가 작으면 «차이 없음»이다. 억지로 시각을 고르지 않는다.
  console.log(ratio >= 2
    ? '  → 시간대 차이가 크다. 상위 구간을 쓴다.'
    : '  → 구간 간 차이가 작다. 「시간대로 조회를 얻는다」고 말할 근거가 약하다.');
}

// ── 요일별 ──────────────────────────────────────────────────────────────────
const DN = ['일', '월', '화', '수', '목', '금', '토'];
console.log('\n  ══ 요일별 ══');
const dows = [];
for (let d = 0; d < 7; d++) {
  const b = rows.filter((r) => r.dow === d);
  dows.push({ dow: d, n: b.length, per: +med(b.map((r) => r.per)).toFixed(3) });
  if (b.length) console.log(`   ${DN[d]}  n=${String(b.length).padStart(4)}  ${med(b.map((r) => r.per)).toFixed(3)}`);
}

writeFileSync(OUT, JSON.stringify({
  measuredAt: '2026-08-21', filter: { AGE_MIN, AGE_MAX, SUB_MAX, DUR_MAX, MIN_BUCKET },
  n: rows.length, buckets, dows,
}, null, 1));
console.log(`\n  → ${OUT}\n`);
