#!/usr/bin/env node
// ============================================================================
// kr-jp-deep2 — 「신규 채널이 뚫을 수 있는가」 (구독자는 YouTube API 로 확실히)
// ----------------------------------------------------------------------------
// 1차 시도는 yt-dlp 채널 페이지로 구독자를 뽑으려다 0곳 해결에 그쳤다.
// channels.list 는 한 번에 50개를 정확히 준다. 그걸 쓴다.
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

const Q = {
  KO: ['금값 오르는 이유', '환율 오르는 이유', '반도체 주식 전망', '미국주식 초보', '엔비디아 주가',
       '경기침체 오나', '금리 인하 주식', '오늘 증시', '주식 초보', '테슬라 주가'],
  JA: ['金価格 上昇 理由', '円安 理由', '半導体 株 見通し', '米国株 初心者', 'エヌビディア 株価',
       '景気後退 くる', '利下げ 株価', '今日の株式市場', '株 初心者', 'テスラ 株価'],
};

const search = (q) => {
  const r = spawnSync('yt-dlp', [`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`,
    '--flat-playlist', '--dump-json', '--playlist-end', '16', '--no-warnings', '--socket-timeout', '20'],
    { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
};
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const out = {};
for (const [lang, qs] of Object.entries(Q)) {
  const vids = [], ids = new Set();
  for (const q of qs) for (const d of search(q)) {
    if (typeof d.view_count !== 'number' || !d.channel_id) continue;
    vids.push({ v: d.view_count, chId: d.channel_id, ch: d.channel, t: d.title });
    ids.add(d.channel_id);
  }
  const subs = {};
  const list = [...ids];
  for (let i = 0; i < list.length; i += 50) {
    const j = await (await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${list.slice(i, i + 50).join(',')}`,
      { headers: { Authorization: `Bearer ${tok}` } })).json();
    for (const it of (j.items || [])) subs[it.id] = { s: +it.statistics.subscriberCount || 0, n: it.snippet.title };
  }
  const band = { tiny: [], small: [], big: [] };
  for (const v of vids) {
    const s = subs[v.chId]; if (!s) continue;
    (s.s < 10000 ? band.tiny : s.s < 100000 ? band.small : band.big).push(v.v);
  }
  const known = band.tiny.length + band.small.length + band.big.length;
  out[lang] = {
    videos: vids.length, channels: ids.size, resolved: Object.keys(subs).length,
    medianViews: med(vids.map((v) => v.v)),
    tiny: { n: band.tiny.length, med: med(band.tiny), max: band.tiny.length ? Math.max(...band.tiny) : 0 },
    small: { n: band.small.length, med: med(band.small), max: band.small.length ? Math.max(...band.small) : 0 },
    big: { n: band.big.length, med: med(band.big) },
    underdogShare: known ? +((band.tiny.length + band.small.length) / known * 100).toFixed(0) : 0,
    top: Object.values(subs).sort((a, b) => b.s - a.s).slice(0, 6),
  };
  const o = out[lang];
  console.log(`\n  ══ ${lang} ══  영상 ${o.videos} · 채널 ${o.channels} (구독자 확인 ${o.resolved})`);
  console.log(`   전체 조회 중앙 ${o.medianViews.toLocaleString()}`);
  console.log(`   구독 1만 미만  ${String(o.tiny.n).padStart(3)}편  조회중앙 ${o.tiny.med.toLocaleString().padStart(8)}  최고 ${o.tiny.max.toLocaleString()}`);
  console.log(`   1만~10만      ${String(o.small.n).padStart(3)}편  조회중앙 ${o.small.med.toLocaleString().padStart(8)}  최고 ${o.small.max.toLocaleString()}`);
  console.log(`   10만 이상     ${String(o.big.n).padStart(3)}편  조회중앙 ${o.big.med.toLocaleString().padStart(8)}`);
  console.log(`   ▶ 소형(10만 미만) 상위권 점유 ${o.underdogShare}%`);
  console.log(`   최대 채널: ${o.top.map((x) => `${x.n}(${(x.s / 10000).toFixed(0)}만)`).join(' · ')}`);
}
writeFileSync('.agent/_krjp_deep.json', JSON.stringify(out, null, 1));
console.log('\n  → .agent/_krjp_deep.json');
