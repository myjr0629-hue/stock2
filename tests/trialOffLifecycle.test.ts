import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waitForOtherModal, scheduleTrialOffExpiry } from '../src/lib/app/trialOffLifecycle';
import { isFunnelStage } from '../src/lib/app/funnelSchema';

let modalOpen = true, observerCallback: () => void = () => {}, disconnected = false, reads = 0;
class FakeObserver {
  constructor(callback: () => void) { observerCallback = callback; }
  observe() {}
  disconnect() { disconnected = true; }
}
Object.assign(globalThis, { MutationObserver: FakeObserver });
const doc = { documentElement: {}, querySelector: () => modalOpen ? {} : null } as unknown as Document;
waitForOtherModal(doc, () => { reads++; });
for (let i = 0; i < 30; i++) observerCallback();
assert.equal(reads, 0);
modalOpen = false; observerCallback();
assert.equal(reads, 1); assert.equal(disconnected, true);

let expiry: (() => void) | undefined, delay = -1;
Object.assign(globalThis, { window: { setTimeout: (fn: () => void, ms: number) => { expiry = fn; delay = ms; return 1; }, clearTimeout: () => {} } });
let closed = 0, expired = 0;
const now = Date.now();
scheduleTrialOffExpiry(now + 1000, () => { expired++; });
assert.ok(delay >= 0 && delay <= 1000);
expiry!();
assert.equal(expired, 1); assert.equal(closed, 0);
assert.ok(isFunnelStage('trial_off_expired'));
const component = readFileSync('src/components/app/TrialRenewalOffNotice.tsx', 'utf8');
assert.match(component, /onExpired=\{\(\) => close\('trial_off_expired'\)\}/);
assert.match(component, /scheduleTrialOffExpiry\(view\.expiresAt, onExpired\)/);
assert.ok(component.indexOf("document.querySelector('[aria-modal=\"true\"]')") < component.indexOf('await loadFreshTrialRenewalOff()'));
console.log('trialOffLifecycle: modal deferral and expiry separation passed');
