'use client';

import { useState, useCallback, useMemo, useEffect, useDeferredValue } from 'react';
import useSWR from 'swr';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import {
    getWatchlist,
    addToWatchlist as storeAdd,
    removeFromWatchlist as storeRemove,
    updateWatchlistCategory as storeUpdateCategory,
    getUserCategories as storeGetCategories,
    addUserCategory as storeAddCategory,
    deleteUserCategory as storeDeleteCategory,
    type WatchlistItem,
    type WatchlistData
} from '@/lib/storage/watchlistStore';
import { useMarketStatus } from './useMarketStatus';

export interface EnrichedWatchlistItem extends WatchlistItem {
    currentPrice: number;
    changePct: number;
    category?: string;
    session?: 'pre' | 'reg' | 'post';
    // Session-aware price decomposition
    regChangePct?: number;     // Regular session change % (from prevClose)
    extChangePct?: number;     // Extended hours change % (from reg close)
    extLabel?: 'PRE' | 'POST'; // Extended session label
    // Alpha
    alphaScore?: number;
    alphaGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
    action?: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH' | 'STRONG_BULLISH' | 'BULLISH' | 'CAUTION' | 'AVOID' | string;
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

    // Initial load from Supabase — always refresh on mount to get category data
    // SSR hydration provides fast initial render, client re-fetch ensures category field
    useEffect(() => {
        loadWatchlist();
    }, []);

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

    // [WS] Subscribe all watchlist tickers to WebSocket price stream
    const tickerArray = useMemo(() => watchlistData.items.map(i => i.ticker), [watchlistData.items]);
    const { connected: wsConnected, getPrice: wsGetPrice, prices: wsPrices } = useRealtimeData(tickerArray.length > 0 ? tickerArray : undefined);

    // SWR: Full data with 30s auto-refresh (Alpha, Whale, GEX, etc.)
    const hasSSRData = !!(initialFullData && initialFullData.length > 0);
    const { data: fullData, error, isLoading: fullLoading, isValidating: fullValidating, mutate } = useSWR(
        tickerString ? `/api/watchlist/batch?tickers=${tickerString}` : null,
        fetcher,
        {
            fallbackData: hasSSRData ? { results: initialFullData } : undefined,
            refreshInterval: isClosed ? 0 : 30000,
            revalidateOnFocus: false,
            // [PERF] Skip mount revalidate when SSR data is fresh AND market is open (refreshInterval will update)
            // When market is closed, always revalidate once on mount because refreshInterval=0 won't trigger
            revalidateOnMount: isClosed || !hasSSRData,
            keepPreviousData: true,  // [PERF] Keep stale data visible during revalidation (no blank flash)
            dedupingInterval: 5000,
            onErrorRetry: (err, key, config, revalidate, { retryCount }) => {
                if (retryCount >= 3) return; // Max 3 retries
                setTimeout(() => revalidate({ retryCount }), Math.min(1000 * 2 ** retryCount, 10000));
            },
        }
    );

    // SWR: Price-only polling (reduced when WS active)
    const { data: priceData, isLoading: priceLoading } = useSWR(
        tickerString ? `/api/live/quotes?symbols=${tickerString}` : null,
        fetcher,
        {
            // If we have initialFullData, we can map price out of it for standard quotes fallback
            fallbackData: hasSSRData ? {
                data: initialFullData!.reduce((acc, r) => {
                    acc[r.ticker] = r.realtime;
                    return acc;
                }, {} as Record<string, any>)
            } : undefined,
            // [WS] Keep fast polling even with WS — ensures changePct stays fresh
            refreshInterval: isClosed ? 0 : 5000,
            revalidateOnFocus: false,
            keepPreviousData: true,  // [PERF] Keep stale prices visible during revalidation
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
                    const regChangePct = d.changePercent || 0;
                    const hasExtended = d.extendedPrice && d.extendedPrice > 0;

                    // ★ 메인 가격은 항상 본장 가격 (d.price), extended는 별도 필드로
                    const displayPrice = d.price;

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
            // [WS] WebSocket real-time price overlay (highest priority)
            const wsPrice = wsConnected ? wsGetPrice(item.ticker) : undefined;
            if (apiData?.alphaSnapshot && apiData?.realtime) {
                return {
                    ...item,
                    // ★ currentPrice: 항상 본장 가격 — batch API가 정확한 소스
                    // WS는 장중에만 유효, PRE/POST에는 batch의 본장 가격 우선
                    currentPrice: apiData.realtime.price || (fastPrice?.price ?? 0),
                    // ★ changePct: batch API 우선 (정확한 본장 등락)
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
    }, [fullData, priceData, watchlistData, wsPrices, wsConnected]);

    // [PERF] Defer non-critical UI updates — price ticks won't block main thread rendering
    const deferredItems = useDeferredValue(items);

    const addItem = useCallback(async (ticker: string, name: string, category?: string) => {
        const updated = await storeAdd(ticker, name, category || 'default');
        setWatchlistData(updated);
        mutate();
    }, [mutate]);

    const removeItem = useCallback(async (ticker: string) => {
        const updated = await storeRemove(ticker);
        setWatchlistData(updated);
        mutate();
    }, [mutate]);

    const updateItemCategory = useCallback(async (ticker: string, category: string) => {
        const updated = await storeUpdateCategory(ticker, category);
        setWatchlistData(updated);
        mutate();
    }, [mutate]);

    // ── Supabase-backed category management ──
    const [customCategories, setCustomCategories] = useState<string[]>([]);

    // Fetch categories on mount
    useEffect(() => {
        storeGetCategories().then(setCustomCategories);
    }, []);

    const addCategory = useCallback(async (name: string) => {
        const updated = await storeAddCategory(name);
        setCustomCategories(updated);
        return updated;
    }, []);

    const deleteCategory = useCallback(async (name: string) => {
        // Move all items in this category to default first
        const itemsInCat = items.filter(i => i.category === name);
        for (const item of itemsInCat) {
            await storeUpdateCategory(item.ticker, 'default');
        }
        const updated = await storeDeleteCategory(name);
        setCustomCategories(updated);
        mutate(); // Refresh items since categories changed
        return updated;
    }, [items, mutate]);

    const getCategories = useCallback(() => {
        const cats = new Set<string>();
        items.forEach(item => {
            if (item.category && item.category !== 'default') {
                cats.add(item.category);
            }
        });
        customCategories.forEach(c => cats.add(c));
        return ['default', ...Array.from(cats).sort()];
    }, [items, customCategories]);


    const refresh = useCallback(() => {
        mutate();
    }, [mutate]);

    return {
        items: deferredItems,
        rawItems: items,
        loading: storeLoading || (fullLoading && items.length === 0),
        isRefreshing: fullValidating && !fullLoading,
        error: error?.message || null,
        addItem,
        removeItem,
        updateItemCategory,
        getCategories,
        addCategory,
        deleteCategory,
        customCategories,
        refresh,
        itemCount: items.length,
    };
}
