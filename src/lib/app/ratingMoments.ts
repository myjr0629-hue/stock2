import { APP_SESSION_REVIEW } from './reviewMoments';

/** 새 평점 순간의 세션 단위 표식. 저장소가 막히면 요청하지 않는다. */
export const RATING_ERROR_KEY = 'signum.rating.sessionError';
export const RATING_ROW_KEY = 'signum.rating.reactionSeen';
export const RATING_PUSH_KEY = 'signum.rating.pushSession';
export const RATING_PUSH_COUNT = 'signum.rating.pushSessions';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function ratingSessionEligible(local: Store, session: Store): boolean {
  try { return Number(local.getItem(APP_SESSION_REVIEW.storageKey)) >= 3 && session.getItem(RATING_ERROR_KEY) !== '1'; }
  catch { return false; }
}

export function markRatingError(session: Store): void {
  try { session.setItem(RATING_ERROR_KEY, '1'); } catch { /* ignore */ }
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
