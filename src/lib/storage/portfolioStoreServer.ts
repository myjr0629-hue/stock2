import { createClient } from '@/lib/supabase/server';
import type { PortfolioData } from './portfolioStore';

// Server-only function to fetch portfolio using cookies()
// This must only be called from Server Components or Server Actions
export async function getPortfolioServer(): Promise<PortfolioData> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { items: [], updatedAt: new Date().toISOString() } as any; // Type workaround if structure differs slightly
        }

        const { data, error } = await supabase
            .from('user_portfolio')
            .select('ticker, name, quantity, avg_price, added_at')
            .eq('user_id', user.id)
            .order('added_at', { ascending: true });

        if (error) {
            console.error('[Portfolio SSR] Failed to load portfolio:', error);
            return { holdings: [], updatedAt: new Date().toISOString() };
        }

        return {
            holdings: (data || []).map(row => ({
                ticker: row.ticker,
                name: row.name,
                quantity: Number(row.quantity),
                avgPrice: Number(row.avg_price),
                addedAt: row.added_at,
            })),
            updatedAt: new Date().toISOString(),
        };
    } catch (e) {
        console.error('[Portfolio SSR] Exception loading portfolio:', e);
        return { holdings: [], updatedAt: new Date().toISOString() };
    }
}
