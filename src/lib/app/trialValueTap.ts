/**
 * 체험 중 가치 알림(/api/cron/trial-push · lib/push/trialValuePush, 2026-11-19) — 탭 목적지 (순수 · 서버·앱 둘 다 쓴다).
 * 서버가 준 경로는 믿지 않는다: 변형(v) 값으로 닫힌 목록의 앱 안 경로만 고른다.
 *   d3 = 내 종목(AI 한 줄) · d3b = 아침 AI 브리핑(내 종목이 없을 때) · d6 = 장 마감 리포트
 */
export type TrialValueVariant = 'd3' | 'd3b' | 'd6';
export const TRIAL_VALUE_TAP_PATHS: Record<TrialValueVariant, string> = {
  d3: '/app-view/watchlist',
  d3b: '/app-view/guardian?tab=overview&brief=1',
  d6: '/app-view/intel?tab=report',
};
/** 푸시 데이터 type 값 — app-view/layout.tsx 의 탭 처리와 같아야 한다 */
export const TRIAL_VALUE_PUSH_TYPE = 'trial_value';
export function trialValueTapPath(variant: unknown): string | null {
  return typeof variant === 'string' && Object.prototype.hasOwnProperty.call(TRIAL_VALUE_TAP_PATHS, variant) ? TRIAL_VALUE_TAP_PATHS[variant as TrialValueVariant] : null;
}
