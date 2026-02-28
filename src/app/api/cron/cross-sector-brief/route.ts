// ==========================================================================
// /api/cron/cross-sector-brief — Cron handler
// Runs at 21:50 UTC (after all 10 sector snapshots are done)
// ==========================================================================

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const startTime = Date.now();

    try {
        const baseUrl = request.url.split('/api/')[0];
        const bypassHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
            bypassHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
        }

        console.log('[Cron:CrossSectorBrief] Triggering POST /api/intel/cross-sector-brief...');

        const res = await fetch(`${baseUrl}/api/intel/cross-sector-brief`, {
            method: 'POST',
            headers: bypassHeaders,
            cache: 'no-store',
        });

        const data = await res.json();
        const elapsed = Date.now() - startTime;

        console.log(`[Cron:CrossSectorBrief] ${res.ok ? '✅' : '❌'} Completed in ${elapsed}ms`);

        return NextResponse.json({
            success: res.ok,
            elapsed_ms: elapsed,
            ...data,
        }, { status: res.ok ? 200 : 500 });

    } catch (e: any) {
        console.error('[Cron:CrossSectorBrief] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
