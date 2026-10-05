// ============================================================================
// 안드로이드 — 앱 «밖»에서 끝난 구독 구매를 복귀 때 놓치지 않는다 (2026-10-06)
// ----------------------------------------------------------------------------
// 언제: Play 스토어에서 일회용 코드를 쓰면 구글이 «그 자리에서» 구독 구매를 권한다(앱 밖 구매) —
//   «a user who redeems a one-time code from the Play store is immediately asked to purchase the subscription through
//    the Play store. This is an out-of-app purchase, so be sure that your app can handle these purchases gracefully.»
//   (developer.android.com/google/play/billing/promo) · 구글 결제 연동 문서: «Some purchases, such as promotion redemptions,
//   can be made outside your app» → 앱이 앞으로 올 때 queryPurchasesAsync 로 확인하라(developer.android.com/google/play/billing/integrate).
// 이미 있는 것: RevenueCat Android SDK(purchases-android 10.11.0 — purchases-capacitor 13.2.1 → hybrid-common 18.18.0)는
//   앱이 앞으로 올 때 onAppForegrounded → postPendingTransactionsHelper.syncPendingPurchaseQueue 로 Play 구매를 조회해
//   아직 안 보낸 구매를 올린다(소스 PurchasesOrchestrator.kt — 자동, autoSyncPurchases 기본 켜짐).
// 이 파일이 더하는 것(운영 세션 지시 10/6): 복귀(appStateChange isActive → NativeAppProvider 가 쏘는 'app:resume') 때
//   PRO 가 아니면 RevenueCat syncPurchases 를 «한 번» 더 — 같은 세션에서 10분에 1번 이하.
//   RevenueCat 문서(revenuecat.com/docs/getting-started/restoring-purchases): «If you are trying to restore a purchase
//   programmatically, use syncPurchases instead. This will not cause OS level sign-in prompts to appear.»
//   restorePurchases 는 쓰지 않는다 — 같은 문서: «The restorePurchases method should not be triggered programmatically».
//   (같은 문서의 주의 «there is a risk of transferring or aliasing an anonymous user» — 같은 Play 계정의 구매를 지금 익명 ID 로
//    옮기는 것은 이 경우 원하는 동작이다. 구매가 없으면 SDK 는 캐시된 CustomerInfo 만 읽는다 — SyncPurchasesHelper.kt)
// 건너뛰는 경우: 이미 PRO · 10분 안에 이미 함 · 앱 안 결제·복원 창이 떠 있는 중(구글 결제 창이 닫히면 onResume 이 와서
//   'app:resume' 이 울린다 — Capacitor BridgeActivity.onResume → fireStatusChange(true)) · 이미 도는 중.
// ============================================================================

export const FOREGROUND_SYNC_MIN_GAP_MS = 10 * 60_000;

export type ForegroundSyncResult = 'skip' | 'already_pro' | 'synced' | 'synced_pro' | 'error';

/** 지금 돌릴까(순수) — 도는 중·결제 창 중이면 아니다 · 10분 간격 */
export function shouldForegroundSync(s: { now: number; lastAt: number | null; inflight: boolean; storeFlow: boolean }): boolean {
  if (s.inflight || s.storeFlow) return false;
  return s.lastAt == null || s.now - s.lastAt >= FOREGROUND_SYNC_MIN_GAP_MS;
}

export interface ForegroundSyncDeps {
  /** 지금 PRO 인가(SDK 캐시 — 앞으로 온 직후엔 SDK 가 이미 새로 읽고 있다) */
  isPro: () => Promise<boolean>;
  /** RevenueCat syncPurchases */
  sync: () => Promise<void>;
  notifyPro: () => void;
  storeFlow: () => boolean;
  now?: () => number;
}

/** 세션 상태(앱 웹뷰가 살아 있는 동안 — 다시 로드되면 새 세션) */
const session: { lastAt: number | null; inflight: boolean } = { lastAt: null, inflight: false };

/** 복귀 한 번 — 순서: 간격·결제 창 확인 → PRO 면 끝 → syncPurchases 1회(이때 간격 시계를 잰다) → 다시 읽어 PRO 면 공용 상태에 알린다 */
export async function foregroundProSync(deps: ForegroundSyncDeps, st = session): Promise<ForegroundSyncResult> {
  const now = deps.now ?? Date.now;
  if (!shouldForegroundSync({ now: now(), lastAt: st.lastAt, inflight: st.inflight, storeFlow: deps.storeFlow() })) return 'skip';
  st.inflight = true;
  try {
    if (await deps.isPro()) return 'already_pro';
    if (deps.storeFlow()) return 'skip';
    st.lastAt = now();
    await deps.sync();
    if (await deps.isPro()) { deps.notifyPro(); return 'synced_pro'; }
    return 'synced';
  } catch {
    return 'error';
  } finally {
    st.inflight = false;
  }
}

/** 시험용 — 세션 상태 비우기 */
export function _resetForegroundSyncForTest() { session.lastAt = null; session.inflight = false; }

let started = false;

/**
 * 안드로이드 앱에서 한 번만 건다(NativeAppProvider 초기화). 웹·iOS·IAP 꺼짐이면 아무것도 하지 않는다.
 * 'app:resume' = NativeAppProvider 의 @capacitor/app appStateChange(isActive) — 리스너를 하나 더 만들지 않고 그 신호를 쓴다.
 */
export async function startForegroundProSync(): Promise<void> {
  if (started || typeof document === 'undefined') return;
  let android = false;
  try {
    const { Capacitor } = await import('@capacitor/core');
    android = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch { android = false; }
  if (!android) return;
  const { IAP_LIVE } = await import('@/config/iap');
  if (!IAP_LIVE) return;
  started = true;

  const run = async () => {
    try {
      const rc = await import('@/services/revenueCat');
      if (!(await rc.initRevenueCat())) return;
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      const { notifyProPurchased } = await import('@/lib/app/proEntitlement');
      await foregroundProSync({
        isPro: async () => {
          const { customerInfo } = await Purchases.getCustomerInfo();
          return rc.isProFromCustomerInfo(customerInfo);
        },
        sync: async () => { await Purchases.syncPurchases(); },
        notifyPro: () => notifyProPurchased(true),
        storeFlow: rc.isStoreFlowActive,
      });
    } catch { /* 동기화 실패는 조용히 — SDK 의 자동 동기화가 다음 복귀에 또 돈다 */ }
  };
  document.addEventListener('app:resume', () => { void run(); });
}
