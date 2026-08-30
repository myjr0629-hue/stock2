#!/usr/bin/env node
/**
 * 오늘의 «다크풀 훅» — X 게시용 소재를 데이터에서 자동으로 뽑는다.
 *
 * 왜: 매일 「무엇을 올릴까」를 사람이 고민하면 지속이 안 된다. 데이터가
 *     스스로 «오늘 가장 이상한 것»을 내놓게 한다.
 *
 * 무엇을 찾나 (강한 순):
 *   ① 하락인데 장외 매집   주가↓ + 물량↑ + 공매도 평소이하  ← 가장 강한 훅
 *   ② 상승인데 장외 분산   주가↑ + 물량↑ + 공매도 평소이상
 *   ③ 물량 폭증           평소의 N배
 *   ④ 공매도 비중 이상     평소 대비 %p 이탈
 *
 * ⚠️ 예측 표현 금지. 「~할 것」「~로 향한다」류를 쓰지 않는다.
 *    사실만 과거/현재형으로. (BUFFER_OPS §0 rule 7)
 *
 * 실행: node scripts/ec2-ssm.js --file scripts/darkpool-hooks.js /opt/signum-ws/darkpool-hooks.js
 *       node scripts/ec2-ssm.js "cd /opt/signum-ws && node darkpool-hooks.js"
 */
const http = require("http");
const g = (k) => new Promise((r) => {
    http.get({ host: "127.0.0.1", port: 8081, path: "/get?key=" + encodeURIComponent(k),
        headers: { Authorization: "Bearer signum-redis-proxy-2026" } }, (x) => {
        let b = ""; x.on("data", (c) => (b += c));
        x.on("end", () => { try { const j = JSON.parse(b); r(typeof j.result === "string" ? JSON.parse(j.result) : j.result); } catch { r(null); } });
    }).on("error", () => r(null));
});

const MIN_DOLLAR_VOL = 200e6;   // 「아무도 모르는 잡주」를 올리면 신뢰를 잃는다

(async () => {
    const dp = await g("finra:offexchange"), snap = await g("intrinio:eod:snapshot");
    if (!dp?.tickers) { console.error("FINRA 데이터 없음"); process.exit(1); }
    const px = {};
    for (const r of (snap?.rows || [])) px[r[0]] = { c: r[4], chg: r[7], dv: (r[4] || 0) * (r[5] || 0) };

    const rows = Object.entries(dp.tickers)
        .map(([t, v]) => ({ t, ...v, ...(px[t] || {}) }))
        .filter((r) => r.dv > MIN_DOLLAR_VOL && r.volRatio != null && r.shortDev != null && r.chg != null);

    const out = { date: dp.date, marketAvg: dp.marketAvg, hooks: [] };

    const push = (kind, r, headline) => out.hooks.push({
        kind, ticker: r.t, headline,
        pct: r.pct, marketAvg: dp.marketAvg, volRatio: r.volRatio,
        shortPct: r.shortPct, shortAvg: r.shortAvg, shortDev: r.shortDev, chg: r.chg,
        url: `https://www.signumhq.com/en/flow/${r.t}`,
    });

    for (const r of rows.filter((r) => r.volRatio >= 1.6 && r.shortDev <= -3 && r.chg <= -2)
        .sort((a, b) => b.volRatio - a.volRatio).slice(0, 3))
        push("absorbed-the-drop", r,
            `$${r.t} closed ${r.chg}% — yet ${r.volRatio.toFixed(1)}x its usual size traded off the public book, and only ${r.shortPct}% of it printed short against a ${r.shortAvg}% norm.`);

    for (const r of rows.filter((r) => r.volRatio >= 1.5 && r.shortDev >= 8 && r.chg >= 1.5)
        .sort((a, b) => b.shortDev - a.shortDev).slice(0, 3))
        push("sold-the-rally", r,
            `$${r.t} closed +${r.chg}% — but ${r.shortPct}% of its off-exchange volume printed short, against a ${r.shortAvg}% norm.`);

    for (const r of [...rows].sort((a, b) => b.volRatio - a.volRatio).slice(0, 3))
        push("volume-surge", r,
            `$${r.t} traded ${r.volRatio.toFixed(1)}x its usual off-exchange size. ${r.pct}% of the day printed away from the public book (market average ${dp.marketAvg}%).`);

    for (const r of [...rows].sort((a, b) => Math.abs(b.shortDev) - Math.abs(a.shortDev)).slice(0, 3))
        push("short-anomaly", r,
            `$${r.t}: ${r.shortPct}% of off-exchange volume printed short, against a ${r.shortAvg}% norm — a ${r.shortDev > 0 ? "+" : ""}${r.shortDev}pp swing.`);

    // 중복 티커 제거(같은 종목을 여러 훅으로 올리면 도배로 보인다)
    const seen = new Set();
    out.hooks = out.hooks.filter((h) => (seen.has(h.ticker) ? false : (seen.add(h.ticker), true)));

    console.log(JSON.stringify(out, null, 1));
})();
