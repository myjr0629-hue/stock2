
import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getMarketStatusSSOT } from '@/services/marketStatusProvider';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic'; // No caching allowed

// ── [REDIS OPT] In-memory cache for flow:extended — 60s TTL ──
// flow:extended data has 24h Redis TTL and changes rarely (pre/post prices).
// Caching in memory for 60s eliminates ~96% of Redis GET calls from 2s polling.
// Before: 14 tickers × Redis GET / 2s = 420 GET/min
// After:  14 tickers × Redis GET / 60s = 14 GET/min
const EXT_MEM_CACHE = new Map<string, { data: any; expiry: number }>();
const EXT_MEM_TTL_MS = 60_000; // 60 seconds

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

        // [FIX] Redis cache REMOVED — 2s TTL was conflicting with 2s polling interval,
        // causing stale prices to be returned repeatedly. Prices must ALWAYS be fresh from Polygon.
        // Browser-level Cache-Control header provides sufficient caching.

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

        // [REDIS OPT] Batch-fetch extended price cache — memory-first, Redis fallback
        // These are populated by /api/live/ticker (24h Redis TTL) and contain accurate pre/post prices.
        // Memory cache (60s TTL) avoids hitting Redis on every 2s poll cycle.
        const extCacheMap: Record<string, any> = {};
        const tickersNeedRedisExt: string[] = [];
        const now = Date.now();
        for (const ticker of tickers) {
            const memEntry = EXT_MEM_CACHE.get(ticker);
            if (memEntry && now < memEntry.expiry) {
                extCacheMap[ticker] = memEntry.data;
            } else {
                if (memEntry) EXT_MEM_CACHE.delete(ticker);
                tickersNeedRedisExt.push(ticker);
            }
        }
        if (tickersNeedRedisExt.length > 0) {
            await Promise.all(
                tickersNeedRedisExt.map(async (ticker) => {
                    try {
                        const cached = await getFromCache<any>(`flow:extended:${ticker}`);
                        if (cached) {
                            extCacheMap[ticker] = cached;
                            EXT_MEM_CACHE.set(ticker, { data: cached, expiry: Date.now() + EXT_MEM_TTL_MS });
                        }
                    } catch { /* non-critical */ }
                })
            );
        }
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
            let changePercent: number | null = 0;
            const manualCalc = (liveLast > 0 && prevDayClose > 0) ? ((liveLast - prevDayClose) / prevDayClose) * 100 : 0;

            if (session === 'regular') {
                // Always use (lastTrade - prevDayClose) / prevDayClose — same as Yahoo/Google/SSR
                changePercent = manualCalc !== 0 ? manualCalc : todaysChangePerc;
            } else {
                // PRE / POST / CLOSED
                if (dayClose > 0 && prevDayClose > 0 && dayClose !== prevDayClose) {
                    changePercent = ((dayClose - prevDayClose) / prevDayClose) * 100;
                } else {
                    // [FIX 2026-05-06] PRE 마켓에서 day.c=0이면 todaysChangePerc 사용 금지
                    // todaysChangePerc = (lastTrade - prevDay.c) / prevDay.c → PRE 가격 포함된 값이라 본장 등락률로 부정확
                    // null을 반환하면 클라이언트가 batch API의 정확한 값을 폴백으로 사용
                    changePercent = null;
                }
            }

            // Session-aware price & extended price selection
            let price = 0;
            let extendedPrice = 0;
            let extendedLabel = '';
            // [FIX] Redis-cached extended data (populated by /api/live/ticker, 24h TTL)
            const cachedExt = extCacheMap[ticker];

            if (session === 'regular') {\r
                price = liveLast || dayClose || prevClose;\r
                // [FIX 2026-05-06] REG 세션에서는 extended 배지 표시하지 않음\r
                // 본장 중에는 본장 가격만 표시. PRE 배지는 PRE 세션에서만 표시.\r
            } else if (session === 'pre') {
                price = prevClose;
                extendedPrice = S.min?.c || liveLast || 0;
                extendedLabel = 'PRE';
            } else if (session === 'post') {
                price = dayClose || prevClose;
                extendedPrice = S.min?.c || liveLast || 0;
                if (!extendedPrice && cachedExt?.postPrice > 0) {
                    extendedPrice = cachedExt.postPrice;
                }
                extendedLabel = 'POST';
            } else {
                // CLOSED
                price = dayClose || prevClose;
                if (S.afterHours?.p && S.afterHours.p > 0) {
                    extendedPrice = S.afterHours.p;
                    extendedLabel = 'POST';
                } else if (liveLast > 0 && dayClose > 0 && liveLast !== dayClose) {
                    // [FIX] lastTrade differs from regular close → after-hours trade occurred
                    // Polygon day.c = regular session close, lastTrade.p includes AH trades
                    // Threshold: prices must differ by >0.01% to avoid floating-point noise
                    const diff = Math.abs(liveLast - dayClose) / dayClose;
                    if (diff > 0.0001) {
                        extendedPrice = liveLast;
                        extendedLabel = 'POST';
                    }
                } else if (cachedExt?.postPrice > 0) {
                    extendedPrice = cachedExt.postPrice;
                    extendedLabel = 'POST';
                }
            }

            // [FIX V2] Calculate extendedChangePct with correct baseline
            // PRE: (prePrice - prevDayClose) / prevDayClose (measures pre-market movement from yesterday's close)
            // POST: (postPrice - dayClose) / dayClose (measures after-hours movement from today's close)
            let extendedChangePct = 0;
            if (extendedPrice > 0) {
                if (extendedLabel === 'PRE' && prevDayClose > 0) {
                    extendedChangePct = ((extendedPrice - prevDayClose) / prevDayClose) * 100;
                } else if (extendedLabel === 'POST' && price > 0) {
                    extendedChangePct = ((extendedPrice - price) / price) * 100;
                } else if (price > 0) {
                    extendedChangePct = ((extendedPrice - price) / price) * 100;
                }
            }
            // Override with cached changePct for better accuracy
            if (extendedLabel === 'PRE' && cachedExt?.preChangePct !== undefined && extendedPrice === cachedExt?.prePrice) {
                extendedChangePct = cachedExt.preChangePct;
            } else if (extendedLabel === 'POST' && cachedExt?.postChangePct !== undefined && extendedPrice === cachedExt?.postPrice) {
                extendedChangePct = cachedExt.postChangePct;
            }

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

        // [FIX] Redis cache write REMOVED — see cache read removal above

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
