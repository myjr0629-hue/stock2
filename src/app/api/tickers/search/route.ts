// [Autocomplete] Ticker Search API — Returns filtered symbols from stock universe
// Uses Redis cache (ElastiCache) with fallback to local JSON
import { NextRequest, NextResponse } from 'next/server';

// In-memory cache (server-side singleton, survives across requests)
let _symbolCache: string[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getSymbols(): Promise<string[]> {
    if (_symbolCache && Date.now() - _cacheTime < CACHE_TTL) {
        return _symbolCache;
    }

    try {
        // Try Redis first (ElastiCache via redisClient)
        const { getFromCache, setInCache } = await import('@/services/redisClient');
        const cached = await getFromCache<string[]>('ticker:universe:symbols');
        if (cached && Array.isArray(cached) && cached.length > 0) {
            _symbolCache = cached;
            _cacheTime = Date.now();
            return _symbolCache;
        }

        // Fallback: load from local JSON
        const fs = await import('fs');
        const path = await import('path');
        const filePaths = [
            path.join(process.cwd(), 'data', 'stock_universe_us800.json'),
            path.join(process.cwd(), 'data', 'stock_universe_us300.json'),
        ];

        for (const filePath of filePaths) {
            try {
                const raw = fs.readFileSync(filePath, 'utf-8');
                const data = JSON.parse(raw);
                const symbols: string[] = data.symbols || [];
                _symbolCache = symbols;
                _cacheTime = Date.now();

                // Cache to Redis for future requests (24h TTL)
                await setInCache('ticker:universe:symbols', symbols, 86400).catch(() => { });
                return symbols;
            } catch { continue; }
        }
    } catch (e) {
        console.warn('[Ticker Search] Cache error:', (e as Error).message);
    }

    return [];
}

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q')?.toUpperCase().trim() || '';

    if (!q || q.length < 1) {
        return NextResponse.json({ symbols: [] });
    }

    const allSymbols = await getSymbols();

    // Filter: starts with query first, then contains query
    const startsWith = allSymbols.filter(s => s.startsWith(q));
    const contains = allSymbols.filter(s => !s.startsWith(q) && s.includes(q));
    const results = [...startsWith, ...contains].slice(0, 10);

    return NextResponse.json({ symbols: results });
}
