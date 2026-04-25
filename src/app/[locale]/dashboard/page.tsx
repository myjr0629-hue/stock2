import { headers } from 'next/headers';
import { DashboardClient } from './DashboardClient';
import { MobileDashboardPage } from './MobileDashboardPage';
import { createClient } from '@/lib/supabase/server';
import { GET as getLiveQuotes } from '@/app/api/live/quotes/route';
import { TerminalGateWrapper } from '@/components/gate/TerminalGateWrapper';

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
    // 1. SERVER-SIDE MOBILE DETECTION (matches layout.tsx pattern exactly)
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || '';
    const isMobileDevice = /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);

    // 2. Fetch user's personalized tickers securely via SSR cookies (0ms latency for client)
    const tickers = await getDashboardTickers();

    // 3. Fetch baseline realtime quotes for those tickers (Server-to-Server speed)
    const initialQuotes = await getInitialQuotes(tickers);

    // 4. BIFURCATED RENDERING — Mobile gets native 3-tab page, Desktop unchanged
    if (isMobileDevice) {
        return (
            <TerminalGateWrapper pageName="COMMAND">
                <MobileDashboardPage
                    initialTickers={tickers}
                    initialQuotes={initialQuotes}
                />
            </TerminalGateWrapper>
        );
    }

    // 5. DESKTOP: Original DashboardClient (ZERO changes)
    return (
        <TerminalGateWrapper pageName="COMMAND">
            <DashboardClient
                initialTickers={tickers}
                initialQuotes={initialQuotes}
            />
        </TerminalGateWrapper>
    );
}
