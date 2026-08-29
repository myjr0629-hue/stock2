#!/usr/bin/env node
/**
 * 다크풀 복원 가능성 판정기 — 개장 중에만 답이 나온다
 *
 * ══════════════════════════════════════════════════════════════════════
 * [배경]
 *   Massive 차단으로 다크풀 지표를 통째로 껐다(ENABLE_MASSIVE_TICKS 게이트).
 *   Intrinio 로 이관하며 다시 확인해 보니:
 *
 *   · REST `securities/{t}/prices/realtime` 에 `is_darkpool` 필드가 **있다**
 *   · 그런데 같은 응답이 이렇게 알려준다:
 *       "market_center, listing_venue, sales_conditions, and quote_conditions
 *        are only available with our delayed sip feed."
 *   · 현재 쓰는 EQUITIES_EDGE 피드 실측(2026-08-28 POST):
 *       MarketCenter=" " · Condition="" · IsDarkpool=false(전건) · Size=0
 *     → 필드는 있는데 **값이 안 온다**. 즉 그대로는 다크풀을 만들 수 없다.
 *   · 프로바이더별 auth 실측: **DELAYED_SIP 이 HTTP 200 (권한 있음)**
 *
 * [그래서 이 스크립트가 답할 질문]
 *   "DELAYED_SIP 피드에서는 MarketCenter / Condition / IsDarkpool / Size 가
 *    실제로 채워지는가?"
 *   → 채워지면 다크풀 지표를 되살릴 수 있다.
 *   → 안 채워지면 스타트업 플랜에서는 불가능이 확정된다.
 *
 *   ⚠️ **장이 열려 있어야만** 판정할 수 있다. 체결이 0건이면 «판정 불가»다.
 *      (권한이 있다는 것과 필드가 채워진다는 것은 다른 문제다)
 *
 * 사용:  node scripts/intrinio-darkpool-probe.js [초]
 * 결과:  /var/log/intrinio-darkpool-probe.log
 */

const fs = require("fs");

const ENV_PATH = process.env.ENV_PATH || "/opt/signum-ws/.env";
const SDK = process.env.INTRINIO_SDK || "/opt/signum-ws/node_modules/intrinio-realtime";
const SECONDS = Number(process.argv[2]) || 45;
const TICKERS = ["NVDA", "SPY", "TSLA", "AAPL", "QQQ", "MU", "AMD", "F", "BAC", "INTC", "PLTR", "AMZN"];
const PROVIDERS = ["DELAYED_SIP", "EQUITIES_EDGE"];

for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.INTRINIO_API_KEY;
if (!KEY) { console.error("INTRINIO_API_KEY 없음"); process.exit(1); }

const J = (v) => JSON.stringify(v, (k, x) => (typeof x === "bigint" ? x.toString() : x));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { RealtimeClient } = require(SDK);

function etNow() {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    return { s: d.toLocaleString("en-US"), min: d.getHours() * 60 + d.getMinutes(), dow: d.getDay() };
}

async function probe(provider) {
    const trades = [];
    // SDK 는 연결 로그를 stdout 으로 쏟아낸다 — 판정 결과만 남기려고 잠시 가린다
    const orig = console.log;
    console.log = () => { };
    let client;
    try {
        client = new RealtimeClient(KEY, (t) => { if (trades.length < 3000) trades.push(t); }, () => { }, { provider });
        client.join(TICKERS);
        await sleep(SECONDS * 1000);
    } catch (e) {
        console.log = orig;
        return { provider, error: e.message, trades: 0 };
    }
    console.log = orig;
    try { client?.leave?.(); client?.stop?.(); } catch { }

    const mc = new Map(), cond = new Map();
    let darkN = 0, darkVol = 0, totVol = 0, sized = 0;
    for (const t of trades) {
        const k = JSON.stringify(t.MarketCenter);
        mc.set(k, (mc.get(k) || 0) + 1);
        const c = JSON.stringify(t.Condition);
        cond.set(c, (cond.get(c) || 0) + 1);
        const sz = Number(t.Size) || 0;
        if (sz > 0) sized++;
        totVol += sz;
        if (t.IsDarkpool) { darkN++; darkVol += sz; }
    }
    return {
        provider,
        trades: trades.length,
        sized,
        totVol,
        darkN,
        darkVol,
        darkPct: totVol > 0 ? (darkVol / totVol) * 100 : null,
        marketCenters: [...mc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
        conditions: [...cond.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
        sample: trades[0] ? J(trades[0]) : null,
    };
}

(async () => {
    const et = etNow();
    const open = et.dow >= 1 && et.dow <= 5 && et.min >= 570 && et.min < 960;
    console.log("═".repeat(78));
    console.log(`  다크풀 필드 판정 · ET ${et.s} · 정규장 ${open ? "열림" : "닫힘"}`);
    console.log("═".repeat(78));
    if (!open) {
        console.log("  ⚠️ 정규장이 아니다 → 체결이 희박해 «판정 불가»가 나올 수 있다.");
    }

    const results = [];
    for (const p of PROVIDERS) {
        const r = await probe(p);
        results.push(r);
        console.log(`\n▌${p}`);
        if (r.error) { console.log(`  ✗ 연결 실패: ${r.error}`); continue; }
        console.log(`  체결 ${r.trades}건 · 사이즈>0 ${r.sized}건 · 거래량합 ${r.totVol}`);
        console.log(`  MarketCenter 분포: ${r.marketCenters.map(([k, n]) => `${k}×${n}`).join(" ") || "-"}`);
        console.log(`  Condition 분포   : ${r.conditions.map(([k, n]) => `${k}×${n}`).join(" ") || "-"}`);
        console.log(`  IsDarkpool true  : ${r.darkN}건 · 거래량비중 ${r.darkPct === null ? "판정불가" : r.darkPct.toFixed(2) + "%"}`);
        if (r.sample) console.log(`  샘플: ${r.sample}`);
    }

    // ── 판정 ────────────────────────────────────────────────────────
    console.log("\n" + "═".repeat(78));
    const sip = results.find((r) => r.provider === "DELAYED_SIP");
    if (!sip || sip.error || sip.trades === 0) {
        console.log("  판정: **불가** — 체결 표본이 없다. 정규장 시간에 다시 돌릴 것.");
    } else {
        const hasVenue = sip.marketCenters.some(([k]) => k && k !== '" "' && k !== '""' && k !== "null");
        const hasSize = sip.sized > 0;
        const hasDark = sip.darkN > 0;
        console.log(`  DELAYED_SIP 필드 충족도 — 거래소코드 ${hasVenue ? "✓" : "✗"} · 체결수량 ${hasSize ? "✓" : "✗"} · 다크풀플래그 ${hasDark ? "✓" : "✗"}`);
        if (hasVenue && hasSize) {
            console.log("  판정: **다크풀 복원 가능** → DELAYED_SIP 로 전환하고 다크풀 집계를 되살릴 것.");
            console.log("        (IsDarkpool 이 false 뿐이어도 MarketCenter 로 TRF/off-exchange 판별 가능)");
        } else {
            console.log("  판정: **스타트업 플랜에서는 불가** — 이 피드에서도 필드가 비어 있다.");
            console.log("        다크풀 지표는 계속 꺼둔 채로 두고, 상위 플랜 견적이 필요하면 그때 검토.");
        }
    }
    console.log("═".repeat(78));
    process.exit(0);
})();
