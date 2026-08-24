#!/usr/bin/env node
// ============================================================================
// topic-scan — 「시장이 지금 가장 관심 갖는 것」을 찾아 소재 후보를 낸다
// ----------------------------------------------------------------------------
// ⛔ 이 파일이 존재하는 이유 (2026-08-24, 대표 지적)
//   나는 .agent/DEMAND.json(유튜브 검색 «누적» 조회수 중앙값, 3~4일 전 측정)만 보고
//   소재를 골랐다. 그건 「그 소재가 원래 인기 있다」이지 「지금 궁금해한다」가 아니다.
//   대표: "낙후된 노후화된 검색어를 가지고 접근한다는것이 문제이다"
//
//   더 큰 잘못이 하나 더 있었다. 나는 «우리 데이터에서 이상한 걸 찾아 이슈를 만들자»고 했다.
//   대표: "그것은 주류채널이 하는 행동이고 우리는 시류에 따라야한다"
//   ⇒ 트렌드를 «만들지» 않는다. 이미 난 관심을 «빠르게 해석»한다. 그게 우리 자리다.
//
// ── 소재는 3칸이 다 차야 «완성» 이다 ────────────────────────────────────────
//   관심 : 지금 말이 나오는가   (X · 레퍼런스채널 · StockTwits)
//   가격 : 실제로 움직였는가     (Massive 전체시장 스냅샷)
//   원인 : 왜 그런지 아는가      (3개국 헤드라인 · 공시)
//
//   3칸 다 참   → 제작
//   원인만 빔   → 조사 (모른 채로 대본 쓰지 않는다)
//   관심이 빔   → «폐기». 우리가 만든 이슈이기 때문이다.
//
//   과거 14편을 이 틀로 재보니 전부 «가격» 칸만 찼고 «관심» 칸이 비어 있었다.
//
// 사용:
//   node scripts/topic-scan.mjs             # 전체 스캔
//   node scripts/topic-scan.mjs --quick     # 레퍼런스 채널 생략 (빠름)
// 출력: .agent/TODAY_HOOKS.json + 콘솔 표
// ============================================================================

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const QUICK = process.argv.includes('--quick');

// ── 키 ──────────────────────────────────────────────────────────────────────
// ⛔ MASSIVE_API_KEY 는 .env.local 이 아니라 «.env.vercel» 에 있다 (2026-08-24 실측).
//   내가 .env.local 만 뒤지고 「폴리곤 키가 없다」고 잘못 보고했다. 두 파일을 다 읽는다.
const envOf = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const ENV = envOf('.env.local') + '\n' + envOf('.env.vercel');
const key = (k) => (ENV.match(new RegExp('^' + k + '=["\']?([^"\'\\r\\n]+)', 'm')) || [])[1] || null;
const FMP = key('FMP_API_KEY');
const MASSIVE = key('MASSIVE_API_KEY') || key('POLYGON_API_KEY');
const YT = key('YOUTUBE_API_KEY');

const j = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(r.status + ' ' + u.split('?')[0]);
  return r.json();
};
const txt = async (u) => (await fetch(u)).text();
const num = (n, d = 2) => (n === null || n === undefined || !isFinite(n) ? '—' : n.toFixed(d));

// ── ① 가격 — Massive 전체시장 스냅샷 (1콜 12,000종목) ───────────────────────
// ⛔ 이게 이 스캐너의 심장이다. 내가 «고른» 종목이 아니라 «시장 전체»를 줄 세운다.
//   목록을 내가 만들면 결론도 내가 만든 것이 된다 — 그게 대표가 금지한 바로 그것이다.
// ⛔ 장 시작 전에는 day.v 가 0 이다. prevDay 를 쓴다 (실측: day 기준으로 0종목이 나왔다).
async function priceLayer() {
  if (!MASSIVE) return { err: 'MASSIVE_API_KEY 없음 (.env.vercel 확인)' };
  const d = await j('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=' + MASSIVE);
  const rows = [];
  for (const x of d.tickers || []) {
    const p = x.prevDay || {};
    const turn = (p.v || 0) * (p.vw || 0);
    if (turn < 3e8 || !p.o) continue;               // 거래대금 3억달러 미만은 소음
    rows.push({ t: x.ticker, ch: (100 * (p.c - p.o)) / p.o, turn });
  }
  rows.sort((a, b) => a.ch - b.ch);
  return {
    universe: (d.tickers || []).length,
    liquid: rows.length,
    down: rows.slice(0, 12),
    up: rows.slice(-12).reverse(),
    money: [...rows].sort((a, b) => b.turn - a.turn).slice(0, 15),
  };
}

// ── ② 관심 — StockTwits (교차검증용) ────────────────────────────────────────
// ⛔ 단독 근거로 쓰지 않는다. 세션 내 두 시점 대조에서 교체율 76% 였다 (25개 중 6개만 잔존).
//   고착이 아니라 «잡음» 이 문제다. 두 번 뽑아 «살아남은 것»이 진짜 관심이다.
//
// ⛔ Node 기본 fetch 는 «403» 을 받는다 (2026-08-24 실측 — 한경·매경·연합·CNBC 는 200인데
//   여기만 403). TLS 지문이 브라우저가 아니기 때문이다. curl_cffi 로 우회한다.
//   ⇒ 이걸 모르고 넘어가면 관심층이 «조용히 0» 이 되고, 후보가 1건으로 쪼그라든다.
//     실제로 첫 실행에서 그렇게 됐다. 실패를 삼키지 말고 화면에 띄운다.
function socialLayer() {
  const py = 'from curl_cffi import requests as r;import json;'
    + 'print(json.dumps([x["symbol"] for x in '
    + 'r.get("https://api.stocktwits.com/api/2/trending/symbols.json",impersonate="safari",timeout=25)'
    + '.json()["symbols"]]))';
  for (const exe of ['python', 'python3']) {
    const q = spawnSync(exe, ['-c', py], { encoding: 'utf8' });
    if (q.status === 0 && q.stdout.trim().startsWith('[')) {
      try { return JSON.parse(q.stdout.trim()); } catch (e) { /* 다음 후보 */ }
    }
  }
  console.warn('  ⚠ StockTwits 회수 실패 — curl_cffi 확인 (pip install "curl_cffi>=0.15.0")');
  return [];
}

// ── ③ 원인 + 경쟁 — 3개국 헤드라인 ──────────────────────────────────────────
// ⛔ 이 층의 진짜 값어치는 «원인» 이 아니라 «경쟁 유무» 다.
//   크게 움직였는데 3개국이 다 조용하면, 아무도 설명해주지 않은 사건이다 — 우리 자리다.
const FEEDS = [
  ['KR', 'https://www.hankyung.com/feed/finance'],
  ['KR', 'https://www.mk.co.kr/rss/50200011/'],
  ['KR', 'https://www.yna.co.kr/rss/economy.xml'],
  // ⛔ 국가별 질의어를 «대칭» 으로 유지한다. 처음엔 KR 만 「미국증시」였고 JP 는 「米国株 OR 関税」였다.
  //   그 비대칭 때문에 관세 주제가 JP 79 · KR 0 으로 나와, 마치 한국이 관세를 안 다루는 것처럼 보였다.
  //   (별도 실측에서 한국 관세 기사는 91건이었다 — 질의어가 만든 착시였다)
  ['KR', 'https://news.google.com/rss/search?q=%EB%AF%B8%EA%B5%AD%EC%A6%9D%EC%8B%9C+OR+%EA%B4%80%EC%84%B8+when:2d&hl=ko&gl=KR&ceid=KR:ko'],
  ['JP', 'https://assets.wor.jp/rss/rdf/nikkei/markets.rdf'],
  ['JP', 'https://news.google.com/rss/search?q=%E7%B1%B3%E5%9B%BD%E6%A0%AA+OR+%E9%96%A2%E7%A8%8E+when:2d&hl=ja&gl=JP&ceid=JP:ja'],
  ['US', 'https://www.cnbc.com/id/20910258/device/rss/rss.html'],
  ['US', 'https://feeds.content.dowjones.io/public/rss/mw_topstories'],
  ['US', 'https://finance.yahoo.com/news/rssindex'],
  ['US', 'https://news.google.com/rss/search?q=tariffs+OR+Fed+OR+China+OR+Iran+when:2d&hl=en-US&gl=US&ceid=US:en'],
];

// ⛔ 지정학·매크로는 «죽은 주제» 를 걸러내야 한다. 최신성(h)을 같이 잰다.
//   실측 2026-08-24: 우크라·러시아는 1건 148.9시간 전 — 사실상 소멸했는데
//   최신성을 안 재면 「지정학 주제」로 계속 후보에 올라온다.
const THEMES = {
  '관세·무역': ['tariff', '関税', '관세', 'trade war', '貿易', '무역'],
  '중국': ['China', '中国', '중국', 'Alibaba', 'アリババ', '알리바바'],
  '연준·금리': ['Fed', 'FOMC', 'rate cut', 'FRB', '利下げ', '연준', '금리', 'Powell', '파월'],
  '일본은행·엔': ['BOJ', '日銀', '엔화', 'yen', '円安'],
  '대만·반도체지정학': ['Taiwan', '台湾', '대만', 'chip curb', '輸出規制', '수출규제'],
  '중동·유가': ['Iran', '이란', 'Hormuz', 'oil', '原油', '유가', 'OPEC', 'Houthi'],
  '인플레·PCE': ['PCE', 'inflation', 'インフレ', '물가', 'CPI'],
  '우크라·러시아': ['Ukraine', 'Russia', 'ウクライナ', '러시아'],
};

async function newsLayer() {
  const now = Date.now();
  const heads = [];
  await Promise.all(FEEDS.map(async ([cty, u]) => {
    let t = '';
    try { t = await txt(u); } catch (e) { return; }
    const blocks = t.split(/<\/item>|<\/entry>/);
    for (const b of blocks) {
      const m = b.match(/<title>([\s\S]*?)<\/title>/);
      if (!m) continue;
      const title = m[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
      const pd = b.match(/<(?:pubDate|dc:date|updated|published)>([\s\S]*?)</);
      let age = Infinity;
      if (pd) { const d = Date.parse(pd[1].trim()); if (!isNaN(d)) age = (now - d) / 36e5; }
      heads.push({ cty, title, age });
    }
  }));
  const themes = {};
  for (const [name, ws] of Object.entries(THEMES)) {
    const hit = heads.filter((h) => ws.some((w) => h.title.toLowerCase().includes(w.toLowerCase())));
    if (!hit.length) continue;
    const by = {};
    for (const h of hit) by[h.cty] = (by[h.cty] || 0) + 1;
    themes[name] = { n: hit.length, freshH: Math.min(...hit.map((h) => h.age)), by };
  }
  return { heads, themes };
}

/** 티커가 3개국 헤드라인에 몇 번 나오는가 = 경쟁 강도. 0 이면 «아무도 설명 안 해준 사건» */
const coverageOf = (heads, ticker) =>
  heads.filter((h) => new RegExp('\\b' + ticker + '\\b').test(h.title)).length;

// ── ④ 일정 — FMP 경제 캘린더 ────────────────────────────────────────────────
async function calendarLayer() {
  if (!FMP) return [];
  const f = (d) => d.toISOString().slice(0, 10);
  try {
    const d = await j('https://financialmodelingprep.com/stable/economic-calendar?from='
      + f(new Date()) + '&to=' + f(new Date(Date.now() + 7 * 864e5)) + '&apikey=' + FMP);
    return d.filter((x) => ['US', 'USD'].includes(x.country) && x.impact === 'High')
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) { return []; }
}

// ── ⑤ 매크로 레짐 — 국채 커브 ───────────────────────────────────────────────
async function macroLayer() {
  if (!FMP) return null;
  try {
    const d = await j('https://financialmodelingprep.com/stable/treasury-rates?apikey=' + FMP);
    const cur = d[0], mo = d[Math.min(20, d.length - 1)];
    return { now: cur, mo, steepen: (cur.year30 - mo.year30) - (cur.year2 - mo.year2) };
  } catch (e) { return null; }
}

// ── ⑥ 관심(선행) — 레퍼런스 채널이 48시간 안에 올린 것 ──────────────────────
// ⛔ 프로 매체(블룸버그·CNBC)가 몇 시간 안에 «몇 편» 트는지가 가장 빠른 관심 지표다.
//   실측 2026-08-24: 블룸버그가 6시간에 캐나다 무역 4편 — 그게 그날의 1위였다.
async function refLayer() {
  if (!YT || QUICK) return [];
  let chans = [];
  for (const f of ['.agent/_refchan.json', '.agent/_refchan_jpkr.json'])
    if (existsSync(f)) chans = chans.concat(JSON.parse(readFileSync(f, 'utf8')));
  const KW = ['stock', 'market', 'financ', 'invest', 'cnbc', 'bloomberg', 'wall',
    '株', '投資', '経済', 'マネー', '증권', '주식', '경제', '투자'];
  const fin = chans.filter((c) => KW.some((k) => (c.t || '').toLowerCase().includes(k)))
    .sort((a, b) => b.subs - a.subs).slice(0, 18);
  const out = [];
  for (const c of fin) {
    try {
      const d = await j('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId='
        + c.up + '&maxResults=8&key=' + YT);
      for (const it of d.items || []) {
        const h = (Date.now() - Date.parse(it.snippet.publishedAt)) / 36e5;
        // ⛔ 업로드 재생목록에는 비공개·삭제분이 「Private video」/「Deleted video」 로 남는다.
        //   제목이 아니라 자리표시자라서 주제 집계를 오염시킨다. 버린다.
        if (/^(Private|Deleted) video$/i.test(it.snippet.title)) continue;
        if (h <= 48) out.push({ ch: c.t, cty: c.cty, h, title: it.snippet.title });
      }
    } catch (e) { /* 채널 하나 실패로 전체를 멈추지 않는다 */ }
  }
  return out.sort((a, b) => a.h - b.h);
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const [price, social, news, cal, macro, refs] = await Promise.all([
  priceLayer(), socialLayer(), newsLayer(), calendarLayer(), macroLayer(), refLayer(),
]);

const LINE = '='.repeat(74);
console.log(LINE);
console.log('  소재 스캔  ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
console.log(LINE);

if (price.err) console.log('\n⛔ 가격층 실패: ' + price.err);
else {
  console.log('\n■ 가격 — 전체 ' + price.universe.toLocaleString()
    + '종목 중 거래대금 3억달러+ ' + price.liquid + '종목');
  console.log('  ▼ 하락');
  for (const r of price.down.slice(0, 8))
    console.log('     ' + r.t.padEnd(7) + num(r.ch).padStart(7) + '%  $'
      + (r.turn / 1e9).toFixed(2) + 'B  기사 ' + coverageOf(news.heads, r.t) + '건');
  console.log('  ▲ 상승');
  for (const r of price.up.slice(0, 6))
    console.log('     ' + r.t.padEnd(7) + num(r.ch).padStart(7) + '%  $'
      + (r.turn / 1e9).toFixed(2) + 'B  기사 ' + coverageOf(news.heads, r.t) + '건');
  console.log('  ■ 돈이 몰린 곳');
  for (const r of price.money.slice(0, 8))
    console.log('     ' + r.t.padEnd(7) + '$' + (r.turn / 1e9).toFixed(2).padStart(6)
      + 'B  ' + num(r.ch).padStart(7) + '%');
}

console.log('\n■ 관심(개인) StockTwits ' + social.length + '종목 — 교체율 높음, 단독 근거 불가');
console.log('     ' + social.slice(0, 20).join(', '));

console.log('\n■ 관심(프로) 레퍼런스 채널 48시간 업로드 ' + refs.length + '편');
for (const r of refs.slice(0, 10))
  console.log('     ' + num(r.h, 1).padStart(5) + 'h [' + (r.ch || '').slice(0, 18).padEnd(18)
    + '] ' + r.title.slice(0, 44));

console.log('\n■ 지정학·매크로 주제 (건수 · 최신 · 국가분포)');
for (const [k, v] of Object.entries(news.themes).sort((a, b) => b[1].n - a[1].n))
  console.log('     ' + k.padEnd(18) + String(v.n).padStart(3) + '건  최신 '
    + num(v.freshH, 1).padStart(6) + 'h  ' + JSON.stringify(v.by)
    + (v.freshH > 72 ? '  ⛔죽은주제' : ''));

if (macro) {
  console.log('\n■ 매크로 레짐 — 국채 커브 (한 달 변화)');
  for (const k of ['month3', 'year2', 'year10', 'year30'])
    console.log('     ' + k.padEnd(8) + num(macro.now[k]) + '%  ('
      + (macro.mo[k] !== undefined ? num(macro.now[k] - macro.mo[k]) : '—') + '%p)');
  console.log('     장단기 기울기 변화 ' + num(macro.steepen) + '%p'
    + (macro.steepen > 0 ? '  — 장기만 오른다(베어 스티프닝)' : ''));
}

console.log('\n■ 이번 주 High 일정');
for (const c of cal.slice(0, 8))
  console.log('     ' + c.date.slice(0, 16) + '  ' + (c.event || '').slice(0, 50));

// ── 후보 조립 — 3칸 채점 ────────────────────────────────────────────────────
// ⛔ 「관심」이 비면 후보에 넣지 않는다. 가격만 움직인 건 «우리가 만든 이슈» 다.
const cands = [];
if (!price.err) {
  for (const r of [...price.down.slice(0, 8), ...price.up.slice(0, 6)]) {
    const cov = coverageOf(news.heads, r.t);
    const st = social.includes(r.t);
    const ref = refs.filter((x) => x.title.toUpperCase().includes(r.t)).length;
    if (!((st ? 1 : 0) + (ref > 0 ? 1 : 0) + (cov > 0 ? 1 : 0))) continue;  // 관심 0 → 폐기
    cands.push({
      ticker: r.t, changePct: +num(r.ch), turnoverB: +(r.turn / 1e9).toFixed(2),
      attention: { stocktwits: st, refUploads: ref, headlines: cov },
      cause: cov > 0 ? '헤드라인 있음 — 읽고 특정할 것' : '⛔ 미상 — 조사 전 대본 금지',
      status: cov > 0 ? '완성' : '조사필요',
    });
  }
}
cands.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

console.log('\n' + LINE);
console.log('  후보 — 관심칸이 찬 것만');
console.log(LINE);
for (const c of cands.slice(0, 10)) {
  const a = c.attention;
  console.log('  ' + c.ticker.padEnd(7) + num(c.changePct).padStart(7) + '%  $'
    + String(c.turnoverB).padStart(6) + 'B  [ST ' + (a.stocktwits ? '○' : '·')
    + ' 레퍼 ' + a.refUploads + ' 기사 ' + a.headlines + ']  ' + c.status);
}
if (!cands.length) console.log('  후보 없음 — 관심칸이 찬 종목이 하나도 없다');

writeFileSync('.agent/TODAY_HOOKS.json', JSON.stringify({
  scannedAt: new Date().toISOString(),
  candidates: cands, themes: news.themes, macro, calendar: cal.slice(0, 10),
  refUploads: refs.slice(0, 30), stocktwits: social,
  note: 'X 프로필 타임라인은 브라우저 전용 — 이 스캐너에 없다. SKILL.md 참조',
}, null, 1));
console.log('\n저장 → .agent/TODAY_HOOKS.json');
console.log('⚠ X(프로필 타임라인)는 여기 없다. 브라우저로 직접 볼 것 — SKILL.md 참조');
