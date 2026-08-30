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
        if (cached) return NextResponse.json({ ...cached, _cached: true });
    } catch { /* continue */ }

    try {
        // Fetch last 200 GEX history entries (~17 days at 12/day)
        // [FIX] Add 5s timeout to prevent 15s+ DynamoDB hangs
        const historyPromise = getGexHistory(ticker, 200);
        const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('DynamoDB timeout (5s)')), 5000)
        );
        const history = await Promise.race([historyPromise, timeoutPromise]);

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

        // ★ 현재 ATM IV = «가장 최근» 항목.
        //
        //   ⚠️ 배열의 [0] 을 «최신»이라고 가정하면 안 된다. 같은 이름의
        //      getGexHistory 가 두 개이고 **정렬이 반대**다:
        //        lib/aws/historyStore      → scanForward:true  (오름차순)
        //        lib/aws/dynamoDataProvider → scanForward:false (내림차순)
        //      어느 것을 import 했느냐로 [0] 의 뜻이 뒤집힌다.
        //      → 순서에 기대지 말고 **timestamp 로** 최신을 고른다.
        //
        //   그리고 최신 몇 건이 비어 있어도 지표가 죽지 않게, atmIv 가 «있는»
        //   가장 최근 항목을 찾는다. 실측(2026-08-30 NVDA): 8/28 13:02 이후
        //   라이브 레코드에 atmIv 가 안 써지고 있었다(69/107) → 화면 IV RANK «—».
        const withIv = (history as any[])
            .filter((h) => h?.atmIv != null && Number(h.atmIv) > 0)
            .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
        const currentIv: number | null = withIv.length ? Number(withIv[0].atmIv) : null;
        const currentIvAt: number | null = withIv.length ? Number(withIv[0].timestamp) : null;

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
