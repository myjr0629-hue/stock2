// One Redis authority for Lambda and web workers. Never log requests or provider bodies.
const PREFIX = 'fmp:account:v1';
const CALLERS = new Set(['lambda', 'vwap', 'analyst', 'earnings', 'news']);
const RESERVE = `-- fmp-reserve-v1
local t = redis.call('TIME')
local now = tonumber(t[1])*1000 + math.floor(tonumber(t[2])/1000)
local blocked = tonumber(redis.call('GET', KEYS[3]) or '0')
if blocked > now then return {0, blocked-now} end
local cap = tonumber(ARGV[2])
local old = tonumber(redis.call('GET', KEYS[5]) or cap)
cap = math.min(cap, old)
redis.call('SET', KEYS[5], cap, 'PX', 120000)
local reserved = math.min(30, cap)
for i=1,2 do redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now-60000) end
if redis.call('ZCARD', KEYS[1]) >= cap then return {0, 1000} end
if ARGV[1] ~= 'vwap' and redis.call('ZCARD', KEYS[2]) >= cap-reserved then return {0, 1000} end
local id = redis.call('INCR', KEYS[4])
redis.call('PEXPIRE', KEYS[4], 120000)
redis.call('ZADD', KEYS[1], now, id)
redis.call('PEXPIRE', KEYS[1], 120000)
if ARGV[1] ~= 'vwap' then
 redis.call('ZADD', KEYS[2], now, id)
 redis.call('PEXPIRE', KEYS[2], 120000)
end
return {1, 0}`;
const BACKOFF = `-- fmp-backoff-v1
local t = redis.call('TIME')
local now = tonumber(t[1])*1000 + math.floor(tonumber(t[2])/1000)
local untilMs = math.max(now+1, now+tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(redis.call('GET', KEYS[1]) or '0'))
redis.call('SET', KEYS[1], untilMs, 'PX', math.ceil(untilMs-now))
return untilMs`;
const RELEASE = `-- fmp-release-v1
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

function classify402(body) {
  const s = String(body).slice(0, 8192).toLowerCase();
  if (/bandwidth/.test(s)) return 'bandwidth_limit';
  if (/(daily|per day|day limit)/.test(s) && /(limit|exceed|quota)/.test(s)) return 'daily_limit';
  if (/(invalid|missing|incorrect).*api.?key/.test(s)) return 'invalid_key';
  if (/(subscription|premium|upgrade|restricted|not available.*plan|not included.*plan)/.test(s)) return 'plan_restricted';
  return 'unknown';
}
function retryAfter(value, now) {
  if (value && /^\s*\d+(\.\d+)?\s*$/.test(value)) return { delayMs: Math.ceil(Number(value)*1000), untilMs: 0 };
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? { delayMs: Math.max(0, date-now), untilMs: date } : { delayMs: 60000, untilMs: 0 };
}
async function errorBody(response) {
  if (!response.body?.getReader) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let value = '', size = 0;
  try {
    while (size < 8192) {
      const chunk = await reader.read();
      if (chunk.done) break;
      value += decoder.decode(chunk.value.subarray(0, 8192-size)); size += chunk.value.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  return value;
}
function createRedisCommand(env = process.env, transport = (...args) => fetch(...args)) {
  return async (command) => {
    const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('FMP_STORE_UNAVAILABLE');
    try {
      const r = await transport(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(command), signal: AbortSignal.timeout(2000), cache: 'no-store' });
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (data.error) throw new Error();
      return data.result;
    } catch { throw new Error('FMP_STORE_UNAVAILABLE'); }
  };
}
function createGuard({ command, accountRpm = 300, now = Date.now }) {
  // Default is a conservative assumption, not a verified contract. Lower settings win across workers.
  const cap = Math.max(0, Math.min(100, Math.floor(Number(accountRpm)/3) || 0));
  return {
    async reserve(caller) {
      if (!CALLERS.has(caller)) throw new Error('FMP_CALLER_INVALID');
      try {
        const r = await command(['EVAL', RESERVE, 5, `${PREFIX}:all`, `${PREFIX}:other`, `${PREFIX}:backoff`, `${PREFIX}:seq`, `${PREFIX}:cap`, caller, cap]);
        if (!Array.isArray(r)) throw new Error();
        return { allowed: Number(r[0]) === 1, retryMs: Math.max(1000, Number(r[1]) || 0) };
      } catch { return { allowed: false, retryMs: 2000 }; }
    },
    async observe(response, caller) {
      let reason = null, retryMs = null;
      if (response.status === 429) {
        const retry = retryAfter(response.headers?.get('retry-after'), now());
        retryMs = retry.delayMs;
        // Publish before reading any body; monotonic max avoids shortening another worker's cooldown.
        await command(['EVAL', BACKOFF, 1, `${PREFIX}:backoff`, retry.delayMs, retry.untilMs]);
      }
      if (response.status === 402) reason = classify402(await errorBody(response));
      const diagnostic = { status: response.status, reason, retryMs, caller, at: now() };
      if (response.status === 402 || response.status === 429) {
        await command(['SET', `${PREFIX}:diag:${caller}`, JSON.stringify(diagnostic), 'EX', 86400]);
      }
      return diagnostic;
    },
  };
}
module.exports = { PREFIX, RESERVE, BACKOFF, RELEASE, createRedisCommand, createGuard, classify402, retryAfter };
