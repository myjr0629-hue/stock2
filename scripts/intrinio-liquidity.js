#!/usr/bin/env node
/**
 * 정규장 유동성 적재기 (EC2 · 하루 1회)
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜]  다크풀 자리를 «유동성 점수»로 대체했는데, 실시간 호가로 재면
 *       휴장 중에 전 종목이 나쁘게 나온다(실측 2026-08-29):
 *         정규장  NVDA 0.009% · AAPL 0.012% · GOOGL 0.011%
 *         휴장중  NVDA 0.064% · AAPL 0.150% · GOOGL 2.009%
 *       → 정규장 판독값을 따로 적재해 비정규장에 서빙한다.
 *
 * [왜 분봉 중앙값인가]  한 시점 호가는 그 순간의 우연에 흔들린다.
 *       정규장 390봉의 스프레드 **중앙값**이 «이 종목의 유동성 품질»의
 *       정본에 가깝다. Intrinio 분봉은 bid_close/ask_close 를 준다.
 *
 * [비용]  종목당 1콜. 유니버스는 EOD 달러거래량 상위 N 개로 제한한다.
 *         600종목 × 1콜 = 하루 600콜 (한도 2,000/분 대비 무시할 수준)
 *
 * 저장: `intrinio:liquidity:lastreg`
 *   { date, rows: { TICKER: { s: 점수, q: 스프레드%, n: 표본봉수 } } }
 *
 * 사용: node scripts/intrinio-liquidity.js [--dry] [--max N]
 */

const fs = require("fs");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const ENV_PATH = process.env.ENV_PATH || "/opt/signum-ws/.env";
const PROXY = process.env.REDIS_PROXY_URL || "http://127.0.0.1:8081";
const PROXY_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";
const EOD_KEY = "intrinio:eod:snapshot";
const LIQ_KEY = "intrinio:liquidity:lastreg";
const TTL_SEC = 5 * 24 * 3600;      // 5일 — 연휴에도 값이 남게
const BASE = "https://api-v2.intrinio.com";
const DRY = process.argv.includes("--dry");
const MAX = (() => { const i = process.argv.indexOf("--max"); return i > 0 ? Number(process.argv[i + 1]) : 600; })();
const CONCURRENCY = 6;

function loadEnv(p) {
    try {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
    } catch { }
}
loadEnv(ENV_PATH);
const KEY = process.env.INTRINIO_API_KEY;
if (!KEY) { console.error("[LIQ] INTRINIO_API_KEY 없음"); process.exit(1); }

const log = (...a) => console.log(`[LIQ ${new Date().toISOString()}]`, ...a);

function httpRequest(url, { method = "GET", headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "http:" ? http : https;
        const req = lib.request(u, { method, headers, timeout: 60000 }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const buf = Buffer.concat(chunks);
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    text: () => buf.toString("utf8"),
                    json: () => JSON.parse(buf.toString("utf8")),
                });
            });
        });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
}

/** 로그 스케일 정규화 — src/services/intrinioClient.ts 와 **같은 식**이어야 한다 */
function liquidityScore(spreadPct) {
    if (spreadPct == null || !Number.isFinite(spreadPct) || spreadPct <= 0) return null;
    const BEST = 0.001, WORST = 1.0;
    const c = Math.min(Math.max(spreadPct, BEST), WORST);
    const r = Math.log10(c / BEST) / Math.log10(WORST / BEST);
    return Math.round(Math.max(0, Math.min(100, 100 - r * 100)));
}

/** 마지막으로 완료된 정규장 거래일 (ET) */
function lastCompletedTradingDate() {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const past16 = et.getHours() * 100 + et.getMinutes() >= 1600;
    if (!past16) et.setDate(et.getDate() - 1);
    while (et.getDay() === 0 || et.getDay() === 6) et.setDate(et.getDate() - 1);
    const p = (n) => String(n).padStart(2, "0");
    return `${et.getFullYear()}-${p(et.getMonth() + 1)}-${p(et.getDate())}`;
}
const addDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

async function universe() {
    const r = await httpRequest(`${PROXY}/get?key=${encodeURIComponent(EOD_KEY)}`, {
        headers: { Authorization: `Bearer ${PROXY_KEY}` },
    });
    const raw = r.json();
    const val = typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result;
    const rows = (val && val.rows) || [];
    // row = [ticker,o,h,l,c,v,chg,chgPct] — 달러거래량 상위
    const ranked = rows
        .filter((x) => Array.isArray(x) && x[4] > 0 && x[5] > 0)
        .map((x) => [x[0], x[4] * x[5]])
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX)
        .map((x) => x[0]);
    for (const t of ["SPY", "QQQ", "DIA", "IWM"]) if (!ranked.includes(t)) ranked.push(t);
    return ranked;
}

async function measure(ticker, date) {
    const url = `${BASE}/securities/${encodeURIComponent(ticker)}/prices/intervals`
        + `?interval_size=1m&start_date=${date}&end_date=${addDay(date)}&page_size=1000`
        + `&api_key=${encodeURIComponent(KEY)}`;
    try {
        const r = await httpRequest(url);
        if (!r.ok) return null;
        const iv = r.json().intervals || [];
        const sp = [];
        for (const b of iv) {
            const bid = Number(b.bid_close), ask = Number(b.ask_close);
            if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
            const mid = (bid + ask) / 2;
            if (mid > 0) sp.push(((ask - bid) / mid) * 100);
        }
        // 표본이 너무 적으면 신뢰할 수 없다 — 억지로 값을 만들지 않는다
        if (sp.length < 60) return null;
        sp.sort((a, b) => a - b);
        const med = sp[Math.floor(sp.length / 2)];
        const score = liquidityScore(med);
        if (score == null) return null;
        return { s: score, q: Math.round(med * 10000) / 10000, n: sp.length };
    } catch {
        return null;
    }
}

(async () => {
    const t0 = Date.now();
    const date = lastCompletedTradingDate();
    const list = await universe();
    log(`대상 ${list.length}종목 · 기준 거래일 ${date} · 동시 ${CONCURRENCY}`);

    const rows = {};
    let done = 0, ok = 0;
    for (let i = 0; i < list.length; i += CONCURRENCY) {
        const batch = list.slice(i, i + CONCURRENCY);
        const res = await Promise.all(batch.map((t) => measure(t, date)));
        res.forEach((r, k) => { if (r) { rows[batch[k]] = r; ok++; } });
        done += batch.length;
        if (done % 120 === 0 || done >= list.length) log(`  … ${done}/${list.length} (성공 ${ok})`);
    }

    // ── 정합성 게이트 ───────────────────────────────────────────
    if (ok < Math.min(50, list.length * 0.2)) {
        throw new Error(`성공 종목이 너무 적다 (${ok}/${list.length}) — 적재 중단`);
    }
    const scores = Object.values(rows).map((r) => r.s).sort((a, b) => a - b);
    const med = scores[Math.floor(scores.length / 2)];
    log(`점수 분포 — 최저 ${scores[0]} · 중앙 ${med} · 최고 ${scores[scores.length - 1]}`);
    if (med <= 0 || med >= 100) throw new Error(`점수 중앙값 비정상 (${med}) — 적재 중단`);

    const payload = JSON.stringify({ date, rows, _ts: Date.now() });
    log(`페이로드 ${(payload.length / 1024).toFixed(0)}KB · ${ok}종목`);

    if (DRY) {
        const sample = Object.entries(rows).slice(0, 8).map(([t, r]) => `${t}:${r.s}(${r.q}%)`);
        log("--dry —", sample.join("  "));
        return;
    }

    const body = JSON.stringify({ key: LIQ_KEY, value: payload, ttl: TTL_SEC });
    const set = await httpRequest(`${PROXY}/set`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${PROXY_KEY}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
        },
        body,
    });
    if (!set.ok) throw new Error(`Redis SET 실패 HTTP ${set.status}`);

    // 되읽기 검증 — 「썼다」가 아니라 「읽힌다」
    const back = await httpRequest(`${PROXY}/get?key=${encodeURIComponent(LIQ_KEY)}`, {
        headers: { Authorization: `Bearer ${PROXY_KEY}` },
    });
    const raw = back.json();
    const val = typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result;
    const n = val && val.rows ? Object.keys(val.rows).length : 0;
    if (n !== ok) throw new Error(`되읽기 불일치 (${n} vs ${ok})`);
    log(`적재 완료 → ${LIQ_KEY} · ${n}종목 · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
})().catch((e) => {
    console.error("[LIQ] 실패:", e.message);
    process.exit(1);
});
