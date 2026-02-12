// Portfolio Supabase Store
// Server-persisted portfolio using Supabase (replaces localStorage)
import { createClient } from '@/lib/supabase/client';

export interface AlphaSnapshot {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    action: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH';
    confidence: number;
    capturedAt: string;
}

export interface Holding {
    ticker: string;
    name: string;
    quantity: number;
    avgPrice: number;
    addedAt: string;
    alphaSnapshot?: AlphaSnapshot;
}

export interface PortfolioData {
    holdings: Holding[];
    updatedAt: string;
}

// Get portfolio from Supabase
export async function getPortfolio(): Promise<PortfolioData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { holdings: [], updatedAt: new Date().toISOString() };

    const { data, error } = await supabase
        .from('user_portfolio')
        .select('ticker, name, quantity, avg_price, added_at')
        .eq('user_id', user.id)
        .order('added_at', { ascending: true });

    if (error) {
        console.error('Failed to load portfolio:', error);
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
}

// Add a new holding (upsert: if exists, average down/up)
export async function addHolding(holding: Omit<Holding, 'addedAt'>): Promise<PortfolioData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { holdings: [], updatedAt: new Date().toISOString() };

    // Check if holding already exists
    const { data: existing } = await supabase
        .from('user_portfolio')
        .select('quantity, avg_price')
        .eq('user_id', user.id)
        .eq('ticker', holding.ticker)
        .maybeSingle();

    if (existing) {
        // Average down/up
        const totalShares = Number(existing.quantity) + holding.quantity;
        const avgPrice = ((Number(existing.avg_price) * Number(existing.quantity)) + (holding.avgPrice * holding.quantity)) / totalShares;

        await supabase
            .from('user_portfolio')
            .update({
                quantity: totalShares,
                avg_price: Math.round(avgPrice * 100) / 100,
            })
            .eq('user_id', user.id)
            .eq('ticker', holding.ticker);
    } else {
        await supabase
            .from('user_portfolio')
            .insert({
                user_id: user.id,
                ticker: holding.ticker.toUpperCase(),
                name: holding.name,
                quantity: holding.quantity,
                avg_price: holding.avgPrice,
                added_at: new Date().toISOString(),
            });
    }

    return getPortfolio();
}

// Remove a holding
export async function removeHolding(ticker: string): Promise<PortfolioData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { holdings: [], updatedAt: new Date().toISOString() };

    await supabase
        .from('user_portfolio')
        .delete()
        .eq('user_id', user.id)
        .eq('ticker', ticker);

    return getPortfolio();
}

// Update a holding
export async function updateHolding(ticker: string, updates: Partial<Holding>): Promise<PortfolioData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { holdings: [], updatedAt: new Date().toISOString() };

    const updatePayload: Record<string, unknown> = {};
    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.quantity !== undefined) updatePayload.quantity = updates.quantity;
    if (updates.avgPrice !== undefined) updatePayload.avg_price = updates.avgPrice;

    if (Object.keys(updatePayload).length > 0) {
        await supabase
            .from('user_portfolio')
            .update(updatePayload)
            .eq('user_id', user.id)
            .eq('ticker', ticker);
    }

    return getPortfolio();
}

// Clear all holdings
export async function clearPortfolio(): Promise<PortfolioData> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { holdings: [], updatedAt: new Date().toISOString() };

    await supabase
        .from('user_portfolio')
        .delete()
        .eq('user_id', user.id);

    return { holdings: [], updatedAt: new Date().toISOString() };
}
