// ============================================================================
// 새 RevenueCat 고객 정보 한 번 (2026-11-18 체험자 알림 다시 묻기 — 판정기·시트가 같이 쓴다)
//   SDK 미설정·웹·실패·시간 초과 = null(호출자는 «모름» = 안 보인다/요청 안 함). TrialAnnounceGate freshInfo 와 같은 방식.
// ============================================================================
import { initRevenueCat } from '@/services/revenueCat';

/** opts.noCache = 캐시를 먼저 비워 서버에서 다시 받는다(수락 직전 — 시트가 떠 있는 사이 철회된 체험을 캐시로 «활성»이라 보지 않게) */
export async function freshCustomerInfo(timeoutMs: number, opts: { noCache?: boolean } = {}): Promise<unknown | null> {
  try {
    if (!(await initRevenueCat())) return null;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const ask = async () => {
      // 캐시 비우기가 실패하면 캐시 값을 믿지 않는다(= 모름)
      if (opts.noCache) await Purchases.invalidateCustomerInfoCache();
      return Purchases.getCustomerInfo();
    };
    const r = await Promise.race([
      ask(),
      new Promise<null>((res) => setTimeout(() => res(null), timeoutMs)),
    ]);
    return r ? r.customerInfo : null;
  } catch {
    return null;
  }
}
