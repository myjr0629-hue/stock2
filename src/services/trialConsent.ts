'use client';

import { PRO_ENTITLEMENT_ID } from '@/config/iap';
import { initRevenueCat } from '@/services/revenueCat';
import type { TrialConsentSnapshot } from '@/lib/app/trialConsentController';

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5_000); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Native SDK reads only: never purchase, restore or collect consent here. */
export async function loadTrialConsentSnapshot(): Promise<TrialConsentSnapshot | null> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch('/api/app/trial-consent-config', { cache: 'no-store', signal: controller.signal });
    if (!response.ok || (await response.json())?.enabled !== true) return null;
  } finally { clearTimeout(timer); }
  if (!(await bounded(initRevenueCat()))) return null;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const [{ customerInfo }, storefront] = await bounded(Promise.all([
    Purchases.getCustomerInfo(), Purchases.getStorefront(),
  ]));
  const pro = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!pro?.isActive || !pro.willRenew || pro.periodType.toUpperCase() !== 'TRIAL') return null;
  if (!['KR', 'KOR'].includes(storefront.countryCode?.trim().toUpperCase())) return null;
  // Query the entitled product, not the currently promoted offering. Product read
  // failure removes only the price clause; the verified trial can still be shown.
  const products = await bounded(Purchases.getProducts({ productIdentifiers: [pro.productIdentifier.split(':')[0]] }))
    .then((result) => result.products).catch(() => []);
  return { customerInfo, products, countryCode: storefront.countryCode, platform: Capacitor.getPlatform(), enabled: true };
}

export async function listenTrialConsentUpdates(onChange: () => void): Promise<() => void> {
  if (!(await bounded(initRevenueCat()))) return () => {};
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const id = await Purchases.addCustomerInfoUpdateListener(onChange);
  return () => { void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: id }).catch(() => {}); };
}
