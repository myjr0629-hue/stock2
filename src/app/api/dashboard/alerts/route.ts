import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { createClient } from '@/lib/supabase/server';

/**
 * GET/POST/DELETE /api/dashboard/alerts
 * Manage user price/condition alerts
 * Stored in ElastiCache (user-scoped)
 */

const REDIS_PREFIX = 'dashboard:alerts:';

export interface AlertRule {
    id: string;
    ticker: string;
    condition: 'price_above' | 'price_below' | 'gex_flip_long' | 'gex_flip_short' | 'squeeze_above';
    threshold?: number;
    active: boolean;
    createdAt: number;
}

// GET: Load user alerts
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ alerts: [], error: 'Not authenticated' }, { status: 401 });
        }

        const key = `${REDIS_PREFIX}${user.id}`;
        const alerts = await getFromCache<AlertRule[]>(key);

        return NextResponse.json({ alerts: alerts || [] });
    } catch (error: any) {
        return NextResponse.json({ alerts: [], error: error.message }, { status: 500 });
    }
}

// POST: Add/update alert
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { ticker, condition, threshold } = body;

        if (!ticker || !condition) {
            return NextResponse.json({ error: 'ticker and condition required' }, { status: 400 });
        }

        const key = `${REDIS_PREFIX}${user.id}`;
        const existing = await getFromCache<AlertRule[]>(key) || [];

        const newAlert: AlertRule = {
            id: `${ticker}-${condition}-${Date.now()}`,
            ticker: ticker.toUpperCase(),
            condition,
            threshold: threshold || undefined,
            active: true,
            createdAt: Date.now(),
        };

        // Max 20 alerts per user
        const updated = [...existing, newAlert].slice(-20);
        await setInCache(key, updated, 365 * 24 * 60 * 60);

        return NextResponse.json({ success: true, alert: newAlert, total: updated.length });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Remove alert
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const alertId = searchParams.get('id');
        if (!alertId) {
            return NextResponse.json({ error: 'Alert id required' }, { status: 400 });
        }

        const key = `${REDIS_PREFIX}${user.id}`;
        const existing = await getFromCache<AlertRule[]>(key) || [];
        const updated = existing.filter(a => a.id !== alertId);
        await setInCache(key, updated, 365 * 24 * 60 * 60);

        return NextResponse.json({ success: true, remaining: updated.length });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
