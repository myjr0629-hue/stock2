
import { NextResponse } from 'next/server';
import { CentralDataHub } from '@/services/centralDataHub';

export const dynamic = 'force-dynamic'; // No caching allowed

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
        return NextResponse.json({ error: 'Symbols required' }, { status: 400 });
    }

    try {
        const tickers = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

        // [V4.4] Use CentralDataHub for session-aware pricing
        // This matches /api/live/ticker logic exactly
        const marketStatus = await CentralDataHub.getMarketStatus();
        const session = marketStatus.session; // 'pre', 'regular', 'post', 'closed'

        const results = await Promise.all(
            tickers.map(async ticker => {
                try {
                    const quote = await CentralDataHub.getUnifiedData(ticker, false);
                    return { ticker, quote, error: null };
                } catch (e: any) {
                    return { ticker, quote: null, error: e.message };
                }
            })
        );

        const data: Record<string, any> = {};

        results.forEach(({ ticker, quote, error }) => {
            if (!quote || error) {
                data[ticker] = { price: 0, changePercent: 0, error };
                return;
            }

            // [V4.4] Session-Aware Pricing from CentralDataHub
            // Main Display = Regular Session Close (for changePct calculation)
            // Extended = After-Hours or Pre-Market
            const mainPrice = quote.price || 0;
            const prevClose = quote.prevClose || 0;
            let changePct = quote.finalChangePercent ?? quote.changePct ??
                (mainPrice && prevClose ? ((mainPrice - prevClose) / prevClose) * 100 : 0);

            // [V4.5] Rollover Fix: Show PREVIOUS session's change when current is 0%
            // This happens during PRE session or when date rolled over
            const history3d = quote.history3d || [];
            if ((changePct === 0 || quote.isRollover) && history3d.length >= 2) {
                const lastClose = history3d[0]?.c || 0;
                const prevLastClose = history3d[1]?.c || 0;
                if (lastClose > 0 && prevLastClose > 0) {
                    changePct = ((lastClose - prevLastClose) / prevLastClose) * 100;
                }
            }

            // Extended Price (separate from main price)
            const extendedPrice = quote.extendedPrice || 0;
            const extendedChangePct = (extendedPrice > 0 && mainPrice > 0)
                ? ((extendedPrice - mainPrice) / mainPrice) * 100
                : 0;

            data[ticker] = {
                // Main Price (Regular Session Close)
                price: mainPrice,
                previousClose: prevClose,
                prevClose: prevClose,
                change: mainPrice - prevClose,
                changePercent: changePct,
                // Extended Session (if different)
                extendedPrice: extendedPrice > 0 && extendedPrice !== mainPrice ? extendedPrice : 0,
                extendedChange: extendedPrice > 0 ? extendedPrice - mainPrice : 0,
                extendedChangePercent: extendedChangePct,
                extendedLabel: quote.extendedLabel,
                // Flow Data
                volume: quote.volume || 0,
                relVol: quote.relVol || 1,
                // Session info
                session: session,
                priceSource: quote.priceSource,
                // History for sparklines
                history3d: quote.history3d || [],
                // Timestamp
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
