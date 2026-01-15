'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
    rvol?: number;
    return3d?: number;
    maxPain?: number;
    maxPainDist?: number;
    gexM?: number;
    sparkline?: number[];
}

export function useWatchlist() {
    const [items, setItems] = useState<EnrichedWatchlistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isInitialLoad = useRef(true);

    // Load and enrich watchlist items
    const loadItems = useCallback(async () => {
        try {
            if (isInitialLoad.current) {
                setLoading(true);
            } else {
                setIsRefreshing(true);
            }

            const data = getWatchlist();
            const tickers = data.items.map(item => item.ticker);

            // Fetch analysis for all tickers in parallel
            const analyzePromises = tickers.map(async (ticker) => {
                try {
                    const res = await fetch(`/api/watchlist/analyze?ticker=${ticker}`);
                    if (!res.ok) return null;
                    return await res.json();
                } catch {
                    return null;
                }
            });

            const results = await Promise.all(analyzePromises);

            // Enrich items with API data
            const enriched: EnrichedWatchlistItem[] = data.items.map((item, index) => {
                const apiData = results[index];
                if (apiData && apiData.alphaSnapshot && apiData.realtime) {
                    return {
                        ...item,
                        currentPrice: apiData.realtime.price || 0,
                        changePct: apiData.realtime.changePct || 0,
                        session: apiData.realtime.session,
                        alphaScore: apiData.alphaSnapshot.score,
                        alphaGrade: apiData.alphaSnapshot.grade,
                        action: apiData.alphaSnapshot.action,
                        confidence: apiData.alphaSnapshot.confidence,
                        triggers: apiData.alphaSnapshot.triggers,
                        whaleIndex: apiData.realtime.whaleIndex,
                        whaleConfidence: apiData.realtime.whaleConfidence,
                        rsi: apiData.realtime.rsi,
                        rvol: apiData.realtime.rvol,
                        return3d: apiData.realtime.return3d,
                        maxPain: apiData.realtime.maxPain,
                        maxPainDist: apiData.realtime.maxPainDist,
                        gexM: apiData.realtime.gexM,
                        sparkline: apiData.realtime.sparkline
                    };
                }
                return {
                    ...item,
                    currentPrice: 0,
                    changePct: 0
                };
            });

            setItems(enriched);
            setError(null);
        } catch (e) {
            setError('Failed to load watchlist');
            console.error(e);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
            isInitialLoad.current = false;
        }
    }, []);

    // Add to watchlist
    const addItem = useCallback(async (ticker: string, name: string) => {
        storeAdd(ticker, name);
        await loadItems();
    }, [loadItems]);

    // Remove from watchlist
    const removeItem = useCallback((ticker: string) => {
        storeRemove(ticker);
        loadItems();
    }, [loadItems]);

    // Refresh data
    const refresh = useCallback(() => {
        loadItems();
    }, [loadItems]);

    // Load on mount
    useEffect(() => {
        loadItems();
    }, [loadItems]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (!isInitialLoad.current) {
                loadItems();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [loadItems]);

    return {
        items,
        loading,
        isRefreshing,
        error,
        addItem,
        removeItem,
        refresh,
        itemCount: items.length
    };
}
