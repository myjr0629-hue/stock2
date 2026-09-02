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
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse failed')); }
            });
        }).on('error', reject);
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

// Latest quotes (bid/ask) for immediate delivery
// Map<ticker, { bid, bidSize, ask, askSize, spread, ts }>
const latestQuotes = new Map();

// Throttle: broadcast at most once per THROTTLE_MS per ticker
const THROTTLE_MS = 1000; // 1 second
const lastBroadcastTime = new Map(); // Map<ticker, timestamp> (prices)
const lastQuoteBroadcastTime = new Map(); // Map<ticker, timestamp> (quotes)

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
                t: Number(t.Timestamp) || Date.now(),
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
        intrinioLeave([ticker]);
        subscribedOnPolygon.delete(ticker);
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
                latestPrices.set(ticker, { ...cur, prevClose, prevCloseDate: todayStr, isFetchingPrevClose: false });
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

function handleTradeUpdate(msg) {
    const ticker = msg.sym;
    if (!ticker) return;
    markPolygonDataReceived(); // Track that Polygon WS is alive

    const price = msg.p || 0;
    const volume = msg.s || 0;

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
        ts: Date.now(),
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
        onTrade: (t) => {
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
        }));
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
                    }
                    tickerSubscribers.get(t).add(ws);

                    // Subscribe on Polygon if new
                    subscribeTickerOnPolygon(t);

                    // Send latest cached price immediately
                    const cached = latestPrices.get(t);
                    if (cached) {
                        ws.send(JSON.stringify({
                            type: "prices",
                            ticker: t,
                            price: cached.price,
                            changePct: cached.changePct,
                            volume: cached.volume,
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
// and polls the snapshot REST API every 3s, pushing individual
// ticker updates to clients via WebSocket.

const REST_POLL_INTERVAL_MS = 3000;  // 3s between REST polls
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
        if (restFallbackTimer) { clearInterval(restFallbackTimer); restFallbackTimer = null; }
    }
}

// REST snapshot fetcher for a batch of tickers
//
// [2026-08-29] Massive/Polygon → Intrinio 이관.
//   기존 구현은 `api.polygon.io/v2/snapshot/...` 를 불렀는데 계정 차단으로 403 이다.
//   즉 **WS 가 끊겼을 때의 안전망이 통째로 죽어 있었다**(로그의 "REST Fallback: ❌").
//   Intrinio 에는 다중 종목 스냅샷이 없으므로 종목별 realtime 을 병렬 호출한다.
//   (분당 2,000 호출 한도 — 폴백은 3초 주기이고 구독 종목은 수십 개 수준이라 여유롭다)
async function fetchSnapshotREST(tickers) {
    if (!INTRINIO_API_KEY || tickers.length === 0) return;

    try {
        const settled = await Promise.allSettled(
            tickers.map(async (t) => {
                const url = `https://api-v2.intrinio.com/securities/${encodeURIComponent(t)}/prices/realtime?api_key=${INTRINIO_API_KEY}`;
                const rt = await httpsGet(url);
                if (!rt) return null;
                return {
                    ticker: t,
                    // day.c 는 정규장 종가, lastTrade 는 시간외 포함 — 어댑터와 같은 규칙
                    last: Number(rt.last_price) || 0,
                    regular: Number(rt.normal_market_hours_last_price) || 0,
                    prev: Number(rt.eod_close_price) || 0,
                    vol: Number(rt.market_volume) || Number(rt.exchange_volume) || 0,
                };
            })
        );

        const snaps = settled
            .map((r) => (r.status === "fulfilled" ? r.value : null))
            .filter(Boolean);

        for (const snap of snaps) {
            const ticker = snap.ticker;
            if (!ticker) continue;

            const prevClose = snap.prev;
            const volume = snap.vol;
            const price = snap.last || snap.regular || prevClose;

            if (price <= 0) continue;
            
            const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
            
            // Only broadcast if price actually changed
            const existing = latestPrices.get(ticker);
            if (existing && Math.abs(existing.price - price) < 0.001) continue;
            
            latestPrices.set(ticker, {
                price,
                changePct: Math.round(changePct * 100) / 100,
                volume,
                prevClose,
                prevCloseDate: getETDateString(),
                ts: Date.now(),
            });
            
            // Push to subscribed clients immediately
            broadcastPrice(ticker, price, changePct, volume);
        }
    } catch (e) {
        console.warn("[REST Fallback] Error:", e.message);
    }
}

// REST fallback polling loop
function startRestFallback() {
    if (restFallbackActive) return;
    restFallbackActive = true;
    console.log("[Price WS] 🔄 REST fallback ACTIVATED — Intrinio REST 3초 폴링");
    
    const poll = () => {
        const tickers = [...tickerSubscribers.keys()];
        if (tickers.length === 0) return;
        
        // Intrinio 는 종목별 호출이므로 배치를 작게 잡아 동시성을 제한한다
        const batches = [];
        for (let i = 0; i < tickers.length; i += 20) {
            batches.push(tickers.slice(i, i + 20));
        }
        batches.forEach(batch => fetchSnapshotREST(batch));
    };
    
    // Immediate first poll
    poll();
    restFallbackTimer = setInterval(poll, REST_POLL_INTERVAL_MS);
}

// Check periodically if we need to activate REST fallback
setInterval(() => {
    if (tickerSubscribers.size === 0) return; // No subscribers, no need
    
    const now = Date.now();
    const timeSinceLastData = now - lastPolygonDataTs;
    
    // If no WS data for 10s and fallback not yet active, activate it
    if (timeSinceLastData > REST_FALLBACK_CHECK_MS && !restFallbackActive) {
        console.log(`[Price WS] WS 무데이터 ${Math.round(timeSinceLastData / 1000)}s — REST 폴백 활성화`);
        startRestFallback();
    }
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
