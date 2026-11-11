import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimTrialWatchlist, newTrialPeriod } from '../src/lib/app/trialStartWatchlist';

const now = Date.parse('2026-11-11T12:00:00Z');
const product = 'com.signumhq.app.pro.monthly';
const entitlement = { isActive: true, periodType: 'TRIAL', ownershipType: 'PURCHASED', willRenew: true, store: 'APP_STORE', productIdentifier: product, latestPurchaseDate: new Date(now).toISOString(), expirationDate: new Date(now + 30 * 86400_000).toISOString() };
const before = { entitlements: { active: {}, all: {} }, activeSubscriptions: [] } as any;
const info = (e: object) => ({ entitlements: { active: { pro: e }, all: { pro: e } }, activeSubscriptions: [product] }) as any;
const period = (b = before, a = info(entitlement), platform = 'ios') => newTrialPeriod(b, a, platform, product, now - 1000, now + 1000);
const memory = () => { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }; };

test('실제 신규 체험을 확인한 구매만 기간당 한 번 이동', () => {
  const p = period(); const store = memory();
  assert.ok(p);
  assert.equal(claimTrialWatchlist(p, '/ko/app-view/settings', store), true);
  assert.equal(claimTrialWatchlist(p, '/ko/app-view/settings', store), false);
  assert.equal(claimTrialWatchlist(p, '/ko/app-view/watchlist', memory()), false);
  assert.equal(claimTrialWatchlist(p, '/ko/app-view/settings', { getItem: () => null, setItem: () => { throw Error(); } }), false);
});

test('기존 구독·코드 체험 재진입·오래된 체험·다른 스토어·상품은 제외', () => {
  assert.equal(period(info(entitlement)), null);
  assert.equal(period({ entitlements: { active: {}, all: { pro: { ...entitlement, store: 'PROMOTIONAL' } } }, activeSubscriptions: [] }), null);
  assert.equal(period(before, info({ ...entitlement, latestPurchaseDate: new Date(now - 120_000).toISOString() })), null);
  assert.equal(period(before, info({ ...entitlement, store: 'PROMOTIONAL' })), null);
  assert.equal(period(before, info({ ...entitlement, productIdentifier: 'other' })), null);
  assert.equal(period(before, info({ ...entitlement, periodType: 'NORMAL' })), null);
  assert.equal(period(before, info(entitlement), 'android'), null);
  assert.equal(period(null), null);
});

test('복원·취소·실패는 구매 성공 콜백 조건을 통과하지 못한다', () => {
  const store = memory();
  const purchaseCallback = (kind: string, result: { ok: boolean; isPro: boolean }) => kind === 'purchase' && result.ok && result.isPro && claimTrialWatchlist(period(), '/ko/app-view/settings', store);
  assert.equal(purchaseCallback('restore', { ok: true, isPro: true }), false);
  assert.equal(purchaseCallback('purchase', { ok: false, isPro: false }), false);
  assert.equal(purchaseCallback('purchase', { ok: true, isPro: false }), false);
  assert.equal(purchaseCallback('purchase', { ok: true, isPro: true }), true);
});
