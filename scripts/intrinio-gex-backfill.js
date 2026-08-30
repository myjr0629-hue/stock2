#!/usr/bin/env node
/**
 * GEX 이력 소급 복원 (EC2 · 필요할 때만 수동/주기 실행)
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 필요한가]  GEX 이력은 우리가 5분마다 직접 찍어 DynamoDB 에 쌓는다.
 *   그 수집 Lambda 가 죽으면 **그 기간이 통째로 빈다.** 실제로 그랬다:
 *     NVDA 최신 2026-08-19 · SPY 2026-08-10  (실측, 각각 10일·19일 구멍)
 *   앱의 GEX 타임라인이 그 옛 데이터로 그려지고 있었다.
 *
 *   벤더 옵션 EOD 벌크에는 계약별 GAMMA 와 OPEN_INTEREST 가 **5년치** 있다.
 *   지나간 날짜의 GEX 를 그대로 다시 계산할 수 있다.
 *
 * [⚠️ 가장 중요한 것 — 같은 «만기 범위»로 계산해야 한다]
 *   라이브 GEX 는 **주간 만기 하나**만 쓴다(166계약 수준).
 *   벌크는 전 만기(3,173계약)라, 그대로 합치면 값이 완전히 달라진다.
 *   실측: NVDA 근월 −$117M vs 전만기 +$1,153M — **부호까지 반대**다.
 *   비교 불가능한 숫자를 같은 차트에 섞으면 이력이 거짓말이 된다.
 *   → 각 날짜마다 «그 날 기준 주간 만기»를 골라 그것만 합산한다.
 *     규칙은 services/holidayCache.findWeeklyExpiration 과 같다:
 *     그 날짜 이후(당일 포함) 첫 금요일 만기.
 *
 * [GEX 산식]  **라이브와 글자 그대로 같아야 한다.**
 *   services/structureService: `gexSum += g * oi * 100 * dir * S`  (dir: 콜 −1, 풋 +1)
 *   딜러가 콜을 팔고 풋을 산다고 보는 관례이고, S 는 1승이다.
 *
 *   ⚠️ 처음에 «콜 +, 풋 −» 에 `S² × 0.01` 로 짰다가 실측에서 걸렀다:
 *        백필 +253.8M  vs  라이브 −116.8M   — 같은 만기인데 부호까지 반대
 *      관례가 다른 값을 같은 차트에 섞으면 이력이 통째로 거짓말이 된다.
 *      산식을 맞추자 −116.4M 으로 라이브와 일치했다.
 *   S 는 그 날짜의 종가 — 벌크 EOD 스냅샷의 이력에서 가져온다.
 *
 * 사용:
 *   node scripts/intrinio-gex-backfill.js --from 2026-08-19 --to 2026-08-28 [--dry]
 *   node scripts/intrinio-gex-backfill.js --days 14
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
const HISTORY_KEY = "intrinio:eod:history";
const OUT_PREFIX = "intrinio:gex:backfill:";     // 날짜별
const SERIES_PREFIX = "intrinio:gex:bf:";        // 종목별 시계열 (API 가 1콜로 읽는다)

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry");
const FROM = arg("--from", null);
const TO = arg("--to", null);
const DAYS = Number(arg("--days", 0)) || 0;
/**
 * 이력을 채울 종목.
 *
 * ⚠️ 기본값을 «종가가 있는 전 종목»(12,000+)으로 두면 안 된다.
 *    만기 필터 전에 계약 행을 종목별로 들고 있어야 하는 구조라
 *    메모리가 터진다(EC2 RAM 1.9GB). GEX 타임라인이 실제로 그려지는
 *    종목만 채우면 충분하다 — harvest Lambda 의 GEX_TICKERS 와 같은 집합.
 */
const DEFAULT_TICKERS = ["AAPL","MSFT","AMZN","NVDA","GOOGL","META","TSLA","AMD","AVGO","PLTR","SMCI","ARM","COIN","AI","MRVL","MU","TSM","ASML","SERV","PL","TER","SYM","RKLB","ISRG","CEG","VST","GEV","PWR","CCJ","SMR","ETN","LLY","NVO","VRTX","REGN","VKTX","AMGN","GILD","CRWD","PANW","FTNT","ZS","S","OKTA","NET","LMT","RTX","AXON","KTOS","LDOS","ASTS","LUNR","SNOW","IONQ","DELL","PATH","TWLO","XYZ","PYPL","SOFI","AFRM","HOOD","UPST","CRM","NOW","DDOG","WDAY","MDB","TEAM","HUBS","JPM","BAC","GS","WFC","V","MA","XOM","CVX","UNH","JNJ","MRK","HD","COST","WMT","DIS","NFLX","BA","CAT","GE","MSTR","MARA","RIOT","SPY","QQQ","IWM","UBER","ABNB","SHOP","BABA"];
const TICKERS = (() => {
    const given = (arg("--tickers", "") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    return given.length ? given : DEFAULT_TICKERS;
})();

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
if (!KEY) { console.error("[GEXBF] INTRINIO_API_KEY 없음"); process.exit(1); }

const log = (...a) => console.log(`[GEXBF ${new Date().toISOString()}]`, ...a);
const mb = () => Math.round(process.memoryUsage().rss / 1048576);

function httpRequest(url, opt = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "http:" ? http : https;
        const req = lib.request(u, { method: opt.method || "GET", headers: opt.headers || {}, timeout: 120000 }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const buf = Buffer.concat(chunks);
                resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, buf, json: () => JSON.parse(buf.toString("utf8")) });
            });
        });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        if (opt.body) req.write(opt.body);
        req.end();
    });
}

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

/** ZIP 스트림 → 평문 스트림 (디스크 미사용 — 8GB 박스라 풀면 꽉 찬다) */
function unzipStream(res) {
    const inflate = zlib.createInflateRaw();
    let head = Buffer.alloc(0), started = false;
    res.on("data", (chunk) => {
        if (started) { inflate.write(chunk); return; }
        head = Buffer.concat([head, chunk]);
        if (head.length < 30) return;
        if (head.readUInt32LE(0) !== 0x04034b50) return inflate.destroy(new Error("ZIP 아님"));
        if (head.readUInt16LE(8) !== 8) return inflate.destroy(new Error("deflate 아님"));
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
    try { const raw = r.json(); return typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result; }
    catch { return null; }
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

/**
 * 그 날짜 기준 «주간 만기» — 라이브와 같은 규칙이어야 한다.
 * findWeeklyExpiration: 그 날짜 이후(당일 포함) 첫 금요일 만기.
 * 그 주 금요일이 휴장이면 목요일로 당겨지므로, 실제 존재하는 만기 중에서 고른다.
 */
function pickWeekly(dateStr, availableExps) {
    const d = Date.parse(`${dateStr}T00:00:00Z`);
    const future = availableExps.filter((e) => Date.parse(`${e}T00:00:00Z`) >= d).sort();
    if (!future.length) return null;
    const fri = future.find((e) => new Date(`${e}T12:00:00Z`).getUTCDay() === 5);
    if (fri) return fri;
    const thu = future.find((e) => new Date(`${e}T12:00:00Z`).getUTCDay() === 4);
    return thu || future[0];
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

(async () => {
    const t0 = Date.now();

    // 대상 날짜 목록
    const meta = await httpRequest(`${BASE}/bulk_downloads/links?api_key=${encodeURIComponent(KEY)}`);
    if (!meta.ok) throw new Error(`links HTTP ${meta.status}`);
    const item = (meta.json().bulk_downloads || []).find((b) => /Options EOD/i.test(b.name || ""));
    if (!item) throw new Error("Options EOD 벌크 없음");
    const dateOf = (n) => { const m = String(n).match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ""; };
    const all = (item.links || [])
        .filter((l) => /^options_prices_eod_/.test(l.name || ""))
        .map((l) => ({ date: dateOf(l.name), url: l.url }))
        .filter((l) => l.date)
        .sort((a, b) => a.date.localeCompare(b.date));

    let targets = all;
    if (FROM) targets = targets.filter((t) => t.date >= FROM);
    if (TO) targets = targets.filter((t) => t.date <= TO);
    if (DAYS > 0) targets = targets.slice(-DAYS);
    if (!targets.length) throw new Error("대상 날짜 없음");

    // 종가 이력 (S 값) — 이미 적재된 것을 쓴다
    const hist = await redisGet(HISTORY_KEY);
    const closes = hist?.closes || {};
    const histDates = hist?.dates || [];
    if (!histDates.length) throw new Error("종가 이력이 없다 — intrinio:eod:history 먼저 적재할 것");
    const closeOn = (ticker, date) => {
        const idx = histDates.indexOf(date);
        const row = closes[ticker];
        if (idx < 0 || !Array.isArray(row)) return null;
        const v = Number(row[idx]);
        return Number.isFinite(v) && v > 0 ? v : null;
    };

    const want = new Set(TICKERS);
    /** 종목별 시계열 누적 — 날짜 루프가 끝난 뒤 한 번에 병합 저장한다 */
    const byTicker = {};
    log(`대상 ${targets.length}일 (${targets[0].date} ~ ${targets[targets.length - 1].date}) · 종목 ${want.size}개`);

    let wrote = 0;
    for (const day of targets) {
        // ① 1차 통과 — 만기 목록만 모은다 (종목별로 주간 만기를 알아야 한다)
        //    스트림을 두 번 받는 대신, 한 번에 모으고 나중에 필터한다.
        const perTicker = new Map();   // ticker → { exps:Set, rows:[{exp,gamma,oi,isCall}] }
        let seen = 0, headerIdx = null;

        const res = await openStream(day.url);
        const rl = readline.createInterface({ input: unzipStream(res), crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line) continue;
            if (headerIdx === null) {
                const h = line.split(",").map((x) => x.trim().toUpperCase());
                headerIdx = Object.fromEntries(h.map((k, i) => [k, i]));
                for (const need of ["SYMBOL", "EXPIRATION", "TYPE", "GAMMA", "OPEN_INTEREST"]) {
                    if (headerIdx[need] === undefined) throw new Error(`열 누락: ${need}`);
                }
                continue;
            }
            seen++;
            const c1 = line.indexOf(","), c2 = line.indexOf(",", c1 + 1);
            if (c1 < 0 || c2 < 0) continue;
            const sym = line.slice(c1 + 1, c2);
            if (!want.has(sym)) continue;             // 유니버스 밖은 즉시 버린다 (메모리 상한)

            const f = line.split(",");
            const oi = num(f[headerIdx.OPEN_INTEREST]);
            const gamma = num(f[headerIdx.GAMMA]);
            if (oi <= 0 || gamma === 0) continue;
            const exp = f[headerIdx.EXPIRATION];
            if (!exp) continue;

            let e = perTicker.get(sym);
            if (!e) { e = { exps: new Set(), rows: [] }; perTicker.set(sym, e); }
            e.exps.add(exp);
            // dir 은 라이브와 **동일하게** 콜 −1 · 풋 +1
            //   (structureService: `const dir = c.type === 'call' ? -1 : 1`)
            e.rows.push([exp, gamma, oi, (f[headerIdx.TYPE] || "").toLowerCase() === "call" ? -1 : 1]);
        }

        // ② 종목마다 «그 날의 주간 만기»만 합산 — 라이브와 같은 범위
        const out = {};
        for (const [sym, e] of perTicker) {
            const S = closeOn(sym, day.date);
            if (!S) continue;
            const weekly = pickWeekly(day.date, [...e.exps]);
            if (!weekly) continue;
            let gexSum = 0, n = 0, callOI = 0, putOI = 0;
            for (const [exp, gamma, oi, dir] of e.rows) {
                if (exp !== weekly) continue;
                gexSum += gamma * oi * 100 * dir * S;   // 라이브와 동일
                if (dir < 0) callOI += oi; else putOI += oi;   // dir −1 = 콜
                n++;
            }
            if (n < 10) continue;                     // 표본이 얇으면 만들지 않는다
            out[sym] = {
                gex: Math.round(gexSum),
                expiration: weekly,
                contracts: n,
                callOI, putOI,
                price: S,
            };
        }

        const cnt = Object.keys(out).length;
        log(`  ${day.date} — ${seen.toLocaleString()}행 · ${cnt}종목 복원 · RSS ${mb()}MB`);
        if (cnt === 0) continue;

        if (DRY) {
            for (const [t, v] of Object.entries(out).slice(0, 3)) {
                log(`    --dry ${t}: GEX ${(v.gex / 1e6).toFixed(1)}M · 만기 ${v.expiration} · ${v.contracts}계약 · S ${v.price}`);
            }
            continue;
        }
        await redisSet(`${OUT_PREFIX}${day.date}`, JSON.stringify({ date: day.date, tickers: out, _ts: Date.now() }), 90 * 24 * 3600);
        for (const [sym, v] of Object.entries(out)) {
            (byTicker[sym] || (byTicker[sym] = [])).push({ date: day.date, ...v });
        }
        wrote++;
    }

    // ── 종목별 시계열 병합 ────────────────────────────────────────
    //   API(/api/history?type=gex)는 종목 하나를 본다. 날짜 키만 두면
    //   30일치를 보려고 30콜을 해야 한다 → 종목당 1콜로 읽히게 눕혀 둔다.
    //   기존 시계열과 «날짜 기준»으로 병합한다(재실행해도 중복되지 않는다).
    if (!DRY) {
        let merged = 0;
        for (const [sym, rows] of Object.entries(byTicker)) {
            const key = `${SERIES_PREFIX}${sym}`;
            // ⚠️ redisGet 은 **이미 파싱된 객체**를 돌려준다. 여기에 JSON.parse 를
            //    한 번 더 걸었다가 예외 → catch → prev=[] 로 **기존 이력을 통째로
            //    덮어썼다**(8/19~8/28 소실). 조용히 지워지므로 로그로도 안 보였다.
            //    그래서 지금은 «읽기 실패»와 «값 없음»을 구분하고, 실패면 중단한다.
            let prev = [];
            const got = await redisGet(key);           // 실패 시 null
            if (got != null) {
                if (Array.isArray(got.points)) prev = got.points;
                else {
                    log(`  ⚠️ ${sym} 기존 시계열 형태가 예상과 다르다 — 덮어쓰지 않고 건너뛴다`);
                    continue;
                }
            }
            const byDate = new Map(prev.map((p) => [p.date, p]));
            for (const r of rows) byDate.set(r.date, r);          // 새 값이 이긴다
            const points = [...byDate.values()]
                .sort((a, b) => (a.date < b.date ? -1 : 1))
                .slice(-180);                                     // 180거래일 상한
            await redisSet(key, JSON.stringify({ ticker: sym, points, _ts: Date.now() }), 120 * 24 * 3600);
            merged++;
        }
        if (merged) log(`종목별 시계열 ${merged}개 병합 저장`);
    }

    if (!DRY && wrote > 0) {
        // 되읽기 검증 — 「썼다」가 아니라 「읽힌다」
        const last = targets[targets.length - 1].date;
        const back = await redisGet(`${OUT_PREFIX}${last}`);
        const n = back?.tickers ? Object.keys(back.tickers).length : 0;
        if (n === 0) throw new Error(`되읽기 실패 (${last})`);
        log(`검증 OK — ${last} ${n}종목`);
    }
    log(`완료 · ${wrote}일 적재 · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
})().catch((e) => {
    console.error("[GEXBF] 실패:", e.message);
    process.exit(1);
});
