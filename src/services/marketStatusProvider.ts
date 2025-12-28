import { MarketStatus } from './stockApi';

import { fetchMassive, CACHE_POLICY } from './massiveClient';

export interface MarketStatusResult extends MarketStatus {
    session: "pre" | "regular" | "post" | "closed";
    isHoliday: boolean;
    holidayName?: string;
    serverTime: string;
    asOfET: string; // New: ET Timestamp for UI display
    source: "MASSIVE" | "FALLBACK";
    cacheAgeSec: number; // New: Cache age for debugging
}

// In-memory cache
let statusCache: { data: MarketStatusResult; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60s

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
        // 1. Polygon/Massive API (Priority 1)
        const data = await fetchMassive('/v1/marketstatus/now', {}, true, undefined, CACHE_POLICY.LIVE);

        // ET Time Calculation
        const etNow = new Date();
        const etStr = etNow.toLocaleString("en-US", { timeZone: "America/New_York" });
        const etDate = new Date(etStr);
        const etHour = etDate.getHours();
        const etMin = etDate.getMinutes();
        const etTime = etHour * 60 + etMin;

        // Standardize Output
        const stocksStatus = data.exchanges?.nasdaq || data.exchanges?.nyse || data.market || "closed";
        const isOpen = stocksStatus === "open";
        const isExtended = stocksStatus === "extended-hours";

        // Holiday Check (Polygon data usage)
        const isPolygonHoliday = data.exchanges?.nasdaq === "closed" && data.exchanges?.nyse === "closed" &&
            etDate.getDay() !== 0 && etDate.getDay() !== 6;

        let session: "pre" | "regular" | "post" | "closed" = "closed";

        if (isOpen) {
            session = "regular";
        } else if (isExtended) {
            // Polygon says "extended", we clarify Pre vs Post using ET time
            if (etTime >= 240 && etTime < 570) session = "pre"; // 04:00 - 09:30
            else if (etTime >= 960 && etTime < 1200) session = "post"; // 16:00 - 20:00
            else session = "closed";
        } else {
            session = "closed";
        }

        const result: MarketStatusResult = {
            market: isOpen ? "open" : isExtended ? "extended-hours" : "closed",
            session,
            isHoliday: isPolygonHoliday,
            holidayName: isPolygonHoliday ? (data.holiday || "Market Holiday") : undefined,
            serverTime: new Date().toISOString(),
            asOfET: etStr,
            source: "MASSIVE",
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
        statusCache = { data: fall, timestamp: now }; // Cache fallback too
        return fall;
    }
}

function calculateFallbackStatus(): MarketStatusResult {
    const now = new Date();
    const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const etDate = new Date(etStr);
    const day = etDate.getDay(); // 0=Sun, 6=Sat
    const h = etDate.getHours();
    const m = etDate.getMinutes();
    const minOfDay = h * 60 + m;

    const isWeekend = day === 0 || day === 6;

    // Quick Holiday Dictionary (Hardcoded - add more as needed)
    // MM-DD format
    const mo = String(etDate.getMonth() + 1).padStart(2, '0');
    const d = String(etDate.getDate()).padStart(2, '0');
    const dateKey = `${mo}-${d}`;

    const HOLIDAYS: Record<string, string> = {
        "01-01": "New Year's Day",
        "01-20": "MLK Jr. Day", // Approximate
        "02-17": "Washington's Birthday", // Approximate
        "06-19": "Juneteenth",
        "07-04": "Independence Day",
        "09-01": "Labor Day", // Approximate
        "11-27": "Thanksgiving Day", // Approximate
        "12-25": "Christmas Day"
    };

    const holidayName = HOLIDAYS[dateKey];
    const isHoliday = !!holidayName;

    // Default Closed
    let market: "closed" | "open" | "extended-hours" = "closed";
    let session: "closed" | "pre" | "regular" | "post" = "closed";

    if (!isWeekend && !isHoliday) {
        if (minOfDay >= 570 && minOfDay < 960) { // 09:30 - 16:00
            market = "open";
            session = "regular";
        } else if (minOfDay >= 240 && minOfDay < 570) { // 04:00 - 09:30
            market = "extended-hours";
            session = "pre";
        } else if (minOfDay >= 960 && minOfDay < 1200) { // 16:00 - 20:00
            market = "extended-hours";
            session = "post";
        }
    }

    return {
        market,
        session,
        isHoliday: isHoliday || (isWeekend && false),
        holidayName: isHoliday ? holidayName : undefined,
        serverTime: new Date().toISOString(),
        asOfET: etStr,
        source: "FALLBACK",
        cacheAgeSec: 0
    };
}
