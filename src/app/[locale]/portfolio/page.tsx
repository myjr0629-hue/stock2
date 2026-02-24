import PortfolioClientPage from './PortfolioClientPage';
import { getPortfolioServer } from '@/lib/storage/portfolioStoreServer';
import { processPortfolioBatch } from '@/services/portfolioBatchService';

// Fetch FULL portfolio data to completely eliminate progressive loading layout shifts (no dashes `-`)
async function getInitialFullData(tickers: string[]) {
    if (!tickers || tickers.length === 0) return [];
    try {
        // Construct a direct function call to leverage the existing internal API logic safely during SSR
        // [PERF] Only fetch lightweight price/session data synchronously (200ms) to unblock the UI instantly
        const payload = await processPortfolioBatch(tickers, 'price');
        return payload.results || [];
    } catch (e) {
        console.error('[Portfolio SSR] Failed to fetch initial full data:', e);
    }
    return [];
}

// Ensure the page is dynamically rendered to handle cookies on every request securely
export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
    // 1. Fetch user's personalized portfolio securely via SSR cookies
    const portfolioData = await getPortfolioServer();

    // 2. Extract tickers
    const tickers = portfolioData.holdings.map((item: any) => item.ticker);

    // 3. Fetch COMPLETE advanced data instantly during SSR (Alpha, Flow, Options, Whale, etc.)
    let initialFullData: any[] = [];
    if (tickers.length > 0) {
        initialFullData = await getInitialFullData(tickers);
    }

    // 4. Inject into the client wrapper to eliminate the 2s loading skeleton AND progressive dashes
    return (
        <PortfolioClientPage
            initialHoldings={portfolioData.holdings}
            initialFullData={initialFullData}
        />
    );
}
