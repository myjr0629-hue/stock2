import React, { Suspense } from 'react';
import WatchlistClientPage from './WatchlistClientPage';
import { getWatchlistServer } from '@/lib/storage/watchlistStoreServer';
import { processWatchlistBatch } from '@/services/watchlistBatchService';
import WatchlistLoading from './loading';

// Fetch FULL watchlist data to completely eliminate progressive loading layout shifts (no dashes `-`)
async function getInitialFullData(tickers: string[]) {
    if (!tickers || tickers.length === 0) return [];
    try {
        // Construct a direct function call to leverage the existing internal API logic safely during SSR
        // [PERF] SSR Hybrid Cache Mode: 
        // 1. Instantly return ALL FULL DATA for previously cached tickers
        // 2. Instantly fallback to Price-Only (0.2s) for NEW uncached tickers (to prevent 60s freeze)
        const payload = await processWatchlistBatch(tickers, 'ssr');
        return payload.results || [];
    } catch (e) {
        console.error('[Watchlist SSR] Failed to fetch initial full data:', e);
    }
    return [];
}

// Ensure the page is dynamically rendered to handle cookies on every request securely
export const dynamic = 'force-dynamic';

// [PERF] Async data loader — rendered inside <Suspense> so the shell streams instantly
async function WatchlistDataLoader({ locale }: { locale: string }) {
    // 1. Fetch user's personalized watchlist securely via SSR cookies
    const watchlistData = await getWatchlistServer();

    // 2. Extract tickers
    const tickers = watchlistData.items.map(item => item.ticker);

    // 3. Fetch COMPLETE advanced data instantly during SSR (Alpha, Flow, Options, Whale, etc.)
    let initialFullData: any[] = [];
    if (tickers.length > 0) {
        initialFullData = await getInitialFullData(tickers);
    }

    // 4. Inject into the client wrapper with full SSR data
    return (
        <WatchlistClientPage
            locale={locale}
            initialWatchlist={watchlistData.items}
            initialFullData={initialFullData}
        />
    );
}

export default async function WatchlistPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;

    // [PERF] Suspense Streaming: page shell (nav, layout) renders instantly,
    // data-dependent content streams in as it becomes ready.
    // loading.tsx skeleton is used as fallback during data fetch.
    return (
        <Suspense fallback={<WatchlistLoading />}>
            <WatchlistDataLoader locale={locale} />
        </Suspense>
    );
}
