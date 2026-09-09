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
 *   node finra-offexchange.js --backfill=40      최근 40거래일 이력 적재
 *
 * 왜 이력이 필요한가
 *   「TSLA 47.4%」만 보여 주면 그게 높은지 낮은지 알 수 없다. 자기 20일
 *   이력 대비 백분위·추세가 있어야 «인사이트»가 된다. 하루치로는 못 만든다.
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
const OUT_KEY = "finra:offexchange";        // 오늘 + 파생지표 (앱이 읽는 것)
const HIST_KEY = "finra:offexchange:hist";  // 시장 평균 이력
const SERIES_KEY = "finra:offexchange:series"; // 종목별 이력 (백분위·배수의 재료)
/** 종목별 이력 보관 일수. 백분위를 말하려면 최소 MIN_SERIES 일이 필요하다. */
const SERIES_DAYS = 25;
const MIN_SERIES = 10;
const TTL_SEC = 90 * 86400;

/** FINRA 규정: User-Agent 에 연락처를 넣는다 */
const UA = "SIGNUM HQ LLC (contact@signumhq.com)";
const API = "https://api.finra.org/data/group/otcMarket/name/regShoDaily";
/** API 가 limit 을 5,000 으로 자른다 — 요청값을 실제 상한에 맞춰야
 *  `body.length < PAGE` 종료 조건이 첫 페이지에서 오작동하지 않는다. */
const PAGE = 5000;

// ══════════════════════════════════════════════════════════════════════
// 당일 연결 거래량 — 벌크 EOD 가 아직 안 나온 «마감 직후»를 위한 분모.
//
//   벌크 EOD(intrinio:eod:snapshot)는 T+1 이라 마감 직후에는 전날치다.
//   그런데 FINRA 는 마감 1~2시간 뒤면 «당일치»가 나온다. 그 시차 때문에
//   전에는 두 날짜를 나눠 전 종목이 틀렸다(SPCX +39.2%p).
//   벤더 실시간 스냅샷 CSV 에는 `TOTAL TRADE VOLUME` 이 있으므로,
//   마감 후에는 그걸 분모로 쓰면 «같은 날짜»로 오늘치를 만들 수 있다.
//
//   ⚠️ 장중에 쓰면 «지금까지의 거래량»이라 분모가 작아 비중이 부풀어 오른다.
//      반드시 정규장 마감(16:00 ET) 이후에만 쓴다.
// ══════════════════════════════════════════════════════════════════════
const INTRINIO_BASE = "https://api-v2.intrinio.com";

function etNow() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function etDateStr(d = etNow()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** 정규장이 끝났고 거래량이 확정될 만큼 지났는가 (16:15 ET 이후) */
function afterCloseSettled() {
    const d = etNow();
    return d.getHours() * 60 + d.getMinutes() >= 16 * 60 + 15;
}

function httpsGetBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { "User-Agent": UA } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve(httpsGetBuffer(res.headers.location));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
        }).on("error", reject);
    });
}

/** 전 시장 «오늘» 거래량 맵. 실패하면 null — 지어내지 않는다. */
async function loadTodayVolumes() {
    const key = process.env.INTRINIO_API_KEY;
    if (!key) { log("실시간 스냅샷: INTRINIO_API_KEY 없음 — 건너뜀"); return null; }
    try {
        const metaBuf = await httpsGetBuffer(`${INTRINIO_BASE}/securities/snapshots?api_key=${key}`);
        const meta = JSON.parse(metaBuf.toString("utf8"));
        const fileUrl = meta?.snapshots?.[0]?.files?.[0]?.url;
        if (!fileUrl) { log("실시간 스냅샷: 파일 URL 없음"); return null; }

        let raw = await httpsGetBuffer(fileUrl);
        if (raw[0] === 0x1f && raw[1] === 0x8b) raw = require("zlib").gunzipSync(raw);
        const lines = raw.toString("utf8").split("\n");
        if (lines.length < 2) return null;

        const head = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim().toUpperCase());
        const iS = head.indexOf("SYMBOL");
        const iV = head.indexOf("TOTAL TRADE VOLUME");
        if (iS < 0 || iV < 0) { log("실시간 스냅샷: SYMBOL/VOLUME 열 없음"); return null; }

        const map = {};
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",");
            if (cols.length <= Math.max(iS, iV)) continue;
            const sym = (cols[iS] || "").replace(/^"|"$/g, "").toUpperCase();
            const vol = Number((cols[iV] || "").replace(/^"|"$/g, ""));
            if (sym && Number.isFinite(vol) && vol > 0) map[sym] = vol;
        }
        return Object.keys(map).length ? map : null;
    } catch (e) {
        log(`실시간 스냅샷 실패: ${e.message}`);
        return null;
    }
}

/**
 * 그 «날짜»의 전 종목 연결 거래량 — 분모의 정본.
 *
 *   실시간 스냅샷은 «지금 상태»라서 두 가지로 배신한다.
 *     · 장중에 쓰면 분모가 덜 차서 비중이 부풀고,
 *     · 마감이 지날수록 «최근 체결이 있는 종목»만 남아 커버리지가 녹는다.
 *       실측(2026-09-08): 15:57 ET 13,160종목 → 20:25 ET 3,956종목.
 *       그래서 TSLA·AAPL·META 같은 대형주까지 분모를 못 찾아 통째로
 *       직전 세션 값으로 이월됐다(11,757종목 중 8,058종목 = 69%).
 *
 *   이 엔드포인트는 «날짜»를 인자로 받는다. 그래서 분모가 분자와
 *   어긋날 수가 없고, 마감 당일 저녁에 이미 확정치가 나온다.
 *   실측(2026-09-08 21:10 ET): 12,513종목 · 2페이지 · 6.1초,
 *   값은 공식 EOD 와 자릿수까지 일치(SPY 44,746,095 · NVDA 122,965,555).
 */
const EXCHANGE = process.env.INTRINIO_EXCHANGE || "USCOMP";

async function loadEodVolumes(date) {
    const key = process.env.INTRINIO_API_KEY;
    if (!key) { log("EOD 거래량: INTRINIO_API_KEY 없음 — 건너뜀"); return null; }
    const map = {};
    let next = "", pages = 0;
    try {
        while (pages < 40) {
            const url = `${INTRINIO_BASE}/stock_exchanges/${EXCHANGE}/prices?date=${date}&page_size=10000`
                + (next ? `&next_page=${encodeURIComponent(next)}` : "")
                + `&api_key=${key}`;
            const j = JSON.parse((await httpsGetBuffer(url)).toString("utf8"));
            const rows = j?.stock_prices || [];
            for (const p of rows) {
                const t = p?.security?.ticker;
                const v = Number(p?.volume);
                // ★ 날짜를 «되받아» 확인한다. 요청한 날이 아닌 행은 분모로 쓰지 않는다.
                if (t && p?.date === date && Number.isFinite(v) && v > 0) map[t] = v;
            }
            pages++;
            next = j?.next_page || "";
            if (!next) break;
        }
    } catch (e) {
        log(`EOD 거래량 조회 실패(${pages}페이지까지): ${e.message}`);
    }
    const n = Object.keys(map).length;
    if (!n) return null;
    log(`EOD 거래량 ${date} · ${n.toLocaleString()}종목 (${pages}페이지)`);
    return map;
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const dateArg = (args.find((a) => a.startsWith("--date=")) || "").split("=")[1] || null;
const backfillArg = +((args.find((a) => a.startsWith("--backfill=")) || "").split("=")[1] || 0);
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

/** 하루치 장외 집계. TRF 3곳(B/Q/N)이 심볼당 최대 3행으로 온다 → 합산. */
async function fetchDay(date) {
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
    return { off, rows };
}

/** 값이 분포의 몇 번째인가 (0~100). 표본이 얇으면 null — 지어내지 않는다. */
function pctileOf(today, history) {
    const h = history.filter((v) => typeof v === "number" && Number.isFinite(v));
    if (h.length < MIN_SERIES) return null;
    return Math.round((h.filter((v) => v <= today).length / h.length) * 100);
}

/** 직전 N개 평균 */
function avg(arr) {
    const a = arr.filter((v) => typeof v === "number" && Number.isFinite(v));
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}

(async () => {
    // ── 백필 모드: 종목별 이력만 만든다 (통합 거래량이 과거치가 없어 %는 못 만듦)
    if (backfillArg > 0) {
        const series = { dates: [], vol: {}, short: {} };
        const today = new Date();
        let filled = 0;
        for (let i = 0; i < backfillArg * 2 && filled < backfillArg; i++) {
            const iso = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
            const d = new Date(iso + "T12:00:00Z").getUTCDay();
            if (d === 0 || d === 6) continue;                       // 주말 건너뛰기
            let day;
            try { day = await fetchDay(iso); } catch { continue; }
            if (!day.rows) continue;                                 // 휴일
            series.dates.push(iso);
            for (const [sym, v] of Object.entries(day.off)) {
                if (!series.vol[sym]) { series.vol[sym] = {}; series.short[sym] = {}; }
                series.vol[sym][iso] = Math.round(v.v);
                series.short[sym][iso] = v.v > 0 ? Math.round((v.s / v.v) * 1000) / 10 : null;
            }
            filled++;
            log(`백필 ${iso} · ${Object.keys(day.off).length.toLocaleString()}종목 (${filled}/${backfillArg})`);
            await new Promise((r) => setTimeout(r, 250));            // 예의상 간격
        }
        series.dates.sort();
        // 날짜별 맵 → 배열(날짜 순서 고정)로 압축
        const packed = { dates: series.dates, vol: {}, short: {} };
        for (const sym of Object.keys(series.vol)) {
            packed.vol[sym] = series.dates.map((d) => series.vol[sym][d] ?? null);
            packed.short[sym] = series.dates.map((d) => series.short[sym][d] ?? null);
        }
        const payload = JSON.stringify(packed);
        log(`이력 ${series.dates.length}일 × ${Object.keys(packed.vol).length.toLocaleString()}종목 · ${(payload.length / 1048576).toFixed(1)}MB`);
        if (DRY) { log("--dry · 저장 생략"); return; }
        await redisSet(SERIES_KEY, payload, TTL_SEC);
        log("이력 저장 완료");
        return;
    }

    let date = await resolveDate();
    if (!date) { console.error("[FINRA] 최근 8일 내 데이터 없음"); process.exit(1); }

    // ══════════════════════════════════════════════════════════════
    // ★ 분자와 분모의 «날짜»가 같아야 한다 (2026-09-09 실측 버그)
    //
    //   FINRA 는 «당일 저녁», Intrinio EOD 스냅샷은 «다음날 아침»에 나온다.
    //   그 시차에 이 스크립트가 돌면 9/8 장외물량을 9/4 거래량으로 나눈다.
    //   실측 오차:
    //     SPCX 실제 52.4% → 표시 91.6% (+39.2%p)
    //     INTC 실제 47.8% → 표시 68.8% (+21.0%p)
    //     NVDA 실제 42.0% → 표시 38.2% (−3.8%p)
    //   거래량이 늘어난 종목은 부풀고 줄어든 종목은 깎인다 — 방향도 제각각이라
    //   «전 종목이 조용히 틀린» 상태가 된다. 화면에는 「거래의 92%가 호가창
    //   밖에서 체결됐습니다」로 단정해서 나갔다.
    //
    //   그래서 스냅샷 날짜에 맞춰 내려간다. 못 맞추면 «안 쓴다» — 두 날짜를
    //   나눈 숫자를 내보내느니 어제 값을 그대로 두는 게 낫다.
    // ══════════════════════════════════════════════════════════════
    const snap = await redisGet(EOD_KEY);
    const snapDate = snap?.date || null;
    if (!snapDate) { console.error("[FINRA] EOD 스냅샷 없음 — 분모를 만들 수 없다"); process.exit(1); }

    // 분모 선택 — «분자와 같은 날짜»가 절대 조건이다.
    //   분모를 «지금 상태»에서 주워 오면 날짜도 커버리지도 흔들린다.
    //   그래서 날짜를 인자로 넘겨 그 날의 확정 거래량을 받아 온다.
    let consolidated = {};
    let denomSource = "";

    // ① 그 날짜의 EOD 거래량을 «날짜로» 직접 조회한다 — 어긋날 수가 없다.
    //    지난 세션은 이미 확정이고, 오늘 세션은 마감이 지나야 확정이다.
    if (date !== etDateStr() || afterCloseSettled()) {
        const eodVol = await loadEodVolumes(date);
        if (eodVol) {
            consolidated = eodVol;
            denomSource = `EOD 거래량 ${date}`;
        }
    }
    // ② 벌크 EOD 스냅샷이 «같은 날짜»일 때만 쓴다
    if (!denomSource && snapDate === date) {
        for (const r of (snap?.rows || [])) consolidated[r[0]] = r[5];  // [t,o,h,l,c,v,...]
        denomSource = `벌크 EOD ${snapDate}`;
    }
    // ③ 마지막 수단 — 실시간 스냅샷(마감 후에만, 커버리지가 얇을 수 있다)
    if (!denomSource && !dateArg && date === etDateStr() && afterCloseSettled()) {
        const todayVol = await loadTodayVolumes();
        if (todayVol) {
            consolidated = todayVol;
            denomSource = `실시간 스냅샷 ${date} (마감 후·얇음)`;
        }
    }

    if (!denomSource) {
        if (dateArg) {
            console.error(`[FINRA] --date ${date} 용 거래량을 못 구했다 — 날짜가 다르면 계산하지 않는다`);
            process.exit(1);
        }
        log(`⚠️ ${date} 용 당일 거래량을 못 구했다 — 분모에 맞춰 ${snapDate} 로 내려간다`);
        date = snapDate;
        for (const r of (snap?.rows || [])) consolidated[r[0]] = r[5];
        denomSource = `벌크 EOD ${snapDate}`;
    }

    const { off, rows } = await fetchDay(date);
    log(`${date} · ${rows.toLocaleString()}행 → ${Object.keys(off).length.toLocaleString()}종목 · 분모=${denomSource}`);

    // ── 2-B. 이력을 붙여 «파생 지표»를 만든다 ─────────────────────────
    //   숫자 하나(47.4%)는 정보가 아니다. 그게 이 종목에서 평소보다 높은지,
    //   그 장외 물량이 매집인지 헤지인지까지 가야 인사이트가 된다.
    const prevSeries = (await redisGet(SERIES_KEY)) || { dates: [], vol: {}, short: {} };
    const sDates = Array.isArray(prevSeries.dates) ? prevSeries.dates.filter((x) => x !== date) : [];

    const out = {};
    let matched = 0, sumPct = 0, dropped = 0, derived = 0;
    for (const [sym, d] of Object.entries(off)) {
        const cv = consolidated[sym];
        if (!cv || !(cv > 0) || !(d.v > 0)) continue;
        const pct = (d.v / cv) * 100;
        // ⚠️ 100% 초과는 심볼 대응이 어긋난 것(클래스 차이 등). 지어내지 말고 버린다.
        if (!(pct > 0) || pct > 100) { dropped++; continue; }

        const shortPct = Math.round((d.s / d.v) * 1000) / 10;
        const row = {
            pct: Math.round(pct * 10) / 10,
            vol: Math.round(d.v),
            shortPct,                       // 장외 체결 중 공매도 비중 — 벤더는 안 주던 값
        };

        // 이 종목의 과거 장외 물량 / 공매도 비중
        const volHist = (prevSeries.vol?.[sym] || []).filter((v) => typeof v === "number" && v > 0);
        const shHist = (prevSeries.short?.[sym] || []).filter((v) => typeof v === "number");

        const volAvg = avg(volHist);
        if (volAvg && volAvg > 0) {
            // 「평소의 몇 배」 — 비중(%)보다 «변화»가 신호다
            row.volRatio = Math.round((d.v / volAvg) * 100) / 100;
            row.volP = pctileOf(d.v, volHist);
        }
        row.shortP = pctileOf(shortPct, shHist);
        // ★ 공매도 «비중» 자체는 의미가 없다. 시장 중앙값이 49.4% 다 —
        //   도매업자가 소매 매수의 상대가 될 때 일단 공매도로 팔고 되사기
        //   때문에 절반은 «구조적»으로 찍힌다. 하락 베팅이 아니다.
        //   → 그 종목의 «평소»를 같이 줘야 사용자가 오해하지 않는다.
        //     (실측: CRWD 45.5% 는 평소 46.3% 와 같다 = 이상 없음.
        //            TSLA 61.9% 는 평소 48.5% 대비 +13.4%p = 진짜 이상.)
        const shAvg = avg(shHist);
        if (shAvg != null) {
            row.shortAvg = Math.round(shAvg * 10) / 10;
            row.shortDev = Math.round((shortPct - shAvg) * 10) / 10;
        }
        // 오늘의 비중 %는 오늘부터 쌓인다(과거 통합거래량이 없어 소급 불가)
        row.pctP = pctileOf(pct, (prevSeries.pct?.[sym] || []));

        // ── 은밀 축적 점수 ─────────────────────────────────────────
        //   장외 물량이 평소보다 많고(volP↑), 그 물량 중 공매도 비중은
        //   평소보다 낮으면(shortP↓) → 호가창 밖에서 «사 모으는» 그림.
        //   반대면 조용한 분산·헤지. 예측이 아니라 «포지셔닝 판독»이다.
        if (row.volP != null && row.shortP != null) {
            row.stealth = Math.round(row.volP * 0.6 + (100 - row.shortP) * 0.4);
            row.regime = row.stealth >= 70 ? "ACCUMULATION"
                : row.stealth <= 30 ? "DISTRIBUTION" : "NEUTRAL";
            derived++;
        }

        out[sym] = row;
        matched++; sumPct += pct;
    }
    const marketAvg = matched ? Math.round((sumPct / matched) * 10) / 10 : null;
    log(`장외비중 ${matched.toLocaleString()}종목 · 평균 ${marketAvg}% · 제외 ${dropped}건(>100%) · 파생지표 ${derived.toLocaleString()}종목`);
    for (const t of ["SPY", "QQQ", "NVDA", "TSLA", "AAPL"]) {
        const r = out[t];
        if (r) log(`  ${t}: ${r.pct}% · 공매도 ${r.shortPct}%(평소 ${r.shortAvg ?? "—"}%, ${r.shortDev != null && r.shortDev > 0 ? "+" : ""}${r.shortDev ?? "—"}%p) · 물량 ${r.volRatio ?? "—"}배 · ${r.regime ?? ""}`);
    }

    // ── 2-C. 이번에 못 채운 종목은 «직전 값»을 그 날짜와 함께 남긴다 ──
    //   당일 거래량 스냅샷은 «실제로 거래된» 종목만 담는다(9/8 실측 3,699종목,
    //   전체 장외물량의 96.1%). 나머지를 그냥 버리면 얇은 종목을 찾은 사용자에게
    //   화면이 통째로 빈다. 그렇다고 오늘 날짜로 어제 값을 내보내면 안 된다 —
    //   그게 이번 버그의 본질이었다.
    //   → 행마다 «그 값이 어느 세션의 것인지»(d)를 달아 이월한다. 화면은
    //     그 날짜를 그대로 표시하므로 사용자가 오해할 수 없다.
    let carried = 0;
    let prevDate = null;
    {
        const prev = await redisGet(OUT_KEY);
        prevDate = prev?.date || null;
        if (prev?.tickers && prevDate) {
            for (const [sym, row] of Object.entries(prev.tickers)) {
                if (out[sym]) continue;                       // 오늘 값이 있으면 그대로
                out[sym] = { ...row, d: row.d || prevDate };  // 없으면 «그 날짜»를 달아 이월
                carried++;
            }
        }
    }
    log(`오늘 ${matched.toLocaleString()}종목 (${date}) · 이월 ${carried.toLocaleString()}종목 · 합계 ${Object.keys(out).length.toLocaleString()}`);

    if (DRY) { log("--dry · 저장 생략"); return; }
    if (matched < 1000) throw new Error(`매칭 ${matched}종목 — 너무 적어 저장하지 않는다`);

    // ★ 뒤로 가지 않는다.
    //   실측(2026-09-08): 9/8 로 9,223종목이 저장돼 있는 상태에서 --date=2026-09-04
    //   로 한 번 돌리자 그 종목들이 전부 9/4 로 되돌아갔다. 그 다음 정상 실행이
    //   이월하며 «9/4» 꼬리표를 그대로 물려받아, 화면 69%가 나흘 전 값이 됐다.
    //   재계산은 데이터를 좋게만 만들어야 한다.
    if (prevDate && date < prevDate && !FORCE) {
        log(`⚠️ 저장본은 ${prevDate} 인데 이번 계산은 ${date} — 뒤로 가지 않는다 (--force 로 강제)`);
        return;
    }

    await redisSet(OUT_KEY, JSON.stringify({
        date, source: "FINRA", tickers: out, marketAvg, covered: matched, _ts: Date.now(),
    }), TTL_SEC);

    // ── 종목별 이력 갱신 — 오늘치가 내일의 «평소»가 된다 ──────────────
    {
        const dates = [...sDates, date].sort().slice(-SERIES_DAYS);
        const idxOld = Object.fromEntries((prevSeries.dates || []).map((d, i) => [d, i]));
        const nextVol = {}, nextShort = {}, nextPct = {};
        const syms = new Set([...Object.keys(prevSeries.vol || {}), ...Object.keys(out)]);
        for (const sym of syms) {
            const ov = prevSeries.vol?.[sym] || [];
            const os = prevSeries.short?.[sym] || [];
            const op = prevSeries.pct?.[sym] || [];
            const row = out[sym];
            nextVol[sym] = dates.map((d) => d === date ? (row ? row.vol : null) : (ov[idxOld[d]] ?? null));
            nextShort[sym] = dates.map((d) => d === date ? (row ? row.shortPct : null) : (os[idxOld[d]] ?? null));
            nextPct[sym] = dates.map((d) => d === date ? (row ? row.pct : null) : (op[idxOld[d]] ?? null));
            // 전부 비어 있으면 들고 다닐 이유가 없다
            if (nextVol[sym].every((v) => v == null)) { delete nextVol[sym]; delete nextShort[sym]; delete nextPct[sym]; }
        }
        const payload = JSON.stringify({ dates, vol: nextVol, short: nextShort, pct: nextPct });
        await redisSet(SERIES_KEY, payload, TTL_SEC);
        log(`종목 이력 ${dates.length}일 × ${Object.keys(nextVol).length.toLocaleString()}종목 · ${(payload.length / 1048576).toFixed(1)}MB`);
    }

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
