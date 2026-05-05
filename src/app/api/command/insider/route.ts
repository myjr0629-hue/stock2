// [SEC Form 4] Insider Trading API Endpoint
// Completely isolated — does NOT modify or depend on any existing route.
// GET /api/command/insider?ticker=TSLA

import { NextRequest, NextResponse } from 'next/server';
import { getInsiderSummary } from '@/services/insiderService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Simple in-memory cache to avoid hammering Polygon on rapid re-fetches
const insiderCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase();

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker parameter' }, { status: 400 });
    }

    // Check memory cache
    const cached = insiderCache.get(ticker);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return NextResponse.json(cached.data, {
            headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
                'X-Insider-Source': 'memory-cache',
            },
        });
    }

    try {
        const insider = await getInsiderSummary(ticker);
        const responseData = { ticker, insider };

        // Store in memory cache
        insiderCache.set(ticker, { data: responseData, ts: Date.now() });

        // Evict old entries (keep max 200 tickers)
        if (insiderCache.size > 200) {
            const oldestKey = insiderCache.keys().next().value;
            if (oldestKey) insiderCache.delete(oldestKey);
        }

        return NextResponse.json(responseData, {
            headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
                'X-Insider-Source': 'polygon-form4',
            },
        });
    } catch (error) {
        console.error(`[insider-api] Error for ${ticker}:`, error);
        return NextResponse.json({ ticker, insider: null, error: 'Failed to fetch insider data' }, {
            status: 200, // Don't fail the page — graceful degradation
            headers: { 'Cache-Control': 'no-cache' },
        });
    }
}
