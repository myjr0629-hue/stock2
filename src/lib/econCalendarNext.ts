/**
 * 경제 캘린더 «다음 이벤트» 고르기 — 순수 함수.
 *
 * ★2026-11-06 23:16 KST 대표 캡처: «다음 이벤트: NOW Participation Rate (Oct)» — 22:30 KST(08:30 ET)에 이미 나온 지표가 46분 뒤에도 «다음»으로 보였다.
 *   원인: 목록은 실제치를 보여 주려고 «최근 1시간» 발표분을 남기는데, 칩이 그 목록의 첫 행을 그대로 썼다.
 *   → 칩은 «발표 시각 ≥ 지금» 인 첫 이벤트. 발표 직후 NOW_WINDOW_MS(5분) 안에서만 그 이벤트를 «NOW» 로 남긴다. 목록(최근 1시간)은 그대로.
 */
export const NOW_WINDOW_MS = 5 * 60_000;

export function pickNextEconEvent<T extends { dateObj: Date }>(sortedEvents: readonly T[], nowMs: number): T | undefined {
    return sortedEvents.find((e) => e.dateObj.getTime() >= nowMs - NOW_WINDOW_MS);
}
