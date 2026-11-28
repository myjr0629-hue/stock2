'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { hardGateDecision } from '@/lib/app/hardGate';
import { readAnnualTrialSwitch } from '@/lib/app/annualTrialDefault';
import { shellPlatform } from '@/lib/app/legalOneTap';
import { storeProSignal } from '@/lib/app/gatePaywall';
import { getProSnapshot, useWatchlistPro } from '@/lib/app/proEntitlement';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { initRevenueCat, getProOffers, isStoreFlowActive, isProFromCustomerInfo, type PlanOffer } from '@/services/revenueCat';
import { ProPaywall } from './ProPaywall';

const sharedProNow = () => storeProSignal.active() || getProSnapshot().isPro;
const purchasePending = () => proPurchaseState.getSnapshot() || isStoreFlowActive();

async function currentPro() {
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const { customerInfo } = await Purchases.getCustomerInfo();
  const active = customerInfo?.entitlements?.active;
  if (!active || typeof active !== 'object' || Array.isArray(active)) return null;
  return isProFromCustomerInfo(customerInfo);
}

// 호출부가 모듈 적재부터 8초를 잰다. SDK 초기화는 IAP_LIVE·네이티브·스토어 연결 구성까지 검사한다.
export async function prepareHardGate(started: number) {
  const platform = shellPlatform();
  const iapAvailable = platform !== 'web' && await initRevenueCat();
  const eligible = iapAvailable && !sharedProNow() && !purchasePending();
  const [pro, plans, annualOn] = eligible ? await Promise.all([
    currentPro().catch(() => null), getProOffers().catch(() => []), readAnnualTrialSwitch(),
  ]) : [null, [], false] as const;
  const offers = plans.filter(p => p.priceString.trim() && p.pkg?.product?.identifier);
  const decision = hardGateDecision({
    marked: true, on: true, platform, iapAvailable, pro, offers: offers.length,
    sharedPro: sharedProNow(), pending: purchasePending(),
    elapsed: performance.now() - started,
  });
  return { decision, offers, annualOn } as const;
}

export function HardGatePaywall({ locale, offers, annualOn, onDone }: {
  locale: string; offers: PlanOffer[]; annualOn: boolean; onDone: () => void;
}) {
  const shared = useSyncExternalStore(storeProSignal.subscribe, storeProSignal.active, () => false);
  const { isPro } = useWatchlistPro();
  useBannerSuppression(true);
  useEffect(() => { if (shared || isPro) onDone(); }, [shared, isPro, onDone]);
  if (shared || isPro) return null;
  return <ProPaywall hardGate locale={locale} src="hard_gate" trialHead annualTrialDefault={annualOn} offers={offers} onClose={onDone} />;
}
