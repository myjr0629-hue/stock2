// ============================================================================
// 체험 시작 직후 «내 종목»으로 한 번 이어 주기(전환 #2 · 2026-11-11 conversion RESULT §2)
//   실제 «신규 스토어 체험» 구매가 구매 전·후 새로 읽은 고객 정보로 확인될 때만, 체험 기간당 한 번. 복원·기존 구독·취소·실패·코드는 이동 없음.
//   구매 진입점 두 곳(ProPaywall · 내 종목 권유 시트 ProUpsellSheet 의 직접 구매)이 같은 purchaseWithTrialStart 를 쓴다(관문 11112153 ①).
//   구매 전 읽기를 기다리는 사이 페이월·시트를 닫았으면 구매 창을 열지 않는다(관문 11112153 ②).
// ============================================================================
import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';

export const TRIAL_START_WATCHLIST_KEY = 'signumhq.trialStartWatchlist.v1';

/** Fail closed: only a newly purchased store trial, confirmed on both sides of the purchase. */
export function newTrialPeriod(before: CustomerInfo | null, after: CustomerInfo | null, platform: string, product: string, started: number, now: number): string | null {
  if (!before || !after || !Number.isFinite(started) || !Number.isFinite(now)) return null;
  if (before.entitlements?.all?.[PRO_ENTITLEMENT_ID] || before.entitlements?.active?.[PRO_ENTITLEMENT_ID] || !Array.isArray(before.activeSubscriptions) || before.activeSubscriptions.length) return null;
  const pro = after.entitlements?.active?.[PRO_ENTITLEMENT_ID];
  if (!pro?.isActive || pro.periodType !== 'TRIAL' || pro.ownershipType !== 'PURCHASED' || pro.willRenew !== true) return null;
  if (!((platform === 'ios' && pro.store === 'APP_STORE') || (platform === 'android' && pro.store === 'PLAY_STORE'))) return null;
  if (!product || pro.productIdentifier !== product) return null;
  const start = Date.parse(pro.latestPurchaseDate ?? '');
  const end = Date.parse(pro.expirationDate ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < started - 60_000 || start > now || end <= now) return null;
  return `${pro.store}:${product}:${start}:${end}`;
}

/** Persist before navigation so duplicate callbacks cannot navigate twice. */
export function claimTrialWatchlist(period: string | null, pathname: string, storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  if (!period || /\/app-view\/watchlist\/?$/.test(pathname)) return false;
  try {
    if (storage.getItem(TRIAL_START_WATCHLIST_KEY) === period) return false;
    storage.setItem(TRIAL_START_WATCHLIST_KEY, period);
    return true;
  } catch { return false; }
}

export const TRIAL_START_BEFORE_READ_MS = 2500;
export const TRIAL_START_AFTER_READ_MS = 6000;
const WATCHLIST_PATH = /\/app-view\/watchlist\/?$/;

function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.catch(() => null), new Promise<null>((r) => { timer = setTimeout(() => r(null), ms); })]).finally(() => clearTimeout(timer));
}

export type TrialStartDeps = {
  read?: () => Promise<{ info: CustomerInfo; platform: string } | null>;
  path?: () => string;
  storage?: () => Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
};

/**
 * 구매 한 번 — 신규 체험이면 «이동해도 된다(claimed)»를 함께 돌려준다. 구매 전 읽기를 기다리는 동안 닫혔으면(stillOpen=false)
 * 구매하지 않고 null. 월·연 구독만, 지금 «내 종목» 화면이 아닐 때만 구매 전 읽기를 한다(그 밖에는 예전처럼 바로 구매).
 */
export async function purchaseWithTrialStart<R extends { ok: boolean; isPro: boolean }>(o: {
  plan: string; product: string | null | undefined; purchase: () => Promise<R>; stillOpen: () => boolean;
} & TrialStartDeps): Promise<{ res: R; claimed: boolean; origin: string } | null> {
  const read = o.read ?? readTrialCustomerInfo;
  const path = o.path ?? (() => { try { return window.location?.pathname ?? ''; } catch { return ''; } });
  const storage = o.storage ?? (() => { try { return window.localStorage; } catch { return null; } });
  const now = o.now ?? Date.now;
  const origin = path();
  const eligible = !!origin && !WATCHLIST_PATH.test(origin) && (o.plan === 'monthly' || o.plan === 'annual') && !!o.product;
  const before = eligible ? await within(read(), TRIAL_START_BEFORE_READ_MS) : null;
  if (eligible && !o.stillOpen()) return null;
  const started = now();
  const res = await o.purchase();
  if (!(res.ok && res.isPro && before)) return { res, claimed: false, origin };
  const after = await within(read(), TRIAL_START_AFTER_READ_MS);
  const period = newTrialPeriod(before.info, after?.info ?? null, after?.platform ?? '', o.product ?? '', started, now());
  let claimed = false;
  try { const st = storage(); claimed = !!st && path() === origin && claimTrialWatchlist(period, origin, st); } catch { claimed = false; }
  return { res, claimed, origin };
}

export async function readTrialCustomerInfo(): Promise<{ info: CustomerInfo; platform: string } | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    await Purchases.invalidateCustomerInfoCache();
    const { customerInfo } = await Purchases.getCustomerInfo();
    return { info: customerInfo, platform: Capacitor.getPlatform() };
  } catch { return null; }
}
