#!/usr/bin/env node
/**
 * 옵션 EOD 수집기 — 계약별 미결제약정·거래량·그릭스 (EC2)
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
 *   EC2 는 RAM 1.9GB 뿐이다. 실제로 이 파일(98MB 압축)을
 *   그냥 풀다가 **디스크가 100% 차서 서버가 먹통이 됐다**(2026-08-30).
 *   그래서:
 *     · 디스크에 **아무것도 쓰지 않는다** — HTTP 스트림을 그대로 inflate 해서 흘려 읽는다
 *     · 유니버스(상위 N종목) 밖은 파싱 즉시 버린다
 *     · 종목당 상위 계약만 남긴다 (전 계약을 들고 있지 않는다)
 *     · 미결제약정 맵도 유니버스 한정
 *
 * ══════════════════════════════════════════════════════════════════════
 * [2026-10-03] 두 경로 — 같은 판(벤더의 «날짜 D» 레코드)을 «먼저 열린 문»으로 받는다
 *
 *   실측(10/3): 묶음은 하루 한 번 08:30 UTC(04:30 EDT) 크론에서만 만들어졌다. 그런데
 *     · 벌크 파일(D)은 D+1 02:08~02:32 EDT 에 올라온다(최근 30파일 Last-Modified 06:08~06:32 UTC)
 *       → 게시 뒤 약 2시간 13분을 그냥 기다렸다.
 *     · 같은 판이 종목별 API 에는 D 당일 저녁(16:4x~17:3x ET)부터 있다 — 벌크 10/01 행의 OI = API 10/01 레코드 OI.
 *       → 「구조 화면은 10/02 판인데 고래 칩은 10/01」(10/2 22:36 ET 실측)이 된 이유.
 *   그래서 경로가 둘이다. 집계 함수는 하나다(정의가 갈라지지 않게):
 *
 *   ① 저녁(API) 경로 `--source api` — 종목별 «티커 전체 계약» EOD
 *      `options/prices/by_ticker/{T}/eod?date=D&page_size=10000` (종목당 1~2콜, 유니버스 ≈ 410콜, 분당 ≤ 약 100콜로 천천히)
 *      로 묶음만 먼저 쓴다. 기준선(OI 맵)·플로우 이력은 건드리지 않는다 — 벌크가 확정한다.
 *      «판이 갖춰짐»의 정의: 직전 묶음에 있던 종목의 98% 이상 + 지수 ETF 4종(SPY·QQQ·IWM·DIA) 전부가 날짜 D 레코드를 가짐.
 *      못 갖춘 종목(벤더 지각)은 묶음에 «D 로» 넣지 않는다 — 날짜가 다른 종목을 한 판으로 섞지 않는다.
 *      대신 `stale` 칸에 «그 종목이 실제로 잰 날짜(date·prevDate)»와 함께 직전 값을 둔다 — 종목 API(t=)만 쓴다.
 *   ② 벌크 경로(기존) — 새 파일이 보이면 15분 안에(크론 :20·:35·:50) 기준선·이력을 확정하고 묶음을 다시 쓴다.
 *      같은 날짜의 저녁 묶음이 있으면 둘을 대조해 로그에 남긴다(매일의 무회귀 실측).
 *      벌크가 저녁 묶음보다 눈에 띄게 덜 찼으면(종목 98%·계약 95% 미만 — 9/28 첫 파일이 그랬다) 묶음은 저녁 것을 남긴다.
 *   `--auto`(크론): 새 벌크가 있으면 ②, 없으면 저녁 시간(그 세션 날짜의 16:00 ET 이후, 같은 ET 날짜)일 때 ①.
 *
 * 저장
 *   intrinio:options:eod       종목별 집계 + 상위 계약 (화면·API 소비용) · source: bulk|api
 *   intrinio:options:oi        계약별 미결제약정 (내일 증감 계산용 · 벌크만 쓴다)
 *   intrinio:options:eod:api-state  저녁 경로 시도 기록(날짜·횟수·지각 종목) — 벤더 호출 상한
 *
 * 사용: node scripts/intrinio-options-eod.js [--auto] [--source bulk|api] [--dry] [--max N] [--date YYYY-MM-DD] [--force]
 *   운영 수동: --source api --session D  (저녁 경로를 시각 게이트 없이 — 다른 검사는 그대로, 쓰기 있음)
 *   시험(쓰기 없음): --dump <파일> · --api-date D · --baseline-api D0 [--baseline-save <파일>] · --baseline-file <파일>
 * 크론(EC2 root): 「20,35,50 0-2,6-13,20-23 * * *」 flock -n … --auto   (예전: 「30 8 * * *」 하루 한 번)
 *   분을 :20·:35·:50 으로 둔 이유: 3시간마다 :05~:10 에 도는 주식 EOD 적재(RSS 440MB)와 겹치지 않게(10/3 실측 남은 메모리 160MB).
 */

const fs = require("fs");
const https = require("https");
const http = require("http");
const zlib = require("zlib");
const readline = require("readline");
const { URL } = require("url");

const ENV_PATH = process.env.ENV_PATH || "/opt/signum-ws/.env";
const PROXY = process.env.REDIS_PROXY_URL || "http://127.0.0.1:8081";
// 크론은 root crontab 상단 env 로 키를 준다. 수동 실행(SSM)은 .env 에서 — loadEnv 뒤에 읽는다(main).
let PROXY_KEY = process.env.REDIS_PROXY_KEY || "";
let KEY = "";
// 시험(tests/optionsEodCollector.flow.test.js)만 가짜 벤더 주소를 준다 — 운영은 늘 기본값
const BASE = process.env.INTRINIO_BASE || "https://api-v2.intrinio.com";

const EOD_KEY = "intrinio:eod:snapshot";        // 유니버스 순위 재료
const OUT_KEY = "intrinio:options:eod";
/** 일별 «시장 전체 신규 진입» 집계 이력 — 백분위 보정용(60일 롤링) */
const FLOW_HIST_KEY = "intrinio:options:flow:hist";
const OI_KEY = "intrinio:options:oi";
/** 저녁(API) 경로의 시도 기록 — 같은 날짜에 벤더를 몇 번까지 다시 물을지 */
const API_STATE_KEY = "intrinio:options:eod:api-state";
const TTL_SEC = 5 * 24 * 3600;

const argv = process.argv;
const argOf = (k) => { const i = argv.indexOf(k); return i > 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
const DRY = argv.includes("--dry");
/** 이미 처리한 날짜를 다시 쓰게 한다 — 복구용 */
const FORCE = argv.includes("--force");
const AUTO = argv.includes("--auto");
const SOURCE = argOf("--source");                  // bulk | api | null(=bulk, --auto 면 자동)
const MAX_TICKERS = (() => { const v = argOf("--max"); return v ? Number(v) : 400; })();
const WANT_DATE = argOf("--date");
/** 시험: 페이로드를 파일로만 쓴다 — Redis 에는 아무것도 쓰지 않는다 */
const DUMP = argOf("--dump");
/** 시험: 저녁 경로의 대상 날짜를 지정(시각 게이트·이미 처리 검사를 건너뛴다) */
const API_DATE = argOf("--api-date");
/** 운영 수동 실행: 저녁 경로의 «시각 게이트»만 건너뛴다(쓰기 있음 — 기준선·판 갖춤·이미 처리·시도 상한 검사는 그대로). 예: 크론을 놓친 저녁 */
const SESSION = argOf("--session");
/** 시험: 기준선을 Redis 가 아니라 API(그 날짜)·파일에서 만든다 */
const BASELINE_API = argOf("--baseline-api");
const BASELINE_SAVE = argOf("--baseline-save");
const BASELINE_FILE = argOf("--baseline-file");
/** 쓰기는 이 하나로만 열린다 — 시험 플래그가 하나라도 있으면 Redis 쓰기는 없다 */
const WRITE_OK = !DRY && !DUMP && !API_DATE && !BASELINE_API && !BASELINE_FILE;

/** 종목당 남길 «주목할 계약» 수 — 메모리 상한의 핵심 */
const TOP_PER_TICKER = 12;
/** 이 미만은 미결제약정 맵에 넣지 않는다 (잡음 + 메모리) */
const MIN_OI_TRACK = 50;

// ── 저녁(API) 경로 상수 ─────────────────────────────────────────────
/** «판이 갖춰짐» — 직전 묶음 종목 중 날짜 D 레코드를 가진 비율의 하한 */
const API_READY_COVERAGE = 0.98;
/** 지수 ETF 는 하나라도 빠지면 «시장 전체» 합계가 거짓이 된다 — 전부 있어야 한다(유니버스에 늘 넣는 넷) */
const API_MUST_HAVE = ["SPY", "QQQ", "IWM", "DIA"];
/** 전체 수집 전에 싸게(종목당 1행) 공표 여부를 본다 — 아직이면 410콜을 쓰지 않는다 */
const API_BELLWETHERS = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA"];
/** 같은 날짜에 «다 받았는데 덜 찼다»를 몇 번까지 다시 할지 · 최소 간격 */
const API_MAX_ATTEMPTS = 6;
const API_RETRY_MIN_MS = 25 * 60 * 1000;
/**
 * 대표 종목에 판이 «처음» 보인 뒤 이만큼 기다렸다가 받는다 — 벤더가 종목별로 레코드를 올리는 도중(16:4x~17:3x ET)에
 * 반쯤 올라온 종목을 «그 종목의 D»로 받지 않게. (크론 15분 간격 → 실제로는 30~45분 뒤)
 */
const API_SETTLE_MS = 30 * 60 * 1000;
/**
 * 종목별 «덜 올라옴» 판정 — 계약 수(OI>0 또는 거래량>0)가 직전 묶음의 이 비율 미만이면 그 종목은 지각으로 본다.
 * 근거(10/3 실측, 벌크 연속일 7쌍 · 유니버스 384~387종목): 평일 최저 0.84 · 주간 만기 금→월(9/25→9/28) 최저 0.886 ·
 *   월물 만기 금→월(9/18→9/21) 최저 0.55(USFR)·0.57(USHY), 0.7 미만 6종목. → 0.7 이면 월물 다음 월요일에 멀쩡한 6종목을
 *   지각으로 오판한다. 자연 하락 최저(0.55)보다 아래인 0.5 로 둔다. 주된 방어는 판 첫 확인 뒤 대기(API_SETTLE_MS)이고,
 *   남는 차이는 벌크 경로의 «저녁 묶음 대조» 로그가 매일 드러낸다.
 */
const API_TICKER_MIN_RATIO = 0.5;
/** 벤더 분당 2,000콜을 앱·수집 Lambda 와 나눠 쓴다 — 동시 2 · 호출 시작 간격 ≥ 350ms (최대 약 170콜/분, 실측 약 90콜/분) */
const API_CONCURRENCY = 2;
const API_MIN_GAP_MS = 350;
const API_PAGE_SIZE = 10000;
const API_MAX_PAGES = 10;
/** 벌크가 같은 날짜의 저녁 묶음보다 이만큼 덜 찼으면 묶음은 저녁 것을 남긴다(9/28 첫 파일 = 계약 83%) */
const BULK_KEEP_TICKERS = 0.98;
const BULK_KEEP_CONTRACTS = 0.95;

function loadEnv(p) {
    try {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
    } catch { }
}

/** 지금(ms) — 시험(가짜 벤더 흐름 시험)만 OPT_NOW_MS 로 시계를 준다. 운영은 늘 Date.now() */
const nowMs = () => Number(process.env.OPT_NOW_MS) || Date.now();
const log = (...a) => console.log(`[OPT ${new Date().toISOString()}]`, ...a);
const mb = () => Math.round(process.memoryUsage().rss / 1048576);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 서버에 남은 메모리(MB, /proc/meminfo MemAvailable). 못 읽으면 null.
 * ★ [2026-10-03 실측] 3시간마다 :05 에 도는 주식 EOD 적재(intrinio-eod-snapshot.js)가 RSS 440MB · 약 4.5분을 쓴다.
 *   그때 이 수집기(벌크 240MB)가 겹치면 남은 메모리가 160MB 까지 내려갔다(1.9GB 서버 · 시세 중계·프록시가 같이 산다).
 *   크론 분(20·35·50)으로 피하고, 그래도 모자라면 무거운 일을 다음 주기로 미룬다.
 */
function memAvailableMB() {
    try {
        const m = fs.readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+)\s+kB/);
        return m ? Math.round(Number(m[1]) / 1024) : null;
    } catch { return null; }
}
const MIN_MEM_MB = 350;
/** 벌크는 하루 한 번의 확정이라 무한정 미루지 않는다 — 이 시각(UTC) 이후엔 메모리가 모자라도 예전처럼 돈다(예전 크론 08:30) */
const BULK_MEM_DEFER_UNTIL_UTC_HOUR = 10;

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
        (String(url).startsWith("http:") ? http : https).get(url, (res) => {
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
    // 시험 플래그(--dry·--dump·--api-date·--baseline-*)가 있으면 어떤 키도 쓰지 않는다
    if (!WRITE_OK) { log(`(시험 실행 — ${key} 쓰기 생략)`); return; }
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

// ══════════════════════════════════════════════════════════════════════
// 달력 — 휴장일 파일은 절대 쓰지 않는다 (2026-09-09 실측 버그)
//   크론이 `30 8 * * *` 로 «요일»만 보고 돌아, 9/8 실행 때 「어제=9/7 노동절」
//   파일을 받아 정상 스냅샷을 덮었다. 휴장일엔 거래가 없어 미결제약정 증감이
//   전부 0 → 신규진입 0종목 → 요약이 null → **게이트에서 무료로 열어둔
//   카드 한 장이 통째로 비었다.** 200 OK 였고 에러도 없었다.
//   휴장은 값으로 추측하지 않는다 — 달력이 정본이다.
//   (정본: src/lib/marketCalendar.ts US_MARKET_HOLIDAYS · 매년 갱신할 것 — 같은 목록인지 tests/optionsEodCollector.test.js 가 본다)
// ══════════════════════════════════════════════════════════════════════
const US_HOLIDAYS = new Set([
    "2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25",
    "2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25",
    "2027-01-01","2027-01-18","2027-02-15","2027-03-26","2027-05-31",
    "2027-06-18","2027-07-05","2027-09-06","2027-11-25","2027-12-24",
]);
function isNonTrading(d) {
    if (!d) return false;
    if (US_HOLIDAYS.has(d)) return true;
    const [y, m, dd] = d.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    return dow === 0 || dow === 6;
}
function shiftDay(d, delta) {
    const [y, m, dd] = d.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, dd + delta));
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}
/** 'YYYY-MM-DD' 바로 앞의 거래일 (주말·휴장을 건너뛴다) — marketCalendar.prevTradingDate 와 같은 규칙 */
function prevTradingDay(d) {
    let s = shiftDay(d, -1);
    for (let i = 0; i < 10 && isNonTrading(s); i++) s = shiftDay(s, -1);
    return s;
}
/** 그 시점의 ET 날짜·자정 기준 분 — hourCycle h23(Node 의 hour12:false 는 자정을 «24시»로 준다) */
function etParts(ms) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
/** 그 시점에 «마지막으로 끝난» 정규장 날짜(16:00 ET) — marketCalendar.etLastClosedSessionDate 와 같은 규칙 */
function lastClosedSession(ms) {
    const { date, minutes } = etParts(ms);
    let s = date;
    if (isNonTrading(s) || minutes < 16 * 60) s = shiftDay(s, -1);
    for (let i = 0; i < 10 && isNonTrading(s); i++) s = shiftDay(s, -1);
    return s;
}
/**
 * 저녁 경로를 지금 돌릴 «세션 날짜» — 그 세션이 끝난(16:00 ET) 뒤 «같은 ET 날짜» 안에서만.
 * 자정(ET)을 넘기면 벌크(02:08~02:32 ET 게시)가 곧 오므로 벤더를 410번 더 묻지 않는다. 주말·휴장 = null.
 */
function apiSessionFor(ms) {
    const { date, minutes } = etParts(ms);
    if (isNonTrading(date) || minutes < 16 * 60) return null;
    return date;
}

// ══════════════════════════════════════════════════════════════════════
// 집계 — 벌크·API 가 «같은 함수»를 쓴다. 행 하나 = 계약 하나.
//   row = { sym, contract, oi, vol, isCall, gamma, strike, iv, delta, exp }
// ══════════════════════════════════════════════════════════════════════
/**
 * 「주목할 계약」 순서 — 점수 내림차순, 같으면 계약 코드 오름차순.
 * ★ [2026-10-03] 같은 점수의 순서를 «행이 들어온 순서»(벌크 파일 순서 = 무작위)에 맡기면
 *   같은 판을 API 로 받았을 때 12번째 자리의 동점이 다르게 갈린다 — 같은 날짜의 두 묶음이 숫자가 달라진다.
 *   코드로 끊으면 어느 문으로 받아도 같다. (동점이 아닌 계약의 순서·선택은 예전과 같다)
 */
/** 시험 전용: OPT_TIE_ORDER=file 이면 예전처럼 점수만 본다(동점 = 들어온 순서) — 동점 규칙의 영향만 따로 재기 위해 */
const TIE_BY_CODE = process.env.OPT_TIE_ORDER !== "file";
function topOrder(x, y) {
    if (y.s !== x.s) return y.s - x.s;
    if (!TIE_BY_CODE) return 0;
    return x.c < y.c ? -1 : x.c > y.c ? 1 : 0;
}

function createAggregator(prevOiMap, { trackOi = true } = {}) {
    const agg = new Map();     // ticker → 집계
    const oiOut = {};          // contract → oi (내일 증감용 — 저녁 경로는 기준선을 쓰지 않으므로 모으지 않는다)
    const stats = { kept: 0 };
    function add(r) {
        const { sym, contract, oi, vol, isCall, gamma, strike, iv, delta, exp } = r;
        if (oi <= 0 && vol <= 0) return;
        stats.kept++;

        let a = agg.get(sym);
        if (!a) { a = { callOI: 0, putOI: 0, callVol: 0, putVol: 0, gammaOI: 0, n: 0, top: [] }; agg.set(sym, a); }
        a.n++;
        if (isCall) { a.callOI += oi; a.callVol += vol; } else { a.putOI += oi; a.putVol += vol; }
        // 딜러 감마 노출의 재료 — 콜은 +, 풋은 − (현물가는 소비처에서 곱한다)
        a.gammaOI += gamma * oi * (isCall ? 1 : -1);

        if (trackOi && oi >= MIN_OI_TRACK) oiOut[contract] = oi;

        // 「주목할 계약」 — 미결제약정 증감이 있으면 그걸 우선, 없으면 거래량
        const before = prevOiMap ? prevOiMap[contract] : undefined;
        const oiChg = before === undefined ? null : oi - before;
        const score = oiChg != null ? Math.abs(oiChg) * 2 + vol : vol;
        if (score > 0) {
            a.top.push({ c: contract, k: strike, e: exp, t: isCall ? "C" : "P", v: vol, oi, d: oiChg, iv, dl: delta, s: score });
            if (a.top.length > TOP_PER_TICKER * 3) {
                a.top.sort(topOrder);
                a.top.length = TOP_PER_TICKER;
            }
        }
    }
    return { agg, oiOut, stats, add };
}

function finalizeTickers(agg) {
    const tickers = {};
    for (const [sym, a] of agg) {
        a.top.sort(topOrder);
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
    return tickers;
}

/** 정합성 게이트 — 두 경로 공통 */
function assertSane(agg, uniSize, kept) {
    if (agg.size < Math.min(100, uniSize * 0.3)) {
        throw new Error(`집계된 종목이 너무 적다 (${agg.size}/${uniSize}) — 적재 중단`);
    }
    if (kept < 10000) throw new Error(`채택 행이 너무 적다 (${kept}) — 적재 중단`);
}

/** 그날 «시장 전체 신규 진입» 한 줄 — 플로우 이력용 */
function flowPoint(tickers, fileDate) {
    let total = 0, call = 0, cnt = 0;
    for (const v of Object.values(tickers)) {
        for (const c of (v.top || [])) {
            if (!(c.d > 0)) continue;
            const n = c.d * 100 * (c.k || 0);
            total += n;
            if (c.t === "C") call += n;
        }
        cnt += 1;
    }
    if (!(total > 0)) return null;
    return { date: fileDate, notional: Math.round(total), callPct: Math.round((call / total) * 1000) / 10, tickers: cnt };
}

// ══════════════════════════════════════════════════════════════════════
// API 행 → 집계 행. 벌크와 «글자 그대로» 같은 값이 되게 맞춘다(실측으로 대조).
// ══════════════════════════════════════════════════════════════════════
/** API 코드(NVDA261002C00232500) → 벌크 코드(NVDA__261002C00232500 — 기초 6자리 밑줄 채움). 기준선 키와 같아야 증감이 잡힌다 */
function bulkContractCode(code) {
    const s = String(code || "");
    if (s.length <= 15) return null;
    const root = s.slice(0, s.length - 15);
    const tail = s.slice(s.length - 15);
    if (!/^\d{6}[CP]\d{8}$/.test(tail) || root.length > 6) return null;
    return root.padEnd(6, "_") + tail;
}
/** 벌크 CSV 는 그릭스·IV 를 소수 5자리로 준다(예: 0.31951 · 3.0e-05). API 는 float32 꼬리(0.3195100128…)가 붙는다 */
const r5 = (v) => { const n = num(v); return Math.round(n * 1e5) / 1e5; };
/** 행사가는 OCC 단위(1/1000) — float32 꼬리 제거 */
const r3 = (v) => { const n = num(v); return Math.round(n * 1000) / 1000; };

function mapApiRow(sym, row) {
    const o = (row && row.option) || {};
    const p = row && row.price;
    if (!p) return null;
    // ★ 조정 계약(AZN1·BABA2·BA1·CDE1/2 — 분할·합병으로 인도물이 바뀐 시리즈)은 by_ticker 에 함께 오지만 벌크는 그 기초(AZN1 …)를
    //   별도 SYMBOL 로 적어 유니버스에서 빠진다. 같은 판을 같은 범위로 — 요청한 종목의 표준 기초만 넣는다(10/01 실측 18종목 합계 차이의 원인).
    if (o.ticker != null && String(o.ticker) !== sym) return null;
    const contract = bulkContractCode(o.code);
    if (!contract) return null;
    const type = String(o.type || "").toLowerCase();
    return {
        sym, contract, date: p.date,
        oi: num(p.open_interest), vol: num(p.volume),
        isCall: type === "call",
        gamma: r5(p.gamma), strike: r3(o.strike), iv: r5(p.implied_volatility), delta: r5(p.delta),
        exp: String(o.expiration || ""),
    };
}

/** 벤더 GET — 429·5xx·시간초과만 한 번 더(예산은 분 단위로 회복). 403·404·빈 응답은 «아직 없음»이지 재시도 대상이 아니다 */
async function intrinioGet(path, query) {
    const qs = new URLSearchParams({ ...query, api_key: KEY }).toString();
    let last = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
        let r = null;
        try { r = await httpRequest(`${BASE}/${path}?${qs}`); } catch (e) { r = { ok: false, status: 0, err: e.message }; }
        if (r.ok) { try { return { ok: true, status: r.status, json: r.json() }; } catch { return { ok: false, status: r.status, err: "json" }; } }
        last = r.status;
        if (![0, 408, 429, 500, 502, 503, 504].includes(r.status)) return { ok: false, status: r.status };
        if (attempt === 0) await sleep(2000 + Math.floor(Math.random() * 1000));
    }
    return { ok: false, status: last };
}

/** 한 종목·한 날짜의 전 계약. 모든 쪽을 다 받았을 때만 ok(중간 실패·상한 = 불완전) */
async function fetchTickerDay(sym, date, pageSize = API_PAGE_SIZE) {
    const rows = [];
    let next = null, pages = 0, other = 0;
    do {
        const q = { date, page_size: String(pageSize) };
        if (next) q.next_page = next;
        const r = await intrinioGet(`options/prices/by_ticker/${encodeURIComponent(sym)}/eod`, q);
        if (!r.ok) return { ok: false, status: r.status, rows: [], pages };
        pages++;
        for (const x of (r.json.prices || [])) {
            const m = mapApiRow(sym, x);
            if (!m) continue;
            if (m.date !== date) { other++; continue; }
            rows.push(m);
        }
        next = r.json.next_page || null;
        // 공표 확인용 한 행(대표 종목) — 다음 쪽이 있는 게 정상이다. 잘림으로 읽지 않는다
        if (pageSize === 1) return { ok: true, rows, pages, other };
    } while (next && pages < API_MAX_PAGES);
    if (next) return { ok: false, status: "truncated", rows: [], pages };
    return { ok: true, rows, pages, other };
}

/** 동시 n · 호출 시작 간격 gap — 벤더 분당 예산을 앱과 나눠 쓴다 */
async function pool(items, n, gap, fn) {
    const out = new Map();
    let i = 0, lastStart = 0;
    async function worker() {
        while (i < items.length) {
            const item = items[i++];
            const wait = lastStart + gap - Date.now();
            lastStart = Math.max(Date.now(), lastStart + gap);
            if (wait > 0) await sleep(wait);
            out.set(item, await fn(item));
        }
    }
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    return out;
}

/**
 * «판이 갖춰졌나» — 직전 묶음에 있던 종목(=옵션이 있던 종목) 중 날짜 D 레코드를 가진 비율 ≥ 98%
 * 그리고 지수 ETF 4종 전부. 순수 함수(시험 대상).
 */
function apiReadiness(expected, present, uniHas) {
    const exp = expected.filter((s) => uniHas(s));
    const got = exp.filter((s) => present.has(s));
    const coverage = exp.length ? got.length / exp.length : 0;
    const mustMissing = API_MUST_HAVE.filter((s) => uniHas(s) && !present.has(s));
    const laggards = exp.filter((s) => !present.has(s));
    return { ready: exp.length > 0 && coverage >= API_READY_COVERAGE && mustMissing.length === 0, coverage, expected: exp.length, present: got.length, mustMissing, laggards };
}

/** 두 묶음의 종목별 대조 — 로그용(무회귀 실측). 같은 판이면 0 이어야 한다 */
function compareTickers(a, b) {
    const ka = Object.keys(a || {}), kb = new Set(Object.keys(b || {}));
    let same = 0; const diff = [];
    for (const s of ka) {
        if (!kb.has(s)) continue;
        const x = a[s], y = b[s];
        const eq = x.callOI === y.callOI && x.putOI === y.putOI && x.callVol === y.callVol && x.putVol === y.putVol
            && x.contracts === y.contracts && x.gammaOI === y.gammaOI && JSON.stringify(x.top) === JSON.stringify(y.top);
        if (eq) same++; else diff.push(s);
    }
    return { common: ka.filter((s) => kb.has(s)).length, same, diff, onlyA: ka.filter((s) => !kb.has(s)), onlyB: [...kb].filter((s) => !(a || {})[s]) };
}

const sumContracts = (tickers) => Object.values(tickers || {}).reduce((s, v) => s + (v.contracts || 0), 0);

/** 시험용 기준선 — Redis 가 아니라 API(그 날짜)나 파일에서. 벌크와 같은 규칙(OI ≥ 50 만) */
async function loadTestBaseline(uni) {
    if (BASELINE_FILE) {
        const b = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
        log(`시험 기준선(파일) ${b.date} · ${Object.keys(b.oi || {}).length}건`);
        return b;
    }
    if (!BASELINE_API) return null;
    const syms = [...uni].sort();
    const res = await pool(syms, API_CONCURRENCY, API_MIN_GAP_MS, (s) => fetchTickerDay(s, BASELINE_API));
    const oi = {};
    let failed = 0;
    for (const s of syms) {
        const r = res.get(s);
        if (!r || !r.ok) { failed++; continue; }
        for (const row of r.rows) if (row.oi >= MIN_OI_TRACK) oi[row.contract] = row.oi;
    }
    const b = { date: BASELINE_API, oi };
    log(`시험 기준선(API ${BASELINE_API}) ${Object.keys(oi).length}건 · 실패 ${failed}종목`);
    if (BASELINE_SAVE) fs.writeFileSync(BASELINE_SAVE, JSON.stringify(b));
    return b;
}

// ══════════════════════════════════════════════════════════════════════
// ② 벌크 경로 (기존) — 반환: { processed: bool }
// ══════════════════════════════════════════════════════════════════════
async function runBulk() {
    const t0 = Date.now();

    const meta = await httpRequest(`${BASE}/bulk_downloads/links?api_key=${encodeURIComponent(KEY)}`);
    if (!meta.ok) throw new Error(`bulk_downloads/links HTTP ${meta.status}`);
    const item = (meta.json().bulk_downloads || []).find((b) => /Options EOD/i.test(b.name || ""));
    if (!item) throw new Error("«Options EOD» 벌크를 찾지 못함");

    const dateOf = (n) => { const m = String(n).match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ""; };
    const dated = (item.links || [])
        .filter((l) => /^options_prices_eod_/.test(l.name || ""))
        .sort((a, b) => dateOf(a.name).localeCompare(dateOf(b.name)));
    const tradingOnly = dated.filter((l) => !isNonTrading(dateOf(l.name)));
    const skipped = dated.length - tradingOnly.length;

    const pool_ = WANT_DATE ? dated : tradingOnly;   // --date 는 명시 의도이므로 그대로 존중
    const pick = WANT_DATE ? pool_.find((l) => dateOf(l.name) === WANT_DATE) : pool_[pool_.length - 1];
    if (!pick) throw new Error(`대상 파일 없음 (${WANT_DATE || "최신"})`);
    const fileDate = dateOf(pick.name);
    if (!WANT_DATE && isNonTrading(fileDate)) {
        log(`최신 파일 ${fileDate} 이 휴장일 — 쓰지 않는다 (직전 정상본 유지)`);
        return { processed: false };
    }

    const prevOiReal = (await redisGet(OI_KEY)) || { date: "", oi: {} };
    // ★ [2026-10-03] 새 파일이 없으면 «받기 전에» 끝낸다. 크론이 15분마다 돌기 때문이다(예전: 133MB 를 받아 다 파싱한 뒤에야 «이미 처리»).
    //   --dry·--force·시험 실행은 예전처럼 끝까지 간다.
    if (WRITE_OK && !FORCE && prevOiReal.date && fileDate <= prevOiReal.date) {
        log(`새 벌크 없음 — 최신 ${fileDate} · 기준선 ${prevOiReal.date} (벌크 목록 갱신 ${item.last_updated || "?"})`);
        return { processed: false };
    }
    if (skipped > 0) log(`휴장·주말 파일 ${skipped}건 제외`);

    const avail = memAvailableMB();
    if (WRITE_OK && avail != null && avail < MIN_MEM_MB) {
        if (new Date(nowMs()).getUTCHours() < BULK_MEM_DEFER_UNTIL_UTC_HOUR) {
            log(`새 벌크 ${fileDate} 있음 — 서버 남은 메모리 ${avail}MB < ${MIN_MEM_MB}MB, 다음 주기로 미룬다`);
            return { processed: false, deferred: true };
        }
        log(`⚠️ 남은 메모리 ${avail}MB 이지만 ${BULK_MEM_DEFER_UNTIL_UTC_HOUR}:00 UTC 이후라 진행한다(예전 크론처럼)`);
    }

    const uni = await universe();
    const prevOi = (await loadTestBaseline(uni)) || prevOiReal;
    log(`대상 ${pick.name} · 유니버스 ${uni.size}종목 · 직전 미결제약정 ${Object.keys(prevOi.oi || {}).length}건 (${prevOi.date || "없음"}) · 벌크 목록 갱신 ${item.last_updated || "?"}`);

    // ── 스트리밍 파싱 ────────────────────────────────────────────
    const A = createAggregator(prevOi.oi);
    let seen = 0, headerIdx = null;

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
        const type = (f[headerIdx.TYPE] || "").toLowerCase();
        A.add({
            sym,
            contract: f[headerIdx.CONTRACT],
            oi: num(f[headerIdx.OPEN_INTEREST]),
            vol: num(f[headerIdx.VOLUME]),
            isCall: type === "call",
            gamma: num(f[headerIdx.GAMMA]),
            strike: num(f[headerIdx.STRIKE]),
            iv: num(f[headerIdx.IMPLIED_VOLATILITY]),
            delta: num(f[headerIdx.DELTA]),
            exp: f[headerIdx.EXPIRATION] || "",
        });

        if (seen % 500000 === 0) log(`  … ${seen.toLocaleString()}행 · 채택 ${A.stats.kept.toLocaleString()} · RSS ${mb()}MB`);
    }

    const { agg, oiOut } = A;
    const kept = A.stats.kept;
    log(`파싱 완료 — ${seen.toLocaleString()}행 중 ${kept.toLocaleString()} 채택 · ${agg.size}종목 · RSS ${mb()}MB`);

    // ── 정합성 게이트 ─────────────────────────────────────────
    assertSane(agg, uni.size, kept);

    const tickers = finalizeTickers(agg);

    const payload = JSON.stringify({ date: fileDate, prevDate: prevOi.date || null, tickers, source: "bulk", _ts: Date.now() });
    const oiPayload = JSON.stringify({ date: fileDate, oi: oiOut });
    log(`페이로드 집계 ${(payload.length / 1048576).toFixed(2)}MB · 미결제약정 ${(oiPayload.length / 1048576).toFixed(2)}MB (${Object.keys(oiOut).length.toLocaleString()}건)`);

    if (DUMP) { fs.writeFileSync(DUMP, payload); log(`--dump ${DUMP} 에 썼다(Redis 쓰기 없음)`); return { processed: false }; }
    if (DRY) {
        const s = Object.entries(tickers).slice(0, 3);
        for (const [t, v] of s) {
            log(`--dry ${t}: 콜OI ${v.callOI.toLocaleString()} 풋OI ${v.putOI.toLocaleString()} · PCR(OI) ${v.pcrOI} · 계약 ${v.contracts}`);
            if (v.top[0]) log(`        상위: ${v.top[0].c} vol ${v.top[0].v} oi ${v.top[0].oi} 증감 ${v.top[0].d ?? "—"}`);
        }
        return { processed: false };
    }

    // ★ 이미 처리한 날짜면 **아무것도 쓰지 않는다.**
    //
    //   같은 날 두 번 돌리면 두 번째 실행이 «첫 실행이 쓴 오늘 OI»를 직전으로
    //   읽는다 → prevDate 가 오늘이 되고 oiChange 가 전부 0 → 신규진입/청산
    //   구분이 통째로 죽는다. 실측(2026-08-30): date=prevDate=2026-08-28,
    //   NVDA·TSLA 12계약 전부 «단타».
    //
    //   기준선만 지키는 것으론 부족했다 — 출력의 prevDate 는 여전히 갱신된
    //   기준선을 쓰기 때문이다. 재실행은 «아무 일도 일어나지 않는» 것이 맞다.
    //   복구가 필요할 때만 --force 로 뚫는다.
    if (!FORCE && prevOi.date && fileDate <= prevOi.date) {
        log(`이미 처리한 날짜 (기준선 ${prevOi.date} · 파일 ${fileDate}) — 쓰지 않고 종료. 재실행 안전`);
        log(`  강제로 다시 쓰려면 --force`);
        return { processed: false };
    }

    // ★ [2026-10-03] 같은 날짜의 «저녁(API) 묶음»이 이미 나가 있으면 — 같은 판이어야 한다. 대조해 남긴다.
    //   벌크가 눈에 띄게 덜 찼으면(9/28 첫 파일: 계약 83%) 묶음은 더 찬 저녁 것을 남긴다. 기준선·이력은 예전처럼 벌크로.
    let keepApi = false;
    const cur = await redisGet(OUT_KEY);
    if (cur && cur.source === "api" && cur.date === fileDate && cur.tickers) {
        const cmp = compareTickers(cur.tickers, tickers);
        const apiN = Object.keys(cur.tickers).length, bulkN = Object.keys(tickers).length;
        const apiC = sumContracts(cur.tickers), bulkC = sumContracts(tickers);
        log(`저녁 묶음 대조 ${fileDate}: 공통 ${cmp.common} 중 같음 ${cmp.same} · 다름 ${cmp.diff.length}${cmp.diff.length ? ` (${cmp.diff.slice(0, 8).join(",")})` : ""} · 저녁만 ${cmp.onlyA.length} · 벌크만 ${cmp.onlyB.length}${cmp.onlyB.length ? ` (${cmp.onlyB.slice(0, 8).join(",")})` : ""} · 종목 ${apiN}/${bulkN} · 계약 ${apiC}/${bulkC}`);
        if (bulkN < apiN * BULK_KEEP_TICKERS || bulkC < apiC * BULK_KEEP_CONTRACTS) {
            keepApi = true;
            log(`⚠️ 벌크가 저녁 묶음보다 덜 찼다 (종목 ${bulkN}/${apiN} · 계약 ${bulkC}/${apiC}) — 묶음은 저녁 것을 남긴다`);
        }
    }

    if (!keepApi) await redisSet(OUT_KEY, payload, TTL_SEC);

    // ── 일별 집계 이력 ───────────────────────────────────────────
    //   지금까지 옵션 EOD 는 «당일치»만 보관했다. 그래서 화면이 「오늘
    //   $63.2B 가 들어왔다」까지만 말할 수 있고 「그게 평소보다 많은가」는
    //   말할 수 없었다. 숫자에 «평소»가 붙어야 인사이트가 된다.
    //   하루 한 줄씩 60일 롤링으로 쌓는다(페이로드 수백 바이트).
    try {
        const pt = flowPoint(tickers, fileDate);
        if (pt) {
            const prev = (await redisGet(FLOW_HIST_KEY)) || {};
            const points = Array.isArray(prev.points) ? prev.points : [];
            // 같은 날 재실행이 이력을 부풀리면 안 된다 — 날짜로 덮어쓴다
            const keptPts = points.filter((x) => x && x.date !== fileDate);
            keptPts.push(pt);
            keptPts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
            const trimmed = keptPts.slice(-60);
            await redisSet(FLOW_HIST_KEY, JSON.stringify({ points: trimmed }), TTL_SEC);
            log(`플로우 이력 ${trimmed.length}일 (오늘 $${(pt.notional / 1e9).toFixed(1)}B · 콜 ${pt.callPct}%)`);
        }
    } catch (e) {
        log(`플로우 이력 적재 실패(비치명): ${e.message}`);
    }

    // 기준선은 «날짜가 앞으로 갈 때만» 갱신한다.
    //
    //   같은 날 두 번 돌리면 (개발 중 수동 실행 + 크론) 두 번째 실행이
    //   **첫 실행이 쓴 오늘 OI 를 «직전»으로 읽는다.** 그러면 prevDate 가
    //   오늘이 되고 oiChange 가 전부 0 이 되어, 신규진입/청산 구분이 통째로
    //   죽는다. 실제로 그랬다(2026-08-30 실측: date=prevDate=2026-08-28,
    //   NVDA 12계약 전부 «단타»로 분류).
    //
    //   덮어쓰기를 막으면 재실행이 안전해진다 — 같은 날 몇 번을 돌려도
    //   기준선은 «어제»로 남는다.
    //   ⚠️ 단 --force 는 «내가 알고 한다»는 뜻이다. 휴장일 파일이 기준선을
    //      오염시킨 것을 되돌리려면 뒤로 갈 수 있어야 한다(2026-09-09 복구 때 필요했다).
    if (!prevOi.date || fileDate > prevOi.date || FORCE) {
        await redisSet(OI_KEY, oiPayload, TTL_SEC);
        log(`기준선 갱신 ${prevOi.date || "없음"} → ${fileDate}${FORCE && prevOi.date && fileDate <= prevOi.date ? " (--force 로 되돌림)" : ""}`);
    } else {
        log(`기준선 유지 (${prevOi.date}) — 파일일(${fileDate})이 앞서지 않는다. 재실행 안전`);
    }

    // 되읽기 검증 — 「썼다」가 아니라 「읽힌다」
    const back = await redisGet(OUT_KEY);
    const n = back && back.tickers ? Object.keys(back.tickers).length : 0;
    const want = keepApi ? Object.keys(cur.tickers).length : Object.keys(tickers).length;
    if (n !== want) throw new Error(`되읽기 불일치 (${n} vs ${want})`);

    log(`적재 완료 · ${n}종목 · ${keepApi ? "묶음=저녁(API) 유지 · " : ""}${((Date.now() - t0) / 1000).toFixed(0)}초 · RSS 최대 ${mb()}MB`);
    return { processed: true };
}

// ══════════════════════════════════════════════════════════════════════
// ① 저녁(API) 경로 — 묶음만 먼저. 반환: { written: bool }
// ══════════════════════════════════════════════════════════════════════
async function runApi() {
    const t0 = Date.now();
    const D = API_DATE || SESSION || apiSessionFor(nowMs());
    if (!D) { log(`저녁 경로: 지금은 대상 세션이 없다(16:00 ET 전·자정 뒤·주말·휴장) — 벌크를 기다린다`); return { written: false }; }
    if (isNonTrading(D)) { log(`저녁 경로: ${D} 는 거래일이 아니다`); return { written: false }; }

    const cur = await redisGet(OUT_KEY);
    const prevOiReal = (await redisGet(OI_KEY)) || { date: "", oi: {} };
    if (!API_DATE && !FORCE && cur && cur.date && cur.date >= D) { log(`저녁 경로: 묶음이 이미 ${cur.date}(${cur.source || "bulk"}) — 할 일 없음`); return { written: false }; }

    const uni = await universe();
    const prevOi = (await loadTestBaseline(uni)) || prevOiReal;
    // 증감은 «한 세션»이어야 한다 — 기준선이 직전 거래일이 아니면(벌크 하루 빠짐) 두 세션 증감을 «전 세션 대비»로 내게 된다
    const want = prevTradingDay(D);
    if (prevOi.date !== want) { log(`저녁 경로: 기준선 ${prevOi.date || "없음"} ≠ 직전 거래일 ${want} — 한 세션 증감을 만들 수 없어 쓰지 않는다(벌크를 기다린다)`); return { written: false }; }

    // 같은 날짜에 «다 받았는데 덜 찼다»가 이어지면 벤더를 계속 두드리지 않는다
    const st = (await redisGet(API_STATE_KEY)) || {};
    if (WRITE_OK && !FORCE && st.date === D) {
        if ((st.attempts || 0) >= API_MAX_ATTEMPTS) { log(`저녁 경로: ${D} 시도 ${st.attempts}회 — 상한, 벌크를 기다린다`); return { written: false }; }
        if (nowMs() - (Number(st.lastAt) || 0) < API_RETRY_MIN_MS) { log(`저녁 경로: ${D} 직전 시도 ${Math.round((nowMs() - st.lastAt) / 60000)}분 전 — 다음 주기에`); return { written: false }; }
    }

    const avail0 = memAvailableMB();
    if (WRITE_OK && avail0 != null && avail0 < MIN_MEM_MB) { log(`저녁 경로: 서버 남은 메모리 ${avail0}MB < ${MIN_MEM_MB}MB — 다음 주기로 미룬다`); return { written: false }; }

    // 싸게 먼저(종목당 1행): 대표 종목에 D 레코드가 아직 없으면 410콜을 쓰지 않는다
    const bell = await pool(API_BELLWETHERS, API_CONCURRENCY, API_MIN_GAP_MS, (s) => fetchTickerDay(s, D, 1));
    const bellMissing = API_BELLWETHERS.filter((s) => { const r = bell.get(s); return !r || !r.ok || !r.rows.length; });
    if (bellMissing.length) {
        const why = (s) => { const r = bell.get(s); return !r ? "?" : r.ok ? "빈 응답" : `HTTP ${r.status}`; };
        log(`저녁 경로: ${D} 판 아직 — 대표 종목 미게시 ${bellMissing.join(",")} (${bellMissing.map(why).join(",")})`);
        return { written: false };
    }

    // 판이 «처음» 보였으면 바로 받지 않는다 — 벤더가 다 올리도록 기다린다(API_SETTLE_MS). 시험·수동 실행은 기다리지 않는다
    const stD = st.date === D ? st : { date: D, attempts: 0 };
    if (WRITE_OK && !SESSION && !FORCE) {
        if (!stD.firstSeenAt) {
            await redisSet(API_STATE_KEY, { ...stD, firstSeenAt: nowMs() }, 3 * 86400);
            log(`저녁 경로: ${D} 판 첫 확인(대표 종목 ${API_BELLWETHERS.length}개) — 벤더가 다 올리도록 ${API_SETTLE_MS / 60000}분 뒤에 받는다`);
            return { written: false };
        }
        if (nowMs() - stD.firstSeenAt < API_SETTLE_MS) {
            log(`저녁 경로: ${D} 판 첫 확인 ${Math.round((nowMs() - stD.firstSeenAt) / 60000)}분 전 — ${API_SETTLE_MS / 60000}분이 지나면 받는다`);
            return { written: false };
        }
    }

    // 전체 수집 — 종목을 다 받는 즉시 집계에 넣고 원행은 버린다(메모리: 상위 36계약 + 합계만 남는다).
    //   집계는 벌크와 같은 함수다. 종목 안의 순서는 API 순서지만 동점을 코드로 끊으므로 상위 계약 선택은 순서와 무관하다.
    //   한 종목이라도 쪽을 다 못 받으면(중간 실패·상한) 그 종목은 넣지 않는다 — 덜 받은 합계를 «그 종목의 D»로 내지 않는다.
    const A = createAggregator(prevOi.oi, { trackOi: false });
    const syms = [...uni].sort();
    let lowMem = null;
    const res = await pool(syms, API_CONCURRENCY, API_MIN_GAP_MS, async (s) => {
        // 도중에 서버 메모리가 바닥나면(다른 적재와 겹침) 그만둔다 — 시도로 세지 않고 다음 주기에
        const a = memAvailableMB();
        if (lowMem != null || (a != null && a < 220)) { if (lowMem == null) lowMem = a; return { ok: false, n: 0, pages: 0, status: "low-mem" }; }
        const r = await fetchTickerDay(s, D);
        // 덜 올라온 종목(계약 수가 직전 묶음의 50% 미만)은 넣지 않는다 — 지각으로 센다
        let kept = 0;
        for (const row of r.rows) if (row.oi > 0 || row.vol > 0) kept++;
        const prevN = cur && cur.tickers && cur.tickers[s] ? Number(cur.tickers[s].contracts) || 0 : 0;
        const thin = r.ok && r.rows.length > 0 && prevN >= 20 && kept < prevN * API_TICKER_MIN_RATIO;
        if (r.ok && r.rows.length && !thin) for (const row of r.rows) A.add(row);
        return { ok: r.ok, n: thin ? 0 : r.rows.length, thin, kept, prevN, pages: r.pages, status: r.status };
    });
    if (lowMem != null) { log(`저녁 경로: 수집 도중 서버 남은 메모리 ${lowMem}MB — 그만두고 다음 주기에(시도로 세지 않는다)`); return { written: false }; }
    const present = new Set();
    const thin = [];
    let calls = 0, failed = 0;
    for (const s of syms) {
        const r = res.get(s);
        calls += (r && r.pages) || 1;
        if (r && r.thin) thin.push(`${s}(${r.kept}/${r.prevN})`);
        if (r && r.ok && r.n) present.add(s); else if (!r || !r.ok) failed++;
    }
    if (thin.length) log(`저녁 경로 ${D}: 덜 올라온 종목 ${thin.length} — ${thin.slice(0, 12).join(",")} (지각으로 센다)`);
    const expected = cur && cur.tickers ? Object.keys(cur.tickers) : syms;
    const rd = apiReadiness(expected, present, (s) => uni.has(s));
    log(`저녁 경로 ${D}: 판 ${rd.present}/${rd.expected} (${(rd.coverage * 100).toFixed(1)}%) · 지수 누락 ${rd.mustMissing.join(",") || "없음"} · 지각 ${rd.laggards.slice(0, 12).join(",") || "없음"} · 호출 ${calls} · 실패 ${failed} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    if (!rd.ready) {
        await redisSet(API_STATE_KEY, { ...stD, attempts: (stD.attempts || 0) + 1, lastAt: nowMs(), coverage: rd.coverage, laggards: rd.laggards.slice(0, 50) }, 3 * 86400);
        log(`저녁 경로: 판이 덜 갖춰졌다(기준 ${API_READY_COVERAGE * 100}% + 지수 ETF 전부) — 쓰지 않는다`);
        return { written: false };
    }

    assertSane(A.agg, uni.size, A.stats.kept);
    const tickers = finalizeTickers(A.agg);

    // 지각 종목: «D 로» 넣지 않는다. 직전 묶음 값을 «그 종목이 실제로 잰 날짜»와 함께 stale 에 둔다(종목 API 만 쓴다)
    const stale = {};
    if (cur && cur.tickers && cur.date === prevOi.date) {
        for (const s of rd.laggards) {
            if (cur.tickers[s] && !tickers[s]) stale[s] = { ...cur.tickers[s], date: cur.date, prevDate: cur.prevDate ?? null };
        }
    }

    const body = { date: D, prevDate: prevOi.date || null, tickers, source: "api", apiCoverage: { present: rd.present, expected: rd.expected } };
    if (Object.keys(stale).length) body.stale = stale;
    body._ts = Date.now();
    const payload = JSON.stringify(body);
    log(`저녁 묶음 ${D} · ${Object.keys(tickers).length}종목 · 지각 ${Object.keys(stale).length} · ${(payload.length / 1048576).toFixed(2)}MB · 채택 ${A.stats.kept.toLocaleString()}행 · RSS ${mb()}MB`);

    if (DUMP) { fs.writeFileSync(DUMP, payload); log(`--dump ${DUMP} 에 썼다(Redis 쓰기 없음)`); return { written: false }; }
    if (DRY) { log(`--dry — 쓰지 않는다`); return { written: false }; }

    await redisSet(OUT_KEY, payload, TTL_SEC);
    await redisSet(API_STATE_KEY, { ...stD, attempts: (stD.attempts || 0) + 1, lastAt: nowMs(), coverage: rd.coverage, done: true, laggards: rd.laggards.slice(0, 50) }, 3 * 86400);
    const back = await redisGet(OUT_KEY);
    const n = back && back.tickers ? Object.keys(back.tickers).length : 0;
    if (!back || back.date !== D || n !== Object.keys(tickers).length) throw new Error(`되읽기 불일치 (${back && back.date} ${n} vs ${D} ${Object.keys(tickers).length})`);
    log(`저녁 묶음 적재 완료 · ${D} · ${n}종목 · ${((Date.now() - t0) / 1000).toFixed(0)}초 · RSS 최대 ${mb()}MB`);
    return { written: true };
}

async function main() {
    loadEnv(ENV_PATH);
    PROXY_KEY = process.env.REDIS_PROXY_KEY || "";
    KEY = process.env.INTRINIO_API_KEY || "";
    if (!KEY) { console.error("[OPT] INTRINIO_API_KEY 없음"); process.exit(1); }

    if (SOURCE === "api") { await runApi(); return; }
    if (!AUTO) { await runBulk(); return; }
    // --auto: 새 벌크가 없었으면 저녁 경로를 본다(시각 게이트가 안에서 거른다).
    //   벌크 쪽 실패(목록 조회 장애 등)가 저녁 경로까지 막지 않게 — 실패는 기록하고 끝에 종료 코드로 알린다.
    let r = { processed: false }, bulkErr = null;
    try { r = await runBulk(); } catch (e) { bulkErr = e; console.error("[OPT] 벌크 경로 실패:", e.message); }
    if (!r.processed) await runApi();
    if (bulkErr) process.exitCode = 1;
}

if (require.main === module) {
    main().catch((e) => {
        console.error("[OPT] 실패:", e.message);
        process.exit(1);
    });
}

module.exports = {
    // 시험용 순수 함수
    US_HOLIDAYS, isNonTrading, prevTradingDay, etParts, lastClosedSession, apiSessionFor,
    topOrder, createAggregator, finalizeTickers, flowPoint, bulkContractCode, mapApiRow, apiReadiness, compareTickers,
    API_READY_COVERAGE, API_MUST_HAVE, TOP_PER_TICKER, MIN_OI_TRACK,
};
