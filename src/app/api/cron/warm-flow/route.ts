// Cron: Warm Flow Unified Cache — FULL UNIVERSE
//
// Runs every 3 minutes during market hours (UTC 14-21, Mon-Fri).
// Pre-warms cache:flow:unified:* keys in Redis for ALL 300 universe tickers
// using batch rotation: 30 batches × 10 tickers per invocation.
//
// Usage:
//   /api/cron/warm-flow          → auto-rotate batch based on current minute
//   /api/cron/warm-flow?batch=0  → explicit batch 0 (tickers 0-9)
//   /api/cron/warm-flow?batch=29 → explicit batch 29 (tickers 290-299)
//
// Full cycle: 3 min × 30 batches = 90 min for complete universe coverage.
// Lambda orchestrator triggers all 30 batches sequentially for 5-min full refresh.
//
// Architecture:
//   1. Calls realtime-metrics + dark-pool-trades + options/trades (whale) in parallel
//   2. Writes combined data to Redis (hot cache, 5-min TTL)
//   3. Writes to DynamoDB signum-flow-history (permanent, Tier 2 fallback)
//
// Vercel Cron schedule: every 3 min, 14-21 UTC, Mon-Fri

import { NextResponse, NextRequest } from 'next/server';
import { setInCache, getFromCache } from '@/services/redisClient';
import { putFlowCache } from '@/lib/aws/flowCacheProvider';
import { GET as getRealtimeMetrics } from '@/app/api/flow/realtime-metrics/route';
import { GET as getDarkPoolTrades } from '@/app/api/flow/dark-pool-trades/route';
import { GET as getWhaleTrades } from '@/app/api/live/options/trades/route';

// Full 300 Universe — same as Lambda signum-harvest & warm-command
const UNIVERSE = ["AAPL","ABBV","ABNB","ABT","ACN","ADBE","ADI","ADP","AEP","AFRM","AI","AMAT","AMD","AMGN","AMZN","ANET","ANSS","APD","ARE","ARM","ASML","ASTS","AVGO","AWK","AXP","BA","BAC","BBY","BIIB","BKNG","BLK","BMY","BSX","C","CARR","CAT","CCI","CCJ","CDNS","CEG","CF","CHTR","CL","CMCSA","COIN","COP","COST","CPRT","CRM","CRWD","CTAS","CTSH","CVS","CVX","D","DASH","DD","DDOG","DE","DELL","DHR","DIS","DKNG","DLR","DOV","DOW","DPZ","DUK","DVN","DXCM","EA","EBAY","ECL","EL","EMR","ENPH","EOG","EQIX","EQR","ETN","FAST","FCX","FDX","FSLR","FTNT","FTV","GD","GE","GEV","GILD","GIS","GM","GOOGL","GRMN","GS","HAL","HCA","HD","HON","HOOD","HSIC","HSY","HUBS","HUM","IBM","ICE","IDXX","IFF","ILMN","INCY","INTC","IONQ","IP","IQV","IR","ISRG","IT","ITW","JNJ","JPM","KDP","KEY","KHC","KLAC","KMB","KO","KR","KTOS","LDOS","LIN","LLY","LMT","LOW","LRCX","LULU","LUNR","LVS","LYB","LYV","MA","MAR","MARA","MBLY","MCD","MCHP","MCO","MDB","MDLZ","MDT","MELI","MET","META","MGM","MNST","MO","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSI","MSTR","MTB","MTD","MU","NDAQ","NDSN","NEE","NEM","NET","NFLX","NKE","NOC","NOW","NSC","NTRS","NUE","NVDA","NVO","O","ODFL","OKTA","ON","ORCL","ORLY","OTIS","OXY","PANW","PARA","PATH","PAYX","PCAR","PCG","PEAK","PEG","PEP","PFE","PG","PHM","PL","PLD","PLTR","PM","PNC","PONY","POOL","PPG","PSA","PSX","PTC","PWR","PYPL","QCOM","REGN","RIOT","RIVN","RKLB","ROK","ROKU","ROP","ROST","RSG","RTX","S","SBAC","SBUX","SCHW","SE","SEDG","SERV","SHOP","SHW","SLB","SMCI","SMR","SNA","SNOW","SNPS","SO","SOFI","SPG","SQ","SRE","STE","STT","STX","STZ","SWK","SWKS","SYK","SYM","SYY","T","TDG","TEAM","TEL","TER","TFC","TJX","TMO","TMUS","TRGP","TROW","TRV","TSLA","TSM","TT","TTWO","TWLO","TXN","TYL","UBER","UNH","UNP","UPS","UPST","URI","USB","V","VFC","VICI","VKTX","VLO","VMC","VRSK","VRTX","VST","VTR","VTRS","VZ","WDAY","WELL","WFC","WMT","XOM","XYZ","ZS"];

const BATCH_SIZE = 10;
const TOTAL_BATCHES = Math.ceil(UNIVERSE.length / BATCH_SIZE); // 30
const CACHE_KEY_PREFIX = 'cache:flow:unified:';
const CACHE_TTL = 300; // 5 min — aligned with warm-command

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

    const [realtimeMetrics, darkPoolTrades, whaleTrades] = await Promise.all([
        callInternalGet(getRealtimeMetrics, `${baseUrl}/api/flow/realtime-metrics?t=${ticker}`),
        callInternalGet(getDarkPoolTrades, `${baseUrl}/api/flow/dark-pool-trades?t=${ticker}`),
        callInternalGet(getWhaleTrades, `${baseUrl}/api/live/options/trades?t=${ticker}`),
    ]);

    return {
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
        realtimeMetrics,
        darkPoolTrades,
        whaleTrades,
        _source: 'warm-flow-cron',
    };
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
    const batchTickers = UNIVERSE.slice(batchStart, batchStart + BATCH_SIZE);

    let warmed = 0;
    let skipped = 0;
    let failed = 0;

    try {
        // Process 2 tickers concurrently (each ticker = 3 Polygon API calls)
        const CONCURRENCY = 2;
        for (let i = 0; i < batchTickers.length; i += CONCURRENCY) {
            const chunk = batchTickers.slice(i, i + CONCURRENCY);

            await Promise.all(chunk.map(async (ticker) => {
                const cacheKey = `${CACHE_KEY_PREFIX}${ticker}`;

                // Skip if cache is still fresh (< 2 min old)
                try {
                    const existing = await getFromCache<any>(cacheKey);
                    if (existing?.timestamp && (Date.now() - existing.timestamp) < 120_000) {
                        skipped++;
                        return;
                    }
                } catch { /* continue */ }

                try {
                    const data = await buildFlowData(ticker, baseUrl);
                    if (data.realtimeMetrics || data.darkPoolTrades) {
                        // Dual-write: Redis (fast) + DynamoDB (permanent)
                        await Promise.all([
                            setInCache(cacheKey, data, CACHE_TTL),
                            putFlowCache(ticker, data),
                        ]);
                        warmed++;
                    } else {
                        failed++;
                    }
                } catch {
                    failed++;
                }
            }));
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
