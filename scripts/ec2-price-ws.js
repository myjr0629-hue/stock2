#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * SIGNUM HQ — EC2 Real-Time Price WebSocket Hub
 * ══════════════════════════════════════════════════════════════
 *
 * Connects to Polygon.io WebSocket for real-time stock price
 * streams and broadcasts to all connected browser clients.
 *
 * Architecture:
 *   Polygon WS → This Server → Browser WebSocket clients
 *
 * Client Protocol (matches WebSocketProvider.tsx):
 *   Client sends: { type: "subscribe", tickers: ["NVDA","AAPL"] }
 *   Server sends: { type: "prices", ticker: "NVDA", price: 125.43, changePct: 2.15, volume: 1234567 }
 *   Server sends: { type: "pong" }  (heartbeat response)
 *
 * Usage: node ec2-price-ws.js
 * PM2:   pm2 start ec2-price-ws.js --name price-ws
 *
 * Ports: 8083 (default, configurable via WS_PORT env)
 * Requires: ws (npm install ws)
 */

const WebSocket = require("ws");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// ── Load .env file (no dotenv dependency) ──
(function loadEnv() {
    const envPaths = [
        path.join(path.dirname(process.argv[1] || __filename), '.env'),
        '/opt/signum-ws/.env',
        path.join(process.env.HOME || '', '.env'),
    ];
    for (const p of envPaths) {
        try {
            const content = fs.readFileSync(p, 'utf8');
            content.split('\n').forEach(line => {
                const match = line.match(/^([A-Z_]+)=(.+)$/);
                if (match && !process.env[match[1]]) {
                    process.env[match[1]] = match[2].trim();
                }
            });
            console.log(`[Price WS] Loaded env from ${p}`);
            break;
        } catch (e) { /* skip */ }
    }
})();

// Node 16 compatible HTTP GET (no global fetch)
// timeoutMs 를 주면 응답이 그 안에 끝나지 않을 때 요청을 끊고 거부한다(REST 폴백이 정체 응답에 묶이지 않게).
function httpsGet(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        let timer = null, settled = false;
        const done = (fn, v) => { settled = true; if (timer) clearTimeout(timer); timer = null; fn(v); };
        const req = https.get(url, (res) => {
            let data = '';
            res.setEncoding('utf8').on('data', chunk => data += chunk);
            res.on('end', () => {
                try { done(resolve, JSON.parse(data)); }
                catch (e) { done(reject, new Error('JSON parse failed')); }
            });
            res.on('error', e => done(reject, e));
        });
        req.on('error', e => done(reject, e));
        if (timeoutMs > 0 && !settled) {
            timer = setTimeout(() => {
                timer = null;
                const err = new Error(`timeout ${timeoutMs}ms`);
                done(reject, err);
                req.destroy(err);
            }, timeoutMs);
        }
    });
}

// Helper: Get ET Date String (YYYY-MM-DD)
function getETDateString() {
    try {
        const etStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
        const et = new Date(etStr);
        const yyyy = et.getFullYear();
        const mm = String(et.getMonth() + 1).padStart(2, '0');
        const dd = String(et.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    } catch (e) {
        return new Date().toISOString().split('T')[0];
    }
}

// Fetch real previous day close for a ticker
//
// [2026-08-29] Massive → Intrinio 교체.
//   Massive REST 가 403 이라 prevClose 가 0 이 되고, 그 결과 WS 브로드캐스트의
//   changePct 가 전 종목 0% 로 나가고 있었다(실측 확인).
//   Intrinio realtime 응답의 eod_close_price 가 전일 종가의 정본이다.
function fetchPreviousClose(ticker) {
    const key = process.env.INTRINIO_API_KEY;
    if (!key) {
        console.warn('[Price WS] INTRINIO_API_KEY 없음 — prevClose 조회 불가');
        return Promise.resolve(0);
    }
    const url = `https://api-v2.intrinio.com/securities/${encodeURIComponent(ticker)}/prices/realtime?api_key=${key}`;
    return httpsGet(url)
        .then(data => {
            const eod = data && Number(data.eod_close_price);
            if (eod > 0) return eod;
            const close = data && Number(data.close_price);
            return close > 0 ? close : 0;
        })
        .catch(e => {
            console.warn(`[Price WS] Failed to fetch prevClose for ${ticker}:`, e.message);
            return 0;
        });
}

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.WS_PORT || "8084");
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "";
const POLYGON_WS_URL = "wss://socket.massive.com/stocks";
const OPTIONS_WS_URL = "wss://socket.massive.com/options";
const HEARTBEAT_INTERVAL_MS = 30000;    // 30s — ping clients
const STALE_CLIENT_MS = 120000;         // 2min — disconnect idle clients
const POLYGON_RECONNECT_DELAY_MS = 5000; // 5s initial reconnect delay
const MAX_POLYGON_RECONNECT = 20;

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════

// Client subscriptions: Map<WebSocket, { tickers: Set<string>, connectedAt, lastPing }>
const clients = new Map();

// Aggregated ticker subscriptions: Map<ticker, Set<WebSocket>>
const tickerSubscribers = new Map();

// Latest prices for immediate delivery to new subscribers
// Map<ticker, { price, changePct, volume, prevClose, ts }>
const latestPrices = new Map();
// 마지막 채택 체결의 원천 시각. 첫 구독에는 90초의 대기 시간을 준다.
const lastAcceptedTradeMs = new Map();

// Latest quotes (bid/ask) for immediate delivery
// Map<ticker, { bid, bidSize, ask, askSize, spread, ts }>
const latestQuotes = new Map();

// Throttle: broadcast at most once per THROTTLE_MS per ticker
const THROTTLE_MS = 1000; // 1 second
const lastBroadcastTime = new Map(); // Map<ticker, timestamp> (prices)
const lastQuoteBroadcastTime = new Map(); // Map<ticker, timestamp> (quotes)

// ── [2026-10-14] 서버용 실시간 체결 (/last) ────────────────────────────────────────────────
// 왜: /api/live/quotes 를 31개 이상 한 요청에 보내면(Intel 섹터 화면) 서버가 벤더 스냅샷 CSV(15분 지연 + 5분 캐시)의 호가 중간값으로 가격을 채워
//     정규장에도 최대 약 20분 묵은 값이 나갔다(HOOD 109.52 vs 110.19). 이 허브는 이미 실시간(Intrinio EQUITIES_EDGE WS, 지연 ~1초)이다 —
//     그 마지막 체결을 서버가 «읽어 가게» 한다. 벤더 REST 호출은 늘지 않는다(채널 구독만).
// liveTicks: 종목 → 마지막 «WS 체결»(REST 폴백·집계 값은 넣지 않는다). 채널을 떠나면 지운다 → 항목이 있으면 «지금 구독 중인 채널의 마지막 체결»이다.
// serverInterest: /last 가 요청한 종목 → 만료 시각. 클라이언트가 없어도 이 시각까지 채널을 유지한다(만료 청소기가 떠난다).
// serverJoined: 서버 관심으로만 채널을 연 종목 — 클라이언트 구독 상태(tickerSubscribers·subscribedOnPolygon)·latestPrices 는 건드리지 않는다
//   (건드리면 나중에 클라이언트가 구독할 때 prevClose 없는 changePct 0 캐시가 나가거나 ensurePrevClose 가 건너뛰어진다).
const liveTicks = new Map();        // Map<ticker, { p, trade, rx }>
const staleDropped = new Map();     // Map<ticker, count> (process lifetime)
const serverInterest = new Map();   // Map<ticker, expiresAtMs>
const serverJoined = new Set();     // tickers whose channel was opened only for the server
const joinedAtMs = new Map();       // Map<ticker, ms>
const SERVER_INTEREST_TTL_MS = Number(process.env.HUB_INTEREST_TTL_MS) || 20 * 60 * 1000;   // 시험에서만 환경변수로 줄인다
const SERVER_INTEREST_MAX = 150;
const LAST_MAX_SYMBOLS = 150;
const LAST_MAX_WAIT_MS = 2000;

// Polygon state
let polygonWs = null;
let polygonConnected = false;
let polygonReconnectCount = 0;
let polygonReconnectTimer = null;
let subscribedOnPolygon = new Set(); // tickers actually subscribed on Polygon

// Options WS state
let optionsWs = null;
let optionsWsConnected = false;
let optionsReconnectCount = 0;
let optionsReconnectTimer = null;
let optionsSubscribedOnMassive = new Set(); // options contract tickers subscribed
// Options subscribers: Map<optionsTicker, Set<WebSocket>>
const optionsTickerSubscribers = new Map();

// ══════════════════════════════════════════════════════════════
// POLYGON WEBSOCKET CONNECTION
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// [2026-08-29] INTRINIO WEBSOCKET (Massive 대체)
//
// Massive 는 REST 뿐 아니라 WebSocket 도 차단했다.
//   실측 로그: "Polygon auth success" → "WS closed (code: 1008)" 무한 반복.
//   1008 = Policy Violation. 인증은 통과시키고 즉시 끊는다. 재시작 2,238회.
//   그 결과 구독 시점 캐시값(어제 종가)만 한 번 송출 → 앱에 4% 틀린 가격 노출.
//
// 대응: Intrinio EQUITIES_EDGE SDK 로 교체하고, 수신 메시지를 **Massive 형식으로
// 변환**해 기존 handleTradeUpdate/handleQuoteUpdate 를 그대로 재사용한다.
// (아래 1,100여 줄의 브로드캐스트·스로틀·클라이언트 관리 로직 무수정)
//
// 정본: .agent/INTRINIO_MIGRATION_WORKLOG.md
// ══════════════════════════════════════════════════════════════

const INTRINIO_API_KEY = process.env.INTRINIO_API_KEY || "";
let intrinioClient = null;
let intrinioReady = false;

function connectIntrinioWs() {
    if (intrinioClient) {
        console.log("[Price WS] Intrinio 클라이언트 이미 존재 — 재사용");
        return;
    }
    let RealtimeClient;
    try {
        RealtimeClient = require("intrinio-realtime").RealtimeClient;
    } catch (e) {
        console.error("[Price WS] ❌ intrinio-realtime 모듈 없음:", e.message);
        return;
    }

    const onTrade = (t) => {
        try {
            // Intrinio Trade → Massive 'T' 이벤트 형식
            handleTradeUpdate({
                ev: "T",
                sym: t.Symbol,
                p: t.Price,
                s: t.Size,
                t: t.Timestamp,
                _intrinio: { mc: t.MarketCenter, dark: t.IsDarkpool, cond: t.Condition },
            });
        } catch (e) { /* 개별 틱 실패가 스트림을 죽이지 않게 */ }
    };

    const onQuote = (q) => {
        try {
            // Intrinio Quote 는 bid/ask 가 분리된 단일 메시지로 온다.
            // Massive 'Q' 는 bp/bs/ap/as 를 한 번에 담으므로, 마지막 값과 병합한다.
            const sym = q.Symbol;
            if (!sym) return;
            const prev = latestQuotes.get(sym) || {};
            const isAsk = String(q.Type || "").toLowerCase().includes("ask");
            handleQuoteUpdate({
                ev: "Q",
                sym,
                bp: isAsk ? (prev.bid || 0) : (q.Price || 0),
                bs: isAsk ? (prev.bidSize || 0) : (q.Size || 0),
                ap: isAsk ? (q.Price || 0) : (prev.ask || 0),
                as: isAsk ? (q.Size || 0) : (prev.askSize || 0),
            });
        } catch (e) { /* noop */ }
    };

    try {
        console.log("[Price WS] Connecting to Intrinio (EQUITIES_EDGE)...");
        intrinioClient = new RealtimeClient(INTRINIO_API_KEY, onTrade, onQuote, {
            provider: "EQUITIES_EDGE",
            ipAddress: undefined,
            tradesOnly: false,
            isPublicKey: false,
            delayed: false,
        });
        intrinioReady = true;
        polygonConnected = true;   // 하위 호환: 기존 상태 플래그 재사용
        polygonReconnectCount = 0;
        console.log("[Price WS] ✅ Intrinio WebSocket 연결됨");
        resubscribeAllOnPolygon();
    } catch (e) {
        console.error("[Price WS] ❌ Intrinio 연결 실패:", e.message);
        intrinioClient = null;
        intrinioReady = false;
        polygonConnected = false;
        schedulePolygonReconnect();
    }
}

/** Intrinio 구독/해지 — 기존 Massive 구독 함수에서 위임받는다 */
// ══════════════════════════════════════════════════════════════
// [2026-09-02] 티커 검증 — 재시작 2,245회의 원인이었다.
//
// 실측 로그: `[Price WS] Intrinio join 실패: offset is out of bounds`
//            `[Price WS] ⚠️ シリコン prevClose 확보 실패`
//
// 원인은 SDK 의 버퍼 계산이다(intrinio-realtime/index.js L618·L115):
//   message = new Uint8Array(2 + symbol.length);   // ← **글자 수**로 잡고
//   writeString(message, symbol, 2);               // ← **UTF-8 바이트**를 쓴다
//   가드도 `bytesAvailable < string.length` 로 글자 수를 비교해 무력하다.
//   「シリコン」= 4글자·12바이트 → 6바이트 버퍼에 12바이트 set → 예외.
//
// 즉 **비ASCII 문자가 하나라도 섞인 «티커»가 오면 프로세스가 죽는다.**
// 우리가 검증 없이 넘긴 것이 진짜 원인이므로 여기서 막는다.
// (일본어 문자열이 티커로 흘러든 경로는 별도 추적 대상.)
// ══════════════════════════════════════════════════════════════
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function sanitizeTickers(tickers, where) {
    const ok = [], bad = [];
    for (const t of (tickers || [])) {
        const v = typeof t === "string" ? t.trim().toUpperCase() : "";
        (TICKER_RE.test(v) ? ok : bad).push(v || String(t));
    }
    if (bad.length) {
        console.warn("[Price WS] ⚠️ " + where + " 잘못된 티커 " + bad.length + "건 차단: " +
            bad.slice(0, 5).map(function (x) { return JSON.stringify(x); }).join(", "));
    }
    return ok;
}

function intrinioJoin(tickers) {
    if (!intrinioClient) return;
    const safe = sanitizeTickers(tickers, "join");
    if (!safe.length) return;
    // 한 종목이 실패해도 나머지가 죽지 않도록 개별로 넣는다.
    for (const t of safe) {
        try { intrinioClient.join([t], false); }
        catch (e) { console.error("[Price WS] Intrinio join 실패(" + t + "):", e.message); }
    }
}
function intrinioLeave(tickers) {
    if (!intrinioClient) return;
    const safe = sanitizeTickers(tickers, "leave");
    if (!safe.length) return;
    for (const t of safe) {
        try { intrinioClient.leave([t]); }
        catch (e) { console.error("[Price WS] Intrinio leave 실패(" + t + "):", e.message); }
    }
}

// ══════════════════════════════════════════════════════════════
// [2026-10-14] /last — 서버(Vercel)가 «지금 구독 중인 채널의 마지막 체결»을 읽어 가는 문. 벤더 REST 호출 0.
// ══════════════════════════════════════════════════════════════
/** 원천시각은 단위만 정규화한다. 결측·timezone 없는 문자열은 0(미확인), 지연은 그대로 보존. */
function normalizeTradeMs(x) {
    if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(x)) {
        const ms = Date.parse(x);
        return Number.isFinite(ms) && ms > 0 ? ms : 0;
    }
    let v = Number(x);
    if (!isFinite(v) || v <= 0) return 0;
    if (v > 1e17) v = v / 1e6;        // ns
    else if (v > 1e14) v = v / 1e3;   // µs
    else if (v > 1e11) v = v;         // ms
    else v = v * 1000;                // s
    return Math.round(v);
}

/** 서버 관심 종목 등록 + 채널 열기. 새로 연 종목 목록을 돌려준다. */
function serverJoin(tickers) {
    const now = Date.now();
    const fresh = [];
    for (const t of tickers) {
        if (!serverInterest.has(t) && serverInterest.size >= SERVER_INTEREST_MAX) continue;
        serverInterest.set(t, now + SERVER_INTEREST_TTL_MS);
        if (!(intrinioReady && intrinioClient)) continue;
        if (subscribedOnPolygon.has(t) || serverJoined.has(t)) continue;   // 이미 열려 있다(클라이언트 구독 또는 이전 서버 관심)
        intrinioJoin([t]);
        serverJoined.add(t);
        joinedAtMs.set(t, now);
        fresh.push(t);
    }
    return fresh;
}

/** Intrinio 재연결 뒤 서버 관심 채널을 다시 연다(클라이언트 재구독과 별개 — ensurePrevClose 를 부르지 않는다). */
function rejoinServerInterest() {
    const now = Date.now();
    const list = [];
    for (const [t, exp] of serverInterest) if (exp > now) list.push(t);
    if (list.length) intrinioJoin(list);
}

/** 만료된 서버 관심을 걷고, 클라이언트도 없으면 채널을 떠난다. */
function sweepServerInterest() {
    const now = Date.now();
    for (const [t, exp] of [...serverInterest]) {
        if (exp > now) continue;
        serverInterest.delete(t);
        if (tickerSubscribers.has(t) || subscribedOnPolygon.has(t)) { serverJoined.delete(t); continue; }   // 클라이언트가 쓰는 채널은 둔다
        if (serverJoined.has(t)) {
            intrinioLeave([t]);
            serverJoined.delete(t);
            liveTicks.delete(t);
            joinedAtMs.delete(t);
        }
    }
}
setInterval(sweepServerInterest, Number(process.env.HUB_INTEREST_SWEEP_MS) || 30 * 1000);

function lastSnapshot(symbols) {
    const now = Date.now();
    const ticks = {};
    for (const t of symbols) {
        const v = liveTicks.get(t);
        if (v && v.p > 0) ticks[t] = { p: v.p, trade: v.trade, rx: v.rx, joined: joinedAtMs.get(t) || 0, basis: "fair_value", source: "equities_edge" };
    }
    return { now, live: !restFallbackActive, ticks };
}

function handleLast(req, res) {
    let params;
    try { params = new URL(req.url, "http://hub").searchParams; } catch { res.writeHead(400); res.end("bad url"); return; }
    const raw = String(params.get("symbols") || "").split(",").map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean).slice(0, LAST_MAX_SYMBOLS);
    const symbols = raw.filter(function (t) { return TICKER_RE.test(t); });
    const waitMs = Math.min(LAST_MAX_WAIT_MS, Math.max(0, Number(params.get("wait")) || 0));
    const fresh = symbols.length ? serverJoin(symbols) : [];
    const send = function () {
        const body = lastSnapshot(symbols);
        body.pending = fresh.filter(function (t) { return !body.ticks[t]; });
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(body));
    };
    if (!waitMs || !fresh.length) { send(); return; }
    // 방금 채널을 연 종목은 첫 체결을 잠깐(최대 waitMs) 기다린다 — 서버가 첫 요청에도 실시간 값을 받도록.
    const deadline = Date.now() + waitMs;
    const poll = function () {
        const missing = fresh.some(function (t) { return !liveTicks.has(t); });
        if (!missing || Date.now() >= deadline) { send(); return; }
        setTimeout(poll, 80);
    };
    poll();
}

function connectToPolygon() {
    // Intrinio 키가 있으면 그쪽을 쓴다 (Massive 는 차단됨)
    if (INTRINIO_API_KEY) {
        connectIntrinioWs();
        return;
    }

    // ⛔ 아래는 **죽은 경로**다. Massive(Polygon) 계정은 2026-08 약관 위반으로
    //    차단됐고 WS 는 auth 직후 close(1008) 로 끊긴다.
    //    예전에는 INTRINIO_API_KEY 가 없으면 조용히 이쪽으로 흘렀는데,
    //    «연결 시도 → 실패 → 재연결 루프»가 되어 원인을 찾기 어려웠다.
    //    설정 누락은 조용한 폴백이 아니라 **명확한 실패**로 드러나야 한다.
    console.error("[Price WS] ❌ INTRINIO_API_KEY 가 없다. Massive 는 영구 차단되어 폴백이 없다.");
    console.error("[Price WS]    /opt/signum-ws/.env 의 INTRINIO_API_KEY 를 확인할 것.");
    if (!process.env.ALLOW_DEAD_MASSIVE_WS) return;

    if (!POLYGON_API_KEY) {
        console.error("[Price WS] ❌ No POLYGON_API_KEY set. Cannot connect to Polygon.");
        return;
    }

    try {
        console.log("[Price WS] Connecting to Polygon WebSocket (죽은 경로 · 강제 활성화됨)...");
        polygonWs = new WebSocket(POLYGON_WS_URL);

        polygonWs.on("open", () => {
            console.log("[Price WS] ✅ Polygon WebSocket connected");
            polygonConnected = true;
            polygonReconnectCount = 0;

            // Authenticate
            polygonWs.send(JSON.stringify({ action: "auth", params: POLYGON_API_KEY }));
        });

        polygonWs.on("message", (data) => {
            try {
                const messages = JSON.parse(data.toString());
                if (!Array.isArray(messages)) return;

                for (const msg of messages) {
                    // Authentication response
                    if (msg.ev === "status") {
                        if (msg.status === "auth_success") {
                            console.log("[Price WS] ✅ Polygon auth success");
                            // Re-subscribe all tickers that clients want
                            resubscribeAllOnPolygon();
                        } else if (msg.status === "auth_failed") {
                            console.error("[Price WS] ❌ Polygon auth failed:", msg.message);
                        } else if (msg.status === "success") {
                            console.log("[Price WS] Polygon:", msg.message);
                        }
                        continue;
                    }

                    // Trade events (T.NVDA = trade for NVDA)
                    if (msg.ev === "T") {
                        handleTradeUpdate(msg);
                    }

                    // Aggregate per-second bars (A.NVDA)
                    if (msg.ev === "A") {
                        handleAggregateUpdate(msg);
                    }

                    // Aggregate per-minute bars (AM.NVDA)
                    if (msg.ev === "AM") {
                        handleAggregateUpdate(msg);
                    }

                    // Quotes NBBO (Q.NVDA = best bid/offer)
                    if (msg.ev === "Q") {
                        handleQuoteUpdate(msg);
                    }

                    // LULD events (Limit Up / Limit Down)
                    if (msg.ev === "LULD") {
                        handleLuldUpdate(msg);
                    }
                }
            } catch (e) {
                // Non-JSON or parse error — ignore
            }
        });

        polygonWs.on("close", (code, reason) => {
            console.log(`[Price WS] Polygon WS closed (code: ${code})`);
            polygonConnected = false;
            polygonWs = null;
            subscribedOnPolygon.clear();
            schedulePolygonReconnect();
        });

        polygonWs.on("error", (e) => {
            console.error("[Price WS] Polygon WS error:", e.message);
            if (polygonWs) {
                try { polygonWs.close(); } catch {}
            }
        });
    } catch (e) {
        console.error("[Price WS] Failed to create Polygon WS:", e.message);
        schedulePolygonReconnect();
    }
}

function schedulePolygonReconnect() {
    if (polygonReconnectTimer) return;
    if (polygonReconnectCount >= MAX_POLYGON_RECONNECT) {
        console.error("[Price WS] Max Polygon reconnect attempts reached. Giving up.");
        return;
    }

    const delay = POLYGON_RECONNECT_DELAY_MS * Math.pow(1.5, polygonReconnectCount);
    polygonReconnectCount++;
    console.log(`[Price WS] Reconnecting to Polygon in ${Math.round(delay / 1000)}s (attempt ${polygonReconnectCount})`);
    polygonReconnectTimer = setTimeout(() => {
        polygonReconnectTimer = null;
        connectToPolygon();
    }, delay);
}

function resubscribeAllOnPolygon() {
    // [2026-08-29] Intrinio 경로 — SDK 가 구독을 관리한다
    if (intrinioReady && intrinioClient) {
        const all = [...tickerSubscribers.keys()];
        if (all.length) {
            intrinioJoin(all);
            all.forEach(t => {
                subscribedOnPolygon.add(t);
                ensurePrevClose(t);   // ← changePct 기준값. 빠지면 전 종목 0%
            });
            console.log(`[Price WS] Intrinio 재구독 ${all.length}종목`);
        }
        rejoinServerInterest();
        return;
    }

    if (!polygonWs || polygonWs.readyState !== WebSocket.OPEN) return;

    const allTickers = new Set();
    for (const [ticker] of tickerSubscribers) {
        allTickers.add(ticker);
    }

    if (allTickers.size === 0) return;

    // Subscribe to Trades (T.), per-second aggs (A.), and per-minute aggs (AM.)
    const tickerList = [...allTickers];
    const subs = tickerList.flatMap(t => [`T.${t}`, `A.${t}`, `AM.${t}`, `Q.${t}`, `LULD.${t}`]).join(",");
    polygonWs.send(JSON.stringify({ action: "subscribe", params: subs }));
    tickerList.forEach(t => subscribedOnPolygon.add(t));
    console.log(`[Price WS] Subscribed to ${tickerList.length} tickers (T+A+AM+Q+LULD): ${tickerList.slice(0, 10).join(", ")}${tickerList.length > 10 ? "..." : ""}`);
}

/**
 * prevClose 확보 — changePct 계산의 기준값.
 * ⚠️ 이 로직이 없으면 WS 브로드캐스트의 changePct 가 전 종목 0% 로 나간다.
 *    (2026-08-29 실제 발생: Intrinio 분기가 Massive 전용 코드보다 먼저 return 하면서
 *     아래 prevClose 초기화가 통째로 건너뛰어졌다.)
 */
function ensurePrevClose(ticker) {
    const todayStr = getETDateString();
    const existing = latestPrices.get(ticker);
    if (existing && existing.prevClose > 0 && existing.prevCloseDate === todayStr) {
        subscribeQuotesForTicker(ticker);
        return;
    }
    if (existing && existing.isFetchingPrevClose) return;

    latestPrices.set(ticker, { ...(existing || {}), isFetchingPrevClose: true });
    fetchPreviousClose(ticker).then(prevClose => {
        const cur = latestPrices.get(ticker) || {};
        if (prevClose > 0) {
            // 이미 들어온 틱이 있으면 changePct 를 즉시 보정
            const price = cur.price || 0;
            const changePct = price > 0 ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : (cur.changePct || 0);
            latestPrices.set(ticker, { ...cur, prevClose, prevCloseDate: todayStr, changePct, isFetchingPrevClose: false });
            console.log(`[Price WS] 📊 ${ticker} prevClose: $${prevClose} (${todayStr})`);
            subscribeQuotesForTicker(ticker);
        } else {
            latestPrices.set(ticker, { ...cur, isFetchingPrevClose: false });
            console.warn(`[Price WS] ⚠️ ${ticker} prevClose 확보 실패 — changePct 0 으로 나갈 수 있음`);
        }
    });
}

function subscribeTickerOnPolygon(ticker) {
    // [2026-08-29] Intrinio 경로
    if (intrinioReady && intrinioClient) {
        if (subscribedOnPolygon.has(ticker)) return;
        intrinioJoin([ticker]);
        subscribedOnPolygon.add(ticker);
        ensurePrevClose(ticker);   // ← 반드시 필요. 없으면 changePct 0%
        return;
    }
    if (subscribedOnPolygon.has(ticker)) return;
    if (!polygonWs || polygonWs.readyState !== WebSocket.OPEN) return;

    polygonWs.send(JSON.stringify({ action: "subscribe", params: `T.${ticker},A.${ticker},AM.${ticker},Q.${ticker},LULD.${ticker}` }));
    subscribedOnPolygon.add(ticker);
    console.log(`[Price WS] + Subscribed to T/A/AM/Q/LULD.${ticker} on Massive`);

    const todayStr = getETDateString();
    const existing = latestPrices.get(ticker);

    // Fetch real previousClose from REST API for accurate changePct
    if (!existing || !existing.prevClose || existing.prevCloseDate !== todayStr) {
        fetchPreviousClose(ticker).then(prevClose => {
            if (prevClose > 0) {
                const cur = latestPrices.get(ticker) || {};
                latestPrices.set(ticker, { ...cur, prevClose, prevCloseDate: todayStr });
                console.log(`[Price WS] 📊 ${ticker} prevClose: $${prevClose} (${todayStr})`);
                // After we have prevClose, subscribe Q. for ATM options
                subscribeQuotesForTicker(ticker);
            }
        });
    } else {
        // Already have price, subscribe Q. now
        subscribeQuotesForTicker(ticker);
    }
}

function unsubscribeTickerOnPolygon(ticker) {
    // [2026-08-29] Intrinio 경로
    if (intrinioReady && intrinioClient) {
        if (!subscribedOnPolygon.has(ticker)) return;
        // [2026-10-14] 서버(/last)가 아직 관심이면 채널을 유지한다 — 클라이언트 구독 상태만 정리하고, 만료 청소기가 떠난다.
        if ((serverInterest.get(ticker) || 0) > Date.now()) {
            subscribedOnPolygon.delete(ticker);
            serverJoined.add(ticker);
            return;
        }
        intrinioLeave([ticker]);
        subscribedOnPolygon.delete(ticker);
        liveTicks.delete(ticker);
        joinedAtMs.delete(ticker);
        return;
    }
    if (!subscribedOnPolygon.has(ticker)) return;
    if (!polygonWs || polygonWs.readyState !== WebSocket.OPEN) return;

    polygonWs.send(JSON.stringify({ action: "unsubscribe", params: `T.${ticker},A.${ticker},AM.${ticker},Q.${ticker},LULD.${ticker}` }));
    subscribedOnPolygon.delete(ticker);
    console.log(`[Price WS] - Unsubscribed from T/A/AM/Q/LULD.${ticker} on Massive`);
}

// Helper: Check if day rolled over and trigger prevClose refresh
function checkAndRefreshPrevClose(ticker, existing) {
    if (!existing) return;
    const todayStr = getETDateString();
    if (existing.prevClose && existing.prevCloseDate !== todayStr && !existing.isFetchingPrevClose) {
        existing.isFetchingPrevClose = true;
        fetchPreviousClose(ticker).then(prevClose => {
            if (prevClose > 0) {
                const cur = latestPrices.get(ticker) || {};
                latestPrices.set(ticker, { ...withPrevClose(cur, prevClose, todayStr), isFetchingPrevClose: false });
                rebroadcastIfPrevCloseChanged(ticker, cur.prevClose);
                console.log(`[Price WS] 📊 Rolled over & updated ${ticker} prevClose to $${prevClose} for ${todayStr}`);
            } else {
                const cur = latestPrices.get(ticker) || {};
                latestPrices.set(ticker, { ...cur, isFetchingPrevClose: false });
            }
        }).catch(() => {
            const cur = latestPrices.get(ticker) || {};
            latestPrices.set(ticker, { ...cur, isFetchingPrevClose: false });
        });
    }
}

function handleAggregateUpdate(msg) {
    const ticker = msg.sym;
    if (!ticker) return;
    markPolygonDataReceived(); // Track that Polygon WS is alive

    const price = msg.c || msg.vw || 0; // close or vwap
    const volume = msg.v || 0;
    const open = msg.o || price;

    // Update latest price cache (prevClose must come from REST API, never from trade/agg data)
    const existing = latestPrices.get(ticker);
    checkAndRefreshPrevClose(ticker, existing);

    const prevClose = existing?.prevClose || 0;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    latestPrices.set(ticker, {
        price,
        changePct: Math.round(changePct * 100) / 100,
        volume,
        prevClose,
        prevCloseDate: existing?.prevCloseDate || getETDateString(),
        ts: Date.now(),
    });

    // Broadcast to subscribed clients (throttled: 1s per ticker)
    throttledBroadcast(ticker, price, changePct, volume);
}

// 수신 시각의 ET 평일 정규장에만 원천 체결 지연을 검사한다.
const regularSessionFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
// NYSE full-day closures, 2026–2027: https://www.nyse.com/markets/hours-calendars
// Kept local because this Node 16 standalone hub cannot load the TypeScript marketDaySSOT.
const MARKET_HOLIDAYS = new Set([
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
    '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);
// 조기 폐장(13:00 ET) — src/lib/marketCalendar.ts EARLY_CLOSE_DATES 와 같은 날짜(시험이 두 정의 일치를 단언한다).
const EARLY_CLOSE_DATES = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);
function isRegularSession(rx) {
    const parts = Object.fromEntries(regularSessionFormatter.formatToParts(rx).map(p => [p.type, p.value]));
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    return !['Sat', 'Sun'].includes(parts.weekday) && !MARKET_HOLIDAYS.has(date) &&
        minutes >= 570 && minutes < (EARLY_CLOSE_DATES.has(date) ? 780 : 960);
}
function shouldDropStaleTrade(eventMs, rx) {
    return eventMs > 0 && rx - eventMs > 90_000 && isRegularSession(rx);
}
// prevClose 를 바꿀 때 캐시 가격이 있으면 등락률도 같은 기준으로 다시 계산한다.
function withPrevClose(cur, prevClose, prevCloseDate) {
    const price = Number(cur?.price) || 0;
    const next = { ...(cur || {}), prevClose, prevCloseDate };
    if (price > 0 && prevClose > 0) next.changePct = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
    return next;
}

// prevClose 가 실제로 바뀌고 캐시 가격이 방송 가능하면 기존 구독자에게 1회 다시 알린다(가격·시각은 캐시 값 그대로).
function rebroadcastIfPrevCloseChanged(ticker, oldPrevClose) {
    const cur = latestPrices.get(ticker);
    if (!cur || !(cur.price > 0) || !(cur.prevClose > 0) || cur.prevClose === oldPrevClose) return;
    if (!isSnapshotSendable(cur, Date.now())) return;
    broadcastPrice(ticker, cur.price, cur.changePct, cur.volume);
}

// 구독 즉시 전송할 캐시 가격인가 — 정규장 밖은 기존대로, 정규장엔 시각 있는 90초 안 체결만.
function isSnapshotSendable(cached, now) {
    if (!isRegularSession(now)) return true;
    const ts = Number(cached.ts) || 0;
    return cached.priceBasis !== 'eod_close' && ts > 0 && now - ts <= 90_000;
}

function handleTradeUpdate(msg) {
    const ticker = msg.sym;
    if (!ticker) return;

    const price = msg.p || 0;
    const volume = msg.s || 0;

    const rx = Date.now();
    const eventMs = normalizeTradeMs(msg.t);
    if (shouldDropStaleTrade(eventMs, rx)) {
        staleDropped.set(ticker, (staleDropped.get(ticker) || 0) + 1);
        const cached = latestPrices.get(ticker);
        if (cached) {
            const ts = Number(cached.ts);
            const current = Object.fromEntries(regularSessionFormatter.formatToParts(rx).map(p => [p.type, p.value]));
            const prior = ts > 0 && Number.isFinite(ts)
                ? Object.fromEntries(regularSessionFormatter.formatToParts(ts).map(p => [p.type, p.value])) : null;
            if (!prior || rx - ts > 90_000 || prior.year !== current.year || prior.month !== current.month ||
                prior.day !== current.day || Number(prior.hour) * 60 + Number(prior.minute) < 570) {
                const { price, changePct, volume, ts, receivedAt, priceBasis, priceSource, ...retained } = cached;
                // 가격은 지워도 마지막 채택 체결 시각은 REST 폴백의 역행 비교용으로 남긴다.
                const lastTradeTs = Math.max(Number(ts) || 0, Number(retained.lastTradeTs) || 0);
                if (lastTradeTs > 0) retained.lastTradeTs = lastTradeTs;
                latestPrices.set(ticker, retained);
            }
        }
        return;
    }
    markPolygonDataReceived(); // Track only accepted WS data
    if (price > 0 && tickerSubscribers.has(ticker)) {
        lastAcceptedTradeMs.set(ticker, eventMs > 0 ? Math.min(eventMs, rx) : rx);
    }
    // /last 와 방송 모두 원천시각·수신시각을 분리한다. EquitiesEdge 가격은 공정 시장가다.
    if (msg._intrinio && price > 0) {
        liveTicks.set(ticker, { p: price, trade: eventMs, rx });
    }
    // 서버 관심으로만 열어 둔 채널(클라이언트 구독 없음)의 체결은 latestPrices·브로드캐스트를 건드리지 않는다 — 나중에 클라이언트가 구독할 때 prevClose 없는 값이 캐시로 나가지 않게.
    if (!tickerSubscribers.has(ticker) && !subscribedOnPolygon.has(ticker) && serverJoined.has(ticker)) return;

    const existing = latestPrices.get(ticker);
    checkAndRefreshPrevClose(ticker, existing);

    const prevClose = existing?.prevClose || 0;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    latestPrices.set(ticker, {
        price,
        changePct: Math.round(changePct * 100) / 100,
        volume: (existing?.volume || 0) + volume,
        prevClose,
        prevCloseDate: existing?.prevCloseDate || getETDateString(),
        ts: eventMs,
        receivedAt: rx,
        priceBasis: msg._intrinio ? "fair_value" : "trade",
        priceSource: msg._intrinio ? "equities_edge" : null,
    });

    throttledBroadcast(ticker, price, changePct, (existing?.volume || 0) + volume);
}

function throttledBroadcast(ticker, price, changePct, volume) {
    const now = Date.now();
    const lastTime = lastBroadcastTime.get(ticker) || 0;
    if (now - lastTime < THROTTLE_MS) return; // Skip: within throttle window
    lastBroadcastTime.set(ticker, now);
    broadcastPrice(ticker, price, changePct, volume);
}

function broadcastPrice(ticker, price, changePct, volume) {
    const subscribers = tickerSubscribers.get(ticker);
    if (!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify({
        type: "prices",
        ticker,
        price: Math.round(price * 100) / 100,
        changePct: Math.round(changePct * 100) / 100,
        volume,
        ts: latestPrices.get(ticker)?.ts || 0,
        receivedAt: latestPrices.get(ticker)?.receivedAt || 0,
        priceBasis: latestPrices.get(ticker)?.priceBasis || null,
        priceSource: latestPrices.get(ticker)?.priceSource || null,
    });

    let sent = 0;
    for (const ws of subscribers) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(message);
                sent++;
            } catch {}
        }
    }
}

// ══════════════════════════════════════════════════════════════
// QUOTE (NBBO) HANDLER
// ══════════════════════════════════════════════════════════════

function handleQuoteUpdate(msg) {
    const ticker = msg.sym;
    if (!ticker) return;
    markPolygonDataReceived();

    const bid = msg.bp || 0;
    const bidSize = msg.bs || 0;
    const ask = msg.ap || 0;
    const askSize = msg.as || 0;
    const spread = (ask > 0 && bid > 0) ? Math.round((ask - bid) * 100) / 100 : 0;

    latestQuotes.set(ticker, { bid, bidSize, ask, askSize, spread, ts: Date.now() });

    // Throttle quote broadcasts (1s per ticker)
    const now = Date.now();
    const lastTime = lastQuoteBroadcastTime.get(ticker) || 0;
    if (now - lastTime < THROTTLE_MS) return;
    lastQuoteBroadcastTime.set(ticker, now);

    broadcastQuote(ticker, bid, bidSize, ask, askSize, spread);
}

function broadcastQuote(ticker, bid, bidSize, ask, askSize, spread) {
    const subscribers = tickerSubscribers.get(ticker);
    if (!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify({
        type: "quote",
        ticker,
        bid, bidSize, ask, askSize, spread,
    });

    for (const ws of subscribers) {
        if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(message); } catch {}
        }
    }
}

// ══════════════════════════════════════════════════════════════
// LULD (LIMIT UP LIMIT DOWN) HANDLER
// ══════════════════════════════════════════════════════════════

function handleLuldUpdate(msg) {
    const ticker = msg.T || msg.sym;
    if (!ticker) return;
    markPolygonDataReceived();

    const upperLimit = msg.high_limit || msg.up || 0;
    const lowerLimit = msg.low_limit || msg.down || 0;
    const indicator = msg.indicator || 0;
    // Indicator codes: 1=opening, 2=tier1 reopening, 3=tier2 reopening,
    // 17=trading halt, 18=trading resume

    console.log(`[Price WS] ⚡ LULD event: ${ticker} upper=$${upperLimit} lower=$${lowerLimit} indicator=${indicator}`);

    // Always broadcast LULD immediately (no throttle — rare and critical events)
    broadcastLuld(ticker, upperLimit, lowerLimit, indicator);
}

function broadcastLuld(ticker, upperLimit, lowerLimit, indicator) {
    const subscribers = tickerSubscribers.get(ticker);
    if (!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify({
        type: "luld",
        ticker,
        upperLimit, lowerLimit, indicator,
        ts: Date.now(),
    });

    for (const ws of subscribers) {
        if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(message); } catch {}
        }
    }
}

// ══════════════════════════════════════════════════════════════
// OPTIONS WEBSOCKET — Intrinio OPTIONS_EDGE (2026-09-02 이관)
// ══════════════════════════════════════════════════════════════
// 이관 전: wss://socket.massive.com/options — 벤더 차단으로 close(1006) 무한
//          재접속. 그래서 ENABLE_OPTIONS_WS 로 통째로 꺼둔 상태였다.
//
// 이관 후: Intrinio 실시간 옵션. **provider 가 2개이고 우리 것은 OPTIONS_EDGE 다.**
//   OPRA         -> realtime-options.intrinio.com … 우리 계정 X (빈 HTTP 200)
//   OPTIONS_EDGE -> options-edge.intrinio.com     … O 핸드셰이크·수신 확인
//
// Node 용 옵션 SDK 가 없어 공식 파이썬 SDK 를 정본으로 프로토콜을 직접 옮겼다:
//   scripts/intrinio-options-ws.js  (정본: intriniorealtime/options_client.py)
//
// * 구독 방식이 바뀌었다. Massive 는 `T.*` 와일드카드였고 Intrinio 는
//   **티커 단위 구독**(join('NVDA') = NVDA 전 계약)이다. 화면이 어차피
//   기초자산으로 거르므로 대역폭이 줄고 정확도는 같다.
//   ($FIREHOSE 는 100Mbps+ 이고 별도 승인이 필요하다 — 쓰지 않는다.)
//
// 수신 메시지는 **기존 Massive 형식으로 변환**해 기존 핸들러
// (handleOptionsTradeUpdate / handleOptionsQuoteUpdate)를 그대로 태운다.
// 주식 WS 이관 때와 같은 방식이라 하류 코드는 무수정이다.
// ══════════════════════════════════════════════════════════════

let intrinioOptions = null;
let optionsPriceOnlySeen = 0;

/**
 * 계약별 실시간 «가격»만 브로드캐스트한다.
 * OPTIONS_EDGE 가 주는 것이 가격뿐이므로, 프리미엄·체결규모를 지어내지 않고
 * 있는 것만 그대로 내보낸다. 구독자가 없으면 아무 일도 하지 않는다.
 */
function broadcastOptionPrice(optionsTicker, price, ts) {
    if (!optionsTicker || !(price > 0)) return;
    const subs = optionsTickerSubscribers.get(optionsTicker);
    if (!subs || subs.size === 0) return;
    const msg = JSON.stringify({
        type: 'optionPrice', sym: optionsTicker, price, ts,
        source: 'intrinio-options-edge', priceOnly: true,
    });
    for (const ws of subs) {
        if (ws.readyState === WebSocket.OPEN) { try { ws.send(msg); } catch { } }
    }
}

/** Intrinio 계약코드 -> Massive 표기.  NVDA__260904C00200000 -> O:NVDA260904C00200000 */
function intrinioContractToMassive(c) {
    if (!c) return null;
    const sym = c.slice(0, 6).replace(/_+$/, "");
    return "O:" + sym + c.slice(6);
}

function connectToOptionsWs() {
    if (process.env.ENABLE_OPTIONS_WS === "0") {
        if (!connectToOptionsWs._warned) {
            console.log("[Options WS] ENABLE_OPTIONS_WS=0 으로 비활성화됨");
            connectToOptionsWs._warned = true;
        }
        optionsWsConnected = false;
        return;
    }
    if (intrinioOptions) return;   // 이미 연결/재연결 중

    const key = process.env.INTRINIO_API_KEY || "";
    if (!key) {
        console.error("[Options WS] INTRINIO_API_KEY 없음 — 옵션 WS 미연결");
        return;
    }

    let OptionsWsClient;
    try {
        ({ OptionsWsClient } = require("./intrinio-options-ws"));
    } catch (e) {
        console.error("[Options WS] intrinio-options-ws 모듈 없음:", e.message);
        return;
    }

    intrinioOptions = new OptionsWsClient({
        apiKey: key,
        provider: process.env.INTRINIO_OPTIONS_PROVIDER || "OPTIONS_EDGE",
        // ⚠️⚠️ [2026-09-02 개장 중 실측] OPTIONS_EDGE 는 **가격만** 준다.
        //   45초 표본 31,659건 중 size>0 이 **0건**. bid/ask@execution·기초자산가·
        //   qualifier·거래소도 전부 비어 온다(qual=0x20202020 공백, exch=32).
        //   워크로그의 EQUITIES_EDGE 와 같은 패턴이다 — 필드는 있는데 값이 안 온다.
        //
        //   그대로 기존 핸들러에 태우면 프리미엄 = 가격 × **0** × 100 = 0 이라
        //   `premium < 10000` 필터에 전부 걸려 **아무것도 앱에 가지 않는다.**
        //   그런데 소켓은 «연결됨»이고 초당 수백 건이 들어온다 — 지표판은 건강한데
        //   화면엔 아무것도 없는, 가장 잡기 어려운 실패다.
        //
        //   → 프리미엄·BLOCK/SWEEP 경로에는 **태우지 않는다.** 이 피드로 할 수 있는
        //     것은 «계약별 실시간 가격»이고, 그건 그대로 브로드캐스트한다.
        //     (size 가 들어오기 시작하면 아래 가드가 자동으로 풀린다.)
        onTrade: (t) => {
            optionsPriceOnlySeen++;
            if (!(t.size > 0)) {
                broadcastOptionPrice(intrinioContractToMassive(t.contract), t.price, t.timestamp);
                return;
            }
            handleOptionsTradeUpdate({
                sym: intrinioContractToMassive(t.contract),
                p: t.price, s: t.size, x: t.exchange, c: [], t: t.timestamp,
            });
        },
        onQuote: (q) => {
            handleOptionsQuoteUpdate({
                sym: intrinioContractToMassive(q.contract),
                bp: q.bidPrice, bs: q.bidSize, ap: q.askPrice, as: q.askSize,
            });
        },
        onStatus: (m) => {
            console.log("[Options WS] " + m);
            if (m.indexOf("connected") === 0) {
                optionsWsConnected = true;
                optionsReconnectCount = 0;
                resubscribeAllOptions();
                // 5분마다 «가격만 오는지»를 실제 수신값으로 재보고한다.
                // 언젠가 size 가 들어오기 시작하면 이 로그가 먼저 알려 준다.
                if (!connectToOptionsWs._probe) {
                    connectToOptionsWs._probe = setInterval(() => {
                        const st = intrinioOptions && intrinioOptions.stats;
                        if (!st) return;
                        console.log('[Options WS] 수신 ' + st.trades + '건 · 가격전용 ' + optionsPriceOnlySeen +
                            '건 (' + (st.trades ? Math.round(optionsPriceOnlySeen / st.trades * 100) : 0) + '%)');
                    }, 300000);
                }
            } else if (m.indexOf("closed") === 0) {
                optionsWsConnected = false;
            }
        },
    });

    intrinioOptions.start().catch((e) => {
        console.error("[Options WS] 연결 실패:", e.message);
        optionsWsConnected = false;
        intrinioOptions = null;
        scheduleOptionsReconnect();
    });
}

function scheduleOptionsReconnect() {
    if (optionsReconnectTimer) return;
    if (optionsReconnectCount >= MAX_POLYGON_RECONNECT) {
        console.error("[Options WS] Max reconnect attempts reached.");
        return;
    }

    const delay = POLYGON_RECONNECT_DELAY_MS * Math.pow(1.5, optionsReconnectCount);
    optionsReconnectCount++;
    console.log(`[Options WS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${optionsReconnectCount})`);
    optionsReconnectTimer = setTimeout(() => {
        optionsReconnectTimer = null;
        connectToOptionsWs();
    }, delay);
}

function resubscribeAllOptions() {
    if (!intrinioOptions || !intrinioOptions.ready) return;
    // Intrinio 는 **기초자산 티커 하나로 그 종목 전 계약의 체결+호가**를 준다.
    // Massive 시절의 `T.*` 와일드카드 + ATM 계약 개별 Q. 구독이 모두 이걸로 대체된다.
    const tickers = [];
    for (const entry of tickerSubscribers) tickers.push(entry[0]);
    if (tickers.length === 0) {
        console.log("[Options WS] 구독할 활성 티커 없음 — 클라이언트 접속 시 구독한다");
        return;
    }
    intrinioOptions.join.apply(intrinioOptions, tickers);
    console.log("[Options WS] 구독 " + tickers.length + "종목: " + tickers.slice(0, 12).join(",") + (tickers.length > 12 ? " …" : ""));
}

// ── 티커 구독 ────────────────────────────────────────────────────────
// [2026-09-02] Massive 시절에는 REST 로 ATM 계약 10개를 긁어 Q. 를 개별 구독했다.
//   그 REST 는 계정 차단으로 403 이었고, Intrinio 는 티커 하나로 체결+호가를
//   함께 주므로 **그 로직 전체가 불필요하다.** (죽은 벤더 호출도 같이 사라진다.)
const quotesSubscribed = new Set();

function subscribeQuotesForTicker(ticker) {
    if (quotesSubscribed.has(ticker)) return;
    if (!intrinioOptions || !intrinioOptions.ready) return;
    if (!TICKER_RE.test(String(ticker || "").toUpperCase())) return;   // 같은 함정을 옵션에서도 막는다
    quotesSubscribed.add(ticker);
    intrinioOptions.join(ticker);
    console.log("[Options WS] + " + ticker + " (체결+호가)");
}

function subscribeQuotesForActiveTickers() {
    const tickers = [];
    for (const entry of tickerSubscribers) tickers.push(entry[0]);
    for (let i = 0; i < tickers.length; i++) subscribeQuotesForTicker(tickers[i]);
}

function subscribeOptionsContract(contract) {
    // contract 는 Massive 표기(O:NVDA260904C00200000). Intrinio 는 구형 표기를
    // 받으므로 'O:' 만 떼고 심볼을 6자로 밑줄 패딩해 넘긴다.
    if (optionsSubscribedOnMassive.has(contract)) return;
    if (!intrinioOptions || !intrinioOptions.ready) return;
    const c = massiveContractToIntrinio(contract);
    if (!c) return;
    intrinioOptions.join(c);
    optionsSubscribedOnMassive.add(contract);
    console.log("[Options WS] + 계약 " + contract);
}

function unsubscribeOptionsContract(contract) {
    if (!optionsSubscribedOnMassive.has(contract)) return;
    if (!intrinioOptions || !intrinioOptions.ready) return;
    const c = massiveContractToIntrinio(contract);
    if (c) intrinioOptions.leave(c);
    optionsSubscribedOnMassive.delete(contract);
    console.log("[Options WS] - 계약 " + contract);
}

/** O:NVDA260904C00200000 -> NVDA__260904C00200000 (심볼 6자 밑줄 패딩) */
function massiveContractToIntrinio(t) {
    if (!t || t.slice(0, 2) !== "O:") return null;
    const body = t.slice(2);
    const m = body.match(/^([A-Z.]+)(\d{6}[CP]\d{8})$/);
    if (!m) return null;
    return m[1].padEnd(6, "_") + m[2];
}

// Placeholder handlers — implemented in tasks ⓓ and ⓔ
function handleOptionsTradeUpdate(msg) {
    markPolygonDataReceived();

    const optionsTicker = msg.sym; // e.g. "O:NVDA250321C00180000"
    if (!optionsTicker) return;

    const price = msg.p || 0;     // trade price per contract
    const size = msg.s || 0;      // number of contracts
    const exchange = msg.x || 0;  // exchange ID
    const conditions = msg.c || [];
    const timestamp = msg.t || Date.now();

    // Calculate premium: price × contracts × 100 (shares per contract)
    const premium = price * size * 100;

    // Skip small trades (< $10K premium) to reduce noise
    if (premium < 10000) return;

    // Parse options ticker: O:NVDA250321C00180000
    // Format: O:{underlying}{YYMMDD}{C/P}{strike*1000}
    const parsed = parseOptionsTicker(optionsTicker);

    // Classify trade type
    let tradeType = "NORMAL";
    if (premium >= 1000000) tradeType = "BLOCK";
    else if (premium >= 500000) tradeType = "SWEEP";

    // Broadcast to clients subscribed to this options contract
    const subscribers = optionsTickerSubscribers.get(optionsTicker);
    if (subscribers && subscribers.size > 0) {
        const message = JSON.stringify({
            type: "optionsTrade",
            contract: optionsTicker,
            underlying: parsed.underlying,
            expiry: parsed.expiry,
            strike: parsed.strike,
            optionType: parsed.optionType, // "C" or "P"
            price: Math.round(price * 100) / 100,
            size,
            premium: Math.round(premium),
            tradeType, // "NORMAL", "SWEEP", "BLOCK"
            exchange,
            ts: timestamp,
        });

        for (const ws of subscribers) {
            if (ws.readyState === WebSocket.OPEN) {
                try { ws.send(message); } catch {}
            }
        }
    }

    // Also broadcast to clients subscribed to the underlying stock ticker
    // (so Flow page can show trades for all contracts of a stock)
    if (parsed.underlying) {
        const stockSubs = tickerSubscribers.get(parsed.underlying);
        if (stockSubs && stockSubs.size > 0) {
            const message = JSON.stringify({
                type: "optionsTrade",
                contract: optionsTicker,
                underlying: parsed.underlying,
                expiry: parsed.expiry,
                strike: parsed.strike,
                optionType: parsed.optionType,
                price: Math.round(price * 100) / 100,
                size,
                premium: Math.round(premium),
                tradeType,
                exchange,
                ts: timestamp,
            });

            for (const ws of stockSubs) {
                if (ws.readyState === WebSocket.OPEN) {
                    try { ws.send(message); } catch {}
                }
            }
        }
    }
}

// Parse options ticker: O:NVDA250321C00180000 → { underlying, expiry, optionType, strike }
function parseOptionsTicker(ticker) {
    try {
        // Remove "O:" prefix
        const raw = ticker.startsWith("O:") ? ticker.slice(2) : ticker;
        // Find where the date starts (6 digits + C/P)
        // Underlying is letters at the start, then YYMMDD, then C/P, then strike
        const match = raw.match(/^([A-Z]+)(\d{6})([CP])(\d+)$/);
        if (!match) return { underlying: raw, expiry: "", optionType: "", strike: 0 };

        const underlying = match[1];
        const dateStr = match[2]; // YYMMDD
        const optionType = match[3]; // C or P
        const strikeRaw = parseInt(match[4], 10);
        const strike = strikeRaw / 1000; // Convert from integer to dollars

        const expiry = `20${dateStr.slice(0,2)}-${dateStr.slice(2,4)}-${dateStr.slice(4,6)}`;

        return { underlying, expiry, optionType, strike };
    } catch {
        return { underlying: ticker, expiry: "", optionType: "", strike: 0 };
    }
}

function handleOptionsQuoteUpdate(msg) {
    markPolygonDataReceived();

    const optionsTicker = msg.sym; // e.g. "O:NVDA250321C00180000"
    if (!optionsTicker) return;

    const bid = msg.bp || 0;
    const bidSize = msg.bs || 0;
    const ask = msg.ap || 0;
    const askSize = msg.as || 0;

    // Skip if no valid bid/ask
    if (bid <= 0 && ask <= 0) return;

    const midPrice = (bid > 0 && ask > 0) ? (bid + ask) / 2 : (bid || ask);
    const spread = (ask > 0 && bid > 0) ? Math.round((ask - bid) * 100) / 100 : 0;

    // Parse options ticker to get underlying, expiry, strike, type
    const parsed = parseOptionsTicker(optionsTicker);
    if (!parsed.underlying || !parsed.expiry || !parsed.optionType) return;

    // Get underlying stock price from latestPrices
    const stockData = latestPrices.get(parsed.underlying);
    const underlyingPrice = stockData?.price || 0;
    if (underlyingPrice <= 0) return; // Can't calc IV without underlying

    // Calculate time to expiry in years
    const expiryDate = new Date(parsed.expiry + "T16:00:00Z"); // 4PM ET close
    const now = new Date();
    const T = (expiryDate - now) / (365.25 * 24 * 60 * 60 * 1000); // years
    if (T <= 0) return; // Expired

    // Calculate IV using Black-Scholes Newton-Raphson
    const r = 0.05; // Risk-free rate ~5%
    const iv = calcIV(midPrice, underlyingPrice, parsed.strike, T, r, parsed.optionType);

    // Throttle quote broadcasts (1s per options ticker)
    const now2 = Date.now();
    const lastTime = lastQuoteBroadcastTime.get(optionsTicker) || 0;
    if (now2 - lastTime < THROTTLE_MS) return;
    lastQuoteBroadcastTime.set(optionsTicker, now2);

    // Broadcast to options contract subscribers
    const subscribers = optionsTickerSubscribers.get(optionsTicker);
    const stockSubs = tickerSubscribers.get(parsed.underlying);

    if ((!subscribers || subscribers.size === 0) && (!stockSubs || stockSubs.size === 0)) return;

    const message = JSON.stringify({
        type: "optionsQuote",
        contract: optionsTicker,
        underlying: parsed.underlying,
        expiry: parsed.expiry,
        strike: parsed.strike,
        optionType: parsed.optionType,
        bid: Math.round(bid * 100) / 100,
        bidSize,
        ask: Math.round(ask * 100) / 100,
        askSize,
        mid: Math.round(midPrice * 100) / 100,
        spread,
        iv: iv ? Math.round(iv * 10000) / 10000 : null, // 4 decimal (e.g. 0.3542 = 35.42%)
        ivPct: iv ? Math.round(iv * 10000) / 100 : null, // percentage (e.g. 35.42)
        ts: now2,
    });

    // Broadcast to options contract subscribers
    if (subscribers) {
        for (const ws of subscribers) {
            if (ws.readyState === WebSocket.OPEN) {
                try { ws.send(message); } catch {}
            }
        }
    }

    // Also broadcast to underlying stock subscribers
    if (stockSubs) {
        for (const ws of stockSubs) {
            if (ws.readyState === WebSocket.OPEN) {
                try { ws.send(message); } catch {}
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════
// BLACK-SCHOLES IV CALCULATOR
// ══════════════════════════════════════════════════════════════

// Standard Normal CDF (Abramowitz & Stegun approximation, max error < 7.5e-8)
function normcdf(x) {
    if (x > 6) return 1;
    if (x < -6) return 0;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.2316419 * x);
    const d = 0.3989422804014327; // 1/sqrt(2π)
    const pdf = d * Math.exp(-0.5 * x * x);
    const p = pdf * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return sign === 1 ? 1 - p : p;
}

// Black-Scholes option price
function bsPrice(S, K, T, r, sigma, optionType) {
    if (T <= 0 || sigma <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    if (optionType === "C") {
        return S * normcdf(d1) - K * Math.exp(-r * T) * normcdf(d2);
    } else {
        return K * Math.exp(-r * T) * normcdf(-d2) - S * normcdf(-d1);
    }
}

// Black-Scholes Vega (∂price/∂σ)
function bsVega(S, K, T, r, sigma) {
    if (T <= 0 || sigma <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const pdf = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
    return S * Math.sqrt(T) * pdf;
}

// Newton-Raphson IV solver
function calcIV(marketPrice, S, K, T, r, optionType) {
    if (marketPrice <= 0 || S <= 0 || K <= 0 || T <= 0) return null;

    // Brenner-Subrahmanyam initial guess
    let sigma = Math.sqrt(2 * Math.PI / T) * (marketPrice / S);
    sigma = Math.max(0.01, Math.min(sigma, 5.0));

    for (let i = 0; i < 50; i++) {
        const price = bsPrice(S, K, T, r, sigma, optionType);
        const vega = bsVega(S, K, T, r, sigma);
        if (vega < 1e-10) break;
        const diff = price - marketPrice;
        if (Math.abs(diff) < 1e-6) break;
        sigma = sigma - diff / vega;
        sigma = Math.max(0.001, Math.min(sigma, 10.0));
    }

    if (sigma < 0.001 || sigma > 10.0) return null;
    return Math.round(sigma * 10000) / 10000;
}

// ══════════════════════════════════════════════════════════════
// CLIENT WEBSOCKET SERVER
// ══════════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
    // Health check endpoint
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status: "ok",
            service: "price-ws-hub",
            clients: clients.size,
            tickers: tickerSubscribers.size,
            polygonConnected,
            uptime: Math.round(process.uptime()),
            latestPriceCount: latestPrices.size,
            // [2026-10-14] Intrinio 채널 수(클라이언트 구독 + 서버 /last 관심) — 구독 한도 감시용
            channels: subscribedOnPolygon.size + serverJoined.size,
            serverInterest: serverInterest.size,
            staleDropped: Object.fromEntries(staleDropped),
        }));
        return;
    }

    // [2026-10-14] 서버용 마지막 체결 — /last?symbols=A,B,C[&wait=ms]
    if (req.method === "GET" && req.url && req.url.split("?")[0] === "/last") {
        handleLast(req, res);
        return;
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        });
        res.end();
        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
    clients.set(ws, {
        tickers: new Set(),
        connectedAt: Date.now(),
        lastPing: Date.now(),
    });

    console.log(`[Price WS] 🔌 Client connected (total: ${clients.size})`);

    // Send connection confirmation
    ws.send(JSON.stringify({
        type: "connected",
        polygonConnected,
        tickersAvailable: tickerSubscribers.size,
    }));

    // Handle client messages
    ws.on("message", (data) => {
        try {
            const msg = JSON.parse(data.toString());

            // Subscribe to tickers
            if (msg.type === "subscribe" && Array.isArray(msg.tickers)) {
                const meta = clients.get(ws);
                if (!meta) return;

                for (const ticker of msg.tickers) {
                    const t = ticker.toUpperCase().trim();
                    if (!t || t.length > 10) continue;

                    meta.tickers.add(t);

                    // Add to global subscriber list
                    if (!tickerSubscribers.has(t)) {
                        tickerSubscribers.set(t, new Set());
                        lastAcceptedTradeMs.set(t, Date.now());
                    }
                    tickerSubscribers.get(t).add(ws);

                    // Subscribe on Polygon if new
                    subscribeTickerOnPolygon(t);

                    // Send latest cached price immediately
                    // [2026-10-14] 가격이 있는 캐시만 — ensurePrevClose 가 방금 만든 빈 항목(price 없음)을 보내면 클라이언트가 price 0 으로 받아 감시기가 «허브 가격 0/null»(COIN·JPM)로 잡았다.
                    // 정규장엔 90초 안의 체결 가격만 즉시 전송한다 — 체결 시각 없음·종가(eod_close)·90초 넘은 값은 보내지 않는다(캐시·prevClose 는 그대로).
                    const cached = latestPrices.get(t);
                    if (cached && cached.price > 0 && isSnapshotSendable(cached, Date.now())) {
                        ws.send(JSON.stringify({
                            type: "prices",
                            ticker: t,
                            price: cached.price,
                            changePct: cached.changePct,
                            volume: cached.volume,
                            ts: cached.ts || 0,
                            receivedAt: cached.receivedAt || 0,
                            priceBasis: cached.priceBasis || null,
                            priceSource: cached.priceSource || null,
                        }));
                    }

                    // Send latest cached quote (NBBO) immediately
                    const cachedQuote = latestQuotes.get(t);
                    if (cachedQuote && cachedQuote.bid > 0) {
                        ws.send(JSON.stringify({
                            type: "quote",
                            ticker: t,
                            bid: cachedQuote.bid,
                            bidSize: cachedQuote.bidSize,
                            ask: cachedQuote.ask,
                            askSize: cachedQuote.askSize,
                            spread: cachedQuote.spread,
                        }));
                    }
                }

                console.log(`[Price WS] Client subscribed to ${msg.tickers.length} tickers (client total: ${meta.tickers.size})`);
            }

            // Unsubscribe from tickers
            if (msg.type === "unsubscribe" && Array.isArray(msg.tickers)) {
                const meta = clients.get(ws);
                if (!meta) return;

                for (const ticker of msg.tickers) {
                    const t = ticker.toUpperCase().trim();
                    meta.tickers.delete(t);
                    const subs = tickerSubscribers.get(t);
                    if (subs) {
                        subs.delete(ws);
                        if (subs.size === 0) {
                            tickerSubscribers.delete(t);
                            lastAcceptedTradeMs.delete(t);
                            unsubscribeTickerOnPolygon(t);
                        }
                    }
                }
            }

            // Ping/pong keepalive
            if (msg.type === "ping") {
                const meta = clients.get(ws);
                if (meta) meta.lastPing = Date.now();
                ws.send(JSON.stringify({ type: "pong" }));
            }

            // Subscribe to options contracts
            if (msg.type === "subscribeOptions" && Array.isArray(msg.contracts)) {
                for (const contract of msg.contracts) {
                    const c = contract.toUpperCase().trim();
                    if (!c) continue;

                    // Add to options subscribers map
                    if (!optionsTickerSubscribers.has(c)) {
                        optionsTickerSubscribers.set(c, new Set());
                    }
                    optionsTickerSubscribers.get(c).add(ws);

                    // Subscribe on Massive Options WS
                    subscribeOptionsContract(c);
                }
                console.log(`[Price WS] Client subscribed to ${msg.contracts.length} options contracts`);
            }

            // Unsubscribe from options contracts
            if (msg.type === "unsubscribeOptions" && Array.isArray(msg.contracts)) {
                for (const contract of msg.contracts) {
                    const c = contract.toUpperCase().trim();
                    const subs = optionsTickerSubscribers.get(c);
                    if (subs) {
                        subs.delete(ws);
                        if (subs.size === 0) {
                            optionsTickerSubscribers.delete(c);
                            unsubscribeOptionsContract(c);
                        }
                    }
                }
            }
        } catch {
            // Ignore malformed messages
        }
    });

    // Cleanup on disconnect
    ws.on("close", () => {
        cleanupClient(ws);
        console.log(`[Price WS] 🔌 Client disconnected (total: ${clients.size})`);
    });

    ws.on("error", (e) => {
        console.warn("[Price WS] Client error:", e.message);
        cleanupClient(ws);
    });
});

function cleanupClient(ws) {
    const meta = clients.get(ws);
    if (meta) {
        // Remove from all stock ticker subscriptions
        for (const ticker of meta.tickers) {
            const subs = tickerSubscribers.get(ticker);
            if (subs) {
                subs.delete(ws);
                if (subs.size === 0) {
                    tickerSubscribers.delete(ticker);
                    lastAcceptedTradeMs.delete(ticker);
                    unsubscribeTickerOnPolygon(ticker);
                }
            }
        }
    }

    // Remove from all options contract subscriptions
    for (const [contract, subs] of optionsTickerSubscribers.entries()) {
        subs.delete(ws);
        if (subs.size === 0) {
            optionsTickerSubscribers.delete(contract);
            unsubscribeOptionsContract(contract);
        }
    }

    clients.delete(ws);
}

// ══════════════════════════════════════════════════════════════
// HEARTBEAT — Ping clients, disconnect stale ones
// ══════════════════════════════════════════════════════════════

setInterval(() => {
    const now = Date.now();
    for (const [ws, meta] of clients.entries()) {
        // Disconnect stale clients (no activity in 2 minutes)
        if (now - meta.lastPing > STALE_CLIENT_MS) {
            console.log("[Price WS] Disconnecting stale client");
            ws.terminate();
            cleanupClient(ws);
            continue;
        }
        // Send server-side ping
        if (ws.readyState === WebSocket.OPEN) {
            try { ws.ping(); } catch {}
        }
    }
}, HEARTBEAT_INTERVAL_MS);

// ══════════════════════════════════════════════════════════════
// STATS LOGGING
// ══════════════════════════════════════════════════════════════

setInterval(() => {
    if (clients.size > 0 || tickerSubscribers.size > 0) {
        console.log(`[Price WS] 📊 Clients: ${clients.size} | Tickers: ${tickerSubscribers.size} | Polygon: ${polygonConnected ? "✅" : "❌"} | REST Fallback: ${restFallbackActive ? "✅" : "❌"} | Cached Prices: ${latestPrices.size}`);
    }
}, 60000); // Every minute

// ══════════════════════════════════════════════════════════════
// REST FALLBACK — Polls Polygon REST API when WS is dead
// ══════════════════════════════════════════════════════════════
// If Polygon WS isn't delivering data, this kicks in automatically
// and polls the snapshot REST API at least 15s apart, pushing individual
// ticker updates to clients via WebSocket.

const REST_POLL_INTERVAL_MS = 15_000;
const REST_MAX_TICKERS_PER_POLL = 20;
const REST_REQUEST_TIMEOUT_MS = 5_000; // 종목별 REST 요청 상한 — 정체 응답이 폴백 전체를 막지 않게
const REST_CONCURRENCY = 4; // 묶음 안 동시 요청 수 — 최악 지연 ceil(20/4)×5초 = 25초
let lastRestPollStarted = -Infinity;
let restPollInFlight = false;
const restLastPolled = new Map(); // ticker → 마지막 폴백 조회 시각(오래된 순 순환)
let restNextPollTimer = null;
const REST_FALLBACK_CHECK_MS = 10000; // Activate after 10s with no WS data
let restFallbackActive = false;
let restFallbackTimer = null;
let lastPolygonDataTs = 0;           // Last time we received real WS data

// Track when Polygon WS actually delivers data
function markPolygonDataReceived() {
    lastPolygonDataTs = Date.now();
    // If fallback is active and WS is now working, disable fallback
    if (restFallbackActive) {
        console.log("[Price WS] Polygon WS data received — disabling REST fallback");
        restFallbackActive = false;
    }
}

// REST snapshot fetcher for a batch of tickers
//
// [2026-08-29] Massive/Polygon → Intrinio 이관.
//   기존 구현은 `api.polygon.io/v2/snapshot/...` 를 불렀는데 계정 차단으로 403 이다.
//   즉 **WS 가 끊겼을 때의 안전망이 통째로 죽어 있었다**(로그의 "REST Fallback: ❌").
//   Intrinio 에는 다중 종목 스냅샷이 없으므로 종목별 realtime 을 순차 호출한다.
async function fetchSnapshotREST(tickers) {
    if (!INTRINIO_API_KEY || tickers.length === 0) return;

    // 종목별로 받는 즉시 처리·방송한다 — 뒤 종목 응답을 기다리지 않고, 한 종목 실패·정체(타임아웃)는 그 종목만 건너뛴다.
    // 동시 REST_CONCURRENCY 개까지 — 최악 지연 = ceil(20/4)×5초 = 25초. 호출 수 상한(회당 20·15초 주기)은 그대로다.
    const queue = [...tickers];
    const worker = async () => { while (queue.length > 0) await fetchOneSnapshotREST(queue.shift()); };
    await Promise.all(Array.from({ length: Math.min(REST_CONCURRENCY, queue.length) }, worker));
}

async function fetchOneSnapshotREST(t) {
    try {
        const url = `https://api-v2.intrinio.com/securities/${encodeURIComponent(t)}/prices/realtime?api_key=${INTRINIO_API_KEY}`;
        const rt = await httpsGet(url, REST_REQUEST_TIMEOUT_MS);
        if (!rt) return;
        const snap = {
            ticker: t,
            // day.c 는 정규장 종가, lastTrade 는 시간외 포함 — 어댑터와 같은 규칙
            last: Number(rt.last_price) || 0,
            regular: Number(rt.normal_market_hours_last_price) || 0,
            prev: Number(rt.eod_close_price) || 0,
            vol: Number(rt.market_volume) || Number(rt.exchange_volume) || 0,
            lastTime: normalizeTradeMs(rt.last_time),
            regularTime: normalizeTradeMs(rt.normal_market_hours_last_time),
            source: rt.source || null,
        };
        const ticker = snap.ticker;

        const prevClose = snap.prev;
        const volume = snap.vol;
        const price = snap.last || snap.regular || prevClose;

        if (price <= 0) return;

        const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

        const existing = latestPrices.get(ticker);
        // 가격을 버리는 분기에서도 응답의 prevClose 정정은 반영한다(종가만·날짜 넘김 경로와 같은 규칙).
        const keepPrevCloseOnly = () => {
            if (!(prevClose > 0) || prevClose === Number(existing?.prevClose)) return;
            latestPrices.set(ticker, withPrevClose(existing, prevClose, getETDateString()));
            rebroadcastIfPrevCloseChanged(ticker, existing?.prevClose);
        };
        // 정규장에 체결 가격 없이 종가만 오면 전일 종가는 prevClose 갱신에만 쓴다(가격으로 저장·방송하지 않음).
        if (!(snap.last > 0) && !(snap.regular > 0) && isRegularSession(Date.now())) {
            latestPrices.set(ticker, withPrevClose(existing, prevClose, getETDateString()));
            rebroadcastIfPrevCloseChanged(ticker, existing?.prevClose);
            return;
        }
        const eventTime = snap.last > 0 ? snap.lastTime : snap.regular > 0 ? snap.regularTime : 0;
        // WS 와 같은 정규장 신선도 규칙 — 90초 넘게 과거인 체결은 캐시가 없어도 저장·방송하지 않는다.
        if (shouldDropStaleTrade(eventTime, Date.now())) {
            staleDropped.set(ticker, (staleDropped.get(ticker) || 0) + 1);
            keepPrevCloseOnly();
            return;
        }
        if (eventTime > 0) {
            // 가격을 지운 캐시도 마지막 채택 체결 시각(lastTradeTs)과 비교해 역행을 막는다.
            const floorTs = Math.max(Number(existing?.ts) || 0, Number(existing?.lastTradeTs) || 0);
            if (existing && eventTime <= floorTs) { keepPrevCloseOnly(); return; }
        } else {
            // 체결 시각 없는 응답(종가만 등)은 이전 동작대로 가격이 바뀌면 채택하되,
            // 정규장에 90초 안의 채택 체결이 캐시에 있으면 덮지 않는다.
            if (existing && Math.abs((Number(existing.price) || 0) - price) < 0.001) { keepPrevCloseOnly(); return; }
            const cachedTs = Number(existing?.ts) || 0;
            if (existing?.price > 0 && cachedTs > 0 && isRegularSession(Date.now()) &&
                !shouldDropStaleTrade(cachedTs, Date.now())) { keepPrevCloseOnly(); return; }
        }

        latestPrices.set(ticker, {
            price,
            changePct: Math.round(changePct * 100) / 100,
            volume,
            prevClose,
            prevCloseDate: getETDateString(),
            ts: eventTime,
            receivedAt: Date.now(),
            priceBasis: snap.last > 0 || snap.regular > 0 ? (snap.source === "equities_edge" ? "fair_value" : "trade") : "eod_close",
            priceSource: snap.source,
        });

        // Push to subscribed clients immediately
        broadcastPrice(ticker, price, changePct, volume);
    } catch (e) {
        console.warn(`[REST Fallback] ${t} error:`, e.message);
    }
}

// REST fallback polling loop
async function pollRestFallback() {
    const now = Date.now();
    if (restPollInFlight || now - lastRestPollStarted < REST_POLL_INTERVAL_MS) return;
    const tickers = getRestFallbackTickers(now);
    if (tickers.length === 0) return;
    // 오래 조회 안 한 종목부터(동률은 구독 순서) — 실패 종목이 자리를 독점하지 않게 «마지막 조회 시각» 기준.
    const selected = tickers.map((t, i) => [t, restLastPolled.get(t) || 0, i])
        .sort((a, b) => a[1] - b[1] || a[2] - b[2]).slice(0, REST_MAX_TICKERS_PER_POLL).map(e => e[0]);
    for (const t of selected) restLastPolled.set(t, now);
    for (const t of restLastPolled.keys()) if (!tickerSubscribers.has(t)) restLastPolled.delete(t);
    lastRestPollStarted = now; // 간격은 «시작 간 15초» — 회당 20종목이면 분당 80회 이하
    restPollInFlight = true;
    try { await fetchSnapshotREST(selected); }
    finally {
        restPollInFlight = false;
        // 묶음이 끝나면 다음 시작(이번 시작 + 15초, 이미 지났으면 즉시)을 바로 예약한다.
        if (restFallbackTimer) {
            clearTimeout(restNextPollTimer);
            restNextPollTimer = setTimeout(() => { if (restFallbackTimer) pollRestFallback(); },
                Math.max(0, lastRestPollStarted + REST_POLL_INTERVAL_MS - Date.now()));
        }
    }
}

function startRestFallback() {
    if (restFallbackTimer) return;
    // Immediate first poll
    pollRestFallback();
    restFallbackTimer = setInterval(pollRestFallback, REST_POLL_INTERVAL_MS);
}

function getRestFallbackTickers(now) {
    const regular = isRegularSession(now);
    return [...tickerSubscribers.keys()].filter(ticker => restFallbackActive ||
        (regular && now - (lastAcceptedTradeMs.get(ticker) || 0) > 90_000));
}

// Check periodically if we need to activate REST fallback
setInterval(() => {
    if (tickerSubscribers.size === 0) {
        if (restFallbackTimer) { clearInterval(restFallbackTimer); restFallbackTimer = null; }
        return;
    }
    
    const now = Date.now();
    const timeSinceLastData = now - lastPolygonDataTs;
    
    // If no WS data for 10s and fallback not yet active, activate it
    if (timeSinceLastData > REST_FALLBACK_CHECK_MS && !restFallbackActive) {
        console.log(`[Price WS] WS 무데이터 ${Math.round(timeSinceLastData / 1000)}s — REST 폴백 활성화`);
        restFallbackActive = true;
        console.log("[Price WS] 🔄 REST fallback ACTIVATED — Intrinio REST 15초 폴링");
        if (restFallbackTimer) pollRestFallback();
    }
    if (getRestFallbackTickers(now).length > 0) startRestFallback();
    else if (restFallbackTimer) { clearInterval(restFallbackTimer); restFallbackTimer = null; }
}, 5000); // Check every 5s

// ══════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════

server.listen(PORT, () => {
    console.log("═══════════════════════════════════════════════════");
    console.log("  SIGNUM HQ — Real-Time Price WebSocket Hub v1.0  ");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Port:         ${PORT}`);
    console.log(`  Intrinio Key: ${INTRINIO_API_KEY ? INTRINIO_API_KEY.slice(0, 6) + "..." : "NOT SET"}`);
    console.log(`  Feed:         Intrinio EQUITIES_EDGE (WS) + REST 폴백`);
    // 이관 후 기본값이 «켜짐» 으로 뒤집혔다. 끄려면 ENABLE_OPTIONS_WS=0.
    console.log(`  Options WS:   ${process.env.ENABLE_OPTIONS_WS === "0" ? "비활성" : "활성 (Intrinio " + (process.env.INTRINIO_OPTIONS_PROVIDER || "OPTIONS_EDGE") + ")"}`);
    console.log("═══════════════════════════════════════════════════");

    // Connect to Polygon (Stocks)
    if (POLYGON_API_KEY) {
        connectToPolygon();
        connectToOptionsWs();
    } else {
        console.warn("[Price WS] ⚠️ No POLYGON_API_KEY set. Running in offline mode.");
    }
});

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[Price WS] Shutting down...");
    if (polygonWs) { try { polygonWs.close(); } catch {} }
    if (intrinioOptions) { try { intrinioOptions.stop(); } catch {} }
    if (polygonReconnectTimer) clearTimeout(polygonReconnectTimer);
    if (optionsReconnectTimer) clearTimeout(optionsReconnectTimer);
    wss.close();
    server.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[Price WS] SIGTERM received...");
    if (polygonWs) { try { polygonWs.close(); } catch {} }
    if (intrinioOptions) { try { intrinioOptions.stop(); } catch {} }
    if (polygonReconnectTimer) clearTimeout(polygonReconnectTimer);
    if (optionsReconnectTimer) clearTimeout(optionsReconnectTimer);
    wss.close();
    server.close();
    process.exit(0);
});
