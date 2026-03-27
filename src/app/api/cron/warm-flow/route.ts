// Cron: Warm Flow Unified Cache — FULL 500 UNIVERSE
//
// Runs every 3 minutes during Pre+Regular+Post hours (UTC 8-23, Mon-Fri).
// Pre-warms cache:flow:unified:* keys in Redis for ALL 500 universe tickers
// using batch rotation: 50 batches × 10 tickers per invocation.
//
// Usage:
//   /api/cron/warm-flow          → auto-rotate batch based on current minute
//   /api/cron/warm-flow?batch=0  → explicit batch 0 (tickers 0-9)
//
// Full cycle: 3 min × 50 batches = 150 min for complete universe coverage.
// Lambda orchestrator triggers all 50 batches for ~8-min full refresh.
//
// Features:
//   - Retry up to 2 times on failure (zero-defect)
//   - Dual-write: Redis (5-min TTL) + DynamoDB (permanent)
//
// Vercel Cron schedule: every 3 min, 8-23 UTC, Mon-Fri

import { NextResponse, NextRequest } from 'next/server';
import { setInCache, getFromCache } from '@/services/redisClient';
import { putFlowCache } from '@/lib/aws/flowCacheProvider';
import { UNIVERSE_500 } from '@/lib/universe';
import { GET as getLiveTicker } from '@/app/api/live/ticker/route';
import { GET as getRealtimeMetrics } from '@/app/api/flow/realtime-metrics/route';
import { GET as getDarkPoolTrades } from '@/app/api/flow/dark-pool-trades/route';
import { GET as getWhaleTrades } from '@/app/api/live/options/trades/route';

const BATCH_SIZE = 10;
const TOTAL_BATCHES = Math.ceil(UNIVERSE_500.length / BATCH_SIZE); // 50
const CACHE_KEY_PREFIX = 'cache:flow:unified:';
const CACHE_TTL = 300; // 5 min
const MAX_RETRIES = 2; // Retry up to 2 times on failure

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function callInternalGet(handler: Function, url: string) {
    try {
        const mockReq = new NextRequest(url);
        const res = await handler(mockReq);
        if (!res || !res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function buildFlowData(ticker: string, baseUrl: string) {
    const start = Date.now();

    // [PERF] Include liveQuote (skip_alpha mode) so SSR page.tsx can hydrate instantly
    const [liveQuote, realtimeMetrics, darkPoolTrades, whaleTrades] = await Promise.all([
        callInternalGet(getLiveTicker, `${baseUrl}/api/live/ticker?t=${ticker}&skip_alpha=1`),
        callInternalGet(getRealtimeMetrics, `${baseUrl}/api/flow/realtime-metrics?t=${ticker}`),
        callInternalGet(getDarkPoolTrades, `${baseUrl}/api/flow/dark-pool-trades?t=${ticker}`),
        callInternalGet(getWhaleTrades, `${baseUrl}/api/live/options/trades?t=${ticker}`),
    ]);

    return {
        liveQuote,
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
        realtimeMetrics,
        darkPoolTrades,
        whaleTrades,
        _source: 'warm-flow-cron',
    };
}

// Retry wrapper: attempts up to MAX_RETRIES+1 times
async function warmTickerWithRetry(ticker: string, baseUrl: string): Promise<'ok' | 'skip' | 'fail'> {
    const cacheKey = `${CACHE_KEY_PREFIX}${ticker}`;

    // Skip if cache is still fresh (< 2 min old)
    try {
        const existing = await getFromCache<any>(cacheKey);
        if (existing?.timestamp && (Date.now() - existing.timestamp) < 120_000) {
            return 'skip';
        }
    } catch { /* continue */ }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const data = await buildFlowData(ticker, baseUrl);
            if (data.realtimeMetrics || data.darkPoolTrades) {
                // Dual-write: Redis (fast) + DynamoDB (permanent)
                await Promise.all([
                    setInCache(cacheKey, data, CACHE_TTL),
                    putFlowCache(ticker, data),
                ]);
                return 'ok';
            }
            // Data came back empty — retry
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
            }
        } catch {
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
    return 'fail';
}

export async function GET(request: Request) {
    const start = Date.now();
    const baseUrl = request.url.split('/api/')[0];
    const { searchParams } = new URL(request.url);

    // Determine batch number: explicit param or auto-rotate by minute
    let batchNum = parseInt(searchParams.get('batch') || '-1');
    if (batchNum < 0 || batchNum >= TOTAL_BATCHES) {
        const minuteOfHour = new Date().getMinutes();
        batchNum = Math.floor(minuteOfHour / 3) % TOTAL_BATCHES;
    }

    const batchStart = batchNum * BATCH_SIZE;
    const batchTickers = UNIVERSE_500.slice(batchStart, batchStart + BATCH_SIZE);

    let warmed = 0;
    let skipped = 0;
    let failed = 0;
    const retried: string[] = [];

    try {
        // Process 2 tickers concurrently (each ticker = 3 Polygon API calls)
        const CONCURRENCY = 2;
        for (let i = 0; i < batchTickers.length; i += CONCURRENCY) {
            const chunk = batchTickers.slice(i, i + CONCURRENCY);

            const results = await Promise.all(chunk.map(async (ticker) => {
                const result = await warmTickerWithRetry(ticker, baseUrl);
                return { ticker, result };
            }));

            for (const { ticker, result } of results) {
                if (result === 'ok') warmed++;
                else if (result === 'skip') skipped++;
                else { failed++; retried.push(ticker); }
            }
        }

        const duration = Date.now() - start;
        return NextResponse.json({
            success: true,
            batch: batchNum,
            totalBatches: TOTAL_BATCHES,
            batchTickers,
            warmed,
            skipped,
            failed,
            retried,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            batch: batchNum,
            error: error.message,
            warmed,
            skipped,
        }, { status: 500 });
    }
}
