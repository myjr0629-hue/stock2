/** Offline: ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/trialRenewalOff.test.ts */
import assert from 'node:assert/strict';
import { trialRenewalOffNotice, trialOffCopy, TRIAL_OFF_WINDOW_MS } from '../src/lib/app/trialRenewalOff';
import { isFunnelSrc, isFunnelStage } from '../src/lib/app/funnelSchema';

const now = Date.parse('2026-11-02T00:00:00Z');
const pro = { isActive: true, willRenew: false, periodType: 'TRIAL', ownershipType: 'PURCHASED', store: 'APP_STORE', latestPurchaseDate: new Date(now - 86400000).toISOString(), expirationDate: new Date(now + TRIAL_OFF_WINDOW_MS).toISOString() };
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
assert.equal(check({}, 'ios', found.period), null);
for (const lang of ['ko', 'en', 'ja']) {
  const copy = trialOffCopy(lang);
  for (const value of Object.values(copy)) assert.ok(value.length > 0);
  assert.match(copy.watchlist, /100/); assert.match(copy.watchlist, /5/);
}
assert.equal(trialOffCopy('fr'), trialOffCopy('en'));
for (const stage of ['trial_off_show', 'trial_off_manage', 'trial_off_close']) assert.ok(isFunnelStage(stage));
assert.ok(isFunnelSrc('trial_off'));
console.log('trialRenewalOff: boundaries, copy and funnel passed');
