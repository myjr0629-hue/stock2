// src/utils/calcPriceDisplay.ts
// [UNIFIED] Single source of truth for price display calculations
// Used by: Command (LiveTickerDashboard), Flow, and future pages
// All session-aware price, changePct, and extended badge logic is here.

export interface PriceDisplayInput {
    /** 5s polling live price (from useLivePrice) */
    livePrice?: number | null;
    /** 5s polling live changePct */
    liveChangePct?: number | null;
    /** 5s polling extended price */
    liveExtPrice?: number | null;
    /** 5s polling extended change percent */
    liveExtChangePct?: number | null;
    /** 5s polling extended label ('PRE' or 'POST') */
    liveExtLabel?: string | null;
    /** Ticker API display.price (60s cached) */
    apiDisplayPrice?: number | null;
    /** Ticker API display.changePctPct */
    apiDisplayChangePct?: number | null;
    /** Effective trading session */
    session: string;
    /** Previous regular close (yesterday's close) */
    prevRegularClose?: number | null;
    /** Fallback prevClose */
    prevClose?: number | null;
    /** Today's regular session close */
    regularCloseToday?: number | null;
    /** Previous day's change percent (for weekends/holidays) */
    prevChangePct?: number | null;
    /** Initial/fallback change percent */
    fallbackChangePct?: number | null;
    /** Last trade price */
    lastTrade?: number | null;
    /** Extended session prices */
    extended?: {
        prePrice?: number | null;
        preClose?: number | null;
        postPrice?: number | null;
    } | null;
    /** Prices object from ticker API */
    prices?: {
        prePrice?: number | null;
        postPrice?: number | null;
    } | null;
}

export interface PriceDisplayResult {
    /** Main display price (big white number) */
    displayPrice: number;
    /** Main change percentage */
    displayChangePct: number;
    /** Extended session price (badge) */
    activeExtPrice: number;
    /** Extended session type: 'PRE' | 'PRE_CLOSE' | 'POST' | '' */
    activeExtType: string;
    /** Extended session label for UI */
    activeExtLabel: string;
    /** Extended session change percentage */
    activeExtPct: number;
    /**
     * ★ [2026-09-04] 시간외 등락률을 «실제로 계산했는가».
     *   기준선(prevClose)이 없으면 계산이 불가능한데, 그때도 0 이 남아
     *   화면에 «+0.00%» 가 진짜 값처럼 떴다(대표 지적: PRE CLOSE 가
     *   맞게 나오는 종목과 아닌 종목이 섞인다). false 면 화면은 «—» 를 그린다.
     */
    activeExtPctKnown: boolean;
}

/**
 * Pure function: calculates all display prices from raw data.
 * No side effects, no hooks, no API calls.
 * Identical logic to LiveTickerDashboard.tsx L757-862 (now single source of truth).
 */

/**
 * [FIX 2026-08-04 · 프로덕션 회귀 수정]
 * 종가 대비 등락률을 «안전하게» 계산한다.
 *
 * 배경 — 두 개의 서로 다른 결함이 겹쳐 있었다:
 *  ① 7/31 이전: `Math.abs(today - prev) > 0.001` 가드가 «진짜 보합(0.00%)»을 결측으로 오판해
 *     어제의 등락률을 오늘 화면에 그대로 남겼다(SOXL 7/31 실측: 7/30의 +24.71%가 표시).
 *  ② 8/3 그 가드를 걷어내자 **가려져 있던 데이터 오염**이 드러났다:
 *     `/api/live/ticker`가 **오늘 종가를 prevClose 자리에** 넣어 보낸다.
 *     실측 SNDK 8/4: prevClose 1288.03 == regularCloseToday 1288.03, 그런데 prevChangePct 6.03.
 *     → (1288.03-1288.03)/1288.03 = **0.00%** 가 전 종목에 표시됐다.
 *     (같은 순간 `/api/live/quotes`는 prevClose 1214.83으로 정상 — 두 엔드포인트가 어긋난다)
 *
 * 두 경우는 «구분 가능»하다. prevChangePct가 모순을 드러낸다:
 *   · 진짜 보합      → 계산값 ≈ 0 이고 prevChangePct 도 ≈ 0   → 0.00% 가 정답
 *   · prevClose 오염 → 계산값 = 0 인데 prevChangePct 는 6.03  → prevChangePct 가 정답
 * "어제 대비 6.03% 움직였다"면서 어제 종가가 오늘과 같을 수는 없다.
 *
 * ⚠️ 근본 원인은 서버(`/api/live/ticker`)다. 이건 클라이언트 방어선이며,
 *    서버가 고쳐져도 이 함수는 그대로 옳게 동작한다(계산값을 그냥 쓴다).
 */
export function safeChangePct(
    todayClose: number,
    prevClose: number,
    prevChangePct?: number | null,
): number {
    if (!(todayClose > 0) || !(prevClose > 0)) return prevChangePct ?? 0;
    const computed = ((todayClose - prevClose) / prevClose) * 100;
    const looksFlat = Math.abs(computed) < 0.005;
    const contradicts = prevChangePct != null && Math.abs(prevChangePct) >= 0.01;
    // 계산값이 0인데 «어제 대비 움직였다»는 값이 따로 있으면 prevClose 가 오염된 것이다.
    if (looksFlat && contradicts) return prevChangePct as number;
    return computed;
}

export function calcPriceDisplay(input: PriceDisplayInput): PriceDisplayResult {
    const {
        livePrice,
        liveChangePct,
        apiDisplayPrice,
        apiDisplayChangePct,
        session,
        prevRegularClose,
        prevClose: prevCloseFallback,
        regularCloseToday,
        prevChangePct,
        fallbackChangePct,
        lastTrade,
        extended,
        prices,
    } = input;

    // Normalize session to uppercase for comparison
    const s = (session || 'CLOSED').toUpperCase();

    // Resolve prevClose with fallback chain
    const resolvedPrevClose = prevRegularClose || prevCloseFallback || 0;

    // ===== A. Main Display Price =====
    let displayPrice = livePrice || apiDisplayPrice || resolvedPrevClose || 0;
    let displayChangePct = liveChangePct ?? apiDisplayChangePct ?? null;

    // [STRICT YAHOO FINANCE PRICING RULE]
    if (s === 'PRE' || s === 'PRE_CLOSE') {
        // PRE-market: Main price MUST be yesterday's regular close.
        if (resolvedPrevClose > 0) {
            displayPrice = resolvedPrevClose;
            displayChangePct = prevChangePct !== null && prevChangePct !== undefined ? prevChangePct : (fallbackChangePct ?? 0);
        }
    } else if (s === 'POST' || s === 'CLOSED') {
        // POST-market / CLOSED: Main price MUST be today's regular close.
        if (regularCloseToday && regularCloseToday > 0) {
            displayPrice = regularCloseToday;
            // [FIX 2026-07-31] `Math.abs(...) > 0.001` 조건을 제거했다.
            // 오늘 종가가 전일 종가와 «같다»는 것은 0.00% 보합이라는 **답**이지 결측이 아닌데,
            // 그 조건이 거짓이 되면서 else의 `prevChangePct` — 이름 그대로 **어제의 등락률** —
            // 로 떨어졌다. 실측: SOXL 7/30 114.72(+24.71%) → 7/31 114.72(0.00%)에서
            // **7/30의 +24.71%가 7/31 화면에 그대로 표시**됐다.
            // 두 값이 모두 유효하면 언제나 계산한다. 같으면 식이 0을 낸다.
            if (resolvedPrevClose > 0) {
                displayChangePct = safeChangePct(regularCloseToday, resolvedPrevClose, prevChangePct);
            } else {
                displayChangePct = prevChangePct ?? fallbackChangePct ?? 0;
            }
        } else if (resolvedPrevClose > 0 && displayPrice === 0) {
            // Fallback for weekend/holiday where regularCloseToday might be missing
            displayPrice = resolvedPrevClose;
            displayChangePct = prevChangePct ?? fallbackChangePct ?? 0;
        }
    }

    // Final fallback for displayChangePct
    if (displayChangePct === undefined || displayChangePct === null) {
        displayChangePct = fallbackChangePct || 0;
    }

    // REG fallback: if still no price, use lastTrade
    if ((!displayPrice || displayPrice === 0) && (s === 'REG' || s === 'RTH' || s === 'MARKET')) {
        displayPrice = lastTrade || displayPrice;
    }

    // [FIX V4] REG session: ALWAYS use (displayPrice - prevClose) / prevClose
    // Ignores ALL external changePct sources (WebSocket, SWR, Polygon) — they use inconsistent bases
    // This guarantees changePct always matches the displayPrice and prevClose shown to user
    if ((s === 'REG' || s === 'RTH' || s === 'MARKET') && displayPrice > 0 && resolvedPrevClose > 0) {
        displayChangePct = ((displayPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
    }

    // ===== B. Extended Session Badge =====
    let activeExtPrice = 0;
    let activeExtType = '';
    let activeExtLabel = '';
    let activeExtPct = 0;

    // [V5.5 FAST FETCH] Provide 0ms latency for POST/PRE badges by hijacking the liveExt polling data
    if (input.liveExtPrice && input.liveExtPrice > 0 && input.liveExtLabel) {
        activeExtPrice = input.liveExtPrice;
        activeExtPct = input.liveExtChangePct || 0;
        
        const baseType = input.liveExtLabel.includes('PRE') ? 'PRE' : input.liveExtLabel.includes('POST') ? 'POST' : input.liveExtLabel;
        
        // During REG session, PRE market has closed → show as 'PRE CLOSE'
        const isRegSession = s === 'REG' || s === 'RTH' || s === 'MARKET';
        if (baseType === 'PRE' && isRegSession) {
            activeExtLabel = 'PRE CLOSE';
            activeExtType = 'PRE_CLOSE';
        } else {
            activeExtLabel = input.liveExtLabel;
            activeExtType = baseType;
        }
    } else {
        // Fallback to heavy ticker API data if live polling hasn't spun up yet
        if (s === 'PRE') {
            activeExtPrice = extended?.prePrice || prices?.prePrice || 0;
            activeExtType = 'PRE';
            activeExtLabel = 'PRE';
        } else if (s === 'REG' || s === 'RTH' || s === 'MARKET') {
            activeExtPrice = extended?.prePrice || prices?.prePrice || extended?.preClose || 0;
            if (activeExtPrice > 0) {
                activeExtType = 'PRE_CLOSE';
                activeExtLabel = 'PRE CLOSE';
            }
        } else if (s === 'POST') {
            activeExtPrice = extended?.postPrice || prices?.postPrice || 0;
            activeExtType = 'POST';
            activeExtLabel = 'POST';
        } else if (s === 'CLOSED') {
            activeExtPrice = extended?.postPrice || prices?.postPrice || 0;
            if (activeExtPrice > 0) {
                activeExtType = 'POST';
                activeExtLabel = 'POST (CLOSED)';
            } else {
                activeExtPrice = extended?.prePrice || prices?.prePrice || 0;
                if (activeExtPrice > 0) {
                    activeExtType = 'PRE_CLOSE';
                    activeExtLabel = 'PRE (CLOSED)';
                }
            }
        }
    }

    // [ABSOLUTE MATH OVERRIDE - BULLDOZER FIX]
    // Completely ignore any untrustworthy `activeExtPct` from APIs (like +3.93% instead of +0.54%).
    // Recalculate directly from absolute numbers to guarantee 100% data integrity globally.
    let activeExtPctKnown = false;
    if (activeExtPrice > 0) {
        if ((activeExtType === 'PRE' || activeExtType === 'PRE_CLOSE') && resolvedPrevClose > 0) {
            activeExtPct = ((activeExtPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
            activeExtPctKnown = true;
        } else if (activeExtType === 'POST') {
            // POST session change must reference regular close limit. Try regularCloseToday first, fallback to displayPrice (which locks to intraday close during POST).
            const referencePrice = (regularCloseToday && regularCloseToday > 0) ? regularCloseToday : displayPrice;
            if (referencePrice > 0) {
                activeExtPct = ((activeExtPrice - referencePrice) / referencePrice) * 100;
                activeExtPctKnown = true;
            }
        } else if (resolvedPrevClose > 0) {
            activeExtPct = ((activeExtPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
            activeExtPctKnown = true;
        }
    }

    return {
        displayPrice,
        displayChangePct,
        activeExtPrice,
        activeExtType,
        activeExtLabel,
        activeExtPct,
        activeExtPctKnown
    };
}

// ════════════════════════════════════════════════════════════════════════
// «한 숫자» — 가격 하나·등락 하나만 그리는 자리의 공용 계산(대표 9/30 «같은 지표는 같이 사용»)
//   쓰는 곳: 대시보드 «지수» ETF·섹터 타일 · «내 종목» 카드·목록(liveQuote.liveDisplay). 원천(가격 허브 틱·시세 요청)과 상관없이 같은 기준.
//     본 등락(한 숫자) = 직전 정규장 종가 대비 — 그 거래일이 시작할 때의 전일 종가(가격 허브 changePct 와 같은 기준)
//       프리(D)·정규장(D)·애프터(D) → D-1 종가 대비 · 장 마감 → 마지막 정규장 등락
//   POST/PRE 배지(시간외 가격을 «따로» 그리는 자리 — Command·Flow)는 위 calcPriceDisplay 의 activeExtPct:
//       애프터 = 오늘 정규장 종가 대비(업계 표준) · 프리 = 직전 정규장 종가 대비
//   그래서 애프터엔 (1 + 한 숫자) = (1 + 정규장 등락) × (1 + POST 배지) — 세 자리가 같은 사실을 말한다(시험으로 고정).
//   예전 대시보드는 소켓이 붙으면 D-1 대비(허브), 끊기면 오늘 종가 대비(시세)로 기준이 바뀌었다.
// ════════════════════════════════════════════════════════════════════════

/** /api/live/quotes 한 종목에서 «한 숫자»가 읽는 필드 — 세션마다 뜻이 다르다(아래 oneNumberBase) */
export interface QuoteForOneNumber {
    /** pre: 마지막 정규장 종가(D-1) · regular: 실시간 · post: 오늘 정규장 종가(D) · closed: 마지막 정규장 종가 */
    price?: number | null;
    /** pre: 그 하나 앞(D-2) · regular·post: D-1 종가 · closed: 마지막 정규장의 전일 */
    previousClose?: number | null;
    prevClose?: number | null;
    /** 마지막 정규장의 등락(서버 계산 · 모르면 null) */
    changePercent?: number | null;
    /** pre·post 의 그 세션 체결가(없으면 0) */
    extendedPrice?: number | null;
}

export type OneNumberSession = 'pre' | 'reg' | 'post' | 'closed';

export interface OneNumber {
    price: number;
    /** 모르면 null — «0.00%»를 지어내지 않는다 */
    changePct: number | null;
    /** 프리·애프터 체결가를 그린다 */
    ext: boolean;
}

const posNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const finNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 서버·허브가 쓰는 세션 이름을 하나로 — 'regular'·'reg'·'open'·'market' → 'reg' */
export function normalizeQuoteSession(s: string | null | undefined): OneNumberSession | null {
    const v = String(s || '').toLowerCase();
    if (v === 'regular' || v === 'reg' || v === 'rth' || v === 'open' || v === 'market') return 'reg';
    if (v === 'pre' || v === 'post' || v === 'closed') return v;
    return null;
}

/**
 * 한 숫자 등락의 기준 — 그 거래일의 «직전 정규장 종가»(0 = 모름).
 *   프리엔 시세의 price 가 그 값이다(마지막 정규장 종가 D-1 · previousClose 는 한 세션 앞 D-2 — 프리마켓 기준선 함정)
 *   정규장·애프터는 previousClose(D-1) · 장 마감엔 기준을 쓰지 않는다(마지막 정규장 등락을 그대로)
 */
export function oneNumberBase(q: QuoteForOneNumber | null | undefined, session: OneNumberSession | null): number {
    if (!q) return 0;
    if (session === 'pre') return posNum(q.price);
    if (session === 'reg' || session === 'post') return posNum(q.previousClose) || posNum(q.prevClose);
    return 0;
}

/** 한 숫자 등락(%) — 기준 대비. 기준이나 가격이 없으면 null */
export function oneNumberPct(price: number | null | undefined, base: number | null | undefined): number | null {
    const p = posNum(price), b = posNum(base);
    return p && b ? ((p - b) / b) * 100 : null;
}

/**
 * 시세 한 종목 → 한 숫자.
 *   프리·애프터에 그 세션 체결가가 있으면(그리고 기준을 알면) 그 체결가 · 직전 정규장 종가 대비(ext)
 *   아니면 마지막 정규장 가격 — 정규장·애프터는 D-1 대비로 계산(서버 등락으로 보충) · 프리(체결 전)·마감은 서버의 마지막 정규장 등락
 * 가격이 없으면 null.
 */
export function oneNumberFromQuote(q: QuoteForOneNumber | null | undefined, session: OneNumberSession | null): OneNumber | null {
    if (!q) return null;
    const px = posNum(q.price);
    if (!px) return null;
    const base = oneNumberBase(q, session);
    const ext = posNum(q.extendedPrice);
    if ((session === 'pre' || session === 'post') && ext && base) {
        return { price: ext, changePct: oneNumberPct(ext, base), ext: true };
    }
    const serverPct = finNum(q.changePercent);
    // 정규장은 두 가격으로(calcPriceDisplay 정규장 본 숫자와 같다) · 애프터(체결 전)는 오늘 종가 vs D-1 — Command 본 숫자처럼 safeChangePct
    const pct = session === 'reg' ? (oneNumberPct(px, base) ?? serverPct)
        : session === 'post' ? (base ? safeChangePct(px, base, serverPct) : serverPct)
            : serverPct;
    return { price: px, changePct: pct, ext: false };
}

/**
 * 가격 허브 틱 하나 → 한 숫자의 등락(같은 기준 — 시세의 oneNumberBase). 기준을 모르면 null(부르는 쪽이 허브 등락으로 보충).
 * 틱을 쓸지(세션이 열려 있나·허브가 굳은 값이 아닌가)는 부르는 쪽이 정한다.
 */
export function oneNumberTickPct(tickPrice: number | null | undefined, q: QuoteForOneNumber | null | undefined, session: OneNumberSession | null): number | null {
    return oneNumberPct(tickPrice, oneNumberBase(q, session));
}

// ════════════════════════════════════════════════════════════════════════
// 시간외 «배지» — 행(시세·인텔 행)의 extendedPrice/extendedLabel 을 따로 그리는 자리의 공용 규칙(대표 9/30 «같은 지표는 같이 사용»)
//   규칙은 위 calcPriceDisplay 의 배지(activeExt*) 그대로다 — 세션으로 고른다(라벨로 고르지 않는다):
//     프리장 = «PRE» · 정규장 = 그날 프리 종가는 «PRE CLOSE»(지금 가격이 아니다) · 애프터 = «POST»
//   9/30 운영 실측(정규장 ET 15:54): /api/intel/fast·/api/live/quotes 가 정규장에도 extendedPrice = 프리 종가, extendedLabel = 'PRE'
//   (ARM 295.23 vs 288.645). 라벨만 보고 그린 보조 배지 3곳(앱 Intel 펼친 종목 · 웹 SectorCommanderLog · 웹 MobileTickerDetail)이
//   정규장 내내 «PRE $288.65» 를 «지금 프리마켓 가격»처럼 보였다 — Command 는 같은 값을 «PRE CLOSE» 로 그린다.
// ════════════════════════════════════════════════════════════════════════

/** 배지가 읽는 행 필드(인텔 행 IntelQuote · 시세 /api/live/quotes 한 종목) */
export interface QuoteForExtBadge {
    price?: number | null;
    prevClose?: number | null;
    previousClose?: number | null;
    regularCloseToday?: number | null;
    extendedPrice?: number | null;
    extendedChangePct?: number | null;
    extendedLabel?: string | null;
}

export interface ExtBadge {
    /** 'PRE' · 'PRE CLOSE' · 'POST' — calcPriceDisplay 의 activeExtLabel */
    label: string;
    /** 'PRE' · 'PRE_CLOSE' · 'POST' — 색 고르기용 */
    type: string;
    price: number;
    /** 기준을 알 때만 믿는다(pctKnown) — 모르면 화면은 등락을 그리지 않는다 */
    pct: number;
    pctKnown: boolean;
}

/**
 * 행 하나의 시간외 배지(없으면 null) — calcPriceDisplay 를 거친다. 세션을 모르면 그리지 않는다(라벨로 추측하지 않는다).
 *   session: 행의 세션('REG'·'regular'·'pre'·'POST'·'closed' …) — normalizeQuoteSession 이 읽는 이름
 */
export function extBadgeFromQuote(q: QuoteForExtBadge | null | undefined, session: string | null | undefined): ExtBadge | null {
    if (!q) return null;
    const ext = posNum(q.extendedPrice);
    const label = String(q.extendedLabel || '').trim();
    if (!ext || !label) return null;
    const s = normalizeQuoteSession(session);
    if (!s) return null;
    // 등락 기준 = 직전 정규장 종가(oneNumberBase — 프리엔 시세의 price 가 D-1 종가이고 previousClose 는 D-2 다: 프리마켓 기준선 함정)
    const base = oneNumberBase(q, s) || posNum(q.previousClose) || posNum(q.prevClose);
    const r = calcPriceDisplay({
        session: s === 'reg' ? 'REG' : s.toUpperCase(),
        livePrice: posNum(q.price) || null,
        liveExtPrice: ext,
        liveExtLabel: label,
        liveExtChangePct: finNum(q.extendedChangePct),
        prevRegularClose: base || null,
        regularCloseToday: posNum(q.regularCloseToday) || null,
    });
    if (!(r.activeExtPrice > 0) || !r.activeExtLabel) return null;
    return { label: r.activeExtLabel, type: r.activeExtType, price: r.activeExtPrice, pct: r.activeExtPct, pctKnown: r.activeExtPctKnown };
}
