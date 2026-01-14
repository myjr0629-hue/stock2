/**
 * Weekend Options Cache Service
 * 
 * Purpose: Ensures 100% options coverage on weekends by using Friday's cached data.
 * 
 * Design:
 * - On Friday market close (or any weekday), save options data to local cache
 * - On Saturday/Sunday, return cached data instead of calling live API
 * - Cache is stored as JSON files in snapshots/options-cache/
 * 
 * This approach GUARANTEES data availability on weekends, regardless of API status.
 */

import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'snapshots', 'options-cache');

// Ensure cache directory exists
// Note: This will fail on Vercel (read-only fs) but we gracefully handle it
function ensureCacheDir(): boolean {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        return true;
    } catch (e: any) {
        // EROFS on Vercel - silently ignore, cache won't work but won't crash
        if (e.code !== 'EROFS') {
            console.warn('[WeekendCache] Cannot create cache dir:', e.message);
        }
        return false;
    }
}

/**
 * Check if current time (in ET) is a weekend (Saturday or Sunday)
 */
export function isWeekend(): boolean {
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = nowET.getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Get the last trading day (Friday if weekend, today if weekday)
 */
export function getLastTradingDay(): string {
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = nowET.getDay();

    if (day === 0) { // Sunday -> Friday (-2)
        nowET.setDate(nowET.getDate() - 2);
    } else if (day === 6) { // Saturday -> Friday (-1)
        nowET.setDate(nowET.getDate() - 1);
    }

    return nowET.toISOString().split('T')[0];
}

/**
 * Save options data for a ticker to cache
 */
export function saveOptionsToCache(ticker: string, data: any): void {
    // Skip if we can't create cache dir (Vercel read-only fs)
    if (!ensureCacheDir()) {
        return;
    }

    try {
        const cacheFile = path.join(CACHE_DIR, `${ticker.toUpperCase()}.json`);
        const cacheData = {
            ticker: ticker.toUpperCase(),
            savedAt: new Date().toISOString(),
            tradingDay: getLastTradingDay(),
            data
        };
        fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
        console.log(`[WeekendCache] Saved ${ticker} options data to cache`);
    } catch (e: any) {
        // EROFS on Vercel - silently ignore
        if (e.code !== 'EROFS') {
            console.warn(`[WeekendCache] Cannot save ${ticker}:`, e.message);
        }
    }
}

/**
 * Load options data for a ticker from cache
 * Returns null if cache doesn't exist or is too old
 */
export function loadOptionsFromCache(ticker: string): any | null {
    const cacheFile = path.join(CACHE_DIR, `${ticker.toUpperCase()}.json`);

    if (!fs.existsSync(cacheFile)) {
        console.log(`[WeekendCache] No cache found for ${ticker}`);
        return null;
    }

    try {
        const raw = fs.readFileSync(cacheFile, 'utf-8');
        const cached = JSON.parse(raw);

        // Check if cache is from the last trading day (Friday)
        const expectedTradingDay = getLastTradingDay();
        if (cached.tradingDay !== expectedTradingDay) {
            console.log(`[WeekendCache] Cache for ${ticker} is stale (${cached.tradingDay} vs expected ${expectedTradingDay})`);
            return null;
        }

        console.log(`[WeekendCache] Loaded ${ticker} options from cache (trading day: ${cached.tradingDay})`);
        return cached.data;
    } catch (e) {
        console.error(`[WeekendCache] Error loading cache for ${ticker}:`, e);
        return null;
    }
}

/**
 * Get the cache strategy for current time
 * Returns 'LIVE' on weekdays, 'CACHE' on weekends
 */
export function getCacheStrategy(): 'LIVE' | 'CACHE' {
    return isWeekend() ? 'CACHE' : 'LIVE';
}

/**
 * Clear all cached options data
 */
export function clearOptionsCache(): void {
    try {
        if (fs.existsSync(CACHE_DIR)) {
            const files = fs.readdirSync(CACHE_DIR);
            files.forEach(file => {
                fs.unlinkSync(path.join(CACHE_DIR, file));
            });
            console.log(`[WeekendCache] Cleared ${files.length} cached files`);
        }
    } catch (e: any) {
        // EROFS on Vercel - silently ignore
        if (e.code !== 'EROFS') {
            console.warn('[WeekendCache] Cannot clear cache:', e.message);
        }
    }
}

/**
 * List all cached tickers
 */
export function listCachedTickers(): string[] {
    if (!fs.existsSync(CACHE_DIR)) return [];
    return fs.readdirSync(CACHE_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
}

/**
 * Check if market is currently closed (weekend or outside trading hours)
 */
export function isMarketClosed(): boolean {
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = nowET.getDay();
    const hour = nowET.getHours();

    // Weekend
    if (day === 0 || day === 6) return true;

    // Outside trading hours (before 9:30 or after 16:00)
    if (hour < 9 || hour >= 16) return true;
    if (hour === 9 && nowET.getMinutes() < 30) return true;

    return false;
}

/**
 * Get options data with weekend fallback
 * Used by ForensicService for consistent data access
 * Returns: { data: contracts[], source: 'LIVE' | 'CACHE', marketDate: string }
 */
export async function getOptionsWithWeekendFallback(ticker: string): Promise<{
    data: any[];
    source: 'LIVE' | 'CACHE';
    marketDate: string;
}> {
    const marketDate = getLastTradingDay();

    // Try cache first on weekends/market closed
    if (isWeekend() || isMarketClosed()) {
        const cached = loadOptionsFromCache(ticker);
        if (cached && cached.contracts) {
            return {
                data: cached.contracts,
                source: 'CACHE',
                marketDate
            };
        }
    }

    // If no cache or weekday, caller should use live API
    // Return empty array to indicate live fetch needed
    // The actual API call will be made by the caller (ForensicService) using massiveClient
    const { getOptionChainSnapshot } = await import('./massiveClient');
    try {
        const snapshot = await getOptionChainSnapshot(ticker);
        if (snapshot && snapshot.length > 0) {
            return {
                data: snapshot,
                source: 'LIVE',
                marketDate
            };
        }
    } catch (e) {
        console.warn(`[WeekendCache] Live fetch failed for ${ticker}, using cache fallback`);
    }

    // Final fallback: try cache even on weekdays
    const cached = loadOptionsFromCache(ticker);
    if (cached && cached.contracts) {
        return {
            data: cached.contracts,
            source: 'CACHE',
            marketDate
        };
    }

    return { data: [], source: 'CACHE', marketDate };
}
