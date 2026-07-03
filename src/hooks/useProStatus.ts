// ============================================================================
// useProStatus — reactive Pro / ad-free entitlement state (SIGNUM HQ)
// ----------------------------------------------------------------------------
// While IAP_LIVE is false this hook is inert: isPro stays false, no SDK calls,
// no listeners — safe to consume anywhere (web or native) with zero effect.
// Once live, it reflects RevenueCat CustomerInfo and updates in real time via
// the customer-info listener (e.g. after a purchase or restore).
// ============================================================================

'use client';

import { useCallback, useEffect, useState } from 'react';
import { IAP_LIVE } from '@/config/iap';
import {
  initRevenueCat,
  isProFromCustomerInfo,
  purchasePro,
  restorePro,
  type PurchaseOutcome,
} from '@/services/revenueCat';

export function useProStatus() {
  const [isPro, setIsPro] = useState(false);
  const [ready, setReady] = useState(!IAP_LIVE);

  useEffect(() => {
    if (!IAP_LIVE) return;

    let cancelled = false;
    let listenerId: string | null = null;

    const apply = (info: unknown) => {
      if (cancelled) return;
      setIsPro(isProFromCustomerInfo(info as Parameters<typeof isProFromCustomerInfo>[0]));
    };

    (async () => {
      const ok = await initRevenueCat();
      if (cancelled || !ok) {
        if (!cancelled) setReady(true);
        return;
      }
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      try {
        const { customerInfo } = await Purchases.getCustomerInfo();
        apply(customerInfo);
      } catch {
        // leave isPro false
      }
      if (!cancelled) setReady(true);
      listenerId = await Purchases.addCustomerInfoUpdateListener((info) => apply(info));
    })();

    return () => {
      cancelled = true;
      if (listenerId) {
        import('@revenuecat/purchases-capacitor')
          .then(({ Purchases }) =>
            Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: listenerId as string }),
          )
          .catch(() => {});
      }
    };
  }, []);

  const purchase = useCallback(async (): Promise<PurchaseOutcome> => {
    const result = await purchasePro();
    if (result.ok && result.isPro) setIsPro(true);
    return result;
  }, []);

  const restore = useCallback(async (): Promise<PurchaseOutcome> => {
    const result = await restorePro();
    if (result.ok && result.isPro) setIsPro(true);
    return result;
  }, []);

  return { isPro, ready, purchase, restore };
}
