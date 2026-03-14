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

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.WS_PORT || "8084");
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "";
const POLYGON_WS_URL = "wss://socket.polygon.io/stocks";
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

// Polygon state
let polygonWs = null;
let polygonConnected = false;
let polygonReconnectCount = 0;
let polygonReconnectTimer = null;
let subscribedOnPolygon = new Set(); // tickers actually subscribed on Polygon

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

    // Subscribe to per-second aggregate bars (A.) — best balance of data vs cost
    const tickerList = [...allTickers];
    const subscriptions = tickerList.map(t => `A.${t}`).join(",");
    polygonWs.send(JSON.stringify({ action: "subscribe", params: subscriptions }));
    tickerList.forEach(t => subscribedOnPolygon.add(t));
    console.log(`[Price WS] Subscribed to ${tickerList.length} tickers on Polygon: ${tickerList.slice(0, 10).join(", ")}${tickerList.length > 10 ? "..." : ""}`);
}

function subscribeTickerOnPolygon(ticker) {
    if (subscribedOnPolygon.has(ticker)) return;
    if (!polygonWs || polygonWs.readyState !== WebSocket.OPEN) return;

    polygonWs.send(JSON.stringify({ action: "subscribe", params: `A.${ticker}` }));
    subscribedOnPolygon.add(ticker);
    console.log(`[Price WS] + Subscribed to A.${ticker} on Polygon`);
}

function unsubscribeTickerOnPolygon(ticker) {
    if (!subscribedOnPolygon.has(ticker)) return;
    if (!polygonWs || polygonWs.readyState !== WebSocket.OPEN) return;

    polygonWs.send(JSON.stringify({ action: "unsubscribe", params: `A.${ticker}` }));
    subscribedOnPolygon.delete(ticker);
    console.log(`[Price WS] - Unsubscribed from A.${ticker} on Polygon`);
}

// ══════════════════════════════════════════════════════════════
// PRICE UPDATE HANDLERS
// ══════════════════════════════════════════════════════════════

function handleAggregateUpdate(msg) {
    const ticker = msg.sym;
    if (!ticker) return;

    const price = msg.c || msg.vw || 0; // close or vwap
    const volume = msg.v || 0;
    const open = msg.o || price;

    // Update latest price cache
    const existing = latestPrices.get(ticker);
    const prevClose = existing?.prevClose || open;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    latestPrices.set(ticker, {
        price,
        changePct: Math.round(changePct * 100) / 100,
        volume,
        prevClose,
        ts: Date.now(),
    });

    // Broadcast to subscribed clients
    broadcastPrice(ticker, price, changePct, volume);
}

function handleTradeUpdate(msg) {
    const ticker = msg.sym;
    if (!ticker) return;

    const price = msg.p || 0;
    const volume = msg.s || 0;

    const existing = latestPrices.get(ticker);
    const prevClose = existing?.prevClose || price;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    latestPrices.set(ticker, {
        price,
        changePct: Math.round(changePct * 100) / 100,
        volume: (existing?.volume || 0) + volume,
        prevClose,
        ts: Date.now(),
    });

    broadcastPrice(ticker, price, changePct, (existing?.volume || 0) + volume);
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
        // Remove from all ticker subscriptions
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
        console.log(`[Price WS] 📊 Clients: ${clients.size} | Tickers: ${tickerSubscribers.size} | Polygon: ${polygonConnected ? "✅" : "❌"} | Cached Prices: ${latestPrices.size}`);
    }
}, 60000); // Every minute

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

    // Connect to Polygon
    if (POLYGON_API_KEY) {
        connectToPolygon();
    } else {
        console.warn("[Price WS] ⚠️ No POLYGON_API_KEY set. Running in offline mode (no live prices).");
        console.warn("[Price WS] Set POLYGON_API_KEY or MASSIVE_API_KEY environment variable.");
    }
});

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[Price WS] Shutting down...");
    if (polygonWs) { try { polygonWs.close(); } catch {} }
    if (polygonReconnectTimer) clearTimeout(polygonReconnectTimer);
    wss.close();
    server.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[Price WS] SIGTERM received...");
    if (polygonWs) { try { polygonWs.close(); } catch {} }
    if (polygonReconnectTimer) clearTimeout(polygonReconnectTimer);
    wss.close();
    server.close();
    process.exit(0);
});
