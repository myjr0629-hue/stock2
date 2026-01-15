// Watchlist LocalStorage Store
// Simple ticker list without quantity/price (unlike Portfolio)

export interface WatchlistItem {
    ticker: string;
    name: string;
    addedAt: string;
}

export interface WatchlistData {
    items: WatchlistItem[];
    updatedAt: string;
}

const STORAGE_KEY = 'alpha_watchlist_v1';

// Get watchlist from LocalStorage
export function getWatchlist(): WatchlistData {
    if (typeof window === 'undefined') {
        return { items: [], updatedAt: new Date().toISOString() };
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load watchlist:', e);
    }

    return { items: [], updatedAt: new Date().toISOString() };
}

// Save watchlist to LocalStorage
export function saveWatchlist(data: WatchlistData): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...data,
            updatedAt: new Date().toISOString()
        }));
    } catch (e) {
        console.error('Failed to save watchlist:', e);
    }
}

// Add a ticker to watchlist
export function addToWatchlist(ticker: string, name: string): WatchlistData {
    const current = getWatchlist();

    // Check if ticker already exists
    if (current.items.some(item => item.ticker === ticker)) {
        return current; // Already in watchlist
    }

    current.items.push({
        ticker: ticker.toUpperCase(),
        name,
        addedAt: new Date().toISOString()
    });

    saveWatchlist(current);
    return current;
}

// Remove a ticker from watchlist
export function removeFromWatchlist(ticker: string): WatchlistData {
    const current = getWatchlist();
    current.items = current.items.filter(item => item.ticker !== ticker);
    saveWatchlist(current);
    return current;
}

// Check if ticker is in watchlist
export function isInWatchlist(ticker: string): boolean {
    const current = getWatchlist();
    return current.items.some(item => item.ticker === ticker);
}

// Clear all items
export function clearWatchlist(): WatchlistData {
    const empty: WatchlistData = { items: [], updatedAt: new Date().toISOString() };
    saveWatchlist(empty);
    return empty;
}

// Demo data for development
export function loadDemoWatchlist(): WatchlistData {
    const demo: WatchlistData = {
        items: [
            { ticker: 'NVDA', name: 'NVIDIA Corp', addedAt: '2024-01-15T00:00:00Z' },
            { ticker: 'TSLA', name: 'Tesla Inc', addedAt: '2024-01-16T00:00:00Z' },
            { ticker: 'AAPL', name: 'Apple Inc', addedAt: '2024-01-17T00:00:00Z' },
            { ticker: 'AMD', name: 'Advanced Micro Devices', addedAt: '2024-01-18T00:00:00Z' },
            { ticker: 'META', name: 'Meta Platforms', addedAt: '2024-01-19T00:00:00Z' },
        ],
        updatedAt: new Date().toISOString()
    };
    saveWatchlist(demo);
    return demo;
}
