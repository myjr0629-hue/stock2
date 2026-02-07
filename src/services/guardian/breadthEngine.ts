// [V7.0] Market Breadth Engine — Guardian Core Intelligence
// Fetches Full Market Snapshot from Massive API
// Computes A/D Ratio, Volume Breadth, Breadth % for 5000+ stocks
// Cached in Redis (5 min TTL) + Memory Cache

import { fetchMassive } from "@/services/massiveClient";
import { getFromCache, setInCache } from "@/services/redisClient";

// === TYPES ===
export interface BreadthSnapshot {
    advancers: number;          // 상승 종목 수
    decliners: number;          // 하락 종목 수
    unchanged: number;          // 보합 종목 수
    totalTickers: number;       // 전체 종목 수
    breadthPct: number;         // 상승 비율 (0-100)
    adRatio: number;            // A/D Ratio (>1 = 건강)
    volumeBreadth: number;      // 상승 거래량 / 전체 거래량 (0-100)
    breadthScore: number;       // 0-100 정규화 (RLSI용)
    isDivergent: boolean;       // NQ↑ but Breadth<40% → 경고
    signal: 'STRONG' | 'HEALTHY' | 'NEUTRAL' | 'WEAK' | 'CRITICAL';
    timestamp: string;
}

// === CACHE CONFIG ===
const REDIS_KEY = 'guardian:breadth';
const REDIS_TTL = 300;  // 5 minutes
const MEMORY_TTL_MS = 3 * 60 * 1000; // 3 minutes

let memoryCache: { data: BreadthSnapshot | null; expiry: number } = {
    data: null,
    expiry: 0
};

// === MAIN ENGINE ===

/**
 * Get Market Breadth - queries 5000+ US stocks via Massive Snapshot API
 * Uses 3-tier cache: Memory → Redis → Massive API
 */
export async function getMarketBreadth(nasdaqChangePct: number = 0): Promise<BreadthSnapshot> {
    const now = Date.now();

    // 1. Memory Cache
    if (memoryCache.data && memoryCache.expiry > now) {
        // Re-evaluate divergence with latest NQ data
        const cached = { ...memoryCache.data };
        cached.isDivergent = nasdaqChangePct > 0.3 && cached.breadthPct < 40;
        return cached;
    }

    // 2. Redis Cache
    try {
        const redisData = await getFromCache<BreadthSnapshot>(REDIS_KEY);
        if (redisData) {
            console.log(`[Breadth] From Redis: ${redisData.advancers}↑ / ${redisData.decliners}↓`);
            memoryCache = { data: redisData, expiry: now + MEMORY_TTL_MS };
            redisData.isDivergent = nasdaqChangePct > 0.3 && redisData.breadthPct < 40;
            return redisData;
        }
    } catch (e) {
        console.warn('[Breadth] Redis read failed:', e);
    }

    // 3. Fresh Fetch from Massive API
    console.log('[Breadth V7.0] Fetching Full Market Snapshot...');
    return await fetchFreshBreadth(nasdaqChangePct);
}

/**
 * Fetch fresh breadth data from Massive Full Market Snapshot
 * Endpoint: /v2/snapshot/locale/us/markets/stocks/tickers
 */
async function fetchFreshBreadth(nasdaqChangePct: number): Promise<BreadthSnapshot> {
    const defaultSnapshot = createDefaultSnapshot();

    try {
        // Full Market Snapshot — returns 10,000+ tickers in one call
        const data = await fetchMassive(
            '/v2/snapshot/locale/us/markets/stocks/tickers',
            {},
            true  // use cache
        );

        const tickers = data?.tickers;
        if (!tickers || tickers.length === 0) {
            console.warn('[Breadth] Empty snapshot response');
            return defaultSnapshot;
        }

        // Filter: only count tickers with actual trading data
        const activeTickers = tickers.filter((t: any) =>
            t.day && t.day.v > 0 && t.todaysChangePerc !== undefined
        );

        if (activeTickers.length < 100) {
            console.warn(`[Breadth] Too few active tickers: ${activeTickers.length}`);
            return defaultSnapshot;
        }

        // Count Advancers / Decliners
        let advancers = 0;
        let decliners = 0;
        let unchanged = 0;
        let advancerVolume = 0;
        let declinerVolume = 0;
        let totalVolume = 0;

        for (const t of activeTickers) {
            const change = t.todaysChangePerc || 0;
            const volume = t.day?.v || 0;

            totalVolume += volume;

            if (change > 0.01) {
                advancers++;
                advancerVolume += volume;
            } else if (change < -0.01) {
                decliners++;
                declinerVolume += volume;
            } else {
                unchanged++;
            }
        }

        const totalTickers = activeTickers.length;
        const breadthPct = totalTickers > 0 ? (advancers / totalTickers) * 100 : 50;
        const adRatio = decliners > 0 ? advancers / decliners : advancers > 0 ? 10 : 1;
        const volumeBreadth = totalVolume > 0 ? (advancerVolume / totalVolume) * 100 : 50;

        // Breadth Score: 0-100 normalized
        // Combines A/D ratio and volume breadth
        const adComponent = Math.min(100, Math.max(0, (adRatio / 3) * 100)); // 3:1 = 100
        const volComponent = volumeBreadth;
        const breadthScore = Math.round(adComponent * 0.6 + volComponent * 0.4);

        // Signal Classification
        let signal: BreadthSnapshot['signal'] = 'NEUTRAL';
        if (breadthPct >= 65 && volumeBreadth >= 60) signal = 'STRONG';
        else if (breadthPct >= 55) signal = 'HEALTHY';
        else if (breadthPct <= 30) signal = 'CRITICAL';
        else if (breadthPct <= 40) signal = 'WEAK';

        // Divergence: Index UP but breadth is weak
        const isDivergent = nasdaqChangePct > 0.3 && breadthPct < 40;

        const snapshot: BreadthSnapshot = {
            advancers,
            decliners,
            unchanged,
            totalTickers,
            breadthPct: Math.round(breadthPct * 10) / 10,
            adRatio: Math.round(adRatio * 100) / 100,
            volumeBreadth: Math.round(volumeBreadth * 10) / 10,
            breadthScore: Math.min(100, Math.max(0, breadthScore)),
            isDivergent,
            signal,
            timestamp: new Date().toISOString()
        };

        // Store in caches
        memoryCache = { data: snapshot, expiry: Date.now() + MEMORY_TTL_MS };
        setInCache(REDIS_KEY, snapshot, REDIS_TTL).catch(() => { });

        console.log(`[Breadth V7.0] Complete: ${advancers}↑ ${decliners}↓ | Pct=${breadthPct.toFixed(1)}% | A/D=${adRatio.toFixed(2)} | VolBreadth=${volumeBreadth.toFixed(1)}% | Signal=${signal}`);
        return snapshot;

    } catch (error: any) {
        console.error('[Breadth] Massive API Error:', error?.message);
        return defaultSnapshot;
    }
}

function createDefaultSnapshot(): BreadthSnapshot {
    return {
        advancers: 0,
        decliners: 0,
        unchanged: 0,
        totalTickers: 0,
        breadthPct: 50,
        adRatio: 1,
        volumeBreadth: 50,
        breadthScore: 50,
        isDivergent: false,
        signal: 'NEUTRAL',
        timestamp: new Date().toISOString()
    };
}
