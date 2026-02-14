// Dashboard Ticker Supabase Store
// Server-persisted dashboard tickers using Supabase (replaces localStorage)
import { createClient } from '@/lib/supabase/client';

const MAX_DASHBOARD_TICKERS = 10;

// Get dashboard tickers from Supabase
export async function getDashboardTickers(): Promise<string[]> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('user_dashboard')
        .select('ticker, added_at')
        .eq('user_id', user.id)
        .order('added_at', { ascending: true });

    if (error) {
        console.error('[Dashboard] Failed to load tickers:', error);
        return [];
    }

    return (data || []).map(row => row.ticker);
}

// Add a ticker to dashboard
export async function addDashboardTicker(ticker: string): Promise<string[]> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Check current count
    const current = await getDashboardTickers();
    if (current.length >= MAX_DASHBOARD_TICKERS) {
        console.warn('[Dashboard] Max tickers reached:', MAX_DASHBOARD_TICKERS);
        return current;
    }

    const { error } = await supabase
        .from('user_dashboard')
        .upsert({
            user_id: user.id,
            ticker: ticker.toUpperCase(),
            added_at: new Date().toISOString(),
        }, { onConflict: 'user_id,ticker' });

    if (error) console.error('[Dashboard] Failed to add ticker:', error);
    return getDashboardTickers();
}

// Remove a ticker from dashboard
export async function removeDashboardTicker(ticker: string): Promise<string[]> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { error } = await supabase
        .from('user_dashboard')
        .delete()
        .eq('user_id', user.id)
        .eq('ticker', ticker.toUpperCase());

    if (error) console.error('[Dashboard] Failed to remove ticker:', error);
    return getDashboardTickers();
}

// Toggle a ticker (add if missing, remove if present)
export async function toggleDashboardTicker(ticker: string): Promise<string[]> {
    const upperTicker = ticker.toUpperCase();
    const current = await getDashboardTickers();
    if (current.includes(upperTicker)) {
        return removeDashboardTicker(upperTicker);
    } else {
        return addDashboardTicker(upperTicker);
    }
}

// Check if ticker is in dashboard
export async function isInDashboard(ticker: string): Promise<boolean> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
        .from('user_dashboard')
        .select('ticker')
        .eq('user_id', user.id)
        .eq('ticker', ticker.toUpperCase())
        .maybeSingle();

    return !!data;
}
