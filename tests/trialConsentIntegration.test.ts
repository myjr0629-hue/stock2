/** Offline integration: all SDK, network, native navigation and Redis calls are stubbed. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { PRO_MONTHLY_PRODUCT_ID } from '../src/config/iap';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
let platform = 'ios', available = true, configured = true, country: string | null = 'KOR';
let productFailure = false, customerFailure = false;
const calls: string[] = [], opened: string[] = [];
const customerInfo = {
  entitlements: { active: { pro: { isActive: true, willRenew: true, periodType: 'TRIAL', productIdentifier: PRO_MONTHLY_PRODUCT_ID } } },
};
let callback: (() => void) | null = null;
mock('@capacitor/core', { Capacitor: { isNativePlatform: () => available, getPlatform: () => platform } });
mock('../src/services/revenueCat', { initRevenueCat: async () => { calls.push('init'); return configured; } });
mock('../src/lib/native/capacitorBridge', { openExternalUrl: async (url: string) => { opened.push(url); } });
mock('@revenuecat/purchases-capacitor', { Purchases: {
  getCustomerInfo: async () => { calls.push('customer'); if (customerFailure) throw new Error('offline'); return { customerInfo }; },
  getStorefront: async () => { calls.push('storefront'); if (!country) throw new Error('unavailable'); return { countryCode: country }; },
  getProducts: async (options: { productIdentifiers: string[] }) => {
    calls.push('products'); assert.deepEqual(options.productIdentifiers, [PRO_MONTHLY_PRODUCT_ID]);
    if (productFailure) throw new Error('unavailable');
    return { products: [{ identifier: PRO_MONTHLY_PRODUCT_ID, subscriptionPeriod: 'P1M', priceString: '₩13,000' }] };
  },
  addCustomerInfoUpdateListener: async (cb: () => void) => { callback = cb; calls.push('listen'); return 'local-listener'; },
  removeCustomerInfoUpdateListener: async () => { callback = null; calls.push('unlisten'); },
} });

let redis: unknown = null, redisThrows = false, redisSlow = false, healthy = true;
const writes = new Map<string, unknown>();
mock('../src/services/redisClient', {
  getFromCache: async (key: string) => {
    if (key !== 'trial-consent:off') return writes.get(key) ?? null;
    calls.push('config-read');
    if (redisThrows) throw new Error('offline');
    if (redisSlow) return new Promise(() => {});
    return redis;
  },
  getAuthoritativeCache: async (key: string) => {
    assert.equal(key, 'trial-consent:off'); calls.push('config-read');
    if (redisThrows) throw new Error('offline');
    if (redisSlow) return new Promise(() => {});
    return { ok: healthy, value: redis };
  },
  setInCache: async (key: string, value: unknown) => { writes.set(key, value); return true; },
});
const server = require('next/server');
const afters: Promise<void>[] = [];
mock('next/server', { ...server, after: (work: () => Promise<void>) => { afters.push(work()); } });

import { GET } from '../src/app/api/app/trial-consent-config/route';
import { POST } from '../src/app/api/funnel-hit/route';
import { loadTrialConsentSnapshot, listenTrialConsentUpdates } from '../src/services/trialConsent';
import { openSubscriptionManagement } from '../src/lib/app/subscriptionManagement';
import { trackFunnel } from '../src/lib/app/funnel';

let fetchMode: 'on' | 'off' | 'bad' | 'error' = 'on';
const requests: string[] = [];
globalThis.fetch = (async (url: string, options?: RequestInit) => {
  requests.push(url);
  assert.equal(url, '/api/app/trial-consent-config');
  assert.equal(options?.cache, 'no-store');
  if (fetchMode === 'error') throw new Error('offline');
  return { ok: true, json: async () => fetchMode === 'bad' ? { enabled: 'true' } : { enabled: fetchMode === 'on' } };
}) as typeof fetch;

let count = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  calls.length = 0; requests.length = 0;
  await fn(); count++; console.log(`✓ ${name}`);
}
async function main() {
  await test('native SDK reads installed storefront and entitled product', async () => {
    const snapshot = await loadTrialConsentSnapshot();
    assert.equal(snapshot?.countryCode, 'KOR'); assert.equal(snapshot?.products[0].priceString, '₩13,000');
    assert.deepEqual(calls, ['init', 'customer', 'storefront', 'products']);
  });
  await test('web makes zero config or SDK calls', async () => {
    available = false; assert.equal(await loadTrialConsentSnapshot(), null); available = true;
    assert.deepEqual(calls, []); assert.deepEqual(requests, []);
  });
  await test('remote off or malformed response makes zero SDK calls', async () => {
    for (const mode of ['off', 'bad'] as const) { fetchMode = mode; assert.equal(await loadTrialConsentSnapshot(), null); }
    assert.deepEqual(calls, []); fetchMode = 'on';
  });
  await test('network, customer or unknown storefront fails closed', async () => {
    fetchMode = 'error'; await assert.rejects(loadTrialConsentSnapshot()); fetchMode = 'on';
    customerFailure = true; await assert.rejects(loadTrialConsentSnapshot()); customerFailure = false;
    country = null; await assert.rejects(loadTrialConsentSnapshot()); country = 'KOR';
    assert.ok(!calls.includes('products'));
  });
  await test('SDK unavailable, foreign country, paid and cancelled do not fetch price', async () => {
    configured = false; assert.equal(await loadTrialConsentSnapshot(), null); configured = true;
    country = 'US'; assert.equal(await loadTrialConsentSnapshot(), null); country = 'KR';
    customerInfo.entitlements.active.pro.periodType = 'NORMAL'; assert.equal(await loadTrialConsentSnapshot(), null);
    customerInfo.entitlements.active.pro.periodType = 'TRIAL';
    customerInfo.entitlements.active.pro.willRenew = false; assert.equal(await loadTrialConsentSnapshot(), null);
    customerInfo.entitlements.active.pro.willRenew = true;
    assert.ok(!calls.includes('products'));
  });
  await test('product read failure retains trial with omitted price', async () => {
    productFailure = true; const snapshot = await loadTrialConsentSnapshot(); productFailure = false;
    assert.ok(snapshot?.customerInfo); assert.deepEqual(snapshot.products, []);
  });
  await test('Android uses its SDK storefront with the same API', async () => {
    platform = 'android'; country = 'KR'; const snapshot = await loadTrialConsentSnapshot();
    assert.equal(snapshot?.platform, 'android'); assert.equal(snapshot.countryCode, 'KR'); platform = 'ios';
  });
  await test('SDK update listener is removed', async () => {
    let updated = 0; const off = await listenTrialConsentUpdates(() => { updated++; });
    callback?.(); assert.equal(updated, 1); off(); await Promise.resolve(); assert.equal(callback, null);
  });
  await test('settings keeps existing default navigation, card follows entitlement store', async () => {
    let ios = true;
    (globalThis as any).document = { documentElement: { classList: { contains: () => ios } } };
    await openSubscriptionManagement(); ios = false; await openSubscriptionManagement();
    await openSubscriptionManagement('APP_STORE'); await openSubscriptionManagement('PLAY_STORE');
    assert.deepEqual(opened, [
      'https://apps.apple.com/account/subscriptions', 'https://play.google.com/store/account/subscriptions',
      'https://apps.apple.com/account/subscriptions', 'https://play.google.com/store/account/subscriptions',
    ]);
  });
  await test('server switch missing/on/off and no-cache response', async () => {
    delete process.env.TRIAL_CONSENT_OFF;
    const response = await GET(); assert.deepEqual(await response.json(), { enabled: true });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    redis = 1; assert.deepEqual(await (await GET()).json(), { enabled: false });
    redis = null; process.env.TRIAL_CONSENT_OFF = '1'; calls.length = 0;
    assert.deepEqual(await (await GET()).json(), { enabled: false }); assert.deepEqual(calls, []);
    delete process.env.TRIAL_CONSENT_OFF;
  });
  await test('Redis error, ambiguous null from unhealthy backend and timeout hide notice', async () => {
    redisThrows = true; assert.deepEqual(await (await GET()).json(), { enabled: false }); redisThrows = false;
    healthy = false; assert.deepEqual(await (await GET()).json(), { enabled: false }); healthy = true;
    redisSlow = true; assert.deepEqual(await (await GET()).json(), { enabled: false }); redisSlow = false;
  });
  await test('new beacon stages contain only existing allowed fields; Android included', async () => {
    const beacons: string[] = [];
    (globalThis as any).window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } };
    mock('@capacitor/app', { App: { getInfo: async () => ({ version: '1.0' }) } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: (url: string) => { beacons.push(url); return true; } } });
    for (const stage of ['trial_notice_show', 'trial_notice_manage', 'trial_notice_snooze'] as const) trackFunnel(stage, { src: 'trial_notice' });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(beacons.length, 3);
    for (const url of beacons) {
      const params = new URL(url, 'https://local.invalid').searchParams;
      assert.deepEqual([...params.keys()].sort(), ['p', 's', 'st', 'v']);
      assert.equal(params.get('p'), 'android'); assert.equal(params.get('s'), 'trial_notice');
    }
  });
  await test('funnel route accepts all three stages using only in-memory counters', async () => {
    process.env.VERCEL_ENV = 'preview';
    for (const stage of ['trial_notice_show', 'trial_notice_manage', 'trial_notice_snooze']) {
      const response = await POST(new server.NextRequest(`https://local.invalid/api/funnel-hit?st=${stage}&s=trial_notice&p=ios&v=1.0`, { method: 'POST' }));
      assert.equal(response.status, 204);
    }
    await Promise.all(afters);
    assert.equal([...writes.keys()].filter((key) => key.startsWith('fxp:trial_notice_')).length, 3);
    for (const [key, value] of writes) { if (key.startsWith('fxp:trial_notice_')) assert.equal(value, 1); }
    assert.ok([...writes.keys()].every((key) => key.startsWith('fxp:')));
  });
  console.log(`trialConsentIntegration: ${count} passed (no real external I/O)`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
