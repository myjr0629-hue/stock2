// Portfolio Batch API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [V3.2] Uses Alpha Engine V3 (calculateAlphaScore) - SAME engine as Watchlist
// [PERF] Uses lightweight stock data (no chart/minute data) for faster response

import { NextResponse } from 'next/server';
import { processPortfolioBatch } from '@/services/portfolioBatchService';
import { getOptionsData } from '@/services/stockApi';
import { calculateAlphaScore, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchMassive } from '@/services/massiveClient';
import { getAnalysisCacheForTickers, type AnalysisCacheEntry } from '@/services/analysisCache';

// [PERF] Lightweight stock data fetcher - same as watchlist batch
async function getStockDataLight(symbol: string) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

    const [snapRes, rsiRes, dailyAggs] = await Promise.all([
        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
        fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }).catch(() => null),
        fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${to}`, { limit: '5000', adjust: 'true', sort: 'asc' }).catch(() => null)
    ]);

    const t = snapRes?.ticker;
    if (!t) return null;

    // Session detection (same as watchlist batch)
    const { getETNow } = await import('@/services/timezoneUtils');
    const et = getETNow();
    const etTime = et.hour + et.minute / 60;

    let session: 'pre' | 'reg' | 'post' = 'reg';
    if (!et.isWeekend) {
        if (etTime >= 4 && etTime < 9.5) session = 'pre';
        else if (etTime >= 16 && etTime < 20) session = 'post';
        else if (etTime >= 9.5 && etTime < 16) session = 'reg';
        else session = (etTime >= 20 || etTime < 4) ? 'post' : 'reg';
    }

    // Price calculation (same as watchlist batch)
    const prevClose = t?.prevDay?.c || 0;
    const todayClose = t?.day?.c || prevClose;
    const latestPrice = t?.lastTrade?.p || t?.min?.c || t?.day?.c || t?.prevDay?.c || 0;

    let changeBase = prevClose;
    if (session === 'post') changeBase = todayClose;

    const isExtended = session !== 'reg';
    const extChange = isExtended ? (latestPrice - changeBase) : undefined;
    const extChangePercent = isExtended ? (changeBase !== 0 ? ((latestPrice - changeBase) / changeBase) * 100 : 0) : undefined;
    const regChange = t?.todaysChange || (todayClose - prevClose);
    const regChangePercent = t?.todaysChangePerc || (prevClose !== 0 ? ((todayClose - prevClose) / prevClose) * 100 : 0);

    const rsi = rsiRes?.results?.values?.[0]?.value ?? null;

    const dailyResults = (dailyAggs?.results || []).map((r: any) => ({ close: r.c, volume: r.v || 0 }));
    let return3d = 0;
    if (dailyResults.length >= 4) {
        const recentCandles = dailyResults.slice(-4);
        const price3dAgo = recentCandles[0].close;
        const currentClose = recentCandles[recentCandles.length - 1].close;
        return3d = ((currentClose - price3dAgo) / price3dAgo) * 100;
    }

    const sparkline = dailyResults.slice(-20).map((d: any) => d.close);

    return {
        symbol,
        price: latestPrice,
        change: isExtended ? (extChange || 0) : (regChange || 0),
        changePercent: isExtended ? (extChangePercent || 0) : (regChangePercent || 0),
        volume: t?.day?.v,
        prevClose,
        prevDayVolume: t?.prevDay?.v || 0,
        session,
        isExtended,
        extPrice: isExtended ? latestPrice : undefined,
        extChangePercent: isExtended ? extChangePercent : undefined,
        rsi,
        return3d,
        vwap: t?.day?.vw,
        history: sparkline.map((close: number) => ({ close })),
        dailyResults,
    };
}



// ============================================================================
// CORE BATCH PROCESSING LOGIC
// Exported separately so it can be called seamlessly during SSR (Server Components)
// without creating mock Request objects or failing on absolute URL resolution
// ============================================================================
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam) {
        return NextResponse.json({ error: 'tickers required (comma-separated)' }, { status: 400 });
    }

    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

    if (tickers.length === 0) {
        return NextResponse.json({ error: 'No valid tickers provided' }, { status: 400 });
    }

    if (tickers.length > 30) {
        return NextResponse.json({ error: 'Max 30 tickers per request' }, { status: 400 });
    }

    const mode = (searchParams.get('mode') as 'full' | 'price') || 'full';

    const payload = await processPortfolioBatch(tickers, mode);
    return NextResponse.json(payload);
}
