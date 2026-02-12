// Watchlist Supabase Store
// Server-persisted watchlist using Supabase (replaces localStorage)
import { createClient } from '@/lib/supabase/client';

export interface WatchlistItem {
    ticker: string;
    name: string;
    addedAt: string;
}

export interface WatchlistData {
    items: WatchlistItem[];
    updatedAt: string;
}

// Get watchlist from Supabase
export async function getWatchlist(): Promise<WatchlistData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { items: [], updatedAt: new Date().toISOString() };

    const { data, error } = await supabase
        .from('user_watchlist')
        .select('ticker, name, added_at')
        .eq('user_id', user.id)
        .order('added_at', { ascending: true });

    if (error) {
        console.error('Failed to load watchlist:', error);
        return { items: [], updatedAt: new Date().toISOString() };
    }

    return {
        items: (data || []).map(row => ({
            ticker: row.ticker,
            name: row.name,
            addedAt: row.added_at,
        })),
        updatedAt: new Date().toISOString(),
    };
}

// Add a ticker to watchlist
export async function addToWatchlist(ticker: string, name: string): Promise<WatchlistData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { items: [], updatedAt: new Date().toISOString() };

    const { error } = await supabase
        .from('user_watchlist')
        .upsert({
            user_id: user.id,
            ticker: ticker.toUpperCase(),
            name,
            added_at: new Date().toISOString(),
        }, { onConflict: 'user_id,ticker' });

    if (error) console.error('Failed to add to watchlist:', error);
    return getWatchlist();
}

// Remove a ticker from watchlist
export async function removeFromWatchlist(ticker: string): Promise<WatchlistData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { items: [], updatedAt: new Date().toISOString() };

    const { error } = await supabase
        .from('user_watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('ticker', ticker);

    if (error) console.error('Failed to remove from watchlist:', error);
    return getWatchlist();
}

// Check if ticker is in watchlist
export async function isInWatchlist(ticker: string): Promise<boolean> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
        .from('user_watchlist')
        .select('ticker')
        .eq('user_id', user.id)
        .eq('ticker', ticker)
        .maybeSingle();

    return !!data;
}

// Clear all items
export async function clearWatchlist(): Promise<WatchlistData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { items: [], updatedAt: new Date().toISOString() };

    await supabase
        .from('user_watchlist')
        .delete()
        .eq('user_id', user.id);

    return { items: [], updatedAt: new Date().toISOString() };
}
