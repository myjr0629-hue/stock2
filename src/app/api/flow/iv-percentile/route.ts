// True IV Percentile API
// Computes real historical percentile rank from DynamoDB GEX history (iv30 field — 30-day constant-maturity ATM IV, since 2026-10-04)
// Instead of simplified range mapping, this calculates where today's IV sits
// relative to the last N days of ATM IV data

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getGexHistory } from '@/lib/aws/dynamoDataProvider';
import { ivRankFromHistory, IV_RANK_WINDOW } from '@/lib/ivRank';

// [10/4] v2 — 정의가 바뀌었다(같은 세션·같은 값 반복 1회·낡은 창 stale). 미리보기·운영이 같은 Redis 라 옛 키를 같이 쓰면
//   옛 계산 값이 새 코드로, 새 값이 옛 코드로 10분씩 샌다 → 키를 나눈다(옛 키는 TTL 600초로 사라진다).
// [10/4 저녁] v3 — 재는 값이 atmIv(가장 가까운 만기) → iv30(30일 고정 만기)으로 바뀌었다. v2 의 옛 백분위(만기 점프 0%)가 새 코드로 새지 않게.
const CACHE_PREFIX = 'cache:iv-percentile:v3:';
const CACHE_TTL = 600; // 10 min (IV doesn't change fast)
// «수집 중» 응답도 잠깐 캐시한다 — 새 정의 행은 15분에 한 개씩 늘 뿐인데, 캐시가 없으면 모든 요청이 DynamoDB 200행을 읽는다
//   (10/4 운영 실측: 전환 직후 전 종목이 캐시 없는 응답이 되어 p50 0.63→0.79초). 창이 차는 순간의 지연은 최대 5분.
const COLLECTING_CACHE_TTL = 300;

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
        if (!rank.ok && rank.reason === 'collecting') {
            // 새 정의(IV30) 창을 채우는 중 — «수집 중»(미제공 아님). 창이 차면(IV_RANK_WINDOW 행) 자동으로 백분위가 나온다.
            const collecting = {
                ticker,
                percentile: null,
                collecting: true,
                collectingRows: rank.collectingRows ?? 0,
                currentIv: rank.currentIv ?? null,
                metric: 'iv30',
                sampleSize: rank.sampleSize,
                windowRows: rank.windowRows,
                window: IV_RANK_WINDOW,
                _source: 'dynamodb-collecting',
                timestamp: Date.now(),
            };
            await setInCache(cacheKey, collecting, COLLECTING_CACHE_TTL).catch(() => {});
            return NextResponse.json(collecting);
        }
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
            metric: 'iv30',
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
