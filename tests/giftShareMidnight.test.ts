// 실행: npx tsx --test tests/giftShareMidnight.test.ts
/**
 * 공유=선물 자정 경계 시험 — 실제 기기 쪽(createGiftPreparation)·서버 등록 함수(issueGift)·등록 Lua 원문(ISSUE_LUA)을
 * 메모리 Redis 모의(tests/_giftLuaMock.mjs, Lua 원문 해석·EVAL 직렬)로 잇고 가짜 시계로 돌린다. 외부 접속 0.
 *
 * 설계(10/22 5차): 등록 한도는 «공유 완료 시각(at)»의 KST 날짜로 센다. 기기는 그날 보낸 링크 수로 막고, 서버는 같은 at 날짜로 센다.
 * 따라서 등록·재시도·응답이 언제(자정 뒤) 처리돼도 «보낸 선물 링크가 서버에서 거부되는 일»은 0 이어야 한다 — 이 파일의 핵심 불변식.
 * 관문 회귀: 10220544(자정 뒤 재시도 한도) · 10220553①(23:59:59 공유·00:00:01 처리) · 10220559(재시도 반복문 시각) ·
 *            10220607(마지막 재시도가 자정을 넘기는 동안 새 공유).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { beforeEach, test } from 'node:test';
import { createGiftPreparation } from '../src/lib/giftShare/client';
import { issueGift } from '../src/lib/giftShare/server';
import { GIFT_SHARE_WINDOW_MS } from '../src/lib/giftShare/config';
import { idbAtomic } from '../src/lib/giftShare/state';
import { fakeIndexedDB, memoryAtomic } from './_giftStateMemory';

process.env.VERCEL_ENV = 'preview';
globalThis.fetch = (async () => { throw new Error('시험 중 외부 접근 금지'); }) as typeof fetch;

let values = new Map<string, string>();
function resetStorage() {
  values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    get length() { return values.size; },
    key: (i: number) => [...values.keys()][i] ?? null,
  } });
}
/** 저장 장애 주입 뒤 같은 값으로 저장소를 되살린다(표식은 이미 못 남긴 상태). */
function resetStorageKeepValues() {
  const keep = values; resetStorage(); values = keep;
}
beforeEach(() => {
  resetStorage();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://www.signumhq.com' } } });
});

const json = (body: unknown) => new Response(JSON.stringify(body));
const settle = async () => { for (let i = 0; i < 120; i++) await new Promise(r => setImmediate(r)); };
const original = { title: 'SIGNUM HQ', text: '기존 종목 설명', url: 'https://www.signumhq.com/ko/flow/NVDA?from=share&via=ios' };
const giftOf = (p: { url: string }) => new URL(p.url).searchParams.get('gift');
const kst = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
/** KST 벽시계 → epoch ms */
const at = (kstWall: string) => Date.parse(`${kstWall}+09:00`);
const P = 'promo:pv:gift:v1';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const MIN = 60_000;

type Mode = 'ok' | 'down' | 'lose';
/**
 * 기기 1대 + 실제 서버 함수 + Lua 모의. 네트워크: ok · down(서버 미도달) · lose(서버는 처리, 응답 유실).
 * latency 만큼 서버 처리 시각이 늦어진다(자정 넘김 재현). hold 를 걸면 서버 처리 직전에 멈춰 «진행 중» 요청을 만든다.
 */
async function world(start: number, opts: { via?: 'ios' | 'android' | 'web'; account?: string; available?: () => boolean } = {}) {
  const { mockRedis } = await import('./_giftLuaMock.mjs');
  const redis = mockRedis();
  const store = { eval: (script: string, keys: string[], args: (string | number)[]) => redis.eval(script, keys.length, ...keys, ...args) };
  const w = {
    clock: start,
    via: opts.via ?? 'ios',
    modes: [] as Mode[], // 등록 요청마다 하나씩 소비, 비면 ok
    latency: 0,
    hold: null as null | Promise<void>,
    serverNow: null as null | (() => number),
    posts: [] as { token: string; at: number; status: string; mode: Mode }[],
    sent: [] as string[], // 실제로 공유된 선물 토큰
    redis,
  };
  const request: typeof fetch = async (url, init) => {
    if (String(url).endsWith('share-config')) {
      return json({ enabled: true, available: opts.available ? opts.available() : true, now: w.serverNow ? w.serverNow() : w.clock });
    }
    const body = JSON.parse(String(init?.body));
    const mode = w.modes.shift() ?? 'ok';
    if (mode === 'down') { w.posts.push({ token: body.token, at: body.at, status: 'unreached', mode }); throw new Error('미도달'); }
    if (w.hold) { const h = w.hold; w.hold = null; await h; } // 첫 요청 하나만 붙잡는다
    w.clock += w.latency;
    const device = (init?.headers as any)?.['x-gift-device'] ?? 'web-cookie';
    const r = await issueGift(store, { device, account: opts.account, ip: 'ip-hash', app: device !== 'web-cookie', token: body.token, sharedAt: body.at }, w.clock);
    w.posts.push({ token: body.token, at: body.at, status: r?.status ?? 'REJECTED', mode });
    if (mode === 'lose') throw new Error('응답 유실');
    return json(r ? { ok: true } : { ok: false, url: 'https://apps.apple.com/app/x' });
  };
  const device = 'a1'.repeat(32);
  const mem = memoryAtomic(); // 이 기기(출처)의 장부 — 모든 문서가 함께 쓴다
  const doc = () => createGiftPreparation(request, () => device, () => w.clock, undefined, mem.atomic);
  const client = doc();
  await client.refresh(w.via);
  /** 한 번 공유를 시도한다. 선물 링크가 붙으면 그 토큰을 돌려준다. */
  const share = async (c = client, outcome: 'shared' | 'copied' | 'failed' | 'cancelled' = 'shared') => {
    const p = c.payload(original, 'ko', w.via);
    const t = giftOf(p);
    c.complete(outcome, p, w.via);
    if (t && outcome !== 'cancelled') w.sent.push(t);
    await settle();
    return t;
  };
  const registered = async (t: string) => (await redis.exists(`${P}:token:${digest(t)}`)) === 1;
  const count = async (kind: string, id: string, day: string) => Number(await redis.get(`${P}:issue:${day}:${kind}:${id}`) ?? 0);
  return { w, client, doc, share, registered, count, device, mem };
}
/** 핵심 불변식: 서버가 거부한 등록 0, 보낸 링크는 전부 서버에 등록됨. */
async function assertNoBrokenLinks(x: Awaited<ReturnType<typeof world>>, label: string) {
  assert.equal(x.w.posts.filter(p => p.status === 'REJECTED').length, 0, `${label}: 거부된 등록 0`);
  for (const t of x.w.sent) assert.ok(await x.registered(t), `${label}: 보낸 링크는 모두 등록됨`);
}

test('자정 직전·직후 경계: 23:59:59 공유가 00:00:01 에 처리돼도 공유한 날 한도로 셈 — 새날 3건 모두 등록, 4번째는 일반 공유', async () => {
  for (const before of [1, 2, 3]) {
    resetStorage();
    const x = await world(at('2026-10-22T23:59:58'), { account: '계정' });
    for (let i = 0; i < before; i++) {
      x.w.clock = at('2026-10-22T23:59:59') - (before - 1 - i) * 300;
      x.w.latency = i === before - 1 ? 2000 : 0; // 마지막 공유(23:59:59)의 등록은 00:00:01 에 처리
      assert.ok(await x.share(), `전날 ${i + 1}번째`);
    }
    assert.ok(x.w.clock > at('2026-10-23T00:00:00'), '마지막 등록은 자정 뒤 처리');
    x.w.latency = 0;
    await x.client.refresh(x.w.via);
    let fresh = 0;
    for (let i = 0; i < 4; i++) if (await x.share()) fresh++;
    assert.equal(fresh, 3, `전날 ${before}건과 무관하게 새날 3건`);
    assert.equal(await x.count('device', x.device, '2026-10-22'), before);
    assert.equal(await x.count('device', x.device, '2026-10-23'), 3);
    assert.equal(await x.count('account', '계정', '2026-10-23'), 3, '계정 한도도 같은 날짜로 센다');
    await assertNoBrokenLinks(x, `전날 ${before}건`);
  }
});

test('관문 회귀(10220553①): 23:59:59 공유의 첫 등록 응답이 유실되고 자정 뒤 재시도돼도 exists 로 끝나며 새날 3건 모두 등록', async () => {
  for (const mode of ['lose', 'down'] as const) {
    resetStorage();
    const x = await world(at('2026-10-22T23:59:59'));
    x.w.latency = 2000; x.w.modes = [mode];
    assert.ok(await x.share());
    x.w.latency = 0; x.w.clock = at('2026-10-23T00:06:00');
    await x.client.refresh(x.w.via); // 재시도
    let fresh = 0;
    for (let i = 0; i < 4; i++) if (await x.share()) fresh++;
    assert.equal(fresh, 3, mode);
    assert.equal(await x.count('device', x.device, '2026-10-22'), 1, `${mode}: 23:59:59 공유는 전날로`);
    assert.equal(await x.count('device', x.device, '2026-10-23'), 3, mode);
    assert.equal(x.w.posts.filter(p => p.at === x.w.posts[0].at).every(p => p.at < at('2026-10-23T00:00:00')), true, '재시도도 같은 공유 시각');
    await assertNoBrokenLinks(x, mode);
  }
});

test('관문 회귀(10220544): 전날 미등록 3건이 자정 뒤 00:04 재시도돼도 오늘 새 선물 3건 모두 등록', async () => {
  for (const pending of [1, 3]) {
    resetStorage();
    const x = await world(at('2026-10-22T23:58:00'));
    x.w.modes = Array(pending).fill('down');
    for (let i = 0; i < pending; i++) assert.ok(await x.share());
    x.w.clock = at('2026-10-23T00:04:00');
    const next = x.doc(); await next.refresh(x.w.via); // 재진입 → 재시도 먼저
    let fresh = 0;
    for (let i = 0; i < 4; i++) if (await x.share(next)) fresh++;
    assert.equal(fresh, 3, `미등록 ${pending}건이어도 오늘 3건`);
    assert.equal(await x.count('device', x.device, '2026-10-22'), pending);
    await assertNoBrokenLinks(x, `미등록 ${pending}`);
  }
});

test('관문 회귀(10220559): 전날 미등록 3건을 다음 날 23:59:59 재진입에서 재시도하다 자정을 넘겨도 거부 0', async () => {
  const x = await world(at('2026-10-21T23:58:00'));
  x.w.modes = ['down', 'down', 'down'];
  for (let i = 0; i < 3; i++) await x.share();
  x.w.clock = at('2026-10-22T23:59:59'); x.w.latency = 1000; // 재시도마다 1초 — 둘째부터 자정 이후 처리
  const b = x.doc(); await b.refresh(x.w.via);
  assert.ok(x.w.clock >= at('2026-10-23T00:00:00'));
  let fresh = 0;
  for (let i = 0; i < 4; i++) if (await x.share(b)) fresh++;
  assert.equal(fresh, 3, '자정 뒤 새날 3건');
  assert.equal(await x.count('device', x.device, '2026-10-21'), 3, '재시도는 공유한 10/21 한도로');
  assert.equal(await x.count('device', x.device, '2026-10-23'), 3);
  await assertNoBrokenLinks(x, '10220559');
});

test('관문 회귀(10220607)·재시도 5회: 마지막 재시도가 자정을 넘기며 진행 중일 때 새 공유 3건 — 모두 등록, 토큰당 등록 요청 ≤5', async () => {
  const x = await world(at('2026-10-22T23:39:59'));
  x.w.modes = Array(12).fill('down'); // 3건 × (공유 1 + 재시도 3) 실패
  for (let i = 0; i < 3; i++) assert.ok(await x.share());
  for (const wall of ['23:44:59', '23:49:59', '23:54:59']) { x.w.clock = at(`2026-10-22T${wall}`); await x.client.refresh(x.w.via); }
  assert.equal(x.w.posts.length, 12);
  // 다섯 번째(마지막) 재시도: 23:59:59 출발, 서버에서 자정 뒤 처리 — 응답이 오기 전에 새 공유
  x.w.clock = at('2026-10-22T23:59:59'); x.w.latency = 2000;
  let release!: () => void; x.w.hold = new Promise<void>(r => { release = r; });
  const held = x.w.hold;
  const inflight = x.client.refresh(x.w.via);
  await settle();
  x.w.clock = at('2026-10-23T00:00:01');
  const other = x.doc(); // 다른 문서에서 공유(설정 확인은 진행 중 요청과 무관)
  await other.refresh(x.w.via).catch(() => {});
  const got: (string | null)[] = [];
  for (let i = 0; i < 4; i++) got.push(await x.share(other)); // 마지막 재시도 응답이 오기 전에 차례로 공유
  release(); await held;
  await inflight; await settle();
  assert.equal(got.filter(Boolean).length, 3, '새날 3건(4번째 일반 공유)');
  const perToken = new Map<string, number>();
  for (const p of x.w.posts) perToken.set(p.token, (perToken.get(p.token) ?? 0) + 1);
  for (const n of perToken.values()) assert.ok(n <= 5, '토큰당 최대 5회');
  // 다섯 번 모두 실패한 토큰은 더 보내지 않는다
  x.w.clock += 60 * MIN; await x.client.refresh(x.w.via);
  for (const [t, n] of perToken) assert.equal(x.w.posts.filter(p => p.token === t).length, n);
  assert.equal(await x.count('device', x.device, '2026-10-22'), 3);
  assert.equal(await x.count('device', x.device, '2026-10-23'), 3);
  await assertNoBrokenLinks(x, '10220607');
});

test('재시도 5회 한도·47시간 기한: 계속 미도달이면 정확히 5회, 기한 지난 토큰은 재시도하지 않음(서버 48시간 범위 안)', async () => {
  const x = await world(at('2026-10-22T23:50:00'));
  x.w.modes = Array(20).fill('down');
  await x.share();
  for (let i = 0; i < 10; i++) { x.w.clock += 5 * MIN; await x.client.refresh(x.w.via); }
  assert.equal(x.w.posts.length, 5);
  // 기한: 공유 1회 실패 뒤 46시간 59분엔 재시도, 47시간 뒤엔 하지 않는다
  resetStorage();
  const y = await world(at('2026-10-22T12:00:00'));
  y.w.modes = ['down'];
  const t = await y.share();
  y.w.clock += 47 * 60 * MIN - MIN; y.w.modes = ['down']; await y.client.refresh(y.w.via);
  assert.equal(y.w.posts.length, 2);
  y.w.clock += 5 * MIN; await y.client.refresh(y.w.via);
  assert.equal(y.w.posts.length, 2, '47시간 뒤 재시도 0');
  assert.equal(y.mem.state.sent.length, 0, '기한 지난 장부 정리');
  assert.ok(47 * 3_600_000 < GIFT_SHARE_WINDOW_MS && t);
});

test('재고 0: 선물 링크 0·등록 요청 0 · 이미 보낸 링크의 재시도는 계속(재고와 무관)', async () => {
  let stock = false;
  const x = await world(at('2026-10-22T23:59:00'), { available: () => stock });
  for (let i = 0; i < 3; i++) assert.equal(await x.share(), null);
  assert.equal(x.w.posts.length, 0);
  stock = true; x.w.modes = ['down']; await x.client.refresh(x.w.via);
  assert.ok(await x.share());
  stock = false; x.w.clock = at('2026-10-23T00:05:00'); await x.client.refresh(x.w.via);
  assert.equal(await x.share(), null);
  assert.equal(x.w.posts.length, 2, '재고 0 이어도 보낸 링크 재등록은 한다');
  await assertNoBrokenLinks(x, '재고 0');
});

test('기기 일일 한도 경계(앱 3·웹 1): 23:59:59.999 까지는 전날 한도, 00:00:00.000 부터 새 한도 — 거부 0', async () => {
  for (const via of ['ios', 'android', 'web'] as const) {
    resetStorage();
    const cap = via === 'web' ? 1 : 3;
    const x = await world(at('2026-10-22T23:59:59') , { via });
    let n = 0;
    for (let i = 0; i < cap + 2; i++) if (await x.share()) n++;
    assert.equal(n, cap, via);
    x.w.clock = at('2026-10-22T23:59:59') + 999; await x.client.refresh(via);
    assert.equal(await x.share(), null, `${via}: 23:59:59.999 은 전날`);
    x.w.clock = at('2026-10-23T00:00:00'); await x.client.refresh(via);
    n = 0;
    for (let i = 0; i < cap + 2; i++) if (await x.share()) n++;
    assert.equal(n, cap, `${via}: 자정 정각부터 새 한도`);
    await assertNoBrokenLinks(x, via);
  }
});

test('기기 시계 어긋남: 서버와 5분 넘게 다르면 선물 링크 없음(서버 시각 검사에 걸릴 링크 0), 4분이면 등록 성공', async () => {
  for (const [skew, expect] of [[6 * MIN, false], [-6 * MIN, false], [4 * MIN, true], [-4 * MIN, true]] as const) {
    resetStorage();
    const x = await world(at('2026-10-22T23:58:00'));
    const real = () => x.w.clock + skew; // 서버 시각
    x.w.serverNow = real;
    await x.client.refresh(x.w.via);
    const t = await x.share();
    assert.equal(!!t, expect, `시계 차 ${skew / MIN}분`);
    await assertNoBrokenLinks(x, `시계 차 ${skew / MIN}분`);
  }
});

test('서버 등록: 공유 시각 날짜로 기기·계정·IP·전체 키를 세고, 48시간 넘게 지난·10분 넘게 앞선 시각은 거부, 한도 키는 4일 보관', async () => {
  const calls: { keys: string[]; args: unknown[]; script: string }[] = [];
  const cap = { eval: async (script: string, keys: string[], args: unknown[]) => { calls.push({ script, keys, args }); return 'issued'; } };
  const now = at('2026-10-23T00:00:01');
  const tok = 'A'.repeat(43);
  const input = (sharedAt: unknown) => ({ device: '기기', account: '계정', ip: '아이피', app: true, token: tok, sharedAt });
  assert.deepEqual(await issueGift(cap, input(at('2026-10-22T23:59:59')), now), { status: 'issued' });
  assert.deepEqual(calls[0].keys.slice(1), ['device:기기', 'account:계정', 'ip:아이피', 'all'].map(k => `${P}:issue:2026-10-22:${k.replace(/^all$/, 'all')}`));
  assert.match(calls[0].script, /'EXPIRE',KEYS\[i\],345600/);
  for (const bad of [undefined, null, '1761145199000', 1.5, NaN, now - GIFT_SHARE_WINDOW_MS - 1, now + 10 * MIN + 1]) {
    assert.equal(await issueGift(cap, input(bad), now), null, String(bad));
  }
  assert.equal(calls.length, 1, '범위 밖 시각은 저장소 무호출');
  assert.deepEqual(await issueGift(cap, input(now - GIFT_SHARE_WINDOW_MS), now), { status: 'issued' });
  assert.deepEqual(await issueGift(cap, input(now + 10 * MIN), now), { status: 'issued' });
  assert.equal(kst(now - GIFT_SHARE_WINDOW_MS), '2026-10-21');
});

test('무작위 300회: 자정 앞뒤 3일·지연·미도달·응답 유실·취소·실패·재진입을 섞어도 거부된 등록 0, 날짜별 서버 셈 ≤ 한도', async () => {
  let seed = 20261022;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  let sentTotal = 0;
  for (let run = 0; run < 300; run++) {
    resetStorage();
    const via = pick(['ios', 'android', 'web'] as const);
    const x = await world(at('2026-10-21T23:30:00') + Math.floor(rnd() * 60) * MIN, { via, account: rnd() < 0.5 ? '계정' : undefined });
    let doc = x.client;
    const steps = 25 + Math.floor(rnd() * 15);
    for (let s = 0; s < steps; s++) {
      const r = rnd();
      x.w.latency = Math.floor(rnd() * 4000);
      x.w.modes = Array.from({ length: 3 }, () => (rnd() < 0.25 ? pick(['down', 'lose'] as const) : 'ok'));
      if (r < 0.5) await x.share(doc, pick(['shared', 'shared', 'copied', 'failed', 'cancelled'] as const));
      else if (r < 0.7) await doc.refresh(via);
      else if (r < 0.8) { doc = x.doc(); await doc.refresh(via); }
      else {
        // 자정 근처로 자주 점프
        const nearMidnight = rnd() < 0.5;
        if (nearMidnight) {
          const nextMid = at(`${kst(x.w.clock + 24 * 3_600_000)}T00:00:00`);
          x.w.clock = Math.max(x.w.clock, nextMid - Math.floor(rnd() * 3000));
        } else x.w.clock += Math.floor(rnd() * 120) * MIN;
        await doc.refresh(via);
      }
    }
    // 네트워크 복구 뒤 재시도로 정리(5분 간격)
    x.w.modes = []; x.w.latency = 0;
    for (let i = 0; i < 6; i++) { x.w.clock += 5 * MIN; await x.doc().refresh(via); }
    assert.equal(x.w.posts.filter(p => p.status === 'REJECTED').length, 0, `run ${run}: 거부된 등록 0`);
    const cap = via === 'web' ? 1 : 3;
    const days = new Set(x.w.posts.map(p => kst(p.at)));
    for (const d of days) assert.ok(await x.count('device', via === 'web' ? 'web-cookie' : x.device, d) <= cap, `run ${run}: ${d} 셈 ≤ ${cap}`);
    // 보낸 링크는 등록됐거나, 5회 모두 네트워크 실패였다
    for (const t of x.w.sent) {
      const tries = x.w.posts.filter(p => p.token === t);
      if (!(await x.registered(t))) assert.ok(tries.length >= 1 && tries.length <= 5 && tries.every(p => p.status === 'unreached'), `run ${run}: 미등록은 서버 미도달뿐`);
    }
    sentTotal += x.w.sent.length;
  }
  assert.ok(sentTotal > 300, `선물 링크 ${sentTotal}건 검사`);
});

test('동시 공유 시트(여러 문서·탭): 완료 전 시트에 실린 링크도 한도에 잡혀 거부 링크 0 · 취소하면 풀리고 · 닫힘 통지 없으면 30분 뒤 풀림', async () => {
  for (const via of ['web', 'ios'] as const) {
    resetStorage();
    const cap = via === 'web' ? 1 : 3;
    const x = await world(at('2026-10-22T23:59:58'), { via });
    const docs = [x.client];
    for (let i = 0; i < cap + 1; i++) { const d = x.doc(); await d.refresh(via); docs.push(d); }
    // 모든 문서가 먼저 시트를 띄우고(완료 전), 그 뒤에 자정을 넘겨 하나씩 완료
    const open = docs.map(d => ({ d, p: d.payload(original, 'ko', via) }));
    assert.equal(open.filter(o => giftOf(o.p)).length, cap, `${via}: 동시에 띄운 시트 중 선물 링크는 한도만큼`);
    x.w.clock = at('2026-10-23T00:00:01');
    for (const o of open) { o.d.complete('shared', o.p, via); if (giftOf(o.p)) x.w.sent.push(giftOf(o.p)!); }
    await settle();
    await assertNoBrokenLinks(x, `동시 시트 ${via}`);
    assert.equal(await x.count('device', via === 'web' ? 'web-cookie' : x.device, '2026-10-23'), cap);
  }
  // 취소: 그 문서가 같은 토큰을 다시 쓸 수 있게 몫을 유지 · 문서가 사라지면(연장 없음) 30분 뒤 다른 탭이 가져간다
  resetStorage();
  const y = await world(at('2026-10-22T12:00:00'), { via: 'web' });
  const p1 = y.client.payload(original, 'ko', 'web'); assert.ok(giftOf(p1));
  const other = y.doc(); await other.refresh('web');
  assert.equal(giftOf(other.payload(original, 'ko', 'web')), null, '다른 탭은 일반 공유');
  y.client.complete('cancelled', p1, 'web'); await settle();
  assert.equal(giftOf(y.client.payload(original, 'ko', 'web')), giftOf(p1), '취소 뒤 다시 누르면 같은 토큰');
  y.w.clock += 30 * MIN + 1; await other.refresh('web');
  assert.ok(giftOf(other.payload(original, 'ko', 'web')), '연장 없는 몫은 30분 뒤 풀려 다른 탭이 준비');
  assert.equal(y.w.posts.length, 0, '시트만 띄우고 보내지 않으면 등록 0');
});

test('관문 회귀(10222309①): 같은 문서의 두 단추가 완료 전에 연달아 눌려도 같은 토큰을 두 번 내주지 않는다', async () => {
  const x = await world(at('2026-10-22T10:00:00'));
  const a = x.client.payload(original, 'ko', 'ios');
  const b = x.client.payload(original, 'en', 'ios');
  assert.ok(giftOf(a)); assert.equal(giftOf(b), null, '두 번째 단추는 새 준비 전까지 일반 공유');
  x.client.complete('shared', a, 'ios'); x.client.complete('shared', b, 'ios'); x.w.sent.push(giftOf(a)!);
  await settle();
  const c = x.client.payload(original, 'ko', 'ios');
  assert.ok(giftOf(c)); assert.notEqual(giftOf(c), giftOf(a), '완료 뒤엔 새 토큰');
  x.client.complete('copied', c, 'ios'); x.w.sent.push(giftOf(c)!); await settle();
  assert.equal(new Set(x.w.posts.map(p => p.token)).size, 2);
  await assertNoBrokenLinks(x, '10222309①');
});

test('관문 회귀(10222309②): 여러 탭이 동시에 준비해도 한도 검사·예약이 한 트랜잭션 — 웹 1·앱 3을 넘는 선물 링크 0', async () => {
  for (const via of ['web', 'ios'] as const) {
    resetStorage();
    const cap = via === 'web' ? 1 : 3;
    const x = await world(at('2026-10-22T23:59:59'), { via });
    const tabs = Array.from({ length: 8 }, () => x.doc());
    await Promise.all(tabs.map(t => t.refresh(via))); // 동시 준비(장부 호출이 교차)
    const links = [x.client, ...tabs].map(t => ({ t, p: t.payload(original, 'ko', via) })).filter(o => giftOf(o.p));
    assert.equal(links.length, cap, `${via}: 동시 준비 9개 문서 중 선물 링크 ${cap}개`);
    x.w.clock = at('2026-10-23T00:00:02');
    for (const o of links) { o.t.complete('shared', o.p, via); x.w.sent.push(giftOf(o.p)!); }
    await settle();
    await assertNoBrokenLinks(x, `10222309② ${via}`);
  }
});

test('기본 장부(idbAtomic): IndexedDB 트랜잭션으로 동시 예약을 직렬화 — 탭 9개 동시 준비에도 한도만큼만, 장애면 일반 공유', async () => {
  const idb = fakeIndexedDB();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: idb.factory });
  try {
    for (const via of ['web', 'android'] as const) {
      idb.reset();
      const cap = via === 'web' ? 1 : 3;
      let clock = at('2026-10-22T23:59:59');
      const issued: string[] = [];
      const request: typeof fetch = async (url, init) => {
        if (String(url).endsWith('share-config')) return json({ enabled: true, available: true, now: clock });
        issued.push(JSON.parse(String(init?.body)).token); return json({ ok: true });
      };
      const tabs = Array.from({ length: 9 }, () => createGiftPreparation(request, () => 'b2'.repeat(32), () => clock, undefined, idbAtomic));
      await Promise.all(tabs.map(t => t.refresh(via)));
      const opened = tabs.map(t => ({ t, p: t.payload(original, 'ko', via) })).filter(o => giftOf(o.p));
      assert.equal(opened.length, cap, via);
      assert.equal(idb.stats.maxConcurrent, 1, '트랜잭션 직렬');
      for (const o of opened) o.t.complete('shared', o.p, via);
      await settle();
      const saved = idb.data.get('state.v1') as any;
      assert.equal(saved.days['2026-10-22'], cap, '보낸 수가 그날 셈으로');
      assert.equal(saved.holds.length, 0, '보낸 몫은 잡음에서 빠짐');
      assert.equal(issued.length, cap);
      clock = at('2026-10-23T00:00:00');
      await Promise.all(tabs.map(t => t.refresh(via)));
      assert.equal(tabs.map(t => t.payload(original, 'ko', via)).filter(p => giftOf(p)).length, cap, '자정 뒤 새 한도');
    }
    // IndexedDB 없음 → 일반 공유
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    const none = createGiftPreparation(async () => json({ enabled: true, available: true, now: Date.now() }), () => 'b3'.repeat(32), Date.now, undefined, idbAtomic);
    await none.refresh('ios');
    assert.equal(none.payload(original, 'ko', 'ios'), original);
  } finally { delete (globalThis as any).indexedDB; }
});

test('관문 회귀(10222323): 완료 기록 트랜잭션이 실패해도(표식으로 다음 트랜잭션에서 합침) 같은 날 한도 초과 선물 링크 0', async () => {
  // 공유 1번 = payload 연장(호출 n+1) · 완료 기록(호출 n+2). 완료 기록만 실패시킨다.
  const failRecord = (x: Awaited<ReturnType<typeof world>>) => x.mem.failCalls.add(x.mem.calls + 2);
  for (const via of ['web', 'ios'] as const) for (const after of ['same', 'reload', 'noMarker'] as const) {
    resetStorage();
    const cap = via === 'web' ? 1 : 3;
    const x = await world(at('2026-10-22T09:00:00'), { via, account: '계정' });
    let doc = x.client;
    for (let i = 0; i < cap; i++) {
      if (i === cap - 1) {
        failRecord(x);
        if (after === 'noMarker') (localStorage as any).setItem = () => { throw new Error('표식 저장 장애'); };
      }
      assert.ok(await x.share(doc), `${via}/${after}: ${i + 1}번째`);
    }
    if (after === 'noMarker') resetStorageKeepValues();
    x.w.clock += 31 * MIN;
    if (after === 'reload') { doc = x.doc(); }
    await doc.refresh(via);
    assert.equal(await x.share(doc), null, `${via}/${after}: 그날 한도 다 씀 → 일반 공유`);
    const other = x.doc(); await other.refresh(via);
    if (after !== 'noMarker') assert.equal(await x.share(other), null, `${via}/${after}: 다른 문서도 일반 공유`);
    assert.equal(x.mem.state.days['2026-10-22'], cap, `${via}/${after}: 실패한 기록도 한 번만 반영`);
    await assertNoBrokenLinks(x, `10222323 ${via}/${after}`);
    // 다음 날은 정상
    x.w.clock = at('2026-10-23T09:00:00'); await doc.refresh(via);
    assert.ok(await x.share(doc), `${via}/${after}: 다음 날 선물`);
    await assertNoBrokenLinks(x, `10222323 ${via}/${after} 다음 날`);
  }
});

test('완료 기록 표식은 여러 문서가 동시에 합쳐도 한 번만 센다(counted)', async () => {
  const x = await world(at('2026-10-22T09:00:00'));
  x.mem.failCalls.add(x.mem.calls + 2);
  assert.ok(await x.share());
  const docs = Array.from({ length: 5 }, () => x.doc());
  await Promise.all(docs.map(d => d.refresh('ios')));
  await settle();
  assert.equal(x.mem.state.days['2026-10-22'], 1);
  assert.equal([...values.keys()].filter(k => k.startsWith('signumhq.gift.pending.v1.')).length, 0, '합친 표식은 지운다');
  await assertNoBrokenLinks(x, '표식 중복 합치기');
});
