/** SDK-only offline checks, no network. */
import assert from 'node:assert/strict';
import Module from 'node:module';
function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
let native = true, fail = false;
const calls: string[] = [];
mock('@capacitor/core', { Capacitor: { isNativePlatform: () => native, getPlatform: () => 'ios' } });
mock('../src/services/revenueCat', { initRevenueCat: async () => true });
mock('@revenuecat/purchases-capacitor', { Purchases: {
  invalidateCustomerInfoCache: async () => { calls.push('invalidate'); if (fail) throw new Error('offline'); },
  getCustomerInfo: async () => { calls.push('customer'); return { customerInfo: { entitlements: { active: {} } } }; },
} });
import { loadFreshTrialRenewalOff } from '../src/services/trialRenewalOff';
async function main() {
  assert.equal((await loadFreshTrialRenewalOff())?.platform, 'ios');
  assert.deepEqual(calls, ['invalidate', 'customer']);
  calls.length = 0; fail = true;
  await assert.rejects(loadFreshTrialRenewalOff());
  assert.deepEqual(calls, ['invalidate']);
  calls.length = 0; native = false;
  assert.equal(await loadFreshTrialRenewalOff(), null);
  assert.deepEqual(calls, []);
  console.log('trialRenewalOffService: fresh read and failure passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
