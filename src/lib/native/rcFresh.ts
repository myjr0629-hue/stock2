// ============================================================================
// 새 RevenueCat 고객 정보 한 번 (2026-11-18 체험자 알림 다시 묻기 — 판정기·시트가 같이 쓴다)
//   SDK 미설정·웹·실패·시간 초과 = null(호출자는 «모름» = 안 보인다/요청 안 함). TrialAnnounceGate freshInfo 와 같은 방식.
// ============================================================================
import { initRevenueCat } from '@/services/revenueCat';

export async function freshCustomerInfo(timeoutMs: number): Promise<unknown | null> {
  try {
    if (!(await initRevenueCat())) return null;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const r = await Promise.race([
      Purchases.getCustomerInfo(),
      new Promise<null>((res) => setTimeout(() => res(null), timeoutMs)),
    ]);
    return r ? r.customerInfo : null;
  } catch {
    return null;
  }
}
