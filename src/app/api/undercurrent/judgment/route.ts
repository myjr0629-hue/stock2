// ============================================================================
// Undercurrent — "심판일" (judgment days): upcoming earnings for covered names
// ----------------------------------------------------------------------------
// A scheduled future event is the strongest reason to come back — the edition
// shows this week's earnings dates for tickers in our coverage universe.
// Source: FMP earnings calendar, filtered to SECTOR_MAP tickers. 12h cache.
// GET /api/undercurrent/judgment
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { SECTOR_MAP } from '@/services/universePolicy';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CACHE_KEY = 'undercurrent:judgment:v1';
const TTL = 12 * 60 * 60;

export async function GET() {
    try {
        const cached = await getFromCache<any>(CACHE_KEY);
        if (cached) return NextResponse.json({ ...cached, _cached: true });

        const fmpKey = process.env.FMP_API_KEY;
        if (!fmpKey) return NextResponse.json({ success: true, events: [] });

        const today = new Date();
        const to = new Date();
        to.setDate(to.getDate() + 7);
        const fmt = (d: Date) => d.toISOString().split('T')[0];

        const res = await fetch(
            `https://financialmodelingprep.com/stable/earnings-calendar?from=${fmt(today)}&to=${fmt(to)}&apikey=${fmpKey}`,
            { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) return NextResponse.json({ success: true, events: [] });
        const rows = await res.json();
        if (!Array.isArray(rows)) return NextResponse.json({ success: true, events: [] });

        const universe = new Set(Object.values(SECTOR_MAP).flatMap((s) => s.tickers));
        const events = rows
            .filter((r: any) => universe.has(String(r.symbol || '').toUpperCase()))
            .map((r: any) => ({
                ticker: String(r.symbol).toUpperCase(),
                date: String(r.date || '').slice(0, 10),
                epsEstimated: typeof r.epsEstimated === 'number' ? r.epsEstimated : null,
            }))
            .filter((e: any) => e.date)
            .sort((a: any, b: any) => a.date.localeCompare(b.date))
            .slice(0, 6);

        const payload = { success: true, events, generatedAt: new Date().toISOString() };
        if (events.length) setInCache(CACHE_KEY, payload, TTL).catch(() => {});
        return NextResponse.json(payload);
    } catch (e: any) {
        return NextResponse.json({ success: true, events: [], error: e?.message });
    }
}
