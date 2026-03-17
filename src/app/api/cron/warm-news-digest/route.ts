// ============================================================================
// Guardian News Digest — Cron Warm Route (30 min interval)
// Calls the news-digest API to pre-warm Redis cache
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // 60s timeout for Gemini analysis

export async function GET(req: NextRequest) {
    // Security: CRON_SECRET check
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const { searchParams } = new URL(req.url);
    const secretParam = searchParams.get('secret');

    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
        const isParamValid = secretParam === cronSecret;
        if (!isHeaderValid && !isParamValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const startTime = Date.now();
    try {
        const baseUrl = req.url.split('/api/')[0];
        const res = await fetch(`${baseUrl}/api/guardian/news-digest?refresh=1`, {
            signal: AbortSignal.timeout(55000), // 55s (within 60s maxDuration)
            headers: {
                ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                    : {}),
            },
        });

        const data = await res.json();
        const latency = Date.now() - startTime;

        console.log(`[Cron/NewsDigest] ✅ Refreshed ${data.items?.length || 0} items in ${latency}ms`);

        return NextResponse.json({
            success: true,
            items: data.items?.length || 0,
            latencyMs: latency,
            generatedAt: data.generatedAt,
        });
    } catch (e: any) {
        console.error('[Cron/NewsDigest] ❌ Failed:', e);
        return NextResponse.json({
            success: false,
            error: e.message,
            latencyMs: Date.now() - startTime,
        }, { status: 500 });
    }
}
