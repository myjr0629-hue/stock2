
import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getMarketStatusSSOT } from '@/services/marketStatusProvider';

export const dynamic = 'force-dynamic'; // No caching allowed

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
        return NextResponse.json({ error: 'Symbols required' }, { status: 400 });
    }

    try {
        const tickers = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        const marketStatus = await getMarketStatusSSOT();
        const session = marketStatus.session; // 'pre', 'regular', 'post', 'closed'

        // ── LIGHTWEIGHT: Polygon snapshot only (no cache, no options chain) ──
        // Each ticker snapshot = 1 fast API call vs CentralDataHub's 5+ calls
        const results = await Promise.all(
            tickers.map(async ticker => {
                try {
                    const snapshotRes = await fetchMassive(
                        `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
                        {},
                        false,                          // useCache = false (fresh data)
                        undefined,
                        { cache: 'no-store' as RequestCache }  // no HTTP cache
                    );
                    return { ticker, snapshot: snapshotRes?.ticker || {}, error: null };
                } catch (e: any) {
                    return { ticker, snapshot: {}, error: e.message };
                }
            })
        );

        const data: Record<string, any> = {};

        results.forEach(({ ticker, snapshot: S, error }) => {
            if (error || !S) {
                data[ticker] = { price: 0, changePercent: 0, error };
                return;
            }

            const liveLast = S.lastTrade?.p || 0;
            const dayClose = S.day?.c || 0;
            const prevDayClose = S.prevDay?.c || 0;
            const prevClose = prevDayClose;

            // Session-aware price selection
            let price = 0;
            let extendedPrice = 0;
            let extendedLabel = '';

            if (session === 'regular') {
                // REG: show live last trade price
                price = liveLast || dayClose || prevClose;
            } else if (session === 'pre') {
                // PRE: main = prev close, extended = pre-market live
                price = prevClose;
                extendedPrice = S.min?.c || liveLast || 0;
                extendedLabel = 'PRE';
            } else if (session === 'post') {
                // POST: main = reg close, extended = post-market live
                price = dayClose || prevClose;
                extendedPrice = S.min?.c || liveLast || 0;
                extendedLabel = 'POST';
            } else {
                // CLOSED
                price = dayClose || prevClose;
                if (S.afterHours?.p && S.afterHours.p > 0) {
                    extendedPrice = S.afterHours.p;
                    extendedLabel = 'POST';
                }
            }

            const changePct = (price > 0 && prevClose > 0)
                ? ((price - prevClose) / prevClose) * 100
                : 0;

            const extendedChangePct = (extendedPrice > 0 && price > 0)
                ? ((extendedPrice - price) / price) * 100
                : 0;

            data[ticker] = {
                price,
                previousClose: prevClose,
                prevClose,
                change: price - prevClose,
                changePercent: changePct,
                extendedPrice: extendedPrice > 0 && extendedPrice !== price ? extendedPrice : 0,
                extendedChange: extendedPrice > 0 ? extendedPrice - price : 0,
                extendedChangePercent: extendedChangePct,
                extendedLabel: extendedLabel || undefined,
                volume: S.day?.v || 0,
                session,
                lastUpdate: Date.now()
            };
        });

        return NextResponse.json({
            data,
            session,
            timestamp: Date.now()
        }, {
            headers: {
                'Cache-Control': 'no-store, max-age=0',
            }
        });

    } catch (error) {
        console.error('[LiveAPI] Failed to fetch quotes:', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
