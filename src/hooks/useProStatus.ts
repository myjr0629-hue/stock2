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
  /**
   * «여기서 실제로 구매가 되는가».
   *
   * IAP_LIVE 만으로는 부족하다 — 앱과 웹이 **같은 URL** 이라 플래그를 켜면
   * 브라우저 방문자에게도 업그레이드 버튼이 뜬다. 결제 플러그인은 네이티브
   * 전용이므로 그 버튼은 «가격 없음 · 비활성»으로 끝난다. 살릴 수 없는 버튼은
   * 아예 보이지 않는 편이 낫다.
   */
  const [iapAvailable, setIapAvailable] = useState(false);
  const [ready, setReady] = useState(!IAP_LIVE);
  /** 페이월에 그릴 플랜들. 가격 문자열은 «스토어가 준 현지화 값»이다 —
      우리가 "$9.99" 를 하드코딩하면 통화·세금이 다른 나라에서 거짓말이 되고,
      스토어 심사(가격 표시 의무)에서도 걸린다. */
  const [offers, setOffers] = useState<PlanOffer[]>([]);

  useEffect(() => {
    if (!IAP_LIVE) return;
    let alive = true;
    (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (alive) setIapAvailable(Capacitor.isNativePlatform());
    })().catch(() => { });
    return () => { alive = false; };
  }, []);

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

  return { isPro, ready, offers, purchase, restore, iapAvailable };
}
