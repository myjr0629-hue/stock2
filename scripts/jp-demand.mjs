#!/usr/bin/env node
// ============================================================================
// jp-demand — 「일본 사람들이 실제로 무엇을 보는가」를 잰다
// ----------------------------------------------------------------------------
// 대표 지시 2026-08-21: "일본에서 원하는 영상은 어떤것인지 실측해보고 보고해"
//
// 한국·영어와 «같은 자»로 잰다: 검색어별 상위 쇼츠의 조회 중앙/최고,
// 상위권 채널의 구독자 규모, 그리고 «어떤 제목이 이기는가».
// ⛔ 추정으로 쓰지 않는다. 전부 실측이고 표본 수를 같이 적는다.
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

// 분류별 검색어 — 「금융·경제」 안에서 성격이 다른 축을 고르게 깐다
const CATS = {
  '금·귀금속':   ['金価格 上昇 理由', '金 投資 初心者', 'ゴールド 買い時'],
  '환율·엔':     ['円安 理由', '円安 いつまで', 'ドル円 予想'],
  '미국주식':    ['米国株 初心者', '米国株 おすすめ', 'S&P500 積立'],
  'NISA·적립':   ['新NISA 何を買う', 'つみたてNISA 銘柄', 'NISA 失敗'],
  '반도체·AI':   ['半導体 株 見通し', 'エヌビディア 株価', 'AI 関連株'],
  '금리·정책':   ['利上げ 影響', '日銀 金融政策', '住宅ローン 金利 上昇'],
  '경기·침체':   ['景気後退 くる', '日本経済 これから', 'インフレ 生活'],
  '개별종목':    ['トヨタ 株価', 'ソフトバンク 株', '任天堂 株価'],
  '노후·연금':   ['老後 2000万円', '年金 いくら もらえる', '資産形成 30代'],
  '암호화폐':    ['ビットコイン 今後', '仮想通貨 初心者'],
};

const search = (q, n = 16) => {
  const r = spawnSync('yt-dlp', [`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`,
    '--flat-playlist', '--dump-json', '--playlist-end', String(n), '--no-warnings', '--socket-timeout', '20'],
    { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter((d) => typeof d.view_count === 'number');
};
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const all = [], catRows = [];
for (const [cat, qs] of Object.entries(CATS)) {
  const vids = [];
  for (const q of qs) for (const d of search(q)) vids.push({ q, cat, v: d.view_count, t: d.title, ch: d.channel, chId: d.channel_id, sec: d.duration });
  all.push(...vids);
  const m = med(vids.map((v) => v.v));
  catRows.push({ cat, n: vids.length, median: m, max: vids.length ? Math.max(...vids.map((v) => v.v)) : 0,
    best: vids.slice().sort((a, b) => b.v - a.v)[0] });
  console.log(`  ${cat.padEnd(11)} n=${String(vids.length).padStart(3)}  중앙 ${String(m).padStart(8)}  최고 ${String(catRows[catRows.length - 1].max).padStart(9)}`);
}

// 상위권 채널의 구독자 — 신규가 뚫을 수 있는가
const ids = [...new Set(all.map((v) => v.chId).filter(Boolean))];
const subs = {};
for (let i = 0; i < ids.length; i += 50) {
  const j = await (await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${ids.slice(i, i + 50).join(',')}`,
    { headers: { Authorization: `Bearer ${tok}` } })).json();
  for (const it of (j.items || [])) subs[it.id] = { s: +it.statistics.subscriberCount || 0, n: it.snippet.title };
}
writeFileSync('.agent/_jp_demand.json', JSON.stringify({ catRows, all, subs }, null, 1));
console.log(`\n  영상 ${all.length}편 · 채널 ${ids.length}곳 (구독자 확인 ${Object.keys(subs).length})`);
console.log('  → .agent/_jp_demand.json');
