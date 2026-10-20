// 실행: npx tsx --test tests/giftShareLua.test.mjs (로컬 redis-server 필요: PATH 또는 REDIS_SERVER_BIN 절대 경로)
/** 실제 Lua를 임시 Unix 소켓 Redis에서만 시험한다. 외부 Redis 주소는 받지 않는다. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { access, mkdtemp, stat, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import Redis from 'ioredis';
import { ISSUE_LUA, CLAIM_LUA, LOAD_LUA } from '../src/lib/giftShare/atomic.cjs';

// node --test는 파일 뒤의 인자를 시험 파일로 취급한다. 인자 없이 로컬 실행 파일을 찾는다.
// 기존 직접 실행(node tests/giftShareLua.test.mjs /절대/경로)도 지원한다.
const override = process.argv[2] || process.env.REDIS_SERVER_BIN;
const candidates = override ? [override] : [
  ...(process.env.PATH || '').split(delimiter).filter(isAbsolute).map(dir => join(dir, 'redis-server')),
  '/opt/homebrew/bin/redis-server', '/usr/local/bin/redis-server', '/usr/bin/redis-server',
];
let binary;
for (const path of new Set(candidates)) {
  if (!isAbsolute(path)) continue;
  try { await access(path, constants.X_OK); if ((await stat(path)).isFile()) { binary = path; break; } } catch { /* 다음 로컬 후보 */ }
}
if (!binary) {
  console.error('로컬 redis-server 실행 파일이 없습니다. 설치 후 PATH 또는 REDIS_SERVER_BIN에 절대 경로를 지정하세요. 외부 저장소는 사용하지 않습니다.');
  process.exit(2);
}
const directory = await mkdtemp(join(tmpdir(), 'signum-gift-lua-'));
const socket = join(directory, 'redis.sock');
const child = spawn(binary, ['--port', '0', '--unixsocket', socket, '--unixsocketperm', '700', '--save', '', '--appendonly', 'no', '--dir', directory], { stdio: 'ignore' });
let startError = false; child.on('error', () => { startError = true; });
const exited = new Promise(resolve => child.once('exit', resolve).once('error', resolve));
let redis;
let stage = '시작';
const p = 'promo:pv:gift:v1';
const now = Date.now();
const random = () => randomBytes(32).toString('hex');
const codeOf = os => randomBytes(16).toString('hex').slice(0, os === 'ios' ? 18 : 23).toUpperCase();
const digest = s => createHash('sha256').update(s).digest('hex');
const run = (script, keys, args) => redis.eval(script, keys.length, ...keys, ...args);
const tokenKey = t => `${p}:token:${digest(t)}`;
async function token() {
  const t = random();
  await redis.set(tokenKey(t), JSON.stringify({ expires: now + 86400_000 }));
  return t;
}
async function load(os, count, batch = random(), end = now + 86400_000) {
  const codes = Array.from({ length: count }, () => codeOf(os));
  const keys = [`${p}:batch:${batch}`, `${p}:batches:${os}`, `${p}:pool:${os}:${batch}`, `${p}:loaded`, 'old:play', 'old:ios', 'old:claims'];
  const args = [JSON.stringify({ os, expiresAt: end }), end, batch, ...codes];
  assert.equal(await run(LOAD_LUA, keys, args), 'loaded');
  return { codes, batch, keys, args };
}
async function claim(t, device, os = 'ios', cap = 20, at = now, account = '') {
  return run(CLAIM_LUA, [tokenKey(t), `${p}:batches:${os}`, `${p}:day:test:${os}`, `${p}:ledger`, `${p}:recipient:device:${device}`,
    ...(account ? [`${p}:recipient:account:${account}`] : [])], [at, os, device, cap, digest(t), p, account]);
}
async function test(name, fn) { stage = name; await redis.flushdb(); await fn(); console.log(`통과: ${name}`); }
try {
  for (let i = 0; i < 150; i++) {
    if (startError || child.exitCode !== null) throw new Error();
    try { await stat(socket); break; } catch { await new Promise(r => setTimeout(r, 20)); }
  }
  redis = new Redis({ path: socket, lazyConnect: true, retryStrategy: () => null });
  redis.on('error', () => {}); await redis.connect();
  await test('같은 토큰·수신자 동시 20회: 한 장 배정·19회 같은 코드·장부 한 건', async () => {
    const inventory = await load('ios', 25); const t = await token(); const receiver = random();
    const results = await Promise.all(Array.from({ length: 20 }, () => claim(t, receiver)));
    assert.equal(results.filter(r => r[0] === 'new').length, 1);
    assert.equal(results.filter(r => r[0] === 'again').length, 19);
    assert.equal(new Set(results.map(r => r[1])).size, 1);
    assert.equal(await redis.llen(inventory.keys[2]), 24);
    assert.equal(await redis.hlen(`${p}:ledger`), 1);
    const entry = JSON.parse(await redis.hget(`${p}:ledger`, digest(t)));
    assert.deepEqual(Object.keys(entry).sort(), ['at', 'last4', 'os', 'tokenHash']);
    assert.equal(entry.last4, results[0][1].slice(-4));
    assert.equal(entry.tokenHash, digest(t));
  });
  await test('서로 다른 수신자 동시 20회: 한 명만 배정·다른 OS 거부', async () => {
    await load('ios', 25); await load('android', 25); const t = await token();
    const results = await Promise.all(Array.from({ length: 20 }, () => claim(t, random())));
    assert.equal(results.filter(r => r[0] === 'new').length, 1);
    assert.equal(results.filter(r => r[0] === 'taken').length, 19);
    assert.equal((await claim(t, random(), 'android'))[0], 'taken');
  });
  await test('OS별 일 전체 상한 20+20 및 상한 뒤 기존 배정 복구', async () => {
    for (const os of ['ios', 'android']) {
      await load(os, 30);
      const inputs = await Promise.all(Array.from({ length: 25 }, async () => [await token(), random()]));
      const results = await Promise.all(inputs.map(([t, d]) => claim(t, d, os)));
      assert.equal(results.filter(r => r[0] === 'new').length, 20);
      assert.equal(results.filter(r => r[0] === 'cap').length, 5);
      const index = results.findIndex(r => r[0] === 'new');
      assert.equal((await claim(...inputs[index], os))[1], results[index][1]);
    }
    assert.equal(await redis.hlen(`${p}:ledger`), 40);
  });
  await test('소진·토큰 만료·묶음 만료·잘못된 재고 무차감', async () => {
    const t = await token(); const d = random();
    assert.equal((await claim(t, d))[0], 'empty');
    const batch = await load('ios', 2, random(), now + 1000);
    assert.equal((await claim(t, d, 'ios', 20, now + 2000))[0], 'empty');
    assert.equal((await claim(t, d, 'ios', 20, now + 86400_000))[0], 'expired');
    await redis.lset(batch.keys[2], 0, '잘못된형식');
    assert.equal((await claim(t, d))[0], 'invalid');
    assert.equal(await redis.llen(batch.keys[2]), 2);
    assert.equal(await redis.hlen(`${p}:ledger`), 0);
  });
  await test('수신자 기기·계정의 캠페인 중복 및 재시도 계정 변경 거부', async () => {
    await load('ios', 5); const t = await token(); const d = random(); const a = random();
    assert.equal((await claim(t, d, 'ios', 20, now, a))[0], 'new');
    assert.equal((await claim(await token(), random(), 'ios', 20, now, a))[0], 'recipient');
    assert.equal((await claim(await token(), d))[0], 'recipient');
    assert.equal((await claim(t, d, 'ios', 20, now, random()))[0], 'taken');
  });
  await test('응답 유실 뒤 재시도·빠른 만료 묶음 우선·만료 후 복구 거부', async () => {
    const late = await load('ios', 1, random(), now + 3000);
    const early = await load('ios', 1, random(), now + 1000);
    const t = await token(); const d = random(); await claim(t, d);
    const retry = await claim(t, d);
    assert.equal(retry[0], 'again'); assert.equal(retry[1], early.codes[0]);
    assert.equal(await redis.llen(late.keys[2]), 1);
    assert.equal((await claim(t, d, 'ios', 20, now + 1000))[0], 'expired');
  });
  await test('발행 동시 제한: 앱 기기·계정 3, 익명 웹 1, 코드 무차감', async () => {
    for (const app of [true, false]) {
      await redis.flushdb();
      const keys = ['기기', '계정', '아이피', '전체'];
      const results = await Promise.all(Array.from({ length: 20 }, () => run(ISSUE_LUA, [tokenKey(random()), ...keys], [now, 86400, app ? 3 : 1, 3, 10, 400])));
      assert.equal(results.filter(r => r === 'issued').length, app ? 3 : 1);
      assert.equal(await redis.hlen(`${p}:ledger`), 0);
    }
  });
  await test('재적재·다른 묶음 중복·기존 쿠폰 풀 중복 거부', async () => {
    const original = await load('ios', 2);
    assert.equal(await run(LOAD_LUA, original.keys, original.args), 'batch_exists');
    const batch = random(); const keys = [...original.keys]; keys[0] = `${p}:batch:${batch}`; keys[2] = `${p}:pool:ios:${batch}`;
    const args = [...original.args]; args[2] = batch;
    assert.equal(await run(LOAD_LUA, keys, args), 'duplicate'); assert.equal(await redis.exists(keys[0]), 0);
    const code = codeOf('ios'); await redis.sadd('old:ios', code); args.splice(3, 2, code);
    assert.equal(await run(LOAD_LUA, keys, args), 'overlap'); assert.equal(await redis.exists(keys[0]), 0);
  });
  console.log('실제 Lua 시험 8개 통과. 운영 접근·쓰기 없음.');
} catch {
  console.error(`실제 Lua 시험 실패: ${stage}(값 출력 생략)`); process.exitCode = 1;
} finally {
  if (redis) redis.disconnect();
  child.kill('SIGTERM');
  await exited;
  await rm(directory, { recursive: true, force: true });
}
