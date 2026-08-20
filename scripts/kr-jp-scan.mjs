#!/usr/bin/env node
// ============================================================================
// kr-jp-scan — 「한국 vs 일본」 금융 쇼츠 시장을 같은 자로 잰다
// ----------------------------------------------------------------------------
// 대표 지시 2026-08-21: "한국이나 일본은 시간대가 같으니 어느쪽이 더 효과가
//   좋은지 조사를 해보고 (…) 채널을 하나 더 만드는쪽으로 (…) 철저하게 실적 위주로"
//
// 재는 것 (전부 실측):
//   ① 수요   — 같은 주제를 각 언어로 검색한 상위 쇼츠의 조회 중앙/최고
//   ② 경쟁   — 상위권에 등장하는 «서로 다른 채널 수» (적을수록 소수가 독식 = 뚫기 어려움)
//   ③ 집중도 — 상위 1채널이 가진 조회 비중
// ⛔ 광고단가(RPM)는 우리가 잴 수 없다 — 추정으로 쓰지 않는다
// ============================================================================
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const TOPICS = [
  { key: '금값',     ko: '금값 오르는 이유',      ja: '金価格 上昇 理由' },
  { key: '비트코인', ko: '비트코인 쉽게 설명',    ja: 'ビットコイン 初心者 解説' },
  { key: '침체',     ko: '경기침체 오나',         ja: '景気後退 くる' },
  { key: '금리',     ko: '금리 인하 주식',        ja: '利下げ 株価' },
  { key: '엔비디아', ko: '엔비디아 주가',         ja: 'エヌビディア 株価' },
  { key: '반도체',   ko: '반도체 주식 전망',      ja: '半導体 株 見通し' },
  { key: '미국주식', ko: '미국주식 초보',         ja: '米国株 初心者' },
  { key: '환율',     ko: '환율 오르는 이유',      ja: '円安 理由' },
  { key: 'AI버블',   ko: 'AI 버블 붕괴',          ja: 'AIバブル 崩壊' },
  { key: '증시',     ko: '오늘 증시 요약',        ja: '今日の株式市場' },
];

function search(q, n = 18) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`;
  const r = spawnSync('yt-dlp', [url, '--flat-playlist', '--dump-json', '--playlist-end', String(n),
    '--no-warnings', '--socket-timeout', '20'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function profile(q) {
  const rows = search(q).filter((d) => typeof d.view_count === 'number' && d.view_count >= 0);
  if (!rows.length) return null;
  const views = rows.map((d) => d.view_count);
  const byCh = {};
  for (const d of rows) { const c = d.channel || d.uploader || '?'; byCh[c] = (byCh[c] || 0) + d.view_count; }
  const tot = views.reduce((a, b) => a + b, 0);
  const top = Math.max(...Object.values(byCh));
  return {
    n: rows.length, median: med(views), max: Math.max(...views),
    channels: Object.keys(byCh).length,
    topShare: tot ? +(top / tot * 100).toFixed(0) : 0,
    titles: rows.slice(0, 3).map((d) => ({ t: d.title, v: d.view_count, c: d.channel })),
  };
}

const out = [];
for (const t of TOPICS) {
  const ko = profile(t.ko), ja = profile(t.ja);
  out.push({ ...t, ko, ja });
  const f = (p) => p ? `${String(p.median).padStart(7)}  ch${String(p.channels).padStart(3)}  독점${String(p.topShare).padStart(3)}%` : '   —';
  console.log(`  ${t.key.padEnd(9)} KO ${f(ko)}    JA ${f(ja)}`);
}
writeFileSync('.agent/_krjp_scan.json', JSON.stringify(out, null, 1));
console.log('\n  → .agent/_krjp_scan.json');
