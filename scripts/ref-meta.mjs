#!/usr/bin/env node
// ============================================================================
// ref-meta — 제목·태그·설명·게시시각 등 «알고리즘 신호»를 전수 실측한다
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-20 대표 지시)
//   "레퍼런스 조사할때 제목 그리고 태그등 알고리즘에 영향있는것들도 다 벤치마크"
//
//   ref-fleet.mjs 는 «영상 안»을 잰다(컷·밝기·자막·소리).
//   이건 «영상 밖»을 잰다 — 사람이 클릭하기 전에 보는 것 전부.
//
// ⛔ 판정 규율 (memory: judgments-need-mass-records)
//   소표본으로 결론내지 않는다. n 을 반드시 병기하고, n<30 이면 «관찰»로만 적는다.
//
// ⛔ 조회수를 그대로 쓰지 않는다 — «채널 크기»가 섞인다
//   구독자 200만 채널은 제목이 뭐든 조회수가 나온다. 그래서 두 지표를 같이 본다.
//     out  = views / subs      채널 대비 초과성과 (제목·소재의 힘)
//     vpd  = views / 경과일     신선도 보정
//
// 사용:  node scripts/ref-meta.mjs [표본상한=400]
// 출력:  .agent/REF_META.json  +  콘솔 비교표
// ============================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = '.agent/_meta_cache';
mkdirSync(CACHE, { recursive: true });
const LIMIT = +(process.argv[2] || 400);

// ── 후보 모으기 ─────────────────────────────────────────────────────────────
const ids = new Map();                                   // id → 알고 있는 정보
const add = (id, extra) => { if (id && !ids.has(id)) ids.set(id, extra || {}); };
const idOf = (u) => (String(u || '').match(/([A-Za-z0-9_-]{11})/) || [])[1];

for (const f of ['.agent/MARKET_SCAN.json', '.agent/REF_FLEET_POOL.json']) {
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of (j.rows || j)) add(idOf(r.url || r.id), { ch: r.ch });
}
console.log(`\n  후보 ${ids.size}편 (상한 ${LIMIT})`);

// ── 메타 수집 (배치 + 캐시) ─────────────────────────────────────────────────
const CACHE_F = join(CACHE, 'meta.json');
const store = existsSync(CACHE_F) ? JSON.parse(readFileSync(CACHE_F, 'utf8')) : {};
const todo = [...ids.keys()].filter((id) => !store[id]).slice(0, LIMIT);
console.log(`  캐시 ${Object.keys(store).length}편 · 신규 ${todo.length}편 수집`);

const KEEP = ['id', 'title', 'tags', 'categories', 'description', 'upload_date', 'timestamp',
  'duration', 'view_count', 'like_count', 'comment_count', 'channel_follower_count',
  'channel', 'uploader_id', 'language'];

for (let i = 0; i < todo.length; i += 20) {
  const batch = todo.slice(i, i + 20);
  const r = spawnSync('yt-dlp', ['--no-warnings', '--skip-download', '--dump-json',
    '--socket-timeout', '15', ...batch.map((id) => `https://www.youtube.com/watch?v=${id}`)],
    { maxBuffer: 1 << 30, encoding: 'utf8', timeout: 300000 });
  for (const line of (r.stdout || '').split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const j = JSON.parse(line);
      store[j.id] = Object.fromEntries(KEEP.map((k) => [k, j[k]]));
    } catch {}
  }
  writeFileSync(CACHE_F, JSON.stringify(store));
  process.stdout.write(`\r  수집 ${Object.keys(store).length}편`);
}
console.log('');

// ── 특징 추출 ───────────────────────────────────────────────────────────────
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const TICKER = /\b(nvda|amd|tsla|aapl|msft|pltr|spy|qqq|meta|amzn|googl|nvidia|tesla|apple|microsoft|amazon|google|palantir|micron|broadcom|intel|buffett|burry|powell|musk|trump|bezos|dimon)\b/i;
const NEG = /\b(never|stop|don'?t|mistake|wrong|lose|lost|crash|warning|avoid|nobody|worst|scam|trap|fail|dying|dead)\b/i;

const feat = (m) => {
  const t = m.title || '';
  const bare = t.replace(/#\S+/g, '').trim();               // 해시태그 뺀 «진짜 제목»
  const words = bare.split(/\s+/).filter(Boolean);
  const caps = words.filter((w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  const d = m.description || '';
  const subs = m.channel_follower_count || 0;
  const views = m.view_count || 0;
  const days = m.timestamp ? Math.max(1, (Date.now() / 1000 - m.timestamp) / 86400) : null;
  // 게시시각 — ET 기준 (유튜브 타임스탬프는 UTC epoch)
  const et = m.timestamp ? new Date((m.timestamp - 4 * 3600) * 1000) : null;
  return {
    id: m.id, ch: m.channel, title: t, views, subs,
    out: subs ? views / subs : null,
    vpd: days ? views / days : null,
    days: days ? Math.round(days) : null,
    sec: m.duration,
    titleChars: bare.length,
    titleWords: words.length,
    hashtags: (t.match(/#\S+/g) || []).length,
    capsWords: caps.length,
    hasEmoji: EMOJI.test(t) ? 1 : 0,
    hasNumber: /\d/.test(bare) ? 1 : 0,
    hasDollar: /\$/.test(bare) ? 1 : 0,
    hasPercent: /%/.test(bare) ? 1 : 0,
    hasQuestion: /\?/.test(bare) ? 1 : 0,
    hasExclaim: /!/.test(bare) ? 1 : 0,
    hasColon: /:/.test(bare) ? 1 : 0,
    hasVs: /\bvs\.?\b/i.test(bare) ? 1 : 0,
    hasTicker: TICKER.test(bare) ? 1 : 0,
    startsHow: /^how\b/i.test(bare) ? 1 : 0,
    startsWhy: /^why\b/i.test(bare) ? 1 : 0,
    startsWhat: /^what\b/i.test(bare) ? 1 : 0,
    secondPerson: /\byou(r)?\b/i.test(bare) ? 1 : 0,
    negative: NEG.test(bare) ? 1 : 0,
    tagCount: (m.tags || []).length,
    hasTags: (m.tags || []).length > 0 ? 1 : 0,
    descChars: d.length,
    hasDesc: d.trim().length > 0 ? 1 : 0,
    descLink: /https?:\/\//.test(d) ? 1 : 0,
    descHashtags: (d.match(/#\S+/g) || []).length,
    likeRate: views ? (m.like_count || 0) / views : null,
    cmtRate: views ? (m.comment_count || 0) / views : null,
    etHour: et ? et.getUTCHours() : null,
    etDow: et ? et.getUTCDay() : null,
    cat: (m.categories || [])[0] || '',
  };
};

const ALL = Object.values(store).map(feat)
  .filter((r) => r.views > 0 && r.subs > 0 && r.sec && r.sec <= 185);
console.log(`  분석 대상 ${ALL.length}편 (구독자·조회수 있는 쇼츠만)\n`);
if (ALL.length < 30) { console.log('  n<30 — 판정 불가. 표본을 더 모아야 한다'); process.exit(0); }

// ── 스피어만 순위상관 ───────────────────────────────────────────────────────
function spearman(xs, ys) {
  const n = xs.length; if (n < 8) return null;
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(n);
    for (let i = 0; i < n;) {
      let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

const CONT = ['titleChars', 'titleWords', 'hashtags', 'capsWords', 'tagCount', 'descChars',
  'descHashtags', 'sec'];
const BOOL = ['hasEmoji', 'hasNumber', 'hasDollar', 'hasPercent', 'hasQuestion', 'hasExclaim',
  'hasColon', 'hasVs', 'hasTicker', 'startsHow', 'startsWhy', 'startsWhat', 'secondPerson',
  'negative', 'hasTags', 'hasDesc', 'descLink'];

// ── ⛔ 판정 설계 — 여기서 한 번 틀렸다 ──────────────────────────────────────
// 1차 시도: 초과성과 = views/subs. 1위가 «176.7배»로 나왔는데 조회수가 1,060회였다.
//           구독자 6명 채널이면 아무 영상이나 176배가 된다. 노이즈다.
// 2차 확정: «채널 내부 비교». 한 채널 안에서 그 채널 자신의 평균 대비 얼마나 잘 됐나를
//           log 조회수 z-점수로 잰다. 채널 크기·구독자·주제 편향이 통째로 사라진다.
//           영상 5편 이상 있는 채널만 쓴다.
const byCh = {};
for (const r of ALL) (byCh[r.ch] = byCh[r.ch] || []).push(r);
const CHS = Object.entries(byCh).filter(([, v]) => v.length >= 5);
const Z = [];
for (const [ch, vs] of CHS) {
  const ls = vs.map((v) => Math.log10(Math.max(1, v.views)));
  const m = ls.reduce((a, b) => a + b, 0) / ls.length;
  const sd = Math.sqrt(ls.reduce((a, b) => a + (b - m) ** 2, 0) / ls.length) || 1;
  vs.forEach((v, i) => Z.push({ ...v, z: (ls[i] - m) / sd }));
}
console.log(`  ═══ 채널 내부 비교 — 채널 ${CHS.length}곳 · 영상 ${Z.length}편 ═══`);
console.log('      z = 그 채널 자신의 log 조회수 평균 대비 표준편차. 채널 크기 영향 제거\n');
if (Z.length < 60) console.log('  ⚠ n<60 — 아래는 «관찰»이지 «판정»이 아니다\n');

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const zs = [...Z].sort((a, b) => b.z - a.z);
const k = Math.max(20, Math.floor(Z.length / 4));
const TOP = zs.slice(0, k), BOT = zs.slice(-k);
console.log(`  상위 ${k}편 z중앙 ${med(TOP.map((r) => r.z)).toFixed(2)} · 하위 ${k}편 z중앙 ${med(BOT.map((r) => r.z)).toFixed(2)}`);
console.log(`  상위 조회 중앙 ${med(TOP.map((r) => r.views)).toLocaleString()} · 하위 ${med(BOT.map((r) => r.views)).toLocaleString()}\n`);

console.log('  연속값 — 스피어만 순위상관 (채널내 z 기준)');
console.log('  ' + '-'.repeat(66));
console.log('  ' + '항목'.padEnd(16) + '상관'.padStart(8) + '상위중앙'.padStart(10) + '하위중앙'.padStart(10) + 'n'.padStart(7) + '  판정');
const contRows = CONT.map((f) => {
  const ok = Z.filter((r) => r[f] !== null && r[f] !== undefined);
  return { f, r: spearman(ok.map((p) => p[f]), ok.map((p) => p.z)), n: ok.length,
    top: med(TOP.map((x) => x[f])), bot: med(BOT.map((x) => x[f])) };
}).sort((a, b) => Math.abs(b.r || 0) - Math.abs(a.r || 0));
for (const r of contRows) {
  const v = Math.abs(r.r || 0);
  const j = r.n < 30 ? '표본부족' : v >= 0.5 ? '★ 신호' : v >= 0.3 ? '약한 신호' : '무의미';
  console.log('  ' + r.f.padEnd(16) + (r.r === null ? '—' : r.r.toFixed(2)).padStart(8) +
    String(r.top).padStart(10) + String(r.bot).padStart(10) + String(r.n).padStart(7) + '  ' + j);
}

console.log('\n  있음/없음 — 상위 보유율 vs 하위 보유율 (차이 20%p 미만은 무의미)');
console.log('  ' + '-'.repeat(66));
const pct = (a, f) => Math.round(100 * a.filter((r) => r[f]).length / a.length);
const boolRows = BOOL.map((f) => ({ f, t: pct(TOP, f), b: pct(BOT, f) }))
  .map((r) => ({ ...r, d: r.t - r.b })).sort((a, b) => b.d - a.d);
console.log('  ' + '항목'.padEnd(16) + '상위%'.padStart(8) + '하위%'.padStart(8) + '차이'.padStart(8) + '  판정');
for (const r of boolRows)
  console.log('  ' + r.f.padEnd(16) + `${r.t}%`.padStart(8) + `${r.b}%`.padStart(8) +
    `${r.d > 0 ? '+' : ''}${r.d}`.padStart(8) + '  ' + (Math.abs(r.d) >= 20 ? '★ 신호' : '무의미'));

console.log('\n  게시시각 (ET) — 구간별 채널내 z 중앙값');
console.log('  ' + '-'.repeat(56));
const BUCK = [[0, 6, '심야 00-06'], [6, 9, '프리마켓 06-09'], [9, 12, '장초반 09-12'],
  [12, 16, '장중 12-16'], [16, 20, '장후 16-20'], [20, 24, '야간 20-24']];
for (const [a, b, name] of BUCK) {
  const g = Z.filter((r) => r.etHour !== null && r.etHour >= a && r.etHour < b);
  if (!g.length) continue;
  const m = med(g.map((r) => r.z));
  console.log('  ' + name.padEnd(18) + `z ${m >= 0 ? '+' : ''}${m.toFixed(2)}`.padStart(9) +
    `  n=${String(g.length).padStart(3)}` + (g.length < 30 ? '   ⚠ 표본부족' : ''));
}

console.log('\n  영상 길이 — 구간별 채널내 z 중앙값');
console.log('  ' + '-'.repeat(56));
for (const [a, b] of [[0, 20], [20, 35], [35, 50], [50, 65], [65, 185]]) {
  const g = Z.filter((r) => r.sec >= a && r.sec < b);
  if (g.length < 5) continue;
  const m = med(g.map((r) => r.z));
  console.log('  ' + `${a}~${b}초`.padEnd(18) + `z ${m >= 0 ? '+' : ''}${m.toFixed(2)}`.padStart(9) +
    `  n=${String(g.length).padStart(3)}` + (g.length < 30 ? '   ⚠ 표본부족' : ''));
}

// ── 그럼 무엇이 가르는가 — «소재» ────────────────────────────────────────────
// 제목의 «형식»(길이·기호·해시태그)이 전부 무의미로 나왔다면 남는 것은 «무엇을 다뤘나»다.
// 같은 채널 안에서 어떤 «단어»가 들어간 영상이 그 채널 평균을 넘는지 센다.
const STOP = new Set(('the a an and or of to in on for is are was were be with at by from this that '
  + 'it its as you your my our their his her he she they we i what how why when who will can do does '
  + 'not no but if so about into out up down over under more most just now new s t re ve ll d m').split(' '));
const bag = {};
for (const r of Z) {
  const ws = new Set(r.title.toLowerCase().replace(/#\S+/g, ' ').replace(/[^a-z0-9$ ]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
  for (const w of ws) (bag[w] = bag[w] || []).push(r.z);
}
const MIN_N = 8;
const gmed = med(Z.map((r) => r.z));
const terms = Object.entries(bag).filter(([, v]) => v.length >= MIN_N)
  .map(([w, v]) => ({ w, n: v.length, z: med(v), d: med(v) - gmed }))
  .sort((a, b) => b.d - a.d);
console.log(`\n  소재 — 제목에 그 단어가 든 영상의 «채널내 z» 중앙값 (n>=${MIN_N} 인 단어만)`);
console.log(`  전체 중앙 z = ${gmed.toFixed(2)}. 아래는 그 대비 차이`);
console.log('\n  평균을 넘는 소재');
console.log('  ' + '-'.repeat(52));
for (const t of terms.slice(0, 14))
  console.log('  ' + t.w.padEnd(18) + `z ${t.z >= 0 ? '+' : ''}${t.z.toFixed(2)}`.padStart(9) +
    `  d${t.d >= 0 ? '+' : ''}${t.d.toFixed(2)}`.padStart(9) + `  n=${t.n}`);
console.log('\n  평균에 못 미치는 소재');
console.log('  ' + '-'.repeat(52));
for (const t of terms.slice(-10))
  console.log('  ' + t.w.padEnd(18) + `z ${t.z >= 0 ? '+' : ''}${t.z.toFixed(2)}`.padStart(9) +
    `  d${t.d >= 0 ? '+' : ''}${t.d.toFixed(2)}`.padStart(9) + `  n=${t.n}`);

console.log('\n  채널내 최상위 14편 — 제목 원문 / 태그 / 설명');
console.log('  ' + '-'.repeat(104));
for (const r of zs.slice(0, 14))
  console.log(`  z${r.z.toFixed(2).padStart(5)} ${String(r.views).padStart(9)}회 ${String(r.sec).padStart(3)}s tag${String(r.tagCount).padStart(3)} desc${String(r.descChars).padStart(5)} ht${r.hashtags}  ${r.title.slice(0, 46)}`);

console.log('\n  채널내 최하위 8편 — 대조군');
console.log('  ' + '-'.repeat(104));
for (const r of zs.slice(-8))
  console.log(`  z${r.z.toFixed(2).padStart(5)} ${String(r.views).padStart(9)}회 ${String(r.sec).padStart(3)}s tag${String(r.tagCount).padStart(3)} desc${String(r.descChars).padStart(5)} ht${r.hashtags}  ${r.title.slice(0, 46)}`);

writeFileSync('.agent/REF_META.json', JSON.stringify({
  pulledAt: new Date().toISOString(), n: ALL.length, topK: k,
  channels: CHS.length, nz: Z.length,
 cont: contRows, bool: boolRows, terms, rows: Z,
}, null, 1));
console.log('\n  → .agent/REF_META.json\n');
