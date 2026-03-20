
import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getMarketStatusSSOT } from '@/services/marketStatusProvider';
import { getFromCache, setInCache } from '@/services/redisClient';

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

        // [AWS] Redis cache check (2s TTL — same symbols batch within polling interval)
        const cacheKey = `live-quotes:${tickers.sort().join(',')}`;
        try {
            const cached = await getFromCache<any>(cacheKey);
            if (cached) {
                return NextResponse.json({ data: cached, session, timestamp: Date.now(), _cached: true }, {
                    headers: { 'Cache-Control': 'private, max-age=1, stale-while-revalidate=3' }
                });
            }
        } catch { /* continue to Polygon */ }

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

            // REG: Always use manual calc — Polygon todaysChangePerc uses inconsistent base for some tickers
            // PRE/POST/CLOSED: Calculate from day.c vs prevDay.c (regular session close)
            // [FIX V3] Polygon todaysChangePerc completely removed for REG — manual calc matches SSR formula exactly
            let changePercent = 0;
            const manualCalc = (liveLast > 0 && prevDayClose > 0) ? ((liveLast - prevDayClose) / prevDayClose) * 100 : 0;

            if (session === 'regular') {
                // Always use (lastTrade - prevDayClose) / prevDayClose — same as Yahoo/Google/SSR
                changePercent = manualCalc !== 0 ? manualCalc : todaysChangePerc;
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
                // [FIX] Provide PRE CLOSE badge during REG session from Polygon preMarket data
                const preMarketClose = S.preMarket?.c || 0;
                if (preMarketClose > 0) {
                    extendedPrice = preMarketClose;
                    extendedLabel = 'PRE';
                }
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

        // [AWS] Cache to ElastiCache (2s TTL — matches polling interval)
        try { await setInCache(cacheKey, data, 2); } catch { /* non-critical */ }

        return NextResponse.json({
            data,
            session,
            timestamp: Date.now()
        }, {
            headers: {
                // [PERF] Short stale-while-revalidate for browser-level caching during rapid 2s polling
                'Cache-Control': 'private, max-age=1, stale-while-revalidate=3',
            }
        });

    } catch (error) {
        console.error('[LiveAPI] Failed to fetch quotes:', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
