// ═══════════════════════════════════════════════════════════════════════
// UnifiedPriceService — Single Source of Truth for ALL price/changePct
// ═══════════════════════════════════════════════════════════════════════
// [STATUS] 구축 완료, 리팩토링 미적용 — 기존 코드에 영향 없음
//
// [PURPOSE]
// 모든 페이지(Watchlist, Command, Flow, Dashboard, Related)에서 사용 가능한
// 단일 가격 계산 서비스. PRE/REG/POST/CLOSED 모든 세션에서 정확한 값을 보장.
//
// [USAGE MODES]
// Mode A: "full" — 본장가격+등락률 + PRE/POST 가격+등락률 전부 (Command, Flow)
// Mode B: "session" — 현재 세션에 맞는 가격+등락률만 (Related, 간단 표시용)
// Mode C: "watchlist" — 본장가격+등락률(메인) + PRE/POST 등락률(서브) (Watchlist)
//
// [DATA SOURCES]
// 1. Polygon Snapshot (snap.lastTrade.p, snap.day, snap.prevDay)
// 2. Daily Aggregates (dailyCloses[] — day.c=0 보험용)
// 3. WebSocket Price (wsPrice — 실시간 오버라이드)
// ═══════════════════════════════════════════════════════════════════════

export type MarketSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';

// ── INPUT: 원본 데이터 (API/WS에서 가져온 raw values) ──
export interface UnifiedPriceInput {
    /** 현재 마켓 세션 */
    session: MarketSession;

    /** Polygon snapshot lastTrade.p (실시간 체결가) */
    lastTradePrice: number;

    /** Polygon snapshot day.c (오늘 정규장 종가, PRE에서는 0) */
    dayClose: number;

    /** Polygon snapshot prevDay.c (어제 정규장 종가) */
    prevDayClose: number;

    /** Daily aggregate closes — desc order [newest, ..., oldest]
     *  day.c=0일 때 본장 등락률 계산용
     *  최소 2개 필요: [어제종가, 2거래일전종가] */
    dailyCloses?: number[];

    /** Polygon snapshot day.vw (VWAP) */
    vwap?: number | null;

    /** Polygon snapshot day.v (거래량) */
    volume?: number;

    /** 오늘 정규장 종가 (POST/CLOSED에서 사용) */
    regularCloseToday?: number | null;

    /** WebSocket 실시간 가격 (있으면 lastTradePrice보다 우선) */
    wsPrice?: number | null;

    /** Pre-market 가격 (snapshot.preMarket 또는 OC.preMarket) */
    preMarketPrice?: number | null;

    /** After-hours 가격 (snapshot.afterHours) */
    afterHoursPrice?: number | null;
}

// ── OUTPUT: 계산된 결과 (어떤 페이지든 필요한 필드를 pick) ──
export interface UnifiedPriceResult {
    // === 본장 (Regular Session) ===
    /** 본장 표시 가격 — REG: 실시간, PRE/POST/CLOSED: 마지막 정규 종가 */
    regularPrice: number;
    /** 본장 등락률 — 항상 (금일 정규종가 - 전일 정규종가) / 전일 정규종가 */
    regularChangePct: number;
    /** 기준선 (전일 종가) */
    prevClose: number;

    // === 현재 세션 (Active) ===
    /** 현재 세션의 실시간 가격 — PRE/POST에서는 extended 가격 */
    activePrice: number;
    /** 현재 세션의 등락률 — prevClose 대비 */
    activeChangePct: number;

    // === Extended (PRE/POST) ===
    /** PRE 가격 (PRE 세션에서만 유효) */
    prePrice: number | null;
    /** PRE 등락률: (prePrice - prevClose) / prevClose */
    preChangePct: number | null;
    /** POST 가격 (POST/CLOSED 세션에서만 유효) */
    postPrice: number | null;
    /** POST 등락률: (postPrice - regularCloseToday) / regularCloseToday */
    postChangePct: number | null;

    // === 세션 라벨 ===
    session: MarketSession;
    extLabel: 'PRE' | 'POST' | null;

    // === 메타 ===
    vwap: number | null;
    volume: number;
}

// ═══════════════════════════════════════════════════════════════
// CORE FUNCTION — 순수 함수, side effect 없음
// ═══════════════════════════════════════════════════════════════
export function calcUnifiedPrice(input: UnifiedPriceInput): UnifiedPriceResult {
    const {
        session,
        lastTradePrice,
        dayClose,
        prevDayClose,
        dailyCloses,
        vwap = null,
        volume = 0,
        regularCloseToday = null,
        wsPrice = null,
        preMarketPrice = null,
        afterHoursPrice = null,
    } = input;

    // ── 1. 기준선 (prevClose) ──
    // daily aggs가 있으면 가장 최근 종가 사용 (snapshot보다 정확)
    const prevClose = (dailyCloses && dailyCloses.length >= 1)
        ? dailyCloses[0]  // desc order: [0] = 가장 최근 (어제)
        : prevDayClose;

    // ── 2. 본장 가격 (regularPrice) ──
    let regularPrice: number;

    switch (session) {
        case 'REG':
            // 정규장: WS > lastTrade > dayClose > prevClose
            regularPrice = (wsPrice && wsPrice > 0 ? wsPrice : 0)
                || lastTradePrice
                || dayClose
                || prevClose;
            break;

        case 'PRE':
            // PRE: 본장 가격 = 전일 종가 (아직 오늘 장이 안 열림)
            // dayClose가 0이 아니면 (전날 종가가 들어있을 수 있음) 그걸 사용
            regularPrice = dayClose > 0 ? dayClose : prevClose;
            break;

        case 'POST':
        case 'CLOSED':
            // POST/CLOSED: 오늘 정규장 종가 > dayClose > prevClose
            regularPrice = (regularCloseToday && regularCloseToday > 0 ? regularCloseToday : 0)
                || (dayClose > 0 ? dayClose : 0)
                || prevClose;
            break;
    }

    // ── 3. 본장 등락률 (regularChangePct) ──
    let regularChangePct = 0;

    switch (session) {
        case 'REG':
            // 정규장: (현재가 - 전일종가) / 전일종가
            if (regularPrice > 0 && prevClose > 0) {
                regularChangePct = ((regularPrice - prevClose) / prevClose) * 100;
            }
            break;

        case 'PRE':
            // PRE: day.c가 있으면 (dayClose - prevDayClose) / prevDayClose
            //      day.c=0이면 daily aggs에서 계산
            if (dayClose > 0 && prevDayClose > 0) {
                regularChangePct = ((dayClose - prevDayClose) / prevDayClose) * 100;
            } else if (dailyCloses && dailyCloses.length >= 2) {
                // dailyCloses[0] = 어제, dailyCloses[1] = 2거래일 전
                const prev1 = dailyCloses[0];
                const prev2 = dailyCloses[1];
                if (prev2 > 0) {
                    regularChangePct = ((prev1 - prev2) / prev2) * 100;
                }
            }
            break;

        case 'POST':
        case 'CLOSED':
            // POST/CLOSED: (오늘 정규종가 - 전일종가) / 전일종가
            if (regularPrice > 0 && prevClose > 0 && Math.abs(regularPrice - prevClose) > 0.001) {
                regularChangePct = ((regularPrice - prevClose) / prevClose) * 100;
            } else if (dailyCloses && dailyCloses.length >= 2) {
                // 오늘/어제 값이 같으면 (날짜 전환) daily aggs 사용
                const prev1 = dailyCloses[0];
                const prev2 = dailyCloses[1];
                if (prev2 > 0) {
                    regularChangePct = ((prev1 - prev2) / prev2) * 100;
                }
            }
            break;
    }

    // ── 4. Extended 가격/등락률 ──
    let prePrice: number | null = null;
    let preChangePct: number | null = null;
    let postPrice: number | null = null;
    let postChangePct: number | null = null;
    let extLabel: 'PRE' | 'POST' | null = null;

    if (session === 'PRE') {
        // PRE: 현재 체결가가 PRE 가격
        const currentPrePrice = (wsPrice && wsPrice > 0 ? wsPrice : 0)
            || preMarketPrice
            || lastTradePrice;
        if (currentPrePrice > 0) {
            prePrice = currentPrePrice;
            preChangePct = prevClose > 0
                ? ((currentPrePrice - prevClose) / prevClose) * 100
                : 0;
            extLabel = 'PRE';
        }
    } else if (session === 'REG') {
        // REG: PRE는 이미 끝남 → preMarketPrice가 있으면 표시 (PRE CLOSE)
        if (preMarketPrice && preMarketPrice > 0) {
            prePrice = preMarketPrice;
            preChangePct = prevClose > 0
                ? ((preMarketPrice - prevClose) / prevClose) * 100
                : 0;
        }
    } else if (session === 'POST') {
        // POST: 현재 체결가가 POST 가격
        const currentPostPrice = (wsPrice && wsPrice > 0 ? wsPrice : 0)
            || afterHoursPrice
            || lastTradePrice;
        if (currentPostPrice > 0 && regularPrice > 0) {
            postPrice = currentPostPrice;
            postChangePct = ((currentPostPrice - regularPrice) / regularPrice) * 100;
            extLabel = 'POST';
        }
    } else if (session === 'CLOSED') {
        // CLOSED: afterHours 데이터가 있으면 표시
        if (afterHoursPrice && afterHoursPrice > 0 && regularPrice > 0) {
            postPrice = afterHoursPrice;
            postChangePct = ((afterHoursPrice - regularPrice) / regularPrice) * 100;
            extLabel = 'POST';
        }
    }

    // ── 5. Active (현재 세션 가격/등락률) ──
    let activePrice: number;
    let activeChangePct: number;

    switch (session) {
        case 'PRE':
            activePrice = prePrice || regularPrice;
            activeChangePct = preChangePct ?? regularChangePct;
            break;
        case 'REG':
            activePrice = regularPrice;
            activeChangePct = regularChangePct;
            break;
        case 'POST':
            activePrice = postPrice || regularPrice;
            activeChangePct = postPrice
                ? (prevClose > 0 ? ((activePrice - prevClose) / prevClose) * 100 : 0)
                : regularChangePct;
            break;
        case 'CLOSED':
        default:
            activePrice = regularPrice;
            activeChangePct = regularChangePct;
            break;
    }

    return {
        regularPrice,
        regularChangePct: round2(regularChangePct),
        prevClose,
        activePrice,
        activeChangePct: round2(activeChangePct),
        prePrice,
        preChangePct: preChangePct !== null ? round2(preChangePct) : null,
        postPrice,
        postChangePct: postChangePct !== null ? round2(postChangePct) : null,
        session,
        extLabel,
        vwap: vwap || null,
        volume,
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE WRAPPERS — 페이지별 사용 모드
// ═══════════════════════════════════════════════════════════════

/** Mode A: 풀 데이터 (Command/Flow — 본장+PRE/POST 전부 필요) */
export function getFullPriceDisplay(input: UnifiedPriceInput) {
    return calcUnifiedPrice(input);
}

/** Mode B: 현재 세션 등락률만 (Related — 단순 change% 표시) */
export function getSessionChange(input: UnifiedPriceInput): { price: number; changePct: number } {
    const r = calcUnifiedPrice(input);
    return { price: r.activePrice, changePct: r.activeChangePct };
}

/** Mode C: 워치리스트용 (본장 메인 + extended 서브) */
export function getWatchlistPrice(input: UnifiedPriceInput): {
    displayPrice: number;
    changePct: number;
    extPrice: number | null;
    extChangePct: number | null;
    extLabel: 'PRE' | 'POST' | null;
} {
    const r = calcUnifiedPrice(input);
    return {
        displayPrice: r.regularPrice,
        changePct: r.regularChangePct,
        extPrice: r.prePrice || r.postPrice,
        extChangePct: r.preChangePct ?? r.postChangePct,
        extLabel: r.extLabel,
    };
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT HELPER — Polygon snapshot 객체에서 input 생성
// ═══════════════════════════════════════════════════════════════
export function fromPolygonSnapshot(
    tickerData: any,
    session: MarketSession,
    dailyCloses?: number[]
): UnifiedPriceInput {
    return {
        session,
        lastTradePrice: tickerData?.lastTrade?.p || tickerData?.min?.c || 0,
        dayClose: tickerData?.day?.c || 0,
        prevDayClose: tickerData?.prevDay?.c || 0,
        dailyCloses,
        vwap: tickerData?.day?.vw || null,
        volume: tickerData?.day?.v || 0,
        preMarketPrice: tickerData?.preMarket?.p || null,
        afterHoursPrice: tickerData?.afterHours?.p || null,
    };
}
