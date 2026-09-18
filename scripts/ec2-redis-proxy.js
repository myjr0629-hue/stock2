// ============================================================================
// EC2 Redis HTTP proxy — ElastiCache behind a bearer-authenticated HTTP API.
// Deployed at /opt/signum-ws/redis-proxy.js (pm2 name: redis-proxy, Node 16).
//
// Security model (2026-09-16 hardening — .agent/ALPHA_SCORE_FULL_REPORT §7):
//   • REDIS_PROXY_KEY is REQUIRED. There is no built-in default any more; a
//     missing key exits at startup (fail closed) instead of silently accepting
//     a token that was printed in docs and 49 source files.
//   • REDIS_PROXY_KEY_PREV (optional) is accepted during a rotation window so
//     Vercel/Lambda/cron can move to the new key without a read gap. Remove it
//     from the env file and restart once every consumer has switched.
//   • Writes to `trade:*` (killswitch, auto config, the real-money arm key)
//     from a REMOTE client must carry an HMAC over the request, signed with
//     EXECUTOR_SECRET — the same secret and header scheme the Toss executor
//     uses (X-Exec-Ts + X-Exec-Sign = HMAC_SHA256(secret, ts + "." + rawBody),
//     ±30s replay window). The bearer key alone can no longer touch trade:*.
//     Loopback clients (the resident engine on this box) are exempt because
//     they already hold the key files; set REDIS_PROXY_TRUST_LOOPBACK=0 if
//     this proxy is ever fronted by nginx on the same host.
//   • Values are never logged; rejected requests are logged with peer + path.
//
// Config is read from process.env first, then from the .env file next to
// this script (/opt/signum-ws/.env) so a pm2 resurrect without env still
// starts with the right key. No dotenv dependency (box has none).
// ============================================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Redis = require("ioredis");

// ── .env (next to the script) → process.env, without overriding real env ──
(function loadEnvFile() {
    const p = process.env.REDIS_PROXY_ENV_FILE || path.join(__dirname, ".env");
    try {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
    } catch { /* no file: env only */ }
})();

// ── Configuration ──
const PORT = parseInt(process.env.REDIS_PROXY_PORT || "8081", 10);
const BIND = process.env.REDIS_PROXY_BIND || "0.0.0.0";
const ELASTICACHE_HOST = process.env.ELASTICACHE_HOST || "signum-redis.dhzfzt.0001.use1.cache.amazonaws.com";
const ELASTICACHE_PORT = parseInt(process.env.ELASTICACHE_PORT || "6379", 10);
const TRUST_LOOPBACK = (process.env.REDIS_PROXY_TRUST_LOOPBACK || "1") !== "0";
const REPLAY_WINDOW_MS = 30_000;
const PROTECTED_KEY = /^trade:/;

const ACCEPTED_KEYS = [process.env.REDIS_PROXY_KEY, process.env.REDIS_PROXY_KEY_PREV]
    .map((k) => (k || "").trim())
    .filter((k) => k.length >= 16);
if (!process.env.REDIS_PROXY_KEY || process.env.REDIS_PROXY_KEY.trim().length < 16) {
    console.error("[Redis Proxy] FATAL: REDIS_PROXY_KEY is missing or shorter than 16 chars — refusing to start (fail closed).");
    process.exit(1);
}
if (ACCEPTED_KEYS.length > 1) {
    console.warn("[Redis Proxy] rotation window: REDIS_PROXY_KEY_PREV is still accepted — remove it once all consumers use the new key");
}
const WRITE_SECRET = (process.env.EXECUTOR_SECRET || "").trim();
if (!WRITE_SECRET) {
    console.warn("[Redis Proxy] EXECUTOR_SECRET not set — remote trade:* writes will be REJECTED until it is configured");
}

const redis = new Redis({ host: ELASTICACHE_HOST, port: ELASTICACHE_PORT, maxRetriesPerRequest: 2 });
redis.on("connect", () => console.log(`[Redis Proxy] Connected to ElastiCache ${ELASTICACHE_HOST}:${ELASTICACHE_PORT}`));
redis.on("error", (e) => console.error("[Redis Proxy] Redis error:", e.message));

// ── helpers ──
function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    if (x.length !== y.length) return false;
    try { return crypto.timingSafeEqual(x, y); } catch { return false; }
}
function bearerOk(req) {
    const auth = req.headers["authorization"] || "";
    if (!auth.startsWith("Bearer ")) return false;
    const token = auth.slice(7).trim();
    return ACCEPTED_KEYS.some((k) => safeEqual(k, token));
}
function isLoopback(req) {
    const ip = (req.socket && req.socket.remoteAddress) || "";
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}
// Same scheme as scripts/ec2-toss-executor.js verify(): X-Exec-Ts + X-Exec-Sign
function writeSignatureOk(req, raw) {
    if (!WRITE_SECRET) return false;
    const ts = req.headers["x-exec-ts"];
    const sign = req.headers["x-exec-sign"];
    if (!ts || !sign) return false;
    if (!/^\d+$/.test(String(ts)) || Math.abs(Date.now() - Number(ts)) > REPLAY_WINDOW_MS) return false;
    const h = crypto.createHmac("sha256", WRITE_SECRET).update(String(ts) + "." + raw).digest("hex");
    return safeEqual(h, sign);
}
// Protected writes: loopback (trusted) OR a valid HMAC over the raw request.
function writeAllowed(req, raw, keys) {
    if (!keys.some((k) => PROTECTED_KEY.test(String(k)))) return true;
    if (TRUST_LOOPBACK && isLoopback(req)) return true;
    return writeSignatureOk(req, raw);
}
function deny(req, res, code, msg) {
    console.warn(`[Redis Proxy] ${code} ${msg} peer=${(req.socket && req.socket.remoteAddress) || "?"} ${req.method} ${req.url.split("?")[0]}`);
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
}
async function readBody(req) {
    // ★ 2026-09-18 — 청크마다 문자열로 바꾸면(`body += chunk`) TCP 청크 경계에 걸린
    //   다바이트 UTF-8 글자(한·일·이모지)가 U+FFFD 로 깨진 채 ElastiCache 에 «쓰기 시점»에
    //   박혔다. 실측: 한글 4.7KB·7KB·18.8KB·28KB 페이로드 깨짐, 1.2KB·2.3KB·9.4KB 는 멀쩡
    //   (경계 위치에 따라 비결정적). 바이트를 다 모은 뒤 한 번에 디코드한다.
    //   HMAC(writeAllowed) 는 이 문자열을 서명하므로, 클라이언트가 보낸 원문과 바이트 단위로
    //   동일해져 비ASCII trade:* 페이로드의 서명 불일치도 함께 사라진다.
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
}

// ── HTTP Server ──
const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Exec-Ts, X-Exec-Sign");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    // Auth check
    if (!bearerOk(req)) { deny(req, res, 401, "Unauthorized"); return; }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const path_ = url.pathname;

    try {
        // GET /get?key=xxx
        if (path_ === "/get" && req.method === "GET") {
            const key = url.searchParams.get("key");
            if (!key) { res.writeHead(400); res.end(JSON.stringify({ error: "key required" })); return; }
            const val = await redis.get(key);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ result: val ? JSON.parse(val) : null }));
            return;
        }

        // POST /set  body: { key, value, ttl? }
        if (path_ === "/set" && req.method === "POST") {
            const body = await readBody(req);
            const { key, value, ttl } = JSON.parse(body);
            if (!key) { res.writeHead(400); res.end(JSON.stringify({ error: "key required" })); return; }
            if (!writeAllowed(req, body, [key])) { deny(req, res, 403, "trade:* writes require a signed request"); return; }
            const serialized = JSON.stringify(value);
            if (ttl) await redis.setex(key, ttl, serialized);
            else await redis.set(key, serialized);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /mget?keys=key1,key2,key3
        if (path_ === "/mget" && req.method === "GET") {
            const keysParam = url.searchParams.get("keys");
            if (!keysParam) { res.writeHead(400); res.end(JSON.stringify({ error: "keys required" })); return; }
            const keys = keysParam.split(",");
            const vals = await redis.mget(...keys);
            const results = vals.map(v => v ? JSON.parse(v) : null);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ results }));
            return;
        }

        // POST /mset  body: { items: [{ key, value, ttl? }, ...] }
        // Batch SET via Redis pipeline — used by Lambda for efficient bulk writes
        if (path_ === "/mset" && req.method === "POST") {
            const body = await readBody(req);
            const { items } = JSON.parse(body);
            if (!items || !Array.isArray(items)) { res.writeHead(400); res.end(JSON.stringify({ error: "items array required" })); return; }
            if (!writeAllowed(req, body, items.map((i) => i && i.key))) { deny(req, res, 403, "trade:* writes require a signed request"); return; }
            const pipeline = redis.pipeline();
            for (const { key, value, ttl } of items) {
                const serialized = JSON.stringify(value);
                if (ttl) pipeline.setex(key, ttl, serialized);
                else pipeline.set(key, serialized);
            }
            await pipeline.exec();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, count: items.length }));
            return;
        }

        // DELETE /del?key=xxx  (protected keys: sign ts + "." + key)
        if (path_ === "/del" && req.method === "DELETE") {
            const key = url.searchParams.get("key");
            if (!key) { res.writeHead(400); res.end(JSON.stringify({ error: "key required" })); return; }
            if (!writeAllowed(req, key, [key])) { deny(req, res, 403, "trade:* writes require a signed request"); return; }
            await redis.del(key);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /publish  body: { channel, data }
        // Lambda calls this to push real-time data via ElastiCache Pub/Sub
        if (path_ === "/publish" && req.method === "POST") {
            const body = await readBody(req);
            const { channel, data } = JSON.parse(body);
            if (!channel || !data) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "channel and data required" }));
                return;
            }
            const subscribers = await redis.publish(channel, JSON.stringify(data));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, channel, subscribers }));
            return;
        }

        // GET /health
        if (path_ === "/health") {
            const ping = await redis.ping();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                status: "ok", redis: ping, uptime: process.uptime(),
                keysAccepted: ACCEPTED_KEYS.length, tradeWriteSigning: Boolean(WRITE_SECRET), trustLoopback: TRUST_LOOPBACK,
            }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
    } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
    }
});

server.listen(PORT, BIND, () => console.log(`[Redis Proxy] HTTP server on ${BIND}:${PORT} (keys=${ACCEPTED_KEYS.length}, tradeWriteSigning=${Boolean(WRITE_SECRET)}, trustLoopback=${TRUST_LOOPBACK})`));
