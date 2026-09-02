import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';
import { swrFetch } from '@/lib/cache/redisSWR';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/live/options/quotes?contract=O:NVDA250321C00180000&limit=50
 *
 * Fetches historical NBBO quotes for a specific options contract
 * via Massive REST API: /v3/quotes/{optionsTicker}
 *
 * Returns: bid/ask/spread history for IV Skew curve and quote analysis
 */
export async function GET(req: NextRequest) {
    const contract = req.nextUrl.searchParams.get('contract');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 200);
    const order = req.nextUrl.searchParams.get('order') || 'desc'; // desc = newest first

    if (!contract) {
        return NextResponse.json({ error: 'Missing contract parameter (e.g. O:NVDA250321C00180000)' }, { status: 400 });
    }

    const contractTicker = contract.toUpperCase().trim();

    // Validate options ticker format: O:XXXX...
    if (!contractTicker.startsWith('O:')) {
        return NextResponse.json({ error: 'Invalid contract format. Must start with O: (e.g. O:NVDA250321C00180000)' }, { status: 400 });
    }

    try {
        const result = await swrFetch(
            `options-quotes:${contractTicker}:${limit}`,
            async () => {
                // Massive REST API: /v3/quotes/{optionsTicker}
                const url = `/v3/quotes/${contractTicker}?limit=${limit}&order=${order}&sort=timestamp`;
                const data = await fetchMassive(url, {}, false, undefined, CACHE_POLICY.LIVE);

                // ⚠️ [2026-09-02] 「OK 인데 0건」을 막는다.
                //   /v3/quotes 는 Intrinio 이관 대상이 아니라(플랜에 틱 없음) 어댑터가
                //   { status:'OK', results:[], _unsupported:true } 를 돌려준다.
                //   그대로 두면 아래 성공 분기로 빠져 debug.status='OK' + count:0 이 나가,
                //   소비자가 «호가가 없다»와 «이 값은 못 준다»를 구분할 수 없다.
                //   같은 처지인 dark-pool-trades·short-squeeze 와 표식을 맞춘다.
                if ((data as any)?._unsupported) {
                    return {
                        contract: contractTicker,
                        count: 0,
                        quotes: [],
                        unavailable: true,
                        _reason: 'tick-data-not-in-plan',
                        debug: { status: 'UNAVAILABLE' },
                    };
                }

                if (!data?.results || !Array.isArray(data.results)) {
                    return {
                        contract: contractTicker,
                        count: 0,
                        quotes: [],
                        debug: { status: 'NO_DATA', raw: data?.status || 'unknown' }
                    };
                }

                // Transform quotes
                const quotes = data.results.map((q: any) => {
                    const bid = q.bid_price || 0;
                    const ask = q.ask_price || 0;
                    const mid = (bid > 0 && ask > 0) ? Math.round(((bid + ask) / 2) * 100) / 100 : 0;
                    const spread = (ask > 0 && bid > 0) ? Math.round((ask - bid) * 100) / 100 : 0;

                    // Timestamp: Massive returns nanoseconds
                    const tsNs = q.sip_timestamp || q.participant_timestamp || 0;
                    const tsMs = Math.floor(tsNs / 1000000);

                    return {
                        bid: Math.round(bid * 100) / 100,
                        bidSize: q.bid_size || 0,
                        ask: Math.round(ask * 100) / 100,
                        askSize: q.ask_size || 0,
                        mid,
                        spread,
                        bidExchange: q.bid_exchange || null,
                        askExchange: q.ask_exchange || null,
                        ts: tsMs,
                    };
                });

                return {
                    contract: contractTicker,
                    count: quotes.length,
                    quotes,
                    debug: {
                        status: 'OK',
                        totalResults: data.results.length,
                        nextUrl: data.next_url || null,
                    }
                };
            },
            { ttlSeconds: 15, keyPrefix: 'swr' }
        );

        return NextResponse.json({ ...result.data, _cache: result._cache });

    } catch (error: any) {
        console.error(`[API] Options quotes error for ${contractTicker}:`, error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            contract: contractTicker,
            quotes: [],
        }, { status: 500 });
    }
}
