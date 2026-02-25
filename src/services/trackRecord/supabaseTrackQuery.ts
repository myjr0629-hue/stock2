// ============================================================================
// [BRIDGE] Supabase-Based TrackRecord Query — Self-Correction Data Provider
// Replaces the volatile /tmp/ backtestService with permanent Supabase storage.
// Used by powerEngine to feed historicalWinRate into alphaEngine.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Lazy-initialized to avoid issues during build time
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(supabaseUrl, supabaseKey);
    }
    return _supabase;
}

// ============================================================================
// TYPES
// ============================================================================

export interface TickerPerformanceDB {
    ticker: string;
    total: number;
    wins: number;
    losses: number;
    flat: number;
    invalidEntry: number;
    winRate: number;         // WIN / (WIN + LOSS + FLAT) * 100 — excludes INVALID_ENTRY
    entryAccuracy: number;   // (total - invalidEntry) / total * 100
    avgReturn: number;       // Average return_pct for triggered entries
}

// ============================================================================
// IN-MEMORY CACHE (5-minute TTL)
// ============================================================================

interface CacheEntry {
    data: Map<string, TickerPerformanceDB>;
    timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _cache: CacheEntry | null = null;

// ============================================================================
// CORE QUERY: Load all ticker performance from Supabase
// ============================================================================

async function loadAllPerformance(): Promise<Map<string, TickerPerformanceDB>> {
    // Return cached if fresh
    if (_cache && (Date.now() - _cache.timestamp) < CACHE_TTL_MS) {
        return _cache.data;
    }

    const supabase = getSupabase();
    const map = new Map<string, TickerPerformanceDB>();

    try {
        // Fetch only resolved records (not PENDING)
        const { data: records, error } = await supabase
            .from('alpha_track_records')
            .select('ticker, outcome, return_pct, is_entry_triggered')
            .neq('outcome', 'PENDING') as { data: { ticker: string; outcome: string; return_pct: number | null; is_entry_triggered: boolean | null }[] | null; error: any };

        if (error) {
            console.error('[SupabaseTrackQuery] Query failed:', error.message);
            return _cache?.data || map; // Fallback to stale cache
        }

        if (!records || records.length === 0) {
            _cache = { data: map, timestamp: Date.now() };
            return map;
        }

        // Aggregate by ticker
        const tickerMap: Record<string, {
            outcomes: string[];
            returns: number[];
            invalidCount: number;
        }> = {};

        for (const r of records) {
            const t = r.ticker;
            if (!tickerMap[t]) {
                tickerMap[t] = { outcomes: [], returns: [], invalidCount: 0 };
            }
            tickerMap[t].outcomes.push(r.outcome);
            if (r.return_pct !== null && r.return_pct !== undefined) {
                tickerMap[t].returns.push(Number(r.return_pct));
            }
            if (r.outcome === 'INVALID_ENTRY') {
                tickerMap[t].invalidCount++;
            }
        }

        for (const [ticker, data] of Object.entries(tickerMap)) {
            const total = data.outcomes.length;
            const invalidEntry = data.invalidCount;
            const validOutcomes = data.outcomes.filter(o => o !== 'INVALID_ENTRY');
            const wins = validOutcomes.filter(o => o === 'WIN').length;
            const losses = validOutcomes.filter(o => o === 'LOSS').length;
            const flat = validOutcomes.filter(o => o === 'FLAT').length;
            const validTotal = wins + losses + flat;
            const winRate = validTotal > 0 ? (wins / validTotal) * 100 : 0;
            const entryAccuracy = total > 0 ? ((total - invalidEntry) / total) * 100 : 0;
            const avgReturn = data.returns.length > 0
                ? data.returns.reduce((a, b) => a + b, 0) / data.returns.length
                : 0;

            map.set(ticker, {
                ticker,
                total,
                wins,
                losses,
                flat,
                invalidEntry,
                winRate: Math.round(winRate * 10) / 10,
                entryAccuracy: Math.round(entryAccuracy * 10) / 10,
                avgReturn: Math.round(avgReturn * 100) / 100,
            });
        }

        _cache = { data: map, timestamp: Date.now() };
        console.log(`[SupabaseTrackQuery] Loaded ${map.size} tickers, ${records.length} total records.`);
        return map;

    } catch (e: any) {
        console.error('[SupabaseTrackQuery] Unexpected error:', e?.message || e);
        return _cache?.data || map;
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get performance for a specific ticker. Used by powerEngine → alphaEngine.
 * Compatible interface with backtestService.getTickerPerformance().
 */
export async function getTickerPerformanceFromDB(ticker: string): Promise<TickerPerformanceDB | null> {
    const map = await loadAllPerformance();
    return map.get(ticker) || null;
}

/**
 * Get all ticker performance (for dashboard/overview).
 */
export async function getAllTickerPerformance(): Promise<TickerPerformanceDB[]> {
    const map = await loadAllPerformance();
    return Array.from(map.values());
}

/**
 * Get global summary stats.
 */
export async function getGlobalPerformanceSummary(): Promise<{
    totalTickers: number;
    totalRecords: number;
    globalWinRate: number;
    globalEntryAccuracy: number;
    globalAvgReturn: number;
}> {
    const all = await getAllTickerPerformance();
    if (all.length === 0) {
        return { totalTickers: 0, totalRecords: 0, globalWinRate: 0, globalEntryAccuracy: 0, globalAvgReturn: 0 };
    }

    const totalRecords = all.reduce((s, t) => s + t.total, 0);
    const totalWins = all.reduce((s, t) => s + t.wins, 0);
    const totalValid = all.reduce((s, t) => s + t.wins + t.losses + t.flat, 0);
    const totalInvalid = all.reduce((s, t) => s + t.invalidEntry, 0);

    return {
        totalTickers: all.length,
        totalRecords,
        globalWinRate: totalValid > 0 ? Math.round((totalWins / totalValid) * 1000) / 10 : 0,
        globalEntryAccuracy: totalRecords > 0 ? Math.round(((totalRecords - totalInvalid) / totalRecords) * 1000) / 10 : 0,
        globalAvgReturn: Math.round(all.reduce((s, t) => s + t.avgReturn, 0) / all.length * 100) / 100,
    };
}

/**
 * Force cache invalidation (call after track-verify updates outcomes).
 */
export function invalidateCache(): void {
    _cache = null;
}

/**
 * Preload performance cache. Call this before sync access loops (e.g., enrichItemsWithQualityTier).
 * Must be awaited before calling getTickerPerformanceSync.
 */
export async function preloadPerformanceCache(): Promise<void> {
    await loadAllPerformance();
}

/**
 * Synchronous cache accessor — returns cached data only.
 * Must call preloadPerformanceCache() first. Returns null if cache is empty.
 * Used by sync functions like computeQualityTier.
 */
export function getTickerPerformanceSync(ticker: string): TickerPerformanceDB | null {
    if (!_cache) return null;
    return _cache.data.get(ticker) || null;
}
