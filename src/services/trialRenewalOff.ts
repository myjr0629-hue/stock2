'use client';

import { initRevenueCat } from '@/services/revenueCat';

/** One initial SDK read per app session, including failures. */
let sessionRead: Promise<Awaited<ReturnType<typeof readTrialRenewalOff>>> | undefined;
export function loadFreshTrialRenewalOff() {
  return sessionRead ??= readTrialRenewalOff();
}

// A display attempt gets at most one additional read, even after interruption.
let verificationUsed = false;
export function verifyTrialRenewalOff() {
  if (verificationUsed) return Promise.resolve(null);
  verificationUsed = true;
  return readTrialRenewalOff(true);
}

async function readTrialRenewalOff(fresh = false) {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        if (!(await initRevenueCat())) return null;
        const { Purchases } = await import('@revenuecat/purchases-capacitor');
        if (fresh) await Purchases.invalidateCustomerInfoCache();
        const { customerInfo } = await Purchases.getCustomerInfo();
        return { customerInfo, platform: Capacitor.getPlatform() };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}
