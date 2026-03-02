'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import {
    getWatchlist,
    addToWatchlist as storeAdd,
    removeFromWatchlist as storeRemove,
    type WatchlistItem,
    type WatchlistData
} from '@/lib/storage/watchlistStore';
import { useMarketStatus } from './useMarketStatus';

export interface EnrichedWatchlistItem extends WatchlistItem {
    currentPrice: number;
    changePct: number;
    session?: 'pre' | 'reg' | 'post';
    // Session-aware price decomposition
    regChangePct?: number;     // Regular session change % (from prevClose)
    extChangePct?: number;     // Extended hours change % (from reg close)
    extLabel?: 'PRE' | 'POST'; // Extended session label
    // Alpha
    alphaScore?: number;
    alphaGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
    action?: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH';
    confidence?: number;
    triggers?: string[];
    // Premium Indicators
    whaleIndex?: number;
    whaleConfidence?: 'HIGH' | 'MED' | 'LOW' | 'NONE';
    rsi?: number;
    return3d?: number;
    maxPain?: number;
    maxPainDist?: number;
    gexM?: number;
    sparkline?: number[];
    gammaFlipLevel?: number;
    iv?: number;
    vwapDist?: number;
}

const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error('Failed to fetch watchlist data');
    return res.json();
});

export function useWatchlist(initialWatchlist?: WatchlistItem[], initialFullData?: any[]) {
    // Server-side watchlist from Supabase
    const [watchlistData, setWatchlistData] = useState<WatchlistData>({
        items: initialWatchlist || [],
        updatedAt: new Date().toISOString()
    });
    const [storeLoading, setStoreLoading] = useState(!initialWatchlist);

    // Initial load from Supabase if not hydrated via props
    useEffect(() => {
        if (!initialWatchlist) {
            loadWatchlist();
        }
    }, [initialWatchlist]);

    const loadWatchlist = async () => {
        setStoreLoading(true);
        try {
            const data = await getWatchlist();
            setWatchlistData(data);
        } catch (e) {
            console.error('Failed to load watchlist:', e);
        } finally {
            setStoreLoading(false);
        }
    };

    const tickerString = watchlistData.items.map(i => i.ticker).join(',');

    // [PERF] Stop polling when market is closed (weekends, nights)
    const { status: marketStatus } = useMarketStatus();
    const isClosed = marketStatus.session === 'closed';

    // SWR: Full data with 30s auto-refresh (Alpha, Whale, GEX, etc.)
    const { data: fullData, error, isLoading: fullLoading, isValidating: fullValidating, mutate } = useSWR(
        tickerString ? `/api/watchlist/batch?tickers=${tickerString}` : null,
        fetcher,
        {
            fallbackData: initialFullData && initialFullData.length > 0 ? { results: initialFullData } : undefined,
            refreshInterval: isClosed ? 0 : 30000,
            revalidateOnFocus: false,
            dedupingInterval: 5000,
        }
    );

    // SWR: Price-only with 10s auto-refresh (lightweight)
    const { data: priceData, isLoading: priceLoading } = useSWR(
        tickerString ? `/api/live/quotes?symbols=${tickerString}` : null,
        fetcher,
        {
            // If we have initialFullData, we can map price out of it for standard quotes fallback
            fallbackData: initialFullData && initialFullData.length > 0 ? {
                data: initialFullData.reduce((acc, r) => {
                    acc[r.ticker] = r.realtime;
                    return acc;
                }, {} as Record<string, any>)
            } : undefined,
            refreshInterval: isClosed ? 0 : 2000, // [UX] Near-real-time price feel (disabled when closed)
            revalidateOnFocus: false,
            dedupingInterval: 3000,
        }
    );

    // Enrich watchlist items with API data + fast price overlay
    const items = useMemo<EnrichedWatchlistItem[]>(() => {
        if (watchlistData.items.length === 0) return [];

        const apiResults: Record<string, any> = {};
        if (fullData?.results) {
            fullData.results.forEach((result: any) => {
                if (result && !result.error) {
                    apiResults[result.ticker] = result;
                }
            });
        }

        // Fast price data (10s polling) — session-aware: use extended prices during pre/post market
        interface FastPrice {
            price: number;
            changePct: number;
            regChangePct: number;     // Regular session change
            extChangePct?: number;    // Extended hours change (from reg close)
            extLabel?: 'PRE' | 'POST';
        }
        const priceMap: Record<string, FastPrice> = {};
        if (priceData?.data) {
            Object.entries(priceData.data).forEach(([ticker, d]: [string, any]) => {
                if (d && d.price > 0) {
                    const prevClose = d.previousClose || d.prevClose || 0;
                    const regChangePct = d.changePercent || 0;
                    const hasExtended = d.extendedPrice && d.extendedPrice > 0;

                    // Display price: extended if available, else regular
                    const displayPrice = hasExtended ? d.extendedPrice : d.price;

                    priceMap[ticker] = {
                        price: displayPrice,
                        changePct: regChangePct,
                        regChangePct,
                        extChangePct: hasExtended ? (d.extendedChangePercent || 0) : undefined,
                        extLabel: hasExtended ? (d.extendedLabel || undefined) : undefined,
                    };
                }
            });
        }

        return watchlistData.items.map((item) => {
            const apiData = apiResults[item.ticker];
            const fastPrice = priceMap[item.ticker];
            if (apiData?.alphaSnapshot && apiData?.realtime) {
                return {
                    ...item,
                    // Price: fast poll (2s) for real-time feel, batch (30s) fallback
                    currentPrice: fastPrice?.price ?? apiData.realtime.price ?? 0,
                    // changePct: ALWAYS prefer batch API (correct regular session %) over fast poll
                    // Fast poll's changePct from Polygon todaysChangePerc is combined (prevClose→preMarket) during PRE/POST
                    changePct: apiData.realtime.changePct ?? fastPrice?.regChangePct ?? 0,
                    // regChangePct: batch API is the reliable source (correct regular session %)
                    regChangePct: apiData.realtime.changePct ?? fastPrice?.regChangePct ?? 0,
                    extChangePct: fastPrice?.extChangePct ?? apiData.realtime.extendedChangePct ?? undefined,
                    extLabel: fastPrice?.extLabel ?? (apiData.realtime.extendedLabel as 'PRE' | 'POST' | undefined),
                    session: apiData.realtime.session,
                    alphaScore: apiData.alphaSnapshot.score,
                    alphaGrade: apiData.alphaSnapshot.grade,
                    action: apiData.alphaSnapshot.action,
                    confidence: apiData.alphaSnapshot.confidence,
                    triggers: apiData.alphaSnapshot.triggers,
                    whaleIndex: apiData.realtime.whaleIndex,
                    whaleConfidence: apiData.realtime.whaleConfidence,
                    rsi: apiData.realtime.rsi,
                    return3d: apiData.realtime.return3d,
                    maxPain: apiData.realtime.maxPain,
                    maxPainDist: apiData.realtime.maxPainDist,
                    gexM: apiData.realtime.gexM,
                    sparkline: apiData.realtime.sparkline,
                    gammaFlipLevel: apiData.realtime.gammaFlipLevel,
                    iv: apiData.realtime.iv,
                    vwapDist: apiData.realtime.vwapDist,
                };
            }
            // Even without batch data, show fast price
            if (fastPrice) {
                return {
                    ...item,
                    currentPrice: fastPrice.price,
                    changePct: fastPrice.changePct,
                    regChangePct: fastPrice.regChangePct,
                    extChangePct: fastPrice.extChangePct,
                    extLabel: fastPrice.extLabel,
                };
            }
            return { ...item, currentPrice: 0, changePct: 0 };
        });
    }, [fullData, priceData, watchlistData]);

    const addItem = useCallback(async (ticker: string, name: string) => {
        const updated = await storeAdd(ticker, name);
        setWatchlistData(updated);
        mutate();
    }, [mutate]);

    const removeItem = useCallback(async (ticker: string) => {
        const updated = await storeRemove(ticker);
        setWatchlistData(updated);
        mutate();
    }, [mutate]);

    const refresh = useCallback(() => {
        mutate();
    }, [mutate]);

    return {
        items,
        loading: storeLoading || (fullLoading && items.length === 0),
        isRefreshing: fullValidating && !fullLoading,
        error: error?.message || null,
        addItem,
        removeItem,
        refresh,
        itemCount: items.length,
    };
}
