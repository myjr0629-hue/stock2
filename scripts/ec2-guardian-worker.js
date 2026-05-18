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

// [FIX 2026-05-18] Lazy-load Bedrock SDK — Node 16 lacks TransformStream required by AWS SDK v3.
// Top-level require crashes the entire worker. Lazy-load only when Bedrock is actually needed.
let _BedrockRuntimeClient = null;
let _InvokeModelCommand = null;
let _bedrockClient = null;

function getBedrock() {
    if (_bedrockClient) return _bedrockClient;
    if (!_BedrockRuntimeClient) {
        try {
            const sdk = require("@aws-sdk/client-bedrock-runtime");
            _BedrockRuntimeClient = sdk.BedrockRuntimeClient;
            _InvokeModelCommand = sdk.InvokeModelCommand;
        } catch (e) {
            console.error("[Guardian Worker] ❌ Bedrock SDK load failed:", e.message);
            return null;
        }
    }
    _bedrockClient = new _BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
    });
    return _bedrockClient;
}

function getInvokeModelCommand() {
    if (!_InvokeModelCommand) getBedrock();
    return _InvokeModelCommand;
}

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
    EXT_INTERVAL_MS: 30 * 1000,       // 30s during ALL sessions — real-time
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
// CROSS-INTELLIGENCE ALERT ENGINE (Multi-Locale + Compliance)
// ══════════════════════════════════════════════════════════════

let lastAlertState = {};
let preEventGexSnapshot = null; // GEX before event release

// ── Multi-locale alert templates (compliance-safe: observation only) ──

const ALERT_TEXT = {
    TRIPLE_DANGER: {
        ko: (m) => ({
            title: "⚠️ 다중 위험 신호 동시 활성",
            description: `RLSI ${m.rlsi.toFixed(0)} + 숏 감마 (GEX ${m.gex.toFixed(0)}) + VIX ${m.vix.toFixed(1)} — 3중 위험 지표가 동시에 관찰됨`,
        }),
        en: (m) => ({
            title: "⚠️ TRIPLE RISK SIGNALS ACTIVE",
            description: `RLSI ${m.rlsi.toFixed(0)} + Short Gamma (GEX ${m.gex.toFixed(0)}) + VIX ${m.vix.toFixed(1)} — Three risk indicators simultaneously observed`,
        }),
        ja: (m) => ({
            title: "⚠️ トリプルリスクシグナル同時発生",
            description: `RLSI ${m.rlsi.toFixed(0)} + ショートガンマ (GEX ${m.gex.toFixed(0)}) + VIX ${m.vix.toFixed(1)} — 3重リスク指標が同時に観測`,
        }),
    },
    HIDDEN_DIVERGENCE: {
        ko: (m) => ({
            title: "🔍 히든 다이버전스 관찰",
            description: `지수 양호 (RLSI ${m.rlsi.toFixed(0)}) 그러나 내부 체력 약세 (Breadth ${m.breadth.toFixed(0)}%) — 표면 강세 이면 섹터 약세 동시 관찰`,
        }),
        en: (m) => ({
            title: "🔍 HIDDEN DIVERGENCE OBSERVED",
            description: `Index positive (RLSI ${m.rlsi.toFixed(0)}) with weak internals (Breadth ${m.breadth.toFixed(0)}%) — Surface strength coincides with sector weakness`,
        }),
        ja: (m) => ({
            title: "🔍 ヒドゥンダイバージェンス観測",
            description: `指数は良好 (RLSI ${m.rlsi.toFixed(0)}) ですが内部体力は弱い (Breadth ${m.breadth.toFixed(0)}%) — 表面の強さとセクターの弱さが同時に観測`,
        }),
    },
    SQUEEZE_ALERT: {
        ko: (m) => ({
            title: "🔥 감마 스퀴즈 압력 감지",
            description: `Squeeze Risk ${m.squeeze.toFixed(0)}% + 숏 감마 (GEX ${m.gex.toFixed(0)}) — 높은 스퀴즈 압력과 숏 감마 구간이 동시 관찰됨`,
        }),
        en: (m) => ({
            title: "🔥 GAMMA SQUEEZE PRESSURE DETECTED",
            description: `Squeeze Risk ${m.squeeze.toFixed(0)}% + Short Gamma (GEX ${m.gex.toFixed(0)}) — High squeeze pressure with short gamma simultaneously observed`,
        }),
        ja: (m) => ({
            title: "🔥 ガンマスクイーズ圧力検出",
            description: `Squeeze Risk ${m.squeeze.toFixed(0)}% + ショートガンマ (GEX ${m.gex.toFixed(0)}) — 高いスクイーズ圧力とショートガンマが同時に観測`,
        }),
    },
    FULL_BULL: {
        ko: (m) => ({
            title: "🟢 전 지표 긍정 정렬 확인",
            description: `RLSI ${m.rlsi.toFixed(0)} + 롱 감마 (GEX ${m.gex.toFixed(0)}) + Breadth ${m.breadth.toFixed(0)}% — 매크로·마이크로 지표 동시 긍정 관찰`,
        }),
        en: (m) => ({
            title: "🟢 FULL POSITIVE ALIGNMENT CONFIRMED",
            description: `RLSI ${m.rlsi.toFixed(0)} + Long Gamma (GEX ${m.gex.toFixed(0)}) + Breadth ${m.breadth.toFixed(0)}% — Macro and micro indicators simultaneously positive`,
        }),
        ja: (m) => ({
            title: "🟢 全指標ポジティブ整列確認",
            description: `RLSI ${m.rlsi.toFixed(0)} + ロングガンマ (GEX ${m.gex.toFixed(0)}) + Breadth ${m.breadth.toFixed(0)}% — マクロ・ミクロ指標が同時にポジティブ`,
        }),
    },
    GEX_FLIP: {
        ko: (m) => ({
            title: `⚡ 감마 전환: ${m.direction}`,
            description: `GEX ${m.prevGex.toFixed(0)} → ${m.gex.toFixed(0)} 전환 관찰 — 딜러 헤징 체제 변경 감지`,
        }),
        en: (m) => ({
            title: `⚡ GAMMA FLIP: ${m.direction}`,
            description: `GEX shifted from ${m.prevGex.toFixed(0)} to ${m.gex.toFixed(0)} — Dealer hedging regime change observed`,
        }),
        ja: (m) => ({
            title: `⚡ ガンマフリップ: ${m.direction}`,
            description: `GEX ${m.prevGex.toFixed(0)} → ${m.gex.toFixed(0)} に転換 — ディーラーヘッジ体制の変更を観測`,
        }),
    },
    EVENT_IMPACT: {
        ko: (m) => ({
            title: `📊 지표 발표 임팩트: ${m.eventName}`,
            description: `발표값 ${m.actual} (예상 ${m.estimate}) — 발표 후 GEX ${m.gexBefore.toFixed(0)} → ${m.gexAfter.toFixed(0)} 변동 관찰 (${m.gexDelta > 0 ? "+" : ""}${m.gexDelta.toFixed(0)}pt)${m.regimeChange ? ", 감마 체제 전환 감지" : ""}`,
        }),
        en: (m) => ({
            title: `📊 EVENT IMPACT: ${m.eventName}`,
            description: `Actual ${m.actual} (Est ${m.estimate}) — Post-release GEX ${m.gexBefore.toFixed(0)} → ${m.gexAfter.toFixed(0)} observed (${m.gexDelta > 0 ? "+" : ""}${m.gexDelta.toFixed(0)}pt)${m.regimeChange ? ", gamma regime change detected" : ""}`,
        }),
        ja: (m) => ({
            title: `📊 指標発表インパクト: ${m.eventName}`,
            description: `実績値 ${m.actual} (予想 ${m.estimate}) — 発表後GEX ${m.gexBefore.toFixed(0)} → ${m.gexAfter.toFixed(0)} 変動観測 (${m.gexDelta > 0 ? "+" : ""}${m.gexDelta.toFixed(0)}pt)${m.regimeChange ? "、ガンマ体制転換を検出" : ""}`,
        }),
    },
};

function getAlertText(id, locale, metrics) {
    const template = ALERT_TEXT[id];
    if (!template) return { title: id, description: "" };
    const fn = template[locale] || template.en;
    return fn(metrics);
}

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
        const metrics = { rlsi, gex, vix };
        for (const locale of CONFIG.LOCALES) {
            const text = getAlertText("TRIPLE_DANGER", locale, metrics);
            alerts.push({ ...text, id: "TRIPLE_DANGER", severity: "CRITICAL", metrics, color: "#ef4444", locale });
        }
    }

    // ── HIDDEN DIVERGENCE: RLSI high + Breadth weak ──
    if (rlsi > 70 && breadth < 40) {
        const metrics = { rlsi, breadth };
        for (const locale of CONFIG.LOCALES) {
            const text = getAlertText("HIDDEN_DIVERGENCE", locale, metrics);
            alerts.push({ ...text, id: "HIDDEN_DIVERGENCE", severity: "WARNING", metrics, color: "#f59e0b", locale });
        }
    }

    // ── SQUEEZE ALERT: Extreme squeeze + Short Gamma ──
    if (squeeze > 70 && gex < -10) {
        const metrics = { squeeze, gex };
        for (const locale of CONFIG.LOCALES) {
            const text = getAlertText("SQUEEZE_ALERT", locale, metrics);
            alerts.push({ ...text, id: "SQUEEZE_ALERT", severity: "HIGH", metrics, color: "#ef4444", locale });
        }
    }

    // ── FULL BULL: Strong RLSI + Long Gamma + Good Breadth ──
    if (rlsi > 70 && gex > 30 && breadth > 65) {
        const metrics = { rlsi, gex, breadth };
        for (const locale of CONFIG.LOCALES) {
            const text = getAlertText("FULL_BULL", locale, metrics);
            alerts.push({ ...text, id: "FULL_BULL", severity: "INFO", metrics, color: "#10b981", locale });
        }
    }

    // ── GEX FLIP: Gamma regime change ──
    const prevGex = lastSnapshots.ko?.gammaShield?.gexIndex || 0;
    if ((prevGex > 0 && gex < 0) || (prevGex < 0 && gex > 0)) {
        const direction = gex > 0 ? "SHORT → LONG" : "LONG → SHORT";
        const metrics = { prevGex, gex, direction };
        for (const locale of CONFIG.LOCALES) {
            const text = getAlertText("GEX_FLIP", locale, metrics);
            alerts.push({ ...text, id: "GEX_FLIP", severity: "HIGH", metrics: { prevGex, gex }, color: gex > 0 ? "#10b981" : "#ef4444", locale });
        }
    }

    // Publish alerts (only new ones, per locale)
    for (const alert of alerts) {
        const dedupeKey = `${alert.id}_${alert.locale}`;
        if (lastAlertState[dedupeKey] && Date.now() - lastAlertState[dedupeKey] < 5 * 60 * 1000) {
            continue; // Dedupe: same alert within 5 minutes
        }
        lastAlertState[dedupeKey] = Date.now();

        await redisPub.publish(CONFIG.ALERT_CHANNEL, JSON.stringify(alert));
        console.log(`[CrossIntel] 🚨 ${alert.locale}: ${alert.title}`);
    }

    // Store latest alerts per locale
    for (const locale of CONFIG.LOCALES) {
        const localeAlerts = alerts.filter(a => a.locale === locale);
        if (localeAlerts.length > 0) {
            await redis.setex(`guardian:latest_alerts:${locale}`, 600, JSON.stringify(localeAlerts));
        }
    }
    // Also store default key for backward compat
    const koAlerts = alerts.filter(a => a.locale === "ko");
    if (koAlerts.length > 0) {
        await redis.setex("guardian:latest_alerts", 600, JSON.stringify(koAlerts));
    }

    return alerts;
}

// ══════════════════════════════════════════════════════════════
// EVENT IMPACT ENGINE — Economic Release + Gamma Shield Reaction
// ══════════════════════════════════════════════════════════════

let lastEventImpactCheck = 0;
let pendingEvent = null;   // Event we're watching

async function checkEventImpact(snapshot) {
    if (!snapshot?.gammaShield?.gexIndex) return;
    const now = Date.now();

    // Only check every 30 seconds
    if (now - lastEventImpactCheck < 25 * 1000) return;
    lastEventImpactCheck = now;

    const { hour, minute } = getETNow();
    const currentMinutes = hour * 60 + minute;
    const currentGex = snapshot.gammaShield.gexIndex;

    // ── Phase 1: Check if any HIGH impact event is about to happen ──
    if (!pendingEvent) {
        try {
            const calRaw = await redis.get("fmp:econ-calendar");
            if (!calRaw) return;
            const calendar = JSON.parse(calRaw);
            const events = calendar.events || [];

            // Find next HIGH impact event within 10 minutes
            for (const evt of events) {
                if (evt.impact !== "HIGH") continue;

                // Parse event time (format: "HH:mm")
                const [h, m] = (evt.time || "00:00").split(":").map(Number);
                const eventMinutes = h * 60 + m;
                const diff = eventMinutes - currentMinutes;

                // Check today's date
                const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
                if (evt.date !== todayET) continue;

                // 5 minutes before event: capture pre-event GEX
                if (diff > 0 && diff <= 5) {
                    pendingEvent = {
                        name: evt.event,
                        eventMinutes,
                        estimate: evt.estimate,
                        preGex: currentGex,
                        capturedAt: now,
                    };
                    preEventGexSnapshot = currentGex;
                    console.log(`[EventImpact] 📋 Pre-event GEX captured: ${currentGex.toFixed(0)} (${evt.event} in ${diff}min)`);
                    break;
                }
            }
        } catch (e) {
            console.warn("[EventImpact] Calendar read error:", e.message);
        }
        return;
    }

    // ── Phase 2: After event time, measure GEX reaction ──
    const timeSinceEvent = currentMinutes - pendingEvent.eventMinutes;

    // Wait 2-10 minutes after event for GEX to react
    if (timeSinceEvent >= 2 && timeSinceEvent <= 10) {
        const gexDelta = currentGex - pendingEvent.preGex;
        const gexBefore = pendingEvent.preGex;
        const gexAfter = currentGex;
        const regimeChange = (gexBefore > 0 && gexAfter < 0) || (gexBefore < 0 && gexAfter > 0);

        // Only fire if GEX moved significantly (>5pt)
        if (Math.abs(gexDelta) > 5) {
            // Get actual value from FMP (re-fetch calendar)
            let actualValue = "N/A";
            try {
                const calRaw = await redis.get("fmp:econ-calendar");
                if (calRaw) {
                    const cal = JSON.parse(calRaw);
                    const evt = (cal.events || []).find(e => e.event === pendingEvent.name && e.date === new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
                    if (evt?.actual != null && evt.actual !== "" && evt.actual !== "--") {
                        actualValue = String(evt.actual);
                    }
                }
            } catch { }

            const metrics = {
                eventName: pendingEvent.name,
                actual: actualValue,
                estimate: pendingEvent.estimate || "N/A",
                gexBefore,
                gexAfter,
                gexDelta,
                regimeChange,
            };

            const severity = Math.abs(gexDelta) > 15 ? "CRITICAL" : regimeChange ? "HIGH" : "WARNING";

            // Publish EVENT_IMPACT alerts for all locales
            for (const locale of CONFIG.LOCALES) {
                const text = getAlertText("EVENT_IMPACT", locale, metrics);
                const alert = {
                    ...text,
                    id: "EVENT_IMPACT",
                    severity,
                    metrics: { gexBefore, gexAfter, gexDelta },
                    color: gexDelta < 0 ? "#ef4444" : "#10b981",
                    locale,
                };
                await redisPub.publish(CONFIG.ALERT_CHANNEL, JSON.stringify(alert));
                await redis.setex(`guardian:event_impact:${locale}`, 3600, JSON.stringify(alert));
                console.log(`[EventImpact] 🚨 ${locale}: ${text.title}`);
            }

            console.log(`[EventImpact] 📊 ${pendingEvent.name}: GEX ${gexBefore.toFixed(0)} → ${gexAfter.toFixed(0)} (Δ${gexDelta > 0 ? "+" : ""}${gexDelta.toFixed(0)})`);
        } else {
            console.log(`[EventImpact] ℹ️ ${pendingEvent.name}: GEX change minor (${gexDelta.toFixed(1)}pt), no alert`);
        }

        // Reset pending event
        pendingEvent = null;
        preEventGexSnapshot = null;
    }

    // Timeout: if 15 minutes passed without significant move, reset
    if (timeSinceEvent > 15) {
        console.log(`[EventImpact] ⏰ ${pendingEvent.name}: timeout, resetting`);
        pendingEvent = null;
        preEventGexSnapshot = null;
    }
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
// Narrative-driven: News + Data woven into story via Claude
// [FIX] Redis-based dedup (not memory) + 1-hour window + retry until success
// ══════════════════════════════════════════════════════════════

async function generateMorningBriefing() {
    const { hour, isWeekend } = getETNow();
    if (isWeekend) return;

    // [FIX] 08:00~08:59 ET window (was 08:00~08:05 — too narrow, single failure killed the day)
    if (hour !== 8) return;

    const now = new Date();
    const etDateStr = now.toLocaleDateString("en-US", { timeZone: "America/New_York" });

    // [FIX] Check Redis for existing today's briefing (not memory variable)
    // This survives EC2 restarts and ensures we never regenerate an already-existing briefing
    try {
        const existingRaw = await redis.get("guardian:morning_briefing:ko");
        if (existingRaw) {
            const existing = JSON.parse(existingRaw);
            if (existing.date === etDateStr && existing.briefing && existing.briefing.length > 50) {
                return; // Today's briefing already exists — skip
            }
        }
    } catch (e) {
        console.warn("[Briefing] Redis check error (will attempt generation):", e.message);
    }

    console.log("[Briefing] 🌅 Generating narrative morning briefing...");

    // Get current snapshot from Redis
    const snapshotRaw = await redis.get(`${CONFIG.SNAPSHOT_KEY_PREFIX}ko`);
    const snapshot = snapshotRaw ? JSON.parse(snapshotRaw) : null;

    // Get RLSI history
    const historyRaw = await redis.get(CONFIG.RLSI_HISTORY_KEY);
    const rlsiHistory = historyRaw ? JSON.parse(historyRaw) : [];

    // ══════════════════════════════════════════════════════════
    // RETRY LOGIC: 3 attempts with exponential backoff
    // Attempt 1: immediate, Attempt 2: +15s, Attempt 3: +30s
    // Total window: ~60s — well within PRE session
    // ══════════════════════════════════════════════════════════
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [0, 15000, 30000]; // ms delays before each attempt
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 1) {
            const delay = RETRY_DELAYS[attempt - 1] || 30000;
            console.log(`[Briefing] ⏳ Retry ${attempt}/${MAX_RETRIES} in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        try {
            const apiUrl = `${CONFIG.VERCEL_API_URL}/api/guardian/briefing/generate`;
            const t0 = Date.now();
            
            // 1. Fetch prompts from Vercel securely (bypasses Vercel timeout)
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ snapshot, rlsiHistory, returnPromptOnly: true }),
                signal: AbortSignal.timeout(20000), // Prompt building should be fast
            });

            if (!response.ok) throw new Error(`Vercel API responded ${response.status}`);
            const result = await response.json();

            if (result.success && result.prompts) {
                console.log(`[Briefing] 🧠 Prompts built by Vercel in ${Date.now() - t0}ms. Invoking Claude locally...`);
                const { systemPrompt, userPrompt } = result.prompts;

                // 2. Local Bedrock Execution
                const client = getBedrock();
                const IMC = getInvokeModelCommand();
                if (!client || !IMC) throw new Error("Bedrock SDK not available (Node 16 TransformStream limitation)");
                const command = new IMC({
                    modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                    contentType: 'application/json',
                    accept: 'application/json',
                    body: JSON.stringify({
                        anthropic_version: 'bedrock-2023-05-31',
                        max_tokens: 2048,
                        temperature: 0.3,
                        system: systemPrompt,
                        messages: [
                            { role: 'user', content: userPrompt },
                            { role: 'assistant', content: '{' },
                        ],
                    }),
                });

                // 120s timeout on EC2 (infinite compared to Vercel's 60s)
                const bedrockResult = await Promise.race([
                    client.send(command),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Claude local timeout 120s')), 120000))
                ]);

                const responseBody = JSON.parse(new TextDecoder().decode(bedrockResult.body));
                const rawText = '{' + (responseBody.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
                
                // 3. Strict Refusal Check
                const isInvalid = (text) => {
                    if (!text || text.length < 50) return true;
                    const lower = text.toLowerCase();
                    return lower.includes('temporarily unavailable') || 
                           lower.includes('cannot generate') || 
                           lower.includes('할 수 없습니다') ||
                           lower.includes('불가능');
                };

                const briefingTexts = JSON.parse(rawText);
                if (isInvalid(briefingTexts.ko) || isInvalid(briefingTexts.en)) {
                    throw new Error('AI generated invalid/refusal response (intercepted by EC2)');
                }

                // 4. Set results

                // Store per-locale in Redis (24h TTL)
                for (const locale of CONFIG.LOCALES) {
                    const briefing = {
                        date: etDateStr,
                        generatedAt: new Date().toISOString(),
                        briefing: briefingTexts[locale] || briefingTexts.en || "Briefing not available",
                        source: "claude",
                        newsCount: result.newsCount || 0,
                        calendarCount: result.calendarCount || 0,
                    };
                    await redis.setex(`guardian:morning_briefing:${locale}`, 24 * 60 * 60, JSON.stringify(briefing));
                }

                // Also store default key (backward compat)
                await redis.setex("guardian:morning_briefing", 24 * 60 * 60, JSON.stringify({
                    date: etDateStr,
                    generatedAt: new Date().toISOString(),
                    text: briefingTexts.ko || briefingTexts.en,
                    briefing: briefingTexts.ko || briefingTexts.en,
                    source: "claude",
                    preMarket: {
                        preMarketRlsi: snapshot?.rlsi?.score || null,
                        gexIndex: snapshot?.gammaShield?.gexIndex || null,
                        vix: snapshot?.rlsi?.components?.vix || null,
                    },
                }));

                // Publish to WebSocket clients
                for (const locale of CONFIG.LOCALES) {
                    await redisPub.publish(CONFIG.UPDATE_CHANNEL, JSON.stringify({
                        locale,
                        type: "morning_briefing",
                        briefing: briefingTexts[locale],
                        timestamp: new Date().toISOString(),
                    }));
                }

                console.log(`[Briefing] ✅ Narrative briefing generated on attempt ${attempt}/${MAX_RETRIES} (${result.newsCount} news, ${result.calendarCount} calendar) in ${result.elapsedMs}ms`);
                return; // SUCCESS — exit retry loop
            } else {
                throw new Error("API returned success=false or empty briefing");
            }

        } catch (e) {
            lastError = e;
            console.error(`[Briefing] ❌ Attempt ${attempt}/${MAX_RETRIES} failed:`, e.message);
        }
    }

    // ══════════════════════════════════════════════════════════
    // ALL RETRIES EXHAUSTED — Use data-driven template fallback
    // Users should NEVER see "temporarily unavailable"
    // ══════════════════════════════════════════════════════════
    console.error(`[Briefing] 🔴 All ${MAX_RETRIES} attempts failed. Using template fallback. Last error:`, lastError?.message);

    try {
        const fallbackTexts = generateFallbackBriefing(snapshot, etDateStr);
        for (const locale of CONFIG.LOCALES) {
            await redis.setex(`guardian:morning_briefing:${locale}`, 24 * 60 * 60, JSON.stringify({
                date: etDateStr,
                generatedAt: new Date().toISOString(),
                briefing: fallbackTexts[locale] || fallbackTexts.en,
                source: "template",
            }));
        }
        await redis.setex("guardian:morning_briefing", 24 * 60 * 60, JSON.stringify({
            date: etDateStr,
            generatedAt: new Date().toISOString(),
            text: fallbackTexts.ko || fallbackTexts.en,
            briefing: fallbackTexts.ko || fallbackTexts.en,
            source: "template",
        }));
        console.log("[Briefing] ⚠️ Template fallback saved (users will see data-driven briefing, not an error)");
    } catch (fallbackErr) {
        console.error("[Briefing] 🔴 Even template fallback failed:", fallbackErr.message);
    }
}

function generateFallbackBriefing(snapshot, dateStr) {
    // Generate locale-aware readable briefings (not raw data dumps)
    const rlsi = snapshot?.rlsi?.score ?? null;
    const vix = snapshot?.rlsi?.components?.vix ?? null;
    const gex = snapshot?.gammaShield?.gexIndex ?? null;
    const squeeze = snapshot?.gammaShield?.squeezeRisk ?? null;
    const breadth = snapshot?.breadth?.breadthPct ?? null;
    const regime = snapshot?.tripleA?.regime ?? "N/A";

    // Risk assessment
    const riskLevel = rlsi != null
        ? (rlsi >= 70 ? "low" : rlsi >= 45 ? "moderate" : rlsi >= 25 ? "elevated" : "high")
        : "unknown";

    // Sectors
    const sectors = (snapshot?.sectors || [])
        .sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
        .slice(0, 3)
        .map(s => `${s.name}(${s.change >= 0 ? "+" : ""}${(s.change || 0).toFixed(1)}%)`)
        .join(", ");

    const gammaDesc = gex != null ? (gex > 0 ? "롱 감마" : "숏 감마") : null;
    const gammaDescEN = gex != null ? (gex > 0 ? "long gamma" : "short gamma") : null;
    const gammaDescJA = gex != null ? (gex > 0 ? "ロングガンマ" : "ショートガンマ") : null;

    return {
        ko: [
            `프리마켓 시장 상태 요약 (${dateStr}).`,
            rlsi != null ? `종합 시장 건강도(RLSI) ${rlsi.toFixed(0)}으로 ${riskLevel === "low" ? "안정적" : riskLevel === "moderate" ? "보통" : riskLevel === "elevated" ? "주의" : "위험"} 구간에서 관찰됨.` : "",
            vix != null ? `VIX ${vix.toFixed(1)} 수준${vix > 25 ? "으로 변동성 확대 구간" : vix > 20 ? "으로 경계 구간" : "으로 안정 구간"}에 위치.` : "",
            gammaDesc && gex != null ? `감마 체제 ${gammaDesc} (GEX ${gex.toFixed(0)})${squeeze != null && squeeze > 50 ? `, 스퀴즈 리스크 ${squeeze.toFixed(0)}%로 주의 필요` : ""}.` : "",
            breadth != null ? `시장 참여폭 ${breadth.toFixed(0)}%로 ${breadth >= 60 ? "양호한 매수세" : breadth >= 45 ? "혼조세" : "약세 참여"} 관찰됨.` : "",
            sectors ? `주요 움직임 섹터: ${sectors}.` : "",
        ].filter(Boolean).join(" "),
        en: [
            `Pre-market conditions as of ${dateStr}.`,
            rlsi != null ? `Market health (RLSI) at ${rlsi.toFixed(0)}, indicating ${riskLevel} risk levels.` : "",
            vix != null ? `VIX at ${vix.toFixed(1)}${vix > 25 ? " signaling elevated volatility" : vix > 20 ? " in cautionary territory" : " in stable range"}.` : "",
            gammaDescEN && gex != null ? `Gamma regime in ${gammaDescEN} (GEX ${gex.toFixed(0)})${squeeze != null && squeeze > 50 ? ` with squeeze risk at ${squeeze.toFixed(0)}%` : ""}.` : "",
            breadth != null ? `Market breadth at ${breadth.toFixed(0)}% showing ${breadth >= 60 ? "healthy participation" : breadth >= 45 ? "mixed conditions" : "weak participation"}.` : "",
            sectors ? `Notable sector moves: ${sectors}.` : "",
        ].filter(Boolean).join(" "),
        ja: [
            `プレマーケット市場状況 (${dateStr}).`,
            rlsi != null ? `市場健全性(RLSI) ${rlsi.toFixed(0)}で${riskLevel === "low" ? "安定的" : riskLevel === "moderate" ? "中立" : riskLevel === "elevated" ? "注意" : "警戒"}な水準が観測.` : "",
            vix != null ? `VIX ${vix.toFixed(1)}${vix > 25 ? "でボラティリティ拡大" : vix > 20 ? "で警戒圏" : "で安定圏"}に位置.` : "",
            gammaDescJA && gex != null ? `ガンマ体制${gammaDescJA} (GEX ${gex.toFixed(0)})${squeeze != null && squeeze > 50 ? `、スクイーズリスク${squeeze.toFixed(0)}%` : ""}.` : "",
            breadth != null ? `市場参加幅${breadth.toFixed(0)}%で${breadth >= 60 ? "良好な買い参加" : breadth >= 45 ? "混在" : "弱い参加"}が観測.` : "",
        ].filter(Boolean).join(" "),
    };
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

        // [FIX] Always harvest en/ja — users visit Guardian page in all locales at all times.
        // Previously only harvested during REG/PRE, causing en/ja cache to expire on weekends.
        Promise.all([
            harvestGuardianData("en"),
            harvestGuardianData("ja"),
        ]).catch((e) => console.warn("[Worker] Secondary locale harvest failed:", e.message));

        // Cross-intelligence alerts (based on ko snapshot)
        if (koSnapshot && session === "REG") {
            await runCrossIntelligence(koSnapshot);
            await appendRlsiHistory(koSnapshot);
            await checkEventImpact(koSnapshot); // Event Impact: GEX reaction to economic releases

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
