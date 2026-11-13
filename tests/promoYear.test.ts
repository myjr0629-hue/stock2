/**
 * «1년 PRO 이용권(자동 갱신 없음)» — 판정(planPromoYear) · 부여(ensurePromoYear, 가짜 RC) · 웹훅 거름 · 앱 재조회 순서 · 웹훅 라우트
 * 실행: node_modules/.bin/npx tsx tests/promoYear.test.ts
 */
import assert from 'node:assert/strict';
import { PROMO_YEAR_MS, PROMO_YEAR_PRODUCT_ID, ensurePromoYear, planPromoYear, promoYearFromWebhook } from '../src/lib/promoYear/core';
import { claimPromoYear, refreshProAfterRedeem } from '../src/lib/app/redeem';

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) { await fn(); n++; console.log('  ✓', name); }
const NOW = Date.parse('2026-11-14T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const UID = '$RCAnonymousID:0123456789abcdef0123456789abcdef';
const subWith = (purchases: Array<{ at: number; store?: string }>, subs: Record<string, unknown> = {}) => ({
  subscriber: {
    non_subscriptions: { [PROMO_YEAR_PRODUCT_ID]: purchases.map((p, i) => ({ id: `x${i}`, purchase_date: iso(p.at), store: p.store ?? 'app_store', is_sandbox: false })) },
    subscriptions: subs, entitlements: {},
  },
});

(async () => {
  await t('구매 없음 → none/no_purchase', () => {
    assert.deepEqual(planPromoYear({ subscriber: { non_subscriptions: {}, subscriptions: {} } }, NOW), { kind: 'none', why: 'no_purchase' });
    assert.deepEqual(planPromoYear(null, NOW), { kind: 'none', why: 'no_purchase' });
  });
  await t('구매 1건 → 구매 + 365일', () => {
    const at = NOW - 3600_000;
    assert.deepEqual(planPromoYear(subWith([{ at }]), NOW), { kind: 'grant', purchaseMs: at, endMs: at + PROMO_YEAR_MS });
  });
  await t('여러 건이면 가장 최근 구매 기준 · 다른 스토어·미래 이상값은 무시', () => {
    const a = NOW - 200 * 86400_000, b = NOW - 86400_000;
    const p = planPromoYear(subWith([{ at: b }, { at: a }, { at: NOW - 1000, store: 'play_store' }, { at: NOW + 3600_000 }]), NOW);
    assert.deepEqual(p, { kind: 'grant', purchaseMs: b, endMs: b + PROMO_YEAR_MS });
  });
  await t('웹훅 구매 시각 힌트 — 고객 기록에 아직 없을 때만 쓴다 · 미래 이상값 무시', () => {
    const empty = { subscriber: { non_subscriptions: {}, subscriptions: {} } };
    assert.deepEqual(planPromoYear(empty, NOW, NOW - 5000), { kind: 'grant', purchaseMs: NOW - 5000, endMs: NOW - 5000 + PROMO_YEAR_MS });
    assert.deepEqual(planPromoYear(empty, NOW, NOW + 3600_000), { kind: 'none', why: 'no_purchase' });
    const at = NOW - 86400_000;
    assert.equal((planPromoYear(subWith([{ at }]), NOW, NOW - 5000) as { purchaseMs: number }).purchaseMs, at);
  });
  await t('366일 전 구매 → expired', () => {
    assert.deepEqual(planPromoYear(subWith([{ at: NOW - 366 * 86400_000 }]), NOW), { kind: 'none', why: 'expired' });
  });
  await t('이미 같은 만료의 프로모셔널 pro → covered · 하루 넘게 짧으면 다시 붙인다 · 평생 프로모셔널도 covered', () => {
    const at = NOW - 3600_000, end = at + PROMO_YEAR_MS;
    assert.equal(planPromoYear(subWith([{ at }], { rc_promo_pro_custom: { store: 'promotional', expires_date: iso(end) } }), NOW).kind, 'none');
    assert.equal(planPromoYear(subWith([{ at }], { rc_promo_pro_monthly: { store: 'promotional', expires_date: iso(NOW + 30 * 86400_000) } }), NOW).kind, 'grant');
    assert.equal(planPromoYear(subWith([{ at }], { rc_promo_pro_custom: { store: 'promotional', expires_date: iso(end - 86400_000) } }), NOW).kind, 'grant');   // 하루 짧으면 다시
    assert.equal(planPromoYear(subWith([{ at }], { rc_promo_pro_lifetime: { store: 'promotional', expires_date: null } }), NOW).kind, 'none');
    // 유료 연간 구독(앱스토어)은 덮지 않는다 — 해지·환불돼도 1년 이용권은 남아야 한다
    assert.equal(planPromoYear(subWith([{ at }], { 'com.signumhq.app.pro.annual': { store: 'app_store', expires_date: iso(end + 1e9) } }), NOW).kind, 'grant');
  });

  // 가짜 RC
  const fakeRc = (subscriber: unknown, grantStatus = 201) => {
    const calls: Array<{ method: string; url: string; body?: unknown; auth?: string }> = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ method: String(init.method), url, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: (init.headers as Record<string, string>).Authorization });
      if (init.method === 'GET') return new Response(JSON.stringify(subscriber), { status: 200 });
      return new Response('{}', { status: grantStatus });
    }) as unknown as typeof fetch;
    return { f, calls };
  };
  await t('키 없음 → unavailable/no_key · RC 를 부르지 않는다', async () => {
    const rc = fakeRc(subWith([{ at: NOW }]));
    assert.deepEqual(await ensurePromoYear(UID, { secret: '', fetchImpl: rc.f, now: () => NOW }), { kind: 'unavailable', why: 'no_key' });
    assert.equal(rc.calls.length, 0);
  });
  await t('형식이 틀린 ID → none/uid · RC 를 부르지 않는다', async () => {
    const rc = fakeRc(subWith([{ at: NOW }]));
    assert.deepEqual(await ensurePromoYear('bad id!', { secret: 'sk_test', fetchImpl: rc.f, now: () => NOW }), { kind: 'none', why: 'uid' });
    assert.equal(rc.calls.length, 0);
  });
  await t('구매 있음 → GET 후 POST promotional { end_time_ms } (pro)', async () => {
    const at = NOW - 60_000; const rc = fakeRc(subWith([{ at }]));
    assert.deepEqual(await ensurePromoYear(UID, { secret: 'sk_test', fetchImpl: rc.f, now: () => NOW }), { kind: 'granted', endMs: at + PROMO_YEAR_MS });
    assert.equal(rc.calls.length, 2);
    assert.equal(rc.calls[1].method, 'POST');
    assert.equal(rc.calls[1].url, `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(UID)}/entitlements/pro/promotional`);
    assert.deepEqual(rc.calls[1].body, { end_time_ms: at + PROMO_YEAR_MS });
    assert.equal(rc.calls[1].auth, 'Bearer sk_test');
  });
  await t('구매 없음 → GET 만 · 부여 실패 → unavailable/grant', async () => {
    const none = fakeRc({ subscriber: { non_subscriptions: {}, subscriptions: {} } });
    assert.deepEqual(await ensurePromoYear(UID, { secret: 'sk', fetchImpl: none.f, now: () => NOW }), { kind: 'none', why: 'no_purchase' });
    assert.equal(none.calls.length, 1);
    const bad = fakeRc(subWith([{ at: NOW }]), 500);
    assert.deepEqual(await ensurePromoYear(UID, { secret: 'sk', fetchImpl: bad.f, now: () => NOW }), { kind: 'unavailable', why: 'grant' });
  });
  await t('웹훅 거름 — 이 상품의 앱스토어 실제 구매만(프로모셔널 부여 이벤트·다른 상품 제외)', () => {
    const ev = (o: Record<string, unknown>) => ({ event: { type: 'NON_RENEWING_PURCHASE', product_id: PROMO_YEAR_PRODUCT_ID, store: 'APP_STORE', period_type: 'NORMAL', app_user_id: UID, ...o } });
    assert.deepEqual(promoYearFromWebhook(ev({})), { uid: UID });
    assert.deepEqual(promoYearFromWebhook(ev({ purchased_at_ms: NOW })), { uid: UID, purchaseMs: NOW });
    assert.equal(promoYearFromWebhook(ev({ period_type: 'PROMOTIONAL' })), null);
    assert.equal(promoYearFromWebhook(ev({ product_id: 'rc_promo_pro_custom', store: 'PROMOTIONAL' })), null);
    assert.equal(promoYearFromWebhook(ev({ type: 'INITIAL_PURCHASE' })), null);
    assert.equal(promoYearFromWebhook(ev({ product_id: 'com.signumhq.app.pro.annual' })), null);
    assert.equal(promoYearFromWebhook(null), null);
  });
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
  await t('웹훅 라우트: 코호트 기록 먼저 → 부여 · 키 없음/RC 장애면 503(재시도) · 부여되면 200 · 다른 이벤트는 RC 를 부르지 않는다', async () => {
    process.env.REVENUECAT_WEBHOOK_AUTH = 'test-auth'; process.env.RC_COHORT_HMAC_SECRET = 'test-secret';
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.local'; process.env.UPSTASH_REDIS_REST_TOKEN = 'fake';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('../src/app/api/webhooks/revenuecat/route');
    const mkBody = (o: Record<string, unknown> = {}) => JSON.stringify({ event: { id: 'e1', type: 'NON_RENEWING_PURCHASE', product_id: PROMO_YEAR_PRODUCT_ID, store: 'APP_STORE', period_type: 'NORMAL', app_user_id: UID, event_timestamp_ms: Date.now(), purchased_at_ms: Date.now() - 1000, environment: 'SANDBOX', ...o } });
    const mk = (o?: Record<string, unknown>) => new Request('http://local', { method: 'POST', headers: { authorization: 'test-auth' }, body: mkBody(o) });
    const realFetch = globalThis.fetch; const log: string[] = []; let rcStatus = 500;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://fake-upstash.local')) {   // Upstash 자동 파이프라인(/pipeline) — 배열로 답한다
        log.push('cohort'); const one = { result: 1 };
        return new Response(JSON.stringify(u.endsWith('/pipeline') ? JSON.parse(String(init.body)).map(() => one) : one), { status: 200 });
      }
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
      assert.equal((await POST(mk())).status, 200); assert.deepEqual(log, ['cohort', 'rc:GET', 'rc:POST']);   // 기록에 아직 없어도 웹훅 구매 시각으로 부여
      log.length = 0;
      assert.equal((await POST(mk({ product_id: 'com.signumhq.app.pro.annual', type: 'INITIAL_PURCHASE' }))).status, 200); assert.deepEqual(log, ['cohort']);
      log.length = 0;
      assert.equal((await POST(mk({ type: 'TEST' }))).status, 200); assert.deepEqual(log, []);
    } finally { globalThis.fetch = realFetch; delete process.env.REVENUECAT_SECRET_API_KEY; delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; }
  });
  await t('앱 라우트 /api/app/promo-year: 형식 400 · 키 없음 503 · 예산 초과 429(RC 안 부름) · 통과 → RC 판정 결과', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash.local'; process.env.UPSTASH_REDIS_REST_TOKEN = 'fake';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require('../src/app/api/app/promo-year/route');
    const mk = (b: unknown) => new Request('http://local', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body: JSON.stringify(b) });
    const realFetch = globalThis.fetch; const log: string[] = []; let rl = 0;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://fake-upstash.local')) { log.push('rl'); const one = { result: rl }; return new Response(JSON.stringify(u.endsWith('/pipeline') ? JSON.parse(String(init.body)).map(() => one) : one)); }
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
    } finally { globalThis.fetch = realFetch; delete process.env.REVENUECAT_SECRET_API_KEY; }
  });
  console.log(`\n✅ promoYear: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
