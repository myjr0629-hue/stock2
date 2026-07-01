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
// Hand-curated logos bundled in /public/logos (served at /logos/<file>) — used
// FIRST for these tickers because the free providers only offer a poor asset
// (e.g. AMZN: FMP = lone swoosh, Parqet = dark app tile). Filename per ticker.
const CURATED: Record<string, string> = {
    AMZN: 'AMZN.svg',
};
// Leveraged/inverse ETFs whose only "logo" is an issuer wordmark (Direxion/
// ProShares) on a black tile — not a real brand mark. Skip straight to the
// generated initial chip so they render premium and consistent, never a black
// tile or a blank bubble.
const FORCE_INITIAL = new Set([
    'SOXL', 'SOXS', 'SPXL', 'SPXS', 'TQQQ', 'SQQQ', 'UPRO', 'SPXU', 'TNA', 'TZA',
    'UDOW', 'SDOW', 'LABU', 'LABD', 'FNGU', 'FNGD', 'TECL', 'TECS', 'YINN', 'YANG',
    'BOIL', 'KOLD', 'NUGT', 'DUST', 'JNUG', 'JDST', 'UVXY', 'SVXY', 'TMF', 'TMV',
]);
const CACHE_TTL = 86400; // 24 hours

// Deterministic premium fallback — a gradient chip with the ticker's letters, so
// a logo ALWAYS renders (no blanks, no wrong/issuer marks) with a stable per-ticker color.
function hashHue(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
}
function initialChipSvg(symbol: string): string {
    const label = symbol.slice(0, 4);
    const hue = hashHue(symbol);
    const c1 = `hsl(${hue} 60% 44%)`;
    const c2 = `hsl(${(hue + 26) % 360} 58% 26%)`;
    const fs = label.length >= 4 ? 25 : label.length === 3 ? 30 : label.length === 2 ? 36 : 42;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#g)"/><text x="50" y="52" dominant-baseline="central" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="${fs}" font-weight="800" fill="#ffffff" letter-spacing="-1">${label}</text></svg>`;
}
function chipResponse(symbol: string, cache: 'GEN' | 'HIT' = 'GEN'): Response {
    return new Response(initialChipSvg(symbol), {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=600, s-maxage=86400, stale-while-revalidate=86400',
            'X-Cache': cache,
        },
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!symbol) {
        return new Response(null, { status: 400 });
    }

    // Known logoless/issuer-wordmark tickers → premium initial chip immediately.
    if (FORCE_INITIAL.has(symbol)) {
        return chipResponse(symbol);
    }

    // v3 — bumped when curated bundled logos were added (AMZN) so the old
    // provider image doesn't linger in cache.
    const cacheKey = `logo:v3:${symbol}`;

    // 1. Try Redis cache first
    try {
        const cached = await getFromCache<{ buffer: string; contentType: string }>(cacheKey);
        if (cached?.buffer) {
            const imgBuffer = Buffer.from(cached.buffer, 'base64');
            return new Response(imgBuffer, {
                status: 200,
                headers: {
                    'Content-Type': cached.contentType || 'image/png',
                    'Cache-Control': 'public, max-age=600, s-maxage=86400, stale-while-revalidate=86400',
                    'X-Cache': 'HIT',
                },
            });
        }
    } catch { /* continue to origin */ }

    // 2. Fetch from origin — try each source in order, return the first hit.
    // Curated bundled logo (self-hosted) wins, then provider order.
    const origin = new URL(request.url).origin;
    const curatedFile = CURATED[symbol];
    const sources = LOGO_OVERRIDE[symbol] || [
        ...(curatedFile ? [`${origin}/logos/${curatedFile}`] : []),
        `${PARQET}/${symbol}?format=png`,
        `${FMP}/${symbol}.png`,
    ];
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
                    'Cache-Control': 'public, max-age=600, s-maxage=86400, stale-while-revalidate=86400',
                    'X-Cache': 'MISS',
                },
            });
        } catch { /* try next source */ }
    }

    // No source had a usable logo — premium initial chip so it NEVER shows blank.
    // Cache the chip so we don't re-hit both providers on every miss.
    try {
        await setInCache(cacheKey, {
            buffer: Buffer.from(initialChipSvg(symbol)).toString('base64'),
            contentType: 'image/svg+xml; charset=utf-8',
        }, CACHE_TTL);
    } catch { /* non-critical */ }
    return chipResponse(symbol);
}
