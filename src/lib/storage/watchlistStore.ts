// Watchlist Supabase Store
// Server-persisted watchlist using Supabase (replaces localStorage)
import { createClient } from '@/lib/supabase/client';

export interface WatchlistItem {
    ticker: string;
    name: string;
    addedAt: string;
    category?: string;
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
        .select('ticker, name, added_at, category')
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
            category: (row as any).category || 'default',
        })),
        updatedAt: new Date().toISOString(),
    };
}

// Add a ticker to watchlist
export async function addToWatchlist(ticker: string, name: string, category: string = 'default'): Promise<WatchlistData> {
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
            category,
        }, { onConflict: 'user_id,ticker' });

    if (error) console.error('Failed to add to watchlist:', error);
    return getWatchlist();
}

// Update category for a ticker — uses upsert (same as addToWatchlist which works reliably)
export async function updateWatchlistCategory(ticker: string, category: string): Promise<WatchlistData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { items: [], updatedAt: new Date().toISOString() };

    console.log('[CAT] updateWatchlistCategory:', ticker, '->', category);

    // Read existing item data first
    const { data: existing } = await supabase
        .from('user_watchlist')
        .select('ticker, name, added_at')
        .eq('user_id', user.id)
        .eq('ticker', ticker)
        .maybeSingle();

    if (!existing) {
        console.error('[CAT] Item not found:', ticker);
        return getWatchlist();
    }

    // Upsert with updated category (same pattern as addToWatchlist which works)
    const { error } = await supabase
        .from('user_watchlist')
        .upsert({
            user_id: user.id,
            ticker: existing.ticker,
            name: existing.name,
            added_at: existing.added_at,
            category,
        }, { onConflict: 'user_id,ticker' });

    console.log('[CAT] Upsert result:', error ? error.message : 'OK');

    const result = await getWatchlist();
    console.log('[CAT] After update, categories:', result.items.map(i => `${i.ticker}:${i.category}`).join(', '));
    return result;
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

// ─── CATEGORY MANAGEMENT (Supabase-backed) ──────────────────────────────

// Get user's custom categories
export async function getUserCategories(): Promise<string[]> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { console.log('[CAT] getUserCategories: no user'); return []; }

    const { data, error } = await supabase
        .from('user_watchlist_categories')
        .select('category_name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[CAT] Failed to load categories:', error.message, error.details);
        return [];
    }

    const cats = (data || []).map(row => row.category_name);
    console.log('[CAT] getUserCategories loaded:', cats);
    return cats;
}

// Add a custom category
export async function addUserCategory(categoryName: string): Promise<string[]> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { error } = await supabase
        .from('user_watchlist_categories')
        .upsert({
            user_id: user.id,
            category_name: categoryName.toLowerCase().trim(),
            created_at: new Date().toISOString(),
        }, { onConflict: 'user_id,category_name' });

    if (error) console.error('Failed to add category:', error);
    return getUserCategories();
}

// Delete a custom category
export async function deleteUserCategory(categoryName: string): Promise<string[]> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { error } = await supabase
        .from('user_watchlist_categories')
        .delete()
        .eq('user_id', user.id)
        .eq('category_name', categoryName);

    if (error) console.error('Failed to delete category:', error);
    return getUserCategories();
}
