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
const batches: (string | number)[][] = [];
server.giftStore = () => ({ eval: async (_s: string, _k: string[], args: (string | number)[]) => { evals++; batches.push(args); return 1; } });
const noWait = async () => {};
// 묶음 인자 [만료, 레인, 일일천장, 호출천장, 필드, 개수, …] → 이벤트 합계
const batchSum = () => batches.reduce((n, a) => { for (let i = 4; i < a.length; i += 2) n += Number(a[i + 1]); return n; }, 0);
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
  pending.length = 0; evals = 0; batches.length = 0;
  funnel.giftFunnelTask = funnel.createGiftFunnelRecorder(server.giftStore, () => Date.parse('2026-10-25T12:00:00+09:00'), noWait);
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

test('정상 헤더 위조 동시 10,000 POST → 요청당 호출 0, 배출 작업 1개·EVAL 1회(묶음 60건)', async () => {
  reset();
  await Promise.all(Array.from({ length: 10000 }, () => route.POST(request())));
  assert.equal(pending.length, 1); await flush();
  assert.equal(evals, 1); assert.equal(batchSum(), limits.deviceMinute);
  reset();
  // 임의 기기 헤더 회전 → IP 상한, 양쪽 회전 → 인스턴스 분 상한. 어느 경우도 EVAL 은 1회.
  for (let i = 0; i < 1000; i++) await route.POST(request({ ...headers, 'x-gift-device': String(i).padStart(32, '0') } as typeof headers));
  await flush(); assert.equal(evals, 1); assert.equal(batchSum(), limits.ipMinute);
  reset();
  for (let i = 0; i < 1000; i++) await route.POST(request({ ...headers, 'x-real-ip': `192.0.${i >> 8}.${i % 256}`, 'x-gift-device': String(i).padStart(32, '0') } as typeof headers));
  await flush(); assert.equal(evals, 1); assert.equal(batchSum(), limits.processMinute);
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

// 시뮬레이션 시계: 대기(sleep)는 시계만 앞으로 민다.
function sim(start: string) {
  const clock = { t: Date.parse(start) };
  return { clock, now: () => clock.t, sleep: async (ms: number) => { clock.t += ms; } };
}
const forged = (i: number) => request({ ...headers, 'x-real-ip': `198.51.${(i >> 8) & 255}.${i & 255}`, 'x-gift-device': String(i).padStart(32, '0') } as typeof headers);

test('관문 10251712 재현 반전: 같은 IP·기기·분 위조 1,000건을 인스턴스 10개에 분산 → EVAL ≤ 20(이전 600, 인스턴스당 선두 1 + 꼬리 묶음 1)', async () => {
  const s = sim('2026-10-25T12:00:00+09:00');
  const store = luaStore(s.now);
  const inst = Array.from({ length: 10 }, () => funnel.createGiftFunnelRecorder(() => store, s.now, s.sleep));
  const tasks: Promise<void>[] = [];
  for (let i = 0; i < 1000; i++) { const t = inst[i % 10](request(), 'copy', 'gift_dash', 'ios', 'attached'); if (t) tasks.push(t()); }
  await Promise.all(tasks);
  assert.ok(store.calls <= 20, `EVAL ${store.calls}`);
  assert.equal(tasks.length, 10);
  assert.equal(store.hashes.get('promo:pv:gift:v1:funnel:2026-10-25')!.get('copy|gift_dash|ios|attached'), String(10 * limits.deviceMinute));
});

test('다중 인스턴스 대량 위조(50 인스턴스·하루 20만 건): 전역 EVAL ≤ 레인 호출 천장 + 인스턴스 수, 천장 뒤 호출 0', async () => {
  const s = sim('2026-10-25T00:00:00+09:00');
  const store = luaStore(s.now);
  const N = 50;
  const inst = Array.from({ length: N }, () => funnel.createGiftFunnelRecorder(() => store, s.now, s.sleep));
  let returned = 0;
  for (let i = 0; i < 200000; i++) {
    const t = inst[i % N](forged(i), 'tap', 'gift_dash', 'ios');
    if (t) { returned++; await t(); }
    s.clock.t += 375; // 하루 ≈ 75,000초에 걸쳐 고르게
  }
  const key = 'promo:pv:gift:v1:funnel:2026-10-25';
  const h = store.hashes.get(key)!;
  assert.ok(store.calls <= limits.calls + N, `EVAL ${store.calls}`);
  assert.equal(h.get('_calls:client'), String(limits.calls));
  assert.ok(Number(h.get('_budget:client')) <= limits.day);
  assert.ok(Number(h.get('tap|gift_dash|ios|all')) <= limits.day);
  // 천장에 닿은 뒤: 같은 인스턴스들에 추가 위조 10만 건 → 호출 0
  const before = store.calls;
  for (let i = 0; i < 100000; i++) { const t = inst[i % N](forged(i), 'tap', 'gift_dash', 'ios'); if (t) await t(); s.clock.t += 10; }
  assert.equal(store.calls, before);
  assert.ok(returned < 200000 / 10);
  // 서버 레인은 별도 천장 — 클라이언트 위조가 서버 확정 수치를 막지 못한다.
  await inst[0](request(), 'claim', 'all', 'ios', 'new')?.();
  assert.equal(h.get('claim|all|ios|new'), '1');
  const stored = JSON.stringify([...store.hashes].map(([k, v]) => [k, [...v]]));
  for (const privateValue of [headers['x-real-ip'], ua, headers.origin, '198.51.']) assert.ok(!stored.includes(privateValue));
  assert.equal(store.expirations.get(key), Date.parse('2026-12-04T00:00:00+09:00') / 1000);
  assert.ok(h.size <= 64 * 2 + 4);
});

test('냉시작 폭주(새 인스턴스 2,000개): 천장 도달 뒤 새 인스턴스는 정확히 1회 거부 호출 뒤 0', async () => {
  const s = sim('2026-10-25T00:00:00+09:00');
  const store = luaStore(s.now);
  let created = 0, rec: any;
  for (let i = 0; i < 200000; i++) {
    if (i % 100 === 0) { rec = funnel.createGiftFunnelRecorder(() => store, s.now, s.sleep); created++; }
    const t = rec(forged(i), 'copy', 'gift_pop', 'android', 'general'); if (t) await t();
    s.clock.t += 50;
  }
  const h = store.hashes.get('promo:pv:gift:v1:funnel:2026-10-25')!;
  assert.equal(h.get('_calls:client'), String(limits.calls));
  assert.ok(store.calls <= limits.calls + created, `EVAL ${store.calls} / 인스턴스 ${created}`);
  // 각 인스턴스 100건 중 EVAL 은 최대 몇 회: 요청 수에 비례하지 않는다.
  assert.ok(store.calls < 200000 / 50);
});

test('천장 전에는 사람 수준 저빈도 이벤트가 유실 없이 반영, 간격·묶음으로 호출 최소', async () => {
  const s = sim('2026-10-25T09:00:00+09:00');
  const store = luaStore(s.now);
  const rec = funnel.createGiftFunnelRecorder(() => store, s.now, s.sleep);
  for (let i = 0; i < 30; i++) { await rec(forged(i), 'visible', 'gift_set', 'ios')?.(); s.clock.t += 60000; }
  const h = store.hashes.get('promo:pv:gift:v1:funnel:2026-10-25')!;
  assert.equal(h.get('visible|gift_set|ios|all'), '30'); assert.equal(store.calls, 30);
  // 날고 있는 동안 들어온 몫은 같은 배출 작업이 간격 뒤 이어 가져간다.
  const first = rec(forged(1), 'tap', 'gift_set', 'ios')!;
  for (let i = 0; i < 5; i++) assert.equal(rec(forged(i + 2), 'tap', 'gift_set', 'ios'), null);
  await first();
  assert.equal(h.get('tap|gift_set|ios|all'), '6'); assert.equal(store.calls, 31);
});

test('인스턴스 일일 EVAL 상한·장애 = 당일 정지(재시도 0)·KST 자정 재개·40일 키 상한·차단 스위치', async () => {
  const s = sim('2026-10-25T00:00:00+09:00');
  let calls = 0;
  const rec = funnel.createGiftFunnelRecorder(() => ({ eval: async () => { calls++; throw new Error('offline'); } }), s.now, s.sleep);
  for (let i = 0; i < 20000; i++) { await rec(forged(i), 'tap', 'gift_dash', 'ios')?.(); s.clock.t += 3000; if (s.clock.t >= Date.parse('2026-10-25T23:59:00+09:00')) break; }
  assert.equal(calls, 1); // 오류 뒤 그 인스턴스·레인은 당일 호출 0
  s.clock.t = Date.parse('2026-10-26T00:00:00+09:00');
  await rec(forged(1), 'tap', 'gift_dash', 'ios')?.(); assert.equal(calls, 2);
  // 정상 응답이면 인스턴스 일일 상한까지만 호출
  let ok = 0;
  const busy = funnel.createGiftFunnelRecorder(() => ({ eval: async () => { ok++; return 1; } }), s.now, s.sleep);
  for (let i = 0; i < 20000; i++) { await busy(forged(i), 'tap', 'gift_dash', 'ios')?.(); s.clock.t += 2500; if (s.clock.t >= Date.parse('2026-10-26T23:59:00+09:00')) break; }
  assert.equal(ok, limits.instanceCalls);
  const store = luaStore(s.now);
  const daily = funnel.createGiftFunnelRecorder(() => store, s.now, s.sleep);
  for (let i = 0; i < 85; i++) {
    await daily(request(), 'tap', 'gift_dash', 'ios')?.(); store.purge();
    assert.ok(store.hashes.size <= limits.retentionDays);
    s.clock.t += 86400000;
  }
  store.purge(); assert.equal(store.hashes.size, limits.retentionDays - 1);
  process.env.GIFT_FUNNEL_CLIENT = '0';
  const off = luaStore(s.now);
  const killed = funnel.createGiftFunnelRecorder(() => off, s.now, s.sleep);
  assert.equal(killed(request(), 'tap', 'gift_dash', 'ios'), null);
  await killed(request(), 'open', 'all', 'ios')?.();
  assert.equal(off.calls, 1);
  delete process.env.GIFT_FUNNEL_CLIENT;
});

test('관문 10251927 재현: 천장 도달 뒤 -1 응답이 10회 유실돼도 같은 인스턴스의 거부 EVAL ≤ 1', async () => {
  const s = sim('2026-10-25T12:00:00+09:00');
  const store = luaStore(s.now);
  // 천장을 미리 채운다(다른 인스턴스들이 이미 1,500회 받은 상태).
  store.hashes.set('promo:pv:gift:v1:funnel:2026-10-25', new Map([['_calls:client', String(limits.calls)], ['_calls:server', String(limits.calls)]]));
  for (const lane of [['tap', 'gift_dash', 'ios', 'all'], ['open', 'all', 'ios', 'all']]) {
    let lost = 0;
    const lossy = { eval: async (a: string, b: string[], c: (string | number)[]) => { await store.eval(a, b, c); lost++; throw new Error('response lost'); } };
    const rec = funnel.createGiftFunnelRecorder(() => lossy, s.now, s.sleep);
    for (let i = 0; i < 1000; i++) { await rec(forged(i), lane[0], lane[1], lane[2], lane[3])?.(); s.clock.t += 5000; }
    assert.equal(lost, 1, lane[0]);
  }
  // 응답이 정상 도착하는 인스턴스도 거부 1회 뒤 0
  const before = store.calls;
  const rec = funnel.createGiftFunnelRecorder(() => store, s.now, s.sleep);
  for (let i = 0; i < 1000; i++) { await rec(forged(i), 'copy', 'gift_set', 'android', 'attached')?.(); s.clock.t += 5000; }
  assert.equal(store.calls - before, 1);
});

test('EVAL 이 오래 걸려도(멈춤 교대 시간 초과) 레인당 동시 EVAL 1개', async () => {
  const s = sim('2026-10-25T12:00:00+09:00');
  let concurrent = 0, peak = 0, release: () => void = () => {};
  const slow = { eval: async () => { concurrent++; peak = Math.max(peak, concurrent); await new Promise<void>(r => { release = r; }); concurrent--; return -1; } };
  const rec = funnel.createGiftFunnelRecorder(() => slow, s.now, s.sleep);
  const first = rec(forged(0), 'tap', 'gift_dash', 'ios')!;
  const running = first();
  await Promise.resolve(); await Promise.resolve();
  s.clock.t += limits.staleMs * 3;
  for (let i = 1; i < 100; i++) { const t = rec(forged(i), 'tap', 'gift_dash', 'ios'); if (t) void t(); }
  release(); await running;
  assert.equal(peak, 1);
  assert.equal(rec(forged(200), 'tap', 'gift_dash', 'ios'), null); // -1 뒤 당일 0
});
