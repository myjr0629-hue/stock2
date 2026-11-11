import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';

export const TRIAL_START_WATCHLIST_KEY = 'signumhq.trialStartWatchlist.v1';

/** Fail closed: only a newly purchased store trial, confirmed on both sides of the purchase. */
export function newTrialPeriod(before: CustomerInfo | null, after: CustomerInfo | null, platform: string, product: string, started: number, now: number): string | null {
  if (!before || !after || !Number.isFinite(started) || !Number.isFinite(now)) return null;
  if (before.entitlements?.all?.[PRO_ENTITLEMENT_ID] || before.entitlements?.active?.[PRO_ENTITLEMENT_ID] || !Array.isArray(before.activeSubscriptions) || before.activeSubscriptions.length) return null;
  const pro = after.entitlements?.active?.[PRO_ENTITLEMENT_ID];
  if (!pro?.isActive || pro.periodType !== 'TRIAL' || pro.ownershipType !== 'PURCHASED' || pro.willRenew !== true) return null;
  if (!((platform === 'ios' && pro.store === 'APP_STORE') || (platform === 'android' && pro.store === 'PLAY_STORE'))) return null;
  if (!product || pro.productIdentifier !== product) return null;
  const start = Date.parse(pro.latestPurchaseDate ?? '');
  const end = Date.parse(pro.expirationDate ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < started - 60_000 || start > now || end <= now) return null;
  return `${pro.store}:${product}:${start}:${end}`;
}

/** Persist before navigation so duplicate callbacks cannot navigate twice. */
export function claimTrialWatchlist(period: string | null, pathname: string, storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  if (!period || /\/app-view\/watchlist\/?$/.test(pathname)) return false;
  try {
    if (storage.getItem(TRIAL_START_WATCHLIST_KEY) === period) return false;
    storage.setItem(TRIAL_START_WATCHLIST_KEY, period);
    return true;
  } catch { return false; }
}

export async function readTrialCustomerInfo(): Promise<{ info: CustomerInfo; platform: string } | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    await Purchases.invalidateCustomerInfoCache();
    const { customerInfo } = await Purchases.getCustomerInfo();
    return { info: customerInfo, platform: Capacitor.getPlatform() };
  } catch { return null; }
}
