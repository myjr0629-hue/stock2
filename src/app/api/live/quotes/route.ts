
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

        // ── [STRATEGY B] Batch Polygon snapshot — 1 API call instead of N ──
        // Previous: N parallel calls to /v2/snapshot/locale/us/markets/stocks/tickers/${ticker}
        // Now: Single batch call to /v2/snapshot/locale/us/markets/stocks/tickers?tickers=NVDA,TSLA,...
        // All downstream logic (session-aware price, changePct) is unchanged.
        const tickerString = tickers.join(',');
        let results: { ticker: string; snapshot: any; error: string | null }[] = [];

        try {
            const batchRes = await fetchMassive(
                `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerString}`,
                {},
                false,
                undefined,
                { cache: 'no-store' as RequestCache }
            );
            const snapshots = batchRes?.tickers || [];
            // Map batch response to same format as individual calls
            const snapshotMap: Record<string, any> = {};
            snapshots.forEach((s: any) => {
                if (s?.ticker) snapshotMap[s.ticker] = s;
            });
            results = tickers.map(ticker => ({
                ticker,
                snapshot: snapshotMap[ticker] || {},
                error: snapshotMap[ticker] ? null : 'no data in batch'
            }));
        } catch (batchErr: any) {
            // Fallback: if batch fails, try individual calls (original behavior)
            console.warn('[LiveAPI] Batch snapshot failed, falling back to individual calls:', batchErr.message);
            results = await Promise.all(
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
        }

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

            const todaysChangePerc = S.todaysChangePerc || 0;

            // REG: Use todaysChangePerc (live last trade is the correct reference)
            // PRE/POST/CLOSED: Calculate from day.c vs prevDay.c (regular session close)
            // [FIX] During PRE, day.c might equal prevDay.c. If so, don't force it to 0. Use todaysChangePerc as fallback if day.c === prevDay.c
            let changePercent = 0;
            if (session === 'regular') {
                // During regular hours: Polygon's live todaysChangePerc is accurate
                changePercent = todaysChangePerc !== 0 ? todaysChangePerc
                    : ((liveLast > 0 && prevDayClose > 0) ? ((liveLast - prevDayClose) / prevDayClose) * 100 : 0);
            } else {
                // PRE / POST / CLOSED
                if (dayClose > 0 && prevDayClose > 0 && dayClose !== prevDayClose) {
                    changePercent = ((dayClose - prevDayClose) / prevDayClose) * 100;
                } else if (session === 'pre' && todaysChangePerc !== 0) {
                    // During PRE-market, if dayClose hasn't updated from yesterday, 
                    // todaysChangePerc might hold the correct previous day's regular change.
                    changePercent = todaysChangePerc;
                } else {
                    changePercent = 0;
                }
            }

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
