#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * SIGNUM HQ — EC2 Dark Pool 100% Flow Accumulator (SSOT v3)
 * ══════════════════════════════════════════════════════════════
 *
 * v3 Changes (2026-04-17):
 *   - Switched from Upstash REST API → ElastiCache (ioredis)
 *   - Zero Upstash cost — all writes go to VPC-internal ElastiCache
 *   - Vercel reads via Redis Proxy (http://52.23.98.13:8081)
 *   - bidAsk + shortVolume included for 100% data compatibility
 *   - Universe filter: 1,000 tickers only written to Redis
 *   - _source: "ec2-flow-accumulator" tag for source tracking
 */

const WebSocket = require("ws");
const https = require("https");
const Redis = require("ioredis");
const fs = require("fs");
const path = require("path");

// ── Load ALL .env files (merge, no overwrite) ──
(function loadEnv() {
    const envPaths = [
        path.join(__dirname, '.env.local'),
        path.join(__dirname, '..', '.env.local'),
        path.join(process.cwd(), '.env.local'),
        '/opt/signum-ws/.env',
        path.join(process.env.HOME || '', '.env'),
        path.join(process.env.HOME || '', 'signum-workers', '.env.local'),
    ];
    for (const p of envPaths) {
        try {
            const content = fs.readFileSync(p, 'utf8');
            let loaded = 0;
            content.split('\n').forEach(line => {
                const match = line.match(/^([A-Z_]+)=(.+)$/);
                if (match && !process.env[match[1]]) {
                    process.env[match[1]] = match[2].trim();
                    loaded++;
                }
            });
            if (loaded > 0) console.log(`[Flow SSOT] Loaded ${loaded} vars from ${p}`);
        } catch (e) { /* skip */ }
    }
})();

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "";
const WS_URL = "wss://socket.massive.com/stocks";

// ElastiCache (VPC internal — $0 cost)
// Supports both ELASTICACHE_HOST (proxy style) and AWS_ELASTICACHE_ENDPOINT (with :port)
const rawEndpoint = process.env.ELASTICACHE_HOST || process.env.AWS_ELASTICACHE_ENDPOINT || "signum-redis.dhzfzt.0001.use1.cache.amazonaws.com:6379";
const ELASTICACHE_HOST = rawEndpoint.split(':')[0];
const ELASTICACHE_PORT = parseInt(rawEndpoint.split(':')[1] || process.env.ELASTICACHE_PORT || "6379");

const MAX_SUBSCRIBERS = 3000;
const BATCH_INTERVAL_MS = 60000;   // 60 seconds flush
const UNIVERSE_REFRESH_MS = 3600000;
const SHORT_VOL_REFRESH_MS = 3600000;

const DARK_POOL_EXCHANGES = new Set([4, 15, 16, 19]);
const RT_METRICS_TTL = 600; // 10 min

// ══════════════════════════════════════════════════════════════
// ELASTICACHE CONNECTION (ioredis)
// ══════════════════════════════════════════════════════════════

const redis = new Redis({
    host: ELASTICACHE_HOST,
    port: ELASTICACHE_PORT,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        return Math.min(times * 200, 5000);
    },
    lazyConnect: true,
});

redis.on("connect", () => console.log(`[Flow SSOT] ✅ ElastiCache connected: ${ELASTICACHE_HOST}:${ELASTICACHE_PORT}`));
redis.on("error", (e) => console.error("[Flow SSOT] ❌ Redis error:", e.message));

// ══════════════════════════════════════════════════════════════
// UNIVERSE LOADING
// ══════════════════════════════════════════════════════════════

let UNIVERSE_SET = new Set();

function loadUniverse() {
    const candidates = [
        path.join(__dirname, 'stock_universe_us800.json'),
        path.join(__dirname, '..', 'data', 'stock_universe_us800.json'),
        path.join(process.cwd(), 'data', 'stock_universe_us800.json'),
    ];
    for (const p of candidates) {
        try {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (data.symbols && Array.isArray(data.symbols)) {
                UNIVERSE_SET = new Set(data.symbols);
                console.log(`[Flow SSOT] Universe loaded: ${UNIVERSE_SET.size} tickers from ${p}`);
                return;
            }
        } catch (e) { /* skip */ }
    }
    console.warn("[Flow SSOT] ⚠️ Universe file not found, will write ALL tracked tickers.");
}

// ══════════════════════════════════════════════════════════════
// STATE MEMORY (SSOT RAM)
// ══════════════════════════════════════════════════════════════

const metricsDb = new Map();
const quotesDb = new Map();
const shortVolumeDb = new Map();
const activeTickers = new Set();
let ws = null;
let isConnected = false;

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

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

function getETNow() {
    const now = new Date();
    const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const et = new Date(etStr);
    const hour = et.getHours();
    const minute = et.getMinutes();
    const day = et.getDay();
    const etMinutes = hour * 60 + minute;
    const isSleeping = day === 0 || day === 6 || etMinutes < 240 || etMinutes >= 1200;
    return { isSleeping, etMinutes, hour, day };
}

// ══════════════════════════════════════════════════════════════
// SHORT VOLUME POLLING (Polygon REST — 1 hour interval)
// ══════════════════════════════════════════════════════════════

async function refreshShortVolume() {
    const { isSleeping } = getETNow();
    if (isSleeping) return;

    console.log("[Flow SSOT] 📊 Refreshing Short Volume data...");
    let loaded = 0;
    const tickers = [...UNIVERSE_SET];
    const BATCH = 50;

    for (let i = 0; i < tickers.length; i += BATCH) {
        const batch = tickers.slice(i, i + BATCH);
        const promises = batch.map(async (ticker) => {
            try {
                const url = `https://api.polygon.io/stocks/v1/short-volume?ticker=${ticker}&limit=1&apiKey=${POLYGON_API_KEY}`;
                const data = await httpsGet(url);
                const sv = data?.results?.[0];
                if (sv) {
                    const svVol = sv.short_volume || 0;
                    const tvVol = sv.total_volume || 1;
                    shortVolumeDb.set(ticker, {
                        percent: Math.round((svVol / tvVol) * 1000) / 10,
                        volume: svVol,
                        totalVolume: tvVol,
                    });
                    loaded++;
                }
            } catch (e) { /* skip */ }
        });
        await Promise.all(promises);
        await new Promise(r => setTimeout(r, 200));
    }
    console.log(`[Flow SSOT] ✅ Short Volume loaded for ${loaded}/${tickers.length} tickers.`);
}

// ══════════════════════════════════════════════════════════════
// UNIVERSE BUILDER
// ══════════════════════════════════════════════════════════════

async function refreshActiveUniverse() {
    const { isSleeping } = getETNow();
    if (isSleeping) {
        console.log("[Flow SSOT] Market closed, skipping universe refresh.");
        return;
    }

    console.log("[Flow SSOT] 📡 Refreshing Active Universe from Polygon Snapshot...");
    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const data = await httpsGet(url);
        if (!data || !data.tickers) throw new Error("Invalid snapshot format");

        const valid = data.tickers.filter(t => {
            const price = t.day?.c || t.prevDay?.c || 0;
            const vol = t.day?.v || t.prevDay?.v || 0;
            return price >= 1 && price <= 10000 && vol >= 100000;
        });

        valid.sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0));
        const topTickers = valid.slice(0, MAX_SUBSCRIBERS).map(t => t.ticker);
        console.log(`[Flow SSOT] ✅ Filtered ${topTickers.length} top active tickers.`);

        const newTickers = topTickers.filter(t => !activeTickers.has(t));
        if (newTickers.length > 0) {
            newTickers.forEach(t => activeTickers.add(t));
            subscribeWebsocketBatch(newTickers);
        }
    } catch (e) {
        console.error("[Flow SSOT] Universe parsing failed:", e.message);
    }
}

// ══════════════════════════════════════════════════════════════
// WEBSOCKET
// ══════════════════════════════════════════════════════════════

function connectWebsocket() {
    if (!POLYGON_API_KEY) {
        console.error("❌ No POLYGON_API_KEY. Exiting.");
        process.exit(1);
    }

    console.log("[Flow SSOT] Connecting to Polygon WS...");
    ws = new WebSocket(WS_URL);

    ws.on("open", () => {
        console.log("[Flow SSOT] ✅ WS connected. Authenticating.");
        ws.send(JSON.stringify({ action: "auth", params: POLYGON_API_KEY }));
    });

    ws.on("message", (data) => {
        try {
            const msgList = JSON.parse(data.toString());
            for (const msg of msgList) {
                if (msg.ev === "status") {
                    if (msg.status === "auth_success") {
                        console.log("[Flow SSOT] ✅ Auth success. Booting engine.");
                        isConnected = true;
                        if (activeTickers.size > 0) {
                            subscribeWebsocketBatch([...activeTickers]);
                        } else {
                            refreshActiveUniverse();
                        }
                    }
                    continue;
                }
                if (msg.ev === "Q") handleQuote(msg);
                if (msg.ev === "T") handleTrade(msg);
            }
        } catch (e) { }
    });

    ws.on("close", () => {
        console.error("[Flow SSOT] 🔴 WS Closed. Reconnecting in 5s...");
        isConnected = false;
        setTimeout(connectWebsocket, 5000);
    });

    ws.on("error", (e) => console.error("[Flow SSOT] WS Error:", e.message));
}

function subscribeWebsocketBatch(tickers) {
    if (!isConnected || !ws) return;
    const chunkSize = 1000;
    for (let i = 0; i < tickers.length; i += chunkSize) {
        const chunk = tickers.slice(i, i + chunkSize);
        const subParams = chunk.flatMap(t => [`T.${t}`, `Q.${t}`]).join(",");
        ws.send(JSON.stringify({ action: "subscribe", params: subParams }));
    }
    console.log(`[Flow SSOT] Subscribed T.* & Q.* for ${tickers.length} tickers.`);
}

// ══════════════════════════════════════════════════════════════
// REAL-TIME ENGINE
// ══════════════════════════════════════════════════════════════

function handleQuote(q) {
    const ticker = q.sym;
    if (!ticker) return;
    quotesDb.set(ticker, { bid: q.bp || 0, ask: q.ap || 0, ts: Date.now() });
}

function handleTrade(t) {
    const ticker = t.sym;
    if (!ticker) return;
    const size = t.s || 0;
    const price = t.p || 0;
    const exch = t.x;
    if (size <= 0) return;

    if (!metricsDb.has(ticker)) {
        metricsDb.set(ticker, {
            total_vol: 0, dp_vol: 0, block_count: 0, block_vol: 0,
            largest_size: 0, largest_price: 0,
            dp_buy_vol: 0, dp_sell_vol: 0, dp_buy_val: 0, dp_sell_val: 0, dp_neutral_vol: 0,
        });
    }

    const m = metricsDb.get(ticker);
    m.total_vol += size;

    if (size >= 10000 || (size * price) >= 200000) {
        m.block_count++;
        m.block_vol += size;
    }
    if (size > m.largest_size) {
        m.largest_size = size;
        m.largest_price = price;
    }

    if (DARK_POOL_EXCHANGES.has(exch)) {
        m.dp_vol += size;
        const q = quotesDb.get(ticker);
        if (q && q.bid > 0 && q.ask > 0) {
            const mid = (q.bid + q.ask) / 2;
            if (price >= q.ask) { m.dp_buy_vol += size; m.dp_buy_val += size * price; }
            else if (price <= q.bid) { m.dp_sell_vol += size; m.dp_sell_val += size * price; }
            else if (price > mid) { m.dp_buy_vol += size; m.dp_buy_val += size * price; }
            else if (price < mid) { m.dp_sell_vol += size; m.dp_sell_val += size * price; }
            else { m.dp_neutral_vol += size; }
        } else {
            m.dp_neutral_vol += size;
        }
    }
}

// ══════════════════════════════════════════════════════════════
// BATCH FLUSH TO ELASTICACHE (ioredis pipeline — ~2ms, $0 cost)
// ══════════════════════════════════════════════════════════════

async function flushToRedis() {
    const { isSleeping } = getETNow();
    if (isSleeping || metricsDb.size === 0) return;

    try {
        const pipeline = redis.pipeline();
        let count = 0;

        for (const [ticker, m] of metricsDb.entries()) {
            if (UNIVERSE_SET.size > 0 && !UNIVERSE_SET.has(ticker)) continue;

            const dpPercent = m.total_vol > 0 ? (m.dp_vol / m.total_vol) * 100 : 0;
            const dpTotalRule = m.dp_buy_vol + m.dp_sell_vol + m.dp_neutral_vol;
            const buyPct = dpTotalRule > 0 ? Math.round((m.dp_buy_vol / dpTotalRule) * 1000) / 10 : 0;
            const sellPct = dpTotalRule > 0 ? Math.round((m.dp_sell_vol / dpTotalRule) * 1000) / 10 : 0;
            const buyVwap = m.dp_buy_vol > 0 ? Math.round((m.dp_buy_val / m.dp_buy_vol) * 100) / 100 : 0;
            const sellVwap = m.dp_sell_vol > 0 ? Math.round((m.dp_sell_val / m.dp_sell_vol) * 100) / 100 : 0;

            const q = quotesDb.get(ticker);
            let bidAsk = null;
            if (q && q.bid > 0 && q.ask > 0) {
                const spread = Math.round((q.ask - q.bid) * 100) / 100;
                let label = '보통';
                if (spread <= 0.01) label = '매우 타이트';
                else if (spread <= 0.05) label = '타이트';
                else if (spread <= 0.20) label = '보통';
                else label = '넓음';
                bidAsk = { spread, bid: q.bid, ask: q.ask, label };
            }

            const sv = shortVolumeDb.get(ticker) || null;

            const payload = {
                ticker,
                timestamp: new Date().toISOString(),
                _ts: Date.now(),
                _source: "ec2-flow-accumulator",
                darkPool: {
                    percent: Math.round(dpPercent * 10) / 10,
                    volume: m.dp_vol,
                    totalVolume: m.total_vol,
                    buyPct, sellPct,
                    buyVolume: m.dp_buy_vol, sellVolume: m.dp_sell_vol,
                    buyVwap, sellVwap,
                    netBuyValue: Math.round(m.dp_buy_val - m.dp_sell_val),
                },
                blockTrade: {
                    count: m.block_count,
                    volume: m.block_vol,
                    largestTrade: { size: m.largest_size, price: m.largest_price },
                },
                bidAsk,
                shortVolume: sv,
            };

            pipeline.setex(`rt-metrics:${ticker}`, RT_METRICS_TTL, JSON.stringify(payload));
            count++;
        }

        if (count > 0) {
            await pipeline.exec();
        }

        const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        console.log(`[Flow SSOT] 🚀 Flushed ${count} tickers to ElastiCache (1 pipeline, ~2ms). Memory: ${mem}MB, Tracking: ${metricsDb.size} total.`);
    } catch (e) {
        console.error("[Flow SSOT] ElastiCache Pipeline Error:", e.message);
    }
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════

loadUniverse();

// Connect to ElastiCache
redis.connect().catch(e => console.error("[Flow SSOT] ElastiCache connect error:", e.message));

setInterval(flushToRedis, BATCH_INTERVAL_MS);
setInterval(refreshActiveUniverse, UNIVERSE_REFRESH_MS);
setInterval(refreshShortVolume, SHORT_VOL_REFRESH_MS);

// Daily Reset 03:50 AM ET
setInterval(() => {
    const { etMinutes } = getETNow();
    if (etMinutes === 230) {
        console.log("[Flow SSOT] 🧹 Daily Memory Reset");
        metricsDb.clear();
        quotesDb.clear();
        shortVolumeDb.clear();
    }
}, 60000);

console.log("[Flow SSOT] ══════════════════════════════════════════");
console.log("[Flow SSOT] EC2 Dark Pool 100% Flow Accumulator v3");
console.log("[Flow SSOT] ElastiCache: " + ELASTICACHE_HOST);
console.log("[Flow SSOT] Polygon: " + (POLYGON_API_KEY ? "✅" : "❌"));
console.log("[Flow SSOT] Universe: " + UNIVERSE_SET.size + " tickers");
console.log("[Flow SSOT] ══════════════════════════════════════════");

connectWebsocket();
setTimeout(refreshShortVolume, 5000);
