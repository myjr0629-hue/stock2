// [V4.0] Weekend Options Cache Service
// Caches Friday close options data for use during weekends/holidays

import { getOptionChainSnapshot, RunBudget } from './massiveClient';
import { fetchMarketStatus } from './massiveClient';

// In-memory cache (can be persisted to file/DB later)
interface OptionsCache {
    ticker: string;
    data: any[];
    cachedAt: string; // ISO timestamp
    marketDate: string; // YYYY-MM-DD (the trading day)
}

const optionsCache = new Map<string, OptionsCache>();

// US Market Holidays 2026 (approximate - should be updated annually)
const US_HOLIDAYS_2026 = new Set([
    '2026-01-01', // New Year's Day
    '2026-01-20', // MLK Day
    '2026-02-17', // Presidents Day
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-07-03', // Independence Day (observed)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving
    '2026-12-25', // Christmas
]);

/**
 * Check if the given date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date = new Date()): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Check if the given date is a US market holiday
 */
export function isMarketHoliday(date: Date = new Date()): boolean {
    const dateStr = date.toISOString().split('T')[0];
    return US_HOLIDAYS_2026.has(dateStr);
}

/**
 * Check if market is closed (weekend or holiday)
 */
export function isMarketClosed(date: Date = new Date()): boolean {
    return isWeekend(date) || isMarketHoliday(date);
}

/**
 * Get the last trading day (goes back until finding a non-weekend, non-holiday)
 */
export function getLastTradingDay(fromDate: Date = new Date()): string {
    const date = new Date(fromDate);
    date.setHours(0, 0, 0, 0);

    // Go back one day at a time until we find a trading day
    let maxAttempts = 7; // Safety limit
    while (maxAttempts > 0) {
        date.setDate(date.getDate() - 1);
        if (!isWeekend(date) && !isMarketHoliday(date)) {
            return date.toISOString().split('T')[0];
        }
        maxAttempts--;
    }

    // Fallback: just return yesterday
    const yesterday = new Date(fromDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
}

/**
 * Get the most recent Friday for weekend cache reference
 */
export function getMostRecentFriday(fromDate: Date = new Date()): string {
    const date = new Date(fromDate);
    date.setHours(0, 0, 0, 0);

    // Find the most recent Friday
    const day = date.getDay();
    const daysToFriday = day === 0 ? 2 : (day === 6 ? 1 : (day < 5 ? day + 2 : 0));
    date.setDate(date.getDate() - daysToFriday);

    return date.toISOString().split('T')[0];
}

/**
 * Cache options data for a ticker (called after Friday close)
 */
export function cacheOptionsData(ticker: string, data: any[], marketDate: string): void {
    optionsCache.set(ticker.toUpperCase(), {
        ticker: ticker.toUpperCase(),
        data,
        cachedAt: new Date().toISOString(),
        marketDate
    });
    console.log(`[V4.0 Cache] Cached options for ${ticker} (${data.length} contracts, date: ${marketDate})`);
}

/**
 * Get cached options data for a ticker
 */
export function getCachedOptionsData(ticker: string): OptionsCache | null {
    return optionsCache.get(ticker.toUpperCase()) || null;
}

/**
 * Check if cache is valid (cached within last 3 days for weekend coverage)
 */
export function isCacheValid(cache: OptionsCache): boolean {
    const cacheAge = Date.now() - new Date(cache.cachedAt).getTime();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    return cacheAge < threeDaysMs;
}

/**
 * Get options with weekend fallback
 * - If weekday: fetch live data and cache it
 * - If weekend: use cached Friday data
 */
export async function getOptionsWithWeekendFallback(
    ticker: string,
    budget?: RunBudget
): Promise<{ data: any[]; source: 'LIVE' | 'CACHE'; marketDate: string }> {
    const now = new Date();
    const isWeekendNow = isMarketClosed(now);

    if (isWeekendNow) {
        // Weekend: Try to use cached data
        const cached = getCachedOptionsData(ticker);

        if (cached && isCacheValid(cached)) {
            console.log(`[V4.0 Cache] ${ticker}: Using cached Friday data (${cached.data.length} contracts)`);
            return {
                data: cached.data,
                source: 'CACHE',
                marketDate: cached.marketDate
            };
        }

        // No valid cache - try to fetch anyway (might get stale data but better than nothing)
        console.log(`[V4.0 Cache] ${ticker}: No cache available, fetching live (may be stale)`);
    }

    // Weekday or no cache: Fetch live data
    try {
        const data = await getOptionChainSnapshot(ticker, budget);
        const marketDate = isWeekendNow ? getLastTradingDay(now) : now.toISOString().split('T')[0];

        // Cache the data for potential weekend use
        if (!isWeekendNow && data.length > 0) {
            cacheOptionsData(ticker, data, marketDate);
        }

        return {
            data,
            source: 'LIVE',
            marketDate
        };
    } catch (e) {
        console.error(`[V4.0 Cache] ${ticker}: Options fetch failed`, e);

        // Fallback to cache even if expired
        const cached = getCachedOptionsData(ticker);
        if (cached) {
            console.log(`[V4.0 Cache] ${ticker}: Using expired cache as fallback`);
            return {
                data: cached.data,
                source: 'CACHE',
                marketDate: cached.marketDate
            };
        }

        return {
            data: [],
            source: 'LIVE',
            marketDate: now.toISOString().split('T')[0]
        };
    }
}

/**
 * Pre-warm cache for a list of tickers (call this Friday after close)
 */
export async function preWarmOptionsCache(
    tickers: string[],
    budget?: RunBudget
): Promise<{ cached: number; failed: number }> {
    console.log(`[V4.0 Cache] Pre-warming cache for ${tickers.length} tickers...`);

    let cached = 0;
    let failed = 0;
    const marketDate = new Date().toISOString().split('T')[0];

    for (const ticker of tickers) {
        try {
            const data = await getOptionChainSnapshot(ticker, budget);
            if (data.length > 0) {
                cacheOptionsData(ticker, data, marketDate);
                cached++;
            } else {
                failed++;
            }

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));
        } catch (e) {
            console.warn(`[V4.0 Cache] Failed to cache ${ticker}:`, e);
            failed++;
        }
    }

    console.log(`[V4.0 Cache] Pre-warm complete: ${cached} cached, ${failed} failed`);
    return { cached, failed };
}
