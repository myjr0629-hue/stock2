// ============================================================================
// /api/intel/fast — 경량 배치 Intel API
// [PERF] Polygon snapshot batch (1 call for all tickers) + Redis cache
// Target: ~1-2초 (vs 기존 15-20초)
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';
import { getFromCache } from '@/services/redisClient';
import { CentralDataHub } from '@/services/centralDataHub';

// Sector ticker maps
const SECTOR_TICKERS: Record<string, string[]> = {
    m7: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'],
    physical_ai: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'],
};

// Redis key matching /api/live/ticker format
function tickerCacheKey(ticker: string): string {
    return `flow:ticker:${ticker}`;
}

export const revalidate = 15; // 15-second edge cache

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector');

    if (!sector || !SECTOR_TICKERS[sector]) {
        return NextResponse.json(
            { error: 'Invalid sector', valid: Object.keys(SECTOR_TICKERS) },
            { status: 400 }
        );
    }

    const startTime = Date.now();
    const tickers = SECTOR_TICKERS[sector];

    try {
        // ── Phase 1: Parallel fetch — Polygon batch + Redis cache ──
        const [snapshotData, marketStatus, ...interleaved] = await Promise.all([
            // 1. Polygon batch snapshot — single API call for all tickers (~500ms)
            fetchMassive(
                `/v2/snapshot/locale/us/markets/stocks/tickers`,
                { tickers: tickers.join(',') },
                false, undefined, CACHE_POLICY.LIVE
            ).catch(() => null),

            // 2. Market status for session detection
            CentralDataHub.getMarketStatus().catch(() => ({ session: 'closed' })),

            // 3. Redis cached data + persistent extended prices (interleaved)
            ...tickers.flatMap(t => [
                getFromCache<any>(tickerCacheKey(t)).catch(() => null),
                getFromCache<any>(`flow:extended:${t}`).catch(() => null)
            ])
        ]);

        // De-interleave: [cached0, ext0, cached1, ext1, ...] → separate arrays
        const cachedTickers = tickers.map((_, i) => interleaved[i * 2]);
        const extendedCache = tickers.map((_, i) => interleaved[i * 2 + 1]);

        // Build snapshot lookup map
        const snapshotMap: Record<string, any> = {};
        (snapshotData?.tickers || []).forEach((t: any) => {
            snapshotMap[t.ticker] = t;
        });

        // Determine session
        const sRaw = (marketStatus as any)?.session || 'closed';
        const session = sRaw === 'pre' ? 'PRE' :
            sRaw === 'regular' ? 'REG' :
                sRaw === 'post' ? 'POST' : 'CLOSED';

        // [FIX] During PRE session, fetch daily aggregates to calculate real regular session change
        // Polygon snapshot's day.c === prevDay.c during PRE, making direct calculation impossible.
        // Use historicalResults (like live/ticker API does) for accurate regular session change.
        let aggMap: Record<string, { prevClose: number, prevPrevClose: number }> = {};
        if (session === 'PRE') {
            const aggResults = await Promise.all(
                tickers.map(t =>
                    fetchMassive(
                        `/v2/aggs/ticker/${t}/range/1/day/${new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)}/${new Date().toISOString().slice(0, 10)}`,
                        { adjusted: 'true', sort: 'desc', limit: '3' },
                        false, undefined, CACHE_POLICY.LIVE
                    ).catch(() => null)
                )
            );
            aggResults.forEach((agg, i) => {
                const results = agg?.results || [];
                if (results.length >= 2) {
                    aggMap[tickers[i]] = {
                        prevClose: results[0].c || 0,
                        prevPrevClose: results[1].c || 0,
                    };
                }
            });
        }

        // ── Phase 2: Build unified quotes ──
        const quotes = tickers.map((ticker, i) => {
            const snap = snapshotMap[ticker];
            const cached = cachedTickers[i];

            // --- Price data from Polygon snapshot ---
            const prevClose = snap?.prevDay?.c || 0;
            const todayClose = snap?.day?.c || prevClose;
            const latestPrice = snap?.lastTrade?.p || snap?.min?.c || todayClose || prevClose;
            const todaysChangePerc = snap?.todaysChangePerc || 0;
            const volume = snap?.day?.v || 0;

            // Session-aware pricing
            let displayPrice = latestPrice;
            let displayChangePct = todaysChangePerc;

            if (session === 'POST' || session === 'CLOSED') {
                const regularClose = todayClose;
                if (regularClose > 0 && prevClose > 0) {
                    displayPrice = regularClose;
                    displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
                }
            }

            if (session === 'PRE') {
                displayPrice = prevClose;
                // [FIX] Use daily aggregates for accurate regular session change
                // Priority: 1) daily aggs, 2) snapshot day.c diff, 3) cached prevChangePct, 4) 0
                const agg = aggMap[ticker];
                if (agg && agg.prevClose > 0 && agg.prevPrevClose > 0) {
                    // Use historical aggregates: yesterday's close vs day-before-yesterday's close
                    displayChangePct = ((agg.prevClose - agg.prevPrevClose) / agg.prevPrevClose) * 100;
                } else if (todayClose > 0 && prevClose > 0 && todayClose !== prevClose) {
                    displayChangePct = ((todayClose - prevClose) / prevClose) * 100;
                } else if (cached?.prices?.prevChangePct) {
                    displayChangePct = cached.prices.prevChangePct;
                } else {
                    displayChangePct = 0;
                }
            }

            // Extended hours — uses persistent Redis key (flow:extended:{ticker})
            // This key only gets written when pre/post prices are valid (never overwritten with null)
            let extendedPrice = 0;
            let extendedChangePct = 0;
            let extendedLabel = '';
            const persistedExt = extendedCache[i]; // from flow:extended:{ticker} (24h TTL)

            if (session === 'PRE') {
                extendedPrice = latestPrice;
                extendedLabel = 'PRE';
                if (prevClose > 0) {
                    extendedChangePct = ((latestPrice - prevClose) / prevClose) * 100;
                }
            } else if (session === 'POST' || session === 'CLOSED') {
                // Post-market: Polygon afterHours → lastTrade → persistent cache → ticker cache
                const postExt = snap?.afterHours?.p || latestPrice || persistedExt?.postPrice || 0;
                if (postExt > 0 && displayPrice > 0) {
                    extendedPrice = postExt;
                    extendedLabel = 'POST';
                    extendedChangePct = persistedExt?.postChangePct || ((extendedPrice - displayPrice) / displayPrice) * 100;
                }
            } else if (session === 'REG') {
                // During REG: show pre-market close from persistent cache
                const cachedPrePrice = persistedExt?.prePrice || 0;
                if (cachedPrePrice > 0) {
                    extendedPrice = cachedPrePrice;
                    extendedLabel = 'PRE';
                    extendedChangePct = persistedExt?.preChangePct || 0;
                }
            }

            // --- Options/Alpha data from Redis cache (instant if available) ---
            let alphaScore = 0;
            let grade = '-';
            let maxPain = 0;
            let callWall = 0;
            let putFloor = 0;
            let gex = 0;
            let pcr = 1;
            let gammaRegime = 'NEUTRAL';
            let sparkline: number[] = [];
            let netPremium = 0;
            let rsi = 0;
            let rvol = 0;

            if (cached) {
                // Full cached data from /api/live/ticker
                alphaScore = cached.alpha?.score || 0;
                grade = cached.alpha?.grade || '-';
                maxPain = cached.flow?.maxPain || 0;
                callWall = cached.flow?.callWall || 0;
                putFloor = cached.flow?.putFloor || 0;
                gex = cached.flow?.netGex || 0;
                pcr = cached.flow?.oiPcr || cached.flow?.volumePcr || 1;
                netPremium = cached.flow?.netPremium || 0;
                rsi = cached.realtime?.rsi || 0;
                rvol = cached.realtime?.relVol || 0;

                if (gex > 0) gammaRegime = 'LONG';
                else if (gex < 0) gammaRegime = 'SHORT';

                // Sparkline from cached sparkline or flow data
                if (cached.flow?.sparkline) {
                    sparkline = cached.flow.sparkline;
                }
            }

            return {
                ticker,
                price: displayPrice,
                changePct: displayChangePct,
                prevClose,
                volume,
                extendedPrice,
                extendedChangePct,
                extendedLabel,
                session,
                alphaScore,
                grade,
                maxPain,
                callWall,
                putFloor,
                gex,
                pcr,
                gammaRegime,
                sparkline,
                netPremium,
                rsi,
                rvol,
            };
        });

        // Sort by changePct descending
        quotes.sort((a, b) => b.changePct - a.changePct);

        const elapsed = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            data: quotes,
            meta: {
                tickers,
                count: quotes.length,
                elapsedMs: elapsed,
                cachedFor: '15s',
                dataSource: 'polygon_batch+redis',
                cacheHits: cachedTickers.filter(Boolean).length,
                cacheMisses: cachedTickers.filter(c => !c).length,
            }
        });

    } catch (error: any) {
        console.error('[/api/intel/fast] Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch sector data',
            data: []
        }, { status: 500 });
    }
}
