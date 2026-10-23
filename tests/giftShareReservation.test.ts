// 실제 클라이언트 + 서버 함수 + ISSUE_LUA 원문을 연결한다. 외부 통신·실제 Redis 없음.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createHash } from 'node:crypto';
import { createGiftPreparation } from '../src/lib/giftShare/client';
import { issueGift } from '../src/lib/giftShare/server';
import { memoryAtomic } from './_giftStateMemory';

const clock = Date.parse('2026-10-23T12:00:00+09:00');
const prefix = 'promo:pv:gift:v1';
const day = '2026-10-23';
const original = { title: 'SIGNUM HQ', text: '기존 설명', url: 'https://www.signumhq.com/ko/flow/NVDA' };
const json = (body: unknown) => new Response(JSON.stringify(body));
const hasGift = (p: { url: string }) => new URL(p.url).searchParams.has('gift');
beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (i: number) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://www.signumhq.com' } } });
});

async function world() {
  const { mockRedis } = await import('./_giftLuaMock.mjs');
  const redis = mockRedis();
  const store = { eval: (script: string, keys: string[], args: (string | number)[]) => redis.eval(script, keys.length, ...keys, ...args) };
  let requests = 0;
  let now = clock;
  const doc = (device: string, account?: string, ip = '같은-IP', transform: (r: Response) => Response | Promise<Response> = r => r,
    atomic = memoryAtomic().atomic) => {
    const request: typeof fetch = async (url, init) => {
      if (String(url).endsWith('share-config')) return json({ enabled: true, available: true, now });
      assert.equal(String(url), '/api/gift/reserve');
      requests++;
      const body = JSON.parse(String(init?.body));
      const result = await issueGift(store, { device, account, ip, app: true, token: body.token, sharedAt: body.at }, now);
      return transform(json({ ok: !!result }));
    };
    return createGiftPreparation(request, () => device, () => now, undefined, atomic);
  };
  return { redis, doc, requests: () => requests, advance: (ms: number) => { now += ms; } };
}

test('계정·IP·전체 한도 도달: 새 기기 한도가 남아도 선물 링크 0, 일반 공유만 반환', async () => {
  for (const [identity, cap] of [['account:같은-계정', 3], ['ip:같은-IP', 10], ['all', 400]] as const) {
    const w = await world();
    await w.redis.set(`${prefix}:issue:${day}:${identity}`, String(cap));
    const c = w.doc('새-기기', '같은-계정');
    await c.refresh('ios');
    assert.equal(c.payload(original, 'ko', 'ios'), original, identity);
    for (const lang of ['ko', 'en', 'ja']) {
      const fallback = c.payload(original, lang, 'ios', 'abc234defg', true);
      assert.equal(hasGift(fallback), false);
      assert.equal(fallback.text?.includes('1개월'), false);
    }
    assert.equal(w.requests(), 1);
    assert.equal(Number(await w.redis.get(`${prefix}:issue:${day}:${identity}`)), cap);
    assert.equal(await w.redis.exists(`${prefix}:issue:${day}:device:새-기기`), 0);
  }
});

test('예약 실패·HTTP 실패·응답 형식 불명·응답 유실: 서버 처리 여부와 무관하게 선물 링크 0', async () => {
  const responses = [
    () => json({ ok: false }), () => new Response('', { status: 503 }),
    () => json({}), () => json({ ok: 'true' }), () => json(null), () => new Response('invalid json'),
    () => { throw new Error('응답 유실'); },
  ];
  for (const response of responses) {
    const w = await world();
    const c = w.doc('기기', undefined, 'IP', response);
    await c.refresh('ios');
    assert.equal(c.payload(original, 'ko', 'ios'), original);
    assert.equal(hasGift(c.payload(original, 'ko', 'ios', null, true)), false);
    assert.equal(w.requests(), 1);
    assert.equal(Number(await w.redis.get(`${prefix}:issue:${day}:device:기기`)), 1, '서버 성공 응답을 잃은 몫은 반환하지 않음');
  }
});

test('예약 응답 대기 중 클릭은 일반 공유, 성공 응답 뒤에만 링크 발급 — 이미 서버 등록된 토큰', async () => {
  const w = await world();
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const c = w.doc('기기', undefined, 'IP', async r => { await gate; return r; });
  const pending = c.refresh('ios');
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
  assert.equal(w.requests(), 1);
  assert.equal(c.payload(original, 'ko', 'ios'), original);
  release(); await pending;
  const p = c.payload(original, 'ko', 'ios');
  assert.equal(hasGift(p), true);
  const token = new URL(p.url).searchParams.get('gift')!;
  assert.equal(await w.redis.exists(`${prefix}:token:${createHash('sha256').update(token).digest('hex')}`), 1);
  assert.equal(c.payload(original, 'ko', 'ios'), original, '같은 문서 중복 클릭은 일반 공유');
});

test('동시 탭·다른 기기: 계정·IP·전체 마지막 1몫에 동시 예약해도 성공 링크는 1개', async () => {
  for (const [identity, cap] of [['account:같은-계정', 3], ['ip:같은-IP', 10], ['all', 400]] as const) {
    const w = await world();
    await w.redis.set(`${prefix}:issue:${day}:${identity}`, String(cap - 1));
    const docs = Array.from({ length: 12 }, (_, i) => w.doc(`기기-${i}`, '같은-계정'));
    await Promise.all(docs.map(c => c.refresh('ios')));
    const links = docs.map(c => c.payload(original, 'ko', 'ios')).filter(hasGift);
    assert.equal(links.length, 1, identity);
    assert.equal(Number(await w.redis.get(`${prefix}:issue:${day}:${identity}`)), cap);
    assert.equal(w.requests(), 12);
  }
});

test('같은 기기 여러 탭의 동시 예약: 기기 장부와 서버 모두 앱 3몫만 확보', async () => {
  const w = await world();
  const mem = memoryAtomic();
  const docs = Array.from({ length: 9 }, () => w.doc('같은-기기', undefined, 'IP', r => r, mem.atomic));
  await Promise.all(docs.map(c => c.refresh('ios')));
  assert.equal(docs.map(c => c.payload(original, 'ko', 'ios')).filter(hasGift).length, 3);
  assert.equal(w.requests(), 3);
  assert.equal(Number(await w.redis.get(`${prefix}:issue:${day}:device:같은-기기`)), 3);
});

test('예약 응답 유실 뒤 재진입: 저장한 같은 토큰을 서버에서 재확인하므로 한도 추가 차감 없음', async () => {
  const w = await world();
  const mem = memoryAtomic();
  const lost = w.doc('기기', undefined, 'IP', () => { throw new Error('응답 유실'); }, mem.atomic);
  await lost.refresh('ios');
  assert.equal(lost.payload(original, 'ko', 'ios'), original);
  const reopened = w.doc('기기', undefined, 'IP', r => r, mem.atomic);
  await reopened.refresh('ios');
  assert.equal(hasGift(reopened.payload(original, 'ko', 'ios')), true);
  assert.equal(w.requests(), 2);
  assert.equal(Number(await w.redis.get(`${prefix}:issue:${day}:device:기기`)), 1);
});

test('미발급 예약 만료 뒤 동시 탭 복원: 같은 서버 몫 재사용·사용권은 한 탭에만, 이전 탭은 발급 불가', async () => {
  const w = await world();
  const mem = memoryAtomic();
  const first = w.doc('기기', undefined, 'IP', r => r, mem.atomic);
  await first.refresh('ios');
  w.advance(4 * 60_000);
  const docs = Array.from({ length: 9 }, () => w.doc('기기', undefined, 'IP', r => r, mem.atomic));
  await Promise.all(docs.map(c => c.refresh('ios')));
  assert.equal(first.payload(original, 'ko', 'ios'), original, '이전 사용권 기한 만료');
  assert.equal(docs.map(c => c.payload(original, 'ko', 'ios')).filter(hasGift).length, 3);
  await first.refresh('ios');
  assert.equal(first.payload(original, 'ko', 'ios'), original, '복귀해도 다른 탭 사용권을 연장하거나 탈취하지 않음');
  assert.equal(Number(await w.redis.get(`${prefix}:issue:${day}:device:기기`)), 3, '기존 1몫 재사용 + 새 2몫');
});

test('예약 응답이 사용권 만료 뒤 도착해도 다른 탭이 복원한 예약을 풀거나 발급하지 않음', async () => {
  const w = await world();
  const mem = memoryAtomic();
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const first = w.doc('기기', undefined, 'IP', async r => { await gate; return r; }, mem.atomic);
  const pending = first.refresh('ios');
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
  assert.equal(w.requests(), 1);
  w.advance(4 * 60_000);
  const other = w.doc('기기', undefined, 'IP', r => r, mem.atomic);
  await other.refresh('ios');
  release(); await pending;
  assert.equal(first.payload(original, 'ko', 'ios'), original);
  assert.equal(hasGift(other.payload(original, 'ko', 'ios')), true);
  assert.equal(Number(await w.redis.get(`${prefix}:issue:${day}:device:기기`)), 1);
});
