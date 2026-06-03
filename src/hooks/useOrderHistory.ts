'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface RadarOrder {
    id: string;
    ticker: string;
    action: 'BUY' | 'SELL' | 'ROTATE_SELL' | 'ROTATE_BUY';
    shares: number;
    targetPrice: number;
    actualPrice: number | null;
    alphaScore: number;
    alphaGrade: string;
    weight: number;
    reason: 'INITIAL' | 'REBALANCE' | 'DRIFT' | 'CIRCUIT_BREAKER' | 'ROTATION';
    portfolioNav: number;
    createdAt: string;
}

export function useOrderHistory() {
    const [orders, setOrders] = useState<RadarOrder[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadHistory = useCallback(async (limit?: number) => {
        setIsLoading(true);
        try {
            const supabase = createClient();
            let query = supabase
                .from('radar_orders')
                .select('*')
                .order('created_at', { ascending: false });

            if (limit) {
                query = query.limit(limit);
            }

            const { data, error } = await query;

            if (error) throw error;

            const mapped: RadarOrder[] = (data ?? []).map((row: any) => ({
                id: row.id,
                ticker: row.ticker,
                action: row.action,
                shares: row.shares,
                targetPrice: row.target_price,
                actualPrice: row.actual_price,
                alphaScore: row.alpha_score,
                alphaGrade: row.alpha_grade,
                weight: row.weight,
                reason: row.reason,
                portfolioNav: row.portfolio_nav,
                createdAt: row.created_at,
            }));

            setOrders(mapped);
        } catch (e) {
            console.error('Failed to load order history:', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const recordOrder = useCallback(async (order: Omit<RadarOrder, 'id' | 'createdAt'>) => {
        try {
            const supabase = createClient();
            const { error } = await supabase
                .from('radar_orders')
                .insert({
                    ticker: order.ticker,
                    action: order.action,
                    shares: order.shares,
                    target_price: order.targetPrice,
                    actual_price: order.actualPrice,
                    alpha_score: order.alphaScore,
                    alpha_grade: order.alphaGrade,
                    weight: order.weight,
                    reason: order.reason,
                    portfolio_nav: order.portfolioNav,
                });

            if (error) throw error;

            // Reload to pick up the new order
            await loadHistory();
        } catch (e) {
            console.error('Failed to record order:', e);
        }
    }, [loadHistory]);

    return {
        orders,
        isLoading,
        loadHistory,
        recordOrder,
    };
}
