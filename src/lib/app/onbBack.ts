// ============================================================================
// ★11/22 첫 실행 안내(법적 고지·가치·알림)가 떠 있을 때 안드 «뒤로 가기»(하드웨어 버튼·가장자리 스와이프 제스처)
// ----------------------------------------------------------------------------
// 예전: NativeAppProvider 의 backButton 처리기가 첫 실행 화면 위에서도 «되돌아갈 곳 없음 → App.minimizeApp()»을 했다.
//   첫 실행 화면은 모달처럼 보여 «닫으려고» 뒤로 가기를 누르거나, 글을 굴리다 가장자리 스와이프가 뒤로 가기로 잡히면
//   앱이 그대로 홈으로 사라졌다(화면을 만진 적 없이 «앱 떠남»). iOS 에는 이 길이 없다 — ET 11/19~22 법적 고지
//   안드 노출 43 · 만짐 12 · 앱 떠남 15 · 마침 8(19%) vs iOS 12 · 만짐 9 · 떠남 0 · 마침 11(92%).
// 이제: 첫 실행 화면이 떠 있으면 첫 뒤로 가기는 앱을 닫지 않고 화면에 알린다(법적 고지면 동의 체크 줄을 굴려 깜빡임 —
//   회색 [계속]과 같은 강조). ONB_BACK_EXIT_MS 안에 한 번 더 누르면 예전처럼 앱을 내린다(나가려는 사람은 막지 않는다).
//   글·라벨·배치는 그대로다(새 문구 없음).
// ============================================================================

/** 첫 실행 화면에 «뒤로 가기가 눌렸다»를 알리는 문서 이벤트 이름 */
export const ONB_BACK_EVENT = 'app:onboarding-back';

/** 첫 뒤로 가기 뒤 이 시간 안에 한 번 더 누르면 앱을 내린다(ms) */
export const ONB_BACK_EXIT_MS = 2000;

/** 첫 실행 화면이 떠 있다는 표식(AppFirstRunOnboarding 이 <html> 에 켜고 끈다) */
export const ONB_OPEN_CLASS = 'app-onboarding-open';

export type OnbBackAction = 'normal' | 'nudge' | 'exit';

/**
 * 뒤로 가기 한 번의 처리.
 * onboardingOpen = 첫 실행 화면이 떠 있나 · now = 지금(ms) · lastNudgeAt = 직전에 «화면에 알린» 시각(없으면 0)
 * - 화면이 없으면 'normal'(예전 동작: history.back 또는 앱 내리기)
 * - 화면이 있고 직전 알림이 ONB_BACK_EXIT_MS 안이면 'exit'(앱 내리기)
 * - 그 밖에는 'nudge'(앱을 닫지 않고 화면에 알린다)
 */
export function onbBackAction(onboardingOpen: boolean, now: number, lastNudgeAt: number): OnbBackAction {
  if (!onboardingOpen) return 'normal';
  if (lastNudgeAt > 0 && now >= lastNudgeAt && now - lastNudgeAt <= ONB_BACK_EXIT_MS) return 'exit';
  return 'nudge';
}

/** 지금 첫 실행 화면이 떠 있나(<html> 표식) — 문서가 없거나 오류면 false(예전 동작) */
export function onboardingOpenNow(): boolean {
  try {
    return typeof document !== 'undefined' && !!document.documentElement?.classList.contains(ONB_OPEN_CLASS);
  } catch {
    return false;
  }
}

/**
 * 첫 실행 화면에 뒤로 가기를 알린다 — 화면이 실제로 떠 있어 받아 처리했으면(preventDefault) true.
 * 받은 곳이 없으면(약관·개인정보 문서 경로처럼 표식만 남은 화면) false → 호출부는 예전 동작(history.back / 앱 내리기)을 한다.
 */
export function dispatchOnbBack(): boolean {
  try {
    if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') return false;
    return !document.dispatchEvent(new CustomEvent(ONB_BACK_EVENT, { cancelable: true }));
  } catch {
    return false;
  }
}
