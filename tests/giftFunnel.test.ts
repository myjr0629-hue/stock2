import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { memoryAtomic } from './_giftStateMemory';
import { createGiftPreparation } from '../src/lib/giftShare/client';
import { giftFunnel, giftPayloadMetric, giftOutcomeMetric } from '../src/lib/giftShare/funnelClient';
import { observeGiftVisibility } from '../src/lib/giftShare/visibility';
import { shareOrCopy } from '../src/lib/share/share';
const schema = require('../src/lib/giftShare/funnel.cjs');
const reader = require('../scripts/gift-funnel.js');
const queue: (() => unknown)[] = [];
const nsPath = require.resolve('next/server');
const ns = require(nsPath);
require.cache[nsPath] = { ...require.cache[nsPath], exports: { ...ns, after: (fn: () => unknown) => queue.push(fn) } } as Module;
const { NextRequest } = ns;
const serverPath = require.resolve('../src/lib/giftShare/server');
const server = { ...require(serverPath) };
require.cache[serverPath]!.exports = server;
const writes: { key: string; field: string; expires: number }[] = [];
let answer: unknown = ['empty'];
let inventory = 0;
server.giftStore = () => ({ eval: async (script: string, keys: string[], args: (string | number)[]) => {
  if (script === schema.BUMP_LUA) {
    // 묶음 인자 [만료, 레인, 일일천장, 호출천장, 필드, 개수, …] — 개수만큼 펼쳐 기록한다.
    for (let i = 4; i < args.length; i += 2) for (let n = 0; n < Number(args[i + 1]); n++) writes.push({ key: keys[0], field: String(args[i]), expires: Number(args[0]) });
    return 1;
  }
  inventory++;
  if (answer instanceof Error) throw answer;
  return answer;
} });
const funnelPath = require.resolve('../src/lib/giftShare/funnelServer');
const funnelMod = { ...require(funnelPath) };
require.cache[funnelPath]!.exports = funnelMod;
const { createGiftFunnelRecorder } = funnelMod;
const noWait = async () => {};
const eventRoute = require('../src/app/api/gift/event/route');
const { giftLanding } = require('../src/lib/giftShare/landing');
const claimRoute = require('../src/app/api/gift/claim/route');
const { giftIdentity } = require('../src/lib/giftShare/http');
const flush = async () => { for (const fn of queue.splice(0)) await fn(); };
const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';
const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Safari/537.36';
const nav = { 'user-agent': ios, 'accept-language': 'ko-KR', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', origin: 'https://www.signumhq.com', 'sec-fetch-site': 'same-origin', 'x-real-ip': '192.0.2.10' };
const req = (path: string, opts: any = {}) => new NextRequest(`https://www.signumhq.com${path}`, { headers: nav, ...opts });
// 라우트가 쓰는 싱글턴을 대기 없는 새 기록기로 교체(묶음 간격은 남용 시험이 따로 검사).
const reset = () => { queue.length = 0; writes.length = 0; inventory = 0; funnelMod.giftFunnelTask = createGiftFunnelRecorder(server.giftStore, Date.now, noWait); };
const payload = { url: 'https://www.signumhq.com/app', title: 'unchanged', text: 'unchanged' };
const json = (body: unknown) => new Response(JSON.stringify(body));
function storage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k), key: (i: number) => [...values.keys()][i] ?? null, get length() { return values.size; },
  } });
  return values;
}
process.env.VERCEL_ENV = 'preview';
process.env.GIFT_SHARE_ENABLED = '1';
process.env.GIFT_SHARE_SECRET = randomBytes(32).toString('hex');
const token = server.newToken();

test('KST 날짜 경계·운영/시험 키·닫힌 필드·원자 카운터', async () => {
  assert.equal(schema.kstDay(Date.parse('2026-10-24T14:59:59Z')), '2026-10-24');
  assert.equal(schema.kstDay(Date.parse('2026-10-24T15:00:00Z')), '2026-10-25');
  reset();
  const record = createGiftFunnelRecorder(server.giftStore, () => Date.parse('2026-10-25T12:00:00+09:00'), noWait);
  await record(req('/app'), 'copy', 'gift_dash', 'android', 'attached')?.();
  assert.deepEqual(writes, [{ key: 'promo:pv:gift:v1:funnel:2026-10-25', field: 'copy|gift_dash|android|attached', expires: Date.parse('2026-12-04T00:00:00+09:00') / 1000 }]);
  process.env.VERCEL_ENV = 'production';
  await record(req('/app'), 'tap', 'gift_set', 'ios')?.();
  assert.equal(writes[1].key, 'promo:gift:v1:funnel:2026-10-25');
  process.env.VERCEL_ENV = 'preview';
  assert.equal(record(req('/app'), 'tap', 'private-id', 'ios'), null);
  assert.equal(record(req('/app'), 'gate', 'gift_set', 'ios', 'arbitrary-error'), null);
  assert.equal(writes.length, 2);
  assert.match(schema.BUMP_LUA, /HSET/); assert.match(schema.BUMP_LUA, /EXPIREAT/);
});

test('클라이언트: 실제 시트 완료·복사·취소·실패 및 첨부/대체 분리, 식별자 전송 없음', async () => {
  const beacons: string[] = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: (url: string) => { beacons.push(url); return true; }, share: async () => {} } });
  const attached = { ...payload, url: `${payload.url}?gift=${token}` };
  const original = JSON.stringify(attached);
  const kind = giftPayloadMetric(attached, 'gift_set', 'ios', 'not_ready');
  giftOutcomeMetric(await shareOrCopy(attached), 'gift_set', 'ios', kind);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: (url: string) => { beacons.push(url); return true; }, clipboard: { writeText: async () => {} } } });
  const fallbackKind = giftPayloadMetric(payload, 'gift_dash', 'android', 'reserve_error');
  giftOutcomeMetric(await shareOrCopy(payload), 'gift_dash', 'android', fallbackKind);
  giftOutcomeMetric('cancelled', 'gift_pop', 'ios', 'legacy');
  giftOutcomeMetric('failed', 'gift_pop', 'ios', 'general');
  giftPayloadMetric({ url: `${payload.url}?code=synthetic` }, 'gift_set', 'ios', 'off');
  giftPayloadMetric(payload, 'sh_pick', 'web', 'off');
  assert.equal(JSON.stringify(attached), original);
  const fields = beacons.map(b => { const q = new URL(b, payload.url).searchParams; assert.deepEqual([...q.keys()], ['e', 's', 'p', 'd']); return [q.get('e'), q.get('d')].join('|'); });
  for (const f of ['payload|attached', 'sheet|attached', 'payload|general', 'gate|reserve_error', 'copy|general', 'cancel|legacy', 'failed|general', 'payload|legacy', 'payload|content']) assert.ok(fields.includes(f), f);
  assert.ok(!beacons.join().includes(token));
  const before = beacons.length;
  giftFunnel('gate', 'gift_set', 'ios', 'unknown'); assert.equal(beacons.length, before);
  let fallbackCalls = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: () => { throw new Error('blocked'); } } });
  const oldFetch = global.fetch;
  global.fetch = (async () => { fallbackCalls++; throw new Error('blocked'); }) as typeof fetch;
  giftFunnel('tap', 'gift_set', 'ios'); await Promise.resolve();
  assert.equal(fallbackCalls, 1); global.fetch = oldFetch;
});

test('가시 노출: 스크롤 밖·50% 미만·백그라운드 제외, 전경 50% 한 번·정리', () => {
  let callback: (entries: any[]) => void = () => {};
  let listener: (() => void) | null = null;
  let state = 'hidden', seen = 0, disconnected = 0;
  const node = {} as HTMLElement;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    get visibilityState() { return state; }, addEventListener: (_: string, fn: () => void) => { listener = fn; }, removeEventListener: () => { listener = null; },
  } });
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: class {
    constructor(fn: typeof callback) { callback = fn; } observe() {} disconnect() { disconnected++; }
  } });
  const stop = observeGiftVisibility(node, () => seen++);
  callback([{ target: node, isIntersecting: false, intersectionRatio: 0 }]);
  state = 'visible'; listener!(); assert.equal(seen, 0);
  callback([{ target: node, isIntersecting: true, intersectionRatio: 0.49 }]); assert.equal(seen, 0);
  state = 'hidden'; callback([{ target: node, isIntersecting: true, intersectionRatio: 0.5 }]); assert.equal(seen, 0);
  state = 'visible'; listener!(); listener!(); assert.equal(seen, 1);
  stop(); assert.equal(listener, null); assert.ok(disconnected > 0);
  delete (globalThis as any).IntersectionObserver;
  observeGiftVisibility(node, () => seen++)(); assert.equal(seen, 1);
  delete (globalThis as any).document;
});

test('준비 게이트: 미조회·꺼짐·설정 오류·재고/한도·시계·기기·장부·예약·신선도·저장 실패', async () => {
  const now = Date.parse('2026-10-25T10:00:00+09:00');
  for (const scenario of ['pending', 'off', 'config_error', 'unavailable', 'clock', 'device', 'random', 'ledger', 'local_cap', 'reserve_rejected', 'reserve_error', 'stale', 'storage']) {
    storage(); let time = now;
    const mem = memoryAtomic();
    if (scenario === 'local_cap') mem.state.days['2026-10-25'] = 3;
    const client = createGiftPreparation(async url => {
      if (String(url).endsWith('share-config')) {
        if (scenario === 'config_error') throw new Error('blocked');
        return json({ enabled: scenario !== 'off', available: scenario !== 'unavailable', now: scenario === 'clock' ? now - 600000 : now });
      }
      if (scenario === 'reserve_error') throw new Error('blocked');
      return json({ ok: scenario !== 'reserve_rejected' });
    }, () => scenario === 'device' ? null : 'd'.repeat(64), () => time,
    scenario === 'random' ? () => null : undefined, scenario === 'ledger' ? async () => null : mem.atomic);
    if (scenario !== 'pending') await client.refresh('ios');
    if (scenario === 'stale') time += 60000;
    if (scenario === 'storage') Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { get length() { throw new Error('blocked'); } } });
    const result = client.payload(payload, 'ko', 'ios', undefined, true);
    assert.ok(!new URL(result.url).searchParams.has('gift'));
    assert.equal(client.gateReason(), scenario === 'pending' ? 'config_pending' : scenario);
  }
});

test('비콘 API: 응답 뒤 쓰기·봇/외부 출처/미지 값/서버 단계 거부', async () => {
  reset();
  const url = '/api/gift/event?e=copy&s=gift_dash&p=android&d=attached';
  const response = await eventRoute.POST(req(url, { method: 'POST' }));
  assert.equal(response.status, 204); assert.equal(writes.length, 0);
  await flush(); assert.equal(writes.length, 1);
  for (const opts of [{ headers: { ...nav, origin: 'https://invalid.example' } }, { headers: { ...nav, 'user-agent': 'Mozilla/5.0 HeadlessChrome' } }]) await eventRoute.POST(req(url, { method: 'POST', ...opts }));
  for (const bad of ['e=issue&s=all&p=ios&d=new', 'e=claim&s=all&p=ios&d=new', 'e=open&s=all&p=ios&d=all', 'e=redeem&s=all&p=ios&d=all', 'e=tap&s=private&p=ios&d=all', 'e=gate&s=gift_set&p=ios&d=private']) await eventRoute.POST(req(`/api/gift/event?${bad}`, { method: 'POST' }));
  await flush(); assert.equal(writes.length, 1);
});

test('새 선물 예약은 서버 성공 시에만 집계, 멱등 확인·거부·오류는 신규 발급 0', async () => {
  const issue = require('../src/app/api/gift/issue/route');
  const reserve = require('../src/app/api/gift/reserve/route');
  for (const route of [issue, reserve]) for (const status of ['issued', 'exists', 'cap', 'error']) {
    reset(); answer = status === 'error' ? new Error('synthetic') : status;
    const response = await route.POST(req('/api/gift/issue', { method: 'POST', headers: { ...nav, 'content-type': 'application/json' }, body: JSON.stringify({ token, at: Date.now() }) }));
    assert.equal((await response.json()).ok, ['issued', 'exists'].includes(status));
    assert.equal(writes.length, 0);
    await flush();
    assert.deepEqual(writes.map(w => w.field), status === 'issued' ? ['issue|all|ios|new'] : []);
  }
});

test('수신 열람: iOS/Android/PC/iPad 사람 GET만, HEAD·미리보기·prefetch·비탐색 제외, 재고 무호출', async () => {
  reset();
  for (const [ua, hint, expected] of [[ios, '', 'ios'], [android, '', 'android'], [desktop, '', 'desktop'], [desktop, '&gift_os=ios', 'ios']]) {
    const response = await giftLanding(req(`/app?gift=${token}${hint}`, { headers: { ...nav, 'user-agent': ua } }));
    assert.equal(response.status, 200); assert.equal(writes.length, 0);
    await flush(); assert.equal(writes.pop()!.field, `open|all|${expected}|all`);
  }
  for (const opts of [{ method: 'HEAD' }, { headers: { ...nav, purpose: 'prefetch' } }, { headers: { ...nav, 'user-agent': 'facebookexternalhit/1.1' } }, { headers: { ...nav, 'sec-fetch-mode': 'cors' } }, { headers: { ...nav, 'accept-language': '' } }]) await giftLanding(req(`/app?gift=${token}`, opts));
  await giftLanding(req('/app?gift=invalid'));
  await flush(); assert.equal(writes.length, 0); assert.equal(inventory, 0);
});

test('등록 POST: OS별 신규·재열람·재고·한도·만료·기존 배정·수신자 제한·오류와 등록 탭 분리', async () => {
  for (const ua of [ios, android]) for (const status of ['new', 'again', 'empty', 'cap', 'expired', 'taken', 'recipient', 'invalid', 'error']) {
    reset();
    const os = ua === ios ? 'ios' : 'android';
    const code = randomBytes(16).toString('hex').slice(0, os === 'ios' ? 18 : 23).toUpperCase();
    answer = status === 'error' ? new Error('synthetic') : ['new', 'again'].includes(status) ? [status, code] : [status];
    const cookie = `sg_gift_recipient=${giftIdentity(req('/app')).cookie}`;
    const response = await claimRoute.POST(req('/api/gift/claim', { method: 'POST', headers: { ...nav, 'user-agent': ua, cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ gift: token }) }));
    assert.equal(response.status, 303); assert.equal(writes.length, 0);
    assert.equal(new URL(response.headers.get('location')!).pathname.includes('redeem'), ['new', 'again'].includes(status));
    await flush(); assert.deepEqual(writes.map(w => w.field).sort(), [`claim|all|${os}|${status}`, `redeem|all|${os}|all`].sort());
    assert.ok(!JSON.stringify(writes).includes(token)); assert.ok(!JSON.stringify(writes).includes(code));
  }
  reset();
  await claimRoute.POST(req('/api/gift/claim', { method: 'POST', headers: { ...nav, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ gift: token }) }));
  await flush(); assert.ok(writes.some(w => w.field === 'claim|all|ios|cookie')); assert.equal(inventory, 0);
  reset();
  await claimRoute.POST(req('/api/gift/claim', { method: 'POST', headers: { ...nav, origin: 'https://invalid.example' } }));
  await flush(); assert.equal(writes.length, 0); assert.equal(inventory, 0);
  // 관찰자 오류는 정상 배정 반환값을 바꾸지 않는다.
  const result = await server.claimGift({ eval: async () => ['new', randomBytes(16).toString('hex').slice(0, 18).toUpperCase()] }, { token, os: 'ios', device: 'synthetic' }, Date.now(), () => { throw new Error('metrics'); });
  assert.ok(result);
});

test('읽기 스크립트: HGETALL만·KST 날짜/시험 분리·미관측·부분 오류·사설 필드 제외', async () => {
  const calls: any[] = [];
  const opts = reader.options(['--days=2', '--end=2026-10-25', '--probe']);
  const result = await reader.readDays(opts, { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_READ_ONLY_TOKEN: 'synthetic' }, async (_url: string, init: any) => {
    calls.push(JSON.parse(init.body));
    return json({ result: calls.length === 1 ? ['copy|gift_dash|android|attached', '2', 'secret|arbitrary', '1'] : [] });
  });
  assert.deepEqual(calls, [['HGETALL', 'promo:pv:gift:v1:funnel:2026-10-25'], ['HGETALL', 'promo:pv:gift:v1:funnel:2026-10-24']]);
  assert.equal(result[0].totals.copy, 2); assert.equal(result[1].status, 'missing'); assert.equal(result[1].totals, null);
  assert.ok(!JSON.stringify(result).includes('arbitrary'));
  assert.throws(() => reader.options(['--days=41'])); assert.throws(() => reader.options(['--end=2026-02-30']));
  await assert.rejects(reader.readDays(opts, {}));
  await assert.rejects(reader.readDays(opts, { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_READ_ONLY_TOKEN: 'synthetic' }, async () => json({ error: 'synthetic' })));
  assert.throws(() => reader.decode('2026-10-25', ['copy|gift_dash|android|attached', 'bad']));
  assert.ok(!/readFile|dotenv|\.env\.local/.test(readFileSync('scripts/gift-funnel.js', 'utf8')));
});
