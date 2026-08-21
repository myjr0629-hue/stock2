#!/usr/bin/env node
// ============================================================================
// jp-report-verify — 외부 「일본 진출 전략 보고서」의 주장을 실측으로 검증한다
// ----------------------------------------------------------------------------
// 대표 제공 자료(2026-08-21)의 핵심 주장:
//   ① 신NISA 이후 미국주식 정보 소비가 «폭발적»이다
//   ② 빅테크 개별주(엔비디아/AMD/테슬라)·레바나스는 «수요 폭발, 공급 0» 블루오션
//   ③ 기관 수급·옵션(機関投資家の手口 / マックスペイン)은 «공급 전무»
//   ④ 「結論」「知らなきゃ損」「爆上げ」 같은 어휘가 먹힌다
//
// ⛔ 주장은 근거가 아니다. 같은 자(수요·여지·소형중앙)로 재서 남길 것만 남긴다.
//   「공급 0」은 여지(소형채널 비중)가 아니라 «상위권 조회 수준»으로 확인한다 —
//   진짜 공급이 없으면 상위권 조회 자체가 낮게 나온다.
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g('YT_REFRESH_TOKEN'), grant_type: 'refresh_token' }),
  })).json();
  return j.access_token;
})();

// 보고서가 지목한 어휘 그대로
const Q = [
  ['주장2 빅테크', 'レバナス'],
  ['주장2 빅테크', 'エヌビディア 爆上げ'],
  ['주장2 빅테크', 'AMD 株'],
  ['주장2 빅테크', 'テンバガー 銘柄'],
  ['주장2 빅테크', 'SOXL'],
  ['주장3 기관·옵션', '機関投資家の手口'],
  ['주장3 기관·옵션', 'マックスペイン'],
  ['주장3 기관·옵션', 'オプション取引 解説'],
  ['주장3 기관·옵션', '空売り 仕掛け'],
  ['주장3 기관·옵션', '板読み トレード'],
  ['주장1 신NISA', '新NISA 米国株'],
  ['주장1 신NISA', '新NISA おすすめ'],
  ['주장1 신NISA', 'オルカン'],
  ['주장4 어휘', '米国株 知らなきゃ損'],
  ['주장4 어휘', '株 買い場'],
  ['참고 환율', '日銀ショック'],
  ['참고 환율', 'FRB 利下げ'],
];

const search = (q, n = 20) => {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`;
  const r = spawnSync('yt-dlp', [url, '--flat-playlist', '--dump-json', '--playlist-end', String(n),
    '--no-warnings', '--socket-timeout', '20'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter((d) => typeof d.view_count === 'number' && d.id);
};
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const rows = [];
for (const [claim, q] of Q) {
  const v = search(q);
  if (!v.length) { console.log(`  x ${q}`); continue; }
  const ids = [...new Set(v.map((x) => x.channel_id).filter(Boolean))];
  const subs = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await (await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids.slice(i, i + 50).join(',')}`,
      { headers: { Authorization: `Bearer ${tok}` } })).json();
    for (const it of (j.items || [])) subs[it.id] = +it.statistics.subscriberCount || 0;
  }
  const known = v.filter((x) => subs[x.channel_id] !== undefined);
  const small = known.filter((x) => subs[x.channel_id] < 100000);
  const sv = small.map((x) => x.view_count);
  const demand = med(v.map((x) => x.view_count));
  const room = known.length ? small.length / known.length : 0;
  const top = v.slice().sort((a, b) => b.view_count - a.view_count)[0];
  const row = { claim, q, demand, room: +(room * 100).toFixed(0), smallMed: med(sv),
    smallMax: sv.length ? Math.max(...sv) : 0, n: v.length,
    topT: top && top.title ? top.title.slice(0, 44) : null, topV: top ? top.view_count : null };
  rows.push(row);
  console.log(`  ${claim.padEnd(13)} ${String(demand).padStart(8)} room${String(row.room).padStart(3)}% small${String(row.smallMed).padStart(8)}  ${q}`);
}
writeFileSync('.agent/_jp_report_verify.json', JSON.stringify({ measuredAt: '2026-08-21', rows }, null, 1));

console.log('\n  ══ 주장별 판정 ══');
for (const c of [...new Set(rows.map((r) => r.claim))]) {
  const rs = rows.filter((r) => r.claim === c);
  console.log(`\n  [${c}]  수요중앙 ${med(rs.map((r) => r.demand)).toLocaleString()} · 소형중앙 ${med(rs.map((r) => r.smallMed)).toLocaleString()} · 여지중앙 ${med(rs.map((r) => r.room))}%`);
  for (const r of rs.sort((a, b) => b.demand - a.demand))
    console.log(`     ${r.demand.toLocaleString().padStart(9)}  여지${String(r.room).padStart(3)}%  소형${r.smallMed.toLocaleString().padStart(8)}  ${r.q}   최고: ${r.topV ? r.topV.toLocaleString() : '?'}`);
}
console.log('\n  → .agent/_jp_report_verify.json');
