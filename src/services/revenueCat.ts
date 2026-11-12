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

import type { CustomerInfo, PurchasesPackage, PurchasesPromotionalOffer } from '@revenuecat/purchases-capacitor';
import {
  IAP_LIVE,
  RC_API_KEY_IOS,
  RC_API_KEY_ANDROID,
  PRO_ENTITLEMENT_ID,
  PRO_MONTHLY_PRODUCT_ID,
  PRO_ANNUAL_PRODUCT_ID,
  PRO_LIFETIME_PRODUCT_ID,
  LAUNCH_PLANS,
  MULTI_PLANS,
  type PlanId,
} from '@/config/iap';
import { previewFlag } from '@/lib/app/proEntitlement';
import { pickExpiredOffer, type ExpiredOfferPick } from '@/lib/app/expiredOffer';

export type PurchaseOutcome = {
  ok: boolean;
  isPro: boolean;
  cancelled?: boolean;
  error?: string;
  /** 퍼널 측정용 — RevenueCat 오류 코드("0"~"42") 를 rc<숫자> 로. 화면 동작에는 쓰지 않는다 */
  code?: string;
};

/** RevenueCat 오류 객체의 code("11" 등) → "rc11". 없거나 숫자가 아니면 undefined */
function rcCode(e: unknown): string | undefined {
  const c = (e as { code?: unknown } | null)?.code;
  const s = typeof c === 'number' ? String(c) : typeof c === 'string' ? c.trim() : '';
  return /^\d{1,2}$/.test(s) ? `rc${s}` : undefined;
}

/**
 * 사용자가 스토어 결제 창을 «직접 닫았나»(2026-10-24).
 * ⚠️ 캡시터 플러그인은 userCancelled 를 오류 객체 «맨 위»에 싣지 않는다 —
 *    안드는 e.data.userCancelled, iOS 는 아예 없고 code "1" 만 온다(rejectWithErrorContainer).
 *    그래서 구판(err.userCancelled 만 봄)은 취소를 전부 «오류 rc1»로 셌다(10/24 실측: 오류 28 중 안드 rc1 26).
 *    RevenueCat 권장 판정 = code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR("1").
 */
export function isPurchaseCancelled(e: unknown): boolean {
  const err = e as { userCancelled?: boolean | null; data?: { userCancelled?: boolean | null } | null } | null;
  return Boolean(err?.userCancelled || err?.data?.userCancelled) || rcCode(e) === 'rc1';
}

let configured = false;
let configuring: Promise<boolean> | null = null;

/**
 * 스토어 결제·복원 창이 지금 떠 있는가(2026-10-06).
 * 안드로이드는 구글 결제 창이 닫히면 앱이 onResume → appStateChange(isActive) 를 받는다(Capacitor BridgeActivity).
 * 그 «복귀»에서 도는 밖-구매 동기화(lib/app/foregroundProSync.ts)가 진행 중인 구매와 겹치지 않게 이것을 본다.
 */
let storeFlows = 0;
export function isStoreFlowActive(): boolean {
  return storeFlows > 0;
}

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
  /** 스토어가 준 숫자 가격(할인율 계산용 — 화면에 직접 찍지 않는다) */
  price?: number;
  /** 스토어 통화 코드 — 할인율은 월간과 «같은 통화»일 때만 계산한다 */
  currencyCode?: string;
  /** 스토어가 준 «월 환산» 현지 문자열(연간 카드) — 없으면 그리지 않는다 */
  pricePerMonthString?: string | null;
};

/**
 * 페이월이 그릴 플랜 목록. 기본은 LAUNCH_PLANS(환경변수 스위치 — config/iap.ts).
 * 프리뷰 호스트(*.vercel.app·localhost)에서만 `?sgplans=1` 로 연간·평생을 켜 볼 수 있다 — 운영 도메인에선 항상 false.
 */
export function activePlans(): readonly PlanId[] {
  if (LAUNCH_PLANS.length > 1) return LAUNCH_PLANS;
  let preview = false;
  try { preview = previewFlag('sgplans'); } catch { /* window.location 없음(시험·SSR) = 끔 */ }
  return preview ? MULTI_PLANS : LAUNCH_PLANS;
}

/** 패키지 → 플랜 판정. packageType(RevenueCat 표준) 먼저, 없으면 상품 식별자 접두로. */
export function matchPlanPackage(pkgs: readonly PurchasesPackage[], plan: PlanId): PurchasesPackage | undefined {
  const wantType = plan === 'annual' ? 'ANNUAL' : plan === 'lifetime' ? 'LIFETIME' : 'MONTHLY';
  const wantId = plan === 'annual' ? PRO_ANNUAL_PRODUCT_ID : plan === 'lifetime' ? PRO_LIFETIME_PRODUCT_ID : PRO_MONTHLY_PRODUCT_ID;
  return (
    pkgs.find((p) => String(p.packageType).toUpperCase() === wantType) ??
    // Play 는 상품ID 뒤에 base-plan 접미사가 붙을 수 있어 startsWith 로 본다
    pkgs.find((p) => p.product?.identifier?.startsWith(wantId))
  );
}

/** 오퍼링 패키지 → 페이월 플랜 목록(순서 = plans 순서). 스토어가 안 내려준 플랜은 «없다»(지어내지 않는다). */
export function plansFromPackages(pkgs: readonly PurchasesPackage[], plans: readonly PlanId[]): PlanOffer[] {
  const out: PlanOffer[] = [];
  for (const plan of plans) {
    const pkg = matchPlanPackage(pkgs, plan);
    if (!pkg) continue;
    const p = pkg.product;
    out.push({
      plan, pkg, priceString: p?.priceString ?? '',
      price: typeof p?.price === 'number' ? p.price : undefined,
      currencyCode: p?.currencyCode,
      pricePerMonthString: p?.pricePerMonthString ?? null,
    });
  }
  return out;
}

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

  return paywallOffers(pkgs, activePlans());
}

/**
 * 페이월에 줄 플랜 목록 — activePlans() 에 있는 것만(기본은 월간 하나, config/iap.ts «노출 스위치»).
 *   스토어에 연간·평생 상품이 살아 있어도 여기서 걸러지면 페이월엔 안 뜬다.
 * ★11/11 관문 지적: 스위치가 꺼진 빌드에서 스토어가 월간을 안 주고 연간(·평생)만 주면 목록이 비어 아무것도 못 샀다.
 *   걸러 낸 결과가 «비었을 때만» 스토어가 실제로 준 플랜으로 내려간다 — 월간이 있으면 예전과 똑같다.
 */
export function paywallOffers(pkgs: readonly PurchasesPackage[], active: readonly PlanId[]): PlanOffer[] {
  const out = plansFromPackages(pkgs, active);
  return out.length ? out : plansFromPackages(pkgs, MULTI_PLANS);
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
  storeFlows += 1;
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    return { ok: true, isPro: isProFromCustomerInfo(customerInfo) };
  } catch (e) {
    const err = e as { message?: string };
    if (isPurchaseCancelled(e)) return { ok: false, isPro: false, cancelled: true };
    return { ok: false, isPro: false, error: err?.message ?? 'purchase_failed', code: rcCode(e) };
  } finally {
    storeFlows = Math.max(0, storeFlows - 1);
  }
}

/** Restore previous purchases (e.g. after reinstall / new device). */
export async function restorePro(): Promise<PurchaseOutcome> {
  if (!(await initRevenueCat())) return { ok: false, isPro: false, error: 'iap_unavailable' };
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  storeFlows += 1;
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return { ok: true, isPro: isProFromCustomerInfo(customerInfo) };
  } catch (e) {
    const err = e as { message?: string };
    return { ok: false, isPro: false, error: err?.message ?? 'restore_failed', code: rcCode(e) };
  } finally {
    storeFlows = Math.max(0, storeFlows - 1);
  }
}

// ============================================================================
// ★2026-11-12 체험 만료자 «첫 달 할인» — 만료 1회 페이월(TrialSavePaywall · src trial_expired)에서만 부른다.
//   일반 경로(purchasePro = purchasePackage)는 그대로다: iOS 는 프로모션 오퍼를 스스로 적용하지 않고,
//   Play 오퍼는 rc-ignore-offer 태그라 RevenueCat 기본 옵션 자동 선택에서 빠진다(정가 기본 요금제).
//   ⚠️ 할인 결제가 안 되면(서명 없음·옵션 없음·자격 없음) «정가 결제로 넘어가지 않는다» — 오류로 돌려준다.
// ============================================================================

/** 서명까지 받은 오퍼(iOS) / 옵션(안드) — 화면은 view 값만 그린다 */
export type ExpiredOffer = ExpiredOfferPick;

/** 지금 이 기기에서 할인 오퍼를 «실제로» 살 수 있으면 그 오퍼, 아니면 null. 대상 판정(expiredOfferEligible)은 부르는 쪽 몫이다 */
export async function loadExpiredOffer(): Promise<ExpiredOffer | null> {
  if (!(await initRevenueCat())) return null;
  const cap = await nativeCapacitor();
  if (!cap) return null;
  const platform = cap.getPlatform();
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const offerings = await Purchases.getOfferings();
  const pkg = matchPlanPackage(offerings.current?.availablePackages ?? [], 'monthly');
  const pick = pickExpiredOffer(pkg, platform);
  if (!pick) return null;
  if (pick.platform === 'ios') {
    // 애플 자격 확인 + 서명 — 자격이 없으면 undefined(카드 없음)
    const signed = await Purchases.getPromotionalOffer({ product: pick.pkg.product, discount: pick.discount });
    if (!signed || signed.identifier !== pick.discount.identifier) return null;
  }
  return pick;
}

/** 할인 결제 — iOS 는 결제 직전에 서명을 새로 받는다(서명 유효시간). 정가 결제로 대신하지 않는다 */
export async function purchaseExpiredOffer(offer: ExpiredOffer): Promise<PurchaseOutcome> {
  if (!(await initRevenueCat())) return { ok: false, isPro: false, error: 'iap_unavailable' };
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  storeFlows += 1;
  try {
    if (offer.platform === 'ios') {
      let signed: PurchasesPromotionalOffer | undefined;
      try { signed = await Purchases.getPromotionalOffer({ product: offer.pkg.product, discount: offer.discount }); } catch { signed = undefined; }
      if (!signed || signed.identifier !== offer.discount.identifier) return { ok: false, isPro: false, error: 'offer_unavailable' };
      const { customerInfo } = await Purchases.purchaseDiscountedPackage({ aPackage: offer.pkg, discount: signed });
      return { ok: true, isPro: isProFromCustomerInfo(customerInfo) };
    }
    const { customerInfo } = await Purchases.purchaseSubscriptionOption({ subscriptionOption: offer.option });
    return { ok: true, isPro: isProFromCustomerInfo(customerInfo) };
  } catch (e) {
    const err = e as { message?: string };
    if (isPurchaseCancelled(e)) return { ok: false, isPro: false, cancelled: true };
    return { ok: false, isPro: false, error: err?.message ?? 'purchase_failed', code: rcCode(e) };
  } finally {
    storeFlows = Math.max(0, storeFlows - 1);
  }
}
