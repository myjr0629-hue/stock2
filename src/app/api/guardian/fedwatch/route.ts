import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

const REDIS_KEY = 'fedwatch:latest';

// POST — Store FedWatch data (called by scraper script)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        if (!body || typeof body.noChange !== 'number') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const data = {
            ease: body.ease || 0,
            noChange: body.noChange || 0,
            hike: body.hike || 0,
            targetRate: body.targetRate || null,
            nextMeetingDate: body.nextMeetingDate || null,
            daysUntilFomc: body.daysUntilFomc || null,
            contract: body.contract || null,
            midPrice: body.midPrice || null,
            scrapedAt: body.scrapedAt || new Date().toISOString(),
            storedAt: new Date().toISOString(),
        };

        await setInCache(REDIS_KEY, data, 86400);
        console.log('[FedWatch Store] Saved:', data.noChange + '% noChange');
        return NextResponse.json({ ok: true, data });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('[FedWatch Store] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// GET — Retrieve FedWatch data (called by frontend)
export async function GET() {
    try {
        const cached = await getFromCache<Record<string, unknown>>(REDIS_KEY);
        if (cached) {
            return NextResponse.json(cached, {
                headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
            });
        }
        return NextResponse.json({
            ease: 0, noChange: 0, hike: 0,
            targetRate: null, daysUntilFomc: null,
            message: 'No FedWatch data available yet',
        }, { status: 200 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('[FedWatch GET] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
