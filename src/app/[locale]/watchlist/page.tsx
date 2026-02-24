import React from 'react';
import WatchlistClientPage from './WatchlistClientPage';
import { getWatchlistServer } from '@/lib/storage/watchlistStoreServer';
import { GET as getWatchlistBatch } from '@/app/api/watchlist/batch/route';

// Fetch FULL watchlist data to completely eliminate progressive loading layout shifts (no dashes `-`)
async function getInitialFullData(tickers: string[]) {
    if (!tickers || tickers.length === 0) return [];
    try {
        // Construct a dummy request to leverage the existing internal API logic
        // This calculates Alpha, Whale, maxPain, flow, etc., for all tickers in parallel
        const url = `http://localhost/api/watchlist/batch?tickers=${tickers.join(',')}`;
        const req = new Request(url);

        const res = await getWatchlistBatch(req);
        if (res.ok) {
            const json = await res.json();
            return json.results || [];
        }
        console.warn('[Watchlist SSR] Batch internal fetch returned !ok status:', res.status);
    } catch (e) {
        console.error('[Watchlist SSR] Failed to fetch initial full data:', e);
    }
    return [];
}

// Ensure the page is dynamically rendered to handle cookies on every request securely
export const dynamic = 'force-dynamic';

export default async function WatchlistPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;

    // 1. Fetch user's personalized watchlist securely via SSR cookies
    const watchlistData = await getWatchlistServer();

    // 2. Extract tickers
    const tickers = watchlistData.items.map(item => item.ticker);

    // 3. Fetch COMPLETE advanced data instantly during SSR (Alpha, Flow, Options, Whale, etc.)
    let initialFullData: any[] = [];
    if (tickers.length > 0) {
        initialFullData = await getInitialFullData(tickers);
    }

    // 4. Inject into the client wrapper to eliminate the 2s loading skeleton AND progressive dashes
    return (
        <WatchlistClientPage
            locale={locale}
            initialWatchlist={watchlistData.items}
            initialFullData={initialFullData}
        />
    );
}
