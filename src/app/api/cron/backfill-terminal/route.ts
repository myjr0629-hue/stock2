// [P0 Patch] Backfill Terminal Cron - 30분마다 실행
// Pre-warms evidence cache for latest report tickers

import { NextResponse } from 'next/server';
import { enrichTerminalItems } from '@/services/terminalEnricher';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max

// Vercel Cron header check
function verifyCronSecret(request: Request): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Allow in development
    if (process.env.NODE_ENV === 'development') return true;

    // Vercel Cron uses this header
    if (authHeader === `Bearer ${cronSecret}`) return true;

    // Also check query param for manual trigger
    const url = new URL(request.url);
    if (url.searchParams.get('secret') === cronSecret) return true;

    return false;
}

export async function GET(request: Request) {
    // Verify cron secret
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    console.log('[Backfill Cron] Starting terminal evidence backfill...');

    try {
        const redis = Redis.fromEnv();

        // 1. Get latest report tickers (pre or open priority)
        let tickers: string[] = [];

        for (const type of ['pre', 'open', 'morning', 'eod']) {
            const reportKey = `reports:latest:${type}`;
            const report = await redis.get<any>(reportKey);

            if (report?.items && Array.isArray(report.items) && report.items.length > 0) {
                tickers = report.items.slice(0, 12).map((i: any) => i.ticker || i.symbol).filter(Boolean);
                console.log(`[Backfill Cron] Using ${type} report: ${tickers.length} tickers`);
                break;
            }
        }

        // Fallback to default universe if no report
        if (tickers.length === 0) {
            tickers = ['MSFT', 'AAPL', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'V', 'JPM', 'UNH', 'MA', 'XOM'];
            console.log('[Backfill Cron] Using fallback universe');
        }

        // 2. Enrich all tickers (this updates Redis cache)
        const results = await enrichTerminalItems(tickers, 'regular');

        // 3. Calculate stats
        const completeCount = results.filter(r => r.complete).length;
        const optionsOk = results.filter(r => r.evidence?.options?.status === 'OK' || r.evidence?.options?.status === 'READY').length;
        const optionsNoOptions = results.filter(r => r.evidence?.options?.status === 'NO_OPTIONS').length;

        const elapsed = Date.now() - startTime;

        console.log(`[Backfill Cron] Complete: ${completeCount}/${results.length}, Options OK: ${optionsOk}, NO_OPTIONS: ${optionsNoOptions}, Time: ${elapsed}ms`);

        return NextResponse.json({
            ok: true,
            tickers: tickers.length,
            complete: completeCount,
            optionsOk,
            optionsNoOptions,
            elapsedMs: elapsed,
            timestamp: new Date().toISOString()
        });

    } catch (e: any) {
        console.error('[Backfill Cron] Error:', e);
        return NextResponse.json({
            ok: false,
            error: e.message || 'Backfill failed',
            elapsedMs: Date.now() - startTime
        }, { status: 500 });
    }
}
