// ============================================================================
// «내 종목» 기능 플래그
// ----------------------------------------------------------------------------
// 알림(벨·알림 혜택 문구·03/04 시트)은 전부 NEXT_PUBLIC_WATCHLIST_ALERTS === '1' 뒤에 있다.
//   기본 꺼짐 — 알림 백엔드(feat/watchlist-alerts)가 따로 만들어지고 있다.
//   켜는 법: Vercel 환경변수 NEXT_PUBLIC_WATCHLIST_ALERTS=1 → 재배포(빌드 시점에 박힌다).
// 프리뷰 확인용: *.vercel.app · localhost 에서만 `?sgalerts=1` 로 켜 볼 수 있다(운영 도메인 무효).
// ============================================================================

import { useSyncExternalStore } from 'react';
import { previewFlag } from '@/lib/app/proEntitlement';

export const WATCHLIST_ALERTS_BUILD_FLAG = process.env.NEXT_PUBLIC_WATCHLIST_ALERTS === '1';

const noopSubscribe = () => () => {};

/** 서버 렌더·하이드레이션은 빌드 플래그 그대로 — 그 뒤 프리뷰 강제값을 반영한다. */
export function useWatchlistAlertsEnabled(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => WATCHLIST_ALERTS_BUILD_FLAG || previewFlag('sgalerts'),
    () => WATCHLIST_ALERTS_BUILD_FLAG,
  );
}

/** 이벤트 핸들러 등 훅 밖에서 */
export function watchlistAlertsEnabledNow(): boolean {
  return WATCHLIST_ALERTS_BUILD_FLAG || previewFlag('sgalerts');
}
