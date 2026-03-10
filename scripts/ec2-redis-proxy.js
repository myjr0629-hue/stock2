const http = require("http");
const Redis = require("ioredis");

// ── Configuration ──
const PORT = 8081;
const API_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";
const ELASTICACHE_HOST = process.env.ELASTICACHE_HOST || "signum-redis.dhzfzt.0001.use1.cache.amazonaws.com";
const ELASTICACHE_PORT = parseInt(process.env.ELASTICACHE_PORT || "6379");

const redis = new Redis({ host: ELASTICACHE_HOST, port: ELASTICACHE_PORT, maxRetriesPerRequest: 2 });

redis.on("connect", () => console.log(`[Redis Proxy] Connected to ElastiCache ${ELASTICACHE_HOST}:${ELASTICACHE_PORT}`));
redis.on("error", (e) => console.error("[Redis Proxy] Redis error:", e.message));

// ── HTTP Server ──
const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    // Auth check
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${API_KEY}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    try {
        // GET /get?key=xxx
        if (path === "/get" && req.method === "GET") {
            const key = url.searchParams.get("key");
            if (!key) { res.writeHead(400); res.end(JSON.stringify({ error: "key required" })); return; }
            const val = await redis.get(key);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ result: val ? JSON.parse(val) : null }));
            return;
        }

        // POST /set  body: { key, value, ttl? }
        if (path === "/set" && req.method === "POST") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const { key, value, ttl } = JSON.parse(body);
            if (!key) { res.writeHead(400); res.end(JSON.stringify({ error: "key required" })); return; }
            const serialized = JSON.stringify(value);
            if (ttl) await redis.setex(key, ttl, serialized);
            else await redis.set(key, serialized);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /mget?keys=key1,key2,key3
        if (path === "/mget" && req.method === "GET") {
            const keysParam = url.searchParams.get("keys");
            if (!keysParam) { res.writeHead(400); res.end(JSON.stringify({ error: "keys required" })); return; }
            const keys = keysParam.split(",");
            const vals = await redis.mget(...keys);
            const results = vals.map(v => v ? JSON.parse(v) : null);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ results }));
            return;
        }

        // DELETE /del?key=xxx
        if (path === "/del" && req.method === "DELETE") {
            const key = url.searchParams.get("key");
            if (!key) { res.writeHead(400); res.end(JSON.stringify({ error: "key required" })); return; }
            await redis.del(key);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /health
        if (path === "/health") {
            const ping = await redis.ping();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", redis: ping, uptime: process.uptime() }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
    } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
    }
});

server.listen(PORT, () => console.log(`[Redis Proxy] HTTP server on port ${PORT}`));
