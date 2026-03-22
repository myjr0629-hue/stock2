/**
 * [Phase 2.1] Cron: Warm Command Unified Cache — FULL UNIVERSE
 * 
 * Runs every 3 minutes during market hours (UTC 14-21, Mon-Fri).
 * Pre-warms cache:command:unified:* keys in Redis for ALL universe tickers
 * using batch rotation: 30 batches × 10 tickers × 2 locales.
 * 
 * Usage:
 *   /api/cron/warm-command          → auto-rotate batch based on current minute
 *   /api/cron/warm-command?batch=0  → explicit batch 0 (tickers 0-9)
 *   /api/cron/warm-command?batch=29 → explicit batch 29 (tickers 290-299)
 * 
 * Full cycle: 3 min × 30 batches = 90 min for complete universe coverage.
 * Lambda orchestrator can trigger all 30 batches in sequence for 5-min full refresh.
 * 
 * Vercel Cron: *​/3 14-21 * * 1-5
 */

import { NextResponse } from 'next/server';
import { setInCache, getFromCache } from '@/services/redisClient';
import { putUnifiedCache } from '@/lib/aws/unifiedCacheProvider';
import { GET as getStructure } from '@/app/api/live/options/structure/route';
import { GET as getAtm } from '@/app/api/live/options/atm/route';
import { GET as getEarnings } from '@/app/api/live/earnings/route';
import { GET as getSma } from '@/app/api/live/sma/route';
import { GET as getRelated } from '@/app/api/live/related/route';
import { GET as getAnalyst } from '@/app/api/live/analyst/route';
import { GET as getVolatility } from '@/app/api/live/volatility-regime/route';
import { GET as getSqueeze } from '@/app/api/live/short-squeeze/route';
import { GET as getInstitutional } from '@/app/api/flow/realtime-metrics/route';
import { GET as getFundamentals } from '@/app/api/live/fundamentals/route';
import { GET as getOverview } from '@/app/api/live/overview/route';
import { NextRequest } from 'next/server';

// Full 500 Universe — shared master list
import { UNIVERSE_500 } from '@/lib/universe';

const BATCH_SIZE = 10;
const TOTAL_BATCHES = Math.ceil(UNIVERSE_500.length / BATCH_SIZE); // 50
const CACHE_KEY_PREFIX = 'cache:command:unified:';    // Language-independent data
const OVERVIEW_KEY_PREFIX = 'cache:command:overview:'; // Language-specific overview
const CACHE_TTL_MARKET = 1800; // [극강] 30 min during market (was 5 min)
const CACHE_TTL_OFFHOURS = 259200; // 72 hours off-hours (covers Friday→Monday)
const OVERVIEW_LOCALES = ['ko', 'en', 'ja']; // All 3 languages for overview

// Smart TTL: short during market, long during off-hours
function getSmartTTL(): number {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin = utcHour * 60 + now.getUTCMinutes();
    const day = now.getUTCDay();
    const isMarketHours = day >= 1 && day <= 5 && utcMin >= 13 * 60 + 30 && utcMin <= 21 * 60;
    return isMarketHours ? CACHE_TTL_MARKET : CACHE_TTL_OFFHOURS;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_CALL_TIMEOUT_MS = 10000; // 10초 per API call — 서버 로그에서 확인: timeout 없으면 무한 대기

async function callInternalGet(handler: Function, url: string) {
    try {
        const mockReq = new NextRequest(url);
        const result = await Promise.race([
            handler(mockReq).then(async (res: any) => {
                if (!res || !res.ok) return null;
                return await res.json();
            }),
            new Promise<null>(resolve => setTimeout(() => {
                console.warn(`[warm-command] ⏱️ Timeout (${CRON_CALL_TIMEOUT_MS}ms): ${url.split('?')[0].split('/').pop()}`);
                resolve(null);
            }, CRON_CALL_TIMEOUT_MS))
        ]);
        return result;
    } catch {
        return null;
    }
}

async function buildUnifiedData(ticker: string, baseUrl: string, locale: string) {
    const start = Date.now();
    const [
        structure, optionsAtm, earnings, sma, related,
        analyst, volatility, squeeze, institutional, fundamentals, overview
    ] = await Promise.all([
        callInternalGet(getStructure, `${baseUrl}/api/live/options/structure?t=${ticker}`),
        callInternalGet(getAtm, `${baseUrl}/api/live/options/atm?t=${ticker}`),
        callInternalGet(getEarnings, `${baseUrl}/api/live/earnings?t=${ticker}`),
        callInternalGet(getSma, `${baseUrl}/api/live/sma?t=${ticker}`),
        callInternalGet(getRelated, `${baseUrl}/api/live/related?t=${ticker}`),
        callInternalGet(getAnalyst, `${baseUrl}/api/live/analyst?t=${ticker}`),
        callInternalGet(getVolatility, `${baseUrl}/api/live/volatility-regime?t=${ticker}`),
        callInternalGet(getSqueeze, `${baseUrl}/api/live/short-squeeze?t=${ticker}`),
        callInternalGet(getInstitutional, `${baseUrl}/api/flow/realtime-metrics?t=${ticker}`),
        callInternalGet(getFundamentals, `${baseUrl}/api/live/fundamentals?t=${ticker}`),
        callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`),
    ]);

    // Separate data (language-independent) from overview (language-specific)
    const data = {
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
        structure, options: optionsAtm, earnings, sma, related,
        analyst, volatility, squeeze, institutional, fundamentals,
    };

    return { data, overview };
}

export async function GET(request: Request) {
    const start = Date.now();
    const baseUrl = request.url.split('/api/')[0];
    const { searchParams } = new URL(request.url);
    
    // Determine batch number: explicit param or auto-rotate by minute
    let batchNum = parseInt(searchParams.get('batch') || '-1');
    if (batchNum < 0 || batchNum >= TOTAL_BATCHES) {
        // Auto-rotate: 3-min cron → each invocation covers the next batch
        const minuteOfHour = new Date().getMinutes();
        batchNum = Math.floor(minuteOfHour / 3) % TOTAL_BATCHES;
    }

    const batchStart = batchNum * BATCH_SIZE;
    const batchTickers = UNIVERSE_500.slice(batchStart, batchStart + BATCH_SIZE);

    let warmed = 0;
    let skipped = 0;
    const results: string[] = [];

    try {
        // Process tickers in pairs (2 concurrent) to be gentle on Polygon rate limits
        const CONCURRENCY = 2;
        for (let i = 0; i < batchTickers.length; i += CONCURRENCY) {
            const chunk = batchTickers.slice(i, i + CONCURRENCY);

            await Promise.all(chunk.map(async (ticker) => {
                const dataCacheKey = `${CACHE_KEY_PREFIX}${ticker}`; // Language-independent

                // Skip if data cache is still fresh (< 2 min old)
                try {
                    const existing = await getFromCache<any>(dataCacheKey);
                    if (existing?.timestamp && (Date.now() - existing.timestamp) < 120_000) {
                        skipped++;
                        return;
                    }
                } catch { /* continue */ }

                try {
                    // Step 1: Build data + overview for first locale (ko) together
                    const { data, overview: koOverview } = await buildUnifiedData(ticker, baseUrl, 'ko');
                    if (data.structure || data.options) {
                        // Step 2: Fetch overview for remaining locales in parallel
                        const [enOverview, jaOverview] = await Promise.all([
                            callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=en`),
                            callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=ja`),
                        ]);

                        // Step 3: Store data (1x Redis + 1x DynamoDB) + overview (3x Redis only)
                        await Promise.all([
                            setInCache(dataCacheKey, data, getSmartTTL()),                                // Data: language-independent
                            setInCache(`${OVERVIEW_KEY_PREFIX}${ticker}:ko`, koOverview, getSmartTTL()),   // Overview: ko (Redis only)
                            setInCache(`${OVERVIEW_KEY_PREFIX}${ticker}:en`, enOverview, getSmartTTL()),   // Overview: en (Redis only)
                            setInCache(`${OVERVIEW_KEY_PREFIX}${ticker}:ja`, jaOverview, getSmartTTL()),   // Overview: ja (Redis only)
                            putUnifiedCache(ticker, 'en', data),                                          // DynamoDB: data only (1x)
                        ]);
                        warmed++;
                        results.push(`${ticker}:✅`);
                    } else {
                        results.push(`${ticker}:⚠️`);
                    }
                } catch {
                    results.push(`${ticker}:❌`);
                }
            }));
        }

        const duration = Date.now() - start;
        return NextResponse.json({
            success: true,
            batch: batchNum,
            totalBatches: TOTAL_BATCHES,
            batchTickers,
            duration: `${duration}ms`,
            warmed,
            skipped,
            total: batchTickers.length,
            languages: OVERVIEW_LOCALES,
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
