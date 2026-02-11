
"use client";

import { useState, useEffect, useCallback } from 'react';
import {
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
} from '@/lib/storage/watchlistStore';

/**
 * useFavorites — now backed by watchlistStore (alpha_watchlist_v1)
 * This unifies the heart toggle with the main Watchlist page.
 */
export function useFavorites() {
    const [favorites, setFavorites] = useState<string[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Sync state from watchlistStore
    const syncFromStore = useCallback(() => {
        const data = getWatchlist();
        setFavorites(data.items.map(item => item.ticker));
    }, []);

    useEffect(() => {
        syncFromStore();
        setIsLoaded(true);

        // Listen for cross-tab / cross-component storage events
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'alpha_watchlist_v1') {
                syncFromStore();
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [syncFromStore]);

    const toggleFavorite = useCallback((ticker: string, name?: string) => {
        const upperTicker = ticker.toUpperCase();
        if (isInWatchlist(upperTicker)) {
            removeFromWatchlist(upperTicker);
        } else {
            addToWatchlist(upperTicker, name || upperTicker);
        }
        syncFromStore();
    }, [syncFromStore]);

    const isFavorite = useCallback((ticker: string) => {
        return isInWatchlist(ticker.toUpperCase());
    }, [favorites]); // eslint-disable-line react-hooks/exhaustive-deps

    return { favorites, toggleFavorite, isFavorite, isLoaded };
}
