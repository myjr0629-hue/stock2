#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * SIGNUM HQ — EC2 Guardian WebSocket Hub
 * ══════════════════════════════════════════════════════════════
 * 
 * Subscribes to ElastiCache Pub/Sub channels and pushes real-time
 * Guardian updates to all connected browser clients.
 * 
 * Channels:
 *   guardian:update  — Full snapshot delta (RLSI, GEX, Sectors)
 *   guardian:alert   — Cross-intelligence alerts (Triple Danger, etc.)
 * 
 * Usage: node ec2-guardian-ws.js
 * PM2:   pm2 start ec2-guardian-ws.js --name guardian-ws
 */

const WebSocket = require("ws");
const Redis = require("ioredis");
const http = require("http");
const url = require("url");

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.WS_PORT || "8082");
const ELASTICACHE_HOST = process.env.ELASTICACHE_HOST || "signum-redis.dhzfzt.0001.use1.cache.amazonaws.com";
const ELASTICACHE_PORT = parseInt(process.env.ELASTICACHE_PORT || "6379");
const SNAPSHOT_KEY_PREFIX = "guardian:snapshot:";

// ══════════════════════════════════════════════════════════════
// REDIS CONNECTIONS
// ══════════════════════════════════════════════════════════════

// Subscriber connection (dedicated, as Redis requires for SUBSCRIBE)
const redisSub = new Redis({
    host: ELASTICACHE_HOST,
    port: ELASTICACHE_PORT,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 500, 5000),
});

// Data reader connection (for serving initial snapshot to new clients)
const redisData = new Redis({
    host: ELASTICACHE_HOST,
    port: ELASTICACHE_PORT,
    maxRetriesPerRequest: 3,
});

redisSub.on("connect", () => console.log("[WS Hub] ✅ Redis subscriber connected"));
redisSub.on("error", (e) => console.error("[WS Hub] ❌ Redis sub error:", e.message));
redisData.on("connect", () => console.log("[WS Hub] ✅ Redis data reader connected"));

// ══════════════════════════════════════════════════════════════
// CLIENT MANAGEMENT
// ══════════════════════════════════════════════════════════════

const clients = new Map(); // ws -> { locale, connectedAt, lastPing }

function getClientCount() {
    return clients.size;
}

function getClientsByLocale(locale) {
    const result = [];
    for (const [ws, meta] of clients.entries()) {
        if (meta.locale === locale && ws.readyState === WebSocket.OPEN) {
            result.push(ws);
        }
    }
    return result;
}

function broadcastToLocale(locale, data) {
    const targets = getClientsByLocale(locale);
    const message = typeof data === "string" ? data : JSON.stringify(data);
    let sent = 0;
    for (const ws of targets) {
        try {
            ws.send(message);
            sent++;
        } catch (e) {
            console.warn("[WS Hub] Send error:", e.message);
        }
    }
    return sent;
}

function broadcastToAll(data) {
    const message = typeof data === "string" ? data : JSON.stringify(data);
    let sent = 0;
    for (const [ws] of clients.entries()) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(message);
                sent++;
            } catch (e) { /* skip */ }
        }
    }
    return sent;
}

// ══════════════════════════════════════════════════════════════
// WEBSOCKET SERVER
// ══════════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
    // Health check endpoint
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status: "ok",
            service: "guardian-ws-hub",
            clients: getClientCount(),
            uptime: process.uptime(),
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

const wss = new WebSocket.Server({
    server,
    path: "/guardian",
    // Allow all origins for now (tighten in production with verifyClient)
});

wss.on("connection", async (ws, req) => {
    // Parse locale from query string: ws://host/guardian?locale=ko
    const parsed = url.parse(req.url, true);
    const locale = parsed.query.locale || "ko";

    clients.set(ws, {
        locale,
        connectedAt: Date.now(),
        lastPing: Date.now(),
    });

    console.log(`[WS Hub] 🔌 Client connected (locale: ${locale}, total: ${getClientCount()})`);

    // Send initial snapshot immediately from ElastiCache
    try {
        const snapshotKey = `${SNAPSHOT_KEY_PREFIX}${locale}`;
        const cached = await redisData.get(snapshotKey);
        if (cached) {
            ws.send(JSON.stringify({
                type: "initial_snapshot",
                data: JSON.parse(cached),
                timestamp: new Date().toISOString(),
            }));
            console.log(`[WS Hub] 📦 Sent initial snapshot to client (locale: ${locale})`);
        }

        // Also send latest alerts if any
        const alertsRaw = await redisData.get("guardian:latest_alerts");
        if (alertsRaw) {
            ws.send(JSON.stringify({
                type: "alerts",
                data: JSON.parse(alertsRaw),
                timestamp: new Date().toISOString(),
            }));
        }
    } catch (e) {
        console.warn("[WS Hub] Failed to send initial snapshot:", e.message);
    }

    // Handle client messages (ping/pong, subscription changes)
    ws.on("message", (message) => {
        try {
            const msg = JSON.parse(message);

            // Locale change
            if (msg.type === "set_locale" && msg.locale) {
                const meta = clients.get(ws);
                if (meta) meta.locale = msg.locale;
                console.log(`[WS Hub] Client changed locale to ${msg.locale}`);
            }

            // Ping
            if (msg.type === "ping") {
                const meta = clients.get(ws);
                if (meta) meta.lastPing = Date.now();
                ws.send(JSON.stringify({ type: "pong" }));
            }
        } catch { /* Ignore malformed messages */ }
    });

    // Cleanup on disconnect
    ws.on("close", () => {
        clients.delete(ws);
        console.log(`[WS Hub] 🔌 Client disconnected (total: ${getClientCount()})`);
    });

    ws.on("error", (e) => {
        console.warn("[WS Hub] Client error:", e.message);
        clients.delete(ws);
    });
});

// ══════════════════════════════════════════════════════════════
// REDIS PUB/SUB → WEBSOCKET BRIDGE
// ══════════════════════════════════════════════════════════════

// Subscribe to Guardian channels
redisSub.subscribe("guardian:update", "guardian:alert", (err, count) => {
    if (err) {
        console.error("[WS Hub] Failed to subscribe:", err.message);
    } else {
        console.log(`[WS Hub] 📡 Subscribed to ${count} channels`);
    }
});

redisSub.on("message", (channel, message) => {
    try {
        const data = JSON.parse(message);

        if (channel === "guardian:update") {
            // Route to matching locale
            const locale = data.locale || "ko";
            const sent = broadcastToLocale(locale, {
                type: "snapshot_update",
                data: data.snapshot || data,
                timestamp: data.timestamp || new Date().toISOString(),
            });
            if (sent > 0) {
                console.log(`[WS Hub] 📡 Pushed snapshot update to ${sent} clients (${locale})`);
            }
        }

        if (channel === "guardian:alert") {
            // Alerts go to ALL clients
            const sent = broadcastToAll({
                type: "alert",
                data,
                timestamp: new Date().toISOString(),
            });
            if (sent > 0) {
                console.log(`[WS Hub] 🚨 Pushed alert to ${sent} clients: ${data.title || "Unknown"}`);
            }
        }
    } catch (e) {
        console.warn("[WS Hub] Message parse error:", e.message);
    }
});

// ══════════════════════════════════════════════════════════════
// PING/PONG KEEPALIVE
// ══════════════════════════════════════════════════════════════

setInterval(() => {
    const now = Date.now();
    for (const [ws, meta] of clients.entries()) {
        // Disconnect stale clients (no ping in 2 minutes)
        if (now - meta.lastPing > 120000) {
            console.log("[WS Hub] Disconnecting stale client");
            ws.terminate();
            clients.delete(ws);
            continue;
        }
        // Send server-side ping
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }
}, 30000); // Every 30 seconds

// ══════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════

server.listen(PORT, () => {
    console.log("═══════════════════════════════════════════════");
    console.log("  SIGNUM HQ — Guardian WebSocket Hub v1.0      ");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Port:        ${PORT}`);
    console.log(`  Path:        ws://host:${PORT}/guardian`);
    console.log(`  ElastiCache: ${ELASTICACHE_HOST}:${ELASTICACHE_PORT}`);
    console.log(`  Channels:    guardian:update, guardian:alert`);
    console.log("═══════════════════════════════════════════════");
});

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[WS Hub] Shutting down...");
    wss.close();
    redisSub.quit();
    redisData.quit();
    server.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[WS Hub] SIGTERM received...");
    wss.close();
    redisSub.quit();
    redisData.quit();
    server.close();
    process.exit(0);
});
