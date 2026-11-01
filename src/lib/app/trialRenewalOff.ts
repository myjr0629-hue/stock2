import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';
import type { TrialStore } from '@/lib/app/trialConsent';

export const TRIAL_OFF_STORAGE_KEY = 'signumhq.trialRenewalOff.v1';
export const TRIAL_OFF_WINDOW_MS = 48 * 60 * 60 * 1000;
export type TrialOffNotice = { store: TrialStore; expiresAt: number; period: string };

export function trialRenewalOffNotice(info: Pick<CustomerInfo, 'entitlements'> | null, platform: string, now: number, seen: string | null): TrialOffNotice | null {
  const pro = info?.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!Number.isFinite(now) || !pro?.isActive || pro.willRenew !== false || pro.periodType !== 'TRIAL' || pro.ownershipType === 'FAMILY_SHARED') return null;
  const store = pro.store;
  if (!((store === 'APP_STORE' && platform === 'ios') || (store === 'PLAY_STORE' && platform === 'android'))) return null;
  const start = Date.parse(pro.latestPurchaseDate ?? '');
  const expiresAt = Date.parse(pro.expirationDate ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(expiresAt) || start > now || expiresAt <= start || expiresAt <= now || expiresAt - now > TRIAL_OFF_WINDOW_MS) return null;
  const period = `${start}:${expiresAt}`;
  return period === seen ? null : { store, expiresAt, period };
}

export function verifiedTrialRenewalOffNotice(initial: Pick<CustomerInfo, 'entitlements'>, fresh: Pick<CustomerInfo, 'entitlements'>, platform: string, now: number, seen: string | null): TrialOffNotice | null {
  const before = initial.entitlements.active[PRO_ENTITLEMENT_ID];
  const after = fresh.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!before?.productIdentifier || before.productIdentifier !== after?.productIdentifier) return null;
  const first = trialRenewalOffNotice(initial, platform, now, seen);
  const latest = trialRenewalOffNotice(fresh, platform, now, seen);
  return first && latest && first.period === latest.period && first.store === latest.store ? latest : null;
}

export const TRIAL_OFF_COPY = {
  ko: { title: '체험이 곧 끝나요', intro: 'PRO로 계속 볼 수 있는 것', watchlist: '내 종목 최대 100개 (무료 5개)', ads: '광고 없음', alerts: '고래 알림', manage: '계속 쓰기', later: '나중에' },
  en: { title: 'Your trial is ending soon', intro: 'Keep enjoying with PRO', watchlist: 'Up to 100 watchlist stocks (5 free)', ads: 'No ads', alerts: 'Whale alerts', manage: 'Keep using PRO', later: 'Later' },
  ja: { title: 'トライアルがまもなく終了します', intro: 'PROで引き続き利用できること', watchlist: 'マイ銘柄は最大100銘柄（無料は5銘柄）', ads: '広告なし', alerts: 'クジラアラート', manage: '使い続ける', later: '後で' },
} as const;
export function trialOffCopy(locale: string) { return TRIAL_OFF_COPY[locale === 'ko' || locale === 'ja' ? locale : 'en']; }
