import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

const REDIS_KEY = 'fedwatch:latest';
const REDIS_FALLBACK_KEY = 'fedwatch:fallback'; // Long-lived fallback for weekends
const TTL_PRIMARY = 72 * 60 * 60;       // 72 hours — survive full weekend
const TTL_FALLBACK = 7 * 24 * 60 * 60;  // 7 days — absolute safety net

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
            prevEase: body.prevEase ?? null,
            prevNoChange: body.prevNoChange ?? null,
            prevHike: body.prevHike ?? null,
            scrapedAt: body.scrapedAt || new Date().toISOString(),
            storedAt: new Date().toISOString(),
        };

        // Save to both primary and long-lived fallback
        await Promise.all([
            setInCache(REDIS_KEY, data, TTL_PRIMARY),
            setInCache(REDIS_FALLBACK_KEY, data, TTL_FALLBACK),
        ]);
        console.log('[FedWatch Store] Saved:', data.noChange + '% noChange');
        return NextResponse.json({ ok: true, data });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('[FedWatch Store] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// Helper: check if FedWatch data has meaningful content
function hasMeaningfulData(d: Record<string, unknown>): boolean {
    const total = ((d.noChange as number) || 0) + ((d.hike as number) || 0) + ((d.ease as number) || 0);
    return total > 0 || !!d.targetRate || !!d.daysUntilFomc;
}

// GET — Retrieve FedWatch data (called by frontend)
export async function GET() {
    try {
        // Try primary cache first
        const cached = await getFromCache<Record<string, unknown>>(REDIS_KEY);
        if (cached && typeof cached.noChange === 'number' && hasMeaningfulData(cached)) {
            return NextResponse.json(cached, {
                headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
            });
        }

        // Fallback: long-lived backup (for weekends/holidays)
        const fallback = await getFromCache<Record<string, unknown>>(REDIS_FALLBACK_KEY);
        if (fallback && typeof fallback.noChange === 'number' && hasMeaningfulData(fallback)) {
            return NextResponse.json({ ...fallback, _source: 'fallback' }, {
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
