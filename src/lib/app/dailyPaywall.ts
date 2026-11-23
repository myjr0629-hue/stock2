// ============================================================================
// 무료 네이티브 사용자 «하루 한 번» 앱 열 때 체험 페이월 (2026-11-23 매출 스프린트 — 대표 «매출을 극적으로 만들어내라»)
// ----------------------------------------------------------------------------
// 왜(ET 11/16~22 mkt-funnel 7): 모든 페이월 합계 7일 열림 99 · iOS 활성 ≈ 164 기기·일인데 무료 사용자가 페이월을 보는 곳은
//   첫 실행(기기당 1번)·설정·드문 게이트 탭뿐이었다. 결제 화면을 «보는 횟수» 자체가 병목 → 앱을 여는 날 한 번, 닫을 수 있는 페이월.
// 무엇(페이월 화면·가격·결제 흐름은 그대로 — 첫 실행 체험 페이월과 같은 ProPaywall trialHead, 출처 daily_open):
//   · 네이티브(iOS·안드) · 이번 실행이 «시작될 때» 이미 첫 실행 흐름을 마친 기기(첫 실행 직후 세션은 first_run 몫 — 안 뜬다)
//   · 이 기기에서 «오늘(현지 날짜)» 아직 안 봄 · 끄기 스위치 꺼짐(서버 응답을 못 받으면 = 안 보임)
//   · PRO 아님(스토어 PRO·코드 PRO = RC 권한 · 공유 PRO 신호) · 결제 진행 중 아님 · PRO 상태 받음 + 체험 자격 조회 끝남 · 결제 가능 · 스토어 가격 있음
//   · 보이기 직전 스토어 재조회(checkStorePro — 11/16 게이트와 같은 4상태)가 «무료 확인»일 때만. 모름·결제 진행 중 = 안 보임
//   · 겹침 없음: 오늘 다른 페이월·안내(블프 시트·체험 안내·선물·체험 종료·만료·게이트)를 봤으면 오늘은 쉰다(otherSheetToday) ·
//     다른 시트·결제 창(aria-modal)이 떠 있거나 게이트 흐름·게이트 페이월 자리 사용 중·코드 입력에서 막 돌아옴·평점 요청 대기/직후·광고 중/직후면 이번 포그라운드는 넘긴다
//   · 뜨면 게이트 하루 표식(gate_first)을 오늘로 — 같은 날 페이월을 두 번 들이밀지 않는다(체험 안내·블프 시트와 같은 규칙)
// 닫기: 첫 페인트에 44px 닫기(ProPaywall 그대로) — 하드 페이월 아님. 닫으면 그날은 끝.
// 끄기 스위치(재배포 없이): 레디스 `daily-paywall:off` = 아무 값(전부 끔) · 'ios' · 'android'(그 플랫폼만) — /api/app/daily-paywall · 환경변수 DAILY_PAYWALL_OFF 도 같다.
// 기록: 기기 저장(보인 현지 날짜) — 보이기 «직전». 쓰기 실패 = 안 보인다(매 실행 반복 방지). 서버 키·식별자 없음.
// iOS 홍보 푸시는 쓰지 않는다(4.5.4) — 앱 안 페이월만. 애플 3.1.2 고지·복원·약관 링크는 ProPaywall 그대로.
// ============================================================================

export const DAILY_PAYWALL_KEY = 'signumhq.daily_paywall.v1';
/** 레디스 끄기 스위치 키(다른 기능의 `<기능>:off` 관례) */
export const DAILY_PAYWALL_OFF_KEY = 'daily-paywall:off';
/** 포그라운드가 된 뒤 이만큼 기다렸다 판정 — 체험 안내(2.5초+확인 3초)·블프 시트(3초+확인 3초)·선물 안내(3.5초)·평점 순간(2.5초)이 먼저 자리를 잡게 */
export const DAILY_PAYWALL_DELAY_MS = 7_000;
/** 보이기 직전 스토어 재조회 상한 */
export const DAILY_PAYWALL_CHECK_MS = 3_000;
/** 끄기 스위치 응답 상한 — 넘으면 이번 실행은 안 보인다 */
export const DAILY_PAYWALL_SWITCH_MS = 2_500;
/** 한 실행에서 스토어 재조회를 «모름»으로 끝낸 횟수 상한(공급사 호출 상한) */
export const DAILY_PAYWALL_MAX_TRIES = 3;
/** 평점 요청(OS 시트)을 예약했거나 막 요청한 뒤 이만큼은 띄우지 않는다 — OS 평점 시트는 DOM 에 없어 aria-modal 로 못 본다 */
export const DAILY_PAYWALL_REVIEW_QUIET_MS = 30_000;

export type MiniStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export type DailyPlatform = 'ios' | 'android' | 'web';

/** 기기 현지 날짜 YYYY-MM-DD(gatePaywall localDay 와 같은 형식) */
export function dailyDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 오늘 이미 봤나 — 저장소가 없거나 던지면 «봤다»(안 보인다) */
export function dailyShownToday(store: MiniStore | null, now = Date.now()): boolean {
  try { return !store || store.getItem(DAILY_PAYWALL_KEY) === dailyDay(now); } catch { return true; }
}

/** 보였다고 적는다(현지 날짜) — 다시 읽어 확인. 실패면 false(호출자는 보이지 않는다) */
export function markDailyShown(store: MiniStore | null, now = Date.now()): boolean {
  try {
    if (!store) return false;
    const v = dailyDay(now);
    store.setItem(DAILY_PAYWALL_KEY, v);
    return store.getItem(DAILY_PAYWALL_KEY) === v;
  } catch { return false; }
}

/** 실행 시작 전 가벼운 문(SDK·페이월을 싣기 전에) — 하나라도 아니면 이번 실행은 아무것도 싣지 않는다 */
export function dailyPreGate(s: { native: boolean; onboardedAtStart: boolean; store: MiniStore | null; now: number }): boolean {
  if (!s.native || !s.onboardedAtStart || !s.store) return false;
  return !dailyShownToday(s.store, s.now);
}

// ── 끄기 스위치 ───────────────────────────────────────────────────────────
export type DailyOff = 'all' | 'ios' | 'android' | null;

/** 서버: 레디스 값·환경변수 → 끈 범위(null = 켜짐). 'ios'·'android' 는 그 플랫폼만, 그 밖의 «참 같은» 값은 전부 */
export function dailyOffScope(input: { env?: string | undefined; redis: unknown }): DailyOff {
  const one = (v: unknown): DailyOff => {
    if (v == null || v === '' || v === 0 || v === false || v === '0' || v === 'false') return null;
    const s = String(v).trim().toLowerCase();
    if (s === 'ios' || s === 'android') return s;
    return 'all';
  };
  const e = one(input.env);
  if (e === 'all') return 'all';
  const r = one(input.redis);
  if (r === 'all') return 'all';
  if (e && r && e !== r) return 'all';
  return e ?? r;
}

/** 클라이언트: /api/app/daily-paywall 응답 → 이 플랫폼에서 켜졌나(모양이 다르면 false — 모르면 안 보인다) */
export function dailyOnFor(j: unknown, platform: DailyPlatform): boolean {
  if (!j || typeof j !== 'object') return false;
  const { on, off } = j as { on?: unknown; off?: unknown };
  if (on !== true) return false;
  if (off == null) return true;
  if (off === 'all') return false;
  return off !== platform;
}

// ── 판정 ─────────────────────────────────────────────────────────────────
export type DailyState = {
  iapAvailable: boolean;
  /** PRO 상태 받음 && 체험 자격 조회 끝남(useProStatus ready && trialsReady) */
  ready: boolean;
  isPro: boolean;
  /** 공유 PRO 신호(gatePaywall storeProSignal — 가장 최신 스토어 응답이 PRO) */
  sharedPro: boolean;
  /** 결제 진행 중 */
  pending: boolean;
  /** 스토어 가격(플랜) 수 — 0 이면 «구매할 수 없음» 페이월이 되므로 띄우지 않는다 */
  offerCount: number;
  /** 오늘 이미 봤다 */
  shownToday: boolean;
  /** 지금 경로가 앱 화면(문서·첫 실행·설정 아님) */
  routeOk: boolean;
  /** 오늘 다른 안내·페이월을 봤다 */
  otherToday: boolean;
  /** 다른 시트·결제 창이 떠 있다 */
  dialogOpen: boolean;
  /** 앱이 앞에 있다 */
  visible: boolean;
  /** 게이트 흐름(탭→광고 준비·대체 창)·게이트 페이월 자리 사용 중 */
  gateBusy: boolean;
  /** 코드 입력(애플 사용 창·안드 안내)에서 막 돌아옴 — PRO 반영 재조회 중일 수 있다 */
  redeemBusy: boolean;
  /** 평점 요청 대기 중·직후 */
  reviewBusy: boolean;
  /** 광고 진행 중·직후 */
  adBusy: boolean;
};

/**
 * 'stop' = 이번 실행은 끝(대상 아님·오늘 봄) · 'wait' = 아직 모른다 · 'later' = 다음 포그라운드(또는 상태 변화)에 다시 · 'check' = 스토어 재조회 뒤 보인다
 */
export function dailyStep(s: DailyState): 'stop' | 'wait' | 'later' | 'check' {
  if (s.shownToday) return 'stop';
  if (s.isPro || s.sharedPro) return 'stop';
  if (!s.ready) return s.pending ? 'later' : 'wait';
  if (!s.iapAvailable) return 'stop';
  if (s.offerCount <= 0) return 'stop';
  if (s.pending || !s.visible || !s.routeOk || s.otherToday || s.dialogOpen || s.gateBusy || s.redeemBusy || s.reviewBusy || s.adBusy) return 'later';
  return 'check';
}

/** 평점 요청 대기·직후인가 — reviewRequestedAt() = 마지막 요청 시각 또는 아직 실행 전 예약의 예정 시각(미래) */
export function reviewBusyAt(requestedAt: number, now: number): boolean {
  return Number.isFinite(requestedAt) && requestedAt > 0 && requestedAt > now - DAILY_PAYWALL_REVIEW_QUIET_MS;
}

/** 앱 화면 경로인가 — 법적 문서·첫 실행 화면·설정에서는 띄우지 않는다(trialAnnounceRouteOk 와 같은 규칙) */
export function dailyRouteOk(path: string): boolean {
  if (!/\/app-view(\/|$)/.test(path)) return false;
  return !/\/app-view\/(terms|privacy|onboarding|settings)(\/|$)/.test(path);
}
