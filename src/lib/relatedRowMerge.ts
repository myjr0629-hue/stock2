/**
 * [T12 · 감사 10/23 M9] 웹 종목 화면 연관 종목 — unified 응답의 행을 이미 가진 행(직접 /api/live/related 등) 위에 합치는 규칙 한 곳.
 *   (LiveTickerDashboard 가 쓴다 — 순수 함수, 서버·시험 공용)
 *
 * [관문 10250504] ② 03:59:59 ET 에 끝난 세션 값으로 만든 unified 응답이 04:00 뒤 직접 API(새 분모)보다 늦게 도착하면, 예전 규칙
 *   («prevClose: 새 행 || 옛 행»)이 새 분모를 옛 분모로 덮어 WebSocket 등락 부호가 뒤집혔다(+0.56% → −0.68%).
 *   ③ 서버가 공식 종가로 확인한 보합(정확히 0%)을 예전 규칙이 «결측»으로 보고 옛 등락률(+0.56%)을 남겼다.
 *
 * [규칙] ① 두 행 모두 계산 시각(asOf, 서버 ms)이 있거나 옛 행만 있으면 «더 늦게 계산된 행»의 값·분모를 쓴다(늦게 도착한 옛 응답이 못 덮는다).
 *        ② 서버가 공식 종가로 맞춘 행(closeSession)은 0% 도 진짜 보합 — 그대로 쓴다.
 *        ③ 그 밖엔 예전 규칙 그대로(새 행 가격·등락 0 이면 옛 실시간 값 유지, 분모는 새 행 || 옛 행).
 *   ⛔ 화면 라벨·문구·배치 불변 — 어떤 값을 고르는지만.
 */
export interface RelatedRowLike {
    ticker: string;
    price: number;
    change: number;
    prevClose?: number;
    asOf?: number | null;
    session?: string | null;
    closeSession?: string | null;
    [k: string]: unknown;
}

const at = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function mergeRelatedRow<T extends RelatedRowLike>(oldItem: T | null | undefined, newItem: T): T {
    const hasLiveOldData = !!oldItem && (oldItem.price > 0 || Math.abs(oldItem.change) > 0);
    const oldAt = at(oldItem?.asOf), newAt = at(newItem?.asOf);
    if (hasLiveOldData && oldAt != null && (newAt == null || newAt < oldAt)) {
        return { ...newItem, price: oldItem!.price, change: oldItem!.change, prevClose: oldItem!.prevClose, asOf: oldAt,
            session: oldItem!.session ?? null, closeSession: oldItem!.closeSession ?? null };
    }
    if (newItem?.closeSession) return { ...newItem, prevClose: newItem.prevClose || oldItem?.prevClose };
    return {
        ...newItem,
        price: (hasLiveOldData && newItem.price === 0) ? oldItem!.price : newItem.price,
        change: (hasLiveOldData && newItem.change === 0) ? oldItem!.change : newItem.change,
        prevClose: newItem.prevClose || oldItem?.prevClose,
    };
}
