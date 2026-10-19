/** 표시용 시장 지표. RLSI 자체는 높을수록 우호적이므로 리스크는 역방향이다.
 * 시장 하방 위험의 상대 점수이며 손실 확률(%)이 아니다. 결측을 0/50으로 바꾸지 않는다.
 */
export function marketDownsideRisk(input: unknown): number | null {
    if (input && typeof input === 'object' && (input as { available?: boolean }).available === false) return null;
    const rlsi = input && typeof input === 'object' ? (input as { score?: unknown }).score : input;
    return typeof rlsi === 'number' && Number.isFinite(rlsi) && rlsi >= 0 && rlsi <= 100 ? Math.round(100 - rlsi) : null;
}
/** CNN 우선, 없으면 Guardian의 기존 VIX 12~35 선형 근사 한 벌. */
export function fearGreedScore(cnn: unknown, vix: unknown): number | null {
    if (typeof cnn === 'number' && Number.isFinite(cnn) && cnn >= 0 && cnn <= 100) return cnn;
    if (typeof vix !== 'number' || !Number.isFinite(vix) || vix <= 0) return null;
    return Math.round(Math.max(0, Math.min(100, 100 - (vix - 12) / 23 * 100)));
}
