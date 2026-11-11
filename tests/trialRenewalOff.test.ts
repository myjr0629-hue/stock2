/** Offline: npx tsx tests/trialRenewalOff.test.ts */
import assert from 'node:assert/strict';
import { trialRenewalOffNotice, verifiedTrialRenewalOffNotice, trialOffCopy, TRIAL_OFF_WINDOW_MS } from '../src/lib/app/trialRenewalOff';
import { isFunnelSrc, isFunnelStage } from '../src/lib/app/funnelSchema';

const now = Date.parse('2026-11-02T00:00:00Z');
const pro = { productIdentifier: 'monthly', isActive: true, willRenew: false, periodType: 'TRIAL', ownershipType: 'PURCHASED', store: 'APP_STORE', latestPurchaseDate: new Date(now - 86400000).toISOString(), expirationDate: new Date(now + TRIAL_OFF_WINDOW_MS).toISOString() };
const check = (changes: Record<string, unknown> = {}, platform = 'ios', seen: string | null = null) => trialRenewalOffNotice({ entitlements: { active: { pro: { ...pro, ...changes } } } } as never, platform, now, seen);
const found = check();
assert.ok(found);
assert.equal(found.expiresAt - now, TRIAL_OFF_WINDOW_MS);
assert.ok(check({ expirationDate: new Date(now + 1).toISOString() }));
for (const changes of [
  { expirationDate: new Date(now + TRIAL_OFF_WINDOW_MS + 1).toISOString() }, { expirationDate: new Date(now).toISOString() },
  { expirationDate: null }, { expirationDate: 'invalid' }, { latestPurchaseDate: null },
  { latestPurchaseDate: new Date(now + 1).toISOString() }, { isActive: false }, { willRenew: true },
  { willRenew: null }, { periodType: 'NORMAL' }, { ownershipType: 'FAMILY_SHARED' }, { store: 'UNKNOWN_STORE' },
]) assert.equal(check(changes), null, JSON.stringify(changes));
assert.equal(check({}, 'android'), null);
assert.ok(check({ store: 'PLAY_STORE' }, 'android'));
// ★11/11 하루 한 번: 같은 날(mark = 기간|현지 날짜)이면 안 뜨고, 다음 날이면 다시 뜬다. 옛 저장 값(기간만)은 같은 날로 치지 않는다
assert.equal(check({}, 'ios', found.mark), null);
assert.ok(check({}, 'ios', found.period));
assert.ok(trialRenewalOffNotice({ entitlements: { active: { pro } } } as never, 'ios', now, found.mark, '2099-01-01'));
assert.equal(TRIAL_OFF_WINDOW_MS, 72 * 3600000);
const info = (changes: Record<string, unknown> = {}) => ({ entitlements: { active: { pro: { ...pro, ...changes } } } }) as never;
assert.ok(verifiedTrialRenewalOffNotice(info(), info(), 'ios', now, null));
for (const changes of [
  { willRenew: true }, { isActive: false }, { productIdentifier: 'yearly' }, { productIdentifier: '' },
  { expirationDate: new Date(now + 1000).toISOString() }, { latestPurchaseDate: new Date(now - 1000).toISOString() },
  { periodType: 'NORMAL' }, { store: 'PLAY_STORE' },
]) assert.equal(verifiedTrialRenewalOffNotice(info(), info(changes), 'ios', now, null), null, JSON.stringify(changes));
for (const lang of ['ko', 'en', 'ja']) {
  const copy = trialOffCopy(lang);
  for (const value of Object.values(copy)) assert.ok(value.length > 0);
  assert.match(copy.watchlist, /100/); assert.match(copy.watchlist, /5/);
}
assert.equal(trialOffCopy('fr'), trialOffCopy('en'));
for (const stage of ['trial_off_show', 'trial_off_manage', 'trial_off_close', 'trial_off_expired']) assert.ok(isFunnelStage(stage));
assert.ok(isFunnelSrc('trial_off'));
console.log('trialRenewalOff: boundaries, copy and funnel passed');
