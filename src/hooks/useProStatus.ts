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
import { IAP_LIVE, type PlanId } from '@/config/iap';
import {
  initRevenueCat,
  isProFromCustomerInfo,
  purchasePro,
  restorePro,
  getProOffers,
  type PurchaseOutcome,
  type PlanOffer,
} from '@/services/revenueCat';

export function useProStatus() {
  const [isPro, setIsPro] = useState(false);
  const [ready, setReady] = useState(!IAP_LIVE);
  /** 페이월에 그릴 플랜들. 가격 문자열은 «스토어가 준 현지화 값»이다 —
      우리가 "$9.99" 를 하드코딩하면 통화·세금이 다른 나라에서 거짓말이 되고,
      스토어 심사(가격 표시 의무)에서도 걸린다. */
  const [offers, setOffers] = useState<PlanOffer[]>([]);

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
      try {
        const list = await getProOffers();
        if (!cancelled) setOffers(list);
      } catch {
        // 오퍼링을 못 받으면 페이월이 «구매 불가» 상태로 그려진다 (가격 거짓말 금지)
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

  const purchase = useCallback(async (plan: PlanId = 'monthly'): Promise<PurchaseOutcome> => {
    const result = await purchasePro(plan);
    if (result.ok && result.isPro) setIsPro(true);
    return result;
  }, []);

  const restore = useCallback(async (): Promise<PurchaseOutcome> => {
    const result = await restorePro();
    if (result.ok && result.isPro) setIsPro(true);
    return result;
  }, []);

  return { isPro, ready, offers, purchase, restore };
}
