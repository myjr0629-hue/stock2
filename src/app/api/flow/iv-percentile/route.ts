import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getIv30DailyHistory } from '@/lib/aws/dynamoDataProvider';
import { ivRankFromHistory, IV_RANK_WINDOW } from '@/lib/ivRank';
const CACHE_PREFIX = 'cache:iv-percentile:v4-daily252:';
export async function GET(request: NextRequest) {
    const ticker = (request.nextUrl.searchParams.get('t') || request.nextUrl.searchParams.get('ticker') || '').toUpperCase();
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(ticker)) return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
    const cacheKey = `${CACHE_PREFIX}${ticker}`;
    const cached = await getFromCache<any>(cacheKey).catch(() => null);
    if (cached) return NextResponse.json({ ...cached, _cached: true });
    const nowMs = Date.now();
    try {
        const history = await getIv30DailyHistory(ticker, nowMs);
        const rank = ivRankFromHistory(history, { nowMs });
        const { ok, ...meta } = rank;
        const result = {
            ...meta, ticker, metric: 'iv30', window: IV_RANK_WINDOW, windowUnit: 'trading-days',
            percentile: ok ? rank.percentile : null,
            collecting: !ok && rank.reason === 'collecting',
            _source: ok ? 'dynamodb-true-percentile' : `dynamodb-${rank.reason}`,
            timestamp: nowMs,
        };
        await setInCache(cacheKey, result, ok ? 600 : 300).catch(() => {});
        return NextResponse.json(result);
    } catch {
        return NextResponse.json({ ticker, metric: 'iv30', percentile: null, currentIv: null, currentSession: null, currentIvAt: null, periodStart: null, periodEnd: null, sampleSize: null, windowUnit: 'trading-days', window: IV_RANK_WINDOW, _source: 'error' }, { status: 503 });
    }
}
