import { NextRequest, NextResponse } from 'next/server';
import { swrFetch } from '@/lib/cache/redisSWR';

// API endpoint to get raw option chain data for FlowRadar
// This is the SAME data source used by COMMAND page via SSR
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t')?.toUpperCase();

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
    }

    try {
        const result = await swrFetch(
            `options-chain:${ticker}`,
            async () => {
                const { getOptionSnapshot } = await import('@/services/massiveClient');
                const rawChain = await getOptionSnapshot(ticker);
                return {
                    ticker,
                    rawChain: rawChain || [],
                    count: rawChain?.length || 0
                };
            },
            { ttlSeconds: 30, keyPrefix: 'swr' }
        );

        return NextResponse.json({ ...result.data, _cache: result._cache });
    } catch (error: any) {
        console.error(`[API] Raw chain fetch error for ${ticker}:`, error);
        return NextResponse.json({
            ticker,
            rawChain: [],
            count: 0,
            error: error.message
        });
    }
}
