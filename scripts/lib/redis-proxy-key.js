"use strict";

function requireRedisProxyKey(env = process.env) {
    const key = env.REDIS_PROXY_KEY;
    if (!key || !key.trim()) throw new Error("REDIS_PROXY_KEY is required");
    return key;
}

module.exports = { requireRedisProxyKey };
