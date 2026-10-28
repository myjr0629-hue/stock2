/** 기존 Tactical 문장 생성·검사의 보합 경계. 반올림 방식과 경계 포함을 그대로 공유한다. */
export const TACTICAL_FUTURES_FLAT_PCT = 0.1;
export function tacticalFuturesDirection(pct: number): number {
    return Math.abs(Math.round(pct * 10) / 10) <= TACTICAL_FUTURES_FLAT_PCT ? 0 : Math.sign(pct);
}
