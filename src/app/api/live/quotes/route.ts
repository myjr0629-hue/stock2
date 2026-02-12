
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

        // ── Fetch snapshot + 2-day historical bars in parallel for each ticker ──
        // Historical bars needed for accurate regChangePct (same approach as /api/live/ticker)
        const now = new Date();
        const toDate = now.toISOString().split('T')[0]; // Today
        const fromDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 10 days back (covers weekends/holidays)

        const results = await Promise.all(
            tickers.map(async ticker => {
                try {
                    // Parallel: snapshot + 2-day historical bars
                    const [snapshotRes, aggRes] = await Promise.all([
                        fetchMassive(
                            `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
                            {},
                            false,
                            undefined,
                            { cache: 'no-store' as RequestCache }
                        ),
                        fetchMassive(
                            `/v2/aggs/ticker/${ticker}/range/1/day/${fromDate}/${toDate}`,
                            { adjusted: 'true', sort: 'desc', limit: '2' },
                            true  // cache OK for historical bars
                        )
                    ]);

                    const snapshot = snapshotRes?.ticker || {};
                    const bars = aggRes?.results || [];

                    return { ticker, snapshot, bars, error: null };
                } catch (e: any) {
                    return { ticker, snapshot: {}, bars: [], error: e.message };
                }
            })
        );

        const data: Record<string, any> = {};

        results.forEach(({ ticker, snapshot: S, bars, error }) => {
            if (error || !S) {
                data[ticker] = { price: 0, changePercent: 0, error };
                return;
            }

            const liveLast = S.lastTrade?.p || 0;
            const dayClose = S.day?.c || 0;
            const prevDayClose = S.prevDay?.c || 0;
            const prevClose = prevDayClose;

            // ── Baseline from historical bars (same as Command API) ──
            // bars[0] = most recent trading day close (= prevRegularClose)
            // bars[1] = day before (= prevPrevRegularClose)
            const prevRegularClose = bars[0]?.c || prevDayClose || 0;
            const prevPrevRegularClose = bars[1]?.c || 0;

            // ── Regular session change: prevRegularClose vs prevPrevRegularClose ──
            // This is the "본장 등락률" — doesn't change during PRE/POST
            const regChangePct = (prevRegularClose > 0 && prevPrevRegularClose > 0)
                ? ((prevRegularClose - prevPrevRegularClose) / prevPrevRegularClose) * 100
                : 0;

            // Session-aware price & extended price selection
            let price = 0;
            let extendedPrice = 0;
            let extendedLabel = '';

            if (session === 'regular') {
                price = liveLast || dayClose || prevClose;
            } else if (session === 'pre') {
                price = prevClose;
                extendedPrice = S.min?.c || liveLast || 0;
                extendedLabel = 'PRE';
            } else if (session === 'post') {
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

            const extendedChangePct = (extendedPrice > 0 && price > 0)
                ? ((extendedPrice - price) / price) * 100
                : 0;

            data[ticker] = {
                price,
                previousClose: prevClose,
                prevClose,
                change: prevRegularClose - prevPrevRegularClose,
                changePercent: regChangePct,
                regChangePct,
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
