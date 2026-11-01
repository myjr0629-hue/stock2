'use client';

import { initRevenueCat } from '@/services/revenueCat';

/** One initial SDK read per foreground entry, including failures. */
let sessionRead: Promise<Awaited<ReturnType<typeof readTrialRenewalOff>>> | undefined;
let freshEntry = false;
let verification: object | undefined;
export function refreshTrialRenewalOffOnResume() {
  sessionRead = undefined;
  freshEntry = true;
  verification = undefined;
}
export function loadFreshTrialRenewalOff() {
  return sessionRead ??= readTrialRenewalOff(freshEntry);
}

// Only a discarded attempt can release its own verification slot.
export function verifyTrialRenewalOff() {
  if (verification) return null;
  const token = verification = {};
  return {
    result: readTrialRenewalOff(true),
    release: () => { if (verification === token) verification = undefined; },
  };
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
