// Watchlist Supabase Store (Server Actions / SSR only)
import { createClient as createServerClient } from '@/lib/supabase/server';
import { type WatchlistData } from '@/lib/storage/watchlistStore';

export async function getWatchlistServer(): Promise<WatchlistData> {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { items: [], updatedAt: new Date().toISOString() };

    const { data, error } = await supabase
        .from('user_watchlist')
        .select('ticker, name, added_at')
        .eq('user_id', user.id)
        .order('added_at', { ascending: true });

    if (error) {
        console.error('[SSR] Failed to load watchlist:', error);
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
