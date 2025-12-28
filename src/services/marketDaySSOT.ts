// src/services/marketDaySSOT.ts
// S-56.4.6: Market Day SSOT Helper
// Handles timezone-aware market day calculations for non-trading day fallback

/**
 * Get current time in ET (Eastern Time)
 */
export function getETNow(): Date {
    // Create a date string in ET, then parse back
    const now = new Date();
    const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    return new Date(etString);
}

/**
 * Get ET hour (0-23) from a date
 */
export function getETHour(date: Date = new Date()): number {
    return parseInt(date.toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        hour12: false
    }));
}

/**
 * Get day of week in ET (0=Sun, 1=Mon, ..., 6=Sat)
 */
export function getETDayOfWeek(date: Date = new Date()): number {
    const etString = date.toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short"
    });
    const dayMap: Record<string, number> = {
        "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6
    };
    return dayMap[etString] ?? 0;
}

/**
 * Check if given date is weekend in ET
 */
export function isWeekendET(date: Date = new Date()): boolean {
    const dow = getETDayOfWeek(date);
    return dow === 0 || dow === 6; // Sunday or Saturday
}

/**
 * Convert date to YYYY-MM-DD string in ET timezone
 */
export function toYYYYMMDD_ET(date: Date): string {
    const etString = date.toLocaleString("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    // Format: MM/DD/YYYY -> YYYY-MM-DD
    const parts = etString.split("/");
    if (parts.length === 3) {
        return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
    // Fallback
    return date.toISOString().split("T")[0];
}

/**
 * Get the last trading day in YYYY-MM-DD format (ET)
 * - Saturday -> Friday
 * - Sunday -> Friday
 * - Before market open (9:30 AM ET) -> Previous trading day
 * - Note: Does not account for holidays (would need external holiday calendar)
 */
export function getLastTradingDayET(nowET: Date = getETNow()): string {
    const dow = getETDayOfWeek(nowET);
    const hour = getETHour(nowET);

    // Clone the date
    const result = new Date(nowET);

    // Weekend handling
    if (dow === 0) {
        // Sunday -> Friday (-2 days)
        result.setDate(result.getDate() - 2);
    } else if (dow === 6) {
        // Saturday -> Friday (-1 day)
        result.setDate(result.getDate() - 1);
    } else if (dow === 1 && hour < 9) {
        // Monday before 9:30 AM -> Friday (-3 days)
        result.setDate(result.getDate() - 3);
    } else if (hour < 9) {
        // Weekday before 9:30 AM -> Previous trading day
        result.setDate(result.getDate() - 1);
        // If that lands on Sunday, go to Friday
        const newDow = getETDayOfWeek(result);
        if (newDow === 0) {
            result.setDate(result.getDate() - 2);
        } else if (newDow === 6) {
            result.setDate(result.getDate() - 1);
        }
    }
    // Otherwise, today is a trading day during/after market hours

    return toYYYYMMDD_ET(result);
}

/**
 * Get today's date in YYYY-MM-DD format (ET)
 */
export function getTodayET(): string {
    return toYYYYMMDD_ET(getETNow());
}

/**
 * Calculate session based on ET time and market status
 */
export interface SessionInfo {
    badge: "REG" | "PRE" | "POST" | "CLOSED";
    asOfET: string;
    reasonKR?: string;
    isWeekend: boolean;
    lastTradingDay: string;
}

export function determineSessionInfo(nowET: Date = getETNow()): SessionInfo {
    const dow = getETDayOfWeek(nowET);
    const hour = getETHour(nowET);
    const minute = parseInt(nowET.toLocaleString("en-US", {
        timeZone: "America/New_York",
        minute: "2-digit"
    }));

    const isWeekend = dow === 0 || dow === 6;
    const lastTradingDay = getLastTradingDayET(nowET);
    const asOfET = nowET.toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });

    if (isWeekend) {
        return {
            badge: "CLOSED",
            asOfET,
            reasonKR: `주말 (마지막 거래일: ${lastTradingDay})`,
            isWeekend: true,
            lastTradingDay
        };
    }

    // Weekday time-based session
    const marketOpenMinutes = 9 * 60 + 30;  // 9:30 AM
    const marketCloseMinutes = 16 * 60;      // 4:00 PM
    const preMarketStart = 4 * 60;           // 4:00 AM
    const afterHoursEnd = 20 * 60;           // 8:00 PM

    const currentMinutes = hour * 60 + minute;

    let badge: "REG" | "PRE" | "POST" | "CLOSED";
    let reasonKR: string | undefined;

    if (currentMinutes >= marketOpenMinutes && currentMinutes < marketCloseMinutes) {
        badge = "REG";
    } else if (currentMinutes >= preMarketStart && currentMinutes < marketOpenMinutes) {
        badge = "PRE";
        reasonKR = "프리마켓 (4:00-9:30)";
    } else if (currentMinutes >= marketCloseMinutes && currentMinutes < afterHoursEnd) {
        badge = "POST";
        reasonKR = "애프터마켓 (16:00-20:00)";
    } else {
        badge = "CLOSED";
        reasonKR = "장마감";
    }

    return {
        badge,
        asOfET,
        reasonKR,
        isWeekend: false,
        lastTradingDay
    };
}

/**
 * Calculate RSI(14) from an array of close prices
 * @param closes Array of close prices (oldest to newest)
 * @param period RSI period (default 14)
 */
export function calculateRSI(closes: number[], period: number = 14): number | null {
    if (closes.length < period + 1) return null;

    const recent = closes.slice(-(period + 1));
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < recent.length; i++) {
        const change = recent[i] - recent[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/**
 * Calculate 3-day return from close prices
 * @param closes Array of close prices (oldest to newest)
 */
export function calculate3DReturn(closes: number[]): number | null {
    if (closes.length < 4) return null;

    const recent = closes.slice(-4);
    const threeDaysAgo = recent[0];
    const latest = recent[recent.length - 1];

    if (threeDaysAgo === 0) return null;
    return ((latest - threeDaysAgo) / threeDaysAgo) * 100;
}
