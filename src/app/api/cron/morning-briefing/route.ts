/**
 * GET /api/cron/morning-briefing
 * 
 * Vercel Cron — Runs at 08:00 ET (12:00 UTC) on weekdays.
 * Self-healing: generates Morning Briefing via Claude without depending on EC2 worker.
 * 
 * Flow:
 * 1. Read current guardian snapshot from Redis
 * 2. Read RLSI history from Redis
 * 3. POST to /api/guardian/briefing/generate (Claude Sonnet 4)
 * 4. Redis is auto-populated by the generate endpoint
 */

import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';

export const maxDuration = 60;

export async function GET(request: Request) {
    const startTime = Date.now();

    try {
        // 1. Get guardian snapshot from Redis (written by EC2 worker every ~30s)
        let snapshot: any = null;
        for (const locale of ['ko', 'en']) {
            const raw = await getFromCache<any>(`guardian:snapshot:${locale}`);
            if (raw) {
                snapshot = raw;
                break;
            }
        }

        // 2. Get RLSI history from Redis
        let rlsiHistory: any[] = [];
        try {
            const histRaw = await getFromCache<any>('guardian:rlsi_history');
            if (Array.isArray(histRaw)) rlsiHistory = histRaw;
        } catch { }

        // 3. Call the generate endpoint (self-call via same origin — matches all other crons)
        const baseUrl = request.url.split('/api/')[0];

        console.log(`[Cron Briefing] Calling generate API with snapshot: ${!!snapshot}, history: ${rlsiHistory.length} entries`);

        const res = await fetch(`${baseUrl}/api/guardian/briefing/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshot, rlsiHistory }),
            signal: AbortSignal.timeout(55000),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => 'unknown');
            console.error(`[Cron Briefing] Generate API returned ${res.status}: ${errText}`);
            return NextResponse.json({ success: false, error: `Generate API ${res.status}` }, { status: 500 });
        }

        const result = await res.json();
        const elapsed = Date.now() - startTime;

        if (result.success) {
            console.log(`[Cron Briefing] ✅ Generated in ${elapsed}ms (news: ${result.newsCount}, calendar: ${result.calendarCount})`);
            return NextResponse.json({
                success: true,
                elapsedMs: elapsed,
                newsCount: result.newsCount,
                calendarCount: result.calendarCount,
                savedToRedis: result.savedToRedis,
            });
        } else {
            console.error(`[Cron Briefing] Generate returned failure:`, result.error);
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

    } catch (e: any) {
        console.error(`[Cron Briefing] ❌ Error:`, e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
