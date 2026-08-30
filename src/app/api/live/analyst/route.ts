import { NextRequest, NextResponse } from 'next/server';
import { swrFetch } from '@/lib/cache/redisSWR';
import { getAnalystEvents } from '@/services/analystEvents';

const FMP_API_KEY = process.env.FMP_API_KEY || '';

/**
 * GET /api/live/analyst?t=NVDA
 * [AWS-FIRST] DynamoDB unified cache → FMP fallback
 */
export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t');
    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker parameter' }, { status: 400 });
    }

    try {
        const result = await swrFetch(
            `analyst:${ticker.toUpperCase()}`,
            async () => {
                // ── [AWS-FIRST] Tier 1: DynamoDB unified cache ──
                try {
                    const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                    const dynData = await getUnifiedCache(ticker.toUpperCase(), 'en');
                    if (dynData?.analyst && dynData.analyst.totalAnalysts > 0) {
                        const a = dynData.analyst;
                        console.log(`[live/analyst] ✅ DynamoDB hit for ${ticker}: ${a.consensus} (${a.totalAnalysts} analysts)`);
                        return {
                            ticker: ticker.toUpperCase(),
                            consensus: a.consensus || 'N/A',
                            totalAnalysts: a.totalAnalysts || 0,
                            bullishPct: a.bullishPct || 0,
                            breakdown: a.breakdown || { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 },
                            priceTarget: a.priceTarget || null,
                            _source: 'dynamodb',
                        };
                    }
                } catch (e: any) {
                    console.warn(`[live/analyst] DynamoDB error for ${ticker}:`, e.message);
                }

                // ── Tier 2: FMP fallback ──
                console.log(`[live/analyst] ⚠️ DynamoDB miss for ${ticker} — falling back to FMP`);
                if (!FMP_API_KEY) throw new Error('FMP_API_KEY not set');

                const [res, targetRes] = await Promise.all([
                    fetch(`https://financialmodelingprep.com/stable/grades-consensus?symbol=${ticker.toUpperCase()}&apikey=${FMP_API_KEY}`, { signal: AbortSignal.timeout(8000) }).catch(() => null),
                    fetch(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${ticker.toUpperCase()}&apikey=${FMP_API_KEY}`, { signal: AbortSignal.timeout(8000) }).catch(() => null)
                ]);

                if (!res || !res.ok) throw new Error(`FMP Consensus Failed`);
                const data = await res.json().catch(() => []);
                const grade = Array.isArray(data) ? data[0] : data;

                let priceTarget = null;
                if (targetRes && targetRes.ok) {
                    const targetData = await targetRes.json().catch(() => []);
                    if (Array.isArray(targetData) && targetData.length > 0) {
                        const t = targetData[0];
                        if (t.targetConsensus && t.targetHigh) {
                            priceTarget = { targetHigh: t.targetHigh, targetLow: t.targetLow, targetConsensus: t.targetConsensus };
                        }
                    }
                }

                if (!grade || (!grade.strongBuy && !grade.buy && !grade.hold)) {
                    return {
                        ticker: ticker.toUpperCase(),
                        consensus: 'N/A' as const,
                        totalAnalysts: 0, bullishPct: 0,
                        breakdown: { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 },
                        priceTarget,
                    };
                }

                const strongBuy = grade.strongBuy || 0;
                const buy = grade.buy || 0;
                const hold = grade.hold || 0;
                const sell = grade.sell || 0;
                const strongSell = grade.strongSell || 0;
                const totalAnalysts = strongBuy + buy + hold + sell + strongSell;
                const bullishPct = totalAnalysts > 0 ? Math.round(((strongBuy + buy) / totalAnalysts) * 100) : 0;

                let consensus: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL' | 'N/A' = 'N/A';
                if (grade.consensus) {
                    const fmpCon = grade.consensus.toUpperCase();
                    if (fmpCon === 'STRONG BUY') consensus = 'STRONG BUY';
                    else if (fmpCon === 'BUY') consensus = 'BUY';
                    else if (fmpCon === 'HOLD') consensus = 'HOLD';
                    else if (fmpCon === 'SELL') consensus = 'SELL';
                    else if (fmpCon === 'STRONG SELL') consensus = 'STRONG SELL';
                    else consensus = fmpCon as any;
                }
                if (consensus === 'N/A' && totalAnalysts > 0) {
                    const ws = (strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell) / totalAnalysts;
                    if (ws >= 4.3) consensus = 'STRONG BUY';
                    else if (ws >= 3.5) consensus = 'BUY';
                    else if (ws >= 2.5) consensus = 'HOLD';
                    else if (ws >= 1.7) consensus = 'SELL';
                    else consensus = 'STRONG SELL';
                }

                return {
                    ticker: ticker.toUpperCase(), consensus, totalAnalysts, bullishPct,
                    breakdown: { strongBuy, buy, hold, sell, strongSell },
                    priceTarget,
                    _source: 'fmp-fallback',
                };
            },
            { ttlSeconds: 3600, keyPrefix: 'swr' }
        );

        // ── 변화 이벤트 (등급 상하향 · 목표가 리비전) ────────────────────
        //   컨센서스 «스냅샷»과 캐시 경로가 다르다. DynamoDB 히트든 FMP 폴백이든
        //   **양쪽 모두** 이벤트를 갖도록 여기서 따로 붙인다. 위 result 안에만
        //   넣으면 DynamoDB 경로에선 영영 안 나온다(이번 이관에서 여러 번 당한 유형).
        //   실패해도 컨센서스는 그대로 나간다 — 보강이지 의존이 아니다.
        const events = await swrFetch(
            `analyst-events:${ticker.toUpperCase()}`,
            () => getAnalystEvents(ticker),
            { ttlSeconds: 6 * 3600, keyPrefix: 'swr' }
        ).then((r) => r.data).catch(() => null);

        return NextResponse.json({ ...result.data, events, _cache: result._cache });
    } catch (err) {
        console.error('[API /live/analyst] Error:', err);
        return NextResponse.json({ error: 'Failed to fetch analyst data' }, { status: 500 });
    }
}
