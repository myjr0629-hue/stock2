// ============================================================================
// 첫 실행 «7일 무료 체험» 페이월 (2026-11-16 매출 스프린트 — 대표 «실질적으로 매출»)
// ----------------------------------------------------------------------------
// 첫 실행 흐름(법적 고지 → 가치(종목 고르기) → 알림)이 «끝난 직후» 닫을 수 있는 페이월을 기기마다 한 번 보인다(출처 first_run).
//   · 보이는 조건: 네이티브 · 결제 가능 · PRO 상태 받음 · PRO 아님(코드 PRO 포함) · 스토어 재조회도 무료 · 결제 진행 중 아님 ·
//     스토어가 «자격 확인된 무료 체험»을 준 플랜이 하나라도 있음(PlanOffer.trialDays) · 이 기기에서 처음.
//   · 하나라도 아니면 아무것도 안 그린다(예전과 똑같이 앱으로 들어간다). 체험 자격이 없는 사람에게 정가 페이월을 들이밀지 않는다.
//   · 기록(한 번)은 «보이기 직전»에 — 기록이 실패하면(저장소 막힘) 보이지 않는다(매 실행 반복 방지).
// ============================================================================

export const FIRST_RUN_PAYWALL_KEY = 'signumhq.firstrun.trial_paywall.v1';
/** 오퍼링·PRO 상태를 기다리는 상한 — 넘으면 조용히 건너뛴다(앱 진입을 막지 않는다) */
export const FIRST_RUN_PAYWALL_WAIT_MS = 8_000;

export type FirstRunPaywallState = {
  iapAvailable: boolean;
  ready: boolean;
  isPro: boolean;
  /** 결제 진행 중(막 결제함) */
  pending: boolean;
  /** 공유 신호의 최신 스토어 응답이 PRO(gatePaywall storeProSignal.latest()) */
  sharedPro: boolean;
  offers: readonly { plan: string; trialDays?: number | null }[];
  /** 이 기기에서 이미 보였다 */
  shown: boolean;
};

/** 'wait' = 아직 모른다(PRO 상태·오퍼링 대기) · 'skip' = 안 보인다 · 'check' = 스토어 재조회 뒤 무료면 보인다 */
export function firstRunPaywallStep(s: FirstRunPaywallState): 'wait' | 'skip' | 'check' {
  if (s.shown) return 'skip';
  if (s.isPro || s.sharedPro || s.pending) return 'skip';
  if (!s.ready) return 'wait';
  if (!s.iapAvailable) return 'skip';
  if (!s.offers.some((o) => o.plan !== 'lifetime' && typeof o.trialDays === 'number' && o.trialDays > 0)) return 'skip';
  return 'check';
}

export type MiniStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function readFirstRunPaywallShown(store: MiniStore | null): boolean {
  try { return !store || store.getItem(FIRST_RUN_PAYWALL_KEY) !== null; } catch { return true; }
}

/** 보였다고 적는다 — 적은 값을 다시 읽어 확인. 실패면 false(호출자는 보이지 않는다) */
export function markFirstRunPaywallShown(store: MiniStore | null, now = Date.now()): boolean {
  try {
    if (!store) return false;
    const v = String(now);
    store.setItem(FIRST_RUN_PAYWALL_KEY, v);
    return store.getItem(FIRST_RUN_PAYWALL_KEY) === v;
  } catch { return false; }
}
