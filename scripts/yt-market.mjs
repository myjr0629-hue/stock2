#!/usr/bin/env node
// ============================================================================
// yt-market — 「지금 실제로 잘 되는 금융 쇼츠」를 찾아 그 «패턴»을 뽑는다
// ----------------------------------------------------------------------------
// 왜 방법을 바꿨나 (2026-08-20)
//   1차: 내가 고른 씨앗 → 자동완성 → 검색. «내가 정한 카테고리» 안에서만 봤다.
//   2차: 동음이의어 오염(dark poolrooms 등)까지 겹쳤다.
//   ⇒ 내 추측을 근거로 삼는 구조 자체가 문제다.
//
// 그래서 «시장에서 이미 이긴 영상»에서 거꾸로 배운다.
//   ① 금융 쇼츠 채널을 폭넓게 찾는다 (search 6회 = 600유닛)
//   ② 각 채널의 최근 업로드를 «싸게» 훑는다 (playlistItems·videos = 1유닛/50건)
//   ③ 조회수 상위 쇼츠의 «제목»에서 무엇이 반복되는지 센다
//
// 이건 내 의견이 아니라 «사람들이 실제로 본 것»이다.
//
// 사용: node scripts/yt-market.mjs
// 출력: .agent/MARKET_WINNERS.json
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
const KEY = (env.match(/^YOUTUBE_API_KEY=(.+)$/m) || [])[1]?.trim();
const g = async (u) => (await fetch(u)).json();
const V3 = 'https://www.googleapis.com/youtube/v3';

// ── ① 채널 발굴 — 넓게. 「무엇을 다루는 채널인가」로만 나눈다 ────────────────
const PROBES = [
  'stock market explained shorts',
  'options trading shorts',
  'finance shorts stocks',
  'wall street explained',
  'investing shorts daily',
  'stock news today shorts',
];

console.log('\n  ① 금융 쇼츠 채널 발굴');
const chans = new Map();
for (const p of PROBES) {
  const s = await g(`${V3}/search?${new URLSearchParams({
    part: 'snippet', q: p, type: 'video', videoDuration: 'short',
    order: 'viewCount', publishedAfter: new Date(Date.now() - 90 * 864e5).toISOString(),
    maxResults: '25', regionCode: 'US', relevanceLanguage: 'en', key: KEY,
  })}`);
  if (s.error) { console.error('  ✗', s.error.message); break; }
  for (const it of s.items || []) {
    const c = it.snippet.channelId;
    if (!chans.has(c)) chans.set(c, { id: c, title: it.snippet.channelTitle });
  }
  console.log(`  ${p.padEnd(30)} → 누적 채널 ${chans.size}`);
}

// ── ② 채널별 최근 업로드를 «싸게» 훑는다 ────────────────────────────────────
// ⛔ 1차 필터의 결함 (실측): invest·money·wealth 를 넣었더니 «줌바 피트니스»가 1위로 올라왔다
//    (Health is Wealth, 1,285만). 힌디·텔루구 머니 동기부여 콘텐츠도 대거 섞였다.
//    우리는 «미국 주식/옵션»이다. 그 말이 실제로 들어간 제목만 남긴다.
const FIN = /\b(nasdaq|s&p|sp ?500|dow jones|russell|nvidia|nvda|tesla|tsla|amd|apple|aapl|palantir|pltr|micron|intel|broadcom|avgo|microsoft|msft|amazon|google|meta|netflix|earnings|fed|fomc|powell|cpi|ppi|inflation|treasury|yield|options?|calls?|puts?|premarket|wall street|stock market|stocks?|share price|ticker|etf|spy|qqq|vix|short squeeze|dividend|buffett)\b/i;
// 비영어·타국 시장·일반 동기부여를 걷어낸다
const OUT_RE = /[ऀ-ॿఀ-౿஀-௿一-鿿가-힯؀-ۿ]/;          // 데바나가리·텔루구·타밀·한자·한글·아랍
const OUT_WORD = /\b(zumba|fitness|workout|nifty|sensex|crore|lakh|rupee|paisa|kabhi|andar|hota|nahin|upsc|india|indian|bse|nse|forex|binary|casino|betting)\b/i;
const ids = [...chans.keys()];
console.log(`\n  ② 채널 ${ids.length}곳의 최근 업로드 수집`);

const upl = {};
for (let i = 0; i < ids.length; i += 50) {
  const c = await g(`${V3}/channels?part=contentDetails,statistics,snippet&id=${ids.slice(i, i + 50).join(',')}&key=${KEY}`);
  for (const it of c.items || []) {
    upl[it.id] = {
      title: it.snippet.title,
      subs: +(it.statistics.subscriberCount || 0),
      pl: it.contentDetails.relatedPlaylists.uploads,
    };
  }
}

const vids = [];
const cnt = { seen: 0, dur: 0, fin: 0, script: 0, word: 0, lang: 0, age: 0, ok: 0 };
for (const [cid, m] of Object.entries(upl)) {
  const p = await g(`${V3}/playlistItems?part=contentDetails&playlistId=${m.pl}&maxResults=25&key=${KEY}`);
  const vs = (p.items || []).map((x) => x.contentDetails.videoId);
  if (!vs.length) continue;
  for (let i = 0; i < vs.length; i += 50) {
    const v = await g(`${V3}/videos?part=snippet,statistics,contentDetails&id=${vs.slice(i, i + 50).join(',')}&key=${KEY}`);
    for (const it of v.items || []) {
      if (!it.contentDetails?.duration || !it.snippet || !it.statistics) continue;  // 비공개·삭제 대응
      const d = it.contentDetails.duration.match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/);
      const sec = (+(d?.[1] || 0)) * 60 + (+(d?.[2] || 0));
      cnt.seen++;
      if (sec > 65 || sec < 5) { cnt.dur++; continue; }                       // 쇼츠만
      const ttl = it.snippet.title;
      if (!FIN.test(ttl)) { cnt.fin++; continue; }
      if (OUT_RE.test(ttl)) { cnt.script++; continue; }
      if (OUT_WORD.test(ttl)) { cnt.word++; continue; }
      const lang = it.snippet.defaultAudioLanguage || it.snippet.defaultLanguage || 'en';
      if (!/^en/i.test(lang)) { cnt.lang++; continue; }
      const age = (Date.now() - new Date(it.snippet.publishedAt)) / 864e5;
      if (age > 120) { cnt.age++; continue; }
      cnt.ok++;
      vids.push({
        ch: m.title, subs: m.subs, title: it.snippet.title, sec,
        views: +(it.statistics.viewCount || 0), age: Math.round(age),
        vpd: Math.round(+(it.statistics.viewCount || 0) / Math.max(age, 1)),
      });
    }
  }
}
console.log(`  금융 쇼츠 ${vids.length}편 수집 (120일 내)`);
console.log('  탈락 내역 —', JSON.stringify(cnt));

// ── ③ 이긴 영상의 «패턴»을 센다 ─────────────────────────────────────────────
vids.sort((a, b) => b.views - a.views);
const top = vids.slice(0, 60);

console.log('\n  ★ 조회수 상위 금융 쇼츠 20편 — «사람들이 실제로 본 것»');
console.log('  ' + '─'.repeat(100));
for (const v of top.slice(0, 20)) {
  console.log(`  ${String(v.views).padStart(9)}  ${String(v.sec + 's').padStart(4)}  ${v.title.slice(0, 62).padEnd(64)} ${v.ch.slice(0, 18)}`);
}

// 제목 패턴 — 숫자·물음표·2인칭·부정어 등 «형태»가 반복되는지
const pat = {
  '숫자 포함': /\d/, '물음표': /\?/, '2인칭(you/your)': /\byou(r)?\b/i,
  '금액($)': /\$/, '퍼센트(%)': /%/, '부정·경고': /\b(never|stop|don'?t|mistake|wrong|lose|lost|crash|warning|avoid)\b/i,
  '비교(vs)': /\bvs\b|\bversus\b/i, '명령형 시작': /^(how|why|what|stop|never|do|watch|here)/i,
};
const rate = (list, re) => Math.round(100 * list.filter((v) => re.test(v.title)).length / list.length);
const rest = vids.slice(60);
console.log('\n  제목 패턴 — 상위 60편 vs 나머지');
console.log('  ' + '─'.repeat(52));
console.log('  ' + '패턴'.padEnd(20) + '상위'.padStart(7) + '나머지'.padStart(9) + '차이'.padStart(8));
for (const [k, re] of Object.entries(pat)) {
  const a = rate(top, re), b = rest.length ? rate(rest, re) : 0;
  const d = a - b;
  console.log(`  ${k.padEnd(20)}${String(a + '%').padStart(7)}${String(b + '%').padStart(9)}${String((d > 0 ? '+' : '') + d).padStart(8)}`);
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
console.log(`\n  길이 중앙값 — 상위 ${med(top.map(v => v.sec))}초 · 나머지 ${med(rest.map(v => v.sec))}초`);

mkdirSync('.agent', { recursive: true });
writeFileSync('.agent/MARKET_WINNERS.json', JSON.stringify({
  pulledAt: new Date().toISOString(), channels: Object.values(upl).length,
  collected: vids.length, top, all: vids,
}, null, 2));
console.log('\n  → .agent/MARKET_WINNERS.json\n');
