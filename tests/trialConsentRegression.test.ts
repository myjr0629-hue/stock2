/** Offline regressions: real controller/route/Redis wrapper; SDK and all transport mocked. */
import assert from 'node:assert/strict';
import Module from 'node:module';
function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const tick = () => new Promise<void>((r) => setImmediate(r));
const NOW = Date.parse('2026-10-14T00:00:00Z');
const entitlement = {
  isActive: true, willRenew: true, periodType: 'TRIAL', store: 'APP_STORE', ownershipType: 'PURCHASED',
  productIdentifier: 'offline-product', latestPurchaseDate: '2026-09-20T00:00:00Z', expirationDate: '2026-10-20T00:00:00Z',
};
const stale = { entitlements: { active: { pro: entitlement } } };
const cancelled = { entitlements: { active: { pro: { ...entitlement, willRenew: false } } } };
let invalidated = false, invalidateFails = false;
let customerResult: Promise<{ customerInfo: typeof stale }> | null = null;
const sdkCalls: string[] = [];
mock('@capacitor/core', { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } });
mock('../src/services/revenueCat', { initRevenueCat: async () => true });
mock('@revenuecat/purchases-capacitor', { Purchases: {
  invalidateCustomerInfoCache: async () => {
    sdkCalls.push('invalidate');
    if (invalidateFails) throw new Error('offline');
    invalidated = true;
  },
  getCustomerInfo: async () => {
    sdkCalls.push('customer');
    return invalidated ? customerResult ?? { customerInfo: cancelled } : { customerInfo: stale };
  },
  getStorefront: async () => ({ countryCode: 'KR' }),
  getProducts: async () => ({ products: [] }),
} });
// Only synthetic transport configuration. No environment files or external I/O.
process.env.EC2_REDIS_PROXY_URL = 'http://redis.invalid';
process.env.EC2_REDIS_PROXY_KEY = '';
process.env.REDIS_PROXY_KEY = '';
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
delete process.env.TRIAL_CONSENT_OFF;
let switchResponse = () => Promise.resolve(new Response('{"result":null}'));
let otherResponse = deferred<Response>();
let fallbackResponse = deferred<Response>();
let upstashReads = 0;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url === '/api/app/trial-consent-config') return new Response('{"enabled":true}');
  if (url.startsWith('http://redis.invalid/get?')) {
    assert.equal(init?.method ?? 'GET', 'GET');
    return new URL(url).searchParams.get('key') === 'trial-consent:off' ? switchResponse() : otherResponse.promise;
  }
  if (url.startsWith('https://upstash.invalid')) {
    const commands = JSON.parse(String(init?.body));
    assert.ok(JSON.stringify(commands).toUpperCase().includes('"GET"'));
    upstashReads++;
    return fallbackResponse.promise;
  }
  throw new Error('Unexpected network request blocked');
}) as typeof fetch;
import { loadTrialConsentSnapshot } from '../src/services/trialConsent';
import { createTrialConsentController, type TrialConsentSnapshot } from '../src/lib/app/trialConsentController';
import { emptyTrialConsentMemory } from '../src/lib/app/trialConsent';
import * as redis from '../src/services/redisClient';
import { GET } from '../src/app/api/app/trial-consent-config/route';
let passed = 0, failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  invalidated = false; invalidateFails = false; customerResult = null; sdkCalls.length = 0;
  redis._resetEcBreakerForTest(); upstashReads = 0;
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { failed++; console.error(`✗ ${name}`, error); }
}
async function main() {
  await test('first dashboard entry after settings cancellation never publishes cached trial', async () => {
    const published: unknown[] = [];
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { published.push(v); }, track: () => {}, now: () => NOW,
    });
    await controller.refresh(true);
    assert.deepEqual(sdkCalls, ['invalidate', 'customer']);
    assert.ok(published.length > 0 && published.every((view) => view === null));
    controller.dispose();
  });
  await test('fresh read invalidates cached willRenew=true before evaluating cancellation', async () => {
    assert.equal(await loadTrialConsentSnapshot({ freshCustomerInfo: true }), null);
    assert.deepEqual(sdkCalls, ['invalidate', 'customer']);
  });
  await test('invalidation failure cannot fall back to cached CustomerInfo', async () => {
    invalidateFails = true;
    await assert.rejects(loadTrialConsentSnapshot({ freshCustomerInfo: true }));
    assert.deepEqual(sdkCalls, ['invalidate']);
  });
  await test('management waits for resume, hides during fresh read, coalesces duplicate resume/listener', async () => {
    let view: unknown = null;
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { view = v; }, track: () => {}, now: () => NOW,
    });
    customerResult = Promise.resolve({ customerInfo: stale });
    await controller.refresh(); assert.ok(view);
    assert.equal(controller.manage(), 'APP_STORE'); assert.equal(view, null);
    sdkCalls.length = 0;
    await controller.refresh(); assert.deepEqual(sdkCalls, []);
    const fresh = deferred<{ customerInfo: typeof stale }>(); customerResult = fresh.promise;
    const resume = controller.resume(); await tick();
    assert.equal(view, null);
    const duplicate = controller.resume(); const listener = controller.refresh(true);
    await tick(); assert.deepEqual(sdkCalls, ['invalidate', 'customer']);
    fresh.resolve({ customerInfo: cancelled }); await Promise.all([resume, duplicate, listener]);
    assert.equal(view, null); controller.dispose();
  });
  await test('failed fresh read stays hidden without retries until the next entry', async () => {
    let view: unknown = null;
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { view = v; }, track: () => {}, now: () => NOW,
    });
    customerResult = Promise.resolve({ customerInfo: stale });
    await controller.refresh(); controller.manage(); invalidateFails = true;
    await controller.resume(); assert.equal(view, null);
    invalidateFails = false; customerResult = Promise.resolve({ customerInfo: stale });
    sdkCalls.length = 0; await controller.refresh();
    await controller.resume(); await controller.refresh(true);
    assert.deepEqual(sdkCalls, []); assert.equal(view, null);
    controller.suspend(); await controller.resume();
    assert.deepEqual(sdkCalls, ['invalidate', 'customer']); assert.ok(view);
    controller.dispose();
  });
  await test('management close alone invalidates before reading cancellation and releases SDK updates', async () => {
    let view: unknown = null;
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { view = v; }, track: () => {}, now: () => NOW,
    });
    customerResult = Promise.resolve({ customerInfo: stale });
    await controller.refresh(); controller.manage();
    invalidated = false; customerResult = null; sdkCalls.length = 0;
    await controller.managementClosed();
    assert.deepEqual(sdkCalls, ['invalidate', 'customer']); assert.equal(view, null);
    await controller.managementClosed(); await controller.resume();
    assert.deepEqual(sdkCalls, ['invalidate', 'customer']);
    controller.dispose();
  });
  for (const hide of [false, true]) {
    await test(`missing return events: ${hide ? 'SDK update' : 'poll'} resumes at ten-minute boundary`, async () => {
      let time = NOW, view: unknown = null;
      const controller = createTrialConsentController({
        locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
        saveMemory: () => {}, publish: (v) => { view = v; }, track: () => {}, now: () => time,
      });
      customerResult = Promise.resolve({ customerInfo: stale });
      await controller.refresh(); controller.manage(); sdkCalls.length = 0;
      time += 10 * 60_000 - 1;
      await controller.refresh(hide); assert.deepEqual(sdkCalls, []); assert.equal(view, null);
      time++;
      await Promise.all([controller.refresh(hide), controller.refresh(!hide)]);
      assert.deepEqual(sdkCalls, ['invalidate', 'customer']); assert.ok(view);
      await controller.refresh(hide);
      assert.deepEqual(sdkCalls, ['invalidate', 'customer', 'customer']);
      // A real close after the fallback must still observe a later cancellation.
      invalidated = false; customerResult = null; sdkCalls.length = 0;
      await controller.managementClosed();
      assert.deepEqual(sdkCalls, ['invalidate', 'customer']); assert.equal(view, null);
      await controller.managementClosed(); await controller.resume();
      assert.deepEqual(sdkCalls, ['invalidate', 'customer']); controller.dispose();
    });
  }
  await test('deadline and browser close cannot resume an inactive app', async () => {
    let time = NOW;
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: () => {}, track: () => {}, now: () => time,
    });
    customerResult = Promise.resolve({ customerInfo: stale });
    await controller.refresh(); controller.manage(); controller.suspend(); sdkCalls.length = 0;
    time += 10 * 60_000;
    await controller.refresh(); await controller.managementClosed();
    assert.deepEqual(sdkCalls, []);
    await controller.resume(); assert.deepEqual(sdkCalls, ['invalidate', 'customer']);
    controller.dispose();
  });
  await test('late fallback read cannot overwrite management close and disposed callbacks cannot read', async () => {
    let time = NOW, view: unknown = null;
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { view = v; }, track: () => {}, now: () => time,
    });
    customerResult = Promise.resolve({ customerInfo: stale });
    await controller.refresh(); controller.manage(); time += 10 * 60_000;
    const late = deferred<{ customerInfo: typeof stale }>(); customerResult = late.promise;
    const fallback = controller.refresh(); await tick();
    customerResult = null; await controller.managementClosed();
    late.resolve({ customerInfo: stale }); await fallback; assert.equal(view, null);
    customerResult = Promise.resolve({ customerInfo: stale });
    controller.suspend(); await controller.resume(); controller.manage(); controller.dispose();
    sdkCalls.length = 0; time += 10 * 60_000;
    await controller.refresh(); await controller.managementClosed(); await controller.resume();
    assert.deepEqual(sdkCalls, []);
  });
  await test('late pre-management cached read cannot revive notice during resume', async () => {
    const snapshot = { customerInfo: stale, products: [], countryCode: 'KR', platform: 'ios', enabled: true } as TrialConsentSnapshot;
    let view: unknown = null;
    let load = async () => snapshot;
    const controller = createTrialConsentController({
      locale: 'ko', load: () => load(), readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { view = v; }, track: () => {}, now: () => NOW,
    });
    await controller.refresh();
    const cached = deferred<TrialConsentSnapshot>(); load = () => cached.promise;
    const old = controller.refresh(); controller.manage();
    const fresh = deferred<TrialConsentSnapshot>(); load = () => fresh.promise;
    const resume = controller.resume(); cached.resolve(snapshot); await old;
    assert.equal(view, null);
    fresh.resolve({ ...snapshot, customerInfo: cancelled } as TrialConsentSnapshot); await resume;
    assert.equal(view, null); controller.dispose();
  });
  await test('fresh CustomerInfo timeout stays hidden and late success cannot publish', async () => {
    let view: unknown = null;
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { view = v; }, track: () => {}, now: () => NOW,
    });
    customerResult = Promise.resolve({ customerInfo: stale });
    await controller.refresh(); controller.manage();
    const late = deferred<{ customerInfo: typeof stale }>(); customerResult = late.promise;
    // Only compress the service's five-second deadline; no network or wall-clock mutation.
    const timeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void, ms?: number, ...args: unknown[]) =>
      timeout(fn, ms === 5_000 ? 10 : ms, ...args)) as typeof setTimeout;
    try {
      await controller.resume(); assert.equal(view, null);
      late.resolve({ customerInfo: stale }); await tick(); assert.equal(view, null);
    } finally { globalThis.setTimeout = timeout; controller.dispose(); }
  });
  await test('entry coalesces pending and settled resume/listener/poll events to one invalidation', async () => {
    let view: unknown = null;
    const published: unknown[] = [];
    const fresh = deferred<{ customerInfo: typeof stale }>(); customerResult = fresh.promise;
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { view = v; published.push(v); }, track: () => {}, now: () => NOW,
    });
    const entry = controller.refresh(); await tick();
    const resume = controller.resume(), listener = controller.refresh(true), poll = controller.refresh();
    await tick(); assert.deepEqual(sdkCalls, ['invalidate', 'customer']);
    assert.ok(published.every((v) => v === null));
    fresh.resolve({ customerInfo: stale }); await Promise.all([entry, resume, listener, poll]);
    assert.ok(view);
    await controller.resume(); await controller.refresh(true); await controller.refresh();
    assert.equal(sdkCalls.filter((call) => call === 'invalidate').length, 1);
    controller.dispose();
  });
  await test('background cancellation requires a new read and duplicate hidden events share one entry', async () => {
    let view: unknown = null;
    customerResult = Promise.resolve({ customerInfo: stale });
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { view = v; }, track: () => {}, now: () => NOW,
    });
    await controller.refresh(); assert.ok(view);
    controller.suspend(); controller.suspend(); assert.equal(view, null);
    sdkCalls.length = 0; await controller.refresh(); assert.deepEqual(sdkCalls, []);
    // Store cancellation with the SDK still holding its previous active trial.
    invalidated = false; customerResult = null;
    await controller.resume(); await controller.resume(); await controller.refresh(true); await controller.refresh();
    assert.equal(view, null); assert.deepEqual(sdkCalls, ['invalidate', 'customer']);
    controller.dispose();
  });
  await test('dashboard remount after settings cancellation cannot reuse the previous entry', async () => {
    let view: unknown = null;
    const deps = {
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v: unknown) => { view = v; }, track: () => {}, now: () => NOW,
    };
    customerResult = Promise.resolve({ customerInfo: stale });
    const first = createTrialConsentController(deps); await first.refresh(); assert.ok(view); first.dispose();
    invalidated = false; customerResult = null; sdkCalls.length = 0;
    const second = createTrialConsentController(deps); await second.refresh();
    assert.equal(view, null); assert.deepEqual(sdkCalls, ['invalidate', 'customer']); second.dispose();
  });
  await test('late first-entry read cannot overwrite a newer cancelled entry', async () => {
    let view: unknown = null;
    const oldResult = deferred<{ customerInfo: typeof stale }>(); customerResult = oldResult.promise;
    const controller = createTrialConsentController({
      locale: 'ko', load: loadTrialConsentSnapshot, readMemory: emptyTrialConsentMemory,
      saveMemory: () => {}, publish: (v) => { view = v; }, track: () => {}, now: () => NOW,
    });
    const old = controller.refresh(); await tick(); controller.suspend();
    customerResult = null; invalidated = false; await controller.resume();
    oldResult.resolve({ customerInfo: stale }); await old;
    await controller.refresh(); assert.equal(view, null);
    assert.equal(sdkCalls.filter((call) => call === 'invalidate').length, 2); controller.dispose();
  });
  await test('switch failure stays off when concurrent Redis success changes global health', async () => {
    otherResponse = deferred<Response>(); fallbackResponse = deferred<Response>();
    switchResponse = async () => new Response('{}', { status: 503 });
    const other = redis.getFromCache('unrelated:read');
    const pending = GET(); await tick();
    otherResponse.resolve(new Response('{"result":1}')); await other;
    assert.equal(redis.getRedisStatus().ecProxyAvailable, true);
    fallbackResponse.resolve(new Response('[{"result":null}]'));
    assert.deepEqual(await (await pending).json(), { enabled: false });
  });
  await test('successful but malformed switch reply is unknown and stays off', async () => {
    for (const body of [{}, null, [], { result: null, error: 'unavailable' }]) {
      switchResponse = async () => new Response(JSON.stringify(body));
      assert.deepEqual(await (await GET()).json(), { enabled: false });
    }
  });
  await test('confirmed missing switch retains default-on convention without fallback', async () => {
    switchResponse = async () => new Response('{"result":null}');
    assert.deepEqual(await (await GET()).json(), { enabled: true });
    assert.equal(upstashReads, 0);
  });
  await test('confirmed off and unknown switch values stay off', async () => {
    for (const value of [1, '1', true, {}, [], 'unknown']) {
      switchResponse = async () => new Response(JSON.stringify({ result: value }));
      assert.deepEqual(await (await GET()).json(), { enabled: false });
    }
    assert.equal(upstashReads, 0);
  });
  await test('cooldown and HTTP failures cannot consult fallback to enable the switch', async () => {
    let reads = 0;
    switchResponse = async () => { reads++; return new Response('{}', { status: 503 }); };
    assert.deepEqual(await (await GET()).json(), { enabled: false });
    assert.deepEqual(await (await GET()).json(), { enabled: false });
    assert.equal(reads, 1); assert.equal(upstashReads, 0);
  });
  await test('switch timeout returns off even if the read later succeeds', async () => {
    const late = deferred<Response>(); switchResponse = () => late.promise;
    const response = await GET(); assert.deepEqual(await response.json(), { enabled: false });
    late.resolve(new Response('{"result":null}')); await tick();
    assert.equal(upstashReads, 0);
  });
  console.log(`trialConsentRegression: ${passed} passed, ${failed} failed (offline)`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
