
import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getMarketStatusSSOT } from '@/services/marketStatusProvider';
import { getFromCache, setInCache } from '@/services/redisClient';
import { reconstructLastSession, type LastSessionData } from '@/services/lastSession';

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
        // [HOLIDAY] Reconstruct the last real session for tickers whose snapshot day
        // bar is empty (day.c=0 on a market holiday) — see src/services/lastSession.ts.
        // On weekends the snapshot keeps Friday's bar (day.c>0), so this never triggers there.
        let reconMap: Record<string, LastSessionData> = {};
        if (session === 'closed') {
            const holidayTickers = results
                .filter(r => r.snapshot && !(r.snapshot.day?.c))
                .map(r => r.ticker);
            if (holidayTickers.length > 0) {
                reconMap = await reconstructLastSession(holidayTickers);
            }
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
                // [FIX 2026-07-31] `dayClose !== prevDayClose` 조건을 제거했다.
                // 그 조건은 **진짜 보합(0.00%)을 «데이터 없음»으로 오판**했다. 실측: SOXL이
                // 7/30 114.72(+24.71%) → 7/31 114.72(0.00%)로 마감하자 day.c === prevDay.c가 되어
                // changePercent가 null이 됐고, null을 "다른 데서 가져오라"는 신호로 쓰는 클라이언트가
                // **7/30의 +24.71%를 7/31 자리에 그대로 표시**했다.
                // 원래 의도한 방어는 아래 주석대로 day.c=0(결측)이며 그건 `dayClose > 0`이 잡는다.
                // 휴일 미러(day 바가 prevDay를 복사)는 이 함수가 아니라 [HOLIDAY] recon 블록의
                // `session === 'closed' && !dayClose`가 잡으므로 여기서 중복 방어할 이유가 없다.
                if (dayClose > 0 && prevDayClose > 0) {
                    // 두 값이 같으면 식이 자연히 0을 낸다 — 보합은 유효한 답이지 결측이 아니다.
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

            if (session === 'regular') {
                price = liveLast || dayClose || prevClose;
                // [FIX V2] PRE CLOSE badge during REG: multiple fallback chain
                // Polygon preMarket.c is UNRELIABLE during REG (often 0/undefined)
                // Fallback order: preMarket.c → preMarket.o/h/l → Redis cache → day.o (today's open ≈ pre-market close)
                const preMarketClose = S.preMarket?.c || S.preMarket?.o || S.preMarket?.h || S.preMarket?.l || 0;
                if (preMarketClose > 0) {
                    extendedPrice = preMarketClose;
                    extendedLabel = 'PRE';
                } else if (cachedExt?.prePrice > 0) {
                    extendedPrice = cachedExt.prePrice;
                    extendedLabel = 'PRE';
                } else if (S.day?.o && S.day.o > 0 && prevDayClose > 0 && S.day.o !== prevDayClose) {
                    // day.o = today's market open price ≈ pre-market close
                    // Only use if different from prevClose (indicates pre-market activity)
                    extendedPrice = S.day.o;
                    extendedLabel = 'PRE';
                }
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

            // [HOLIDAY] Override with reconstructed last-session data when the snapshot
            // day bar is empty (day.c=0 on a market holiday), so change% and POST reflect
            // the last real session instead of collapsing to prevClose / 0.00% / a mirror.
            const recon = (session === 'closed' && !dayClose) ? reconMap[ticker] : undefined;
            const outPrice = recon ? recon.regClose : price;
            const outPrevClose = recon ? recon.prevClose : prevClose;
            const outChangePct = recon ? recon.changePct : changePercent;
            const outExtPrice = recon
                ? recon.postPrice
                : (extendedPrice > 0 && extendedPrice !== price ? extendedPrice : 0);
            const outExtLabel = recon
                ? (recon.postPrice > 0 ? 'POST' : undefined)
                : (extendedLabel || undefined);
            const outExtChangePct = recon ? recon.postChangePct : extendedChangePct;

            data[ticker] = {
                price: outPrice,
                previousClose: outPrevClose,
                prevClose: outPrevClose,
                change: outPrice - outPrevClose,
                changePercent: outChangePct,
                regChangePct: outChangePct,
                extendedPrice: outExtPrice,
                extendedChange: outExtPrice > 0 ? outExtPrice - outPrice : 0,
                extendedChangePercent: outExtChangePct,
                extendedLabel: outExtLabel,
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
