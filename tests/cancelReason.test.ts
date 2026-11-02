import assert from 'node:assert/strict';
import { CANCEL_REASON_CODES, CANCEL_REASON_STORAGE_KEY, cancelReasonCopy, canShowCancelReason, claimCancelReason } from '../src/lib/app/cancelReason';
import { isFunnelStage } from '../src/lib/app/funnelSchema';

const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
assert.equal(canShowCancelReason(), true);
assert.equal(storage.size, 0);
assert.equal(claimCancelReason(), true);
assert.equal(storage.get(CANCEL_REASON_STORAGE_KEY), '1');
assert.equal(claimCancelReason(), false);
for (const locale of ['ko', 'en', 'ja']) {
  const copy = cancelReasonCopy(locale);
  assert.ok(copy.title && copy.skip);
  assert.equal(copy.options.length, 5);
  assert.ok(copy.options.every(Boolean));
}
for (const code of [...CANCEL_REASON_CODES, 'skip', 'show']) assert.ok(isFunnelStage(`cancel_reason:${code}`));
for (const invalid of ['cancel_reason:free_text', 'cancel_reason:', 'cancel_reason:PRICE']) assert.equal(isFunnelStage(invalid), false);
console.log('cancelReason: one-time gate, skip, languages and closed event list passed');
