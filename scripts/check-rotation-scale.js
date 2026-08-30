#!/usr/bin/env node
/**
 * 섹터 로테이션 강도(RIS)의 «점수식»이 포화하는지 검사한다.
 *
 * 왜: 옛 식 `min(100, raw*8)` 은 raw 12.5 만 넘으면 100 이다. 2026-08-30
 *     실측 raw=15.75 → 항상 100. 만점에 붙은 지표는 아무 말도 하지 않는다.
 * 무엇: 섹터 ETF 30일 일봉으로 5거래일 창을 26개 만들고, 각 창의 raw 를
 *     계산해 ①옛 식이 며칠이나 100 인지 ②새 백분위가 실제로 퍼지는지 본다.
 */
const fs = require("fs");
const https = require("https");
// EC2 의 node 는 16 이라 전역 fetch 가 없다
const fetch = globalThis.fetch || ((url) => new Promise((res, rej) => {
  https.get(url, (r) => { let b = ""; r.on("data", c => b += c); r.on("end", () => res({ ok: r.statusCode === 200, json: async () => JSON.parse(b) })); }).on("error", rej);
}));
const ENV_PATH = process.env.ENV_PATH || "/opt/signum-ws/.env";
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.INTRINIO_API_KEY;
if (!KEY) { console.error("INTRINIO_API_KEY 없음"); process.exit(1); }

const SECTORS = ["XLK","XLC","XLY","XLE","XLF","XLV","XLI","XLB","XLP","XLRE","XLU"];
const WIN = 5, BARS = 30;

async function bars(t) {
  const u = `https://api-v2.intrinio.com/securities/${t}/prices?frequency=daily&page_size=${BARS + 10}&api_key=${KEY}`;
  const r = await fetch(u);
  if (!r.ok) return null;
  const d = await r.json();
  const rows = (d.stock_prices || []).slice(0, BARS).reverse(); // 최신순 → 오름차순
  if (rows.length < WIN + 1) return null;
  return { closes: rows.map(x => x.adj_close ?? x.close), volumes: rows.map(x => x.adj_volume ?? x.volume), dates: rows.map(x => x.date) };
}

function trend(series, end) {
  const s = Math.max(0, end - WIN + 1);
  const c = series.closes.slice(s, end + 1), v = series.volumes.slice(s, end + 1);
  const ch = []; for (let i = 1; i < c.length; i++) ch.push((c[i] - c[i-1]) / c[i-1] * 100);
  const cum = ch.reduce((a, b) => a + b, 0);
  const pos = ch.filter(x => x > 0).length, neg = ch.filter(x => x < 0).length;
  const consistency = ch.length ? Math.max(pos, neg) / ch.length : 0.5;
  const avgV = v.reduce((a, b) => a + b, 0) / v.length;
  const recV = v.length >= 2 ? (v[v.length-1] + v[v.length-2]) / 2 : v[v.length-1] || avgV;
  const rvol = avgV > 0 ? recV / avgV : 1;
  return cum * Math.min(rvol, 3) * consistency;
}

function spread(scores) {
  const st = [...scores].sort((a, b) => b - a);
  const inf = st.filter(x => x > 0).slice(0, 3);
  const out = st.filter(x => x < 0).sort((a, b) => a - b).slice(0, 3);
  return [...inf, ...out].reduce((s, v) => s + Math.abs(v), 0);
}

(async () => {
  const data = {};
  for (const t of SECTORS) { const b = await bars(t); if (b) data[t] = b; await new Promise(r => setTimeout(r, 120)); }
  const ids = Object.keys(data);
  console.log(`섹터 ${ids.length}/${SECTORS.length} · 바 ${Math.min(...ids.map(i => data[i].closes.length))}개`);
  if (ids.length < 8) { console.error("표본 부족"); process.exit(1); }

  const maxLen = Math.min(...ids.map(i => data[i].closes.length));
  const raws = [];
  for (let end = WIN - 1; end <= maxLen - 1; end++) {
    raws.push({ date: data[ids[0]].dates[end], raw: spread(ids.map(i => trend(data[i], end))) });
  }
  const todayRaw = raws[raws.length - 1].raw;
  const hist = raws.slice(0, -1).map(r => r.raw);

  const oldScores = raws.map(r => Math.min(100, r.raw * 8));
  const pinned = oldScores.filter(x => x >= 100).length;
  console.log(`\n[옛 식  min(100, raw*8)]  창 ${raws.length}개 중 **100 만점 = ${pinned}개 (${(pinned/raws.length*100).toFixed(0)}%)**`);
  console.log(`  raw 범위 ${Math.min(...raws.map(r=>r.raw)).toFixed(2)} ~ ${Math.max(...raws.map(r=>r.raw)).toFixed(2)} (100 도달선 = 12.5)`);

  const below = hist.filter(h => h <= todayRaw).length;
  console.log(`\n[새 식  자기이력 백분위]  오늘 raw=${todayRaw.toFixed(2)} · 과거창 ${hist.length}개`);
  console.log(`  → 점수 ${Math.round(below / hist.length * 100)}`);
  const dist = raws.map((r, i) => {
    const h = raws.filter((_, j) => j !== i).map(x => x.raw);
    return Math.round(h.filter(x => x <= r.raw).length / h.length * 100);
  });
  const pinnedNew = dist.filter(x => x >= 100).length;
  console.log(`  전 창에 적용 시 100 만점 = ${pinnedNew}개 (${(pinnedNew/dist.length*100).toFixed(0)}%) · 분포 ${Math.min(...dist)}~${Math.max(...dist)}`);
  console.log(`  최근 8창: ${raws.slice(-8).map((r,k)=>`${r.date.slice(5)}:${dist[dist.length-8+k]}`).join("  ")}`);
})();
