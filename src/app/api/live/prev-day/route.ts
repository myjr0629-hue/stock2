// [V8] Redis SWR cache: 300s TTL (prev-day data rarely changes)
import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { swrFetch } from '@/lib/cache/redisSWR';

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker') || searchParams.get('t');

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const startTime = Date.now();

    try {
        // [V8] Redis SWR: 300s cache for prev-day data
        const prevUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${MASSIVE_API_KEY}`;
        const { data: prevDataRaw, _cache } = await swrFetch(
            ticker.toUpperCase(),
            async () => {
                // [2026-08-29] Massive 직접 fetch → fetchMassive (Intrinio 라우팅 경유)
                const prevData0 = await fetchMassive(prevUrl, {}, true);
                const prevRes = { ok: true, json: async () => prevData0 } as any;
                if (!prevRes.ok) return null;
                return await prevRes.json();
            },
            { ttlSeconds: 300, keyPrefix: 'swr:prevday' }
        );

        const prevResults = prevDataRaw?.results?.[0];

        if (!prevResults) {
            return NextResponse.json({
                ticker,
                prevClose: null,
                status: 'no_data'
            });
        }

        return NextResponse.json({
            ticker,
            prevClose: prevResults.c,
            prevHigh: prevResults.h,
            prevLow: prevResults.l,
            prevOpen: prevResults.o,
            prevVolume: prevResults.v,
            prevVwap: prevResults.vw,
            date: new Date(prevResults.t).toISOString().split('T')[0],
            _cache,
            debug: {
                latencyMs: Date.now() - startTime
            }
        });

    } catch (e) {
        console.error('Previous Day API Error:', e);
        return NextResponse.json({
            ticker,
            prevClose: null,
            status: 'error',
            error: String(e)
        });
    }
}
