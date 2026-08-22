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
  PRO_MONTHLY_PRODUCT_ID,
  PRO_ANNUAL_PRODUCT_ID,
  LAUNCH_PLANS,
  type PlanId,
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

/** 페이월이 그리는 플랜 한 줄 — 가격 문자열은 «스토어가 준 현지화 값»만 쓴다 */
export type PlanOffer = {
  plan: PlanId;
  pkg: PurchasesPackage;
  /** 예: "₩13,000" / "$9.99" — 스토어 현지 통화. 우리가 만들지 않는다 */
  priceString: string;
};

/**
 * 현재 오퍼링에서 월간·연간 패키지를 «식별해서» 돌려준다.
 *
 * ⚠️ 구판은 availablePackages[0] 를 무조건 집었다. 상품이 하나일 땐 우연히
 *    맞았지만, 연간을 추가하면 «배열 순서»에 따라 엉뚱한 상품이 결제된다.
 *    packageType(RevenueCat 표준) → 상품 식별자 순으로 «명시 매칭»한다.
 */
export async function getProOffers(): Promise<PlanOffer[]> {
  if (!(await initRevenueCat())) return [];
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings.current?.availablePackages ?? [];

  const match = (plan: PlanId): PurchasesPackage | undefined => {
    const wantType = plan === 'annual' ? 'ANNUAL' : 'MONTHLY';
    const wantId = plan === 'annual' ? PRO_ANNUAL_PRODUCT_ID : PRO_MONTHLY_PRODUCT_ID;
    return (
      pkgs.find((p) => String(p.packageType).toUpperCase() === wantType) ??
      // Play 는 상품ID 뒤에 base-plan 접미사가 붙을 수 있어 startsWith 로 본다
      pkgs.find((p) => p.product?.identifier?.startsWith(wantId))
    );
  };

  // ★ LAUNCH_PLANS 에 있는 것만 그린다. 출시 시점엔 월간 하나다(config/iap.ts 참조).
  //   스토어에 연간 상품이 살아 있어도 여기서 걸러지면 페이월엔 안 뜬다.
  const out: PlanOffer[] = [];
  for (const plan of LAUNCH_PLANS) {
    const pkg = match(plan);
    if (pkg) out.push({ plan, pkg, priceString: pkg.product?.priceString ?? '' });
  }
  return out;
}

/**
 * 단일 플랜 조회 — 페이월이 한 가지만 필요할 때.
 *
 * ⚠️ «못 찾으면 첫 번째 상품»으로 넘어가지 않는다. 그렇게 하면 연간을 눌렀는데
 *    월간이 결제되는 사고가 조용히 난다. 없으면 없다고 답한다.
 */
export async function getProPackage(plan: PlanId = 'monthly'): Promise<PurchasesPackage | null> {
  const offers = await getProOffers();
  return offers.find((o) => o.plan === plan)?.pkg ?? null;
}

/** Current Pro status straight from RevenueCat (source of truth). */
export async function fetchProStatus(): Promise<boolean> {
  if (!(await initRevenueCat())) return false;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const { customerInfo } = await Purchases.getCustomerInfo();
  return isProFromCustomerInfo(customerInfo);
}

/**
 * Pro 구독 구매. 사용자 취소와 실제 실패를 구분한다.
 * ★ plan 을 «명시»해야 한다 — 어떤 상품이 결제되는지 호출부가 알고 있어야 한다.
 */
export async function purchasePro(plan: PlanId = 'monthly'): Promise<PurchaseOutcome> {
  if (!(await initRevenueCat())) return { ok: false, isPro: false, error: 'iap_unavailable' };

  const pkg = await getProPackage(plan);
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
