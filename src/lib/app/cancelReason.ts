export const CANCEL_REASON_CODES = ['price', 'not_used', 'missing_feature', 'other_app', 'other'] as const;
export type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number];
export const CANCEL_REASON_STORAGE_KEY = 'signumhq.cancelReason.v1';
let seenInSession = false;

/** Do not put the survey beneath an existing dialog. */
export function canPresentCancelReason(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible'
    && !document.querySelector('[aria-modal="true"], [data-pro-paywall]');
}

/** Check without consuming the opportunity before the sheet is displayed. */
export function canShowCancelReason(): boolean {
  if (seenInSession) return false;
  try { if (localStorage.getItem(CANCEL_REASON_STORAGE_KEY)) { seenInSession = true; return false; } } catch { /* session fallback */ }
  return true;
}

export function claimCancelReason(): boolean {
  if (!canShowCancelReason()) return false;
  seenInSession = true;
  try { localStorage.setItem(CANCEL_REASON_STORAGE_KEY, '1'); } catch { /* session fallback */ }
  return true;
}

export function cancelReasonCopy(locale: string) {
  if (locale === 'ko') return { title: 'PRO를 계속 쓰지 않으려는 이유가 있다면?', options: ['가격이 부담', '아직 충분히 못 써봄', '필요한 기능이 없음', '다른 앱을 씀', '기타'], skip: '건너뛰기' };
  if (locale === 'ja') return { title: 'PROを使い続けない理由があれば教えてください', options: ['価格が負担', 'まだ十分に使えていない', '必要な機能がない', '別のアプリを使っている', 'その他'], skip: 'スキップ' };
  return { title: 'Is there a reason you don’t want to keep using PRO?', options: ['The price is too high', 'I haven’t used it enough yet', 'A feature I need is missing', 'I use another app', 'Other'], skip: 'Skip' };
}
