'use client';

import { initRevenueCat } from '@/services/revenueCat';

/** One SDK read per app session, including failures; the SDK may reuse its cache. */
let sessionRead: Promise<Awaited<ReturnType<typeof readTrialRenewalOff>>> | undefined;
export function loadFreshTrialRenewalOff() {
  return sessionRead ??= readTrialRenewalOff();
}

async function readTrialRenewalOff() {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        if (!(await initRevenueCat())) return null;
        const { Purchases } = await import('@revenuecat/purchases-capacitor');
        const { customerInfo } = await Purchases.getCustomerInfo();
        return { customerInfo, platform: Capacitor.getPlatform() };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}
