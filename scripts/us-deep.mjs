#!/usr/bin/env node
// ============================================================================
// us-deep — 미국 주식시장 + 경제 «전체»를 한 번에 깊게 판다
// ----------------------------------------------------------------------------
// 대표 지시 2026-08-21:
//   "한번할때 완벽하게 파고들어서 주제소재를 찾아내 원하는것을 줘야지
//    (…) 시장전체 미국주식시장 그런것을 깊게 봐야지"
//
// ⛔ 이전 스캔의 문제: 질의가 좁았고(12 → 59), 소재가 한쪽으로 쏠렸다.
//   여기서는 ① 질의 120개 ② 질의당 20편 ③ «테마 단위»로 판정한다.
//
// 질의마다 재는 것
//   수요      상위 쇼츠 조회 중앙
//   여지      상위권 중 구독 10만 미만 채널 비중
//   소형중앙  그 소형 채널들이 «실제로 받은» 조회 중앙  ← 우리가 기대할 수 있는 값
//   소형최고  소형 채널의 천장
//
// ⛔ 점수는 «소형중앙» 기준이다. 수요가 커도 소형이 못 받으면 우리에겐 0이다.
//   점수 = log10(소형중앙+1) × (0.4 + 0.6 × 여지)
//
// 결과는 질의마다 즉시 저장한다 — 중단돼도 이어서 돌린다.
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

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

// ── 테마 × 질의 — 미국 시장과 경제를 빠짐없이 깐다 ──────────────────────────
const T = {
  "지수·시장전체": ["stock market explained", "sp500 explained", "nasdaq explained", "dow jones explained",
    "stock market crash coming", "market correction explained", "bull market vs bear market", "all time high stocks"],
  "옵션·파생": ["options trading explained", "call and put explained", "options expiration explained",
    "implied volatility explained", "gamma squeeze explained", "covered call explained", "zero dte options"],
  "시장구조·플로우": ["market makers explained", "dark pool trading", "payment for order flow",
    "short selling explained", "short squeeze explained", "high frequency trading explained",
    "stock buyback explained", "insider trading explained", "institutional investors explained"],
  "기술적분석": ["technical analysis explained", "support and resistance explained", "moving average explained",
    "rsi indicator explained", "candlestick patterns explained", "trading volume explained"],
  "AI·기술주": ["is the ai bubble popping", "ai stocks explained", "nvidia stock explained",
    "data center stocks", "will ai take my job", "ai capex explained"],
  "메가캡": ["tesla stock explained", "apple stock explained", "amazon stock explained",
    "microsoft stock explained", "meta stock explained", "palantir stock explained", "magnificent seven stocks"],
  "섹터": ["semiconductor stocks explained", "bank stocks explained", "energy stocks explained",
    "healthcare stocks explained", "defense stocks explained", "utility stocks explained", "reit explained"],
  "실적·기업": ["earnings report explained", "how to read an earnings report", "pe ratio explained",
    "stock split explained", "dividend investing explained", "ipo explained", "free cash flow explained"],
  "연준·금리": ["federal reserve explained", "interest rates explained", "what happens if the fed cuts rates",
    "quantitative tightening explained", "fed balance sheet explained", "fomc explained"],
  "채권·크레딧": ["bond yields explained", "yield curve inversion", "treasury bonds explained",
    "corporate debt crisis", "private credit explained", "credit spreads explained"],
  "인플레·지표": ["inflation explained", "cpi report explained", "ppi explained", "pce inflation explained",
    "gdp explained simply", "jobs report explained", "consumer confidence explained", "retail sales explained"],
  "고용·노동": ["why companies are laying off", "job market is bad", "hiring freeze explained",
    "wage growth explained", "gig economy explained"],
  "부동산·주거": ["mortgage rates explained", "housing market crash", "why are houses so expensive",
    "home prices falling", "rent vs buy explained", "commercial real estate crisis"],
  "소비자·부채": ["cost of living crisis", "credit card debt crisis", "student loan explained",
    "auto loan delinquency", "buy now pay later risk"],
  "정책·지정학": ["tariffs explained", "trade war explained", "national debt explained",
    "government shutdown economy", "china economy explained", "economic sanctions explained"],
  "통화·원자재": ["why is the dollar falling", "de dollarization explained", "oil prices explained",
    "commodities explained", "copper price explained"],
  "암호화폐": ["bitcoin explained simply", "crypto etf explained", "stablecoin explained"],
  "개인재무": ["index funds explained", "etf vs mutual fund", "how to start investing", "401k explained",
    "roth ira explained", "compound interest explained", "how much do i need to retire",
    "is my money safe in the bank", "emergency fund explained"],
  "불평등·사회": ["wealth gap explained", "why is everything so expensive", "middle class shrinking",
    "billionaires pay no tax", "housing affordability crisis"],
  "리스크·역사": ["2008 financial crisis explained", "dot com bubble explained", "bank run explained",
    "recession indicators", "are we in a recession", "stagflation explained"],
};

const search = (q, n = 20) => {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D`;
  const r = spawnSync("yt-dlp", [url, "--flat-playlist", "--dump-json", "--playlist-end", String(n),
    "--no-warnings", "--socket-timeout", "20"], { encoding: "utf8", maxBuffer: 1 << 28, timeout: 180000 });
  return (r.stdout || "").split("\n").filter((l) => l.trim().startsWith("{"))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter((d) => typeof d.view_count === "number" && d.id);
};
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const OUT = ".agent/MARKET_WANTS_US_DEEP.json";
const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { measuredAt: "2026-08-21", rows: [] };
const seen = new Set(done.rows.map((r) => r.q));

for (const [theme, qs] of Object.entries(T)) {
  for (const q of qs) {
    if (seen.has(q)) continue;
    const v = search(q);
    if (!v.length) { console.log(`  x ${q}`); seen.add(q); continue; }
    const ids = [...new Set(v.map((x) => x.channel_id).filter(Boolean))];
    const subs = {};
    for (let i = 0; i < ids.length; i += 50) {
      const j = await (await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids.slice(i, i + 50).join(",")}`,
        { headers: { Authorization: `Bearer ${tok}` } })).json();
      for (const it of (j.items || [])) subs[it.id] = +it.statistics.subscriberCount || 0;
    }
    const known = v.filter((x) => subs[x.channel_id] !== undefined);
    const small = known.filter((x) => subs[x.channel_id] < 100000);
    const sv = small.map((x) => x.view_count);
    const demand = med(v.map((x) => x.view_count));
    const room = known.length ? small.length / known.length : 0;
    const smallMed = med(sv);
    const top = v.slice().sort((a, b) => b.view_count - a.view_count)[0];
    const row = {
      theme, q, demand, n: v.length, room: +(room * 100).toFixed(0),
      smallN: small.length, smallMed, smallMax: sv.length ? Math.max(...sv) : 0,
      score: +(Math.log10(smallMed + 1) * (0.4 + 0.6 * room)).toFixed(2),
      topT: top && top.title ? top.title.slice(0, 50) : null,
      topV: top ? top.view_count : null,
      topSec: top && top.duration ? Math.round(top.duration) : null,
    };
    done.rows.push(row); seen.add(q);
    writeFileSync(OUT, JSON.stringify(done, null, 1));
    console.log(`  ${theme.padEnd(9)} ${String(demand).padStart(8)} room${String(row.room).padStart(3)}% small${String(smallMed).padStart(8)}  ${q}`);
  }
}
console.log(`\n  done ${done.rows.length} queries -> ${OUT}`);
