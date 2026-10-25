import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import { randomBytes } from 'node:crypto';
const { runLua } = require('./_giftLuaMock.mjs');
const schema = require('../src/lib/giftShare/funnel.cjs');
const nsPath = require.resolve('next/server');
const ns = require(nsPath);
const pending: (() => Promise<void>)[] = [];
require.cache[nsPath] = { ...require.cache[nsPath], exports: { ...ns, after: (fn: () => Promise<void>) => pending.push(fn) } } as Module;
const serverPath = require.resolve('../src/lib/giftShare/server');
const server = { ...require(serverPath) };
require.cache[serverPath]!.exports = server;
let evals = 0;
server.giftStore = () => ({ eval: async () => { evals++; return 1; } });
const funnelPath = require.resolve('../src/lib/giftShare/funnelServer');
const funnel = { ...require(funnelPath) };
require.cache[funnelPath]!.exports = funnel;
const route = require('../src/app/api/gift/event/route');
const { FUNNEL_LIMITS: limits, funnelBuckets } = require('../src/lib/giftShare/funnelGuard');
const { giftIdentity } = require('../src/lib/giftShare/http');
process.env.VERCEL_ENV = 'preview';
process.env.GIFT_SHARE_SECRET = randomBytes(32).toString('hex');
const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1';
const headers = { origin: 'https://www.signumhq.com', 'user-agent': ua, 'sec-fetch-site': 'same-origin', 'x-real-ip': '192.0.2.12' };
const eventUrl = 'https://www.signumhq.com/api/gift/event?e=copy&s=gift_dash&p=ios&d=attached';
const request = (h = headers, extra: Record<string, unknown> = {}) => new ns.NextRequest(eventUrl, { method: 'POST', headers: h, ...extra });
const flush = async () => { for (const fn of pending.splice(0)) await fn(); };
function reset() {
  pending.length = 0; evals = 0;
  funnel.giftFunnelTask = funnel.createGiftFunnelRecorder(server.giftStore, () => Date.parse('2026-10-25T12:00:00+09:00'));
}
// 원문의 Lua를 기존 miniLua로 실행한다. 한도 로직을 JS로 옮겨 쓰지 않는다.
function luaStore(clock: () => number) {
  const hashes = new Map<string, Map<string, string>>();
  const expirations = new Map<string, number>();
  let queue = Promise.resolve<unknown>(null), commands = 0, calls = 0;
  const redisCall = (cmd: string, key: string, ...args: string[]) => {
    if ((expirations.get(key) ?? Infinity) <= clock() / 1000) { hashes.delete(key); expirations.delete(key); }
    if (cmd === 'HGET') return hashes.get(key)?.get(args[0]);
    if (cmd === 'HSET') {
      commands++;
      if (!hashes.has(key)) hashes.set(key, new Map());
      for (let i = 0; i < args.length; i += 2) hashes.get(key)!.set(args[i], args[i + 1]);
      return 1;
    }
    if (cmd === 'EXPIREAT') { commands++; expirations.set(key, Number(args[0])); return 1; }
    throw new Error('허용하지 않은 Redis 명령');
  };
  return {
    hashes, expirations, get commands() { return commands; }, get calls() { return calls; },
    eval(script: string, keys: string[], args: (string | number)[]) {
      calls++;
      const next = queue.then(() => runLua(script, keys, args, redisCall));
      queue = next.catch(() => {}); return next;
    },
    purge() {
      for (const key of hashes.keys()) if ((expirations.get(key) ?? Infinity) <= clock() / 1000) { hashes.delete(key); expirations.delete(key); }
    },
  };
}

test('관문 재현: 무출처·null·외부 출처·UA 없음 4,000 POST → EVAL 0', async () => {
  reset();
  const invalid = [{}, { ...headers, origin: 'null' }, { ...headers, origin: 'https://external.example' }, { ...headers, 'user-agent': '' }];
  for (let i = 0; i < 1000; i++) for (const h of invalid) assert.equal((await route.POST(request(h as typeof headers))).status, 204);
  assert.equal(pending.length, 0); await flush(); assert.equal(evals, 0);
});

test('본문·청크·허위 Content-Length·추가/중복 쿼리·서버 단계·사설 단계는 쓰기 0', async () => {
  reset();
  for (const extra of [{ body: 'x' }, { body: 'x'.repeat(8192) }, { headers: { ...headers, 'content-length': '8192' } },
    { headers: { ...headers, 'content-length': '0' }, body: 'x' },
    { body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(8192)); c.close(); } }), duplex: 'half' }]) {
    await route.POST(request(headers, extra));
  }
  for (const q of ['e=issue&s=all&p=ios&d=new', 'e=open&s=all&p=ios&d=all', 'e=claim&s=all&p=ios&d=new', 'e=redeem&s=all&p=ios&d=all',
    'e=private&s=gift_dash&p=ios&d=all', 'e=tap&s=all&p=ios&d=all', 'e=tap&s=gift_dash&p=desktop&d=all']) {
    await route.POST(new ns.NextRequest(`https://www.signumhq.com/api/gift/event?${q}`, { method: 'POST', headers }));
  }
  for (const suffix of ['&e=copy', '&device=private', '&day=2000-01-01', '&extra=' + 'a'.repeat(1024)]) {
    await route.POST(new ns.NextRequest(eventUrl + suffix, { method: 'POST', headers }));
  }
  await route.POST(request({ ...headers, 'sec-fetch-site': 'cross-site' }));
  await route.POST(request({ ...headers, 'x-real-ip': '' }));
  await flush(); assert.equal(evals, 0);
  for (const stage of ['issue', 'open', 'claim', 'redeem', 'private']) assert.equal(schema.validClientEvent(stage, 'all', 'ios', 'new'), false);
});

test('Next 어댑터의 0바이트 스트림은 허용, 끝나지 않는 본문은 제한 시간 후 쓰기 0', async () => {
  reset();
  await route.POST(request(headers, { body: new ReadableStream({ start(c) { c.close(); } }), duplex: 'half' }));
  await flush(); assert.equal(evals, 1);
  reset();
  await route.POST(request(headers, { body: new ReadableStream(), duplex: 'half' }));
  await flush(); assert.equal(evals, 0);
});

test('정상 헤더 위조 동시 10,000 POST → 기기/분 상한 60 EVAL, 식별자 회전도 IP·프로세스 상한', async () => {
  reset();
  await Promise.all(Array.from({ length: 10000 }, () => route.POST(request())));
  assert.equal(pending.length, limits.deviceMinute); await flush(); assert.equal(evals, limits.deviceMinute);
  reset();
  // 임의 기기 헤더는 바꿔도 IP 상한을 넘지 못한다.
  for (let i = 0; i < 1000; i++) await route.POST(request({ ...headers, 'x-gift-device': String(i).padStart(32, '0') } as typeof headers));
  await flush(); assert.equal(evals, limits.ipMinute);
  reset();
  // 양쪽 값을 회전시켜도 고정 메모리와 프로세스 전역 상한이 있다.
  for (let i = 0; i < 1000; i++) await route.POST(request({ ...headers, 'x-real-ip': `192.0.${i >> 8}.${i % 256}`, 'x-gift-device': String(i).padStart(32, '0') } as typeof headers));
  await flush(); assert.equal(evals, limits.processMinute);
});

test('서명 기기 쿠키는 IP가 바뀌어도 같은 버킷, IPv6 /64·운영 신뢰 IP·일별 분리', () => {
  const cookie = `sg_gift_recipient=${giftIdentity(request()).cookie}`;
  const a = funnelBuckets(request({ ...headers, cookie } as typeof headers), '2026-10-25');
  const b = funnelBuckets(request({ ...headers, cookie, 'x-real-ip': '192.0.2.99' } as typeof headers), '2026-10-25');
  assert.equal(a[1], b[1]);
  const first = funnelBuckets(request({ ...headers, 'x-real-ip': '2001:db8:1:2::1' }), '2026-10-25');
  const second = funnelBuckets(request({ ...headers, 'x-real-ip': '2001:db8:1:2::abcd' }), '2026-10-25');
  assert.equal(first[0], second[0]);
  process.env.VERCEL_ENV = 'production';
  const trusted = { ...headers, 'x-vercel-forwarded-for': '192.0.2.22' };
  assert.deepEqual(funnelBuckets(request({ ...trusted, 'x-forwarded-for': '192.0.2.33', 'x-invite-test-ip': '192.0.2.44' } as typeof headers), '2026-10-25'), funnelBuckets(request(trusted), '2026-10-25'));
  process.env.VERCEL_ENV = 'preview';
});

test('실제 Lua 원문: 여러 인스턴스의 IP·기기 분 상한, 거부 뒤 쓰기·TTL 변경 0', async () => {
  let time = Date.parse('2026-10-25T12:00:00+09:00');
  const store = luaStore(() => time);
  const records = Array.from({ length: 10 }, () => funnel.createGiftFunnelRecorder(() => store, () => time));
  // 기기를 회전시켜도 같은 IP는 총 120회만 쓴다.
  for (let i = 0; i < 1000; i++) await records[i % 10](request({ ...headers, 'x-gift-device': String(i).padStart(32, '0') } as typeof headers), 'copy', 'gift_dash', 'ios', 'attached')?.();
  assert.equal(store.commands, limits.ipMinute * 2);
  assert.equal(store.hashes.size, 1);
  time += 60000;
  const cookie = `sg_gift_recipient=${giftIdentity(request()).cookie}`;
  const before = store.commands;
  // IP를 회전시켜도 같은 서명 기기는 총 60회만 쓴다.
  for (let i = 0; i < 1000; i++) await records[i % 10](request({ ...headers, cookie, 'x-real-ip': `192.0.${i >> 8}.${i % 256}` } as typeof headers), 'copy', 'gift_dash', 'ios', 'attached')?.();
  assert.equal(store.commands - before, limits.deviceMinute * 2);
});

test('대량 위조·냉시작: 공유 일일 예산 10,000건/20,000 쓰기 명령, 서버 몫 독립·과거 날짜 입력 없음', async () => {
  let time = Date.parse('2026-10-25T00:00:00+09:00');
  const store = luaStore(() => time);
  let record: any;
  for (let i = 0; i < 10500; i++) {
    // 별도 인스턴스가 같은 Redis 예산을 쓰는 경우도 검사한다.
    if (i % 100 === 0) record = funnel.createGiftFunnelRecorder(() => store, () => time);
    await record(request(), 'copy', 'gift_dash', 'ios', 'attached')?.();
    time += 1000;
  }
  assert.equal(store.commands, limits.day * 2);
  const key = 'promo:pv:gift:v1:funnel:2026-10-25';
  assert.equal(store.hashes.get(key)!.get('copy|gift_dash|ios|attached'), String(limits.day));
  assert.equal(store.hashes.get(key)!.get('_budget:client'), String(limits.day));
  assert.equal(store.hashes.size, 1);
  const recordServer = funnel.createGiftFunnelRecorder(() => store, () => time);
  await recordServer(request(), 'claim', 'all', 'ios', 'new')?.();
  assert.equal(store.commands, limits.day * 2 + 2);
  assert.equal(store.hashes.get(key)!.get('claim|all|ios|new'), '1');
  assert.ok(store.hashes.get(key)!.size <= 2 * 2 * limits.slots * 2 + 4);
  const stored = JSON.stringify([...store.hashes].map(([k, v]) => [k, [...v]]));
  for (const privateValue of [headers['x-real-ip'], ua, headers.origin]) assert.ok(!stored.includes(privateValue));
  assert.equal(store.expirations.get(key), Date.parse('2026-12-04T00:00:00+09:00') / 1000);
});

test('프로세스 일일 EVAL 상한·장애 재시도 0·KST 자정 재개·40일 키 상한', async () => {
  let time = Date.parse('2026-10-25T00:00:00+09:00'), calls = 0;
  const record = funnel.createGiftFunnelRecorder(() => ({ eval: async () => { calls++; throw new Error('offline'); } }), () => time);
  for (let i = 0; i < 10500; i++) { await record(request(), 'tap', 'gift_dash', 'ios')?.(); time += 1000; }
  assert.equal(calls, limits.processDay);
  time = Date.parse('2026-10-26T00:00:00+09:00');
  await record(request(), 'tap', 'gift_dash', 'ios')?.(); assert.equal(calls, limits.processDay + 1);
  const store = luaStore(() => time);
  const daily = funnel.createGiftFunnelRecorder(() => store, () => time);
  for (let i = 0; i < 85; i++) {
    await daily(request(), 'tap', 'gift_dash', 'ios')?.(); store.purge();
    assert.ok(store.hashes.size <= limits.retentionDays);
    time += 86400000;
  }
  store.purge(); assert.equal(store.hashes.size, limits.retentionDays - 1);
});
