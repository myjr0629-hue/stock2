import React from 'react';
import WatchlistClientPage from './WatchlistClientPage';
import { getWatchlistServer } from '@/lib/storage/watchlistStoreServer';
import { GET as getLiveQuotes } from '@/app/api/live/quotes/route';

// Fetch baseline real-time quotes directly via internal route handler
async function getInitialQuotes(tickers: string[]) {
    if (!tickers || tickers.length === 0) return {};
    try {
        // Construct a dummy request to leverage the existing internal API logic
        // We use localhost as a placeholder purely for URL parsing of searchParams
        const url = `http://localhost/api/live/quotes?symbols=${tickers.join(',')}`;
        const req = new Request(url);

        const res = await getLiveQuotes(req);
        if (res.ok) {
            const json = await res.json();
            return json.data || {};
        }
        console.warn('[Watchlist SSR] Quotes internal fetch returned !ok status:', res.status);
    } catch (e) {
        console.error('[Watchlist SSR] Failed to fetch initial quotes:', e);
    }
    return {};
}

// Ensure the page is dynamically rendered to handle cookies on every request securely
export const dynamic = 'force-dynamic';

export default async function WatchlistPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;

    // 1. Fetch user's personalized watchlist securely via SSR cookies
    const watchlistData = await getWatchlistServer();

    // 2. Extract tickers
    const tickers = watchlistData.items.map(item => item.ticker);

    // 3. Fetch fast prices for these tickers instantly without a network waterfall
    let initialQuotesData = {};
    if (tickers.length > 0) {
        initialQuotesData = await getInitialQuotes(tickers);
    }

    // 4. Inject into the client wrapper to eliminate the 2s loading skeleton
    return (
        <WatchlistClientPage
            locale={locale}
            initialWatchlist={watchlistData.items}
            initialQuotesData={initialQuotesData}
        />
    );
}
