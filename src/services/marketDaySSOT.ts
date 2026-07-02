// src/services/marketDaySSOT.ts
// S-56.4.6: Market Day SSOT Helper
// Handles timezone-aware market day calculations for non-trading day fallback

/**
 * Get current time components in ET (Eastern Time)
 * Returns an object with year, month, day, hour, minute, dayOfWeek
 * This avoids the Date re-parsing bug that occurs with new Date(etString)
 */
export function getETComponents(date: Date = new Date()): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    dayOfWeek: number;
} {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'short'
    });

    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '';

    const dayMap: Record<string, number> = {
        'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };

    return {
        year: parseInt(get('year')),
        month: parseInt(get('month')),
        day: parseInt(get('day')),
        hour: parseInt(get('hour')),
        minute: parseInt(get('minute')),
        dayOfWeek: dayMap[get('weekday')] ?? 0
    };
}

/**
 * Get current date in ET as YYYY-MM-DD string (reliable method)
 */
export function getTodayETString(date: Date = new Date()): string {
    const et = getETComponents(date);
    return `${et.year}-${String(et.month).padStart(2, '0')}-${String(et.day).padStart(2, '0')}`;
}

/**
 * Get current time in ET (Eastern Time)
 * @deprecated Use getETComponents() for reliable timezone handling
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

// ── US (NYSE) market holiday calendar — year-agnostic, synchronous ──────────
// Fixed-date holidays observe the NYSE weekend shift (Sat -> preceding Fri,
// Sun -> following Mon). Floating holidays use their weekday rules; Good Friday
// via Computus. Used so getLastTradingDayET rolls back over holidays too.
function _nthWeekday(y: number, m0: number, wd: number, n: number): number {
    const first = new Date(Date.UTC(y, m0, 1));
    const off = (wd - first.getUTCDay() + 7) % 7;
    return 1 + off + (n - 1) * 7;
}
function _lastWeekday(y: number, m0: number, wd: number): number {
    const last = new Date(Date.UTC(y, m0 + 1, 0));
    const off = (last.getUTCDay() - wd + 7) % 7;
    return last.getUTCDate() - off;
}
function _isoYMD(y: number, m0: number, d: number): string {
    return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function _observed(y: number, m0: number, d: number): string {
    const dt = new Date(Date.UTC(y, m0, d));
    const dow = dt.getUTCDay();
    if (dow === 6) dt.setUTCDate(dt.getUTCDate() - 1);      // Sat -> Fri
    else if (dow === 0) dt.setUTCDate(dt.getUTCDate() + 1); // Sun -> Mon
    return _isoYMD(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}
function _goodFriday(y: number): string {
    // Computus (Gregorian) -> Easter Sunday, minus 2 days = Good Friday.
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mo0 = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const da = ((h + l - 7 * m + 114) % 31) + 1;
    const dt = new Date(Date.UTC(y, mo0, da));
    dt.setUTCDate(dt.getUTCDate() - 2);
    return _isoYMD(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}
const _holidaysByYear: Record<number, Set<string>> = {};
function _usMarketHolidays(y: number): Set<string> {
    if (_holidaysByYear[y]) return _holidaysByYear[y];
    const s = new Set<string>([
        _observed(y, 0, 1),                    // New Year's Day
        _isoYMD(y, 0, _nthWeekday(y, 0, 1, 3)),// MLK Jr. Day (3rd Mon Jan)
        _isoYMD(y, 1, _nthWeekday(y, 1, 1, 3)),// Washington's Birthday (3rd Mon Feb)
        _goodFriday(y),                        // Good Friday
        _isoYMD(y, 4, _lastWeekday(y, 4, 1)),  // Memorial Day (last Mon May)
        _observed(y, 5, 19),                   // Juneteenth
        _observed(y, 6, 4),                    // Independence Day
        _isoYMD(y, 8, _nthWeekday(y, 8, 1, 1)),// Labor Day (1st Mon Sep)
        _isoYMD(y, 10, _nthWeekday(y, 10, 4, 4)),// Thanksgiving (4th Thu Nov)
        _observed(y, 11, 25),                  // Christmas Day
    ]);
    _holidaysByYear[y] = s;
    return s;
}

/** True if the given ET calendar date (YYYY-MM-DD) is a US market holiday (full close). */
export function isUSMarketHolidayET(isoDate: string): boolean {
    const y = parseInt(isoDate.slice(0, 4), 10);
    return _usMarketHolidays(y).has(isoDate);
}

/**
 * Get the last completed trading day in YYYY-MM-DD format (ET).
 * Rolls back over weekends AND market holidays (e.g. a Fri holiday over a long
 * weekend resolves to the prior Thu), so closed-market views keep showing the
 * most recent real session's data until the next session opens.
 * - Before market open (9:30 AM ET) -> previous trading day
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

    // Roll back over holidays (and any weekend a holiday's observed shift lands
    // on) so we always resolve to the most recent COMPLETED trading session.
    let guard = 0;
    while (guard++ < 14) {
        const dw = getETDayOfWeek(result);
        if (dw === 0 || dw === 6 || isUSMarketHolidayET(toYYYYMMDD_ET(result))) {
            result.setDate(result.getDate() - 1);
            continue;
        }
        break;
    }

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
