/** 표시용 시장 지표(대표 10/19 ③ «리스크 점수는 라벨 의미에 맞는 점수»).
 * RLSI 는 높을수록 우호적(유동성·폭·변동성 구조·감마·안전자산 흐름 합성)이므로 «리스크» 라벨에는 역방향 100 − RLSI 를 쓴다.
 * 시장 하방 위험의 상대 점수이며 손실 확률(%)이 아니다. 결측을 0/50 으로 바꾸지 않는다(계산 실패 available:false → 결측).
 */
export function marketDownsideRisk(input: unknown): number | null {
    if (input && typeof input === 'object' && (input as { available?: boolean }).available === false) return null;
    const rlsi = input && typeof input === 'object' ? (input as { score?: unknown }).score : input;
    return typeof rlsi === 'number' && Number.isFinite(rlsi) && rlsi >= 0 && rlsi <= 100 ? Math.round(100 - rlsi) : null;
}
/** F&G 한 벌: CNN 우선, 없으면 Guardian(RLSI 심리)과 같은 VIX 12~35 선형 근사. 둘 다 없으면 결측(실제 CNN 0 은 관측값). */
export function fearGreedScore(cnn: unknown, vix: unknown): number | null {
    if (typeof cnn === 'number' && Number.isFinite(cnn) && cnn >= 0 && cnn <= 100) return cnn;
    if (typeof vix !== 'number' || !Number.isFinite(vix) || vix <= 0) return null;
    return Math.round(Math.max(0, Math.min(100, 100 - (vix - 12) / 23 * 100)));
}
