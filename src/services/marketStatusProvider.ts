import { MarketStatus } from './stockApi';

import { fetchMassive, CACHE_POLICY } from './massiveClient';
import { etDateOf, etMinutesOf, sessionCloseMinutes } from '@/lib/marketCalendar';

/**
 * [2026-11-28] 조기 폐장 수리 — 2026-11-27(블랙프라이데이, NYSE 13:00 ET 마감) 13:14 ET 에
 *   /api/market/status 가 {"market":"open","session":"regular"} 를 줬다. 정규장 끝을 16:00(960)으로
 *   박아 둔 탓이다. 정규장 끝은 이제 달력 정본 sessionCloseMinutes(그날 ET 날짜)로 읽는다
 *   (평소 960 · 조기 폐장일 780). 애프터 끝(20:00)·프리 시작(04:00)·정규장 시작(09:30)은 그대로다.
 *
 * 원천 상태(stocksStatus)와 시각으로 세션을 정한다 — 시험용으로 꺼냈다(정규장 끝만 달력을 따르고, 원천 «open»을 시각으로 고친 경우 market 도 함께 맞춘다).
 */
export function resolveLiveSession(
    stocksStatus: string,
    nowMs: number,
): { session: "pre" | "regular" | "post" | "closed"; market: "open" | "extended-hours" | "closed" } {
    const etTime = etMinutesOf(nowMs);
    const regClose = sessionCloseMinutes(etDateOf(nowMs));
    const isOpen = stocksStatus === "open";
    const isExtended = stocksStatus === "extended-hours";
    let session: "pre" | "regular" | "post" | "closed" = "closed";
    if (isOpen) {
        // [V4.5 BUG FIX] Polygon occasionally flags `open` early. Enforce strictly.
        if (etTime < 570) session = "pre";                 // Before 09:30 ET
        else if (etTime >= regClose) session = "post";     // After regular close (16:00 ET · early close 13:00 ET)
        else session = "regular";
    } else if (isExtended) {
        // "extended-hours" — disambiguate PRE vs POST.
        if (etTime < 570) session = "pre";                 // Before 09:30 ET
        else if (etTime < 1200) session = "post";          // 09:30~20:00 ET (handles 13:00 early closes)
        else session = "closed";                           // After 20:00
    }
    // 원천이 «open»이라 해도 시각이 정규장 밖이면 market 도 세션에 맞춘다(예전엔 session 만 고치고 market 은 "open" 으로 남았다).
    const market: "open" | "extended-hours" | "closed" = isOpen
        ? (session === "regular" ? "open" : "extended-hours")
        : isExtended ? "extended-hours" : "closed";
    return { session, market };
}

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

const HOLIDAYS: Record<string, string> = {
    // 2026 Holidays (Current Year)
    "01-01": "New Year's Day",
    "01-19": "MLK Jr. Day",
    "02-16": "Washington's Birthday",
    "04-03": "Good Friday",
    "05-25": "Memorial Day",
    "06-19": "Juneteenth",
    "07-03": "Independence Day", // Observed
    "09-07": "Labor Day",
    "11-26": "Thanksgiving Day",
    "12-25": "Christmas Day"
};

/**
 * 지금이 속한 «선물 거래일»의 휴장 여부.
 * ET 18:00 을 넘겼으면 그 세션은 «다음 날» 거래일에 속한다.
 * 다음 날이 토요일이면(금요일 저녁) 세션이 없으므로 판정하지 않는다.
 */
function checkSessionHoliday(etDate: Date): string | null {
    const target = new Date(etDate.getTime());
    if (etDate.getHours() >= 18) {
        target.setDate(target.getDate() + 1);
    }
    if (target.getDay() === 6) return null; // 토요일엔 세션이 없다
    return checkHardcodedHoliday(target);
}

function checkHardcodedHoliday(etDate: Date): string | null {
    const mo = String(etDate.getMonth() + 1).padStart(2, '0');
    const d = String(etDate.getDate()).padStart(2, '0');
    const dateKey = `${mo}-${d}`;
    return HOLIDAYS[dateKey] || null;
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

        // ET Time Calculation
        const etNow = new Date();
        const etStr = etNow.toLocaleString("en-US", { timeZone: "America/New_York" });
        const etDate = new Date(etStr);

        // Standardize Output
        const stocksStatus = data.exchanges?.nasdaq || data.exchanges?.nyse || data.market || "closed";

        // [Phase 24.1] Strict Holiday Validation (User Requirement)
        // Check upcoming holidays to confirm if today is TRULY a holiday.
        const upcomingRes = await fetchMassive('/v1/marketstatus/upcoming', {}, true, undefined, CACHE_POLICY.LIVE);
        const upcomingList = upcomingRes.data || [];

        // Check if today matches any "market-closed" event in upcoming list
        const todayStr = etStr.split(',')[0]; // M/D/YYYY or similar depending on locale, safer to use YYYY-MM-DD from etDate
        const yyyy = etDate.getFullYear();
        const mm = String(etDate.getMonth() + 1).padStart(2, '0');
        const dd = String(etDate.getDate()).padStart(2, '0');
        const todayIso = `${yyyy}-${mm}-${dd}`;

        const isRealHoliday = upcomingList.some((h: any) => h.date === todayIso && h.status === "closed");
        const hardcodedHoliday = checkHardcodedHoliday(etDate);

        // Priority: Upcoming API > Hardcoded > 'now' status (which might be flaky)
        const isPolygonHoliday = isRealHoliday || !!hardcodedHoliday;
        let holidayName = hardcodedHoliday;

        if (isRealHoliday) {
            const h = upcomingList.find((x: any) => x.date === todayIso);
            holidayName = h?.name || holidayName;
        }

        // 정규장 끝 = sessionCloseMinutes(ET 날짜) — 조기 폐장일 13:00 ET (resolveLiveSession 머리말 참조)
        const resolved = resolveLiveSession(stocksStatus, etNow.getTime());
        let session: "pre" | "regular" | "post" | "closed" = resolved.session;

        // [HOLIDAY] A non-trading holiday has no pre/regular/post — Polygon can still
        // report "extended-hours" on a holiday morning, which the time-gate above would
        // mis-map to 'pre'. Force 'closed' so downstream price logic shows the last real
        // trading session (see src/services/lastSession.ts) instead of a broken PRE/POST.
        if (isPolygonHoliday) {
            session = "closed";
        }

        // 선물 거래일 기준 휴장 — 일요일 저녁 세션은 월요일 거래일이다
        const sessionHoliday = checkSessionHoliday(etDate);

        const result: MarketStatusResult = {
            market: isPolygonHoliday ? "closed" : resolved.market,
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

/** 원천 실패 시 시각·달력만으로 계산한다. nowMs 는 시험용(생략하면 지금 — 예전과 같다). */
export function calculateFallbackStatus(nowMs: number = Date.now()): MarketStatusResult {
    const now = new Date(nowMs);
    const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const etDate = new Date(etStr);
    const day = etDate.getDay(); // 0=Sun, 6=Sat
    const minOfDay = etMinutesOf(nowMs);
    // 정규장 끝 — 평소 16:00(960) · 조기 폐장일 13:00(780). 애프터 끝 20:00 은 그대로.
    const regClose = sessionCloseMinutes(etDateOf(nowMs));

    const isWeekend = day === 0 || day === 6;

    // Use shared holiday checker
    const holidayNameString = checkHardcodedHoliday(etDate); // Explicitly string | null
    const isHoliday = !!holidayNameString;

    // Default Closed
    const sessionHolidayName = checkSessionHoliday(etDate);

    let market: "closed" | "open" | "extended-hours" = "closed";
    let session: "closed" | "pre" | "regular" | "post" = "closed";

    if (!isWeekend && !isHoliday) {
        if (minOfDay >= 570 && minOfDay < regClose) { // 09:30 - 16:00 (조기 폐장 13:00)
            market = "open";
            session = "regular";
        } else if (minOfDay >= 240 && minOfDay < 570) { // 04:00 - 09:30
            market = "extended-hours";
            session = "pre";
        } else if (minOfDay >= regClose && minOfDay < 1200) { // 16:00 (조기 폐장 13:00) - 20:00
            market = "extended-hours";
            session = "post";
        }
    }

    return {
        market,
        session,
        isHoliday: isHoliday || (isWeekend && false),
        holidayName: holidayNameString || undefined,
        isHolidaySession: !!sessionHolidayName,
        holidaySessionName: sessionHolidayName || undefined,
        serverTime: now.toISOString(),
        asOfET: etStr,
        source: "FALLBACK",
        cacheAgeSec: 0
    };
}
