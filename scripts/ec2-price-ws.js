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

// Fetch real previous day close for a ticker from Massive REST API
function fetchPreviousClose(ticker) {
    const url = `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY}`;
    return httpsGet(url)
        .then(data => {
            const t = data?.ticker;
            if (t?.prevDay?.c && t.prevDay.c > 0) {
                return t.prevDay.c;
            }
            return 0;
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

function connectToPolygon() {
    if (!POLYGON_API_KEY) {
        console.error("[Price WS] ❌ No POLYGON_API_KEY set. Cannot connect to Polygon.");
        return;
    }

    try {
        console.log("[Price WS] Connecting to Polygon WebSocket...");
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

function subscribeTickerOnPolygon(ticker) {
    if (subscribedOnPolygon.has(ticker)) return;
    if (!polygonWs || polygonWs.readyState !== WebSocket.OPEN) return;

    polygonWs.send(JSON.stringify({ action: "subscribe", params: `T.${ticker},A.${ticker},AM.${ticker},Q.${ticker},LULD.${ticker}` }));
    subscribedOnPolygon.add(ticker);
    console.log(`[Price WS] + Subscribed to T/A/AM/Q/LULD.${ticker} on Massive`);

    // Fetch real previousClose from REST API for accurate changePct
    if (!latestPrices.has(ticker) || !latestPrices.get(ticker).prevClose) {
        fetchPreviousClose(ticker).then(prevClose => {
            if (prevClose > 0) {
                const existing = latestPrices.get(ticker) || {};
                latestPrices.set(ticker, { ...existing, prevClose });
                console.log(`[Price WS] 📊 ${ticker} prevClose: $${prevClose}`);
            }
        });
    }
}

function unsubscribeTickerOnPolygon(ticker) {
    if (!subscribedOnPolygon.has(ticker)) return;
    if (!polygonWs || polygonWs.readyState !== WebSocket.OPEN) return;

    polygonWs.send(JSON.stringify({ action: "unsubscribe", params: `T.${ticker},A.${ticker},AM.${ticker},Q.${ticker},LULD.${ticker}` }));
    subscribedOnPolygon.delete(ticker);
    console.log(`[Price WS] - Unsubscribed from T/A/AM/Q/LULD.${ticker} on Massive`);
}

// ══════════════════════════════════════════════════════════════
// PRICE UPDATE HANDLERS
// ══════════════════════════════════════════════════════════════

function handleAggregateUpdate(msg) {
    const ticker = msg.sym;
    if (!ticker) return;
    markPolygonDataReceived(); // Track that Polygon WS is alive

    const price = msg.c || msg.vw || 0; // close or vwap
    const volume = msg.v || 0;
    const open = msg.o || price;

    // Update latest price cache (prevClose must come from REST API, never from trade/agg data)
    const existing = latestPrices.get(ticker);
    const prevClose = existing?.prevClose || 0;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    latestPrices.set(ticker, {
        price,
        changePct: Math.round(changePct * 100) / 100,
        volume,
        prevClose,
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
    const prevClose = existing?.prevClose || 0;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    latestPrices.set(ticker, {
        price,
        changePct: Math.round(changePct * 100) / 100,
        volume: (existing?.volume || 0) + volume,
        prevClose,
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
// OPTIONS WEBSOCKET CONNECTION (wss://socket.massive.com/options)
// ══════════════════════════════════════════════════════════════

function connectToOptionsWs() {
    if (!POLYGON_API_KEY) {
        console.error("[Options WS] ❌ No API key set. Cannot connect.");
        return;
    }

    try {
        console.log("[Options WS] Connecting to Massive Options WebSocket...");
        optionsWs = new WebSocket(OPTIONS_WS_URL);

        optionsWs.on("open", () => {
            console.log("[Options WS] ✅ Options WebSocket connected");
            optionsWsConnected = true;
            optionsReconnectCount = 0;
            optionsWs.send(JSON.stringify({ action: "auth", params: POLYGON_API_KEY }));
        });

        optionsWs.on("message", (data) => {
            try {
                const messages = JSON.parse(data.toString());
                if (!Array.isArray(messages)) return;

                for (const msg of messages) {
                    if (msg.ev === "status") {
                        if (msg.status === "auth_success") {
                            console.log("[Options WS] ✅ Options auth success");
                            resubscribeAllOptions();
                        } else if (msg.status === "auth_failed") {
                            console.error("[Options WS] ❌ Options auth failed:", msg.message);
                        } else if (msg.status === "success") {
                            console.log("[Options WS] Options:", msg.message);
                        }
                        continue;
                    }

                    // Options Trade events
                    if (msg.ev === "T") {
                        handleOptionsTradeUpdate(msg);
                    }

                    // Options Quote events
                    if (msg.ev === "Q") {
                        handleOptionsQuoteUpdate(msg);
                    }

                    // Options Aggregate per-second (reserved for future)
                    // if (msg.ev === "A") { }

                    // Options Aggregate per-minute (reserved for future)
                    // if (msg.ev === "AM") { }
                }
            } catch (e) {
                // Non-JSON or parse error — ignore
            }
        });

        optionsWs.on("close", (code, reason) => {
            console.log(`[Options WS] Options WS closed (code: ${code})`);
            optionsWsConnected = false;
            optionsWs = null;
            optionsSubscribedOnMassive.clear();
            scheduleOptionsReconnect();
        });

        optionsWs.on("error", (e) => {
            console.error("[Options WS] Options WS error:", e.message);
            if (optionsWs) {
                try { optionsWs.close(); } catch {}
            }
        });
    } catch (e) {
        console.error("[Options WS] Failed to create Options WS:", e.message);
        scheduleOptionsReconnect();
    }
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
    if (!optionsWs || optionsWs.readyState !== WebSocket.OPEN) return;

    const allContracts = new Set();
    for (const [contract] of optionsTickerSubscribers) {
        allContracts.add(contract);
    }

    if (allContracts.size === 0) {
        console.log("[Options WS] No options contracts to resubscribe.");
        return;
    }

    const contractList = [...allContracts];
    const subs = contractList.flatMap(c => [`T.${c}`, `Q.${c}`]).join(",");
    optionsWs.send(JSON.stringify({ action: "subscribe", params: subs }));
    contractList.forEach(c => optionsSubscribedOnMassive.add(c));
    console.log(`[Options WS] Resubscribed to ${contractList.length} contracts (T+Q): ${contractList.slice(0, 5).join(", ")}${contractList.length > 5 ? "..." : ""}`);
}

function subscribeOptionsContract(contract) {
    if (optionsSubscribedOnMassive.has(contract)) return;
    if (!optionsWs || optionsWs.readyState !== WebSocket.OPEN) return;

    optionsWs.send(JSON.stringify({ action: "subscribe", params: `T.${contract},Q.${contract}` }));
    optionsSubscribedOnMassive.add(contract);
    console.log(`[Options WS] + Subscribed to T/Q.${contract}`);
}

function unsubscribeOptionsContract(contract) {
    if (!optionsSubscribedOnMassive.has(contract)) return;
    if (!optionsWs || optionsWs.readyState !== WebSocket.OPEN) return;

    optionsWs.send(JSON.stringify({ action: "unsubscribe", params: `T.${contract},Q.${contract}` }));
    optionsSubscribedOnMassive.delete(contract);
    console.log(`[Options WS] - Unsubscribed from T/Q.${contract}`);
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
async function fetchSnapshotREST(tickers) {
    if (!POLYGON_API_KEY || tickers.length === 0) return;
    
    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(",")}&apiKey=${POLYGON_API_KEY}`;
        const data = await httpsGet(url);
        
        if (!data.tickers || !Array.isArray(data.tickers)) return;
        
        for (const snap of data.tickers) {
            const ticker = snap.ticker;
            if (!ticker) continue;
            
            const liveLast = snap.lastTrade?.p || 0;
            const dayClose = snap.day?.c || 0;
            const prevClose = snap.prevDay?.c || 0;
            const volume = snap.day?.v || 0;
            const price = liveLast || dayClose || prevClose;
            
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
    console.log("[Price WS] 🔄 REST fallback ACTIVATED — polling Polygon REST API every 3s");
    
    const poll = () => {
        const tickers = [...tickerSubscribers.keys()];
        if (tickers.length === 0) return;
        
        // Polygon allows up to 50 tickers per snapshot request
        const batches = [];
        for (let i = 0; i < tickers.length; i += 50) {
            batches.push(tickers.slice(i, i + 50));
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
        console.log(`[Price WS] No Polygon WS data for ${Math.round(timeSinceLastData / 1000)}s — activating REST fallback`);
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
    console.log(`  Polygon Key:  ${POLYGON_API_KEY ? POLYGON_API_KEY.slice(0, 8) + "..." : "NOT SET"}`);
    console.log(`  Polygon WS:   ${POLYGON_WS_URL}`);
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
    if (optionsWs) { try { optionsWs.close(); } catch {} }
    if (polygonReconnectTimer) clearTimeout(polygonReconnectTimer);
    if (optionsReconnectTimer) clearTimeout(optionsReconnectTimer);
    wss.close();
    server.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[Price WS] SIGTERM received...");
    if (polygonWs) { try { polygonWs.close(); } catch {} }
    if (optionsWs) { try { optionsWs.close(); } catch {} }
    if (polygonReconnectTimer) clearTimeout(polygonReconnectTimer);
    if (optionsReconnectTimer) clearTimeout(optionsReconnectTimer);
    wss.close();
    server.close();
    process.exit(0);
});
