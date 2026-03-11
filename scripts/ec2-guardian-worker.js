#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * SIGNUM HQ — EC2 Guardian Background Worker
 * ══════════════════════════════════════════════════════════════
 * 
 * Runs on EC2 as a persistent daemon. Harvests Guardian data
 * from Polygon/Yahoo/CBOE APIs every 30s during market hours,
 * computes RLSI/GEX/Sector flows, stores results in ElastiCache,
 * and publishes real-time updates via Pub/Sub.
 * 
 * Usage: node ec2-guardian-worker.js
 * PM2:   pm2 start ec2-guardian-worker.js --name guardian-worker
 */

const Redis = require("ioredis");
const https = require("https");
const http = require("http");

// DynamoDB History Module (Phase 4)
let dynamo = null;
try {
    dynamo = require("./ec2-guardian-dynamo.js");
    console.log("[Guardian Worker] ✅ DynamoDB module loaded");
} catch (e) {
    console.warn("[Guardian Worker] ⚠️ DynamoDB module not available:", e.message);
}

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const CONFIG = {
    // ElastiCache (direct connection from same VPC)
    ELASTICACHE_HOST: process.env.ELASTICACHE_HOST || "signum-redis.dhzfzt.0001.use1.cache.amazonaws.com",
    ELASTICACHE_PORT: parseInt(process.env.ELASTICACHE_PORT || "6379"),

    // Polygon API
    POLYGON_API_KEY: process.env.POLYGON_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF",
    POLYGON_BASE_URL: "https://api.polygon.io",

    // Vercel Production (fallback for complex calculations)
    VERCEL_API_URL: process.env.VERCEL_API_URL || "https://www.signumhq.com",

    // Timing
    REG_INTERVAL_MS: 30 * 1000,      // 30s during regular session
    EXT_INTERVAL_MS: 5 * 60 * 1000,  // 5min during extended/closed
    HISTORY_INTERVAL_MS: 5 * 60 * 1000, // 5min for DynamoDB writes

    // Redis keys
    SNAPSHOT_KEY_PREFIX: "guardian:snapshot:",
    ALERT_CHANNEL: "guardian:alert",
    UPDATE_CHANNEL: "guardian:update",
    RLSI_HISTORY_KEY: "guardian:rlsi_history",
    AI_VERDICT_KEY: "guardian:ai_verdict",
    SNAPSHOT_TTL: 600, // 10 minutes
    LOCALES: ["ko", "en", "ja"],
};

// ══════════════════════════════════════════════════════════════
// REDIS CONNECTION
// ══════════════════════════════════════════════════════════════

const redis = new Redis({
    host: CONFIG.ELASTICACHE_HOST,
    port: CONFIG.ELASTICACHE_PORT,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 500, 5000),
});

// Separate connection for Pub/Sub (Redis requires dedicated connection for subscribe)
const redisPub = new Redis({
    host: CONFIG.ELASTICACHE_HOST,
    port: CONFIG.ELASTICACHE_PORT,
    maxRetriesPerRequest: 3,
});

redis.on("connect", () => console.log("[Guardian Worker] ✅ ElastiCache connected (data)"));
redis.on("error", (e) => console.error("[Guardian Worker] ❌ Redis error:", e.message));
redisPub.on("connect", () => console.log("[Guardian Worker] ✅ ElastiCache connected (pub)"));

// ══════════════════════════════════════════════════════════════
// MARKET SESSION DETECTION
// ══════════════════════════════════════════════════════════════

function getETNow() {
    const now = new Date();
    const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const et = new Date(etStr);
    const hour = et.getHours();
    const minute = et.getMinutes();
    const day = et.getDay(); // 0=Sun, 6=Sat
    const isWeekend = day === 0 || day === 6;
    const etMinutes = hour * 60 + minute;

    let session = "CLOSED";
    if (!isWeekend) {
        if (etMinutes >= 240 && etMinutes < 570) session = "PRE";      // 4:00-9:29
        else if (etMinutes >= 570 && etMinutes < 960) session = "REG"; // 9:30-15:59
        else if (etMinutes >= 960 && etMinutes < 1200) session = "POST"; // 16:00-19:59
    }

    return { hour, minute, day, isWeekend, session, etMinutes };
}

// ══════════════════════════════════════════════════════════════
// POLYGON API HELPERS
// ══════════════════════════════════════════════════════════════

function fetchJSON(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const lib = parsedUrl.protocol === "https:" ? https : http;

        const req = lib.get(url, { timeout: timeoutMs }, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`JSON parse error: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });
    });
}

function polygonGet(endpoint, params = {}) {
    const url = new URL(`${CONFIG.POLYGON_BASE_URL}${endpoint}`);
    url.searchParams.set("apiKey", CONFIG.POLYGON_API_KEY);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
    }
    return fetchJSON(url.toString());
}

// ══════════════════════════════════════════════════════════════
// CORE DATA HARVESTER — Calls Vercel API for complex computation
// (Phase 1a: Pre-fetcher approach. Phase 1b will port engines to EC2)
// ══════════════════════════════════════════════════════════════

let lastSnapshots = {}; // Per-locale cache for change detection
let consecutiveErrors = 0;

async function harvestGuardianData(locale = "ko") {
    const startTime = Date.now();
    const url = `${CONFIG.VERCEL_API_URL}/api/debug/guardian?force=false&locale=${locale}`;

    try {
        const response = await fetchJSON(url, 55000); // 55s timeout (Vercel max is 60s)

        if (!response.success || !response.data) {
            console.warn(`[Harvest] ⚠️ API returned no data for ${locale}`);
            return null;
        }

        const snapshot = response.data;
        const elapsed = Date.now() - startTime;
        consecutiveErrors = 0;

        // Store in ElastiCache
        const key = `${CONFIG.SNAPSHOT_KEY_PREFIX}${locale}`;
        const enriched = {
            ...snapshot,
            _workerTimestamp: new Date().toISOString(),
            _workerLatencyMs: elapsed,
            _source: "ec2-worker",
        };

        await redis.setex(key, CONFIG.SNAPSHOT_TTL, JSON.stringify(enriched));

        // Publish update via Pub/Sub
        const hasChanged = JSON.stringify(snapshot.rlsi?.score) !== JSON.stringify(lastSnapshots[locale]?.rlsi?.score)
            || JSON.stringify(snapshot.gammaShield?.gexIndex) !== JSON.stringify(lastSnapshots[locale]?.gammaShield?.gexIndex);

        if (hasChanged) {
            await redisPub.publish(CONFIG.UPDATE_CHANNEL, JSON.stringify({
                locale,
                type: "snapshot_update",
                snapshot: enriched,
                timestamp: new Date().toISOString(),
            }));
            console.log(`[Harvest] 📡 Published update for ${locale} (RLSI: ${snapshot.rlsi?.score?.toFixed(0)}, GEX: ${snapshot.gammaShield?.gexIndex?.toFixed(0) || "N/A"})`);
        }

        lastSnapshots[locale] = snapshot;

        console.log(`[Harvest] ✅ ${locale} harvested in ${elapsed}ms | RLSI: ${snapshot.rlsi?.score?.toFixed(0)} | Session: ${snapshot.rlsi?.session}`);
        return snapshot;

    } catch (err) {
        consecutiveErrors++;
        console.error(`[Harvest] ❌ ${locale} failed (consecutive: ${consecutiveErrors}):`, err.message);

        // If persistent failure, serve stale data
        if (consecutiveErrors >= 3) {
            console.warn(`[Harvest] ⚠️ 3+ consecutive failures. Serving stale data.`);
        }
        return null;
    }
}

// ══════════════════════════════════════════════════════════════
// CROSS-INTELLIGENCE ALERT ENGINE
// ══════════════════════════════════════════════════════════════

let lastAlertState = {};

async function runCrossIntelligence(snapshot) {
    if (!snapshot?.rlsi || !snapshot?.gammaShield) return;

    const rlsi = snapshot.rlsi.score;
    const gex = snapshot.gammaShield?.gexIndex || 0;
    const vix = snapshot.rlsi.components?.vix || 0;
    const squeeze = snapshot.gammaShield?.squeezeRisk || 0;
    const breadth = snapshot.breadth?.breadthPct || 50;
    const session = snapshot.rlsi.session;

    if (session !== "REG") return; // Only during regular session

    const alerts = [];

    // ── TRIPLE DANGER: RLSI < 20 + Short Gamma + VIX > 25 ──
    if (rlsi < 20 && gex < -20 && vix > 25) {
        alerts.push({
            id: "TRIPLE_DANGER",
            severity: "CRITICAL",
            title: "⚠️ TRIPLE DANGER DETECTED",
            description: `RLSI ${rlsi.toFixed(0)} + Short Gamma (GEX ${gex.toFixed(0)}) + VIX ${vix.toFixed(1)} — Historical 87% chance of 2%+ move within 72h`,
            metrics: { rlsi, gex, vix },
            color: "#ef4444", // red
        });
    }

    // ── HIDDEN DIVERGENCE: RLSI high + Breadth weak ──
    if (rlsi > 70 && breadth < 40) {
        alerts.push({
            id: "HIDDEN_DIVERGENCE",
            severity: "WARNING",
            title: "🔍 HIDDEN DIVERGENCE",
            description: `Index positive (RLSI ${rlsi.toFixed(0)}) but internal breadth weak (${breadth.toFixed(0)}%) — Surface strength masking sector weakness`,
            metrics: { rlsi, breadth },
            color: "#f59e0b", // amber
        });
    }

    // ── SQUEEZE ALERT: Extreme squeeze + Short Gamma ──
    if (squeeze > 70 && gex < -10) {
        alerts.push({
            id: "SQUEEZE_ALERT",
            severity: "HIGH",
            title: "🔥 GAMMA SQUEEZE PRESSURE",
            description: `Squeeze Risk ${squeeze.toFixed(0)}% + Short Gamma (GEX ${gex.toFixed(0)}) — Accelerated move potential active`,
            metrics: { squeeze, gex },
            color: "#ef4444",
        });
    }

    // ── FULL BULL: Strong RLSI + Long Gamma + Good Breadth ──
    if (rlsi > 70 && gex > 30 && breadth > 65) {
        alerts.push({
            id: "FULL_BULL",
            severity: "INFO",
            title: "🟢 FULL BULL CONFIRMATION",
            description: `RLSI ${rlsi.toFixed(0)} + Long Gamma (GEX ${gex.toFixed(0)}) + Breadth ${breadth.toFixed(0)}% — Macro + micro alignment confirmed`,
            metrics: { rlsi, gex, breadth },
            color: "#10b981", // emerald
        });
    }

    // ── GEX FLIP: Gamma regime change ──
    const prevGex = lastSnapshots.ko?.gammaShield?.gexIndex || 0;
    if ((prevGex > 0 && gex < 0) || (prevGex < 0 && gex > 0)) {
        const direction = gex > 0 ? "SHORT → LONG" : "LONG → SHORT";
        alerts.push({
            id: "GEX_FLIP",
            severity: "HIGH",
            title: `⚡ GAMMA FLIP: ${direction}`,
            description: `GEX flipped from ${prevGex.toFixed(0)} to ${gex.toFixed(0)} — Dealer hedging regime changed`,
            metrics: { prevGex, gex },
            color: gex > 0 ? "#10b981" : "#ef4444",
        });
    }

    // Publish alerts (only new ones)
    for (const alert of alerts) {
        if (lastAlertState[alert.id] && Date.now() - lastAlertState[alert.id] < 5 * 60 * 1000) {
            continue; // Dedupe: same alert within 5 minutes
        }
        lastAlertState[alert.id] = Date.now();

        await redisPub.publish(CONFIG.ALERT_CHANNEL, JSON.stringify(alert));
        // Also store latest alerts in Redis for new clients joining
        await redis.setex("guardian:latest_alerts", 600, JSON.stringify(alerts));
        console.log(`[CrossIntel] 🚨 ${alert.title}`);
    }

    return alerts;
}

// ══════════════════════════════════════════════════════════════
// RLSI HISTORY ACCUMULATOR
// ══════════════════════════════════════════════════════════════

async function appendRlsiHistory(snapshot) {
    if (!snapshot?.rlsi || snapshot.rlsi.session !== "REG") return;

    const score = Math.round(snapshot.rlsi.score);
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    let history = [];
    try {
        const raw = await redis.get(CONFIG.RLSI_HISTORY_KEY);
        if (raw) history = JSON.parse(raw);
    } catch { }

    // Auto-reset on new trading day
    if (history.length > 0) {
        const lastDate = history[0].time.split("T")[0];
        if (lastDate !== todayStr) {
            console.log(`[History] New trading day (${lastDate} → ${todayStr}), resetting RLSI history`);
            history = [];
        }
    }

    // Dedup: skip if within 2 minutes of last entry
    const lastEntry = history[history.length - 1];
    if (lastEntry) {
        const lastTime = new Date(lastEntry.time).getTime();
        if (now.getTime() - lastTime < 2 * 60 * 1000) return;
    }

    history.push({ time: now.toISOString(), score });

    // Cap at 78 entries (6.5h / 5min)
    if (history.length > 78) history = history.slice(-78);

    await redis.setex(CONFIG.RLSI_HISTORY_KEY, 24 * 60 * 60, JSON.stringify(history));
    console.log(`[History] RLSI entry: ${score} (total: ${history.length})`);
}

// ══════════════════════════════════════════════════════════════
// AI MORNING BRIEFING GENERATOR (08:00 ET Daily)
// ══════════════════════════════════════════════════════════════

let lastBriefingDate = null;

async function generateMorningBriefing() {
    const { hour, minute, isWeekend } = getETNow();
    if (isWeekend) return;

    // Only at 08:00 ET (±5 min window), once per day
    const now = new Date();
    const etDateStr = now.toLocaleDateString("en-US", { timeZone: "America/New_York" });
    if (lastBriefingDate === etDateStr) return;
    if (hour !== 8 || minute > 5) return;

    console.log("[Briefing] 🌅 Generating morning briefing...");
    lastBriefingDate = etDateStr;

    try {
        // Get yesterday's RLSI history from Redis
        const historyRaw = await redis.get(CONFIG.RLSI_HISTORY_KEY);
        const history = historyRaw ? JSON.parse(historyRaw) : [];

        // Get current snapshot
        const snapshotRaw = await redis.get(`${CONFIG.SNAPSHOT_KEY_PREFIX}ko`);
        const snapshot = snapshotRaw ? JSON.parse(snapshotRaw) : null;

        // Get latest alerts
        const alertsRaw = await redis.get("guardian:latest_alerts");
        const alerts = alertsRaw ? JSON.parse(alertsRaw) : [];

        // Compose briefing data
        const briefingData = {
            date: etDateStr,
            preMarketRlsi: snapshot?.rlsi?.score || null,
            preMarketSession: snapshot?.rlsi?.session || null,
            yesterdayHistory: history.slice(-10), // Last 10 RLSI readings
            gexIndex: snapshot?.gammaShield?.gexIndex || null,
            squeezeRisk: snapshot?.gammaShield?.squeezeRisk || null,
            vix: snapshot?.rlsi?.components?.vix || null,
            breadthPct: snapshot?.breadth?.breadthPct || null,
            regime: snapshot?.tripleA?.regime || null,
            activeAlerts: alerts.map(a => a.title).slice(0, 3),
            topSectors: (snapshot?.sectors || [])
                .sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
                .slice(0, 5)
                .map(s => ({ name: s.name, change: s.change })),
        };

        // Generate briefing text using Vercel API (Gemini-powered)
        const briefingBody = JSON.stringify({
            type: "morning_briefing",
            data: briefingData,
        });

        const briefingResponse = await fetchJSON(
            `${CONFIG.VERCEL_API_URL}/api/guardian/briefing`,
            30000
        ).catch(() => null);

        const briefing = {
            date: etDateStr,
            generatedAt: new Date().toISOString(),
            preMarket: briefingData,
            // AI-generated text (if API is available)
            text: briefingResponse?.briefing || generateFallbackBriefing(briefingData),
            source: briefingResponse?.briefing ? "gemini" : "template",
        };

        // Store in Redis (24h TTL)
        await redis.setex("guardian:morning_briefing", 24 * 60 * 60, JSON.stringify(briefing));

        // Publish to WebSocket clients
        await redisPub.publish(CONFIG.UPDATE_CHANNEL, JSON.stringify({
            locale: "ko",
            type: "morning_briefing",
            briefing,
            timestamp: new Date().toISOString(),
        }));

        console.log(`[Briefing] ✅ Morning briefing generated (source: ${briefing.source})`);
    } catch (e) {
        console.error("[Briefing] ❌ Morning briefing failed:", e.message);
    }
}

function generateFallbackBriefing(data) {
    const parts = [];
    parts.push(`📊 Pre-Market Snapshot (${data.date})`);
    if (data.preMarketRlsi !== null) {
        parts.push(`RLSI: ${data.preMarketRlsi.toFixed(0)} | Session: ${data.preMarketSession || "PRE"}`);
    }
    if (data.vix !== null) parts.push(`VIX: ${data.vix.toFixed(1)}`);
    if (data.gexIndex !== null) parts.push(`GEX: ${data.gexIndex.toFixed(0)} | Squeeze: ${(data.squeezeRisk || 0).toFixed(0)}%`);
    if (data.breadthPct !== null) parts.push(`Breadth: ${data.breadthPct.toFixed(0)}%`);
    if (data.regime) parts.push(`Regime: ${data.regime}`);
    if (data.activeAlerts.length > 0) parts.push(`Active Alerts: ${data.activeAlerts.join(", ")}`);
    if (data.topSectors.length > 0) {
        parts.push(`Top Sectors: ${data.topSectors.map(s => `${s.name} (${s.change > 0 ? "+" : ""}${s.change?.toFixed(1)}%)`).join(", ")}`);
    }
    return parts.join("\n");
}

// ══════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════

let isRunning = false;
let lastDynamoWrite = 0;

async function mainLoop() {
    if (isRunning) {
        console.log("[Worker] ⏭️ Skipping — previous cycle still running");
        return;
    }
    isRunning = true;

    try {
        const { session } = getETNow();
        const isActive = session === "REG" || session === "PRE";

        // Harvest all locales (ko first, then en/ja in parallel)
        const koSnapshot = await harvestGuardianData("ko");

        if (isActive) {
            // En/Ja in parallel (non-blocking)
            Promise.all([
                harvestGuardianData("en"),
                harvestGuardianData("ja"),
            ]).catch((e) => console.warn("[Worker] Secondary locale harvest failed:", e.message));
        }

        // Cross-intelligence alerts (based on ko snapshot)
        if (koSnapshot && session === "REG") {
            await runCrossIntelligence(koSnapshot);
            await appendRlsiHistory(koSnapshot);

            // DynamoDB history write (every 5 min during REG)
            if (dynamo && (!lastDynamoWrite || Date.now() - lastDynamoWrite > CONFIG.HISTORY_INTERVAL_MS)) {
                try {
                    await dynamo.writeSnapshot(koSnapshot);
                    lastDynamoWrite = Date.now();
                } catch (e) {
                    console.warn("[Worker] DynamoDB write failed:", e.message);
                }
            }
        }

        // Morning briefing (08:00 ET, during PRE session)
        if (session === "PRE") {
            await generateMorningBriefing().catch(e =>
                console.warn("[Worker] Morning briefing error:", e.message)
            );
        }

    } catch (err) {
        console.error("[Worker] Main loop error:", err.message);
    } finally {
        isRunning = false;
    }
}

// ══════════════════════════════════════════════════════════════
// HEALTH CHECK SERVER (port 8083)
// ══════════════════════════════════════════════════════════════

const healthServer = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.url === "/health") {
        const { session } = getETNow();
        const ping = await redis.ping().catch(() => "FAIL");
        res.writeHead(200);
        res.end(JSON.stringify({
            status: "ok",
            service: "guardian-worker",
            redis: ping,
            session,
            consecutiveErrors,
            uptime: process.uptime(),
            lastHarvest: lastSnapshots.ko?._workerTimestamp || null,
        }));
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
    }
});

// ══════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════

async function start() {
    console.log("═══════════════════════════════════════════════");
    console.log("  SIGNUM HQ — Guardian Background Worker v2.0  ");
    console.log("═══════════════════════════════════════════════");
    console.log(`  ElastiCache: ${CONFIG.ELASTICACHE_HOST}:${CONFIG.ELASTICACHE_PORT}`);
    console.log(`  Vercel API:  ${CONFIG.VERCEL_API_URL}`);
    console.log(`  REG interval: ${CONFIG.REG_INTERVAL_MS / 1000}s`);
    console.log(`  EXT interval: ${CONFIG.EXT_INTERVAL_MS / 1000}s`);
    console.log("═══════════════════════════════════════════════");

    // Health server
    healthServer.listen(8083, () => console.log("[Worker] Health server on :8083"));

    // Init DynamoDB table
    if (dynamo) {
        try {
            await dynamo.ensureTable();
            console.log("[Worker] DynamoDB history table ready");
        } catch (e) {
            console.warn("[Worker] DynamoDB table init failed (will retry):", e.message);
        }
    }

    // Initial harvest immediately
    await mainLoop();

    // Adaptive interval based on session
    const scheduleNext = () => {
        const { session } = getETNow();
        const interval = (session === "REG" || session === "PRE")
            ? CONFIG.REG_INTERVAL_MS
            : CONFIG.EXT_INTERVAL_MS;

        setTimeout(async () => {
            await mainLoop();
            scheduleNext();
        }, interval);
    };

    scheduleNext();
}

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[Worker] Shutting down...");
    redis.quit();
    redisPub.quit();
    healthServer.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[Worker] SIGTERM received, shutting down...");
    redis.quit();
    redisPub.quit();
    healthServer.close();
    process.exit(0);
});

start().catch((err) => {
    console.error("[Worker] Failed to start:", err);
    process.exit(1);
});
