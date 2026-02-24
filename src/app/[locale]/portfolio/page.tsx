import PortfolioClientPage from './PortfolioClientPage';
import { getPortfolioServer } from '@/lib/storage/portfolioStoreServer';
import { GET as getPortfolioBatch } from '@/app/api/portfolio/batch/route';

// Fetch FULL portfolio data to completely eliminate progressive loading layout shifts (no dashes `-`)
async function getInitialFullData(tickers: string[]) {
    if (!tickers || tickers.length === 0) return [];
    try {
        // Construct a dummy request to leverage the existing internal API logic
        // This calculates Alpha, Whale, maxPain, flow, etc., for all tickers in parallel
        const url = `http://localhost/api/portfolio/batch?tickers=${tickers.join(',')}`;
        const req = new Request(url);

        const res = await getPortfolioBatch(req);
        if (res.ok) {
            const json = await res.json();
            return json.results || [];
        }
        console.warn('[Portfolio SSR] Batch internal fetch returned !ok status:', res.status);
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
