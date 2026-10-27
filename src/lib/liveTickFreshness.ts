/**
 * 정규장 가격 웹소켓(허브) 값의 «신선도» 판정 — 종목 화면 머리말·연관 종목(웹·모바일 웹·앱 셸) 공용 순수 함수. 시계는 인자로만, I/O 0.
 *
 * [T31c — 10/27 22:38 KST 정규장 실측]
 *   허브(wss://ws.signumhq.com ← EC2 price-ws ← Intrinio EQUITIES_EDGE)는 우리 구독에서 약 15분 늦다:
 *     GOOGL 허브 22:38:56 315.70 = 야후 1분봉 13:23 UTC(장전) · 22:47 317.69~318.13 = 13:31~13:32 · 직접 API 22:35:53 체결 318.64 = 야후 13:35
 *     (10/28 05:08 KST 애프터에도 허브 322.26 = 야후 19:53 UTC — 15분)
 *   운영 허브 방송에는 체결 시각(ts)이 없다({type,ticker,price,changePct,volume}) — 체결 시각 비교를 할 수 없었다.
 *   그런데 화면은 «정규장이면 허브 값 우선»이라, 직접 API·unified 가 들고 온 최신 체결을 15분 전 값이 덮었다.
 *
 * [규칙 — 정규장에서만 판단한다. 정규장 밖은 호출자의 기존 규칙 그대로(true)]
 *   허브 값의 원천 시각 = 체결 시각(ts)이 오면 그것, 없으면 «받은 시각 − 15분»(우리 구독 지연 — 늦게 받은 값을 새 값으로 치지 않는다).
 *   비교 대상(직접 API·unified 연관 행의 asOf, /api/live/quotes 의 priceTime)이 «오늘 정규장 개장 뒤 체결»일 때만 비교하고,
 *   그보다 오래된 허브 값은 쓰지 않는다(최신 관측 우선). 비교 대상 시각이 없거나 오늘 정규장 것이 아니면 기존 동작(허브 우선).
 *   허브 원천 시각이 오늘 개장 전이면(개장 직후 15분 — 지연 피드의 장전 체결) 정규장 가격으로 쓰지 않는다.
 */
import { cashSessionPhaseAt, etDateOf, etMinutesOf } from './marketCalendar';
import { relatedSourceTimeMs } from './relatedRowMerge';

/** 우리 구독의 허브 지연(10/27 정규장·10/28 애프터 야후 1분봉 대조 실측) */
export const HUB_FEED_DELAY_MS = 15 * 60_000;

export interface LiveTickLike {
    price?: number;
    changePct?: number;
    /** 허브가 보낸 체결 시각(ms) — 0·없음 = 모름 */
    priceTime?: number;
    /** 브라우저가 받은 시각(ms) */
    receivedAt?: number;
}

/** 허브 값의 원천 시각(ms) — 체결 시각이 있으면 그것, 없으면 받은 시각 − 15분. 둘 다 없으면 null */
export function wsTickSourceMs(tick: LiveTickLike | null | undefined): number | null {
    if (!tick) return null;
    const trade = relatedSourceTimeMs(tick.priceTime);
    if (trade != null) return trade;
    const rx = Number(tick.receivedAt);
    return Number.isFinite(rx) && rx > 0 ? rx - HUB_FEED_DELAY_MS : null;
}

/**
 * 정규장 중 이 허브 값을 화면에 써도 되는가.
 *   · 정규장이 아니면 true(호출자 기존 규칙 — 장외·장전 동작 불변)
 *   · 허브 원천 시각이 오늘 개장(09:30 ET) 전이면 false(장전 체결)
 *   · 비교 관측(otherTimeMs)이 오늘 정규장 개장 뒤 체결이 아니면 true(비교할 최신 관측 없음 → 기존 동작)
 *   · 허브 원천 시각을 모르면 false(시각 모르는 값으로 오늘 관측을 덮지 않는다)
 *   · 허브 원천 시각 ≥ 관측 시각이면 true, 아니면 false
 */
export function regularWsUsable(tick: LiveTickLike | null | undefined, otherTimeMs: unknown, nowMs: number): boolean {
    if (!tick || !(Number(tick.price) > 0)) return false;
    if (cashSessionPhaseAt(nowMs) !== 'regular') return true;
    const today = etDateOf(nowMs);
    const afterOpen = (ms: number) => etDateOf(ms) === today && etMinutesOf(ms) >= 570;
    const ws = wsTickSourceMs(tick);
    // 개장 직후 15분은 허브가 아직 장전 체결을 흘린다(10/27 22:38 KST GOOGL 315.70 = 13:23 UTC 장전) — 정규장 가격으로 쓰지 않는다
    if (ws != null && !afterOpen(ws)) return false;
    // 오늘 정규장 개장(09:30 ET) 뒤 체결만 비교 대상 — 지난 세션·장전 시각은 «최신 관측»이 아니다
    const other = relatedSourceTimeMs(otherTimeMs);
    if (other == null || !afterOpen(other)) return true;
    if (ws == null) return false;
    return ws >= other;
}

/** 연관 종목 행 — 허브 값이 그 행(직접 API·unified)의 원천 시각보다 오래됐으면 undefined(행 값 그대로 표시) */
export function relatedWsTick<T extends LiveTickLike>(tick: T | null | undefined, row: object | null | undefined, nowMs: number): T | undefined {
    if (!tick) return undefined;
    return regularWsUsable(tick, (row as { asOf?: unknown } | null | undefined)?.asOf, nowMs) ? tick : undefined;
}

/**
 * 머리말 — useLivePrice 가 /api/live/quotes 값(source 'rest', 그 체결 시각 priceTime)을 골랐는데 허브 값이 그보다 오래됐으면 undefined.
 *   useLivePrice 가 허브 값을 골랐거나(source 'ws') 폴링 값이 없으면 허브 값 그대로(기존 동작).
 */
export function liveWsTick<T extends LiveTickLike>(
    tick: T | null | undefined,
    live: { price?: number; source?: string | null; priceTime?: number | null } | null | undefined,
    nowMs: number,
): T | undefined {
    if (!tick) return undefined;
    if (!live || !(Number(live.price) > 0) || live.source !== 'rest') return tick;
    return regularWsUsable(tick, live.priceTime, nowMs) ? tick : undefined;
}

/**
 * 종목 화면 세션 표식 — 정규장(달력: 휴장·조기 폐장 포함)이면 'REG'. 그 밖엔 화면이 쓰던 값 그대로(장외·장전 동작 불변).
 *   모바일 웹 /ticker 는 SSR 세션(장전 'PRE')을 끝까지 들고 있어, 장전에 연 화면이 정규장에도 «PRE» 배지·전일 종가 머리말로 남았다(T31c).
 */
export function screenSessionOf(
    status: { isHoliday?: boolean; market?: string } | null | undefined,
    fallback: string | null | undefined,
    nowMs: number,
): string {
    if (status?.isHoliday || status?.market === 'closed') return 'CLOSED';
    if (cashSessionPhaseAt(nowMs) === 'regular') return 'REG';
    return (fallback || 'CLOSED').toUpperCase();
}
