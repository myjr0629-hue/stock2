#!/usr/bin/env node
/**
 * FINRA 장외(다크풀) 거래량 적재 — 다크풀 «복원».
 *
 * ══════════════════════════════════════════════════════════════════════
 * 배경
 *   2026-08-28 벤더 권한 상실로 다크풀 지표가 죽었고, 코드는 그 자리를
 *   상수 42.5% 로 메우고 있었다. 「영구 상실」로 판단했지만 **틀렸다**.
 *   미국의 장외 체결은 법으로 FINRA TRF 에 보고되고, FINRA 가 그것을
 *   공개한다. 벤더가 팔던 것의 **원본**이다.
 *   (같은 교훈이 8-K·국채에서도 나왔다 — 원본을 먼저 찾을 것.)
 *
 * 라이선스 (반드시 지킬 것)
 *   출처: FINRA Query API `otcMarket/regShoDaily` (Specific Terms for
 *   Equity Data, 2022-12-20). §1.1 이 otcMarket 그룹 전체를 커버한다.
 *     §2.3 재배포 허용 — 단, (a) FINRA 를 소유자·출처로 «명시»,
 *          (b) 이 데이터에 «별도 요금»을 매기지 않음(유료 상품에
 *              끼워 주는 것은 명시적으로 허용, 추가 과금만 금지),
 *          (c) 최종 사용자의 재배포 금지를 약관에 명시,
 *          (d) 그 준수를 위한 합리적 노력.
 *     §2.4 파생 지표 생성 허용.
 *   ⚠️ cdn.finra.org 벌크 파일은 이 약관이 아니라 **웹사이트 이용약관**
 *      (비상업적 개인 용도) 적용이다. 반드시 이 API 를 쓸 것.
 *
 * 무엇을 만드나
 *   심볼별 장외 거래량 · 장외 공매도 거래량을 TRF 3곳 합산으로 모으고,
 *   우리 EOD 통합 거래량으로 나눠 «장외 비중 %» 를 만든다.
 *   실측(2026-08-28): SPY 34.6% · NVDA 45.2% · TSLA 47.4% · 평균 51.0%
 *
 * 사용법
 *   node finra-offexchange.js [--date=YYYY-MM-DD] [--dry]
 * ══════════════════════════════════════════════════════════════════════
 */
const https = require("https");
const http = require("http");
const fs = require("fs");

const ENV_PATH = process.env.ENV_PATH || "/opt/signum-ws/.env";
if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
}

const PROXY_HOST = process.env.REDIS_PROXY_HOST || "127.0.0.1";
const PROXY_PORT = +(process.env.REDIS_PROXY_PORT || 8081);
const PROXY_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";

const EOD_KEY = "intrinio:eod:snapshot";
const OUT_KEY = "finra:offexchange";
const HIST_KEY = "finra:offexchange:hist";
const TTL_SEC = 90 * 86400;

/** FINRA 규정: User-Agent 에 연락처를 넣는다 */
const UA = "SIGNUM HQ LLC (contact@signumhq.com)";
const API = "https://api.finra.org/data/group/otcMarket/name/regShoDaily";
/** API 가 limit 을 5,000 으로 자른다 — 요청값을 실제 상한에 맞춰야
 *  `body.length < PAGE` 종료 조건이 첫 페이지에서 오작동하지 않는다. */
const PAGE = 5000;

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const dateArg = (args.find((a) => a.startsWith("--date=")) || "").split("=")[1] || null;
const log = (m) => console.log(`[FINRA] ${m}`);

function post(url, body) {
    return new Promise((res, rej) => {
        const data = JSON.stringify(body);
        const u = new URL(url);
        const r = https.request(
            { hostname: u.hostname, path: u.pathname + u.search, method: "POST",
              headers: { "User-Agent": UA, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
            (x) => { let b = ""; x.on("data", (c) => (b += c)); x.on("end", () => res({ status: x.statusCode, headers: x.headers, body: b })); },
        );
        r.on("error", rej);
        r.write(data);
        r.end();
    });
}

function redis(path, method = "GET", body = null) {
    return new Promise((res, rej) => {
        const opts = { host: PROXY_HOST, port: PROXY_PORT, path, method,
            headers: { Authorization: `Bearer ${PROXY_KEY}` } };
        if (body) { opts.headers["Content-Type"] = "application/json"; opts.headers["Content-Length"] = Buffer.byteLength(body); }
        const r = http.request(opts, (x) => { let b = ""; x.on("data", (c) => (b += c)); x.on("end", () => res({ status: x.statusCode, body: b })); });
        r.on("error", rej);
        if (body) r.write(body);
        r.end();
    });
}

async function redisGet(key) {
    const r = await redis(`/get?key=${encodeURIComponent(key)}`);
    if (r.status !== 200) return null;
    try { const j = JSON.parse(r.body); return typeof j.result === "string" ? JSON.parse(j.result) : j.result; }
    catch { return null; }
}
async function redisSet(key, value, ttl) {
    const r = await redis("/set", "POST", JSON.stringify({ key, value, ttl }));
    if (r.status >= 300) throw new Error(`Redis SET 실패 HTTP ${r.status}`);
}

/** CSV 한 줄 → 필드 배열 (따옴표 처리) */
function splitCsv(line) {
    const out = [];
    let cur = "", q = false;
    for (const ch of line) {
        if (ch === '"') { q = !q; continue; }
        if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
        cur += ch;
    }
    out.push(cur);
    return out;
}

/** 가장 최근에 «데이터가 있는» 거래일을 찾는다 (주말·휴일 대응) */
async function resolveDate() {
    if (dateArg) return dateArg;
    const d = new Date();
    for (let i = 0; i < 8; i++) {
        const iso = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10);
        const r = await post(API, { limit: 1, compareFilters: [{ fieldName: "tradeReportDate", fieldValue: iso, compareType: "equal" }] });
        const total = +(r.headers["record-total"] || 0);
        if (r.status === 200 && total > 0) return iso;
    }
    return null;
}

(async () => {
    const date = await resolveDate();
    if (!date) { console.error("[FINRA] 최근 8일 내 데이터 없음"); process.exit(1); }

    // ── 1. 전량 수집 (TRF 3곳이 심볼당 최대 3행) ──────────────────────
    const off = {}; // sym -> { v: 장외거래량, s: 장외공매도 }
    let offset = 0, rows = 0, total = 0;
    while (true) {
        const r = await post(API, {
            limit: PAGE, offset,
            compareFilters: [{ fieldName: "tradeReportDate", fieldValue: date, compareType: "equal" }],
        });
        if (r.status !== 200) throw new Error(`FINRA API HTTP ${r.status}`);
        if (!total) total = +(r.headers["record-total"] || 0);

        const lines = r.body.split("\n").filter(Boolean);
        // 첫 페이지에만 헤더가 온다
        const body = lines[0] && lines[0].includes("tradeReportDate") ? lines.slice(1) : lines;
        if (body.length === 0) break;

        for (const line of body) {
            const f = splitCsv(line);
            if (f.length < 5) continue;
            const sym = f[1];
            const short = Number(f[2]);
            const tot = Number(f[4]);
            if (!sym || !Number.isFinite(tot)) continue;
            if (!off[sym]) off[sym] = { v: 0, s: 0 };
            off[sym].v += tot;
            off[sym].s += Number.isFinite(short) ? short : 0;
        }
        rows += body.length;
        offset += PAGE;
        if (rows >= total || body.length < PAGE) break;
    }
    log(`${date} · ${rows.toLocaleString()}행 → ${Object.keys(off).length.toLocaleString()}종목`);

    // ── 2. 통합 거래량으로 «장외 비중» 계산 ───────────────────────────
    const snap = await redisGet(EOD_KEY);
    const consolidated = {};
    for (const r of (snap?.rows || [])) consolidated[r[0]] = r[5];   // [t,o,h,l,c,v,...]

    const out = {};
    let matched = 0, sumPct = 0, dropped = 0;
    for (const [sym, d] of Object.entries(off)) {
        const cv = consolidated[sym];
        if (!cv || !(cv > 0) || !(d.v > 0)) continue;
        const pct = (d.v / cv) * 100;
        // ⚠️ 100% 초과는 심볼 대응이 어긋난 것(클래스 차이 등). 지어내지 말고 버린다.
        if (!(pct > 0) || pct > 100) { dropped++; continue; }
        out[sym] = {
            pct: Math.round(pct * 10) / 10,
            vol: Math.round(d.v),
            // 장외 체결 중 공매도 비중 — 벤더는 팔지 않던 덤
            shortPct: d.v > 0 ? Math.round((d.s / d.v) * 1000) / 10 : null,
        };
        matched++; sumPct += pct;
    }
    const marketAvg = matched ? Math.round((sumPct / matched) * 10) / 10 : null;
    log(`장외비중 ${matched.toLocaleString()}종목 · 평균 ${marketAvg}% · 제외 ${dropped}건(>100%)`);
    for (const t of ["SPY", "QQQ", "NVDA", "TSLA", "AAPL"]) {
        if (out[t]) log(`  ${t}: ${out[t].pct}% (공매도 ${out[t].shortPct}%)`);
    }

    if (DRY) { log("--dry · 저장 생략"); return; }
    if (matched < 1000) throw new Error(`매칭 ${matched}종목 — 너무 적어 저장하지 않는다`);

    await redisSet(OUT_KEY, JSON.stringify({
        date, source: "FINRA", tickers: out, marketAvg, covered: matched, _ts: Date.now(),
    }), TTL_SEC);

    // 시장 평균 이력 — «오늘이 평소보다 높은가»를 말하려면 기준이 있어야 한다
    const prev = await redisGet(HIST_KEY);
    const pts = (Array.isArray(prev?.points) ? prev.points : []).filter((p) => p && p.date !== date);
    pts.push({ date, avg: marketAvg, covered: matched });
    pts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    await redisSet(HIST_KEY, JSON.stringify({ points: pts.slice(-90) }), TTL_SEC);

    // 되읽기 검증 — 쓴 것이 실제로 읽히는지 확인하고 끝낸다
    const back = await redisGet(OUT_KEY);
    if (!back?.tickers || Object.keys(back.tickers).length < 1000) throw new Error("되읽기 검증 실패");
    log(`저장 완료 · 이력 ${pts.length}일 · 되읽기 ${Object.keys(back.tickers).length.toLocaleString()}종목`);
})().catch((e) => { console.error("[FINRA] 실패:", e.message); process.exit(1); });
