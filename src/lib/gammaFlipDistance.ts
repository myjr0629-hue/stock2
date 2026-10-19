/**
 * 감마플립 거리(%): (현물 − 플립) / 현물 × 100. 양수는 플립 위, 음수는 아래.
 * 점수 경계 판정에는 반올림 전 값을 쓰고, 응답·화면의 기존 자리수는 호출자가 유지한다.
 * 유효한 양수 가격이 없으면 null(거리 0 = 실제 플립과 일치하는 경우와 구분).
 */
export function gammaFlipDistancePct(spot: number | null | undefined, flip: number | null | undefined): number | null {
    if (typeof spot !== 'number' || !Number.isFinite(spot) || spot <= 0
        || typeof flip !== 'number' || !Number.isFinite(flip) || flip <= 0) return null;
    return ((spot - flip) / spot) * 100;
}
