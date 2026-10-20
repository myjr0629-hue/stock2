// 실행: node --test tests/giftShareLua.test.mjs   (npx tsx --test tests/giftShareLua.test.mjs 도 같다)
/**
 * 선물 Lua(src/lib/giftShare/atomic.cjs) 시험 — 같은 8개 시나리오를 두 실행기에서 돌린다.
 *  1) 실제 Redis: 로컬 redis-server(PATH·REDIS_SERVER_BIN 절대 경로)를 임시 Unix 소켓으로 띄워 실행. 없으면 이유를 출력하고 건너뛴다(skip).
 *     외부 Redis 주소는 받지 않는다.
 *  2) 순수 JS 모의(tests/_giftLuaMock.mjs): Lua «원문»을 해석기로 실행하고 EVAL 단위로 직렬 실행 — 원자성 검증. 항상 실행.
 *  + 대조군: redis.call 마다 끼어들기를 허용(비원자)하면 같은 시나리오가 이중 배정으로 실패함을 확인 — 시험이 원자성 결함을 실제로 잡는다.
 */
import assert from 'node:assert/strict';
import { describe, test, before, after } from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import { access, mkdtemp, stat, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mockRedis } from './_giftLuaMock.mjs';

const { ISSUE_LUA, CLAIM_LUA, LOAD_LUA } = createRequire(import.meta.url)('../src/lib/giftShare/atomic.cjs');

const p = 'promo:pv:gift:v1';
const now = Date.now();
const random = () => randomBytes(32).toString('hex');
const codeOf = os => randomBytes(16).toString('hex').slice(0, os === 'ios' ? 18 : 23).toUpperCase();
const digest = s => createHash('sha256').update(s).digest('hex');

/** 시나리오 묶음 — redis 는 ioredis 또는 같은 모양의 모의. */
function scenarios() {
  const run = (redis, script, keys, args) => redis.eval(script, keys.length, ...keys, ...args);
  const tokenKey = t => `${p}:token:${digest(t)}`;
  async function token(redis) {
    const t = random();
    await redis.set(tokenKey(t), JSON.stringify({ expires: now + 86400_000 }));
    return t;
  }
  async function load(redis, os, count, batch = random(), end = now + 86400_000) {
    const codes = Array.from({ length: count }, () => codeOf(os));
    const keys = [`${p}:batch:${batch}`, `${p}:batches:${os}`, `${p}:pool:${os}:${batch}`, `${p}:loaded`, 'old:play', 'old:ios', 'old:claims'];
    const args = [JSON.stringify({ os, expiresAt: end }), end, batch, ...codes];
    assert.equal(await run(redis, LOAD_LUA, keys, args), 'loaded');
    return { codes, batch, keys, args };
  }
  function claim(redis, t, device, os = 'ios', cap = 20, at = now, account = '') {
    return run(redis, CLAIM_LUA, [tokenKey(t), `${p}:batches:${os}`, `${p}:day:test:${os}`, `${p}:ledger`, `${p}:recipient:device:${device}`,
      ...(account ? [`${p}:recipient:account:${account}`] : [])], [at, os, device, cap, digest(t), p, account]);
  }
  return [
    ['같은 토큰·수신자 동시 20회: 한 장 배정·19회 같은 코드·장부 한 건', async (redis) => {
      const inventory = await load(redis, 'ios', 25); const t = await token(redis); const receiver = random();
      const results = await Promise.all(Array.from({ length: 20 }, () => claim(redis, t, receiver)));
      assert.equal(results.filter(r => r[0] === 'new').length, 1);
      assert.equal(results.filter(r => r[0] === 'again').length, 19);
      assert.equal(new Set(results.map(r => r[1])).size, 1);
      assert.equal(await redis.llen(inventory.keys[2]), 24);
      assert.equal(await redis.hlen(`${p}:ledger`), 1);
      const entry = JSON.parse(await redis.hget(`${p}:ledger`, digest(t)));
      assert.deepEqual(Object.keys(entry).sort(), ['at', 'last4', 'os', 'tokenHash']);
      assert.equal(entry.last4, results[0][1].slice(-4));
      assert.equal(entry.tokenHash, digest(t));
    }],
    ['서로 다른 수신자 동시 20회: 한 명만 배정·다른 OS 거부', async (redis) => {
      await load(redis, 'ios', 25); await load(redis, 'android', 25); const t = await token(redis);
      const results = await Promise.all(Array.from({ length: 20 }, () => claim(redis, t, random())));
      assert.equal(results.filter(r => r[0] === 'new').length, 1);
      assert.equal(results.filter(r => r[0] === 'taken').length, 19);
      assert.equal((await claim(redis, t, random(), 'android'))[0], 'taken');
    }],
    ['OS별 일 전체 상한 20+20 및 상한 뒤 기존 배정 복구', async (redis) => {
      for (const os of ['ios', 'android']) {
        await load(redis, os, 30);
        const inputs = await Promise.all(Array.from({ length: 25 }, async () => [await token(redis), random()]));
        const results = await Promise.all(inputs.map(([t, d]) => claim(redis, t, d, os)));
        assert.equal(results.filter(r => r[0] === 'new').length, 20);
        assert.equal(results.filter(r => r[0] === 'cap').length, 5);
        const index = results.findIndex(r => r[0] === 'new');
        assert.equal((await claim(redis, ...inputs[index], os))[1], results[index][1]);
      }
      assert.equal(await redis.hlen(`${p}:ledger`), 40);
    }],
    ['소진·토큰 만료·묶음 만료·잘못된 재고 무차감', async (redis) => {
      const t = await token(redis); const d = random();
      assert.equal((await claim(redis, t, d))[0], 'empty');
      const batch = await load(redis, 'ios', 2, random(), now + 1000);
      assert.equal((await claim(redis, t, d, 'ios', 20, now + 2000))[0], 'empty');
      assert.equal((await claim(redis, t, d, 'ios', 20, now + 86400_000))[0], 'expired');
      await redis.lset(batch.keys[2], 0, '잘못된형식');
      assert.equal((await claim(redis, t, d))[0], 'invalid');
      assert.equal(await redis.llen(batch.keys[2]), 2);
      assert.equal(await redis.hlen(`${p}:ledger`), 0);
    }],
    ['수신자 기기·계정의 캠페인 중복 및 재시도 계정 변경 거부', async (redis) => {
      await load(redis, 'ios', 5); const t = await token(redis); const d = random(); const a = random();
      assert.equal((await claim(redis, t, d, 'ios', 20, now, a))[0], 'new');
      assert.equal((await claim(redis, await token(redis), random(), 'ios', 20, now, a))[0], 'recipient');
      assert.equal((await claim(redis, await token(redis), d))[0], 'recipient');
      assert.equal((await claim(redis, t, d, 'ios', 20, now, random()))[0], 'taken');
    }],
    ['응답 유실 뒤 재시도·빠른 만료 묶음 우선·만료 후 복구 거부', async (redis) => {
      const late = await load(redis, 'ios', 1, random(), now + 3000);
      const early = await load(redis, 'ios', 1, random(), now + 1000);
      const t = await token(redis); const d = random(); await claim(redis, t, d);
      const retry = await claim(redis, t, d);
      assert.equal(retry[0], 'again'); assert.equal(retry[1], early.codes[0]);
      assert.equal(await redis.llen(late.keys[2]), 1);
      assert.equal((await claim(redis, t, d, 'ios', 20, now + 1000))[0], 'expired');
    }],
    ['발행 동시 제한: 앱 기기·계정 3, 익명 웹 1, 코드 무차감', async (redis) => {
      for (const app of [true, false]) {
        await redis.flushdb();
        const keys = ['기기', '계정', '아이피', '전체'];
        const results = await Promise.all(Array.from({ length: 20 }, () => run(redis, ISSUE_LUA, [tokenKey(random()), ...keys], [now, 86400, app ? 3 : 1, 3, 10, 400])));
        assert.equal(results.filter(r => r === 'issued').length, app ? 3 : 1);
        assert.equal(await redis.hlen(`${p}:ledger`), 0);
      }
    }],
    ['재적재·다른 묶음 중복·기존 쿠폰 풀 중복 거부', async (redis) => {
      const original = await load(redis, 'ios', 2);
      assert.equal(await run(redis, LOAD_LUA, original.keys, original.args), 'batch_exists');
      const batch = random(); const keys = [...original.keys]; keys[0] = `${p}:batch:${batch}`; keys[2] = `${p}:pool:ios:${batch}`;
      const args = [...original.args]; args[2] = batch;
      assert.equal(await run(redis, LOAD_LUA, keys, args), 'duplicate'); assert.equal(await redis.exists(keys[0]), 0);
      const code = codeOf('ios'); await redis.sadd('old:ios', code); args.splice(3, 2, code);
      assert.equal(await run(redis, LOAD_LUA, keys, args), 'overlap'); assert.equal(await redis.exists(keys[0]), 0);
    }],
  ];
}

// ── 1) 실제 Redis ─────────────────────────────────────
async function findRedisServer() {
  const argPath = process.argv[2] && isAbsolute(process.argv[2]) && /redis-server$/.test(process.argv[2]) ? process.argv[2] : null;
  const override = argPath || process.env.REDIS_SERVER_BIN;
  const candidates = override ? [override] : [
    ...(process.env.PATH || '').split(delimiter).filter(isAbsolute).map(dir => join(dir, 'redis-server')),
    '/opt/homebrew/bin/redis-server', '/usr/local/bin/redis-server', '/usr/bin/redis-server',
  ];
  for (const path of new Set(candidates)) {
    if (!isAbsolute(path)) continue;
    try { await access(path, constants.X_OK); if ((await stat(path)).isFile()) return path; } catch { /* 다음 로컬 후보 */ }
  }
  return null;
}
const binary = await findRedisServer();
const skipReason = binary ? false
  : '로컬 redis-server 실행 파일 없음(PATH·/opt/homebrew·/usr/local·/usr/bin, REDIS_SERVER_BIN 미지정) — 실제 Redis 시험은 건너뛰고 원자성은 아래 순수 JS 모의(Lua 원문 해석·EVAL 직렬)로 검증';
if (!binary) console.log(`건너뜀(실제 Redis Lua): ${skipReason}`);

if (!binary) test('실제 Redis Lua(임시 Unix 소켓) 8개', { skip: skipReason }, () => {});
else describe('실제 Redis Lua(임시 Unix 소켓)', () => {
  let redis, child, directory, exited;
  before(async () => {
    const { default: Redis } = await import('ioredis');
    directory = await mkdtemp(join(tmpdir(), 'signum-gift-lua-'));
    const socket = join(directory, 'redis.sock');
    child = spawn(binary, ['--port', '0', '--unixsocket', socket, '--unixsocketperm', '700', '--save', '', '--appendonly', 'no', '--dir', directory], { stdio: 'ignore' });
    let startError = false; child.on('error', () => { startError = true; });
    exited = new Promise(resolve => child.once('exit', resolve).once('error', resolve));
    for (let i = 0; i < 150; i++) {
      if (startError || child.exitCode !== null) throw new Error('redis-server 시작 실패');
      try { await stat(socket); break; } catch { await new Promise(r => setTimeout(r, 20)); }
    }
    redis = new Redis({ path: socket, lazyConnect: true, retryStrategy: () => null });
    redis.on('error', () => {}); await redis.connect();
  });
  after(async () => {
    if (redis) redis.disconnect();
    if (child) { child.kill('SIGTERM'); await exited; }
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  for (const [name, fn] of scenarios()) test(name, async () => { await redis.flushdb(); await fn(redis); });
});

// ── 2) 순수 JS 모의(항상) ───────────────────────────────
describe('순수 JS 모의: Lua 원문 해석·EVAL 단위 직렬(원자) 실행', () => {
  for (const [name, fn] of scenarios()) test(name, async () => { await fn(mockRedis({ atomic: true })); });
});

describe('대조군: 비원자 실행(redis.call 사이 끼어들기 허용)이면 시험이 결함을 잡는다', () => {
  const all = Object.fromEntries(scenarios());
  for (const name of ['같은 토큰·수신자 동시 20회: 한 장 배정·19회 같은 코드·장부 한 건', '서로 다른 수신자 동시 20회: 한 명만 배정·다른 OS 거부',
    'OS별 일 전체 상한 20+20 및 상한 뒤 기존 배정 복구', '발행 동시 제한: 앱 기기·계정 3, 익명 웹 1, 코드 무차감']) {
    test(`비원자면 실패: ${name}`, async () => {
      await assert.rejects(() => all[name](mockRedis({ atomic: false })), assert.AssertionError);
    });
  }
});
