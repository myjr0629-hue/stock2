// 실행: node --test tests/giftCampaignLua.test.mjs   (npx tsx --test tests/giftCampaignLua.test.mjs 도 같다)
/**
 * 공개 캠페인 Lua(src/lib/giftShare/atomic.cjs CAMPAIGN_LUA) 시험 — 선물 Lua 시험과 같은 순수 JS 모의(Lua 원문 해석·EVAL 직렬)로 돌린다.
 *  · 배정·재방문 같은 코드·다른 기기 새 코드·하루/전체/IP 상한·재고 0·선물 몫(reserve)·스위치·마감·OS/계정 규칙
 *  · ★선물 CLAIM_LUA 와 같은 재고를 동시에 꺼내도 이중 배정 0 · 선물·캠페인 합쳐 기기당 1장
 *  + 대조군: 비원자 실행이면 동시성 시나리오가 실패한다(시험이 결함을 실제로 잡는다).
 * 외부 주소·운영 접속 없음.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mockRedis } from './_giftLuaMock.mjs';

const require = createRequire(import.meta.url);
const { CAMPAIGN_LUA, CLAIM_LUA, LOAD_LUA } = require('../src/lib/giftShare/atomic.cjs');
const { GIFT_CAMPAIGNS } = require('../src/lib/giftShare/campaigns.cjs');

const p = 'promo:pv:gift:v1';
const now = Date.parse('2026-11-01T03:00:00Z');
const day = '2026-11-01';
const random = () => randomBytes(32).toString('hex');
const codeOf = os => randomBytes(16).toString('hex').slice(0, os === 'ios' ? 18 : 23).toUpperCase();
const digest = s => createHash('sha256').update(s).digest('hex');
const run = (redis, script, keys, args) => redis.eval(script, keys.length, ...keys, ...args);
const hash = async (redis, key) => { const r = await redis.hgetall(key); return Array.isArray(r) ? Object.fromEntries(Array.from({ length: r.length / 2 }, (_, i) => [r[2 * i], r[2 * i + 1]])) : r; };

const C = { id: 'test-camp', day: { ios: 40, android: 20 }, total: { ios: 600, android: 300 }, reserve: { ios: 0, android: 0 }, ipDay: 1000, endsAt: now + 86400_000 };
async function load(redis, os, count, end = now + 30 * 86400_000, batch = random()) {
  const codes = Array.from({ length: count }, () => codeOf(os));
  const keys = [`${p}:batch:${batch}`, `${p}:batches:${os}`, `${p}:pool:${os}:${batch}`, `${p}:loaded`, 'old:play', 'old:ios', 'old:claims'];
  assert.equal(await run(redis, LOAD_LUA, keys, [JSON.stringify({ os, expiresAt: end }), end, batch, ...codes]), 'loaded');
  return { codes, pool: keys[2] };
}
const on = (redis, c = C) => redis.set(`${p}:camp:${c.id}:on`, '1');
function camp(redis, { device = random(), os = 'ios', account = '', ip = 'ip1', from = 'clien', at = now, d = day, c = C } = {}) {
  const k = `${p}:camp:${c.id}`;
  const keys = [`${k}:on`, `${p}:batches:${os}`, `${k}:day:${d}:${os}`, `${k}:total:${os}`, `${k}:ip:${d}:${ip}`, `${p}:ledger`, `${k}:from:${d}`,
    `${k}:device:${device}`, `${p}:recipient:device:${device}`, ...(account ? [`${k}:account:${account}`, `${p}:recipient:account:${account}`] : [])];
  return run(redis, CAMPAIGN_LUA, keys, [at, os, c.endsAt, c.day[os], c.total[os], c.ipDay, c.reserve[os], p, from, `camp:${c.id}:${device}`, c.id]);
}
const tokenKey = t => `${p}:token:${digest(t)}`;
async function giftToken(redis) { const t = random(); await redis.set(tokenKey(t), JSON.stringify({ expires: now + 86400_000 })); return t; }
const gift = (redis, t, device, os = 'ios', cap = 1000) => run(redis, CLAIM_LUA,
  [tokenKey(t), `${p}:batches:${os}`, `${p}:day:${day}:${os}`, `${p}:ledger`, `${p}:recipient:device:${device}`], [now, os, device, cap, digest(t), p, '']);

const scenarios = [
  ['같은 기기 동시 20회: 1장 배정·19회 같은 코드(again)·재고 1 감소·장부/채널 1건', async (redis) => {
    const inv = await load(redis, 'ios', 10); await on(redis); const device = random();
    const results = await Promise.all(Array.from({ length: 20 }, () => camp(redis, { device })));
    assert.equal(results.filter(r => r[0] === 'new').length, 1);
    assert.equal(results.filter(r => r[0] === 'again').length, 19);
    assert.equal(new Set(results.map(r => r[1])).size, 1);
    assert.equal(await redis.llen(inv.pool), 9);
    assert.equal(await redis.hlen(`${p}:ledger`), 1);
    const entry = JSON.parse(await redis.hget(`${p}:ledger`, `camp:${C.id}:${device}`));
    assert.deepEqual(Object.keys(entry).sort(), ['at', 'campaign', 'last4', 'os']);
    assert.equal(entry.last4, results[0][1].slice(-4));
    assert.deepEqual(await hash(redis, `${p}:camp:${C.id}:from:${day}`), { 'clien|ios': '1' });
  }],
  ['다른 기기 5대: 서로 다른 코드 5장', async (redis) => {
    const inv = await load(redis, 'android', 8); await on(redis);
    const results = await Promise.all(Array.from({ length: 5 }, () => camp(redis, { os: 'android' })));
    assert.deepEqual(results.map(r => r[0]), Array(5).fill('new'));
    assert.equal(new Set(results.map(r => r[1])).size, 5);
    for (const r of results) assert.ok(inv.codes.includes(r[1]));
    assert.equal(await redis.llen(inv.pool), 3);
  }],
  ['하루 상한(weekend-1101 값: iOS 40·안드 20) 동시 초과 요청 → 정확히 상한만 배정·나머지 cap·다음 날 다시 배정', async (redis) => {
    const W = { ...GIFT_CAMPAIGNS['weekend-1101'], reserve: { ios: 0, android: 0 }, ipDay: 1000, endsAt: now + 7 * 86400_000 };
    assert.deepEqual(W.day, { ios: 40, android: 20 });
    await on(redis, W);
    for (const os of ['ios', 'android']) {
      await load(redis, os, 100);
      const results = await Promise.all(Array.from({ length: W.day[os] + 7 }, () => camp(redis, { os, c: W })));
      assert.equal(results.filter(r => r[0] === 'new').length, W.day[os]);
      assert.equal(results.filter(r => r[0] === 'cap').length, 7);
      const tomorrow = await camp(redis, { os, c: W, at: now + 86400_000, d: '2026-11-02' });
      assert.equal(tomorrow[0], 'new');
    }
  }],
  ['전체 상한 3 → 3장 뒤 total, 무차감', async (redis) => {
    const inv = await load(redis, 'ios', 10); const c = { ...C, total: { ios: 3, android: 3 } }; await on(redis, c);
    for (let i = 0; i < 3; i++) assert.equal((await camp(redis, { c }))[0], 'new');
    assert.equal((await camp(redis, { c }))[0], 'total');
    assert.equal(await redis.llen(inv.pool), 7);
  }],
  ['재고 0 → empty · 선물 몫(reserve 2): 5장 중 3장만 캠페인, 남은 2장은 선물이 그대로 받는다', async (redis) => {
    await on(redis);
    assert.equal((await camp(redis))[0], 'empty');
    const inv = await load(redis, 'ios', 5); const c = { ...C, reserve: { ios: 2, android: 0 } };
    const results = await Promise.all(Array.from({ length: 6 }, () => camp(redis, { c })));
    assert.equal(results.filter(r => r[0] === 'new').length, 3);
    assert.equal(results.filter(r => r[0] === 'empty').length, 3);
    assert.equal(await redis.llen(inv.pool), 2);
    for (let i = 0; i < 2; i++) assert.equal((await gift(redis, await giftToken(redis), random()))[0], 'new');
    assert.equal(await redis.llen(inv.pool), 0);
  }],
  ['스위치 없음·마감 뒤 → off(무차감) · 이미 받은 기기는 꺼짐·마감 뒤에도 같은 코드 복구 · 코드 만료 뒤는 복구 안 함', async (redis) => {
    const inv = await load(redis, 'ios', 5, now + 3 * 86400_000);
    const device = random();
    assert.equal((await camp(redis, { device }))[0], 'off');
    await on(redis);
    const first = await camp(redis, { device });
    assert.equal(first[0], 'new');
    assert.equal((await camp(redis, { at: C.endsAt }))[0], 'off');
    await redis.set(`${p}:camp:${C.id}:on`, '0');
    assert.equal((await camp(redis))[0], 'off');
    assert.deepEqual(await camp(redis, { device, at: C.endsAt + 1000 }), ['again', first[1]]);
    assert.equal((await camp(redis, { device, at: now + 3 * 86400_000 }))[0], 'recipient');
    assert.equal(await redis.llen(inv.pool), 4);
  }],
  ['★이중 배정 0: 선물 15건 + 캠페인 25건 동시(재고 30) → 30장 모두 서로 다름·재고 0·장부 30·나머지는 empty', async (redis) => {
    const inv = await load(redis, 'ios', 30); await on(redis);
    const tokens = await Promise.all(Array.from({ length: 15 }, () => giftToken(redis)));
    const jobs = [...tokens.map(t => gift(redis, t, random())), ...Array.from({ length: 25 }, () => camp(redis))];
    const results = await Promise.all(jobs);
    const codes = results.filter(r => r[0] === 'new').map(r => r[1]);
    assert.equal(codes.length, 30);
    assert.equal(new Set(codes).size, 30);
    for (const code of codes) assert.ok(inv.codes.includes(code));
    assert.equal(await redis.llen(inv.pool), 0);
    assert.equal(await redis.hlen(`${p}:ledger`), 30);
    assert.equal(results.filter(r => r[0] === 'empty').length, 10);
  }],
  ['선물·캠페인 합쳐 기기당 1장: 캠페인 받은 기기는 선물 recipient · 선물 받은 기기는 캠페인 recipient(무차감)', async (redis) => {
    const inv = await load(redis, 'ios', 10); await on(redis);
    const a = random(); assert.equal((await camp(redis, { device: a }))[0], 'new');
    assert.equal((await gift(redis, await giftToken(redis), a))[0], 'recipient');
    const b = random(); assert.equal((await gift(redis, await giftToken(redis), b))[0], 'new');
    assert.equal((await camp(redis, { device: b }))[0], 'recipient');
    assert.equal(await redis.llen(inv.pool), 8);
  }],
  ['IP 하루 상한 2: 같은 IP 3기기 → 2장·ip(무차감) · 다른 IP는 계속', async (redis) => {
    const inv = await load(redis, 'ios', 10); const c = { ...C, ipDay: 2 }; await on(redis, c);
    const results = await Promise.all(Array.from({ length: 3 }, () => camp(redis, { c, ip: 'same' })));
    assert.equal(results.filter(r => r[0] === 'new').length, 2);
    assert.equal(results.filter(r => r[0] === 'ip').length, 1);
    assert.equal((await camp(redis, { c, ip: 'other' }))[0], 'new');
    assert.equal(await redis.llen(inv.pool), 7);
  }],
  ['OS·계정 규칙: 같은 기기 다른 OS → recipient · 같은 계정 다른 기기 같은 OS → 같은 코드 · 같은 계정 다른 OS → recipient', async (redis) => {
    await load(redis, 'ios', 5); await load(redis, 'android', 5); await on(redis);
    const device = random(); const account = random();
    const first = await camp(redis, { device, account });
    assert.equal(first[0], 'new');
    assert.equal((await camp(redis, { device, os: 'android' }))[0], 'recipient');
    assert.deepEqual(await camp(redis, { account }), ['again', first[1]]);
    assert.equal((await camp(redis, { account, os: 'android' }))[0], 'recipient');
    assert.equal((await camp(redis, { account: random() }))[0], 'new');
  }],
  ['잘못된 재고 형식·장부 형식 → invalid, 무차감', async (redis) => {
    const inv = await load(redis, 'ios', 2); await on(redis);
    await redis.lset(inv.pool, 0, 'bad-code');
    assert.equal((await camp(redis))[0], 'invalid');
    assert.equal(await redis.llen(inv.pool), 2);
    assert.equal(await redis.hlen(`${p}:ledger`), 0);
    await redis.set(`${p}:camp:${C.id}:day:${day}:ios`, 'x');
    assert.equal((await camp(redis))[0], 'invalid');
  }],
];

describe('순수 JS 모의: 캠페인 Lua 원문 해석·EVAL 단위 직렬(원자) 실행', () => {
  for (const [name, fn] of scenarios) test(name, async () => { await fn(mockRedis({ atomic: true })); });
});

describe('대조군: 비원자 실행이면 시험이 결함을 잡는다', () => {
  const all = Object.fromEntries(scenarios);
  for (const name of ['같은 기기 동시 20회: 1장 배정·19회 같은 코드(again)·재고 1 감소·장부/채널 1건',
    '★이중 배정 0: 선물 15건 + 캠페인 25건 동시(재고 30) → 30장 모두 서로 다름·재고 0·장부 30·나머지는 empty',
    '하루 상한(weekend-1101 값: iOS 40·안드 20) 동시 초과 요청 → 정확히 상한만 배정·나머지 cap·다음 날 다시 배정']) {
    test(`비원자면 실패: ${name}`, async () => {
      await assert.rejects(() => all[name](mockRedis({ atomic: false })), assert.AssertionError);
    });
  }
});

test('weekend-1101 정의: iOS 40·안드 20/일 · 11/30(KST)까지 · 선물 몫 유지', () => {
  const w = GIFT_CAMPAIGNS['weekend-1101'];
  assert.deepEqual(w.day, { ios: 40, android: 20 });
  assert.equal(new Date(w.endsAt).toISOString(), '2026-11-30T15:00:00.000Z');
  assert.ok(w.reserve.ios > 0 && w.reserve.android > 0);
  assert.ok(w.total.ios >= w.day.ios && w.total.android >= w.day.android);
  assert.ok(Object.isFrozen(GIFT_CAMPAIGNS) && Object.isFrozen(w));
});

test('운영 스크립트: 기본 드라이런(연결 없이 끝남)·--apply 는 연결 없으면 실패·목록 밖 id 거부', async () => {
  const { spawnSync } = await import('node:child_process');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/UPSTASH|KV_REST/.test(k)));
  const runScript = (...a) => spawnSync(process.execPath, ['scripts/gift-campaign.mjs', ...a], { env, encoding: 'utf8' });
  const dry = runScript('--id', 'weekend-1101', '--on', '--target', 'production');
  assert.equal(dry.status, 0); assert.match(dry.stdout, /드라이런/);
  const apply = runScript('--id', 'weekend-1101', '--on', '--apply', '--target', 'production');
  assert.equal(apply.status, 1); assert.match(apply.stderr, /연결 환경변수 없음/);
  assert.equal(runScript('--id', 'weekend-9999').status, 1);
  assert.equal(runScript('--id', 'weekend-1101', '--on', '--off', '--target', 'preview').status, 1);
});
