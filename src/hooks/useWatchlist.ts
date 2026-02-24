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

export function useWatchlist(initialWatchlist?: WatchlistItem[], initialQuotesData?: any) {
    // Server-side watchlist from Supabase
    const [watchlistData, setWatchlistData] = useState<WatchlistData>({
        items: initialWatchlist || [],
        updatedAt: new Date().toISOString()
    });
    const [storeLoading, setStoreLoading] = useState(!initialWatchlist);

    // Load watchlist from Supabase on mount only if there is no initial watch list
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

    // SWR: Full data with 30s auto-refresh (Alpha, Whale, GEX, etc.)
    const { data: fullData, error, isLoading: fullLoading, isValidating: fullValidating, mutate } = useSWR(
        tickerString ? `/api/watchlist/batch?tickers=${tickerString}` : null,
        fetcher,
        {
            fallbackData: initialWatchlist && initialWatchlist.length > 0 ? { results: initialWatchlist } : undefined,
            refreshInterval: 30000,
            revalidateOnFocus: false,
            dedupingInterval: 5000,
        }
    );

    // SWR: Price-only with 10s auto-refresh (lightweight)
    const { data: priceData, isLoading: priceLoading } = useSWR(
        tickerString ? `/api/live/quotes?symbols=${tickerString}` : null,
        fetcher,
        {
            fallbackData: initialQuotesData && Object.keys(initialQuotesData).length > 0 ? { data: initialQuotesData } : undefined,
            refreshInterval: 10000,
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
                    // Total change from prevClose to current display price
                    const totalChangePct = hasExtended && prevClose > 0
                        ? ((d.extendedPrice - prevClose) / prevClose) * 100
                        : regChangePct;

                    priceMap[ticker] = {
                        price: displayPrice,
                        changePct: totalChangePct,
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
                    // Use 10s fast price if available, otherwise 30s batch
                    currentPrice: fastPrice?.price ?? apiData.realtime.price ?? 0,
                    changePct: fastPrice?.changePct ?? apiData.realtime.changePct ?? 0,
                    // [FIX] regChangePct = 직전 정규장 등락률 (PRE/POST에서 sparkline으로 계산)
                    regChangePct: (() => {
                        // 1. Fast price provides regChangePct (from quotes API)
                        const fpReg = fastPrice?.regChangePct;
                        if (fpReg !== undefined && fpReg !== 0) return fpReg;
                        // 2. Batch API provides changePct
                        const batchReg = apiData.realtime.changePct;
                        if (batchReg !== undefined && batchReg !== 0) return batchReg;
                        // 3. Fallback: calculate from sparkline (last 2 closes = yesterday vs day before)
                        const sparkline = apiData.realtime.sparkline;
                        if (sparkline && sparkline.length >= 2) {
                            const lastClose = sparkline[sparkline.length - 1];
                            const prevClose2 = sparkline[sparkline.length - 2];
                            if (prevClose2 > 0 && lastClose > 0) {
                                return ((lastClose - prevClose2) / prevClose2) * 100;
                            }
                        }
                        return 0;
                    })(),
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
