import { NextRequest, NextResponse } from 'next/server';
import { setInCache, getFromCache } from '@/services/redisClient';

const REDIS_KEY = 'fedwatch:latest';

// POST — Store FedWatch data (called by scraper script/Lambda)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        if (!body || typeof body.noChange !== 'number') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        // Read previous data to preserve delta tracking
        const prev = await getFromCache<{ ease?: number; noChange?: number; hike?: number }>(REDIS_KEY);

        const data = {
            ease: body.ease || 0,
            noChange: body.noChange || 0,
            hike: body.hike || 0,
            // Delta tracking: store previous values for UI arrows
            prevEase: prev?.ease ?? undefined,
            prevNoChange: prev?.noChange ?? undefined,
            prevHike: prev?.hike ?? undefined,
            targetRate: body.targetRate || null,
            nextMeetingDate: body.nextMeetingDate || null,
            daysUntilFomc: body.daysUntilFomc || null,
            contract: body.contract || null,
            midPrice: body.midPrice || null,
            scrapedAt: body.scrapedAt || new Date().toISOString(),
            storedAt: new Date().toISOString(),
            source: 'scraper',
        };

        await setInCache(REDIS_KEY, data, 86400);
        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
