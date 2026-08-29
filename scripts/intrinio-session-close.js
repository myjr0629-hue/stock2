#!/usr/bin/env node
/**
 * 세션 종가 캡처기 (EC2 · 정규장 마감 직전 1회)
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 필요한가]  벤더 벌크 EOD 가 **T+1** 이다. 2026-08-29(토) 실측:
 *
 *     intrinio:eod:snapshot 최신 거래일 = 2026-08-27  ← 금요일 장이 통째로 없음
 *
 *   그러면 `currentEtTradingDate()`(=8/28)와 어긋나 EOD 가 전부 stale 이 되고,
 *   시간외에는 호가 스프레드 1% 게이트를 통과하는 종목이
 *   **13,064 중 1,212** 뿐이라 나머지는 스냅샷에서 탈락한다. 그 결과:
 *
 *     · Market Breadth  → 0↑ 0↓ · 50/50 (「완료 거래일 아님」으로 중립 반환)
 *     · 가디언 섹터 16개 중 **9개가 구성종목 0개** (에너지·금융·헬스케어…)
 *     · movers/차트가 하루 늦은 장을 「오늘」로 표시
 *
 *   즉 **금요일 마감부터 토요일 새벽까지 30시간 넘게** 시장 전체 지표가
 *   비어 있었다. 벤더 게시를 기다리지 말고 **우리가 종가를 직접 확보한다.**
 *
 * [왜 마감 «직전» 인가]  Startup 플랜의 `securities/snapshots` CSV 는
 *   TRADE PRICE 열이 비어 있고 NBBO 호가만 온다. 호가 미드는 **스프레드가
 *   좁을 때만** 가격의 대용이 된다. 스프레드는 정규장에 가장 좁으므로
 *   15:57 ET 에 찍으면 커버리지가 가장 높다. 마감 후에 찍으면 시간외
 *   호가라 대부분 종목이 게이트에서 탈락한다(위 1,212/13,064 가 그 증거).
 *
 * [정합성]  아래 중 하나라도 걸리면 **적재하지 않는다.** 나쁜 종가를 쓰느니
 *   기존 동작(벌크 T+1)이 낫다.
 *     · 유효 종목 3,000 미만
 *     · 거래일이 오늘(ET)이 아님
 *     · 되읽기 불일치
 *
 * 저장: `intrinio:eod:sessionclose`
 *   { date, rows: { SYM: [close, volume] }, _ts }
 *
 * 사용: node scripts/intrinio-session-close.js [--dry]
 * 크론: 57 19 * * 1-5   (15:57 ET · EDT 기준. EST 기간에는 20:57 UTC)
 */

const fs = require("fs");
const https = require("https");
const http = require("http");
const zlib = require("zlib");
const { URL } = require("url");

const ENV_PATH = process.env.ENV_PATH || "/opt/signum-ws/.env";
const PROXY = process.env.REDIS_PROXY_URL || "http://127.0.0.1:8081";
const PROXY_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";
const OUT_KEY = "intrinio:eod:sessionclose";
const TTL_SEC = 5 * 24 * 3600;             // 5일 — 연휴에도 값이 남게
const BASE = "https://api-v2.intrinio.com";
const DRY = process.argv.includes("--dry");

/** 미드를 가격으로 인정하는 스프레드 상한 — src/services/intrinioClient.ts 와 **같은 값**이어야 한다 */
const MAX_SPREAD_PCT = 1;
const MIN_ROWS = 3000;

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
if (!KEY) { console.error("[CLOSE] INTRINIO_API_KEY 없음"); process.exit(1); }

const log = (...a) => console.log(`[CLOSE ${new Date().toISOString()}]`, ...a);

function httpRequest(url, { method = "GET", headers = {}, body = null, raw = false } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "http:" ? http : https;
        const req = lib.request(u, { method, headers, timeout: 120000 }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const buf = Buffer.concat(chunks);
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    buf,
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

/** RFC 4180 — 따옴표 안의 콤마를 필드 구분자로 착각하면 열이 통째로 밀린다 */
function parseCsvLine(line) {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
            if (c === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
            } else cur += c;
        } else if (c === '"') q = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
    }
    out.push(cur);
    return out;
}

/** 오늘 ET 날짜 (평일 가정 — 크론이 1-5 로만 돈다) */
function etToday() {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const p = (n) => String(n).padStart(2, "0");
    return { date: `${et.getFullYear()}-${p(et.getMonth() + 1)}-${p(et.getDate())}`, hhmm: et.getHours() * 100 + et.getMinutes(), dow: et.getDay() };
}

(async () => {
    const t0 = Date.now();
    const { date, hhmm, dow } = etToday();

    if (dow === 0 || dow === 6) { log("주말 — 종료"); return; }
    // 정규장 안에서만 찍는다. 밖에서 찍으면 시간외 호가라 커버리지가 무너진다.
    if (hhmm < 1500 || hhmm > 1605) {
        log(`정규장 마감 구간(15:00~16:05 ET) 밖 — 현재 ${hhmm} · 종료`);
        return;
    }

    log("securities/snapshots 조회…");
    const meta = await httpRequest(`${BASE}/securities/snapshots?api_key=${encodeURIComponent(KEY)}`);
    if (!meta.ok) throw new Error(`snapshots 메타 HTTP ${meta.status}`);
    const file = meta.json()?.snapshots?.[0]?.files?.[0];
    if (!file?.url) throw new Error("스냅샷 파일 URL 없음");

    const dl = await httpRequest(file.url);
    if (!dl.ok) throw new Error(`스냅샷 다운로드 HTTP ${dl.status}`);
    const text = (dl.buf[0] === 0x1f && dl.buf[1] === 0x8b)
        ? zlib.gunzipSync(dl.buf).toString("utf8")
        : dl.buf.toString("utf8");

    const lines = text.split("\n");
    if (lines.length < 2) throw new Error("스냅샷이 비어 있다");

    const H = new Map(parseCsvLine(lines[0]).map((h, i) => [h.trim().toUpperCase(), i]));
    const iS = H.get("SYMBOL") ?? -1;
    const iP = H.get("TRADE PRICE") ?? -1;
    const iV = H.get("TOTAL TRADE VOLUME") ?? -1;
    const iA = H.get("ASK PRICE") ?? -1;
    const iB = H.get("BID PRICE") ?? -1;
    if (iS < 0) throw new Error("SYMBOL 열 없음");

    const rows = {};
    let seen = 0, byTrade = 0, byMid = 0, wideSpread = 0;
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const c = parseCsvLine(lines[i]);
        const sym = (c[iS] || "").trim().toUpperCase();
        if (!sym) continue;
        seen++;

        const trade = iP >= 0 ? Number(c[iP]) || 0 : 0;
        const ask = iA >= 0 ? Number(c[iA]) || 0 : 0;
        const bid = iB >= 0 ? Number(c[iB]) || 0 : 0;
        const vol = iV >= 0 ? Number(c[iV]) || 0 : 0;

        let px = 0;
        if (trade > 0) { px = trade; byTrade++; }
        else if (ask > 0 && bid > 0 && ask >= bid) {
            const mid = (ask + bid) / 2;
            const sp = ((ask - bid) / mid) * 100;
            // 넓은 스프레드의 미드는 가격이 아니다 — 실측 EBMT 22.56/43.95 → 미드 33.25 는 무의미
            if (sp <= MAX_SPREAD_PCT) { px = mid; byMid++; } else wideSpread++;
        }
        if (px > 0) rows[sym] = [Math.round(px * 10000) / 10000, vol];
    }

    const n = Object.keys(rows).length;
    log(`대상 ${seen}행 → 유효 ${n}종목 (체결가 ${byTrade} · 미드 ${byMid} · 스프레드초과 탈락 ${wideSpread})`);

    // ── 정합성 게이트 ─────────────────────────────────────────
    if (n < MIN_ROWS) {
        throw new Error(`유효 종목이 너무 적다 (${n} < ${MIN_ROWS}) — 적재 중단. 나쁜 종가보다 기존 벌크가 낫다`);
    }

    const payload = JSON.stringify({ date, rows, _ts: Date.now() });
    log(`거래일 ${date} · 페이로드 ${(payload.length / 1024 / 1024).toFixed(2)}MB`);

    if (DRY) {
        const s = Object.entries(rows).filter(([k]) => ["NVDA", "AAPL", "XOM", "JPM", "UNH"].includes(k));
        log("--dry —", s.map(([k, v]) => `${k}:${v[0]}`).join("  "));
        return;
    }

    const body = JSON.stringify({ key: OUT_KEY, value: payload, ttl: TTL_SEC });
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
    const back = await httpRequest(`${PROXY}/get?key=${encodeURIComponent(OUT_KEY)}`, {
        headers: { Authorization: `Bearer ${PROXY_KEY}` },
    });
    const raw = back.json();
    const val = typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result;
    const got = val && val.rows ? Object.keys(val.rows).length : 0;
    if (got !== n) throw new Error(`되읽기 불일치 (${got} vs ${n})`);

    log(`적재 완료 → ${OUT_KEY} · ${got}종목 · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
})().catch((e) => {
    console.error("[CLOSE] 실패:", e.message);
    process.exit(1);
});
