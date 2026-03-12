// True IV Percentile API
// Computes real historical percentile rank from DynamoDB GEX history (atmIv field)
// Instead of simplified range mapping, this calculates where today's IV sits
// relative to the last N days of ATM IV data

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getGexHistory } from '@/lib/aws/dynamoDataProvider';

const CACHE_PREFIX = 'cache:iv-percentile:';
const CACHE_TTL = 600; // 10 min (IV doesn't change fast)

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = (searchParams.get('t') || searchParams.get('ticker') || '').toUpperCase();
    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const cacheKey = `${CACHE_PREFIX}${ticker}`;

    // Check Redis first
    try {
        const cached = await getFromCache<any>(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch { /* continue */ }

    try {
        // Fetch last 200 GEX history entries (~17 days at 12/day)
        const history = await getGexHistory(ticker, 200);

        if (!history || history.length < 5) {
            return NextResponse.json({
                ticker,
                percentile: null,
                currentIv: null,
                sampleSize: history?.length || 0,
                _source: 'dynamodb-insufficient',
            });
        }

        // Extract atmIv values from history (filter nulls)
        const ivValues = history
            .map((h: any) => h.atmIv)
            .filter((v: any) => v != null && v > 0)
            .sort((a: number, b: number) => a - b);

        if (ivValues.length < 5) {
            return NextResponse.json({
                ticker,
                percentile: null,
                currentIv: null,
                sampleSize: ivValues.length,
                _source: 'dynamodb-insufficient-iv',
            });
        }

        // Current ATM IV = most recent entry
        const currentIv = (history[0] as any).atmIv;

        if (!currentIv || currentIv <= 0) {
            return NextResponse.json({
                ticker,
                percentile: null,
                currentIv: null,
                sampleSize: ivValues.length,
                _source: 'dynamodb-no-current',
            });
        }

        // True percentile rank: % of historical values below current
        const belowCount = ivValues.filter((v: number) => v < currentIv).length;
        const percentile = Math.round((belowCount / ivValues.length) * 100);

        // Stats for context
        const min = ivValues[0];
        const max = ivValues[ivValues.length - 1];
        const median = ivValues[Math.floor(ivValues.length / 2)];

        const result = {
            ticker,
            percentile,
            currentIv: Math.round(currentIv * 100) / 100,
            sampleSize: ivValues.length,
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            median: Math.round(median * 100) / 100,
            _source: 'dynamodb-true-percentile',
            timestamp: Date.now(),
        };

        // Cache for 10 min
        await setInCache(cacheKey, result, CACHE_TTL).catch(() => {});

        return NextResponse.json(result);
    } catch (error: any) {
        console.error(`[IV Percentile] Error for ${ticker}:`, error.message);
        return NextResponse.json({
            ticker,
            percentile: null,
            error: error.message,
            _source: 'error',
        }, { status: 500 });
    }
}
