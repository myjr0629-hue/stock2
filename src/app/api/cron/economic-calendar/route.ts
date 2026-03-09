import { NextResponse } from 'next/server';
import { setInCache } from '@/services/redisClient';

/**
 * [V8.3] FMP Economic Calendar → Redis Writer (Cron Only)
 * 
 * Fetches US economic events from FMP Stable API every 4 hours.
 * Filters for HIGH + MEDIUM impact, US only.
 * Writes to Redis key: fmp:econ-calendar (TTL 6h)
 * 
 * POLICY: This is the ONLY place that calls FMP directly.
 *         All other services read from Redis only.
 */

const FMP_API_KEY = process.env.FMP_API_KEY || '';
const FMP_BASE = 'https://financialmodelingprep.com/stable/economic-calendar';
const REDIS_KEY = 'fmp:econ-calendar';
const CACHE_TTL = 6 * 60 * 60; // 6 hours

// Category auto-mapping based on event name keywords
function mapCategory(event: string): string {
    const e = event.toLowerCase();
    if (e.includes('cpi') || e.includes('ppi') || e.includes('pce') || e.includes('inflation')) return 'inflation';
    if (e.includes('payroll') || e.includes('nfp') || e.includes('employment') || e.includes('jobless') || e.includes('adp') || e.includes('jolts') || e.includes('unemployment')) return 'employment';
    if (e.includes('fomc') || e.includes('fed') || e.includes('interest rate')) return 'fed';
    if (e.includes('gdp')) return 'growth';
    if (e.includes('ism') || e.includes('pmi') || e.includes('manufacturing') || e.includes('industrial')) return 'manufacturing';
    if (e.includes('retail') || e.includes('consumer') || e.includes('michigan') || e.includes('confidence') || e.includes('spending')) return 'consumer';
    return 'other';
}

// Convert FMP impact string to our format
function normalizeImpact(impact: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const i = impact?.toLowerCase() || '';
    if (i === 'high') return 'HIGH';
    if (i === 'medium') return 'MEDIUM';
    return 'LOW';
}

// Format date string for sorting
function formatDate(dateStr: string): { date: string; time: string } {
    // FMP format: "2026-03-11 08:30:00"
    const parts = dateStr.split(' ');
    const date = parts[0]; // "2026-03-11"
    const timeParts = parts[1]?.split(':') || ['00', '00'];
    const time = `${timeParts[0]}:${timeParts[1]}`; // "08:30"
    return { date, time };
}

export async function GET() {
    if (!FMP_API_KEY) {
        return NextResponse.json({ error: 'FMP_API_KEY not set' }, { status: 500 });
    }

    try {
        // Fetch next 30 days of events
        const now = new Date();
        const from = now.toISOString().split('T')[0];
        const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const url = `${FMP_BASE}?from=${from}&to=${to}&apikey=${FMP_API_KEY}`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            cache: 'no-store',
        });

        if (!res.ok) {
            console.error(`[econ-cal] FMP fetch failed: ${res.status}`);
            return NextResponse.json({ error: `FMP ${res.status}` }, { status: 502 });
        }

        const rawEvents: any[] = await res.json();

        // Filter: US only, HIGH + MEDIUM impact
        const filtered = rawEvents
            .filter((e: any) => e.country === 'US')
            .filter((e: any) => {
                const impact = normalizeImpact(e.impact);
                return impact === 'HIGH' || impact === 'MEDIUM';
            })
            .map((e: any) => {
                const { date, time } = formatDate(e.date);
                return {
                    date,
                    time,
                    event: e.event,
                    impact: normalizeImpact(e.impact),
                    category: mapCategory(e.event),
                    actual: e.actual,
                    estimate: e.estimate,
                    previous: e.previous,
                    change: e.change,
                    changePercentage: e.changePercentage,
                    unit: e.unit,
                };
            })
            .sort((a: any, b: any) => {
                const dateA = `${a.date} ${a.time}`;
                const dateB = `${b.date} ${b.time}`;
                return dateA.localeCompare(dateB);
            });

        // Write to Redis
        await setInCache(REDIS_KEY, {
            events: filtered,
            totalRaw: rawEvents.length,
            totalUS: filtered.length,
            from,
            to,
            updatedAt: new Date().toISOString(),
        }, CACHE_TTL);

        console.log(`[econ-cal] ${filtered.length} US events (from ${rawEvents.length} total) → Redis`);

        return NextResponse.json({
            ok: true,
            totalRaw: rawEvents.length,
            totalUS: filtered.length,
            from,
            to,
            sample: filtered.slice(0, 3),
            ts: new Date().toISOString(),
        });
    } catch (err: any) {
        console.error('[econ-cal] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
