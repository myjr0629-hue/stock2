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
let view: TrialConsentView | null = null;
mock('react', {
  useEffect: (effect: typeof effects[number]) => { effects.push(effect); },
  useRef: (current: unknown) => ({ current }),
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
  // Native inactive/active with document.visibilityState still visible.
  native?.({ isActive: false }); assert.equal(view, null);
  snapshot = null;
  native?.({ isActive: true }); await tick();
  documentEvents.get('app:resume')?.(); documentEvents.get('visibilitychange')?.(); updates?.();
  await tick(); assert.equal(view, null); assert.equal(fresh, 2);
  console.log('✓ native background return refreshes once even without WebView visibility changes');
  documentStub.visibilityState = 'hidden'; documentEvents.get('visibilitychange')?.();
  documentEvents.get('visibilitychange')?.(); updates?.(); await tick(); assert.equal(fresh, 2);
  documentStub.visibilityState = 'visible'; documentEvents.get('visibilitychange')?.(); await tick();
  native?.({ isActive: true }); documentEvents.get('app:resume')?.(); await tick();
  assert.equal(fresh, 3); assert.equal(view, null);
  console.log('✓ visibility return starts one entry and duplicate active events do not invalidate again');
  cleanup?.(); await tick();
  assert.equal(removed, 1); assert.equal(native, undefined); assert.equal(updates, undefined);
  assert.equal(documentEvents.size, 0); assert.equal(windowEvents.size, 0);
  console.log('✓ component cleanup removes SDK, native and DOM listeners');
  console.log('trialConsentLifecycle: 3 passed (offline effects)');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
