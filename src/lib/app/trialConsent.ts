import type { CustomerInfo, PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';

export const TRIAL_CONSENT_DAY_MS = 86_400_000;
export const TRIAL_CONSENT_SNOOZE_MS = 7 * TRIAL_CONSENT_DAY_MS;
export const TRIAL_CONSENT_STORAGE_KEY = 'signumhq.trialConsent.v1';
export const TRIAL_CONSENT_OFF_KEY = 'trial-consent:off';
export type TrialStore = 'APP_STORE' | 'PLAY_STORE';

/** Local dates only. No customer, device, product or transaction identifiers. */
export type TrialConsentMemory = { earlySeenPeriod: string | null; snoozedUntil: number };
export const emptyTrialConsentMemory = (): TrialConsentMemory => ({ earlySeenPeriod: null, snoozedUntil: 0 });

export function parseTrialConsentMemory(raw: string | null): TrialConsentMemory {
  try {
    const value = JSON.parse(raw ?? 'null');
    return {
      earlySeenPeriod: typeof value?.earlySeenPeriod === 'string' && /^\d+:\d+$/.test(value.earlySeenPeriod)
        ? value.earlySeenPeriod : null,
      snoozedUntil: typeof value?.snoozedUntil === 'number' && Number.isFinite(value.snoozedUntil) && value.snoozedUntil > 0
        ? value.snoozedUntil : 0,
    };
  } catch { return emptyTrialConsentMemory(); }
}

/** Same truthy off-switch convention as onboardingConfig; no user data. */
export function trialConsentEnabled(input: { env?: string; redis: unknown }): boolean {
  if (input.env === '1') return false;
  const value = input.redis;
  return value == null || value === '' || value === 0 || value === false || value === '0' || value === 'false';
}

export type TrialConsentInput = {
  customerInfo: Pick<CustomerInfo, 'entitlements'> | null;
  countryCode: string | null;
  platform: string;
  locale: string;
  enabled: boolean;
  now: number;
  memory: TrialConsentMemory;
  /** Keep an already visible early card during this dashboard visit only. */
  earlyVisiblePeriod?: string | null;
};
export type TrialConsentNotice = {
  store: TrialStore;
  expiresAt: number;
  period: string;
  reason: 'ending' | 'early';
};

/** SDK 13.2.1: TRIAL means free; INTRO means discounted, not necessarily free.
 * There is no purchase price/offer-redemption/consent-status field in CustomerInfo.
 * A free intro/offer is included when the store reports its current period as TRIAL.
 */
export function trialConsentNotice(input: TrialConsentInput): TrialConsentNotice | null {
  const { now, memory } = input;
  if (!input.enabled || input.locale !== 'ko' || !Number.isFinite(now)) return null;
  // Apple uses ISO alpha-3, Play alpha-2. Never derive store country from locale.
  if (!['KR', 'KOR'].includes(input.countryCode?.trim().toUpperCase() ?? '')) return null;
  const pro = input.customerInfo?.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!pro?.isActive || pro.willRenew !== true || pro.ownershipType === 'FAMILY_SHARED') return null;
  if (pro.periodType.toUpperCase() !== 'TRIAL') return null;
  const store = pro.store;
  if (!((store === 'APP_STORE' && input.platform === 'ios') || (store === 'PLAY_STORE' && input.platform === 'android'))) return null;
  const expiresAt = Date.parse(pro.expirationDate ?? '');
  const startedAt = Date.parse(pro.latestPurchaseDate);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(startedAt) || startedAt > now || expiresAt <= now || expiresAt <= startedAt) return null;
  if (memory.snoozedUntil > now) return null;
  const period = `${startedAt}:${expiresAt}`;
  if (expiresAt - now <= TRIAL_CONSENT_SNOOZE_MS) return { store, expiresAt, period, reason: 'ending' };
  // The research's 24-hour schedule is Apple-specific. Latest purchase is the
  // start of the current free period, not a separately verified redemption time.
  if (store === 'APP_STORE' && now - startedAt >= TRIAL_CONSENT_DAY_MS
    && (memory.earlySeenPeriod !== period || input.earlyVisiblePeriod === period)) {
    return { store, expiresAt, period, reason: 'early' };
  }
  return null;
}

/** Only the active product's monthly store price; never another offering's price. */
export function trialConsentPrice(info: Pick<CustomerInfo, 'entitlements'> | null, products: readonly PurchasesStoreProduct[]): string | null {
  const pro = info?.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!pro) return null;
  const id = pro.store === 'PLAY_STORE' && pro.productPlanIdentifier
    ? `${pro.productIdentifier.split(':')[0]}:${pro.productPlanIdentifier}` : pro.productIdentifier;
  const product = products.find((p) => p.identifier === id && p.subscriptionPeriod === 'P1M');
  return product?.priceString?.trim() ? product.priceString : null;
}

export function trialConsentCopy(notice: TrialConsentNotice, priceString: string | null): string {
  const end = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
  }).format(notice.expiresAt);
  const price = priceString?.trim() ? `월 ${priceString}으로 ` : '';
  const store = notice.store === 'APP_STORE' ? 'App Store' : 'Google Play';
  return `무료 체험은 ${end}까지입니다. 이후 ${price}계속 이용하려면 ${store}에서 유료 전환 동의 여부를 확인해 주세요. 동의하지 않으면 체험 종료 후 유료로 갱신되지 않습니다.`;
}
