
"use client";

import { useState, useEffect, useCallback } from 'react';
import {
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
} from '@/lib/storage/watchlistStore';

/**
 * useFavorites — backed by Supabase watchlist (server-persisted)
 * This unifies the heart toggle with the main Watchlist page.
 */
export function useFavorites() {
    const [favorites, setFavorites] = useState<string[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Sync state from watchlistStore (async)
    const syncFromStore = useCallback(async () => {
        const data = await getWatchlist();
        setFavorites(data.items.map(item => item.ticker));
    }, []);

    useEffect(() => {
        syncFromStore().then(() => setIsLoaded(true));
    }, [syncFromStore]);

    const toggleFavorite = useCallback(async (ticker: string, name?: string) => {
        const upperTicker = ticker.toUpperCase();
        const inList = await isInWatchlist(upperTicker);
        if (inList) {
            await removeFromWatchlist(upperTicker);
        } else {
            await addToWatchlist(upperTicker, name || upperTicker);
        }
        await syncFromStore();
    }, [syncFromStore]);

    const isFavorite = useCallback(async (ticker: string) => {
        return isInWatchlist(ticker.toUpperCase());
    }, []);

    return { favorites, toggleFavorite, isFavorite, isLoaded };
}
