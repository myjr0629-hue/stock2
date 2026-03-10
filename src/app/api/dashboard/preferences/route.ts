import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { createClient } from '@/lib/supabase/server';

/**
 * GET/POST /api/dashboard/preferences
 * Save/load user dashboard preferences (card order, visibility)
 * Stored in ElastiCache with unlimited TTL (user-scoped key)
 */

const REDIS_PREFIX = 'dashboard:prefs:';

// GET: Load user preferences
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ preferences: null, error: 'Not authenticated' }, { status: 401 });
        }

        const key = `${REDIS_PREFIX}${user.id}`;
        const prefs = await getFromCache<any>(key);

        return NextResponse.json({ preferences: prefs });
    } catch (error: any) {
        return NextResponse.json({ preferences: null, error: error.message }, { status: 500 });
    }
}

// POST: Save user preferences
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { cardOrder, visibleCards } = body;

        if (!cardOrder || !Array.isArray(cardOrder)) {
            return NextResponse.json({ error: 'Invalid cardOrder' }, { status: 400 });
        }

        const key = `${REDIS_PREFIX}${user.id}`;
        const prefs = {
            cardOrder,
            visibleCards: visibleCards || cardOrder,
            updatedAt: Date.now(),
        };

        // Save with 1-year TTL (effectively permanent)
        await setInCache(key, prefs, 365 * 24 * 60 * 60);

        return NextResponse.json({ success: true, preferences: prefs });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
