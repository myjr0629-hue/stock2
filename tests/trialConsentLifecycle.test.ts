/** Offline component effects: no browser, native SDK, storage or network access. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import type { TrialConsentSnapshot, TrialConsentView } from '../src/lib/app/trialConsentController';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const effects: Array<() => (() => void) | undefined> = [];
const refs: Array<{ current: unknown }> = [];
let view: TrialConsentView | null = null;
mock('react', {
  useEffect: (effect: typeof effects[number]) => { effects.push(effect); },
  useRef: (current: unknown) => { const ref = { current }; refs.push(ref); return ref; },
  useState: () => [null, (next: TrialConsentView | null) => { view = next; }],
});
mock('../src/components/app/TrialConsentNotice.module.css', {});
mock('../src/lib/app/funnel', { trackFunnel: () => {} });
mock('../src/lib/app/subscriptionManagement', { openSubscriptionManagement: () => {} });
let native: ((state: { isActive: boolean }) => void) | undefined;
let removed = 0;
mock('@capacitor/app', { App: {
  addListener: async (event: string, listener: typeof native) => {
    assert.equal(event, 'appStateChange'); native = listener;
    return { remove: async () => { removed++; native = undefined; } };
  },
} });
let browserFinished: (() => void) | undefined;
let browserRemoved = 0;
let registerBrowser = async () => {};
mock('@capacitor/browser', { Browser: {
  addListener: async (event: string, listener: () => void) => {
    assert.equal(event, 'browserFinished');
    await registerBrowser();
    browserFinished = listener;
    return { remove: async () => { browserRemoved++; browserFinished = undefined; } };
  },
} });
let fresh = 0, updates: (() => void) | undefined;
const now = Date.now();
let snapshot: TrialConsentSnapshot | null = {
  customerInfo: { entitlements: { active: { pro: {
    isActive: true, willRenew: true, periodType: 'TRIAL', store: 'APP_STORE', ownershipType: 'PURCHASED',
    productIdentifier: 'offline-product', latestPurchaseDate: new Date(now - 2 * 86400000).toISOString(),
    expirationDate: new Date(now + 2 * 86400000).toISOString(),
  } } } } as TrialConsentSnapshot['customerInfo'],
  products: [], countryCode: 'KR', platform: 'ios', enabled: true,
};
mock('../src/services/trialConsent', {
  loadTrialConsentSnapshot: async (options?: { freshCustomerInfo?: boolean }) => {
    if (options?.freshCustomerInfo) fresh++;
    return snapshot;
  },
  listenTrialConsentUpdates: async (listener: () => void) => {
    updates = listener; return () => { updates = undefined; };
  },
});
const documentEvents = new Map<string, () => void>();
const windowEvents = new Map<string, () => void>();
const documentStub = {
  visibilityState: 'visible',
  addEventListener: (event: string, listener: () => void) => { documentEvents.set(event, listener); },
  removeEventListener: (event: string) => { documentEvents.delete(event); },
};
Object.assign(globalThis, {
  document: documentStub,
  localStorage: { getItem: () => null },
  window: {
    setInterval: () => 1, clearInterval: () => {},
    addEventListener: (event: string, listener: () => void) => { windowEvents.set(event, listener); },
    removeEventListener: (event: string) => { windowEvents.delete(event); },
  },
});
import { TrialConsentNotice } from '../src/components/app/TrialConsentNotice';

async function main() {
  TrialConsentNotice({ locale: 'ko', classes: { sect: '', surf: '' } });
  const cleanup = effects[0](); await tick();
  assert.ok(view); assert.equal(fresh, 1);
  documentEvents.get('app:resume')?.(); updates?.(); await tick();
  assert.equal(fresh, 1);
  const controller = refs[0].current as ReturnType<typeof import('../src/lib/app/trialConsentController').createTrialConsentController>;
  browserFinished?.(); await tick(); assert.equal(fresh, 1);
  assert.equal(controller.manage(), 'APP_STORE');
  updates?.(); await tick(); assert.equal(fresh, 1);
  assert.ok(browserFinished, 'browser close must be subscribed without requiring an app transition');
  browserFinished(); browserFinished(); updates?.(); await tick();
  assert.equal(fresh, 2); assert.ok(view);
  console.log('✓ browserFinished returns from management without active/visibility changes and ignores unrelated/duplicate closes');
  // Native inactive/active with document.visibilityState still visible.
  native?.({ isActive: false }); assert.equal(view, null);
  snapshot = null;
  native?.({ isActive: true }); await tick();
  documentEvents.get('app:resume')?.(); documentEvents.get('visibilitychange')?.(); updates?.();
  await tick(); assert.equal(view, null); assert.equal(fresh, 3);
  console.log('✓ native background return refreshes once even without WebView visibility changes');
  documentStub.visibilityState = 'hidden'; documentEvents.get('visibilitychange')?.();
  documentEvents.get('visibilitychange')?.(); updates?.(); await tick(); assert.equal(fresh, 3);
  documentStub.visibilityState = 'visible'; documentEvents.get('visibilitychange')?.(); await tick();
  native?.({ isActive: true }); documentEvents.get('app:resume')?.(); await tick();
  assert.equal(fresh, 4); assert.equal(view, null);
  console.log('✓ visibility return starts one entry and duplicate active events do not invalidate again');
  cleanup?.(); await tick();
  assert.equal(removed, 1); assert.equal(native, undefined); assert.equal(updates, undefined);
  assert.equal(browserRemoved, 1); assert.equal(browserFinished, undefined);
  assert.equal(documentEvents.size, 0); assert.equal(windowEvents.size, 0);
  console.log('✓ component cleanup removes SDK, native and DOM listeners');
  let finishRegistration!: () => void;
  registerBrowser = () => new Promise<void>((resolve) => { finishRegistration = resolve; });
  TrialConsentNotice({ locale: 'ko', classes: { sect: '', surf: '' } });
  const cleanupLate = effects[3](); await tick();
  cleanupLate?.(); finishRegistration(); await tick();
  assert.equal(browserRemoved, 2); assert.equal(browserFinished, undefined);
  console.log('✓ browser listener registered after unmount is immediately removed');
  console.log('trialConsentLifecycle: 5 passed (offline effects)');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
