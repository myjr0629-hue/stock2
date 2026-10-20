import type { PurchaseOutcome } from '@/services/revenueCat';
import { withinDeadline } from './requestDeadline';

/** 두 구매 화면·재마운트 사이에도 유지한다. 승인된 구매는 권한 확인 전까지 재구매하지 않는다. */
export function createProPurchaseState() {
  let pending = false;
  let flight: Promise<PurchaseOutcome> | null = null;
  const listeners = new Set<() => void>();
  const publish = (value: boolean) => {
    pending = value;
    listeners.forEach((f) => f());
  };
  const confirm = () => { if (pending) publish(false); };
  return {
    getSnapshot: () => pending,
    subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; },
    confirm,
    run(purchase: () => Promise<PurchaseOutcome>, recheck: () => Promise<boolean>): Promise<PurchaseOutcome> {
      if (flight) return flight;
      if (pending) return Promise.resolve({ ok: true, isPro: false });
      publish(true);
      flight = Promise.resolve().then(async () => {
        try {
          const result = await purchase();
          if (!result.ok || result.isPro) { confirm(); return result; }
          // 기존 쿠폰 경로의 읽기 재확인(즉시·3초·8초)만 사용. 복원·재구매는 호출하지 않는다.
          let pro = false;
          try { pro = await withinDeadline(recheck, 15_000); } catch { /* 승인된 구매 잠금 유지 */ }
          if (pro) { confirm(); return { ...result, isPro: true }; }
          return result;
        } catch {
          confirm();
          return { ok: false, isPro: false };
        } finally { flight = null; }
      });
      return flight;
    },
  };
}

export const proPurchaseState = createProPurchaseState();
