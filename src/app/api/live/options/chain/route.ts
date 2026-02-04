import { NextRequest, NextResponse } from 'next/server';

// API endpoint to get raw option chain data for FlowRadar
// This is the SAME data source used by COMMAND page via SSR
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t')?.toUpperCase();

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
    }

    try {
        const { getOptionSnapshot } = await import('@/services/massiveClient');
        const rawChain = await getOptionSnapshot(ticker);

        return NextResponse.json({
            ticker,
            rawChain: rawChain || [],
            count: rawChain?.length || 0
        });
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
