// ============================================================================
// 기존 무료 사용자에게 «새로 생긴 PRO 7일 무료 체험» 1회 안내 (2026-11-16 밤 매출 스프린트 — 대표 «현 시점 가장 중요한 건 매출»)
// ----------------------------------------------------------------------------
// 왜: 11/16 13시 스토어 소개 오퍼(7일 무료)를 만들었지만, 첫 실행 페이월(first_run)은 «새로 설치한 사람»에게만 뜬다.
//   이미 앱을 쓰는 무료 사용자(기기 200여 대)는 체험이 생긴 것을 모른다 → 앱이 앞으로 올 때 오늘 만든 체험 페이월(ProPaywall trialHead)을 기기당 한 번.
// 보이는 조건(전부 참일 때만 — 하나라도 모르면 안 보인다):
//   · 네이티브 앱 · 이 실행이 «시작될 때» 이미 첫 실행 흐름을 마친 기기(새 설치는 first_run 몫)
//   · 이 기기에서 trial_announce 를 본 적 없음 · first_run 페이월을 본 적 없음(본 사람은 이미 체험을 안다)
//   · PRO 상태 받음 + 체험 자격 조회 끝남 · PRO 아님(코드 PRO·공유 PRO 신호 포함) · 결제 진행 중 아님
//   · 스토어가 «자격 확인된 무료 체험»을 준 플랜이 하나 이상(PlanOffer.trialDays) — 체험·구독 이력이 있으면 스토어가 안 준다
//   · 보이기 직전 새 고객 정보(RevenueCat)로 한 번 더: PRO 아님 + 구매·체험·구독 «이력 0»(필드가 없거나 모양이 다르면 «모름» = 안 보임)
// 같은 날 겹침(우선순위 — 체험 종료 안내·만료 페이월·사용자가 누른 게이트 > 이 안내 · 선물 안내와는 «그날 먼저 뜬 쪽 하나»):
//   선물 안내는 3.5초 타이머·48시간 간격·최대 3회라, 그날 선물이 먼저 뜨면 이 안내는 다음 날 포그라운드에 뜬다(기기당 1회 기회는 그대로 남는다).
//   · 오늘 어느 출처든 PRO 페이월(게이트 gate_first·광고 없음 ad_nofill·설정 등)을 봤다 · 오늘 선물 안내를 봤다 · 오늘 체험 종료 안내(D-3·조기)·만료 페이월을 봤다 → 오늘은 안 보이고 다음 날 포그라운드에
//     (체험 종료 안내·만료 페이월·만료자 할인은 «체험 이력»이 있어야 뜨므로 이 안내 대상과 원래 겹치지 않는다 — 날짜 검사는 이중 안전장치)
//   · 다른 시트·결제 창(aria-modal)이 떠 있거나 게이트 흐름(광고 준비·대체 창)이 도는 중이면 이번 포그라운드는 넘긴다
//   · 이 안내가 뜨면 게이트 하루 표식(gate_first)을 오늘로 남긴다 → 오늘 게이트 탭은 페이월 없이 원래대로 광고(내일 다시)
//     광고가 안 나왔을 때의 페이월(ad_nofill)도 오늘은 건너뛴다(ValueWall — trialAnnouncedToday = «이미 페이월 본 탭»)
//   · 선물 안내(새·재안내)는 오늘 이 안내가 떴으면 'busy' 로 막힌다(lib/gift/giftAnnounce — trialAnnouncedToday)
// 기록: 보이기 «직전» 기기 저장(띄운 시각). 쓰기 실패 = 안 보인다(매 실행 반복 방지). 서버 키 없음.
// 문구·가격·버튼 동작은 오늘 체험 페이월 그대로 + 머리 위 한 줄(«새로 생긴 무료 체험»)만 — 애플 3.1.2·5.6(숨은 결제·가짜 긴박감 없음).
// iOS 홍보 푸시는 쓰지 않는다(4.5.4) — 앱 안 시트만.
// ============================================================================

export const TRIAL_ANNOUNCE_KEY = 'signumhq.trial_announce.v1';
/** 첫 실행 페이월 표식(lib/app/firstRunPaywall FIRST_RUN_PAYWALL_KEY 와 같은 값 — 순수 모듈끼리 순환을 피하려 값으로 둔다, 시험이 같음을 확인) */
export const FIRST_RUN_SHOWN_KEY = 'signumhq.firstrun.trial_paywall.v1';
/** 첫 안내 완료 표식(AppFirstRunOnboarding STORAGE_KEY · giftAnnounce ONBOARDING_DONE_KEY 와 같은 값) */
export const ONBOARDED_KEY = 'signumhq.app.onboarding.v1';
/** 같은 날 겹침을 보는 다른 시트 표식들 */
export const GATE_DAY_KEY = 'signum_gate_paywall_day';               // lib/app/gatePaywall GATE_PAYWALL_DAY_KEY(현지 YYYY-MM-DD)
export const GIFT_KEY = 'signumhq.gift.announce.v1';                   // lib/gift/giftAnnounce GIFT_ANNOUNCE_KEY({n,last} 또는 옛 숫자)
export const GIFT_RE_KEY = 'signumhq.gift.announce.1105';              // 재안내(띄운 시각)
/** 어느 출처든 PRO 페이월이 열린 시각(ProPaywall 이 열릴 때 남긴다 — notePaywallOpened). 오늘이면 이 안내는 다음 날 */
export const PAYWALL_OPEN_KEY = 'signumhq.paywall.open_at';
export const WARM_BF_DAY_KEY = 'signumhq.warm_bf.v1';                 // ★11/24 lib/app/warmBf WARM_BF_KEY(웜 블프 카드를 본 현지 YYYY-MM-DD)
export const TRIAL_OFF_KEYS = ['signumhq.trialRenewalOff.v1', 'signumhq.trialRenewalOff.early.v1', 'signumhq.trialExpired.v1'] as const; // «기간|현지 날짜»
/** 포그라운드가 된 뒤 이만큼 기다렸다 판정 — 체험 종료·만료 시트(SDK 읽기)가 먼저 자리를 잡게. 선물 안내와는 먼저 뜬 쪽이 그날 하나(서로 당일 표식을 읽는다) */
export const TRIAL_ANNOUNCE_DELAY_MS = 2_500;
/** 보이기 직전 새 고객 정보 조회 상한 — 넘으면 이번 실행은 안 보인다 */
export const TRIAL_ANNOUNCE_VERIFY_MS = 3_000;

// 게이트 흐름(ValueWall 탭 → PRO 재조회·보상형 광고 준비·대체 창) 진행 중 — 이 사이엔 DOM 시트가 없을 수 있어 따로 알린다(ValueWall gateBusy 와 같은 2분 상한)
//   게이트가 여러 개(인스턴스마다 흐름)일 수 있어 흐름마다 번호를 받아 따로 지운다 — 한쪽이 끝나도 다른 쪽이 돌면 «진행 중»(관문 11162024)
const gateFlows = new Map<number, number>();
let gateFlowSeq = 0;
export const GATE_FLOW_MAX_MS = 120_000;
export function beginGateFlow(now = Date.now()): number { const id = ++gateFlowSeq; gateFlows.set(id, now); return id; }
export function endGateFlow(id: number): void { gateFlows.delete(id); }
export function gateFlowActive(now = Date.now()): boolean {
  for (const [id, at] of gateFlows) { if (now - at < GATE_FLOW_MAX_MS) return true; gateFlows.delete(id); }
  return false;
}

export type MiniStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** 기기 현지 날짜 YYYY-MM-DD(gatePaywall localDay · trialRenewalOff localDayKey 와 같은 형식) */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function get(store: MiniStore | null, k: string): string | null {
  try { return store ? store.getItem(k) : null; } catch { return null; }
}

/** 이 기기에서 이미 봤나 — 저장소가 없거나 던지면 «봤다»(안 보인다) */
export function readTrialAnnounced(store: MiniStore | null): boolean {
  try { return !store || store.getItem(TRIAL_ANNOUNCE_KEY) !== null; } catch { return true; }
}

/** 오늘 이 안내가 떴나(선물 안내가 같은 날 겹치지 않게 읽는다) */
export function trialAnnouncedToday(store: MiniStore | null, now = Date.now()): boolean {
  const v = Number(get(store, TRIAL_ANNOUNCE_KEY));
  return Number.isFinite(v) && v > 0 && dayOf(v) === dayOf(now);
}

/** PRO 페이월이 열렸다고 적는다(ProPaywall 마운트 — 출처 무관 · 실패는 삼킨다). 이 안내의 «오늘 다른 페이월 봄» 판정에만 쓴다 */
export function notePaywallOpened(store: MiniStore | null, now = Date.now()): void {
  try { store?.setItem(PAYWALL_OPEN_KEY, String(now)); } catch { /* 저장소 막힘 */ }
}

/** 보였다고 적는다 — 다시 읽어 확인. 실패면 false(호출자는 보이지 않는다) */
export function markTrialAnnounced(store: MiniStore | null, now = Date.now()): boolean {
  try {
    if (!store) return false;
    const v = String(now);
    store.setItem(TRIAL_ANNOUNCE_KEY, v);
    return store.getItem(TRIAL_ANNOUNCE_KEY) === v;
  } catch { return false; }
}

/** 실행 시작 전 가벼운 문(SDK·페이월을 싣기 전에) — 하나라도 아니면 이번 실행은 아무것도 싣지 않는다 */
export function trialAnnouncePreGate(s: { native: boolean; onboardedAtStart: boolean; store: MiniStore | null }): boolean {
  if (!s.native || !s.onboardedAtStart || !s.store) return false;
  if (readTrialAnnounced(s.store)) return false;
  if (get(s.store, FIRST_RUN_SHOWN_KEY) !== null) return false;
  return true;
}

export function readOnboardedAt(store: MiniStore | null): boolean {
  return get(store, ONBOARDED_KEY) === 'accepted';
}

/** 오늘 다른 안내·페이월을 봤나(이 안내는 오늘 쉬고 다음 날 포그라운드에) */
export function otherSheetToday(store: MiniStore | null, now = Date.now()): boolean {
  const today = dayOf(now);
  const pw = Number(get(store, PAYWALL_OPEN_KEY));
  if (Number.isFinite(pw) && pw > 0 && dayOf(pw) === today) return true;
  if (get(store, GATE_DAY_KEY) === today) return true;
  // ★11/24 오늘 웜 블프 카드를 봤다(자동·요금제 탭 모두 — 자정 넘어 요금제 탭으로 연 경우 게이트 표식이 없어도, 관문 11240037)
  if (get(store, WARM_BF_DAY_KEY) === today) return true;
  const gift = get(store, GIFT_KEY);
  if (gift) {
    let last = NaN;
    if (/^\d{1,16}$/.test(gift)) last = Number(gift);
    else { try { last = Number((JSON.parse(gift) as { last?: unknown })?.last); } catch { /* 깨진 값 — 겹침 아님으로 본다(선물 쪽이 한도 다 씀으로 처리) */ } }
    if (Number.isFinite(last) && last > 0 && dayOf(last) === today) return true;
  }
  const re = Number(get(store, GIFT_RE_KEY));
  if (Number.isFinite(re) && re > 0 && dayOf(re) === today) return true;
  for (const k of TRIAL_OFF_KEYS) {
    const m = get(store, k);
    const i = m ? m.lastIndexOf('|') : -1;
    if (m && i >= 0 && m.slice(i + 1) === today) return true;
  }
  return false;
}

export type TrialAnnounceState = {
  iapAvailable: boolean;
  /** PRO 상태 받음 && 체험 자격 조회 끝남(useProStatus ready && trialsReady) */
  ready: boolean;
  isPro: boolean;
  sharedPro: boolean;
  pending: boolean;
  offers: readonly { plan: string; trialDays?: number | null }[];
  /** 이 기기에서 이미 봤거나 first_run 을 봤다 */
  seen: boolean;
  /** 지금 경로가 앱 화면(문서·첫 실행 화면 아님) */
  routeOk: boolean;
  /** 오늘 다른 안내·페이월을 봤다 */
  otherToday: boolean;
  /** 다른 시트·결제 창이 떠 있다 */
  dialogOpen: boolean;
  /** 앱이 앞에 있다 */
  visible: boolean;
  /** 게이트 흐름(탭→광고 준비·대체 창)이 진행 중 */
  gateFlow?: boolean;
};

/**
 * 'stop' = 이번 실행은 끝(대상 아님) · 'wait' = 아직 모른다 · 'later' = 다음 포그라운드에 다시 · 'check' = 새 고객 정보로 확인 뒤 보인다
 */
export function trialAnnounceStep(s: TrialAnnounceState): 'stop' | 'wait' | 'later' | 'check' {
  if (s.seen) return 'stop';
  if (s.isPro || s.sharedPro) return 'stop';
  if (!s.ready) return s.pending ? 'later' : 'wait';
  if (!s.iapAvailable) return 'stop';
  if (!s.offers.some((o) => o.plan !== 'lifetime' && typeof o.trialDays === 'number' && o.trialDays > 0)) return 'stop';
  if (s.pending || !s.visible || !s.routeOk || s.otherToday || s.dialogOpen || s.gateFlow) return 'later';
  return 'check';
}

type InfoLike = {
  entitlements?: { active?: Record<string, unknown> | null; all?: Record<string, unknown> | null } | null;
  activeSubscriptions?: unknown;
  allPurchasedProductIdentifiers?: unknown;
  nonSubscriptionTransactions?: unknown;
};

/** 체험·구독·구매 이력이 «확실히 0» 인가 — 필드가 없거나 모양이 다르면 false(모름 = 안 보임) */
export function noPurchaseHistory(info: InfoLike | null | undefined): boolean {
  if (!info || !info.entitlements) return false;
  const { active, all } = info.entitlements;
  if (!active || typeof active !== 'object' || Object.keys(active).length > 0) return false;
  if (!all || typeof all !== 'object' || Object.keys(all).length > 0) return false;
  for (const f of [info.activeSubscriptions, info.allPurchasedProductIdentifiers, info.nonSubscriptionTransactions]) {
    if (!Array.isArray(f) || f.length > 0) return false;
  }
  return true;
}

/** 앱 화면 경로인가 — 법적 문서·첫 실행 화면(layout isDocumentRoute 와 같은 규칙)과 설정(화면 전체가 배너 억제를 따로 쓴다 — 닫을 때 배너가 다시 뜨지 않게)에서는 띄우지 않는다 */
export function trialAnnounceRouteOk(path: string): boolean {
  if (!/\/app-view(\/|$)/.test(path)) return false;
  return !/\/app-view\/(terms|privacy|onboarding|settings)(\/|$)/.test(path);
}
