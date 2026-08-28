#!/usr/bin/env node
/**
 * 시간외(PRE/POST) 봉 기록기 — EC2 상주 서비스
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만들었나]
 *   Intrinio `securities/{t}/prices/intervals` 는 **정규장 분봉만** 준다.
 *   2026-08-29 실측: NVDA 8/28 → 390봉(09:30~15:59), PRE 0 / POST 0.
 *   `start_time`/`end_time`/`timezone` 파라미터를 붙여도 결과 동일.
 *   → Massive 는 시간외 분봉을 줬으므로 그대로 두면 **1D 차트의
 *      PRE/본장/POST 색 구분이 통째로 사라지는 기능 후퇴**가 된다.
 *
 * [핵심 아이디어]
 *   Intrinio 가 «과거» 시간외 봉을 안 줄 뿐, **현재값은 계속 준다.**
 *   그러면 우리가 직접 기록하면 된다.
 *   그리고 `securities/snapshots` CSV 는 **단 1콜로 전 13,000종목**의
 *   호가/누적거래량을 준다 → 종목당 호출이 아니라 **폴링 1회에 전 종목**.
 *
 * [측정한 제약]
 *   · 스냅샷 CSV 갱신 주기 ≈ 15분 (Last-Modified 로 확인)
 *     → 같은 파일을 여러 번 읽어도 새 봉을 만들지 않는다(타임스탬프로 중복 제거).
 *     → PRE 5.5h ≈ 22포인트, POST 4h ≈ 16포인트. 시간외 구간을 그리기엔 충분하다.
 *   · Startup 플랜 스냅샷은 체결이 아니라 **NBBO 호가**만 채운다
 *     → 미드를 쓰되 **스프레드 ≤1%** 인 종목만 (넓은 스프레드는 가격이 아니다)
 *
 * [저장]
 *   `intrinio:extbars:{YYYY-MM-DD}` 단일 키.
 *   전 종목을 담으면 수 MB 가 되므로 **달러거래량 상위 UNIVERSE_MAX 종목**만.
 *   포맷: { date, universe: n, bars: { TICKER: [[etMinute, o,h,l,c, v], ...] } }
 *
 * 사용:  node scripts/intrinio-ext-bars.js            (상주)
 *        node scripts/intrinio-ext-bars.js --once     (1회 폴링 후 종료, 테스트용)
 */

const fs = require("fs");
const zlib = require("zlib");
const https = require("https");
const http = require("http");
const { URL } = require("url");

// ── 설정 ────────────────────────────────────────────────────────────
const ENV_PATH = process.env.ENV_PATH || "/opt/signum-ws/.env";
const PROXY = process.env.REDIS_PROXY_URL || "http://127.0.0.1:8081";
const PROXY_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";
const EOD_KEY = "intrinio:eod:snapshot";
const BARS_KEY = (d) => `intrinio:extbars:${d}`;
const BARS_TTL = 3 * 24 * 3600;
const INTRINIO_BASE = "https://api-v2.intrinio.com";

const POLL_MS = 60_000;            // 1분마다 확인 (파일이 안 바뀌었으면 아무것도 안 한다)
const FLUSH_MS = 5 * 60_000;       // 5분마다 Redis 기록
const UNIVERSE_MAX = 600;          // 달러거래량 상위 N 종목만 기록
const MAX_SPREAD_PCT = 1;          // 미드를 가격으로 인정할 최대 스프레드
const ONCE = process.argv.includes("--once");

// ── fetch 폴리필 (EC2 기본 node 는 v16) ─────────────────────────────
function httpRequest(url, { method = "GET", headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "http:" ? http : https;
        const req = lib.request(u, { method, headers, timeout: 90000 }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                return resolve(httpRequest(new URL(res.headers.location, url).href, { method, headers, body }));
            }
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const buf = Buffer.concat(chunks);
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    headers: res.headers,
                    buffer: () => buf,
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

function loadEnv(p) {
    try {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
    } catch { }
}
loadEnv(ENV_PATH);
const API_KEY = process.env.INTRINIO_API_KEY;
if (!API_KEY) { console.error("[ExtBars] INTRINIO_API_KEY 없음"); process.exit(1); }

const log = (...a) => console.log(`[ExtBars ${new Date().toISOString()}]`, ...a);

// ── ET 시각 유틸 ────────────────────────────────────────────────────
function etNow() {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const p = (n) => String(n).padStart(2, "0");
    return {
        date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
        minute: d.getHours() * 60 + d.getMinutes(),
        dow: d.getDay(),
    };
}
/** PRE 04:00–09:30 / POST 16:00–20:00 에서만 기록한다 */
function extSession(et) {
    if (et.dow === 0 || et.dow === 6) return null;
    if (et.minute >= 240 && et.minute < 570) return "PRE";
    if (et.minute >= 960 && et.minute < 1200) return "POST";
    return null;
}

// ── CSV ─────────────────────────────────────────────────────────────
function parseCsvLine(line) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
}

// ── 상태 ────────────────────────────────────────────────────────────
/** ticker → { [etMinute]: [o,h,l,c,v] } */
let bars = new Map();
let barsDate = "";
let universe = null;              // Set<string> | null
let universeLoadedFor = "";
let lastFileStamp = "";           // 같은 스냅샷 파일을 두 번 세지 않기 위한 표식
let prevCumVol = new Map();       // ticker → 직전 누적거래량 (봉 거래량 = 증분)
let dirty = false;

/** EOD 스냅샷에서 달러거래량 상위 종목을 유니버스로 잡는다 */
async function loadUniverse(date) {
    if (universe && universeLoadedFor === date) return universe;
    try {
        const r = await httpRequest(`${PROXY}/get?key=${encodeURIComponent(EOD_KEY)}`, {
            headers: { Authorization: `Bearer ${PROXY_KEY}` },
        });
        const raw = r.json();
        const val = typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result;
        const rows = val?.rows || [];
        // row = [ticker,o,h,l,c,v,chg,chgPct]
        const ranked = rows
            .filter((x) => Array.isArray(x) && x[4] > 0 && x[5] > 0)
            .map((x) => [x[0], x[4] * x[5]])
            .sort((a, b) => b[1] - a[1])
            .slice(0, UNIVERSE_MAX)
            .map((x) => x[0]);
        // 지수 ETF 는 순위와 무관하게 항상 포함
        for (const t of ["SPY", "QQQ", "DIA", "IWM", "VXX", "TLT", "GLD"]) {
            if (!ranked.includes(t)) ranked.push(t);
        }
        universe = new Set(ranked);
        universeLoadedFor = date;
        log(`유니버스 ${universe.size}종목 (달러거래량 상위)`);
    } catch (e) {
        log("유니버스 로드 실패 — 이번 폴링은 전 종목 허용:", e.message);
        universe = null;
    }
    return universe;
}

// ── 폴링 1회 ────────────────────────────────────────────────────────
async function pollOnce() {
    const et = etNow();
    const sess = extSession(et);
    if (!sess && !ONCE) return;                 // 정규장/휴장에는 아무것도 안 한다

    if (barsDate !== et.date) {                 // 날짜가 바뀌면 초기화
        bars = new Map(); prevCumVol = new Map();
        barsDate = et.date; lastFileStamp = ""; dirty = false;
    }

    const meta = await httpRequest(`${INTRINIO_BASE}/securities/snapshots?api_key=${encodeURIComponent(API_KEY)}`);
    if (!meta.ok) { log(`snapshots 메타 HTTP ${meta.status}`); return; }
    const file = meta.json()?.snapshots?.[0]?.files?.[0];
    if (!file?.url) { log("스냅샷 파일 URL 없음"); return; }

    const res = await httpRequest(file.url);
    if (!res.ok) { log(`스냅샷 CSV HTTP ${res.status}`); return; }

    // ⚠️ 같은 파일을 다시 세면 없는 거래를 만들어낸다.
    //    CSV 는 약 15분마다 갱신되므로 Last-Modified 로 중복을 걸러야 한다.
    const stamp = res.headers["last-modified"] || res.headers["etag"] || "";
    if (stamp && stamp === lastFileStamp) return;
    lastFileStamp = stamp;

    let buf = res.buffer();
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    const lines = buf.toString("utf8").split("\n");
    if (lines.length < 2) return;

    const H = new Map();
    parseCsvLine(lines[0]).forEach((h, i) => H.set(h.toUpperCase(), i));
    const iS = H.get("SYMBOL"), iA = H.get("ASK PRICE"), iB = H.get("BID PRICE"),
        iV = H.get("TOTAL TRADE VOLUME"), iP = H.get("TRADE PRICE");
    if (iS == null) return;

    const uni = await loadUniverse(et.date);
    const minute = et.minute;
    let recorded = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const c = parseCsvLine(line);
        if (c.length <= iS) continue;
        const sym = (c[iS] || "").toUpperCase();
        if (!sym || (uni && !uni.has(sym))) continue;

        const trade = Number(c[iP]) || 0;
        const ask = iA != null ? Number(c[iA]) || 0 : 0;
        const bid = iB != null ? Number(c[iB]) || 0 : 0;
        const mid = ask > 0 && bid > 0 ? (ask + bid) / 2 : 0;
        // 넓은 스프레드의 미드는 가격이 아니다 (시간외 실측: >20% 가 5,002종목)
        const spread = mid > 0 ? ((ask - bid) / mid) * 100 : Infinity;
        const px = trade > 0 ? trade : (spread <= MAX_SPREAD_PCT ? mid : 0);
        if (!(px > 0)) continue;

        const cum = Number(c[iV]) || 0;
        const prev = prevCumVol.get(sym);
        const vol = prev != null && cum >= prev ? cum - prev : 0;
        prevCumVol.set(sym, cum);

        let series = bars.get(sym);
        if (!series) { series = new Map(); bars.set(sym, series); }
        const b = series.get(minute);
        if (b) {
            if (px > b[1]) b[1] = px;          // high
            if (px < b[2]) b[2] = px;          // low
            b[3] = px;                          // close
            b[4] += vol;
        } else {
            series.set(minute, [px, px, px, px, vol]);   // o,h,l,c,v
        }
        recorded++;
    }

    dirty = true;
    log(`${sess || "TEST"} ${et.date} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")} ET · ${recorded}종목 기록 (파일 ${stamp})`);
}

// ── Redis 기록 ──────────────────────────────────────────────────────
async function flush() {
    if (!dirty || !bars.size) return;
    const payload = { date: barsDate, universe: bars.size, bars: {}, _ts: Date.now() };
    for (const [sym, series] of bars) {
        payload.bars[sym] = [...series.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([m, b]) => [m, r4(b[0]), r4(b[1]), r4(b[2]), r4(b[3]), b[4]]);
    }
    const json = JSON.stringify(payload);
    const body = JSON.stringify({ key: BARS_KEY(barsDate), value: json, ttl: BARS_TTL });
    const res = await httpRequest(`${PROXY}/set`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${PROXY_KEY}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
        },
        body,
    });
    if (!res.ok) { log(`Redis SET 실패 HTTP ${res.status}`); return; }
    dirty = false;
    log(`기록 완료 → ${BARS_KEY(barsDate)} · ${bars.size}종목 · ${(json.length / 1024).toFixed(0)}KB`);
}
const r4 = (n) => Math.round(n * 10000) / 10000;

// ── 실행 ────────────────────────────────────────────────────────────
(async () => {
    log(`기동 · 유니버스 상한 ${UNIVERSE_MAX} · 폴링 ${POLL_MS / 1000}s · 기록 ${FLUSH_MS / 60000}m`);
    if (ONCE) { await pollOnce(); await flush(); return; }

    setInterval(() => pollOnce().catch((e) => log("폴링 실패:", e.message)), POLL_MS);
    setInterval(() => flush().catch((e) => log("기록 실패:", e.message)), FLUSH_MS);
    await pollOnce().catch((e) => log("폴링 실패:", e.message));
})();
