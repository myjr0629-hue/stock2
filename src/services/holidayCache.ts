// src/services/holidayCache.ts
// [S-70] Market Holiday Cache Service for Weekly Expiration Calculation
// Caches Polygon /v1/marketstatus/upcoming API for accurate holiday detection

import { fetchMassive } from './massiveClient';

interface MarketHoliday {
    date: string;      // "2026-04-03"
    name: string;      // "Good Friday"
    exchange: string;  // "NYSE", "NASDAQ"
    status: string;    // "closed", "early-close"
}

// In-memory cache (server-side)
let holidayCache: MarketHoliday[] = [];
let cacheTimestamp: number = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch and cache market holidays from Polygon API
 */
export async function getMarketHolidays(): Promise<MarketHoliday[]> {
    const now = Date.now();

    // Return cache if valid
    if (holidayCache.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
        return holidayCache;
    }

    try {
        const data = await fetchMassive('/v1/marketstatus/upcoming', {}, true);

        if (Array.isArray(data)) {
            holidayCache = data.filter((h: any) =>
                h.status === 'closed' &&
                (h.exchange === 'NYSE' || h.exchange === 'NASDAQ')
            );
            cacheTimestamp = now;
            console.log(`[HolidayCache] Loaded ${holidayCache.length} holidays`);
        }
    } catch (e) {
        console.error('[HolidayCache] Failed to fetch holidays:', e);
        // Keep using old cache if fetch fails
    }

    return holidayCache;
}

/**
 * Check if a specific date is a market holiday
 */
export function isMarketHoliday(dateStr: string, holidays: MarketHoliday[]): boolean {
    return holidays.some(h => h.date === dateStr);
}

/**
 * Get the next weekly options expiration date (Friday, or Thursday if Friday is holiday)
 * @param fromDate Starting date to calculate from
 * @param holidays List of market holidays
 * @returns YYYY-MM-DD format string
 */
export function getNextWeeklyExpiration(fromDate: Date = new Date(), holidays: MarketHoliday[] = []): string {
    // [V45.17 FIX] Use reliable ET components instead of buggy Date parsing
    const { getETComponents } = require('./marketDaySSOT');
    const et = getETComponents(fromDate);

    // Find next Friday (5 = Friday)
    let daysToAdd = (5 - et.dayOfWeek + 7) % 7;

    // If today is Friday (daysToAdd === 0):
    // - Before 16:00 ET (market close): use TODAY's expiry
    // - After 16:00 ET: use NEXT Friday
    if (daysToAdd === 0) {
        if (et.hour >= 16) {
            daysToAdd = 7; // After market close, use next Friday
        }
        // else daysToAdd stays 0, use today
    }

    // Calculate target date by adding days
    const targetDate = new Date(et.year, et.month - 1, et.day + daysToAdd);

    // Format as YYYY-MM-DD
    const formatDate = (d: Date): string => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    let targetStr = formatDate(targetDate);

    // If Friday is a holiday, move to Thursday
    if (isMarketHoliday(targetStr, holidays)) {
        targetDate.setDate(targetDate.getDate() - 1);
        targetStr = formatDate(targetDate);

        // If Thursday is also a holiday (rare), move to Wednesday
        if (isMarketHoliday(targetStr, holidays)) {
            targetDate.setDate(targetDate.getDate() - 1);
            targetStr = formatDate(targetDate);
        }
    }

    return targetStr;
}

/**
 * Find the best weekly expiration from available expirations list
 * Uses holiday-aware calculation to select the correct expiration
 */
export async function findWeeklyExpiration(expirations: string[]): Promise<string> {
    if (!expirations || expirations.length === 0) return '';

    // Sort expirations (should already be sorted, but just in case)
    const sorted = [...expirations].sort();

    // Get holidays
    const holidays = await getMarketHolidays();

    // Calculate expected weekly expiration
    const expectedWeekly = getNextWeeklyExpiration(new Date(), holidays);

    // Check if expected weekly exists in available expirations
    if (sorted.includes(expectedWeekly)) {
        return expectedWeekly;
    }

    // Fallback: Find first Friday expiration
    const fridayExp = sorted.find(exp => {
        const date = new Date(exp + 'T12:00:00');
        return date.getDay() === 5;
    });
    if (fridayExp) return fridayExp;

    // Fallback: Find first Thursday expiration
    const thursdayExp = sorted.find(exp => {
        const date = new Date(exp + 'T12:00:00');
        return date.getDay() === 4;
    });
    if (thursdayExp) return thursdayExp;

    // Ultimate fallback: First available expiration
    return sorted[0];
}

/**
 * Synchronous version for use in places where async is not possible
 * Uses simple Friday/Thursday logic without holiday check
 */
export function findWeeklyExpirationSync(expirations: string[]): string {
    if (!expirations || expirations.length === 0) return '';

    const sorted = [...expirations].sort();

    // [DEBUG] Check each expiration's day of week
    sorted.slice(0, 5).forEach(exp => {
        const date = new Date(exp + 'T12:00:00');
        const dayOfWeek = date.getDay();
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
        console.log(`[findWeeklyExpirationSync] ${exp} -> ${dayName} (${dayOfWeek})`);
    });

    // Find first Friday
    const fridayExp = sorted.find(exp => {
        const date = new Date(exp + 'T12:00:00');
        return date.getDay() === 5;
    });
    if (fridayExp) {
        console.log(`[findWeeklyExpirationSync] Found Friday: ${fridayExp}`);
        return fridayExp;
    }

    // Find first Thursday
    const thursdayExp = sorted.find(exp => {
        const date = new Date(exp + 'T12:00:00');
        return date.getDay() === 4;
    });
    if (thursdayExp) {
        console.log(`[findWeeklyExpirationSync] Found Thursday: ${thursdayExp}`);
        return thursdayExp;
    }

    console.log(`[findWeeklyExpirationSync] No Fri/Thu found, fallback to: ${sorted[0]}`);
    return sorted[0];
}
