/** Offline: npx tsx tests/comebackPushRoutes.test.ts — RC 웹훅(만료) → 매시 크론(D+1) «다시 시작» 할인 코드 푸시를 메모리 Redis·가짜 RC·가짜 발송기로 끝까지 (2026-11-21) */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { MEMORY_IMPL } from '../src/lib/push/trialPushLua';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

const kv = new Map<string, string>();
const zs = new Map<string, Map<string, number>>();
const fake = {
  get: async (k: string) => (kv.has(k) ? kv.get(k)! : null),
  set: async (k: string, v: string, o?: { nx?: boolean; ex?: number }) => { if (o?.nx && kv.has(k)) return null; kv.set(k, String(v)); return 'OK'; },
  del: async (...ks: string[]) => { ks.forEach((k) => kv.delete(k)); return ks.length; },
  mget: async (...ks: string[]) => ks.map((k) => (kv.has(k) ? kv.get(k)! : null)),
  incr: async (k: string) => { const n = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(n)); return n; },
  expire: async () => 1,
  eval: async (script: string, keys: string[], args: string[]) => {
    const impl = MEMORY_IMPL.get(script);
    assert.ok(impl, 'unknown Lua script');
    return impl!({ kv, zs }, keys, args);
  },
  zadd: async (k: string, m: { score: number; member: string }) => { (zs.get(k) ?? zs.set(k, new Map()).get(k)!).set(m.member, m.score); return 1; },
  zrem: async (k: string, member: string) => { zs.get(k)?.delete(member); return 1; },
  zremrangebyscore: async (k: string, min: number, max: number) => { const z = zs.get(k); if (z) for (const [m, s] of z) if (s >= min && s <= max) z.delete(m); return 0; },
  zrange: async (k: string, min: number, max: number, o: { offset?: number; count?: number }) => {
    const all = [...(zs.get(k) ?? new Map()).entries()].filter(([, s]) => s >= min && s <= max).sort((a, b) => a[1] - b[1]).map(([m]) => m);
    return all.slice(o.offset ?? 0, (o.offset ?? 0) + (o.count ?? all.length));
  },
};
mock('@upstash/redis', { Redis: { fromEnv: () => fake } });
// 웹훅의 코호트 기록·1년 이용권은 이 시험 밖 — 기록 저장소만 흉내
const giftServer = require('../src/lib/giftShare/server');
mock('../src/lib/giftShare/server', { ...giftServer, giftStore: () => ({ eval: async () => 1 }) });
process.env.NEXT_PUBLIC_RC_IOS_KEY = 'appl_test';
process.env.REVENUECAT_WEBHOOK_AUTH = 'Bearer wh-test';
process.env.RC_COHORT_HMAC_SECRET = 'hmac-test-secret';
process.env.COMEBACK_OFFER_CODE = 'TESTBACK99';   // 실제 코드 값은 저장소에 두지 않는다
const H = 3600_000, D = 24 * H;
const NOW = Date.parse('2026-11-23T03:00:00Z');   // 서울 12시
const iso = (x: number) => new Date(x).toISOString();
const rc = new Map<string, unknown>();
let rcDown = false;
const rcCalls: string[] = [];
(globalThis as any).fetch = async (url: string) => {
  const id = decodeURIComponent(String(url).split('/subscribers/')[1] ?? '');
  rcCalls.push(id);
  if (rcDown) return { ok: false, status: 503, json: async () => ({}) };
  const body = rc.get(id) ?? { subscriber: { entitlements: {}, subscriptions: {} } };
  return { ok: true, status: 200, json: async () => body };
};
const expired = (x: number) => ({ subscriber: {
  entitlements: { pro: { product_identifier: 'com.signumhq.app.pro.monthly', expires_date: iso(x) } }, non_subscriptions: {},
  subscriptions: { 'com.signumhq.app.pro.monthly': { period_type: 'trial', store: 'app_store', purchase_date: iso(x - 7 * D), expires_date: iso(x), unsubscribe_detected_at: iso(x - 5 * D), billing_issues_detected_at: null, ownership_type: 'PURCHASED' } },
} });
const sent: any[] = [];
mock('../src/lib/push/sendSignal', { sendSignalPushes: async (items: any[]) => { sent.push(...items); return new Map(items.map((i) => [i.id, 'ok'])); } });

async function main() {
  const webhook = (await import('../src/app/api/webhooks/revenuecat/route')).POST;
  const cron = (await import('../src/app/api/cron/trial-push/route')).GET;
  const { trialUidHash } = await import('../src/lib/push/trialVerify');
  const C = await import('../src/lib/push/comebackPush');
  const COMEBACK_CODE = 'TESTBACK99';
  const realNow = Date.now;
  Date.now = () => NOW;
  const uidOf = (c: string) => '$RCAnonymousID:' + c.repeat(32).slice(0, 32);
  const tokOf = (c: string) => c.repeat(64).slice(0, 64);
  const setup = (c: string, extra: Record<string, unknown> = {}) => {
    const uid = uidOf(c), token = tokOf(c);
    kv.set(`push:trial:uid:${trialUidHash(uid)}`, `t:${token}`);
    kv.set(`push:trial:owner:${token}`, trialUidHash(uid));
    kv.set(`push:tokens:${token}`, JSON.stringify({ token, platform: 'ios', app: 'signum', locale: 'ko', tz: 'Asia/Seoul', notifPerm: true, preferences: { enabled: true }, lastSeenAt: iso(NOW - 3 * D), ...extra }));
    rc.set(uid, expired(NOW - 25 * H));
    return { uid, token, uh: trialUidHash(uid) };
  };
  const hook = async (e: Record<string, unknown>) => {
    const r = await webhook(new Request('http://x/api/webhooks/revenuecat', { method: 'POST', headers: { authorization: 'Bearer wh-test', 'content-type': 'application/json' },
      body: JSON.stringify({ event: { id: 'ev-' + Math.random(), event_timestamp_ms: NOW - 25 * H, environment: 'PRODUCTION', period_type: 'TRIAL', store: 'APP_STORE', expiration_reason: 'UNSUBSCRIBE', entitlement_ids: ['pro'], country_code: 'KR', currency: 'KRW', expiration_at_ms: NOW - 25 * H, ...e } }) }));
    return r.status;
  };
  const run = async (q = '') => (await cron(new Request(`http://x/api/cron/trial-push${q}`))).json();
  const inQueue = (uh: string) => zs.get(C.COMEBACK_ZSET)?.has(uh) === true;
  try {
    // (1) 만료 웹훅 → 대상 적재 · 저장값에 RC ID 원문 없음 · 웹훅 응답 200
    const A = setup('a');
    assert.equal(await hook({ type: 'EXPIRATION', app_user_id: A.uid }), 200);
    assert.ok(inQueue(A.uh));
    const raw = kv.get(C.COMEBACK_ENTRY_KEY(A.uh))!;
    assert.ok(!raw.includes(A.uid) && !raw.includes('aaaaaaaa'), 'no raw uid stored');

    // (2) 드라이런 — 대상 수만, 보내지 않고 표식·목록 그대로
    let r = await run('?dry=1');
    assert.equal(r.dry, true);
    assert.equal(r.comeback.on, true);
    assert.equal(r.comeback.candidates, 1);
    assert.equal(r.comeback.send, 1);
    assert.equal(r.comeback.preview[0].storefront, 'KR');
    assert.ok(!JSON.stringify(r).includes(COMEBACK_CODE), 'dry output has no code');
    assert.equal(sent.length, 0);
    assert.ok(inQueue(A.uh));
    assert.equal(kv.has(C.COMEBACK_SENT_UID_KEY(A.uh)), false);

    // (3) 실제 회차 — 1통 · 문구(할인가·정가·자동 갱신·해지) · 데이터 · 표식 · 목록에서 빠짐
    r = await run();
    assert.equal(r.comeback.sent, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].token, A.token);
    assert.equal(sent[0].platform, 'ios');
    assert.deepEqual(sent[0].data, { type: 'comeback', v: '1', c: COMEBACK_CODE });
    for (const m of ['₩5,900', '₩11,900', '자동 갱신', '언제든 해지', COMEBACK_CODE]) assert.ok((sent[0].title + sent[0].body).includes(m), m);
    assert.ok(kv.has(C.COMEBACK_SENT_UID_KEY(A.uh)) && kv.has(C.COMEBACK_SENT_TOKEN_KEY(A.token)));
    assert.equal(inQueue(A.uh), false);

    // (4) 같은 고객 웹훅이 다시 와도(재전송·별칭) 다시 보내지 않는다(고객당 1회)
    assert.equal(await hook({ type: 'EXPIRATION', app_user_id: A.uid }), 200);
    assert.equal(inQueue(A.uh), false);
    kv.set(C.COMEBACK_ENTRY_KEY(A.uh), JSON.stringify({ x: NOW - 25 * H, u: C.sealUid(A.uid, 'hmac-test-secret'), at: NOW, sf: 'KR', cc: true })); zs.get(C.COMEBACK_ZSET)!.set(A.uh, NOW - 25 * H);
    r = await run();
    assert.equal(sent.length, 1);
    assert.equal(r.comeback.skipped.sent, 1);

    // (5) 만료 뒤 다시 결제(웹훅) → 대상에서 빠진다
    const B = setup('b');
    await hook({ type: 'EXPIRATION', app_user_id: B.uid });
    assert.ok(inQueue(B.uh));
    await hook({ type: 'INITIAL_PURCHASE', app_user_id: B.uid, period_type: 'NORMAL' });
    assert.equal(inQueue(B.uh), false);
    r = await run();
    assert.equal(sent.length, 1);

    // (6) RC 재확인에서 활성 권한(예: 프로모션·스토어 밖 결제) → 보내지 않고 목록에서 뺀다
    const Cc = setup('c');
    await hook({ type: 'EXPIRATION', app_user_id: Cc.uid });
    rc.set(Cc.uid, { subscriber: { entitlements: { pro: { expires_date: null } }, subscriptions: {} } });
    r = await run();
    assert.equal(sent.length, 1);
    assert.equal(r.comeback.skipped.active, 1);
    assert.equal(inQueue(Cc.uh), false);

    // (7) RC 장애 → 보내지 않고 남겨 둔다(다음 회차)
    const E = setup('e');
    await hook({ type: 'EXPIRATION', app_user_id: E.uid });
    rcDown = true;
    r = await run();
    rcDown = false;
    assert.equal(sent.length, 1);
    assert.equal(r.comeback.skipped.rc_unavailable, 1);
    assert.ok(inQueue(E.uh));

    // (8) 끄기 — 회차 ?comeback=0 · Redis 스위치(?comebackOff=1/0) · 환경 변수 COMEBACK_PUSH=off
    r = await run('?comeback=0');
    assert.equal(r.comeback.on, false); assert.equal(sent.length, 1);
    assert.deepEqual(await run('?comebackOff=1'), { ok: true, comebackOff: true });
    r = await run(); assert.equal(r.comeback.on, false); assert.equal(sent.length, 1);
    kv.set(C.COMEBACK_OFF_KEY, '1');
    r = await run('?dry=1'); assert.equal(r.comeback.on, false);
    assert.deepEqual(await run('?comebackOff=0'), { ok: true, comebackOff: false });
    process.env.COMEBACK_PUSH = 'off';
    r = await run(); assert.equal(r.comeback.on, false); assert.equal(sent.length, 1);
    delete process.env.COMEBACK_PUSH;
    r = await run();
    assert.equal(sent.length, 2); assert.equal(sent[1].token, E.token);

    // (9) 안드로이드 토큰 · 알림 권한 없음 · 모르는 스토어프런트 → 보내지 않고 뺀다 / 현지 밤 · 최근 실행 → 남긴다
    const F = setup('f', { platform: 'android' });
    const G = setup('g', { notifPerm: false });
    const I = setup('i', { locale: 'en' });
    const J = setup('j', { tz: 'America/New_York', locale: 'en' });   // 뉴욕 22시(미국 계정)
    const K = setup('k', { lastSeenAt: iso(NOW - H) });
    for (const x of [F, G, K]) await hook({ type: 'EXPIRATION', app_user_id: x.uid });
    await hook({ type: 'EXPIRATION', app_user_id: J.uid, country_code: 'US', currency: 'USD' });
    await hook({ type: 'EXPIRATION', app_user_id: I.uid, country_code: 'GB' });   // 가격을 모르는 나라 → 적재 안 함
    assert.equal(inQueue(I.uh), false);
    r = await run();
    assert.equal(sent.length, 2);
    assert.equal(r.comeback.skipped.not_ios, 1); assert.equal(r.comeback.skipped.no_permission, 1);
    assert.equal(r.comeback.skipped.quiet_hours, 1); assert.equal(r.comeback.skipped.recent_open, 1);
    assert.equal(inQueue(F.uh), false); assert.equal(inQueue(G.uh), false);
    assert.ok(inQueue(J.uh)); assert.ok(inQueue(K.uh));

    // (10) 묶인 토큰이 없는 고객(체험 중 보고 없음) · 샌드박스 · 결제 실패 만료 · 플레이 스토어 → 적재하지 않는다
    await hook({ type: 'EXPIRATION', app_user_id: uidOf('n') });
    assert.equal(inQueue(trialUidHash(uidOf('n'))), false);
    const L = setup('l');
    await hook({ type: 'EXPIRATION', app_user_id: L.uid, environment: 'SANDBOX' });
    await hook({ type: 'EXPIRATION', app_user_id: L.uid, expiration_reason: 'BILLING_ERROR' });
    await hook({ type: 'EXPIRATION', app_user_id: L.uid, store: 'PLAY_STORE' });
    assert.equal(inQueue(L.uh), false);

    // (11) D+1 전(만료 12시간 뒤)에는 읽지 않는다 · 코드 시작(11/22 08:00Z) 전에는 보내지 않고 남긴다
    const M = setup('m');
    await hook({ type: 'EXPIRATION', app_user_id: M.uid, expiration_at_ms: NOW - 12 * H });
    r = await run('?dry=1');
    assert.ok(!(r.comeback.preview as any[]).length || r.comeback.send === 0);
    assert.ok(inQueue(M.uh));
    Date.now = () => Date.parse('2026-11-22T03:00:00Z');
    const P = setup('p');
    await hook({ type: 'EXPIRATION', app_user_id: P.uid, expiration_at_ms: Date.parse('2026-11-21T01:00:00Z') });
    r = await run();
    assert.equal(r.comeback.skipped.not_yet >= 1, true);
    assert.ok(inQueue(P.uh));
    Date.now = () => NOW;

    // (12) 웹훅 저장소 장애여도 웹훅 응답은 그대로(200)
    const realZadd = fake.zadd; (fake as any).zadd = async () => { throw new Error('down'); };
    const Q = setup('q');
    assert.equal(await hook({ type: 'EXPIRATION', app_user_id: Q.uid }), 200);
    (fake as any).zadd = realZadd;

    // (14) RC 확인 «뒤» 재결제 웹훅이 대상을 지우면 보내지 않는다(자리 잡기에서 항목 확인)
    await run();   // 앞 단계에서 남은 대상(11의 P 등)을 먼저 비운다
    const T = setup('t');
    await hook({ type: 'EXPIRATION', app_user_id: T.uid });
    const before14 = sent.length;
    const realFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url: string) => { const res = await realFetch(url); kv.delete(C.COMEBACK_ENTRY_KEY(T.uh)); return res; };
    r = await run();
    (globalThis as any).fetch = realFetch;
    assert.equal(sent.length, before14);
    assert.equal(r.comeback.skipped.cancelled, 1);

    // (15) 같은 기기 토큰의 체험 기록 주인이 다른 고객이면(기기를 이어 씀) 보내지 않는다
    const U = setup('u');
    await hook({ type: 'EXPIRATION', app_user_id: U.uid });
    assert.ok(inQueue(U.uh));
    kv.delete(`push:trial:owner:${U.token}`);   // 적재 뒤 체험 기록 주인이 사라짐(다른 사람이 기기를 이어 받아 해제 보고) → 보내지 않는다
    r = await run();
    assert.equal(sent.length, before14);
    assert.equal(r.comeback.skipped.unbound, 1);
    const U2 = setup('w');
    kv.set(`push:trial:owner:${U2.token}`, 'u-someone-else');   // 적재 시점에 주인이 다른 고객 → 적재 안 함
    await hook({ type: 'EXPIRATION', app_user_id: U2.uid });
    assert.equal(inQueue(U2.uh), false);
    // 미국 계정이면 한국어 화면이어도 달러 가격
    const X = setup('x');
    await hook({ type: 'EXPIRATION', app_user_id: X.uid, country_code: 'US', currency: 'USD' });
    r = await run();
    assert.equal(sent.length, before14 + 1);
    assert.ok(sent[sent.length - 1].title.includes('$3.99') && sent[sent.length - 1].body.includes('$9.99'));

    // (15b) 웹훅·RC 둘 다 통화가 없으면 가격을 단정하지 않아 보내지 않는다
    const Y = setup('y');
    await hook({ type: 'EXPIRATION', app_user_id: Y.uid, currency: null });
    const before15 = sent.length;
    r = await run();
    assert.equal(sent.length, before15);
    assert.equal(r.comeback.skipped.storefront, 1);
    // (15c) 겹친 회차가 먼저 자리를 잡았으면(보냄 표식) 이 회차는 대상을 지우지 않는다
    const Z = setup('z');
    await hook({ type: 'EXPIRATION', app_user_id: Z.uid });
    const realEval = fake.eval;
    (fake as any).eval = async () => 0;
    r = await run();
    (fake as any).eval = realEval;
    assert.ok(r.comeback.skipped.sent >= 1);   // (4)의 A 도 표식 때문에 sent(지우지 않고 72시간 창이 걷는다)
    assert.ok(inQueue(Z.uh));
    r = await run();   // 표식이 없으니(흉내) 다음 회차에 정상 발송
    assert.equal(sent.length, before15 + 1);

    // (16) 코드 설정이 없으면 웹훅 적재·크론 발송 모두 꺼짐
    delete process.env.COMEBACK_OFFER_CODE;
    const V = setup('v');
    await hook({ type: 'EXPIRATION', app_user_id: V.uid });
    assert.equal(inQueue(V.uh), false);
    r = await run(); assert.equal(r.comeback.on, false);
    process.env.COMEBACK_OFFER_CODE = COMEBACK_CODE;

    // (13) RC 호출에는 원문 ID 가 쓰였다(암호화 왕복) — 별칭 후보로 묶인 경우도
    assert.ok(rcCalls.includes(A.uid));
    const R = setup('r');
    kv.delete(`push:trial:uid:${trialUidHash(uidOf('s'))}`);
    await hook({ type: 'EXPIRATION', app_user_id: uidOf('s'), aliases: [R.uid] });
    assert.ok(inQueue(R.uh));

    console.log('comebackPushRoutes: all passed');
  } finally { Date.now = realNow; }
}
main().catch((e) => { console.error(e); process.exit(1); });
