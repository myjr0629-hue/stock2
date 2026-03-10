import { NextRequest } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

// Logo image proxy — hides external data source from client
// Caches in Redis for 24 hours (logos rarely change)
const LOGO_SOURCE = 'https://financialmodelingprep.com/image-stock';
const CACHE_TTL = 86400; // 24 hours

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!symbol) {
        return new Response(null, { status: 400 });
    }

    const cacheKey = `logo:${symbol}`;

    // 1. Try Redis cache first
    try {
        const cached = await getFromCache<{ buffer: string; contentType: string }>(cacheKey);
        if (cached?.buffer) {
            const imgBuffer = Buffer.from(cached.buffer, 'base64');
            return new Response(imgBuffer, {
                status: 200,
                headers: {
                    'Content-Type': cached.contentType || 'image/png',
                    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                    'X-Cache': 'HIT',
                },
            });
        }
    } catch { /* continue to origin */ }

    // 2. Fetch from origin
    try {
        const res = await fetch(`${LOGO_SOURCE}/${symbol}.png`, {
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
            // Return transparent 1x1 PNG for missing logos
            return new Response(null, { status: 204 });
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = res.headers.get('content-type') || 'image/png';

        // 3. Cache in Redis (base64 encoded)
        try {
            await setInCache(cacheKey, {
                buffer: buffer.toString('base64'),
                contentType,
            }, CACHE_TTL);
        } catch { /* non-critical */ }

        return new Response(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                'X-Cache': 'MISS',
            },
        });
    } catch {
        return new Response(null, { status: 204 });
    }
}
