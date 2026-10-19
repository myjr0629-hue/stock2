/**
 * 프리·애프터에 가격 허브 틱을 «시간외 값»으로 쓸지 — 순수 함수(시험: tests/extWsTrust.test.ts).
 *
 * 사고(10/13 04:32 ET, 운영 Flow JPM·실적일): 화면 PRE 칸 $334.81 — 어젯밤 애프터 마지막 체결. 같은 순간 서버 시세(/api/live/quotes) PRE 338.18(확인된 오늘 프리 체결),
 *   나스닥 통합 마지막 체결 337~338. 허브는 EDGX 에 프리 체결이 드문 종목에서 아무 틱도 못 받아 어제 값을 들고 있고(메시지에 체결 시각이 없다),
 *   화면은 «서버가 오늘 프리 체결을 확인했다»는 조건만 보고 그 값 자리에 허브 값을 얹었다 — 허브 값이 서버 기준 2% 안이면 통과(1.0% 차이가 통과).
 * 시간외엔 허브도 서버 시세와 같은 15분 지연 체결이다(10/12 실측: 수신−체결 ≈ 900초) — 허브가 «더 새로운» 값을 줄 근거가 없다.
 *   그래서 시간외 값은 서버 값을 기준으로, 허브 값은 체결 시각이 서버 체결 시각보다 늦을 때만 갱신한다(가격 근접성은 보지 않는다 — 2026-10-19 가격 채택 통합).
 *   서버 시각이 없고 가격이 다르면 서버 값. extWsTrusted(0.25%)는 남은 표시 보조용이며 채택 판단에 쓰지 않는다.
 */
import { pickExtObservation } from '@/lib/priceAcceptance';
export const EXT_WS_MAX_DEVIATION = 0.0025;

export function extWsTrusted(wsPrice: number | null | undefined, serverExt: number | null | undefined): boolean {
    const w = Number(wsPrice), s = Number(serverExt);
    if (!(w > 0) || !(s > 0)) return false;
    return Math.abs(w - s) / s <= EXT_WS_MAX_DEVIATION;
}

/**
 * 시간외 칸에 그릴 값 — 규칙은 src/lib/priceAcceptance.ts pickExtObservation 하나.
 *   서버가 시간외 체결을 확인했을 때만(serverExt > 0). 허브 틱은 «서버 체결 시각 이후의 체결»일 때만 쓴다(가격 차이와 무관).
 *   서버 시각을 모르면 같은 값일 때만 허브(같은 관측) — 0.25% 근접성은 최신의 증거가 아니다(금요일 99.8 이 월 PRE 100 의 실제 0% 를 덮었다).
 */
export function pickExtPrice(wsPrice: number | null | undefined, serverExt: number | null | undefined,
    timing?: { wsTimeMs?: number | null; serverTime?: string | number | null; wsReceivedAt?: number | null; nowMs?: number }): { price: number; fromWs: boolean } {
    return pickExtObservation(wsPrice, serverExt, timing);
}
