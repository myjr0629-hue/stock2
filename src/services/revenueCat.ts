// ============================================================================
// RevenueCat service — Pro / ad-free subscription (SIGNUM HQ)
// ----------------------------------------------------------------------------
// Fully inert until IAP_LIVE is true (see src/config/iap.ts):
//   - never initializes the SDK, never imports the native plugin at runtime.
// Native-only: every entry point bails on web / when Capacitor is not native, and
// the @revenuecat/purchases-capacitor plugin is loaded via dynamic import so it
// NEVER reaches the shared web bundle (Vercel SSR / browser users).
// ============================================================================

'use client';

import type { CustomerInfo, PurchasesPackage } from '@revenuecat/purchases-capacitor';
import {
  IAP_LIVE,
  RC_API_KEY_IOS,
  RC_API_KEY_ANDROID,
  PRO_ENTITLEMENT_ID,
} from '@/config/iap';

export type PurchaseOutcome = {
  ok: boolean;
  isPro: boolean;
  cancelled?: boolean;
  error?: string;
};

let configured = false;
let configuring: Promise<boolean> | null = null;

/** Returns the Capacitor global only when running as a native app, else null. */
async function nativeCapacitor() {
  if (typeof window === 'undefined') return null;
  const { Capacitor } = await import('@capacitor/core');
  return Capacitor.isNativePlatform() ? Capacitor : null;
}

/** True if the given CustomerInfo has the Pro entitlement active. */
export function isProFromCustomerInfo(info: CustomerInfo | null | undefined): boolean {
  return Boolean(info?.entitlements?.active?.[PRO_ENTITLEMENT_ID]);
}

/**
 * Configure the RevenueCat SDK exactly once. Returns false (no-op) unless
 * IAP_LIVE, running natively, and a platform API key is present.
 */
export async function initRevenueCat(): Promise<boolean> {
  if (!IAP_LIVE) return false;
  if (configured) return true;
  if (configuring) return configuring;

  configuring = (async () => {
    const cap = await nativeCapacitor();
    if (!cap) return false;

    const platform = cap.getPlatform();
    const apiKey = platform === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
    if (!apiKey) return false;

    const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');
    try {
      await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });
    } catch {
      // non-fatal
    }
    await Purchases.configure({ apiKey });
    configured = true;
    return true;
  })();

  return configuring;
}

/** The purchasable Pro package from the current offering, or null if unavailable. */
export async function getProPackage(): Promise<PurchasesPackage | null> {
  if (!(await initRevenueCat())) return null;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages?.[0] ?? null;
}

/** Current Pro status straight from RevenueCat (source of truth). */
export async function fetchProStatus(): Promise<boolean> {
  if (!(await initRevenueCat())) return false;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const { customerInfo } = await Purchases.getCustomerInfo();
  return isProFromCustomerInfo(customerInfo);
}

/** Buy the Pro subscription. Distinguishes user-cancel from real failures. */
export async function purchasePro(): Promise<PurchaseOutcome> {
  if (!(await initRevenueCat())) return { ok: false, isPro: false, error: 'iap_unavailable' };

  const pkg = await getProPackage();
  if (!pkg) return { ok: false, isPro: false, error: 'no_offering' };

  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    return { ok: true, isPro: isProFromCustomerInfo(customerInfo) };
  } catch (e) {
    const err = e as { userCancelled?: boolean | null; message?: string };
    if (err?.userCancelled) return { ok: false, isPro: false, cancelled: true };
    return { ok: false, isPro: false, error: err?.message ?? 'purchase_failed' };
  }
}

/** Restore previous purchases (e.g. after reinstall / new device). */
export async function restorePro(): Promise<PurchaseOutcome> {
  if (!(await initRevenueCat())) return { ok: false, isPro: false, error: 'iap_unavailable' };
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return { ok: true, isPro: isProFromCustomerInfo(customerInfo) };
  } catch (e) {
    const err = e as { message?: string };
    return { ok: false, isPro: false, error: err?.message ?? 'restore_failed' };
  }
}
