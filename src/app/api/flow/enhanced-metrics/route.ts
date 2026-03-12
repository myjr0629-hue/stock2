// Enhanced Smart Money + UOA Metrics API
// Uses DynamoDB historical data (5-day lookback) for precision scoring
// Falls back to intraday-only when insufficient data
//
// Smart Money: 5-day directional consistency of whale trades
// UOA: 5-10 day OI baseline → z-score for unusual activity detection

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getGexHistory } from '@/lib/aws/dynamoDataProvider';
import { queryItems, TABLES } from '@/lib/aws/dynamoClient';

const CACHE_PREFIX = 'cache:enhanced-metrics:';
const CACHE_TTL = 600; // 10 min

// Smart Money: direction consistency over 5 trading sessions
function computeSmartMoneyConsistency(flowHistory: any[]): {
    consistency: number;   // 0-100 (% of days with same direction)
    direction: 'BULL' | 'BEAR' | 'NEUTRAL';
    streak: number;        // consecutive days in same direction
    sampleSize: number;
} | null {
    if (!flowHistory || flowHistory.length < 3) return null;

    let bullDays = 0, bearDays = 0;
    let currentStreak = 0;
    let lastDir: string | null = null;

    // Group by date (one entry per day, take latest per day)
    const dailyMap = new Map<string, any>();
    for (const entry of flowHistory) {
        const dateKey = new Date(entry.timestamp).toISOString().split('T')[0];
        if (!dailyMap.has(dateKey)) {
            dailyMap.set(dateKey, entry);
        }
    }

    const dailyEntries = Array.from(dailyMap.values()).slice(0, 5); // last 5 days
    if (dailyEntries.length < 3) return null;

    for (const entry of dailyEntries) {
        // Use opi direction as proxy for institutional direction
        const dir = (entry.opi > 10 || entry.whaleScore > 50) ? 'BULL'
                  : (entry.opi < -10 || entry.whaleScore < -50) ? 'BEAR'
                  : 'NEUTRAL';

        if (dir === 'BULL') bullDays++;
        else if (dir === 'BEAR') bearDays++;

        if (dir === lastDir && dir !== 'NEUTRAL') {
            currentStreak++;
        } else if (dir !== 'NEUTRAL') {
            currentStreak = 1;
        }
        lastDir = dir;
    }

    const totalDirectional = bullDays + bearDays;
    const dominant = bullDays >= bearDays ? 'BULL' : 'BEAR';
    const dominantCount = Math.max(bullDays, bearDays);
    const consistency = totalDirectional > 0
        ? Math.round((dominantCount / dailyEntries.length) * 100)
        : 0;

    return {
        consistency,
        direction: consistency >= 60 ? dominant : 'NEUTRAL',
        streak: currentStreak,
        sampleSize: dailyEntries.length,
    };
}

// UOA: z-score of today's OI relative to 5-10 day baseline
function computeUoaZScore(gexHistory: any[]): {
    zScore: number;        // how many std devs above average
    avgOI: number;         // average total OI over period
    currentOI: number;     // today's total OI
    sampleSize: number;
    isUnusual: boolean;    // z-score > 2.0
} | null {
    if (!gexHistory || gexHistory.length < 3) return null;

    // Group by date, take latest per day
    const dailyMap = new Map<string, any>();
    for (const entry of gexHistory) {
        const dateKey = new Date(entry.timestamp).toISOString().split('T')[0];
        if (!dailyMap.has(dateKey)) {
            dailyMap.set(dateKey, entry);
        }
    }

    const dailyEntries = Array.from(dailyMap.values());
    if (dailyEntries.length < 3) return null;

    const currentOI = (dailyEntries[0].totalCallOI || 0) + (dailyEntries[0].totalPutOI || 0);

    // Historical baseline (excluding today)
    const historicalOIs = dailyEntries.slice(1, 11).map(e =>
        (e.totalCallOI || 0) + (e.totalPutOI || 0)
    ).filter(v => v > 0);

    if (historicalOIs.length < 2) return null;

    const avgOI = historicalOIs.reduce((s, v) => s + v, 0) / historicalOIs.length;
    const variance = historicalOIs.reduce((s, v) => s + Math.pow(v - avgOI, 2), 0) / historicalOIs.length;
    const stdDev = Math.sqrt(variance);

    const zScore = stdDev > 0 ? Math.round(((currentOI - avgOI) / stdDev) * 10) / 10 : 0;

    return {
        zScore,
        avgOI: Math.round(avgOI),
        currentOI,
        sampleSize: historicalOIs.length,
        isUnusual: Math.abs(zScore) > 2.0,
    };
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = (searchParams.get('t') || searchParams.get('ticker') || '').toUpperCase();
    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const cacheKey = `${CACHE_PREFIX}${ticker}`;

    // Check Redis cache first
    try {
        const cached = await getFromCache<any>(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch { /* continue */ }

    try {
        // Parallel fetch: GEX history (for UOA) + Flow history (for Smart Money)
        const [gexHistory, flowHistory] = await Promise.all([
            getGexHistory(ticker, 60),  // ~5-10 days of 5-min data
            queryItems<any>(
                TABLES.FLOW_HISTORY,
                'ticker = :tk',
                { ':tk': ticker },
                { limit: 60, scanForward: false }
            ).catch(() => []),
        ]);

        const smartMoney = computeSmartMoneyConsistency(flowHistory);
        const uoa = computeUoaZScore(gexHistory);

        const result = {
            ticker,
            smartMoney: smartMoney || { consistency: null, direction: null, streak: null, sampleSize: 0 },
            uoa: uoa || { zScore: null, avgOI: null, currentOI: null, sampleSize: 0, isUnusual: null },
            _source: (smartMoney || uoa) ? 'dynamodb-enhanced' : 'insufficient-data',
            timestamp: Date.now(),
        };

        // Cache for 10 min
        await setInCache(cacheKey, result, CACHE_TTL).catch(() => {});

        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({
            ticker,
            smartMoney: { consistency: null, sampleSize: 0 },
            uoa: { zScore: null, sampleSize: 0 },
            _source: 'error',
            error: error.message,
        }, { status: 500 });
    }
}
