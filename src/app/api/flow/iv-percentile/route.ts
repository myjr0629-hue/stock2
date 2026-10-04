// True IV Percentile API
// Computes real historical percentile rank from DynamoDB GEX history (atmIv field)
// Instead of simplified range mapping, this calculates where today's IV sits
// relative to the last N days of ATM IV data

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getGexHistory } from '@/lib/aws/dynamoDataProvider';
import { ivRankFromHistory, IV_RANK_WINDOW } from '@/lib/ivRank';

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
        // 최근 IV_RANK_WINDOW(200)개 — 정의·문턱은 src/lib/ivRank.ts 한 곳(웹·앱이 이 응답의 percentile 만 쓴다)
        // [FIX] Add 5s timeout to prevent 15s+ DynamoDB hangs
        const historyPromise = getGexHistory(ticker, IV_RANK_WINDOW);
        const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('DynamoDB timeout (5s)')), 5000)
        );
        const history = await Promise.race([historyPromise, timeoutPromise]);

        // nowMs — 수집 목록에서 빠진 종목의 낡은 창(DIA 8/28)을 «지금» 값으로 내지 않는다(stale = 미제공)
        const rank = ivRankFromHistory(history as any[] | null, { nowMs: Date.now() });
        if (!rank.ok) {
            // insufficient*(창 미달·IV 표본 부족)은 «이 종목은 이력이 모자란다» — 앱·웹 모두 «미제공».
            return NextResponse.json({
                ticker,
                percentile: null,
                currentIv: null,
                sampleSize: rank.sampleSize,
                windowRows: rank.windowRows,
                window: IV_RANK_WINDOW,
                _source: `dynamodb-${rank.reason}`,
            });
        }

        const result = {
            ticker,
            percentile: rank.percentile,
            currentIv: rank.currentIv,
            currentSession: rank.currentSession,
            sampleSize: rank.sampleSize,
            rawIvRows: rank.rawIvRows,
            min: rank.min,
            max: rank.max,
            median: rank.median,
            window: IV_RANK_WINDOW,
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
