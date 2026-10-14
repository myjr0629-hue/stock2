/**
 * Coordinator-only, opt-in real Upstash EVAL probe. Do not run as part of tests.
 *
 * From repo root, with UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN already
 * exported by the coordinator's secret provider (KV_REST_API_* also supported):
 * node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' scripts/invite-lua-probe.ts
 *
 * Never loads .env files, prints credentials, raw errors, or pool members.
 * All writes, reads and cleanup are restricted to promo:probe:inv:<random>:*.
 * Uses the same scenario table as tests/invite.test.ts for JS and real Lua.
 * Finally scans/deletes the entire random prefix, even on assertion failure.
 */
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { inviteStoreFromRedis, hashFromRaw } from '../src/lib/invite/store';
import { memoryInviteStore } from '../src/lib/invite/memoryStore';
import { ATOMIC_SCENARIOS, runAtomicScenario } from '../tests/inviteAtomicScenarios';

async function main() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) { console.error('Probe requires an exported Upstash URL and token.'); process.exitCode = 1; return; }
  const root = `promo:probe:inv:${randomUUID()}`;
  const r = new Redis({ url, token, automaticDeserialization: false, enableTelemetry: false, retry: { retries: 0 }, signal: () => AbortSignal.timeout(10_000) });
  const store = inviteStoreFromRedis(r);
  // Defense in depth: even a future fixture typo cannot send a non-probe key.
  const guard = (key: string) => {
    if (!key.startsWith(`${root}:`)) throw new Error('probe key outside prefix');
    return key;
  };
  r.use(async (req, next) => {
    if (!Array.isArray(req.body)) throw new Error('unexpected probe body');
    const commands = Array.isArray(req.body[0]) ? req.body : [req.body];
    for (const command of commands as (string | number)[][]) {
      const name = String(command[0]).toLowerCase();
      if (name === 'eval') command.slice(3, 3 + Number(command[2])).forEach(k => guard(String(k)));
      else if (name === 'scan') {
        const match = command.findIndex(x => String(x).toLowerCase() === 'match');
        if (match < 0 || !String(command[match + 1]).startsWith(`${root}:`)) throw new Error('unsafe probe scan');
      } else if (name === 'del') command.slice(1).forEach(k => guard(String(k)));
      else if (['get', 'set', 'type', 'ttl', 'hgetall', 'hset', 'expire', 'scard', 'sadd', 'smembers'].includes(name)) guard(String(command[1]));
      else throw new Error('unexpected probe command');
    }
    return next(req);
  });
  const scan = async (prefix: string) => {
    guard(`${prefix}:`);
    let cursor = '0'; const found = new Set<string>();
    do {
      const [next, keys] = await r.scan(cursor, { match: `${prefix}:*`, count: 100 });
      cursor = String(next);
      for (const key of keys) found.add(guard(key));
    } while (cursor !== '0');
    return [...found].sort();
  };
  let active = 'setup';
  try {
    for (const [n, scenario] of ATOMIC_SCENARIOS.entries()) {
      active = scenario.name;
      const prefix = `${root}:${n}`;
      let clock = Date.now();
      const memory = memoryInviteStore(() => clock);
      await runAtomicScenario(scenario, {
        store: memory, prefix,
        wait: async ms => { clock += ms; },
        ttl: async key => {
          const expires = memory.dump().expires as Record<string, number>;
          return Math.ceil(((expires[key] ?? clock) - clock) / 1000);
        },
        snapshot: async () => { const { kv, sets, hashes } = memory.dump(); return { kv, sets, hashes }; },
      });
      await runAtomicScenario(scenario, {
        store, prefix,
        wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
        ttl: key => r.ttl(guard(key)),
        snapshot: async () => {
          const state: Record<string, unknown> = {};
          for (const key of await scan(prefix)) {
            const type = await r.type(key);
            state[key] = type === 'string' ? await r.get(key) : type === 'set' ? (await r.smembers<string[]>(key)).sort() : hashFromRaw(await r.hgetall(key));
          }
          return state;
        },
      });
      console.log(`PASS ${scenario.name}`);
    }
    console.log(`PASS ${ATOMIC_SCENARIOS.length} scenarios: memory JS and real Upstash EVAL`);
  } catch {
    // SDK and assertion errors may include request bodies; never print them.
    console.error(`FAIL ${active}; details suppressed`); process.exitCode = 1;
  } finally {
    let cleaned = false;
    for (let attempt = 0; attempt < 3 && !cleaned; attempt++) {
      try {
        const keys = await scan(root);
        for (let n = 0; n < keys.length; n += 100) await r.del(...keys.slice(n, n + 100));
        cleaned = (await scan(root)).length === 0;
      } catch { /* DELETE is idempotent; retry cleanup only, never EVAL. */ }
    }
    if (cleaned) console.log('CLEANUP verified');
    else { console.error(`CLEANUP failed; coordinator must remove ${root}:*`); process.exitCode = 1; }
  }
}
if (require.main === module) void main().catch(() => { console.error('Probe setup failed; details suppressed'); process.exitCode = 1; });
