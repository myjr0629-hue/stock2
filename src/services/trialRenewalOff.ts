'use client';

import { initRevenueCat } from '@/services/revenueCat';

/** Every attempt invalidates the SDK cache; failures never fall back to stale data. */
export async function loadFreshTrialRenewalOff() {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        if (!(await initRevenueCat())) return null;
        const { Purchases } = await import('@revenuecat/purchases-capacitor');
        await Purchases.invalidateCustomerInfoCache();
        const { customerInfo } = await Purchases.getCustomerInfo();
        return { customerInfo, platform: Capacitor.getPlatform() };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}
