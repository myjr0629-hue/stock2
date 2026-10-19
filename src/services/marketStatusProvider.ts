import { MarketStatus } from './stockApi';

import { fetchMassive, CACHE_POLICY } from './massiveClient';
import { etDateOf, etMinutesOf, sessionCloseMinutes, usEquitySessionForEt, usMarketHolidayName, type UsEquitySession } from '@/lib/marketCalendar';
import { shiftDate, weekdayOfDate } from '@/lib/marketSession';

export interface MarketStatusResult extends MarketStatus {
    session: "pre" | "regular" | "post" | "closed";
    isHoliday: boolean;
    holidayName?: string;
    /**
     * [2026-09-07] «지금 이 순간이 속한 선물 거래일»이 휴장인가.
     * CME 글로벡스는 일요일 18:00 ET 에 열려 다음날 17:00 에 닫힌다 —
     * 즉 일요일 저녁은 **월요일 거래일**이다. isHoliday(오늘 날짜) 만 보면
     * 노동절 전날인 일요일 밤은 false 가 나오는데, 바로 그때부터
     * 야후가 선물을 안 준다(실측: 메모리얼데이 5/24 일 0봉 · 5/25 월 0봉).
     */
    isHolidaySession: boolean;
    holidaySessionName?: string;
    serverTime: string;
    asOfET: string; // New: ET Timestamp for UI display
    source: "INTRINIO" | "FALLBACK";
    cacheAgeSec: number; // New: Cache age for debugging
}

// In-memory cache
let statusCache: { data: MarketStatusResult; timestamp: number } | null = null;
// 15s (was 60s): tightens the max session-transition lag at market open/close/pre/post
// boundaries to ≤15s. Purely a refresh-cadence change — same status values, no feature
// impact; only mild extra load on the (cheap, TTL-capped) Polygon marketstatus calls.
const CACHE_TTL_MS = 15 * 1000; // 15s

// [2026-10-19] 휴장 판정·이름은 거래소 달력(@/lib/marketCalendar) 하나로.
//   예전 자체 표는 «월-일»만 봐서 연도를 몰랐다 — 2027-01-19(화, 정상 거래일)를 MLK 휴장으로, 2027-01-18(실제 휴장)을 거래일로 봤다.

/**
 * 지금이 속한 «선물 거래일»의 휴장 여부.
 * ET 18:00 을 넘겼으면 그 세션은 «다음 날» 거래일에 속한다.
 * 다음 날이 토요일이면(금요일 저녁) 세션이 없으므로 판정하지 않는다.
 */
function checkSessionHoliday(etDate: string, etMinutes: number): string | null {
    const target = etMinutes >= 18 * 60 ? shiftDate(etDate, 1) : etDate;
    if (weekdayOfDate(target) === 6) return null; // 토요일엔 세션이 없다
    return usMarketHolidayName(target);
}

/** 세션 → market 필드. 세션과 market 이 서로 다른 말을 하지 않게 한 곳에서 만든다(정규장만 open). */
function marketOfSession(session: UsEquitySession): "open" | "extended-hours" | "closed" {
    return session === "regular" ? "open" : session === "closed" ? "closed" : "extended-hours";
}

export async function getMarketStatusSSOT(): Promise<MarketStatusResult> {
    const now = Date.now();

    // Check Cache
    if (statusCache && (now - statusCache.timestamp < CACHE_TTL_MS)) {
        return {
            ...statusCache.data,
            cacheAgeSec: Math.floor((now - statusCache.timestamp) / 1000),
            serverTime: new Date().toISOString() // Update server time to request time
        };
    }

    try {
        // 1. Polygon/Massive API (Priority 1)
        const data = await fetchMassive('/v1/marketstatus/now', {}, true, undefined, CACHE_POLICY.LIVE);

        // ET Time Calculation — ET 날짜·분은 달력의 시계로 읽는다
        const etNow = new Date();
        const etStr = etNow.toLocaleString("en-US", { timeZone: "America/New_York" });
        const todayIso = etDateOf(etNow.getTime());
        const etTime = etMinutesOf(etNow.getTime());
        // 그날 정규장 마감 — 평소 16:00 · 조기 폐장 13:00 (달력)
        const regCloseMin = sessionCloseMinutes(todayIso);

        // Standardize Output
        const stocksStatus = data.exchanges?.nasdaq || data.exchanges?.nyse || data.market || "closed";
        const isOpen = stocksStatus === "open";
        const isExtended = stocksStatus === "extended-hours";

        // [Phase 24.1] Strict Holiday Validation (User Requirement)
        // Check upcoming holidays to confirm if today is TRULY a holiday.
        const upcomingRes = await fetchMassive('/v1/marketstatus/upcoming', {}, true, undefined, CACHE_POLICY.LIVE);
        const upcomingList = upcomingRes.data || [];

        // Check if today matches any "market-closed" event in upcoming list
        const isRealHoliday = upcomingList.some((h: any) => h.date === todayIso && h.status === "closed");
        const hardcodedHoliday = usMarketHolidayName(todayIso);

        // Priority: Upcoming API > Hardcoded > 'now' status (which might be flaky)
        const isPolygonHoliday = isRealHoliday || !!hardcodedHoliday;
        let holidayName = hardcodedHoliday;

        if (isRealHoliday) {
            const h = upcomingList.find((x: any) => x.date === todayIso);
            holidayName = h?.name || holidayName;
        }

        let session: "pre" | "regular" | "post" | "closed" = "closed";

        if (isOpen) {
            // [V4.5 BUG FIX] Polygon occasionally flags `open` early. Enforce strictly.
            if (etTime < 570) {
                // Before 09:30 ET
                session = "pre";
            } else if (etTime >= regCloseMin) {
                // After the regular close (16:00 ET · early close 13:00 ET)
                session = "post";
            } else {
                session = "regular";
            }
        } else if (isExtended) {
            // Polygon says "extended-hours". Disambiguate PRE vs POST.
            if (etTime < 570) {
                // Before 09:30 ET
                session = "pre";
            } else if (etTime < 1200) {
                // After 09:30 ET (handles 13:00 early closes gracefully!)
                session = "post";
            } else {
                // After 20:00 (extended hours legally ends at 20:00)
                session = "closed";
            }
        } else {
            session = "closed";
        }

        // [HOLIDAY] A non-trading holiday has no pre/regular/post — Polygon can still
        // report "extended-hours" on a holiday morning, which the time-gate above would
        // mis-map to 'pre'. Force 'closed' so downstream price logic shows the last real
        // trading session (see src/services/lastSession.ts) instead of a broken PRE/POST.
        if (isPolygonHoliday) {
            session = "closed";
        }

        // 선물 거래일 기준 휴장 — 일요일 저녁 세션은 월요일 거래일이다
        const sessionHoliday = checkSessionHoliday(todayIso, etTime);

        const result: MarketStatusResult = {
            // [2026-10-19] market 은 위에서 확정한 session 에서 만든다. 예전엔 원천 상태(isOpen)를 따로 실어,
            //   조기 폐장 13:00 이후 «market=open · session=post» 처럼 둘이 갈릴 수 있었다 — market=open 을 보는
            //   useLivePrice 가 시간외 체결을 정규장 가격으로 썼다. 평일 정상 시각엔 둘이 늘 같은 값이다.
            market: marketOfSession(session),
            session,
            isHoliday: isPolygonHoliday,
            holidayName: holidayName || undefined,
            isHolidaySession: !!sessionHoliday,
            holidaySessionName: sessionHoliday || undefined,
            serverTime: new Date().toISOString(),
            asOfET: etStr,
            source: "INTRINIO",
            cacheAgeSec: 0,
            nextOpen: data.nextOpen,
            nextClose: data.nextClose
        };

        statusCache = { data: result, timestamp: now };
        return result;

    } catch (e: any) {
        console.warn(`[MarketStatusSSOT] API failed (${e.message}), using FALLBACK.`);

        // 2. Fallback Logic (Priority 2)
        const fall = calculateFallbackStatus();
        return {
            ...fall,
            holidayName: (fall.holidayName || undefined) as string | undefined
        };
    }
}

function calculateFallbackStatus(): MarketStatusResult {
    const now = new Date();
    const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const todayIso = etDateOf(now.getTime());
    const minOfDay = etMinutesOf(now.getTime());

    // 휴장 이름은 달력에서 (주말은 휴장이 아니라 isHoliday=false — 예전과 같다)
    const holidayNameString = usMarketHolidayName(todayIso);
    const isHoliday = !!holidayNameString;

    const sessionHolidayName = checkSessionHoliday(todayIso, minOfDay);

    // 04:00 PRE · 09:30 REG · 정규장 마감(16:00 · 조기 폐장 13:00) POST · 20:00~ CLOSED · 주말·휴장 CLOSED — 달력 하나
    const session = usEquitySessionForEt(todayIso, minOfDay);
    const market = marketOfSession(session);

    return {
        market,
        session,
        isHoliday,
        holidayName: holidayNameString || undefined,
        isHolidaySession: !!sessionHolidayName,
        holidaySessionName: sessionHolidayName || undefined,
        serverTime: new Date().toISOString(),
        asOfET: etStr,
        source: "FALLBACK",
        cacheAgeSec: 0
    };
}
