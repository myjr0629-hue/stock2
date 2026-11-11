import { APP_SESSION_REVIEW } from './reviewMoments';

// ============================================================================
// 새 평점 «좋은 순간» 두 곳(11/5) — OS 평점 API 만(Apple 5.6.1: 자체 별점 팝업·보상·사전 만족도 분기 금지)
//   (a) 실적 화면에서 내 종목의 «발표 후 실제 반응 · 범위 안» 행이 보였을 때(세션 첫 표시 3초 뒤)
//   (b) 실적·이상신호 알림(wl_signal)을 탭해 들어온 세션의 3번째 이후(누적)
// 공통 조건: 누적 세션 3회 이상 · 이번 세션 오류 화면 없음. 요청은 capacitorBridge.promptRatingMoment 가
//   기존 하루 1회 표식·순간별 시도 2회 상한·광고/선물 안내 겹침 검사를 그대로 거쳐 한다.
// ============================================================================

/** 새 평점 순간의 세션 단위 표식. 저장소가 막히면 요청하지 않는다. */
export const RATING_ERROR_KEY = 'signum.rating.sessionError';
export const RATING_ROW_KEY = 'signum.rating.reactionSeen';
export const RATING_PUSH_KEY = 'signum.rating.pushSession';
export const RATING_PUSH_COUNT = 'signum.rating.pushSessions';

/** 순간 식별자 — capacitorBridge 의 기존 마일스톤(사용일 2·7, 실행 0)과 겹치지 않는 번호 */
export const RATING_MOMENT_REACTION = 101;
export const RATING_MOMENT_PUSH = 102;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function ratingSessionEligible(local: Store, session: Store): boolean {
  try { return Number(local.getItem(APP_SESSION_REVIEW.storageKey)) >= 3 && session.getItem(RATING_ERROR_KEY) !== '1'; }
  catch { return false; }
}

/** 창 오류 중 사용자가 본 오류가 아닌 것 — 크롬/웹뷰의 «ResizeObserver loop …» 알림(레이아웃 한 프레임 미뤄짐, 동작 영향 없음) */
export function isBenignWindowError(message: unknown): boolean {
  return typeof message === 'string' && /^ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/.test(message);
}

export function markRatingError(session: Store): void {
  try { session.setItem(RATING_ERROR_KEY, '1'); } catch { /* ignore */ }
}

/** 화면이 «처리된» 오류 상태(불러오기 실패 문구 등)를 그렸을 때 부른다 — 이번 세션은 새 평점 순간을 건너뛴다. */
export function markSessionError(): void {
  try { if (typeof sessionStorage !== 'undefined') markRatingError(sessionStorage); } catch { /* storage unavailable */ }
}

export function markReactionSeen(session: Store): boolean {
  try {
    if (session.getItem(RATING_ROW_KEY)) return false;
    session.setItem(RATING_ROW_KEY, '1');
    return true;
  } catch { return false; }
}

export function countRatingPush(type: string | undefined, local: Store, session: Store): number {
  if (type !== 'wl_signal') return 0;
  try {
    if (session.getItem(RATING_PUSH_KEY)) return 0;
    const n = (Number(local.getItem(RATING_PUSH_COUNT)) || 0) + 1;
    session.setItem(RATING_PUSH_KEY, '1');
    local.setItem(RATING_PUSH_COUNT, String(n));
    return n;
  } catch { return 0; }
}

// ============================================================================
// ★11/11 세 번째 새 순간 — PRO 결제·체험 시작 «성공» (평점 미국 2·한국 5·일본 0, 대표 11/4 «별점 최우선»)
//   언제 성공으로 보나(복원은 제외 — 새로 얻은 가치가 아니다):
//     · useProStatus.purchase 가 ok && isPro (페이월·가치 벽·«내 종목» 시트·쿠폰 안내 시트 — 모든 앱 안 결제 경로가 모인다)
//     · iOS 코드 입력 시트/URL 에서 돌아와 PRO 확인(redeem.ts onAppActive)
//     · 안드로이드 Play 스토어 코드 사용 뒤 복귀 동기화로 PRO 확인(foregroundProSync 'synced_pro')
//   언제 묻나: 성공 표식(localStorage 시각)을 남기고, 페이월·시트가 닫힌 뒤 promptRatingMoment 로 «요청»만 한다.
//     · 첫 실행(누적 앱 세션 1)에는 묻지 않는다 — 코드로 첫 실행에 체험을 시작한 사람은 «다음 실행» 시작 4초 뒤로 미뤄진다.
//     · 이번 세션에 오류가 있었으면 묻지 않는다(다음 실행으로 넘어간다).
//     · 페이월이 떠 있으면(aria-modal — reviewMomentBlocked) 묻지 않는다. 결과 화면이 닫히지 않았으면 다음 실행에서 다시.
//     · 표식은 14일 동안만 유효하다(오래전 결제를 뒤늦게 묻지 않는다).
//   공유 제한은 기존 그대로: 하루 1회 · 순간당 실제 요청 2회 상한 · 광고/선물 안내 겹침 검사 · OS 자체 한도(iOS 365일 3회).
//   OS 평점 API 만(Apple 5.6.1) — 자체 별점 팝업·보상·사전 만족도 분기 없음. 화면에는 아무것도 그리지 않는다.
// ============================================================================
export const RATING_MOMENT_PRO = 103;
export const RATING_PRO_PENDING_KEY = 'signum.rating.proPendingAt';
export const PRO_ACTIVATED_EVENT = 'sg:pro-activated';
export const PRO_PENDING_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** 결제·체험 직후 결과 화면(페이월 닫힘·스토어 시트 퇴장)이 정리될 시간 */
export const PRO_MOMENT_DELAY_MS = 4000;

type RemovableStore = Store & Partial<Pick<Storage, 'removeItem'>>;

/** PRO 성공 표식을 남긴다(이미 있으면 처음 시각 유지 — 14일 창이 계속 밀리지 않게). 저장소가 막히면 아무것도 하지 않는다. */
export function noteProActivated(local: Store, now = Date.now()): boolean {
  try {
    const prev = Number(local.getItem(RATING_PRO_PENDING_KEY)) || 0;
    if (prev > 0 && now - prev < PRO_PENDING_TTL_MS) return false;
    local.setItem(RATING_PRO_PENDING_KEY, String(now));
    return true;
  } catch { return false; }
}

/**
 * 지금 PRO 순간으로 요청해도 되는가(예약 시·실행 시 모두 부른다).
 *   표식 있음(14일 안) · 첫 실행 아님(누적 세션 2+) · 이번 세션 오류 없음 · 페이월 경로 아님.
 *   (하루 1회·순간 완료·시도 상한·광고/모달 겹침은 promptRatingMoment/attemptReview 가 따로 본다.)
 */
export function proMomentEligible(local: RemovableStore, session: Store, now = Date.now(), path = ''): boolean {
  try {
    const at = Number(local.getItem(RATING_PRO_PENDING_KEY)) || 0;
    if (!(at > 0)) return false;
    if (now - at >= PRO_PENDING_TTL_MS || at > now + 60_000) {
      try { local.removeItem?.(RATING_PRO_PENDING_KEY); } catch { /* ignore */ }
      return false;
    }
    if (/paywall|\/pro(?:\/|$|\?)/i.test(path)) return false;
    return Number(local.getItem(APP_SESSION_REVIEW.storageKey)) >= 2 && session.getItem(RATING_ERROR_KEY) !== '1';
  } catch { return false; }
}

/**
 * 결제·체험 성공 지점이 부른다 — 표식을 남기고 앱 레이아웃(ReviewPromptMoments)에 알린다.
 * 던지지 않는다 — 평점 쪽 사정이 결제 흐름을 깨뜨리면 안 된다. 웹에서도 표식만 남고 요청은 네이티브에서만 간다.
 */
export function announceProActivated(): void {
  try {
    if (typeof window === 'undefined') return;
    try { noteProActivated(window.localStorage); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(PRO_ACTIVATED_EVENT));
  } catch { /* 오래된 웹뷰 */ }
}
