// [vNext P3] Backfill Terminal Cron - 5분마다 실행
// Loops until completeCount=12 or max 3 loops
// Returns detailed layerCounts, invalidSymbols, missingByLayer

import { NextResponse } from 'next/server';
import { enrichTerminalItems } from '@/services/terminalEnricher';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const maxDuration = 25; // 25 seconds max (within Vercel limits)

const MAX_LOOPS = 3;
const LOOP_DELAY_MS = 400;

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

// Delay helper
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET(request: Request) {
    // Verify cron secret
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ ok: false, reason: 'UNAUTHORIZED' }, { status: 401 });
    }

    const startTime = Date.now();
    console.log('[Backfill vNext] Starting terminal evidence backfill...');

    try {
        const redis = Redis.fromEnv();

        // 1. Get latest report tickers (pre or open priority)
        let tickers: string[] = [];

        for (const type of ['pre', 'open', 'morning', 'eod']) {
            const reportKey = `reports:latest:${type}`;
            const report = await redis.get<any>(reportKey);

            if (report?.items && Array.isArray(report.items) && report.items.length > 0) {
                tickers = report.items.slice(0, 12).map((i: any) => i.ticker || i.symbol).filter(Boolean);
                console.log(`[Backfill vNext] Using ${type} report: ${tickers.length} tickers`);
                break;
            }
        }

        // Fallback to default universe if no report
        if (tickers.length === 0) {
            tickers = ['MSFT', 'AAPL', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'V', 'JPM', 'UNH', 'MA', 'XOM'];
            console.log('[Backfill vNext] Using fallback universe');
        }

        // 2. Loop until completeCount=12 or MAX_LOOPS reached
        let results: any[] = [];
        let loopCount = 0;
        let completeCount = 0;

        for (let loop = 0; loop < MAX_LOOPS; loop++) {
            if (Date.now() - startTime > 20000) break; // Safety: max 20s

            loopCount = loop + 1;
            console.log(`[Backfill vNext] Loop ${loopCount}/${MAX_LOOPS}...`);

            // Get incomplete tickers from previous loop
            const incompleteTickers = loop === 0
                ? tickers
                : results.filter(r => !r.complete).map(r => r.ticker);

            if (incompleteTickers.length === 0) break;

            // Enrich with force=true to bypass cache
            const newResults = await enrichTerminalItems(incompleteTickers, 'regular', true);

            // Merge results
            if (loop === 0) {
                results = newResults;
            } else {
                newResults.forEach(newItem => {
                    const idx = results.findIndex(r => r.ticker === newItem.ticker);
                    if (idx >= 0 && newItem.complete) {
                        results[idx] = newItem;
                    }
                });
            }

            completeCount = results.filter(r => r.complete).length;
            console.log(`[Backfill vNext] Loop ${loopCount}: ${completeCount}/${results.length} complete`);

            if (completeCount >= tickers.length) break;

            // Delay before next loop
            if (loop < MAX_LOOPS - 1) {
                await delay(LOOP_DELAY_MS);
            }
        }

        // 3. Calculate layer counts and missing
        const layerCounts = {
            price: results.filter(r => r.evidence?.price?.complete).length,
            options: results.filter(r => r.evidence?.options?.complete).length,
            flow: results.filter(r => r.evidence?.flow?.complete).length,
            macro: results.filter(r => r.evidence?.macro?.complete).length,
            stealth: results.filter(r => r.evidence?.stealth?.complete).length
        };

        const invalidSymbols = results.filter(r => !r.complete).map(r => r.ticker);

        const missingByLayer = {
            price: results.filter(r => !r.evidence?.price?.complete).map(r => r.ticker),
            options: results.filter(r => !r.evidence?.options?.complete).map(r => r.ticker),
            flow: results.filter(r => !r.evidence?.flow?.complete).map(r => r.ticker),
            macro: results.filter(r => !r.evidence?.macro?.complete).map(r => r.ticker),
            stealth: results.filter(r => !r.evidence?.stealth?.complete).map(r => r.ticker)
        };

        const elapsed = Date.now() - startTime;

        console.log(`[Backfill vNext] DONE: ${completeCount}/${tickers.length} in ${loopCount} loops, ${elapsed}ms`);

        return NextResponse.json({
            ok: true,
            tickers: tickers.length,
            completeCount,
            layerCounts,
            invalidSymbols,
            missingByLayer,
            loops: loopCount,
            elapsedMs: elapsed,
            tsISO: new Date().toISOString()
        });

    } catch (e: any) {
        console.error('[Backfill vNext] Error:', e);
        return NextResponse.json({
            ok: false,
            error: e.message || 'Backfill failed',
            elapsedMs: Date.now() - startTime
        }, { status: 500 });
    }
}
