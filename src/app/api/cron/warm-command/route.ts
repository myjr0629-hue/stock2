/**
 * [Phase 3] Cron: Warm Command — DynamoDB → Redis Sync
 * 
 * Runs every 3 minutes during market hours.
 * ROLE: Read COMPLETE data from DynamoDB unified-cache (written by Lambda v7)
 *       → Copy to Redis for fast Vercel reads.
 * 
 * NO Polygon API calls. NO data collection. Read + Copy only.
 * 
 * Overview translations: Fetched via /api/live/overview (Vercel internal)
 * because Lambda stores English-only data.
 * 
 * Redis Conflict Prevention:
 * - Only overwrites if DynamoDB data has >= 7 fields (completeness check)
 * - If DynamoDB read fails, existing Redis cache is preserved (no deletion)
 * - Atomic SET: entire data object written in one Redis SET call
 * - TTL: 30min market / 72h off-hours (same as before)
 * 
 * Batch rotation: 3 min × 51 batches = ~2.5 hours for full 509 coverage.
 * During market, Lambda runs every 5 min → DynamoDB always fresh.
 */

import { NextResponse } from 'next/server';
import { setInCache, getFromCache } from '@/services/redisClient';
import { getUnifiedCache } from '@/lib/aws/unifiedCacheProvider';
import { GET as getOverview } from '@/app/api/live/overview/route';
import { NextRequest } from 'next/server';

// Full 500 Universe — shared master list
import { UNIVERSE_500 } from '@/lib/universe';

const BATCH_SIZE = 10;
const TOTAL_BATCHES = Math.ceil(UNIVERSE_500.length / BATCH_SIZE);
const CACHE_KEY_PREFIX = 'cache:command:unified:';
const OVERVIEW_KEY_PREFIX = 'cache:command:overview:';
const CACHE_TTL_MARKET = 1800;    // 30 min
const CACHE_TTL_OFFHOURS = 259200; // 72 hours
const OVERVIEW_LOCALES = ['ko', 'en', 'ja'] as const;
const DYNAMO_READ_TIMEOUT_MS = 3000; // 3s timeout per DynamoDB read

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

// Fetch overview with timeout
async function fetchOverview(baseUrl: string, ticker: string, locale: string): Promise<any> {
    try {
        const mockReq = new NextRequest(`${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`);
        const result = await Promise.race([
            getOverview(mockReq).then(async (res: any) => {
                if (!res || !res.ok) return null;
                return await res.json();
            }),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 8000))
        ]);
        return result;
    } catch {
        return null;
    }
}

export async function GET(request: Request) {
    const start = Date.now();
    const baseUrl = request.url.split('/api/')[0];
    const { searchParams } = new URL(request.url);
    
    // Determine batch number
    let batchNum = parseInt(searchParams.get('batch') || '-1');
    if (batchNum < 0 || batchNum >= TOTAL_BATCHES) {
        const minuteOfHour = new Date().getMinutes();
        batchNum = Math.floor(minuteOfHour / 3) % TOTAL_BATCHES;
    }

    const batchStart = batchNum * BATCH_SIZE;
    const batchTickers = UNIVERSE_500.slice(batchStart, batchStart + BATCH_SIZE);

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const results: string[] = [];

    try {
        // Process tickers in pairs (2 concurrent)
        const CONCURRENCY = 2;
        for (let i = 0; i < batchTickers.length; i += CONCURRENCY) {
            const chunk = batchTickers.slice(i, i + CONCURRENCY);

            await Promise.all(chunk.map(async (ticker) => {
                const dataCacheKey = `${CACHE_KEY_PREFIX}${ticker}`;

                // Skip if Redis cache is still fresh (< 2 min old)
                try {
                    const existing = await getFromCache<any>(dataCacheKey);
                    if (existing?.timestamp && (Date.now() - existing.timestamp) < 120_000) {
                        skipped++;
                        return;
                    }
                } catch { /* continue */ }

                try {
                    // === Step 1: Read from DynamoDB unified-cache (Lambda v7 writes here) ===
                    const dynamoData = await Promise.race([
                        getUnifiedCache(ticker, 'en'),
                        new Promise<null>(resolve => setTimeout(() => {
                            console.warn(`[warm-command] DynamoDB timeout (${DYNAMO_READ_TIMEOUT_MS}ms): ${ticker}`);
                            resolve(null);
                        }, DYNAMO_READ_TIMEOUT_MS))
                    ]);

                    if (!dynamoData) {
                        // DynamoDB failed or empty — preserve existing Redis cache
                        results.push(`${ticker}:⏭️`);
                        return;
                    }

                    // === Step 2: Completeness check — don't overwrite Redis with incomplete data ===
                    const CORE_FIELDS = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'] as const;
                    const fieldCount = CORE_FIELDS.filter(f => (dynamoData as any)[f]).length;
                    
                    if (fieldCount < 3) {
                        // Too incomplete — skip (preserve existing Redis data)
                        results.push(`${ticker}:⚠️(${fieldCount}/9)`);
                        return;
                    }

                    // === Step 3: Atomic write to Redis (data, language-independent) ===
                    const { _source, _ageMs, ...cleanData } = dynamoData;
                    await setInCache(dataCacheKey, cleanData, getSmartTTL());

                    // === Step 4: Overview translations (ko/en/ja) ===
                    // DynamoDB has English-only overview from Lambda
                    // We need translations for ko/ja
                    for (const locale of OVERVIEW_LOCALES) {
                        const overviewKey = `${OVERVIEW_KEY_PREFIX}${ticker}:${locale}`;
                        
                        // Check if overview already cached and fresh
                        try {
                            const existingOverview = await getFromCache<any>(overviewKey);
                            if (existingOverview && existingOverview.overview) {
                                continue; // Already has translated overview
                            }
                        } catch { /* continue */ }
                        
                        // Fetch translated overview via /api/live/overview
                        const overview = await fetchOverview(baseUrl, ticker, locale);
                        if (overview) {
                            await setInCache(overviewKey, overview, getSmartTTL()).catch(() => {});
                        }
                    }

                    synced++;
                    results.push(`${ticker}:✅(${fieldCount}/9)`);
                } catch (e) {
                    failed++;
                    results.push(`${ticker}:❌`);
                }
            }));
        }

        const duration = Date.now() - start;
        return NextResponse.json({
            success: true,
            mode: 'dynamo-to-redis-sync',
            batch: batchNum,
            totalBatches: TOTAL_BATCHES,
            batchTickers,
            duration: `${duration}ms`,
            synced,
            skipped,
            failed,
            total: batchTickers.length,
            languages: OVERVIEW_LOCALES,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            mode: 'dynamo-to-redis-sync',
            batch: batchNum,
            error: error.message,
            synced,
            skipped,
            failed,
        }, { status: 500 });
    }
}
