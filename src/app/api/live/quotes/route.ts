
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

        // ── [P1 FIX] Fetch snapshot ONLY — no daily aggs ──
        // Previous version fetched snapshot + 2-day historical bars per ticker (2 API calls each).
        // For a 5-second poll this was too heavy. The full 30s poll handles regChangePct accurately.
        // Here we only need live price + prevDay for display.
        const results = await Promise.all(
            tickers.map(async ticker => {
                try {
                    const snapshotRes = await fetchMassive(
                        `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
                        {},
                        false,
                        undefined,
                        { cache: 'no-store' as RequestCache }
                    );
                    const snapshot = snapshotRes?.ticker || {};
                    return { ticker, snapshot, error: null };
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

            // [FIX] changePercent: during REG use liveLast (real-time), otherwise dayClose
            // dayClose can be stale during intraday trading
            const priceForChange = (session === 'regular' && liveLast > 0) ? liveLast : dayClose;
            const changePercent = (priceForChange > 0 && prevDayClose > 0)
                ? ((priceForChange - prevDayClose) / prevDayClose) * 100
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
                change: dayClose - prevDayClose,
                changePercent,
                regChangePct: changePercent,
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
