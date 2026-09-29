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

/**
 * 인사이트 칩 차등 — 무료 행당 1개 · PRO 2개 + 무료 행의 «잠긴 두 번째 칩»(종류 이름 + PRO). 기본 꺼짐.
 *   왜 꺼 두나: .agent/SUBSCRIPTION-STATUS.md 9/8 결론 — 유료 티어는 «잠기는 지표가 하나도 없다»(광고 제거뿐)라서
 *   유사투자자문 논점이 없다. «단, 유료가 "더 주기" 시작하면 판이 바뀐다.» 대표 결정 전까지 정보 차등을 운영에 내보내지 않는다.
 *   꺼짐(false): 무료·PRO 모두 행당 칩 2개(PRO 와 같은 화면) · 잠긴 칩 없음 · PRO 혜택 문구에 칩 줄 없음(내 종목 무제한 · 광고 없음).
 *   켜짐(true) : 무료 1개 + 잠긴 두 번째 칩(실제로 있을 때만) · PRO 2개 · 혜택 문구에 «모든 인사이트 칩».
 * 켜는 법: 아래 한 줄을 true 로 바꿔 커밋한다(환경변수가 아니다 — 빌드·프리뷰마다 달라지지 않게, 켠 기록이 코드에 남게).
 *   tests/watchlistInsights.test.ts 의 «기본값은 꺼짐» 시험이 실수로 켜지는 것을 막는다 — 켤 때 그 기대값도 같은 커밋에서 바꾼다.
 */
export const WATCHLIST_CHIP_TIERING: boolean = false;

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
