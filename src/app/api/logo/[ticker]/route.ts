import { NextRequest } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

// Unified logo proxy — the SINGLE source every page (Flow/Command/Dash/Movers/
// Intel) should use, so a ticker looks identical everywhere. Two providers, each
// better for some tickers, so we pick smartly + cache the winner in Redis 24h:
//  - Parqet: clean app-icon marks (e.g. AMZN shows the full icon, not a lone swoosh)
//  - FMP: correct where Parqet is wrong (e.g. SPCX = real SpaceX mark, not AXS issuer)
const FMP = 'https://financialmodelingprep.com/image-stock';
const PARQET = 'https://assets.parqet.com/logos/symbol';
// Per-ticker override when the default order returns the wrong brand.
const LOGO_OVERRIDE: Record<string, string[]> = {
    SPCX: [`${FMP}/SPCX.png`], // Parqet returns the AXS fund-issuer logo here
};
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

    // v2 — bumped when the source order changed (Parqet-first) so stale FMP-only
    // images (e.g. the lone Amazon swoosh) don't linger in cache.
    const cacheKey = `logo:v2:${symbol}`;

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

    // 2. Fetch from origin — try each source in order, return the first hit.
    const sources = LOGO_OVERRIDE[symbol] || [`${PARQET}/${symbol}?format=png`, `${FMP}/${symbol}.png`];
    for (const url of sources) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) continue;
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            if (buffer.byteLength < 64) continue; // skip empty/placeholder responses
            const contentType = res.headers.get('content-type') || 'image/png';

            // 3. Cache the winning image in Redis (base64 encoded)
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
        } catch { /* try next source */ }
    }

    // No source had a logo — transparent (204) so the chip just shows empty.
    return new Response(null, { status: 204 });
}
