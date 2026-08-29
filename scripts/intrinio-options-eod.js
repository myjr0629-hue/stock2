#!/usr/bin/env node
/**
 * 옵션 EOD 수집기 — 계약별 미결제약정·거래량·그릭스 (EC2 · 하루 1회)
 *
 * ══════════════════════════════════════════════════════════════════════
 * [무엇을 얻는가]  벤더 벌크 「Intrinio Options EOD」 한 파일에 이게 다 있다:
 *
 *   CONTRACT · SYMBOL · EXPIRATION · STRIKE · TYPE · DATE
 *   CLOSE · VOLUME · **OPEN_INTEREST** · MARK
 *   IMPLIED_VOLATILITY · **DELTA · GAMMA · THETA · VEGA**
 *   IV_RANK · IV_PERCENTILE
 *
 *   날짜별 파일 1,391개 (2021-09-27 ~ 어제). 주식 벌크와 달리 **T+1 지연이 없다.**
 *
 * [왜 이게 중요한가]  지금 「이상 옵션 활동」은 거래량만 본다.
 *   그런데 거래량은 **신규 진입인지 청산인지 구분을 못 한다.**
 *
 *     거래량 급증 + 미결제약정 **증가**  → 새 포지션이 생겼다   ← 진짜 신호
 *     거래량 급증 + 미결제약정 **감소**  → 있던 포지션 정리     ← 노이즈
 *     거래량 급증 + 미결제약정 그대로    → 당일 사고팜          ← 노이즈
 *
 *   미결제약정 «증감»이 있어야 셋을 가른다. 그게 이 수집기의 존재 이유다.
 *   덤으로 계약별 GAMMA 가 오므로 GEX 를 근사가 아니라 **벤더 그릭스로** 계산할 수 있다.
 *
 * [제약 — 반드시 지킬 것]
 *   EC2 는 RAM 1.9GB · 디스크 365MB 뿐이다. 실제로 이 파일(98MB 압축)을
 *   그냥 풀다가 **디스크가 100% 차서 서버가 먹통이 됐다**(2026-08-30).
 *   그래서:
 *     · 디스크에 **아무것도 쓰지 않는다** — HTTP 스트림을 그대로 inflate 해서 흘려 읽는다
 *     · 유니버스(상위 N종목) 밖은 파싱 즉시 버린다
 *     · 종목당 상위 계약만 남긴다 (전 계약을 들고 있지 않는다)
 *     · 미결제약정 맵도 유니버스 한정
 *
 * 저장
 *   intrinio:options:eod       종목별 집계 + 상위 계약 (화면·API 소비용)
 *   intrinio:options:oi        계약별 미결제약정 (내일 증감 계산용 · 압축 저장)
 *
 * 사용: node scripts/intrinio-options-eod.js [--dry] [--max N] [--date YYYY-MM-DD]
 * 크론: 30 8 * * 2-6   (03:30 ET 게시 후 · UTC 08:30)
 */

const fs = require("fs");
const https = require("https");
const http = require("http");
const zlib = require("zlib");
const readline = require("readline");
const { URL } = require("url");

const ENV_PATH = process.env.ENV_PATH || "/opt/signum-ws/.env";
const PROXY = process.env.REDIS_PROXY_URL || "http://127.0.0.1:8081";
const PROXY_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";
const BASE = "https://api-v2.intrinio.com";

const EOD_KEY = "intrinio:eod:snapshot";        // 유니버스 순위 재료
const OUT_KEY = "intrinio:options:eod";
const OI_KEY = "intrinio:options:oi";
const TTL_SEC = 5 * 24 * 3600;

const DRY = process.argv.includes("--dry");
const MAX_TICKERS = (() => { const i = process.argv.indexOf("--max"); return i > 0 ? Number(process.argv[i + 1]) : 400; })();
const WANT_DATE = (() => { const i = process.argv.indexOf("--date"); return i > 0 ? process.argv[i + 1] : null; })();

/** 종목당 남길 «주목할 계약» 수 — 메모리 상한의 핵심 */
const TOP_PER_TICKER = 12;
/** 이 미만은 미결제약정 맵에 넣지 않는다 (잡음 + 메모리) */
const MIN_OI_TRACK = 50;

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
if (!KEY) { console.error("[OPT] INTRINIO_API_KEY 없음"); process.exit(1); }

const log = (...a) => console.log(`[OPT ${new Date().toISOString()}]`, ...a);
const mb = () => Math.round(process.memoryUsage().rss / 1048576);

function httpRequest(url, { method = "GET", headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "http:" ? http : https;
        const req = lib.request(u, { method, headers, timeout: 120000 }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const buf = Buffer.concat(chunks);
                resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, buf, json: () => JSON.parse(buf.toString("utf8")) });
            });
        });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
}

/** 리다이렉트를 따라가며 **스트림** 을 연다 (본문을 메모리에 모으지 않는다) */
function openStream(url, depth = 0) {
    return new Promise((resolve, reject) => {
        if (depth > 5) return reject(new Error("리다이렉트 과다"));
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.destroy();
                return openStream(res.headers.location, depth + 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) { res.destroy(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            resolve(res);
        }).on("error", reject);
    });
}

/**
 * ZIP 스트림 → 평문 스트림.
 * 중앙 디렉터리는 파일 «끝»에 있어 스트리밍으로 못 읽는다. 대신 첫 로컬 헤더만
 * 파싱해 건너뛰고 inflateRaw 로 흘린다. (이 벌크는 항목이 하나다)
 */
function unzipStream(res) {
    const inflate = zlib.createInflateRaw();
    let head = Buffer.alloc(0);
    let started = false;
    res.on("data", (chunk) => {
        if (started) { inflate.write(chunk); return; }
        head = Buffer.concat([head, chunk]);
        if (head.length < 30) return;
        if (head.readUInt32LE(0) !== 0x04034b50) { inflate.destroy(new Error("ZIP 시그니처 아님")); return; }
        if (head.readUInt16LE(8) !== 8) { inflate.destroy(new Error("deflate 아님")); return; }
        const start = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
        if (head.length < start) return;
        started = true;
        inflate.write(head.slice(start));
        head = null;
    });
    res.on("end", () => { if (started) inflate.end(); });
    res.on("error", (e) => inflate.destroy(e));
    return inflate;
}

async function redisGet(key) {
    const r = await httpRequest(`${PROXY}/get?key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${PROXY_KEY}` } });
    if (!r.ok) return null;
    try {
        const raw = r.json();
        return typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result;
    } catch { return null; }
}

async function redisSet(key, value, ttl) {
    const body = JSON.stringify({ key, value, ttl });
    const r = await httpRequest(`${PROXY}/set`, {
        method: "POST",
        headers: { Authorization: `Bearer ${PROXY_KEY}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        body,
    });
    if (!r.ok) throw new Error(`Redis SET 실패 HTTP ${r.status}`);
}

/** 달러거래량 상위 N — 전 종목을 들고 있으면 메모리가 감당이 안 된다 */
async function universe() {
    const val = await redisGet(EOD_KEY);
    const rows = (val && val.rows) || [];
    const ranked = rows
        .filter((x) => Array.isArray(x) && x[4] > 0 && x[5] > 0)
        .map((x) => [x[0], x[4] * x[5]])
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TICKERS)
        .map((x) => x[0]);
    for (const t of ["SPY", "QQQ", "IWM", "DIA"]) if (!ranked.includes(t)) ranked.push(t);
    return new Set(ranked);
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

(async () => {
    const t0 = Date.now();

    const meta = await httpRequest(`${BASE}/bulk_downloads/links?api_key=${encodeURIComponent(KEY)}`);
    if (!meta.ok) throw new Error(`bulk_downloads/links HTTP ${meta.status}`);
    const item = (meta.json().bulk_downloads || []).find((b) => /Options EOD/i.test(b.name || ""));
    if (!item) throw new Error("«Options EOD» 벌크를 찾지 못함");

    const dateOf = (n) => { const m = String(n).match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ""; };
    const dated = (item.links || [])
        .filter((l) => /^options_prices_eod_/.test(l.name || ""))
        .sort((a, b) => dateOf(a.name).localeCompare(dateOf(b.name)));
    const pick = WANT_DATE ? dated.find((l) => dateOf(l.name) === WANT_DATE) : dated[dated.length - 1];
    if (!pick) throw new Error(`대상 파일 없음 (${WANT_DATE || "최신"})`);
    const fileDate = dateOf(pick.name);

    const uni = await universe();
    const prevOi = (await redisGet(OI_KEY)) || { date: "", oi: {} };
    log(`대상 ${pick.name} · 유니버스 ${uni.size}종목 · 직전 미결제약정 ${Object.keys(prevOi.oi || {}).length}건 (${prevOi.date || "없음"})`);

    // ── 스트리밍 파싱 ────────────────────────────────────────────
    const agg = new Map();     // ticker → 집계
    const oiOut = {};          // contract → oi (내일 증감용)
    let seen = 0, kept = 0, headerIdx = null;

    const res = await openStream(pick.url);
    const rl = readline.createInterface({ input: unzipStream(res), crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line) continue;
        if (headerIdx === null) {
            const h = line.split(",").map((s) => s.trim().toUpperCase());
            headerIdx = Object.fromEntries(h.map((k, i) => [k, i]));
            for (const need of ["SYMBOL", "CONTRACT", "OPEN_INTEREST", "VOLUME", "GAMMA", "STRIKE", "TYPE", "EXPIRATION"]) {
                if (headerIdx[need] === undefined) throw new Error(`열 누락: ${need}`);
            }
            continue;
        }
        seen++;
        // 심볼만 먼저 잘라 유니버스 밖이면 즉시 버린다 (전체 split 비용 회피)
        const c1 = line.indexOf(",");
        const c2 = line.indexOf(",", c1 + 1);
        if (c1 < 0 || c2 < 0) continue;
        const sym = line.slice(c1 + 1, c2);
        if (!uni.has(sym)) continue;

        const f = line.split(",");
        const contract = f[headerIdx.CONTRACT];
        const oi = num(f[headerIdx.OPEN_INTEREST]);
        const vol = num(f[headerIdx.VOLUME]);
        if (oi <= 0 && vol <= 0) continue;
        kept++;

        const type = (f[headerIdx.TYPE] || "").toLowerCase();
        const isCall = type === "call";
        const gamma = num(f[headerIdx.GAMMA]);
        const strike = num(f[headerIdx.STRIKE]);
        const iv = num(f[headerIdx.IMPLIED_VOLATILITY]);
        const delta = num(f[headerIdx.DELTA]);
        const exp = f[headerIdx.EXPIRATION] || "";

        let a = agg.get(sym);
        if (!a) { a = { callOI: 0, putOI: 0, callVol: 0, putVol: 0, gammaOI: 0, n: 0, top: [] }; agg.set(sym, a); }
        a.n++;
        if (isCall) { a.callOI += oi; a.callVol += vol; } else { a.putOI += oi; a.putVol += vol; }
        // 딜러 감마 노출의 재료 — 콜은 +, 풋은 − (현물가는 소비처에서 곱한다)
        a.gammaOI += gamma * oi * (isCall ? 1 : -1);

        if (oi >= MIN_OI_TRACK) oiOut[contract] = oi;

        // 「주목할 계약」 — 미결제약정 증감이 있으면 그걸 우선, 없으면 거래량
        const before = prevOi.oi ? prevOi.oi[contract] : undefined;
        const oiChg = before === undefined ? null : oi - before;
        const score = oiChg != null ? Math.abs(oiChg) * 2 + vol : vol;
        if (score > 0) {
            a.top.push({ c: contract, k: strike, e: exp, t: isCall ? "C" : "P", v: vol, oi, d: oiChg, iv, dl: delta, s: score });
            if (a.top.length > TOP_PER_TICKER * 3) {
                a.top.sort((x, y) => y.s - x.s);
                a.top.length = TOP_PER_TICKER;
            }
        }

        if (seen % 500000 === 0) log(`  … ${seen.toLocaleString()}행 · 채택 ${kept.toLocaleString()} · RSS ${mb()}MB`);
    }

    log(`파싱 완료 — ${seen.toLocaleString()}행 중 ${kept.toLocaleString()} 채택 · ${agg.size}종목 · RSS ${mb()}MB`);

    // ── 정합성 게이트 ─────────────────────────────────────────
    if (agg.size < Math.min(100, uni.size * 0.3)) {
        throw new Error(`집계된 종목이 너무 적다 (${agg.size}/${uni.size}) — 적재 중단`);
    }
    if (kept < 10000) throw new Error(`채택 행이 너무 적다 (${kept}) — 적재 중단`);

    const tickers = {};
    for (const [sym, a] of agg) {
        a.top.sort((x, y) => y.s - x.s);
        tickers[sym] = {
            callOI: a.callOI, putOI: a.putOI,
            callVol: a.callVol, putVol: a.putVol,
            // 미결제약정 기준 P/C — 거래량 기준과 다른 이야기를 한다(포지션 vs 오늘 활동)
            pcrOI: a.callOI > 0 ? Math.round((a.putOI / a.callOI) * 1000) / 1000 : null,
            pcrVol: a.callVol > 0 ? Math.round((a.putVol / a.callVol) * 1000) / 1000 : null,
            gammaOI: Math.round(a.gammaOI),
            contracts: a.n,
            top: a.top.slice(0, TOP_PER_TICKER).map(({ s, ...r }) => r),
        };
    }

    const payload = JSON.stringify({ date: fileDate, prevDate: prevOi.date || null, tickers, _ts: Date.now() });
    const oiPayload = JSON.stringify({ date: fileDate, oi: oiOut });
    log(`페이로드 집계 ${(payload.length / 1048576).toFixed(2)}MB · 미결제약정 ${(oiPayload.length / 1048576).toFixed(2)}MB (${Object.keys(oiOut).length.toLocaleString()}건)`);

    if (DRY) {
        const s = Object.entries(tickers).slice(0, 3);
        for (const [t, v] of s) {
            log(`--dry ${t}: 콜OI ${v.callOI.toLocaleString()} 풋OI ${v.putOI.toLocaleString()} · PCR(OI) ${v.pcrOI} · 계약 ${v.contracts}`);
            if (v.top[0]) log(`        상위: ${v.top[0].c} vol ${v.top[0].v} oi ${v.top[0].oi} 증감 ${v.top[0].d ?? "—"}`);
        }
        return;
    }

    await redisSet(OUT_KEY, payload, TTL_SEC);
    await redisSet(OI_KEY, oiPayload, TTL_SEC);

    // 되읽기 검증 — 「썼다」가 아니라 「읽힌다」
    const back = await redisGet(OUT_KEY);
    const n = back && back.tickers ? Object.keys(back.tickers).length : 0;
    if (n !== Object.keys(tickers).length) throw new Error(`되읽기 불일치 (${n} vs ${Object.keys(tickers).length})`);

    log(`적재 완료 · ${n}종목 · ${((Date.now() - t0) / 1000).toFixed(0)}초 · RSS 최대 ${mb()}MB`);
})().catch((e) => {
    console.error("[OPT] 실패:", e.message);
    process.exit(1);
});
