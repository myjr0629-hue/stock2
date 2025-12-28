
"use client";

import { useState, useEffect } from 'react';

export function useFavorites() {
    const [favorites, setFavorites] = useState<string[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // Load from localStorage on mount
        const stored = localStorage.getItem('gems_favorites');
        if (stored) {
            try {
                setFavorites(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse favorites", e);
            }
        }
        setIsLoaded(true);
    }, []);

    const toggleFavorite = (ticker: string) => {
        const upperTicker = ticker.toUpperCase();
        const newFavorites = favorites.includes(upperTicker)
            ? favorites.filter(t => t !== upperTicker)
            : [...favorites, upperTicker];

        setFavorites(newFavorites);
        localStorage.setItem('gems_favorites', JSON.stringify(newFavorites));
    };

    const isFavorite = (ticker: string) => favorites.includes(ticker.toUpperCase());

    return { favorites, toggleFavorite, isFavorite, isLoaded };
}
