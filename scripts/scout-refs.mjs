#!/usr/bin/env node
// ============================================================================
// scout-refs — 「시장별 레퍼런스 채널이 «지금» 무엇을 다루는가」를 정찰한다
// ----------------------------------------------------------------------------
// ⛔ 대표 지시 2026-08-21:
//   "소제 찾을 때 경제사냥꾼 한국은 그곳이고, 일본 미국이든 소스 참고할 만한 곳이 있으면
//    정찰을 해보고 그것을 고도화해서 하는 것도 좋다. 검증된 것을 가져다가 해도 좋고."
//
// 왜: 소재를 «백지»에서 찾으면 매번 감이 된다.
//   이미 «검증된» 소재가 있다 — 잘 되는 채널이 이번 주에 올린 것들이다.
//   그들의 «틀»을 가져오고 «숫자»는 우리 것으로 바꾼다. 그게 우리가 이기는 방식이다.
//
// ⛔ 베끼는 게 아니다. 우리 규칙은 그대로다 —
//   ① 그들 제목에서 «주제»만 뽑는다 (문장은 우리가 새로 쓴다)
//   ② 우리 수요표로 «문»이 열려 있는지 확인한다 (여지 40% 미만이면 버린다)
//   ③ 우리 데이터로 «베이스레이트»를 낼 수 있는 것만 남긴다
//   ④ 그들이 못 내는 숫자를 넣는다
//
// 사용: node scripts/scout-refs.mjs [ko|ja|en|all]
// 출력: .agent/SCOUT_<날짜>.md
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { demandFor } from './_demand.mjs';

const WHICH = (process.argv[2] || 'all').toLowerCase();
const DAY = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

// ⛔ 레퍼런스는 «실측으로 고른» 채널이다. 감으로 넣지 않는다.
//   ko: 경제사냥꾼 — 구독 64.6만 · 14개월 2,414편 · 좋아요율 4.68% (2026-08-21 실측)
const REFS = {
  ko: [{ handle: '@경제사냥꾼', why: '구독 64.6만 · 하루 5.7편 · 좋아요율 4.68%' }],
  ja: [{ q: '米国株 速報' }, { q: 'マックスペイン' }, { q: '米国株' }],
  en: [{ q: 'stock market today' }, { q: 'options trading' }, { q: 'ai bubble' }],
};

const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g('YT_REFRESH_TOKEN'), grant_type: 'refresh_token' }) })).json();
  return j.access_token;
})();
const api = async (p) => (await fetch(`https://www.googleapis.com/youtube/v3/${p}`,
  { headers: { Authorization: `Bearer ${tok}` } })).json();

const ytdlp = (url, n = 25) => {
  const r = spawnSync('yt-dlp', [url, '--flat-playlist', '--dump-json', '--playlist-end', String(n),
    '--no-warnings', '--socket-timeout', '20'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
};

const out = { day: DAY, markets: {} };
const langs = WHICH === 'all' ? ['ko', 'ja', 'en'] : [WHICH];

for (const lang of langs) {
  const found = [];
  for (const src of (REFS[lang] || [])) {
    const url = src.handle
      ? `https://www.youtube.com/${src.handle}/videos`
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(src.q)}&sp=CAI%253D`; // 최신순
    const vids = ytdlp(url, src.handle ? 20 : 15);
    for (const v of vids) if (v.id && v.title) found.push({ id: v.id, title: v.title, views: v.view_count ?? null, from: src.handle || src.q });
  }
  // 상세 — 게시일·조회
  const ids = [...new Set(found.map((f) => f.id))].slice(0, 60);
  const det = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await api(`videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(',')}`);
    for (const it of (j.items || [])) {
      const d = it.contentDetails.duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/) || [];
      det[it.id] = { pub: it.snippet.publishedAt, views: +it.statistics.viewCount || 0,
        dur: (+(d[1] || 0)) * 60 + (+(d[2] || 0)), ch: it.snippet.channelTitle };
    }
  }
  const NOW = Date.now();
  const rows = found.map((f) => ({ ...f, ...det[f.id] }))
    .filter((r) => r.pub && (NOW - Date.parse(r.pub)) / 86400000 <= 4)     // 최근 4일만
    .sort((a, b) => b.views - a.views);

  // 우리 수요표와 대조 — 문이 열려 있는가
  const D = demandFor(lang === 'ja' ? 'ja' : 'en').terms;
  const KEYS = Object.keys(D).sort((a, b) => b.length - a.length);
  for (const r of rows) {
    const low = r.title.toLowerCase();
    const hit = KEYS.find((k) => low.includes(k.toLowerCase()));
    r.door = hit ? { term: hit, demand: D[hit] } : null;
  }
  out.markets[lang] = rows.slice(0, 20);

  console.log(`\n  ══ ${lang.toUpperCase()} — 최근 4일 ${rows.length}편 ══`);
  for (const r of rows.slice(0, 12))
    console.log(`   ${String(r.views).padStart(8)}회 ${String(r.dur).padStart(3)}s  ${r.pub.slice(5, 10)}  ${r.title.slice(0, 52)}${r.door ? `   [문 ${r.door.demand.toLocaleString()}]` : ''}`);
}

const md = [`# 레퍼런스 정찰 ${DAY}`, '',
  '자동 — `scripts/scout-refs.mjs`. 최근 4일치만.', '',
  '⛔ **베끼지 않는다.** 그들 제목에서 «주제»만 뽑고, 문장·해석·숫자는 우리가 새로 만든다.',
  '⛔ 문(수요)이 열려 있는지 우리 수요표로 확인한다. **여지 40% 미만이면 버린다.**',
  '⛔ 우리 데이터로 «베이스레이트»를 낼 수 없으면 만들지 않는다 — 그건 뉴스 재방송이다.', ''];
for (const [lang, rows] of Object.entries(out.markets)) {
  md.push(`## ${lang.toUpperCase()}`, '', '| 조회 | 길이 | 게시 | 제목 | 우리 문 |', '|---|---|---|---|---|');
  for (const r of rows) md.push(`| ${r.views.toLocaleString()} | ${r.dur}s | ${r.pub.slice(5, 10)} | ${r.title.replace(/\|/g, '/')} | ${r.door ? r.door.term + ' ' + r.door.demand.toLocaleString() : '—'} |`);
  md.push('');
}
writeFileSync(`.agent/SCOUT_${DAY}.md`, md.join('\n'));
writeFileSync('.agent/_scout.json', JSON.stringify(out, null, 1));
console.log(`\n  → .agent/SCOUT_${DAY}.md\n`);
