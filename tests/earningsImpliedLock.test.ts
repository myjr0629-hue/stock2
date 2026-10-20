/** Real lock adapter, fake Redis SDK; no env files and no network. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EARNINGS_IMPLIED_KEY } from '../src/lib/earnings/earningsImplied';

const held = new Map<string, number>();
let mode: 'ok' | 'error' | 'hang' = 'ok';
let constructions = 0, commands = 0;
let release: (() => void) | undefined;
const id = require.resolve('@upstash/redis');
require.cache[id] = { id, filename: id, loaded: true, exports: { Redis: class {
  constructor(opts: any) { constructions++; assert.deepEqual(opts.retry, { retries: 0 }); }
  async set(key: string, _value: string, opts: any) {
    commands++;
    assert.equal(key, `${EARNINGS_IMPLIED_KEY}:lock`);
    assert.deepEqual(opts, { nx: true, ex: 90 }, 'one SET with NX and expiry, no GET/SET race');
    if (mode === 'error') throw new Error('offline store unavailable');
    if (mode === 'hang') await new Promise<void>(resolve => { release = resolve; });
    if ((held.get(key) ?? 0) > Date.now()) return null;
    held.set(key, Date.now() + opts.ex * 1000); return 'OK';
  }
} } } as any;
globalThis.fetch = async () => { throw new Error('network forbidden'); };
const { acquireEarningsImpliedLock } = require('../src/services/earningsImpliedLock');
for (const name of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[name];

function configure() {
  process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'synthetic-test-placeholder';
}

test('missing lock configuration prevents refresh without a cache-store fallback', async () => {
  assert.equal(await acquireEarningsImpliedLock(), false);
  assert.equal(constructions, 0); assert.equal(commands, 0);
});

test('actual adapter sends SET NX EX, admits exactly one worker, and permits another after lease expiry', async () => {
  configure(); held.clear(); mode = 'ok';
  assert.deepEqual(await Promise.all([acquireEarningsImpliedLock(), acquireEarningsImpliedLock()]), [true, false]);
  assert.equal(constructions, 1);
  const original = Date.now, now = Date.now();
  try {
    Date.now = () => now + 89_000; assert.equal(await acquireEarningsImpliedLock(), false);
    Date.now = () => now + 91_000; assert.equal(await acquireEarningsImpliedLock(), true);
  } finally { Date.now = original; }
});

test('store error, expired budget and ambiguous late SET acknowledgement never acquire permission', async () => {
  held.clear(); mode = 'error'; assert.equal(await acquireEarningsImpliedLock(), false);
  const before = commands;
  assert.equal(await acquireEarningsImpliedLock(Date.now() - 1), false);
  assert.equal(commands, before, 'expired work deadline sends no command');
  mode = 'hang';
  assert.equal(await acquireEarningsImpliedLock(Date.now() + 20), false);
  mode = 'ok'; release!();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(await acquireEarningsImpliedLock(), false, 'late SET may hold the lease but did not start work');
});
