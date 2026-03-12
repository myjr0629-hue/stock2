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

// Full 300 Universe — same as Lambda signum-harvest
const UNIVERSE = ["AAPL","ABBV","ABNB","ABT","ACN","ADBE","ADI","ADP","AEP","AFRM","AI","AMAT","AMD","AMGN","AMZN","ANET","ANSS","APD","ARE","ARM","ASML","ASTS","AVGO","AWK","AXP","BA","BAC","BBY","BIIB","BKNG","BLK","BMY","BSX","C","CARR","CAT","CCI","CCJ","CDNS","CEG","CF","CHTR","CL","CMCSA","COIN","COP","COST","CPRT","CRM","CRWD","CTAS","CTSH","CVS","CVX","D","DASH","DD","DDOG","DE","DELL","DHR","DIS","DKNG","DLR","DOV","DOW","DPZ","DUK","DVN","DXCM","EA","EBAY","ECL","EL","EMR","ENPH","EOG","EQIX","EQR","ETN","FAST","FCX","FDX","FSLR","FTNT","FTV","GD","GE","GEV","GILD","GIS","GM","GOOGL","GRMN","GS","HAL","HCA","HD","HON","HOOD","HSIC","HSY","HUBS","HUM","IBM","ICE","IDXX","IFF","ILMN","INCY","INTC","IONQ","IP","IQV","IR","ISRG","IT","ITW","JNJ","JPM","KDP","KEY","KHC","KLAC","KMB","KO","KR","KTOS","LDOS","LIN","LLY","LMT","LOW","LRCX","LULU","LUNR","LVS","LYB","LYV","MA","MAR","MARA","MBLY","MCD","MCHP","MCO","MDB","MDLZ","MDT","MELI","MET","META","MGM","MNST","MO","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSI","MSTR","MTB","MTD","MU","NDAQ","NDSN","NEE","NEM","NET","NFLX","NKE","NOC","NOW","NSC","NTRS","NUE","NVDA","NVO","O","ODFL","OKTA","ON","ORCL","ORLY","OTIS","OXY","PANW","PARA","PATH","PAYX","PCAR","PCG","PEAK","PEG","PEP","PFE","PG","PHM","PL","PLD","PLTR","PM","PNC","PONY","POOL","PPG","PSA","PSX","PTC","PWR","PYPL","QCOM","REGN","RIOT","RIVN","RKLB","ROK","ROKU","ROP","ROST","RSG","RTX","S","SBAC","SBUX","SCHW","SE","SEDG","SERV","SHOP","SHW","SLB","SMCI","SMR","SNA","SNOW","SNPS","SO","SOFI","SPG","SQ","SRE","STE","STT","STX","STZ","SWK","SWKS","SYK","SYM","SYY","T","TDG","TEAM","TEL","TER","TFC","TJX","TMO","TMUS","TRGP","TROW","TRV","TSLA","TSM","TT","TTWO","TWLO","TXN","TYL","UBER","UNH","UNP","UPS","UPST","URI","USB","V","VFC","VICI","VKTX","VLO","VMC","VRSK","VRTX","VST","VTR","VTRS","VZ","WDAY","WELL","WFC","WMT","XOM","XYZ","ZS"];

const BATCH_SIZE = 10;
const TOTAL_BATCHES = Math.ceil(UNIVERSE.length / BATCH_SIZE); // 30
const CACHE_KEY_PREFIX = 'cache:command:unified:';
const CACHE_TTL_SEC = 300; // 5 min
const LOCALES = ['ko', 'en'];

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

    return {
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
        structure, options: optionsAtm, earnings, sma, related,
        analyst, volatility, squeeze, institutional, fundamentals, overview,
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
    const results: string[] = [];

    try {
        // Process tickers in pairs (2 concurrent) to be gentle on Polygon rate limits
        const CONCURRENCY = 2;
        for (let i = 0; i < batchTickers.length; i += CONCURRENCY) {
            const chunk = batchTickers.slice(i, i + CONCURRENCY);

            await Promise.all(chunk.map(async (ticker) => {
                for (const locale of LOCALES) {
                    const cacheKey = `${CACHE_KEY_PREFIX}${ticker}:${locale}`;

                    // Skip if cache is still fresh (< 2 min old)
                    try {
                        const existing = await getFromCache<any>(cacheKey);
                        if (existing?.timestamp && (Date.now() - existing.timestamp) < 120_000) {
                            skipped++;
                            return;
                        }
                    } catch { /* continue */ }

                    try {
                        const data = await buildUnifiedData(ticker, baseUrl, locale);
                        if (data.structure || data.options) {
                            await setInCache(cacheKey, data, CACHE_TTL_SEC);
                            warmed++;
                            results.push(`${ticker}:${locale}:✅`);
                        } else {
                            results.push(`${ticker}:${locale}:⚠️`);
                        }
                    } catch {
                        results.push(`${ticker}:${locale}:❌`);
                    }
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
            total: batchTickers.length * LOCALES.length,
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
