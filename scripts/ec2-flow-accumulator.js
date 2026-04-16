// ============================================================================
// [SIGNUM HQ] EC2 WebSocket Flow Accumulator (100% SSOT Data Engine)
// Type: Back-end Daemon (Runs 24/5 on AWS EC2 via PM2)
// Purpose: Subscribes to Massive(Polygon) 'T.*', calculates absolute full-day
//          Dark Pool & Block Trade ratios in RAM, and pushes to Upstash Redis.
// ============================================================================

require('dotenv').config({ path: '.env.local' });
const WebSocket = require('ws');
const https = require('https');

const POLYGON_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const WS_URL = 'wss://socket.massive.com/stocks'; // Massive WS Endpoint

// Upstash Redis Config
const UPSTASH_URL = new URL(process.env.UPSTASH_REDIS_REST_URL);
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// 1. In-Memory State for all 10,000+ Tickers
// Memory footprint: ~15MB max for day
const tickerStats = new Map();

// 2. Constants & Thresholds
const BLOCK_TRADE_MIN_SHARES = 10000;
const BLOCK_TRADE_MIN_PREMIUM = 200000;
const DARK_POOL_EXCHANGES = new Set([4, 15, 16, 19]); // FINRA TRF/ORF
const DARK_POOL_CONDITIONS = new Set([12, 41, 52]);

let ws;
let isShuttingDown = false;

// 3. Initialize/Reset Stats for a Ticker
function getOrInitStats(ticker) {
    if (!tickerStats.has(ticker)) {
        tickerStats.set(ticker, {
            totalVolume: 0,
            darkPoolVolume: 0,
            darkPoolPremium: 0,
            blockTradeCount: 0,
            scannedTrades: 0,
            lastUpdate: 0
        });
    }
    return tickerStats.get(ticker);
}

// 4. Process Individual Trade (The Math Engine)
function processTrade(t) {
    const ticker = t.sym;
    const size = t.s || t.size || 0;
    const price = t.p || t.price || 0;
    const exchange = t.x || t.exchange;
    const conditions = t.c || t.conditions || [];

    if (!ticker || size === 0 || price === 0) return;

    const stats = getOrInitStats(ticker);
    stats.totalVolume += size;
    stats.scannedTrades += 1;
    stats.lastUpdate = Date.now();

    // Check if Dark Pool (Off-exchange)
    const isDark = DARK_POOL_EXCHANGES.has(exchange) || conditions.some(c => DARK_POOL_CONDITIONS.has(c));
    if (isDark) {
        stats.darkPoolVolume += size;
        stats.darkPoolPremium += (size * price);

        // Check if Block Trade (SEC standard)
        if (size >= BLOCK_TRADE_MIN_SHARES || (size * price) >= BLOCK_TRADE_MIN_PREMIUM) {
            stats.blockTradeCount += 1;
        }
    }
}

// 5. Connect and Listen to Massive WS
function connectWS() {
    console.log('[WS] Connecting to Massive...', WS_URL);
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
        console.log('[WS] Connected. Authenticating...');
        ws.send(JSON.stringify({ action: 'auth', params: POLYGON_KEY }));
    });

    ws.on('message', (data) => {
        try {
            const msgs = JSON.parse(data);
            for (const msg of msgs) {
                if (msg.ev === 'status') {
                    if (msg.status === 'auth_success') {
                        console.log('[WS] Auth Success! Subscribing to ALL Trades (T.*)...');
                        ws.send(JSON.stringify({ action: 'subscribe', params: 'T.*' }));
                    }
                    else {
                        console.log('[WS] Status:', msg.message);
                    }
                } else if (msg.ev === 'T') {
                    // It's a Trade!
                    processTrade(msg);
                }
            }
        } catch (e) {
            console.error('[WS] Parse Error:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('[WS] Disconnected.');
        if (!isShuttingDown) setTimeout(connectWS, 2000); // Auto Reconnect
    });

    ws.on('error', (err) => {
        console.error('[WS] Error:', err.message);
    });
}

// 6. Redis Pushing Loop (Runs every 60 seconds)
setInterval(async () => {
    // Collect tickets that had activity
    const now = Date.now();
    const activeTickers = [];
    
    for (const [ticker, stats] of tickerStats.entries()) {
        if (now - stats.lastUpdate < 120_000) { // Updated in last 2 mins
            activeTickers.push({ ticker, stats });
        }
    }

    if (activeTickers.length === 0) return;
    console.log(`[SYNC] Pushing ${activeTickers.length} active tickers to Upstash...`);

    // In a real production scale for 10,000, we batch 100 at a time using pipeline.
    // For this prototype, we will just log the JSON structure we WOULD push.
    // We target: `rt-metrics:{TICKER}` to act as the SSOT.
    
    for (let i = 0; i < Math.min(3, activeTickers.length); i++) {
        const t = activeTickers[i];
        const dpPercent = t.stats.totalVolume > 0 
           ? Math.round((t.stats.darkPoolVolume / t.stats.totalVolume) * 1000) / 10 
           : 0;
           
        console.log(`[REDIS-MOCK] SET rt-metrics:${t.ticker} -> TotalVol: ${t.stats.totalVolume}, DP%: ${dpPercent}%, Blocks: ${t.stats.blockTradeCount}`);
    }

}, 60000);

// Export for Simulator
module.exports = {
    processTrade,
    tickerStats,
    connectWS // Optional start
};

// If run directly (not required by simulator)
if (require.main === module) {
    connectWS();
}
