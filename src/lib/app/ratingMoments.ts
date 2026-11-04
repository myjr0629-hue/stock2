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
