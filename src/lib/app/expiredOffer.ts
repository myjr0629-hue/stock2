// ============================================================================
// 체험 만료자 «첫 달 할인» 오퍼 (2026-11-12) — 순수 모듈(화면·서비스·시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 무엇: 어제(11/11) 넣은 «체험 만료 뒤 첫 실행 1회 페이월»(lib/app/trialExpired) «안에서만» 월간 첫 1개월 할인 카드를 하나 더 보인다.
//   스토어 설정(11/12 생성):
//     · 애플 — 월간(com.signumhq.app.pro.monthly) 프로모션 오퍼 `expired_50_1m` · PAY_AS_YOU_GO 1개월 · 175개 지역 약 50% 가격점
//       (RevenueCat 이 서명 — iOS «In-App Purchase Key» 등록됨). 사용 = getPromotionalOffer → purchaseDiscountedPackage.
//     · Play — 월간 기본 요금제 monthly 의 «개발자 결정» 오퍼 `expired-50-1m` · 1개월 단일 결제 50% · 태그 rc-ignore-offer
//       (RevenueCat 의 기본 옵션 자동 선택에서 빠진다 → 일반 purchasePackage 는 계속 정가). 사용 = purchaseSubscriptionOption.
//   그 뒤는 정가 자동 갱신. 가격·할인율·갱신가는 전부 «스토어가 준 값»으로만 그린다(여기서 만들지 않는다).
// 대상(전부 참일 때만, 불확실하면 «안 보인다»):
//   · 만료 페이월 대상(trialExpiredNotice — 활성 권한·활성 구독 없음 · TRIAL · 갱신 끔 · 시험/가족/결제 문제 아님 · 같은 스토어 · 14일 안)
//   · 과거 결제 0 — 1회 결제 거래(nonSubscriptionTransactions) 0 · 산 적 있는 상품이 그 체험 상품 하나뿐 ·
//     그 구독의 첫 구매일 = 이번 체험 시작일(앞선 유료 기간 없음). 필드가 없거나 모양이 다르면 «모름» = 대상 아님.
//   · 1인 1회: 한 번 쓰면 다음부터 권한이 TRIAL 이 아니다(유료 기간) → 위 판정에서 빠진다. 페이월 자체도 체험 기간당 1회.
//   · iOS 는 애플 서명(getPromotionalOffer)이 실제로 나올 때만 — 스토어가 자격 없음이라 하면 카드 없음.
// ============================================================================
import type { CustomerInfo, PurchasesPackage, PurchasesStoreProductDiscount, SubscriptionOption } from '@revenuecat/purchases-capacitor';
import { PRO_ANNUAL_PRODUCT_ID, PRO_ENTITLEMENT_ID, PRO_MONTHLY_PRODUCT_ID } from '@/config/iap';

/** 애플 프로모션 오퍼 식별자(ASC offerCode) */
export const EXPIRED_OFFER_IOS_ID = 'expired_50_1m';
/** Play 개발자 결정 오퍼 ID — RevenueCat 옵션 id 는 «기본요금제:오퍼» */
export const EXPIRED_OFFER_PLAY_ID = 'expired-50-1m';
export const EXPIRED_OFFER_PLAY_OPTION_ID = `monthly:${EXPIRED_OFFER_PLAY_ID}`;
/** RevenueCat 기본 옵션 자동 선택에서 빼는 태그 — Play 콘솔 오퍼에 붙어 있어야 한다(없으면 일반 결제에 할인이 샐 수 있어 카드도 안 그린다) */
export const RC_IGNORE_OFFER_TAG = 'rc-ignore-offer';
/** 첫 구매일과 이번 체험 시작일의 허용 차 — 같은 거래면 두 값이 같다. 시각 표기 반올림만 허용(5분).
 *  (관문 11121040: 36시간 허용은 체험 하루 전 유료 구매를 «결제 0»으로 볼 수 있었다 → 좁혔다. 어긋나면 노출 안 함) */
const SAME_PURCHASE_MS = 5 * 60 * 1000;

type Info = Partial<Pick<CustomerInfo, 'entitlements' | 'allPurchasedProductIdentifiers' | 'nonSubscriptionTransactions' | 'activeSubscriptions'>>;

const baseProduct = (id: unknown) => (typeof id === 'string' ? id.split(':')[0] : '');

/**
 * 과거 결제 0 인 «체험만 끝난» 고객인가 — 만료 페이월 판정(trialExpiredNotice)이 이미 참인 고객에게만 부른다.
 * 하나라도 모르면 false(노출 안 함).
 */
export function expiredOfferEligible(info: Info | null | undefined): boolean {
  if (!info) return false;
  if (info.entitlements?.active?.[PRO_ENTITLEMENT_ID]) return false;
  if (!Array.isArray(info.activeSubscriptions) || info.activeSubscriptions.length > 0) return false;
  const pro = info.entitlements?.all?.[PRO_ENTITLEMENT_ID];
  if (!pro || pro.isActive !== false || pro.periodType !== 'TRIAL' || pro.willRenew !== false || pro.isSandbox === true) return false;
  // 평생(1회 결제) 등 구독 아닌 결제가 하나라도 있으면 «결제 이력 있음»
  if (!Array.isArray(info.nonSubscriptionTransactions) || info.nonSubscriptionTransactions.length > 0) return false;
  // 산 적 있는 상품 = 이번 체험 상품 하나뿐(월간 또는 연간). 다른 상품이 있으면 그 상품을 유료로 썼을 수 있다
  const trialProduct = baseProduct(pro.productIdentifier);
  if (trialProduct !== PRO_MONTHLY_PRODUCT_ID && trialProduct !== PRO_ANNUAL_PRODUCT_ID) return false;
  const bought = info.allPurchasedProductIdentifiers;
  if (!Array.isArray(bought) || bought.length === 0) return false;
  if (!bought.every((id) => baseProduct(id) === trialProduct)) return false;
  // 그 구독의 첫 구매 = 이번 체험 시작(앞에 유료 기간이 붙어 있지 않다)
  const first = Date.parse(pro.originalPurchaseDate ?? '');
  const latest = Date.parse(pro.latestPurchaseDate ?? '');
  if (!Number.isFinite(first) || !Number.isFinite(latest) || Math.abs(latest - first) > SAME_PURCHASE_MS) return false;
  return true;
}

/** 화면이 그리는 값(스토어 문자열만) — 할인율은 두 스토어 숫자로 계산(내림, 5~95% 밖이면 null = 배지 없음) */
export type ExpiredOfferView = {
  /** 첫 1개월 가격 — 스토어 현지 문자열 */
  priceString: string;
  /** 그 뒤 매월 정가 — 스토어 현지 문자열 */
  regularPriceString: string;
  pct: number | null;
};

/** 스토어 준비 결과 — iOS 는 할인 정의, 안드는 옵션. 서명(iOS)은 서비스가 따로 받는다 */
export type ExpiredOfferPick = ExpiredOfferView & (
  | { platform: 'ios'; pkg: PurchasesPackage; discount: PurchasesStoreProductDiscount }
  | { platform: 'android'; pkg: PurchasesPackage; option: SubscriptionOption }
);

export function discountPct(offer: number, regular: number): number | null {
  if (!(offer > 0) || !(regular > 0) || offer >= regular) return null;
  const pct = Math.floor((1 - offer / regular) * 100 + 1e-9);
  return pct >= 5 && pct <= 95 ? pct : null;
}

const isMonthly = (unit: unknown, n: unknown) => String(unit).toUpperCase() === 'MONTH' && n === 1;
/** RECURRENCE_MODE — 브리지가 숫자(1·2·3)나 이름 문자열로 줄 수 있어 둘 다 받는다 */
const mode = (m: unknown) => (m === 1 || m === 'INFINITE_RECURRING' ? 'inf' : m === 2 || m === 'FINITE_RECURRING' ? 'fin' : m === 3 || m === 'NON_RECURRING' ? 'once' : null);

/**
 * 월간 패키지에서 할인 오퍼를 «정확히» 찾는다(식별자·기간 1개월·1회·정가보다 싼 값). 없거나 모양이 다르면 null — 카드 없음.
 *   iOS: product.discounts 의 expired_50_1m. 안드: subscriptionOptions 의 monthly:expired-50-1m(rc-ignore-offer 태그 필수, 가격 2단계).
 */
export function pickExpiredOffer(pkg: PurchasesPackage | null | undefined, platform: string): ExpiredOfferPick | null {
  const p = pkg?.product;
  if (!pkg || !p || baseProduct(p.identifier) !== PRO_MONTHLY_PRODUCT_ID) return null;
  if (platform === 'ios') {
    const d = (p.discounts ?? []).find((x) => x?.identifier === EXPIRED_OFFER_IOS_ID);
    if (!d || d.cycles !== 1 || !isMonthly(d.periodUnit, d.periodNumberOfUnits)) return null;
    if (typeof d.price !== 'number' || typeof p.price !== 'number' || !d.priceString || !p.priceString) return null;
    if (!(d.price > 0) || !(d.price < p.price)) return null;
    return { platform: 'ios', pkg, discount: d, priceString: d.priceString, regularPriceString: p.priceString, pct: discountPct(d.price, p.price) };
  }
  if (platform === 'android') {
    const o = (p.subscriptionOptions ?? []).find((x) => x?.id === EXPIRED_OFFER_PLAY_OPTION_ID);
    if (!o || o.isBasePlan || !Array.isArray(o.tags) || !o.tags.includes(RC_IGNORE_OFFER_TAG)) return null;
    const phases = o.pricingPhases ?? [];
    if (phases.length !== 2) return null;
    const [intro, full] = phases;
    const once = mode(intro.recurrenceMode) === 'once' || (mode(intro.recurrenceMode) === 'fin' && intro.billingCycleCount === 1); // 단일 결제 1개월(또는 1회 할인 반복)
    if (!once || !isMonthly(intro.billingPeriod?.unit, intro.billingPeriod?.value)) return null;
    if (mode(full.recurrenceMode) !== 'inf' || !isMonthly(full.billingPeriod?.unit, full.billingPeriod?.value)) return null; // INFINITE_RECURRING 월간 정가
    const a = intro.price?.amountMicros, b = full.price?.amountMicros;
    if (typeof a !== 'number' || typeof b !== 'number' || !(a > 0) || !(a < b)) return null;
    if (!intro.price.formatted || !full.price.formatted || intro.price.currencyCode !== full.price.currencyCode) return null;
    // 정가 단계가 페이월 월간 카드의 값(기본 요금제)과 같아야 한다 — 다르면 고지가 어긋나므로 안 그린다
    if (typeof p.price === 'number' && Math.abs(b / 1e6 - p.price) > 0.005 * Math.max(1, p.price)) return null;
    return { platform: 'android', pkg, option: o, priceString: intro.price.formatted, regularPriceString: full.price.formatted, pct: discountPct(a, b) };
  }
  return null;
}

type Loc = 'ko' | 'en' | 'ja';
const COPY: Record<Loc, {
  name: string;
  badge: (pct: number) => string;
  firstMonth: string;
  then: (regular: string) => string;
  fine: (price: string, regular: string) => string;
}> = {
  ko: {
    name: '월간 첫 달 할인',
    badge: (pct) => `${pct}% 할인`,
    firstMonth: '첫 달',
    then: (r) => `이후 월 ${r} 자동 갱신`,
    fine: (p, r) => `첫 1개월은 ${p}, 이후 매월 ${r}에 자동 갱신됩니다. 언제든 해지할 수 있고, 해지하면 남은 기간까지 이용됩니다. 해지는 기기의 구독 관리 화면에서 합니다.`,
  },
  en: {
    name: 'First month',
    badge: (pct) => `${pct}% off`,
    firstMonth: '1st month',
    then: (r) => `Then ${r}/mo`,
    fine: (p, r) => `${p} for the first month, then ${r} every month until you cancel. Renews automatically. Cancel anytime; access continues until the period ends. Cancel from your device’s subscription settings.`,
  },
  ja: {
    name: '月額・初月割引',
    badge: (pct) => `${pct}%オフ`,
    firstMonth: '初月',
    then: (r) => `以降は月${r}で自動更新`,
    fine: (p, r) => `最初の1か月は${p}、以降は毎月${r}で自動更新されます。いつでも解約でき、期間終了までご利用いただけます。解約は端末の定期購読設定から行えます。`,
  },
};
export function expiredOfferCopy(locale: string) {
  return COPY[locale === 'ko' ? 'ko' : locale === 'ja' ? 'ja' : 'en'];
}
