/**
 * «1년 PRO 이용권(자동 갱신 없음)» — 판정(planPromoYear) · 부여(ensurePromoYear) · 환불 기록(recordPromoYearRefund) · 웹훅 거름 ·
 *   앱 재조회 순서 · 웹훅·앱 라우트 (가짜 RC · 가짜 Upstash)
 * 실행: npx tsx tests/promoYear.test.ts
 */
import assert from 'node:assert/strict';
import {
  PROMO_YEAR_MS, PROMO_YEAR_PRODUCT_ID, ensurePromoYear, planPromoYear, promoYearFromWebhook, promoYearRefundFromWebhook,
  recordPromoYearRefund, type PromoLedger, type Purchase,
} from '../src/lib/promoYear/core';
import { claimPromoYear, refreshProAfterRedeem } from '../src/lib/app/redeem';

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) { await fn(); n++; console.log('  ✓', name); }
const NOW = Date.parse('2026-11-14T00:00:00Z');
const D = 86400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const UID = '$RCAnonymousID:0123456789abcdef0123456789abcdef';
type P = { at: number; tx?: string; store?: string; refunded?: boolean };
const subWith = (purchases: P[], subs: Record<string, unknown> = {}) => ({
  subscriber: {
    non_subscriptions: { [PROMO_YEAR_PRODUCT_ID]: purchases.map((p, i) => ({
      id: `x${i}`, purchase_date: iso(p.at), store: p.store ?? 'app_store', is_sandbox: false, store_transaction_id: p.tx ?? `T${i}`,
      ...(p.refunded ? { refunded_at: iso(p.at + 1000) } : {}),
    })) },
    subscriptions: subs, entitlements: {},
  },
});
const promo = (end: number | null) => ({ rc_promo_pro_custom: { store: 'promotional', expires_date: end === null ? null : iso(end) } });
const memLedger = () => {
  const refunded = new Map<string, string[]>();
  const l: PromoLedger & { refundedOf: (u: string) => string[] } = {
    refunded: async (u) => refunded.get(u) ?? [],
    addRefund: async (u, keys) => { refunded.set(u, [...new Set([...(refunded.get(u) ?? []), ...keys])]); },
    refundedOf: (u) => refunded.get(u) ?? [],
  };
  return l;
};
const fakeRc = (subscriber: unknown, status: { get?: number; post?: number } = {}) => {
  const calls: string[] = []; const bodies: unknown[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${String(url).replace(/^.*subscribers\/[^/]+/, '') || '/'}`);
    if (init.body) bodies.push(JSON.parse(String(init.body)));
    if (init.method === 'GET') return new Response(JSON.stringify(subscriber), { status: status.get ?? 200 });
    return new Response('{}', { status: status.post ?? 201 });
  }) as unknown as typeof fetch;
  return { f, calls, bodies };
};

(async () => {
  // ── 판정 ──
  await t('구매 없음 → none/no_purchase', () => {
    assert.deepEqual(planPromoYear({ subscriber: { non_subscriptions: {}, subscriptions: {} } }, NOW), { kind: 'none', why: 'no_purchase' });
    assert.deepEqual(planPromoYear(null, NOW), { kind: 'none', why: 'no_purchase' });
  });
  await t('구매 1건 → 구매 + 365일', () => {
    const at = NOW - 3600_000;
    assert.deepEqual(planPromoYear(subWith([{ at, tx: 'A' }]), NOW), { kind: 'grant', purchase: { tx: 'A', ms: at }, endMs: at + PROMO_YEAR_MS });
  });
  await t('여러 건이면 가장 최근 · 다른 스토어·미래 이상값 무시 · 366일 전은 expired', () => {
    const p = planPromoYear(subWith([{ at: NOW - D, tx: 'B' }, { at: NOW - 200 * D }, { at: NOW - 1000, store: 'play_store' }, { at: NOW + 3600_000 }]), NOW);
    assert.deepEqual(p, { kind: 'grant', purchase: { tx: 'B', ms: NOW - D }, endMs: NOW - D + PROMO_YEAR_MS });
    assert.deepEqual(planPromoYear(subWith([{ at: NOW - 366 * D }]), NOW), { kind: 'none', why: 'expired' });
  });
  await t('덮임 — 같은 만료(±2시간)·평생 프로모셔널 covered · 하루 짧으면 다시 · 유료 연간 구독은 덮지 않는다', () => {
    const at = NOW - 3600_000, end = at + PROMO_YEAR_MS;
    assert.equal(planPromoYear(subWith([{ at }], promo(end)), NOW).kind, 'none');
    assert.equal(planPromoYear(subWith([{ at }], promo(end - D)), NOW).kind, 'grant');
    assert.equal(planPromoYear(subWith([{ at }], promo(null)), NOW).kind, 'none');
    assert.equal(planPromoYear(subWith([{ at }], { 'com.signumhq.app.pro.annual': { store: 'app_store', expires_date: iso(end + 1e9) } }), NOW).kind, 'grant');
  });
  await t('웹훅 힌트 — 기록에 없거나(첫 구매) 기록보다 늦을 때(재구매) 쓴다 · 미래 이상값 무시', () => {
    const empty = { subscriber: { non_subscriptions: {}, subscriptions: {} } };
    const h = { tx: 'H', ms: NOW - 5000 };
    assert.deepEqual(planPromoYear(empty, NOW, { hint: h }), { kind: 'grant', purchase: h, endMs: h.ms + PROMO_YEAR_MS });
    assert.deepEqual(planPromoYear(empty, NOW, { hint: { tx: 'F', ms: NOW + 3600_000 } }), { kind: 'none', why: 'no_purchase' });
    assert.deepEqual(planPromoYear(subWith([{ at: NOW - 400 * D }]), NOW, { hint: h }), { kind: 'grant', purchase: h, endMs: h.ms + PROMO_YEAR_MS });
    assert.equal((planPromoYear(subWith([{ at: NOW - 1000, tx: 'R' }]), NOW, { hint: { tx: 'O', ms: NOW - D } }) as { purchase: Purchase }).purchase.tx, 'R');
  });
  await t('환불 — 거래 ID 로만 뺀다(5분 안 두 구매도 구분) · RC 환불 표시·우리 환불 기록 모두 · 힌트가 환불된 거래면 무시', () => {
    const a = NOW - 3600_000, b = a + 60_000;
    assert.deepEqual(planPromoYear(subWith([{ at: a, tx: 'A', refunded: true }]), NOW), { kind: 'none', why: 'no_purchase' });
    assert.deepEqual(planPromoYear(subWith([{ at: a, tx: 'A', refunded: true }]), NOW, { hint: { tx: 'A', ms: a } }), { kind: 'none', why: 'no_purchase' });
    assert.deepEqual(planPromoYear(subWith([{ at: a, tx: 'A' }]), NOW, { refunded: ['A'] }), { kind: 'none', why: 'no_purchase' });
    assert.deepEqual(planPromoYear(subWith([{ at: a, tx: 'A' }, { at: b, tx: 'B' }]), NOW, { refunded: ['B'] }),
      { kind: 'grant', purchase: { tx: 'A', ms: a }, endMs: a + PROMO_YEAR_MS });
    // 거래 ID 가 한쪽에만 있어도 구매 시각 키('ms:')로 같은 구매를 알아본다
    assert.deepEqual(planPromoYear({ subscriber: { non_subscriptions: { [PROMO_YEAR_PRODUCT_ID]: [{ purchase_date: iso(a), store: 'app_store' }] } } }, NOW, { refunded: ['TX9', `ms:${Date.parse(iso(a))}`] }), { kind: 'none', why: 'no_purchase' });
  });

  // ── 부여 ──
  await t('부여: 키 없음·형식 틀린 ID 는 RC 를 부르지 않는다', async () => {
    const rc = fakeRc(subWith([{ at: NOW }]));
    assert.deepEqual(await ensurePromoYear(UID, { secret: '', fetchImpl: rc.f, now: () => NOW }), { kind: 'unavailable', why: 'no_key' });
    assert.deepEqual(await ensurePromoYear('bad id!', { secret: 'sk', fetchImpl: rc.f, now: () => NOW }), { kind: 'none', why: 'uid' });
    assert.equal(rc.calls.length, 0);
  });
  await t('부여: GET → POST promotional { end_time_ms } (pro · 서버 비밀키)', async () => {
    const at = NOW - 60_000; const rc = fakeRc(subWith([{ at, tx: 'A' }]));
    const seen: string[] = [];
    const f = (async (url: string, init: RequestInit) => { seen.push((init.headers as Record<string, string>).Authorization); return rc.f(url, init); }) as unknown as typeof fetch;
    assert.deepEqual(await ensurePromoYear(UID, { secret: 'sk_test', fetchImpl: f, now: () => NOW, ledger: memLedger() }), { kind: 'granted', endMs: at + PROMO_YEAR_MS });
    assert.deepEqual(rc.calls, ['GET /', 'POST /entitlements/pro/promotional']);
    assert.deepEqual(rc.bodies, [{ end_time_ms: at + PROMO_YEAR_MS }]);
    assert.deepEqual(seen, ['Bearer sk_test', 'Bearer sk_test']);
  });
  await t('부여: 구매 없음 → GET 만 · RC 부여 실패 → unavailable · 환불 기록 못 읽으면 닫힘', async () => {
    const none = fakeRc({ subscriber: { non_subscriptions: {}, subscriptions: {} } });
    assert.deepEqual(await ensurePromoYear(UID, { secret: 'sk', fetchImpl: none.f, now: () => NOW }), { kind: 'none', why: 'no_purchase' });
    assert.deepEqual(none.calls, ['GET /']);
    assert.deepEqual(await ensurePromoYear(UID, { secret: 'sk', fetchImpl: fakeRc(subWith([{ at: NOW }]), { post: 500 }).f, now: () => NOW }), { kind: 'unavailable', why: 'grant' });
    const broken = { ...memLedger(), refunded: async () => { throw new Error('x'); } };
    assert.deepEqual(await ensurePromoYear(UID, { secret: 'sk', fetchImpl: fakeRc(subWith([{ at: NOW }])).f, now: () => NOW, ledger: broken }), { kind: 'unavailable', why: 'read' });
  });
  await t('부여: 환불 기록에 있는 거래는 늦게 온 구매 웹훅 힌트로도 붙이지 않는다', async () => {
    const at = NOW - 60_000; const l = memLedger(); await l.addRefund(UID, ['A']); const rc = fakeRc(subWith([{ at, tx: 'A' }]));
    assert.deepEqual(await ensurePromoYear(UID, { secret: 'sk', fetchImpl: rc.f, now: () => NOW, ledger: l }, { tx: 'A', ms: at }), { kind: 'none', why: 'no_purchase' });
    assert.deepEqual(rc.calls, ['GET /']);
  });

  // ── 환불 기록(자동 회수 없음) ──
  await t('환불 기록: 키를 남기고 RC 는 부르지 않는다 · 이후 같은 구매로 다시 붙이지 않는다 · 저장 실패는 unavailable', async () => {
    const at = NOW - 60_000; const l = memLedger();
    assert.equal(await recordPromoYearRefund(UID, ['A', `ms:${at}`], { secret: 'sk', ledger: l }), 'recorded');
    assert.deepEqual(l.refundedOf(UID), ['A', `ms:${at}`]);
    const rc = fakeRc(subWith([{ at, tx: 'A' }]));
    assert.deepEqual(await ensurePromoYear(UID, { secret: 'sk', fetchImpl: rc.f, now: () => NOW, ledger: l }), { kind: 'none', why: 'no_purchase' });
    assert.equal(await recordPromoYearRefund(UID, [], { ledger: l }), 'none');
    assert.equal(await recordPromoYearRefund(UID, ['A'], { ledger: { refunded: async () => [], addRefund: async () => { throw new Error('x'); } } }), 'unavailable');
  });

  // ── 웹훅 거름 ──
  await t('웹훅 거름 — 이 상품 앱스토어 실제 구매(거래 ID·시각) · 환불(CANCELLATION) · 프로모셔널·다른 상품 제외', () => {
    const base = { type: 'NON_RENEWING_PURCHASE', product_id: PROMO_YEAR_PRODUCT_ID, store: 'APP_STORE', period_type: 'NORMAL', app_user_id: UID };
    const ev = (o: Record<string, unknown>) => ({ event: { ...base, ...o } });
    assert.deepEqual(promoYearFromWebhook(ev({})), { uid: UID });
    assert.deepEqual(promoYearFromWebhook(ev({ purchased_at_ms: NOW, transaction_id: 'T1' })), { uid: UID, purchase: { tx: 'T1', ms: NOW } });
    assert.deepEqual(promoYearFromWebhook(ev({ purchased_at_ms: NOW })), { uid: UID, purchase: { tx: `ms:${NOW}`, ms: NOW } });
    assert.equal(promoYearFromWebhook(ev({ period_type: 'PROMOTIONAL' })), null);
    assert.equal(promoYearFromWebhook(ev({ product_id: 'rc_promo_pro_custom', store: 'PROMOTIONAL' })), null);
    assert.equal(promoYearFromWebhook(ev({ product_id: 'com.signumhq.app.pro.annual', type: 'INITIAL_PURCHASE' })), null);
    assert.equal(promoYearFromWebhook(null), null);
    assert.deepEqual(promoYearRefundFromWebhook(ev({ type: 'CANCELLATION', purchased_at_ms: NOW, transaction_id: 'T1' })), { uid: UID, keys: ['T1', `ms:${NOW}`] });
    assert.deepEqual(promoYearRefundFromWebhook(ev({ type: 'CANCELLATION', transaction_id: 'T1' })), { uid: UID, keys: ['T1'] });
    assert.equal(promoYearRefundFromWebhook(ev({ type: 'CANCELLATION', product_id: 'com.signumhq.app.pro.annual' })), null);
    assert.equal(promoYearFromWebhook(ev({ type: 'CANCELLATION' })), null);
  });

  // ── 앱 ──
  await t('앱 재조회: claim 이 있으면 다시 읽기 직전마다 1번 · PRO 가 보이면 멈춘다', async () => {
    const log: string[] = []; let k = 0;
    const deps = { check: async () => { log.push('check'); return ++k >= 3; }, sync: async () => { log.push('sync'); }, wait: async (ms: number) => { log.push('wait' + ms); }, claim: async () => { log.push('claim'); } };
    assert.equal(await refreshProAfterRedeem('sheet', deps), true);
    assert.deepEqual(log, ['check', 'claim', 'check', 'wait3000', 'claim', 'check']);
  });
  await t('claimPromoYear — RC ID 를 본문에 실어 /api/app/promo-year 로 · ID 없으면 안 부른다 · 실패는 삼킨다', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const f = (async (url: string, init: RequestInit) => { calls.push({ url, body: String(init.body) }); return new Response('{}'); }) as unknown as typeof fetch;
    await claimPromoYear(async () => UID, f);
    assert.deepEqual(calls, [{ url: '/api/app/promo-year', body: JSON.stringify({ rcAppUserId: UID }) }]);
    await claimPromoYear(async () => null, f); assert.equal(calls.length, 1);
    await claimPromoYear(async () => UID, (async () => { throw new Error('net'); }) as unknown as typeof fetch);
  });

  // ── 라우트(가짜 Upstash: SMEMBERS → [] · SADD → 1 · 나머지 → result) ──
  const fakeUpstash = (log: string[], tag: string, result: () => unknown) => (u: string, init: RequestInit) => {
    const cmds = u.endsWith('/pipeline') ? JSON.parse(String(init.body)) : [JSON.parse(String(init.body))];
    const out = cmds.map((c: unknown[]) => {
      const script = String(c[1]);
      if (script.includes('SMEMBERS')) return { result: [] };
      if (script.includes('SADD')) return { result: 1 };
      log.push(tag); return { result: result() };
    });
    return new Response(JSON.stringify(u.endsWith('/pipeline') ? out : out[0]), { status: 200 });
  };
  await t('웹훅 라우트: 코호트 먼저 → 부여 · 키 없음/RC 장애면 503(재시도) · 부여되면 200 · 다른 이벤트는 RC 를 부르지 않는다', async () => {
    process.env.REVENUECAT_WEBHOOK_AUTH = 'test-auth'; process.env.RC_COHORT_HMAC_SECRET = 'test-secret';
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.local'; process.env.UPSTASH_REDIS_REST_TOKEN = 'fake';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('../src/app/api/webhooks/revenuecat/route');
    const mkBody = (o: Record<string, unknown> = {}) => JSON.stringify({ event: { id: 'e1', type: 'NON_RENEWING_PURCHASE', product_id: PROMO_YEAR_PRODUCT_ID, store: 'APP_STORE', period_type: 'NORMAL', app_user_id: UID, transaction_id: 'T1', event_timestamp_ms: Date.now(), purchased_at_ms: Date.now() - 1000, environment: 'SANDBOX', ...o } });
    const mk = (o?: Record<string, unknown>) => new Request('http://local', { method: 'POST', headers: { authorization: 'test-auth' }, body: mkBody(o) });
    const realFetch = globalThis.fetch; const log: string[] = []; let rcStatus = 500;
    const up = fakeUpstash(log, 'cohort', () => 1);
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://fake-upstash.local')) return up(u, init);
      log.push('rc:' + init.method);
      if (init.method === 'GET') return new Response(JSON.stringify({ subscriber: { non_subscriptions: {}, subscriptions: {} } }), { status: rcStatus === 500 ? 500 : 200 });
      return new Response('{}', { status: rcStatus });
    }) as unknown as typeof fetch;
    try {
      delete process.env.REVENUECAT_SECRET_API_KEY;
      assert.equal((await POST(mk())).status, 503); assert.deepEqual(log, ['cohort']);
      process.env.REVENUECAT_SECRET_API_KEY = 'sk_test'; log.length = 0;
      assert.equal((await POST(mk())).status, 503); assert.deepEqual(log, ['cohort', 'rc:GET']);
      rcStatus = 201; log.length = 0;
      assert.equal((await POST(mk())).status, 200); assert.deepEqual(log, ['cohort', 'rc:GET', 'rc:POST']);   // 기록에 아직 없어도 웹훅 구매로 부여
      log.length = 0;
      assert.equal((await POST(mk({ product_id: 'com.signumhq.app.pro.annual', type: 'INITIAL_PURCHASE' }))).status, 200); assert.deepEqual(log, ['cohort']);
      log.length = 0;
      assert.equal((await POST(mk({ type: 'TEST' }))).status, 200); assert.deepEqual(log, []);
    } finally { globalThis.fetch = realFetch; delete process.env.REVENUECAT_SECRET_API_KEY; }
  });
  await t('앱 라우트 /api/app/promo-year: 형식 400 · 키 없음 503 · 예산 초과 429(RC 안 부름) · 통과 → RC 판정 결과', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.local'; process.env.UPSTASH_REDIS_REST_TOKEN = 'fake';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('../src/app/api/app/promo-year/route');
    const mk = (b: unknown) => new Request('http://local', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body: JSON.stringify(b) });
    const realFetch = globalThis.fetch; const log: string[] = []; let rl = 0;
    const up = fakeUpstash(log, 'rl', () => rl);
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://fake-upstash.local')) return up(u, init);
      log.push('rc:' + init.method);
      return new Response(JSON.stringify({ subscriber: { non_subscriptions: {}, subscriptions: {} } }));
    }) as unknown as typeof fetch;
    try {
      assert.equal((await POST(mk({ rcAppUserId: 'bad id!' }))).status, 400);
      delete process.env.REVENUECAT_SECRET_API_KEY;
      assert.equal((await POST(mk({ rcAppUserId: UID }))).status, 503); assert.deepEqual(log, []);
      process.env.REVENUECAT_SECRET_API_KEY = 'sk_test';
      rl = 1; assert.equal((await POST(mk({ rcAppUserId: UID }))).status, 429); assert.deepEqual(log, ['rl']);
      rl = 0; log.length = 0;
      const res = await POST(mk({ rcAppUserId: UID }));
      assert.equal(res.status, 200); assert.deepEqual(await res.json(), { ok: true, status: 'no_purchase' }); assert.deepEqual(log, ['rl', 'rc:GET']);
    } finally { globalThis.fetch = realFetch; delete process.env.REVENUECAT_SECRET_API_KEY; delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; }
  });
  console.log(`\n✅ promoYear: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
