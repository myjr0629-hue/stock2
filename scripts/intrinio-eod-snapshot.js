#!/usr/bin/env node
/**
 * Intrinio 벌크 EOD → ElastiCache 적재기  (EC2 전용)
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 존재하는가]
 *   2026-08-29 이관 검증 중 발견: `intrinioClient.loadBulkEod()` 는
 *   Redis 키 `intrinio:eod:snapshot` 을 **읽기만** 하고, 그 키를 채우는
 *   생산자가 **아예 없었다**. 키가 영원히 null → 아래가 전부 죽어 있었다.
 *
 *     · 가디언 Market Breadth   → advancers 0 / decliners 0 / 50% 고정
 *     · RLSI breadth 컴포넌트   → 전부 플레이스홀더 50 (코어 점수 오염)
 *     · gainers / losers        → 빈 배열
 *     · grouped daily (전종목)  → 빈 배열
 *     · 31종목 이상 다중 스냅샷 → 빈 배열
 *
 *   «읽는 쪽»만 만들고 «쓰는 쪽»을 안 만든 이관 누락이다.
 *
 * [왜 EC2 인가]
 *   · 벌크는 27개 ZIP(총 ~95MB) — Vercel 서버리스가 매 요청 처리 불가
 *   · Lambda 15분 제한·메모리 대비 EC2 가 여유롭고, ElastiCache 가 VPC 내부라 $0
 *   · INTRINIO_API_KEY 가 이미 /opt/signum-ws/.env 에 있다
 *
 * [저장 포맷]  단일 키 1개에 압축 저장 (Upstash 는 요청당 과금 → 호출 1회 고정)
 *   {
 *     date:     "2026-08-28",           // 최신 거래일
 *     prevDate: "2026-08-27",           // 직전 거래일
 *     rows:     [[ticker,o,h,l,c,v,chg,chgPct], ...],
 *     _ts:      1756...                  // 적재 시각(ms)
 *   }
 *   prevDate 의 종가는 rows 의 (c - chg) 로 복원한다 → 저장량 2배 없이 2세션 제공.
 *   ⚠️ movers 라우트가 «서로 다른 두 세션»을 요구하므로 prevDate 가 반드시 필요하다.
 *
 * 사용:  node scripts/intrinio-eod-snapshot.js [--dry]
 */

const fs = require("fs");
const zlib = require("zlib");
const https = require("https");
const http = require("http");
const { URL } = require("url");

// ── fetch 폴리필 ────────────────────────────────────────────────────
// EC2 기본 node 가 v16(fetch 없음)이고 nvm 에 v18 이 따로 있다.
// cron 에서 nvm PATH 에 기대면 조용히 깨지므로 버전 의존을 없앤다.
function httpRequest(url, { method = "GET", headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "http:" ? http : https;
        const req = lib.request(
            u,
            { method, headers, timeout: 120000 },
            (res) => {
                // 벌크 링크는 S3 로 리다이렉트된다
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
                        buffer: () => buf,
                        text: () => buf.toString("utf8"),
                        json: () => JSON.parse(buf.toString("utf8")),
                    });
                });
            }
        );
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
}

// ── 설정 ────────────────────────────────────────────────────────────
const ENV_PATH = process.env.ENV_PATH || "/opt/signum-ws/.env";
const PROXY = process.env.REDIS_PROXY_URL || "http://127.0.0.1:8081";
const PROXY_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";
const SNAPSHOT_KEY = "intrinio:eod:snapshot";
const TTL_SEC = 3 * 24 * 3600;          // 3일 — 적재가 며칠 실패해도 화면이 안 죽게
const INTRINIO_BASE = "https://api-v2.intrinio.com";
const DRY = process.argv.includes("--dry");

// ── .env 로드 (dotenv 의존 없이) ────────────────────────────────────
function loadEnv(p) {
    try {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) {
                process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
            }
        }
    } catch { /* 파일 없으면 환경변수만 사용 */ }
}
loadEnv(ENV_PATH);

const API_KEY = process.env.INTRINIO_API_KEY;
if (!API_KEY) {
    console.error("[EOD] INTRINIO_API_KEY 없음 — 중단");
    process.exit(1);
}

const log = (...a) => console.log(`[EOD ${new Date().toISOString()}]`, ...a);

// ── RFC 4180 CSV 한 줄 파서 ─────────────────────────────────────────
// ⚠️ 단순 split(",") 금지. 벌크 CSV 에 `"Argan, Inc."` 처럼 따옴표 안 쉼표가 있고,
//    2026-08-28 실측에서 120,000행 중 542행이 이것 때문에 컬럼이 밀렸다.
function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }   // 이스케이프된 따옴표
                else q = false;
            } else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
}

function headerIndex(headerLine) {
    const map = new Map();
    parseCsvLine(headerLine).forEach((h, i) => map.set(h.toUpperCase().trim(), i));
    return map;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── ZIP 단일 엔트리 해제 ────────────────────────────────────────────
function unzipSingleEntry(buf) {
    if (buf.readUInt32LE(0) !== 0x04034b50) return null;      // PK\x03\x04
    const method = buf.readUInt16LE(8);
    const nameLen = buf.readUInt16LE(26);
    const extraLen = buf.readUInt16LE(28);
    const start = 30 + nameLen + extraLen;

    // streaming 헤더는 compSize 가 0 일 수 있어 Central Directory 에서 회수
    let compSize = buf.readUInt32LE(18);
    if (!compSize) {
        const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        if (cd > 0) compSize = buf.readUInt32LE(cd + 20);
    }
    const body = compSize ? buf.subarray(start, start + compSize) : buf.subarray(start);
    if (method === 0) return body.toString("utf8");            // stored
    return zlib.inflateRawSync(body, { maxOutputLength: 512 * 1024 * 1024 }).toString("utf8");
}

// ── 벌크 CSV 파싱: 최신 2개 거래일 수집 ─────────────────────────────
function parseBulkCsv(csv, acc) {
    const nl = csv.indexOf("\n");
    if (nl < 0) return;
    const H = headerIndex(csv.slice(0, nl));
    const iT = H.get("TICKER"), iD = H.get("DATE"),
        iO = H.get("OPEN"), iH = H.get("HIGH"), iL = H.get("LOW"),
        iC = H.get("CLOSE"), iV = H.get("VOLUME"),
        iCh = H.get("CHANGE"), iPc = H.get("PERCENT_CHANGE");
    if (iT == null || iD == null || iC == null) return;
    const maxIx = Math.max(iT, iD, iO ?? 0, iH ?? 0, iL ?? 0, iC, iV ?? 0, iCh ?? 0, iPc ?? 0);

    let pos = nl + 1;
    while (pos < csv.length) {
        let end = csv.indexOf("\n", pos);
        if (end < 0) end = csv.length;
        const line = csv.slice(pos, end);
        pos = end + 1;
        if (line.length < 10) continue;

        const cols = parseCsvLine(line);
        if (cols.length <= maxIx) continue;
        const date = cols[iD];
        if (!ISO_DATE.test(date)) continue;                     // 밀린 행 방어
        const c = Number(cols[iC]);
        if (!Number.isFinite(c) || c <= 0) continue;
        const ticker = (cols[iT] || "").toUpperCase();
        if (!ticker) continue;

        let byDate = acc.get(date);
        if (!byDate) { byDate = new Map(); acc.set(date, byDate); }
        if (byDate.has(ticker)) continue;

        byDate.set(ticker, [
            ticker,
            Number(cols[iO]) || 0,
            Number(cols[iH]) || 0,
            Number(cols[iL]) || 0,
            c,
            Number(cols[iV]) || 0,
            Number(cols[iCh]) || 0,
            // Intrinio PERCENT_CHANGE 는 소수(0.0168 = 1.68%)
            Math.round((Number(cols[iPc]) || 0) * 100 * 10000) / 10000,
        ]);
    }
}

// ── 메인 ────────────────────────────────────────────────────────────
(async () => {
    const t0 = Date.now();

    log("bulk_downloads/links 조회…");
    const metaRes = await httpRequest(
        `${INTRINIO_BASE}/bulk_downloads/links?api_key=${encodeURIComponent(API_KEY)}`
    );
    if (!metaRes.ok) throw new Error(`bulk_downloads/links HTTP ${metaRes.status}`);
    const meta = metaRes.json();

    const item = (meta.bulk_downloads || []).find((b) =>
        String(b?.name || "").includes("Stock Prices")
    );
    if (!item) {
        log("사용 가능한 벌크:", (meta.bulk_downloads || []).map((b) => b.name).join(" | "));
        throw new Error("«Stock Prices» 벌크를 찾지 못함");
    }
    const links = item.links || [];
    log(`«${item.name}» — 파일 ${links.length}개`);

    // 날짜별 누적. 메모리 피크를 낮추려고 순차 처리.
    const acc = new Map();      // date → Map<ticker, row>
    let okFiles = 0;
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        try {
            const res = await httpRequest(link.url);
            if (!res.ok) { log(`  ✗ [${i + 1}/${links.length}] HTTP ${res.status}`); continue; }
            const buf = res.buffer();
            const csv = unzipSingleEntry(buf);
            if (!csv) { log(`  ✗ [${i + 1}/${links.length}] 압축 해제 실패`); continue; }
            parseBulkCsv(csv, acc);
            okFiles++;
            if ((i + 1) % 5 === 0 || i === links.length - 1) {
                log(`  … ${i + 1}/${links.length} (${okFiles} OK, 누적 날짜 ${acc.size}개)`);
            }
        } catch (e) {
            log(`  ✗ [${i + 1}/${links.length}] ${e.message}`);
        }
    }

    if (!acc.size) throw new Error("파싱된 행이 0 — 적재 중단");

    // 최신 2개 거래일 선택
    const dates = [...acc.keys()].sort().reverse();
    const date = dates[0];
    const prevDate = dates[1] || "";
    const rows = [...acc.get(date).values()];

    log(`최신 거래일 ${date} — ${rows.length}종목 / 직전 ${prevDate || "없음"}`);

    // ── 정합성 게이트 ────────────────────────────────────────────
    // 값이 «있다»가 아니라 «말이 되는가»를 본다. 깨진 값으로 덮어쓰면
    // 화면이 조용히 틀린 숫자를 보여준다(그게 가장 위험한 실패다).
    if (rows.length < 3000) {
        throw new Error(`종목 수 비정상 (${rows.length} < 3000) — 적재 중단`);
    }
    const up = rows.filter((r) => r[7] > 0.01).length;
    const down = rows.filter((r) => r[7] < -0.01).length;
    const withVol = rows.filter((r) => r[5] > 0).length;
    log(`검증: 상승 ${up} / 하락 ${down} / 거래량>0 ${withVol}`);
    if (up + down < rows.length * 0.3) {
        throw new Error(`등락 종목이 30% 미만 (${up + down}/${rows.length}) — chgPct 파싱 의심`);
    }
    if (withVol < rows.length * 0.5) {
        throw new Error(`거래량 있는 종목이 절반 미만 (${withVol}/${rows.length}) — 컬럼 밀림 의심`);
    }

    const payload = { date, prevDate, rows, _ts: Date.now() };
    const json = JSON.stringify(payload);
    log(`페이로드 ${(json.length / 1024 / 1024).toFixed(2)}MB`);

    if (DRY) {
        log("--dry 모드 — 적재하지 않고 종료");
        const sample = rows.slice(0, 3).map((r) => `${r[0]} c=${r[4]} chg%=${r[7]}`);
        log("샘플:", sample.join(" | "));
        return;
    }

    // ── ElastiCache 적재 ────────────────────────────────────────
    const setPayload = JSON.stringify({ key: SNAPSHOT_KEY, value: json, ttl: TTL_SEC });
    const setRes = await httpRequest(`${PROXY}/set`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${PROXY_KEY}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(setPayload),
        },
        body: setPayload,
    });
    const setBody = setRes.text();
    if (!setRes.ok) throw new Error(`Redis SET 실패 HTTP ${setRes.status}: ${setBody.slice(0, 200)}`);
    log(`적재 완료 → ${SNAPSHOT_KEY} (${setBody.trim()})`);

    // ── 되읽어 검증 ─────────────────────────────────────────────
    // 「썼다」가 아니라 「읽힌다」를 확인해야 한다.
    const back = await httpRequest(`${PROXY}/get?key=${encodeURIComponent(SNAPSHOT_KEY)}`, {
        headers: { Authorization: `Bearer ${PROXY_KEY}` },
    });
    const raw = back.json();
    const val = typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result;
    if (!val || val.date !== date || !Array.isArray(val.rows) || val.rows.length !== rows.length) {
        throw new Error(`되읽기 불일치: date=${val && val.date} rows=${val && val.rows && val.rows.length}`);
    }
    log(`되읽기 검증 OK — ${val.rows.length}종목, ${((Date.now() - t0) / 1000).toFixed(1)}초 소요`);
})().catch((e) => {
    console.error("[EOD] 실패:", e.message);
    process.exit(1);
});
