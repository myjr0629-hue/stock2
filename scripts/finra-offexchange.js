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

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
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

    const date = await resolveDate();
    if (!date) { console.error("[FINRA] 최근 8일 내 데이터 없음"); process.exit(1); }

    const { off, rows } = await fetchDay(date);
    log(`${date} · ${rows.toLocaleString()}행 → ${Object.keys(off).length.toLocaleString()}종목`);

    // ── 2. 통합 거래량으로 «장외 비중» 계산 ───────────────────────────
    const snap = await redisGet(EOD_KEY);
    const consolidated = {};
    for (const r of (snap?.rows || [])) consolidated[r[0]] = r[5];   // [t,o,h,l,c,v,...]

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

    if (DRY) { log("--dry · 저장 생략"); return; }
    if (matched < 1000) throw new Error(`매칭 ${matched}종목 — 너무 적어 저장하지 않는다`);

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
