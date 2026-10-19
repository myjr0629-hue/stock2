/**
 * 프리·애프터에 가격 허브 틱을 «시간외 값»으로 쓸지 — 순수 함수(시험: tests/extWsTrust.test.ts).
 *
 * 사고(10/13 04:32 ET, 운영 Flow JPM·실적일): 화면 PRE 칸 $334.81 — 어젯밤 애프터 마지막 체결. 같은 순간 서버 시세(/api/live/quotes) PRE 338.18(확인된 오늘 프리 체결),
 *   나스닥 통합 마지막 체결 337~338. 허브는 EDGX 에 프리 체결이 드문 종목에서 아무 틱도 못 받아 어제 값을 들고 있고(메시지에 체결 시각이 없다),
 *   화면은 «서버가 오늘 프리 체결을 확인했다»는 조건만 보고 그 값 자리에 허브 값을 얹었다 — 허브 값이 서버 기준 2% 안이면 통과(1.0% 차이가 통과).
 * 시간외엔 허브도 서버 시세와 같은 15분 지연 체결이다(10/12 실측: 수신−체결 ≈ 900초) — 허브가 «더 새로운» 값을 줄 근거가 없다.
 *   그래서 시간외 값은 서버 값을 기준으로, 허브 값은 «서버 값과 0.25% 안에서 일치할 때만» 부드럽게 갱신하는 데 쓴다. 어긋나면 서버 값.
 * 정규장은 그대로(허브가 실시간 · 2% 가드).
 */
export const EXT_WS_MAX_DEVIATION = 0.0025;

export function extWsTrusted(wsPrice: number | null | undefined, serverExt: number | null | undefined): boolean {
    const w = Number(wsPrice), s = Number(serverExt);
    if (!(w > 0) || !(s > 0)) return false;
    return Math.abs(w - s) / s <= EXT_WS_MAX_DEVIATION;
}

/** 서버 시간외 체결 시각(ISO·epoch ms) → ms, 모르면 NaN */
function timeMs(v: string | number | null | undefined): number {
    const t = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
    return Number.isFinite(t) && t > 0 ? t : NaN;
}

/**
 * 시간외 칸에 그릴 값 — 서버가 시간외 체결을 확인했을 때만(serverExt > 0). 허브가 서버와 0.25% 안이면 허브 값, 아니면 서버 값.
 * ★ [2026-10-19] timing 을 주면 체결 시각으로 순서를 정한다: 서버 체결 시각을 아는데 허브 틱이 그보다 오래됐거나(금요일 99.8 vs 월 PRE 100)
 *   틱 시각이 없으면 서버 값 — 0.25% 안이어도 옛 틱은 «지금» 값이 아니다(같은 가격 = 실제 0% 를 옛 틱이 덮던 것).
 */
export function pickExtPrice(wsPrice: number | null | undefined, serverExt: number | null | undefined,
    timing?: { wsTimeMs?: number | null; serverTime?: string | number | null }): { price: number; fromWs: boolean } {
    const s = Number(serverExt);
    if (!(s > 0)) return { price: 0, fromWs: false };
    const serverMs = timeMs(timing?.serverTime);
    if (Number.isFinite(serverMs)) {
        const wsMs = timeMs(timing?.wsTimeMs);
        if (!Number.isFinite(wsMs) || wsMs < serverMs) return { price: s, fromWs: false };
    }
    return extWsTrusted(wsPrice, s) ? { price: Number(wsPrice), fromWs: true } : { price: s, fromWs: false };
}
