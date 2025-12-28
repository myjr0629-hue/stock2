
import { NextResponse } from 'next/server';
import { getStockData, getStockNews, Range } from '@/services/stockApi';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const range = (searchParams.get('range') || '1d') as Range;

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    try {
        // Parallel fetch for speed
        const [stockData, news] = await Promise.all([
            getStockData(symbol, range),
            getStockNews(symbol)
        ]);

        return NextResponse.json({ ...stockData, news });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
