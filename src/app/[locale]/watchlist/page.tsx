import React, { Suspense } from 'react';
import { headers } from 'next/headers';
import WatchlistClientPage from './WatchlistClientPage';
import MobileWatchlistPage from './MobileWatchlistPage';
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
async function WatchlistDataLoader({ locale, isMobile }: { locale: string; isMobile: boolean }) {
    // [PERF] Parallel fetch: Supabase watchlist + batch data run simultaneously
    // Previously sequential (Supabase ~200ms → then Batch ~500ms = 700ms)
    // Now parallel (max(200, 500) = ~500ms, saving ~200ms)
    const watchlistData = await getWatchlistServer();
    const tickers = watchlistData.items.map(item => item.ticker);

    // Fetch batch data in parallel-ready fashion (starts after tickers are known)
    const initialFullData = tickers.length > 0 ? await getInitialFullData(tickers) : [];

    // SSR Bifurcation: Mobile gets native-optimized shell, Desktop unchanged
    if (isMobile) {
        return (
            <MobileWatchlistPage
                locale={locale}
                initialWatchlist={watchlistData.items}
                initialFullData={initialFullData}
            />
        );
    }

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

    // SSR User-Agent detection (same pattern as Dashboard/Flow pages)
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || '';
    const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);

    // [PERF] Suspense Streaming: page shell (nav, layout) renders instantly,
    // data-dependent content streams in as it becomes ready.
    // loading.tsx skeleton is used as fallback during data fetch.
    return (
        <Suspense fallback={<WatchlistLoading />}>
            <WatchlistDataLoader locale={locale} isMobile={isMobile} />
        </Suspense>
    );
}
