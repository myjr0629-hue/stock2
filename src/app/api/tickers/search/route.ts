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

/**
 * ★ [2026-09-08] 회사 «이름»으로도 찾게 한다.
 *   전엔 티커 문자열만 봤다 — 실측: q=tes 에 TSLA 가 안 나오고 GTES 가 나왔다.
 *   티커를 모르는 사람은 종목을 찾을 수 없었다(대표 지적:
 *   「잘 모르는 사람이 검색해도 좋게」).
 *   우리 유니버스(심볼)로 먼저 맞추고, FMP search-name 으로 이름 매칭을 얹는다.
 *   미국 상장분만 남긴다 — AAPL.DE 같은 해외 이중상장은 이 앱에서 열 수 없다.
 */
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'NASDAQ Global Select',
    'NASDAQ Global Market', 'NASDAQ Capital Market', 'New York Stock Exchange']);

async function searchByName(q: string): Promise<{ symbol: string; name: string }[]> {
    const key = process.env.FMP_API_KEY;
    if (!key || q.length < 2) return [];
    try {
        const url = `https://financialmodelingprep.com/stable/search-name`
            + `?query=${encodeURIComponent(q)}&limit=20&apikey=${key}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(3500), cache: 'no-store' });
        if (!res.ok) return [];
        const rows = await res.json();
        if (!Array.isArray(rows)) return [];
        return rows
            .filter((r: any) => typeof r?.symbol === 'string'
                && !r.symbol.includes('.')            // 해외 이중상장 제외
                && (US_EXCHANGES.has(r.exchange) || US_EXCHANGES.has(r.exchangeFullName)))
            .map((r: any) => ({ symbol: String(r.symbol).toUpperCase(), name: String(r.name || '') }));
    } catch {
        return [];   // 이름 검색이 실패해도 «심볼 검색»은 그대로 살아 있어야 한다
    }
}

export async function GET(req: NextRequest) {
    const raw = req.nextUrl.searchParams.get('q')?.trim() || '';
    const q = raw.toUpperCase();

    if (!q) return NextResponse.json({ symbols: [], results: [] });

    const [allSymbols, byName] = await Promise.all([getSymbols(), searchByName(raw)]);

    // 심볼 매칭 — 앞에서 시작하는 것이 먼저
    const startsWith = allSymbols.filter(s => s.startsWith(q));
    const contains = allSymbols.filter(s => !s.startsWith(q) && s.includes(q));

    const nameMap = new Map(byName.map(r => [r.symbol, r.name]));
    const ordered: string[] = [];
    const push = (sym: string) => { if (sym && !ordered.includes(sym)) ordered.push(sym); };

    startsWith.forEach(push);
    byName.filter(r => r.symbol.startsWith(q)).forEach(r => push(r.symbol));
    byName.forEach(r => push(r.symbol));     // 이름으로 걸린 것
    contains.forEach(push);

    const results = ordered.slice(0, 12).map(symbol => ({ symbol, name: nameMap.get(symbol) || '' }));

    // symbols 는 기존 호출부 호환용으로 남긴다
    return NextResponse.json({ symbols: results.map(r => r.symbol), results });
}
