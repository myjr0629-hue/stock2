import { DashboardClient } from './DashboardClient';
import { createClient } from '@/lib/supabase/server';
import { GET as getLiveQuotes } from '@/app/api/live/quotes/route';

const DEFAULT_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];

// Fetch personalized tickers natively on the server using Supabase cookies
async function getDashboardTickers() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return DEFAULT_TICKERS;
        }

        const { data, error } = await supabase
            .from('user_dashboard')
            .select('ticker')
            .eq('user_id', user.id)
            .order('added_at', { ascending: true });

        if (error) {
            console.error('[Dashboard SSR] DB error loading tickers:', error);
            return DEFAULT_TICKERS;
        }

        const tickers = (data || []).map((row: any) => row.ticker);
        return tickers.length > 0 ? tickers : DEFAULT_TICKERS;
    } catch (e) {
        console.error('[Dashboard SSR] Failed to load user tickers:', e);
        return DEFAULT_TICKERS;
    }
}

// Fetch baseline real-time quotes directly via internal route handler
async function getInitialQuotes(tickers: string[]) {
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
        console.warn('[Dashboard SSR] Quotes internal fetch returned !ok status:', res.status);
    } catch (e) {
        console.error('[Dashboard SSR] Failed to fetch initial quotes:', e);
    }
    return {};
}

// Ensure the page is dynamically rendered to handle cookies on every request
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    // 1. Fetch user's personalized tickers securely via SSR cookies (0ms latency for client)
    const tickers = await getDashboardTickers();

    // 2. Fetch baseline realtime quotes for those tickers (Server-to-Server speed)
    const initialQuotes = await getInitialQuotes(tickers);

    // 3. Render client component with instant hydration data
    return (
        <DashboardClient
            initialTickers={tickers}
            initialQuotes={initialQuotes}
        />
    );
}
