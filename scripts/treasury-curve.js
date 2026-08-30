#!/usr/bin/env node
/**
 * 미 재무부 «공식» 일별 국채 수익률 곡선 적재기 (EC2 크론).
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만들었나 — 화면마다 10년물이 달랐다]
 *   2026-08-30 실측:
 *     /api/live/treasury  → 4.67  (FRED DGS10, 8/27)   ← 하루 낡음
 *     /api/market/macro   → 4.72  (Yahoo ^TNX, 8/28)
 *
 *   어느 쪽이 맞나? 재무부 «원본»으로 확정했다:
 *     08/28/2026  2Y 4.34 · 10Y 4.73 · 30Y 5.22   ← 마지막 거래일
 *     08/27/2026  2Y 4.20 · 10Y 4.67 · 30Y 5.19
 *   → **4.72/4.73 이 맞고 4.67 은 하루 낡은 값이다.**
 *
 *   ★ 더 심각한 건 스프레드였다. 매크로 허브가 10Y 는 8/28(Yahoo), 2Y 는
 *     8/27(FRED)로 **날짜를 섞어** 2s10s 를 만들고 있었다:
 *       화면 0.52  vs  실제(8/28) 4.73−4.34 = **0.39**
 *     33% 틀린 값이 매크로 판단의 핵심 지표로 쓰이고 있었다.
 *
 * [왜 크론인가]
 *   재무부 CSV 는 응답이 **18~20초**다(실측 3회). 요청 시점에 부를 수 없다.
 *   하루 한 번(영업일 18:00 ET 이후) 갱신되므로 크론이 맞다.
 *
 * [왜 FRED 가 아니라 재무부인가]
 *   FRED DGS10 은 재무부 par yield 를 «받아» 게시하므로 한 단계 늦다.
 *   벤더(Massive·Intrinio) 둘 다 8/27 에서 멈춰 있었다 — 벤더 문제가 아니라
 *   FRED 파이프라인의 구조적 지연이다. 원본을 직접 받으면 그 지연이 사라진다.
 *
 * 사용:  node scripts/treasury-curve.js [--dry]
 * 크론:  10 23 * * 1-5   (18:10 ET · 재무부 게시 이후)
 */
const https = require("https");

const YEAR = new Date().getUTCFullYear();
// ⚠️ 이름을 `URL` 로 두면 전역 URL 클래스를 가려 new URL(...) 이 죽는다
//    (이 스크립트에서 실제로 당했다 — "URL is not a constructor")
const CSV_URL =
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/" +
    `daily-treasury-rates.csv/${YEAR}/all?type=daily_treasury_yield_curve` +
    `&field_tdr_date_value=${YEAR}&page&_format=csv`;

const PROXY = process.env.EC2_REDIS_PROXY_URL || "http://127.0.0.1:8081";
const PROXY_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";
const OUT_KEY = "treasury:curve";
const DRY = process.argv.includes("--dry");

const log = (m) => console.log(`[TCURVE ${new Date().toISOString()}] ${m}`);

function get(url, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { "User-Agent": "signum-hq/1.0" } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve(get(res.headers.location, timeoutMs));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });
        req.setTimeout(timeoutMs, () => { req.destroy(new Error("timeout")); });
        req.on("error", reject);
    });
}

function post(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const u = new URL(PROXY + path);
        const req = require("http").request(
            { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "POST",
              headers: { Authorization: `Bearer ${PROXY_KEY}`, "Content-Type": "application/json",
                         "Content-Length": Buffer.byteLength(data) } },
            (res) => { res.resume(); res.on("end", () => res.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`))); }
        );
        req.on("error", reject);
        req.write(data); req.end();
    });
}

/** "08/28/2026" → "2026-08-28" */
function iso(mdy) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(mdy || "").trim());
    return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
}

/** 재무부 컬럼명 → 우리 필드 (Massive `/fed/v1/treasury-yields` 와 같은 이름) */
const COLS = [
    ["1 Mo", "yield_1_month"],
    ["3 Mo", "yield_3_month"],
    ["6 Mo", "yield_6_month"],
    ["1 Yr", "yield_1_year"],
    ["2 Yr", "yield_2_year"],
    ["3 Yr", "yield_3_year"],
    ["5 Yr", "yield_5_year"],
    ["7 Yr", "yield_7_year"],
    ["10 Yr", "yield_10_year"],
    ["20 Yr", "yield_20_year"],
    ["30 Yr", "yield_30_year"],
];

/** 따옴표를 존중하는 최소 CSV 파서 (헤더에 `"1 Mo"` 처럼 따옴표가 있다) */
function parseCsv(text) {
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const cells = [];
        let cur = "", q = false;
        for (const ch of line) {
            if (ch === '"') { q = !q; continue; }
            if (ch === "," && !q) { cells.push(cur); cur = ""; continue; }
            cur += ch;
        }
        cells.push(cur);
        rows.push(cells.map((c) => c.trim()));
    }
    return rows;
}

(async () => {
    const csv = await get(CSV_URL);
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new Error("CSV 행이 없다");
    const header = rows[0];
    const idx = {};
    for (const [col, field] of COLS) {
        const i = header.indexOf(col);
        if (i >= 0) idx[field] = i;
    }
    if (idx.yield_10_year == null) throw new Error("10Yr 컬럼을 못 찾았다 — 포맷이 바뀌었다");

    const results = [];
    for (const r of rows.slice(1)) {
        const date = iso(r[header.indexOf("Date")]);
        if (!date) continue;
        const row = { date };
        for (const [, field] of COLS) {
            if (idx[field] == null) { row[field] = null; continue; }
            const v = Number(r[idx[field]]);
            row[field] = Number.isFinite(v) ? v : null;
        }
        // 10년물이 없는 날은 쓸모가 없다
        if (row.yield_10_year == null) continue;
        results.push(row);
    }
    results.sort((a, b) => (a.date < b.date ? 1 : -1));   // 최신순
    if (!results.length) throw new Error("파싱 결과가 비었다");

    const latest = results[0];
    log(`최신 ${latest.date} — 2Y ${latest.yield_2_year} · 10Y ${latest.yield_10_year} · 30Y ${latest.yield_30_year} · 2s10s ${(latest.yield_10_year - latest.yield_2_year).toFixed(2)}`);
    log(`총 ${results.length}거래일 (${results[results.length - 1].date} ~ ${latest.date})`);

    // 정합성 게이트 — 말도 안 되는 값을 적재하지 않는다
    if (!(latest.yield_10_year > 0 && latest.yield_10_year < 20)) {
        throw new Error(`10Y ${latest.yield_10_year} 가 상식 범위를 벗어난다`);
    }
    if (DRY) { log("--dry: 저장하지 않음"); return; }

    await post("/set", {
        key: OUT_KEY,
        value: JSON.stringify({ source: "US Treasury", date: latest.date, results: results.slice(0, 260), _ts: Date.now() }),
        ttl: 7 * 24 * 3600,     // 크론이 멎어도 일주일은 살아 있게. 나이 검사는 읽는 쪽에서
    });
    log(`저장 완료 → ${OUT_KEY}`);
})().catch((e) => { console.error(`[TCURVE] 실패: ${e.message}`); process.exit(1); });
