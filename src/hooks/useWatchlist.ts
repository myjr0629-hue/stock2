'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import {
    getWatchlist,
    addToWatchlist as storeAdd,
    removeFromWatchlist as storeRemove,
    type WatchlistItem,
    type WatchlistData
} from '@/lib/storage/watchlistStore';

export interface EnrichedWatchlistItem extends WatchlistItem {
    currentPrice: number;
    changePct: number;
    session?: 'pre' | 'reg' | 'post';
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

export function useWatchlist() {
    // Local watchlist from localStorage
    const [watchlistData, setWatchlistData] = useState<WatchlistData>(() => getWatchlist());

    const tickerString = watchlistData.items.map(i => i.ticker).join(',');

    // SWR: Full data with 30s auto-refresh (Alpha, Whale, GEX, etc.)
    const { data, error, isLoading, isValidating, mutate } = useSWR(
        tickerString ? `/api/watchlist/batch?tickers=${tickerString}` : null,
        fetcher,
        {
            refreshInterval: 30000,
            revalidateOnFocus: false,
            dedupingInterval: 5000,
        }
    );

    // SWR: Price-only with 10s auto-refresh (lightweight)
    const { data: priceData } = useSWR(
        tickerString ? `/api/live/quotes?symbols=${tickerString}` : null,
        fetcher,
        {
            refreshInterval: 10000,
            revalidateOnFocus: false,
            dedupingInterval: 3000,
        }
    );

    // Enrich watchlist items with API data + fast price overlay
    const items = useMemo<EnrichedWatchlistItem[]>(() => {
        if (watchlistData.items.length === 0) return [];

        const apiResults: Record<string, any> = {};
        if (data?.results) {
            data.results.forEach((result: any) => {
                if (result && !result.error) {
                    apiResults[result.ticker] = result;
                }
            });
        }

        // Fast price data (10s polling)
        const priceMap: Record<string, { price: number; changePct: number }> = {};
        if (priceData?.data) {
            Object.entries(priceData.data).forEach(([ticker, d]: [string, any]) => {
                if (d && d.price > 0) {
                    priceMap[ticker] = { price: d.price, changePct: d.changePercent || 0 };
                }
            });
        }

        return watchlistData.items.map((item) => {
            const apiData = apiResults[item.ticker];
            const fastPrice = priceMap[item.ticker];
            if (apiData?.alphaSnapshot && apiData?.realtime) {
                return {
                    ...item,
                    // Use 10s fast price if available, otherwise 30s batch
                    currentPrice: fastPrice?.price ?? apiData.realtime.price ?? 0,
                    changePct: fastPrice?.changePct ?? apiData.realtime.changePct ?? 0,
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
                return { ...item, currentPrice: fastPrice.price, changePct: fastPrice.changePct };
            }
            return { ...item, currentPrice: 0, changePct: 0 };
        });
    }, [data, priceData, watchlistData]);

    const addItem = useCallback(async (ticker: string, name: string) => {
        storeAdd(ticker, name);
        setWatchlistData(getWatchlist());
        mutate();
    }, [mutate]);

    const removeItem = useCallback((ticker: string) => {
        storeRemove(ticker);
        setWatchlistData(getWatchlist());
        mutate();
    }, [mutate]);

    const refresh = useCallback(() => {
        mutate();
    }, [mutate]);

    return {
        items,
        loading: isLoading,
        isRefreshing: isValidating && !isLoading,
        error: error?.message || null,
        addItem,
        removeItem,
        refresh,
        itemCount: items.length,
    };
}
