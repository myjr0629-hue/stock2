/**
 * [PERF V74] Command Page SWR Prefetch
 * 
 * Prefetches Command unified data when user hovers a ticker on Dashboard.
 * Uses SWR preload() — data is cached in SWR global cache and instantly
 * available when the Command page mounts, eliminating loading spinners.
 * 
 * Usage: Call prefetchCommandData(ticker, locale) on ticker hover.
 * The fetched data will be used as SWR fallback on Command page load.
 */

import { preload } from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// Track prefetched tickers to avoid duplicate prefetches
const prefetchedTickers = new Set<string>();

/**
 * Prefetch Command page unified data for a ticker.
 * Called on dashboard ticker hover (300ms debounce recommended).
 * Data is stored in SWR global cache — Command page picks it up instantly.
 */
export function prefetchCommandData(ticker: string, locale: string): void {
    if (!ticker || prefetchedTickers.has(ticker)) return;
    
    // Mark as prefetched to prevent duplicate fetches
    prefetchedTickers.add(ticker);
    
    // Clear oldest entries if cache grows too large
    if (prefetchedTickers.size > 50) {
        const first = prefetchedTickers.values().next().value;
        if (first) prefetchedTickers.delete(first);
    }
    
    // Prefetch Command unified API — this is the main data source for Command page
    preload(`/api/command/unified?t=${ticker}&lang=${locale}`, fetcher);
}

/**
 * Reset prefetch cache for a specific ticker (e.g., when data becomes stale).
 */
export function invalidatePrefetch(ticker: string): void {
    prefetchedTickers.delete(ticker);
}
