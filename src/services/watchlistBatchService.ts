// Watchlist Batch Analyze API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [V5] Uses Alpha Engine V5 (calculateAlphaScore) with FULL data enrichment
// [V5] Macro + Flow + Catalyst data = absolute alpha scores identical to reports

import { getOptionsData } from '@/services/stockApi';
import { calculateAlphaScore, calculateWhaleIndex, computeIVSkew, computeImpliedMovePct, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchMassive } from '@/services/massiveClient';
import { getAnalysisCacheForTickers, writeAnalysisCache } from '@/services/analysisCache';
import { getMacroSnapshotSSOT } from '@/services/macroHubProvider';
import { fetchTradeData, fetchShortVolumeData } from '@/services/realtimeMetricsService';
import { getFromCache, setInCache } from '@/services/redisClient';
import { recordAlphaDaily } from '@/lib/aws/historyMiddleware';

// [S-76] Edge cache for 30 seconds - faster repeat loads
export const revalidate = 30;

type WatchlistBatchMode = 'full' | 'price' | 'price-dp' | 'ssr';

const EC2_REDIS_PROXY = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
const EC2_REDIS_PROXY_KEY = process.env.EC2_REDIS_PROXY_KEY || process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";
const INST_LAST_PREFIX = 'cache:inst-last:';
const INST_LAST_TTL = 259200;

/**
 * 틱 데이터(체결/호가) 공급 여부.
 *
 * ⚠️ Intrinio Startup 플랜에는 틱이 없어 다크풀·블록거래를 **측정할 수 없다.**
 *    그런데 `cache:inst-last:*` 에 Massive 시절 값이 남아 있어서,
 *    앱 Intel 화면에 「D.POOL 53.6%」 같은 숫자가 **현재 사실처럼** 나갔다
 *    (2026-08-29 실화면 확인). 나이 검사만으로는 못 막는다 —
 *    캐시를 채우는 쪽이 살아 있으면 계속 새 타임스탬프로 되살아난다.
 *    → 읽는 입구에서 아예 차단한다.
 */
function tickDataAvailable(): boolean {
    return process.env.ENABLE_MASSIVE_TICKS === '1';
}

async function readLastKnownTradeData(ticker: string) {
    if (!tickDataAvailable()) return null;
    try {
        const lastKnown = await getFromCache<any>(`${INST_LAST_PREFIX}${ticker}`);
        if (!lastKnown) return null;
        const darkPoolPercent = typeof lastKnown.darkPool?.percent === 'number' ? lastKnown.darkPool.percent : 0;
        const blockTrades = typeof lastKnown.blockTrade?.count === 'number' ? lastKnown.blockTrade.count : 0;
        if (darkPoolPercent <= 0 && blockTrades <= 0) return null;
        return {
            darkPoolPercent,
            blockTrades,
            blockVolume: typeof lastKnown.blockTrade?.volume === 'number' ? lastKnown.blockTrade.volume : 0,
            netBuyValue: typeof lastKnown.darkPool?.netBuyValue === 'number' ? lastKnown.darkPool.netBuyValue : 0,
        };
    } catch {
        return null;
    }
}

function normalizeTradeMetrics(rawMetrics: any) {
    if (!tickDataAvailable()) return null;
    if (!rawMetrics) return null;
    const metrics = typeof rawMetrics === 'string' ? JSON.parse(rawMetrics) : rawMetrics;
    const darkPoolPercent = typeof metrics.darkPool?.percent === 'number' ? metrics.darkPool.percent : 0;
    const blockTrades = typeof metrics.blockTrade?.count === 'number' ? metrics.blockTrade.count : 0;
    if (darkPoolPercent <= 0 && blockTrades <= 0) return null;

    return {
        darkPoolPercent,
        blockTrades,
        blockVolume: typeof metrics.blockTrade?.volume === 'number' ? metrics.blockTrade.volume : 0,
        netBuyValue: typeof metrics.darkPool?.netBuyValue === 'number' ? metrics.darkPool.netBuyValue : 0,
    };
}

/** 틱 게이트를 통과한 경우에만 캐시된 거래 데이터를 돌려준다 */
async function fetchCachedTradeDataOnly(ticker: string): Promise<any> {
    if (!tickDataAvailable()) return null;
    return await fetchCachedTradeDataOnly_inner(ticker);
}

function normalizeTradeData(tradeData: Awaited<ReturnType<typeof fetchTradeData>>) {
    if (!tickDataAvailable()) return null;
    if (!tradeData) return null;
    if ((tradeData.darkPoolPercent ?? 0) <= 0 && (tradeData.blockTrades ?? 0) <= 0) return null;

    return {
        darkPoolPercent: tradeData.darkPoolPercent ?? 0,
        blockTrades: tradeData.blockTrades ?? 0,
        blockVolume: tradeData.blockVolume ?? 0,
        netBuyValue: tradeData.netBuyValue ?? 0,
    };
}

async function fetchCachedTradeDataOnly_inner(ticker: string, timeoutMs = 3200) {
    try {
        const lastKnownPromise = readLastKnownTradeData(ticker);
        let payload = normalizeTradeMetrics(await getFromCache<any>(`rt-metrics:${ticker}`).catch(() => null));

        if (!payload) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const proxyRes = await fetch(
                    `${EC2_REDIS_PROXY}/get?key=${encodeURIComponent(`rt-metrics:${ticker}`)}`,
                    {
                        headers: { 'Authorization': `Bearer ${EC2_REDIS_PROXY_KEY}` },
                        signal: controller.signal,
                        cache: 'no-store',
                    }
                );

                if (proxyRes.ok) {
                    const proxyData = await proxyRes.json();
                    payload = normalizeTradeMetrics(proxyData?.result);
                }
            } catch {
                // Fall through to the last known institutional snapshot below.
            } finally {
                clearTimeout(timeout);
            }
        }

        if (!payload) {
            const lastKnown = await lastKnownPromise;
            if (lastKnown) return lastKnown;

            const tradeDeadline = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs + 1200));
            payload = normalizeTradeData(await Promise.race([
                fetchTradeData(ticker).catch(() => null),
                tradeDeadline,
            ]));
        }

        if (!payload) return null;

        const lastKnown = await lastKnownPromise;
        const mergedPayload = {
            darkPoolPercent: payload.darkPoolPercent > 0 ? payload.darkPoolPercent : (lastKnown?.darkPoolPercent ?? 0),
            blockTrades: payload.blockTrades > 0 ? payload.blockTrades : (lastKnown?.blockTrades ?? 0),
            blockVolume: payload.blockVolume > 0 ? payload.blockVolume : (lastKnown?.blockVolume ?? 0),
            netBuyValue: payload.netBuyValue !== 0 ? payload.netBuyValue : (lastKnown?.netBuyValue ?? 0),
        };

        if (mergedPayload.darkPoolPercent > 0 || mergedPayload.blockTrades > 0) {
            await setInCache(`${INST_LAST_PREFIX}${ticker}`, {
                darkPool: { percent: mergedPayload.darkPoolPercent, netBuyValue: mergedPayload.netBuyValue },
                blockTrade: { count: mergedPayload.blockTrades, volume: mergedPayload.blockVolume },
                _ts: Date.now(),
                _source: 'ec2-flow-accumulator',
            }, INST_LAST_TTL).catch(() => {});
            return mergedPayload;
        }

        return null;
    } catch {
        return readLastKnownTradeData(ticker);
    }
}

// [PERF] Lightweight stock data fetcher - skips chart data entirely
// Same data sources as getStockData(), minus getStockChartData() (which downloads 1000+ minute bars)
// All prices, RSI, 3D return, VWAP are identical to getStockData()
async function getStockDataLight(symbol: string) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]; // 30 days for SMA20

    // [PERF] All 4 calls in parallel (getStockData does snapshot+chart+RSI parallel, then 3D return SEQUENTIAL)
    const [snapRes, rsiRes, dailyAggs, macdRes] = await Promise.all([
        // 1. Snapshot: price, change, volume, VWAP, prevClose (same as getStockData)
        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
        // 2. RSI: same API as getTechnicalRSI()
        fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }).catch(() => null),
        // 3. Daily aggregates: for 3D return + sparkline (same as getAggregates in getStockData)
        fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${to}`, { limit: '5000', adjust: 'true', sort: 'asc' }).catch(() => null),
        // 4. [V5.5+] MACD: for trend crossover detection in Momentum pillar
        fetchMassive(`/v1/indicators/macd/${symbol}`, { timespan: 'day', short_window: '12', long_window: '26', signal_window: '9', limit: '1' }).catch(() => null)
    ]);

    const t = snapRes?.ticker;
    if (!t) return null;

    // Session detection (same logic as getStockData lines 800-838)
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

    // Price calculation (same logic as getStockData lines 842-868)
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

    // RSI (same as getTechnicalRSI)
    const rsi = rsiRes?.results?.values?.[0]?.value ?? null;

    // 3D Return + Sparkline from daily aggregates (same calculation as getStockData lines 870-908)
    const dailyResults = (dailyAggs?.results || []).map((r: any) => ({ close: r.c, volume: r.v || 0 }));
    let return3d = 0;
    if (dailyResults.length >= 4) {
        const recentCandles = dailyResults.slice(-4);
        const price3dAgo = recentCandles[0].close;
        const currentClose = recentCandles[recentCandles.length - 1].close;
        return3d = ((currentClose - price3dAgo) / price3dAgo) * 100;
    }

    // Sparkline: last 20 daily closes (shows ~1 month trend at watchlist scale)
    const sparkline = dailyResults.slice(-20).map((d: any) => d.close);

    // [V5] PM extended change calculation for PM Gate 11
    // PRE session: PM price vs previous regular close (prevClose)
    // POST session: PM price vs today's close
    let extendedChangePct: number | null = null;
    if (session === 'pre' && prevClose > 0) {
        extendedChangePct = ((latestPrice - prevClose) / prevClose) * 100;
    } else if (session === 'post' && todayClose > 0) {
        extendedChangePct = ((latestPrice - todayClose) / todayClose) * 100;
    }

    return {
        symbol,
        price: latestPrice,
        change: isExtended ? (extChange || 0) : (regChange || 0),
        changePercent: isExtended ? (extChangePercent || 0) : (regChangePercent || 0),
        volume: t?.day?.v,
        prevClose,
        prevDayVolume: t?.prevDay?.v || 0, // [V3.2] For relVol calculation
        session,
        rsi,
        return3d,
        vwap: t?.day?.vw || t?.prevDay?.vw || null,  // [FIX] Fallback to prev-day VWAP during pre-market
        history: sparkline.map((close: number) => ({ close })), // Compatible format
        dailyResults, // [V3.2] For session-aware changePct/relVol
        extendedChangePct, // [V5] For PM Gate 11 (preMarketChangePct)
        // [V5.5+] MACD histogram for trend crossover
        macdHistogram: macdRes?.results?.values?.[0]?.histogram ?? null,
    };
}



// ============================================================================
// CORE BATCH PROCESSING LOGIC
// Exported separately so it can be called seamlessly during SSR (Server Components)
// without creating mock Request objects or failing on absolute URL resolution
// ============================================================================
export async function processWatchlistBatch(tickers: string[], mode: WatchlistBatchMode = 'full') {
    const startTime = Date.now();
    if (!tickers || tickers.length === 0) return { results: [], meta: { count: 0, elapsed: 0, source: 'empty' } };

    // 1. Fetch Cache for all requested tickers (Non-blocking fallback to empty if Redis fails)
    const cached = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));
    const missingTickers = tickers.filter(t => !cached[t]);

    // 2. Fetch Snapshot for ALL tickers (we need live prices for Cached ones AND Missing ones in 'ssr'/'price' mode)
    // In 'full' mode, getStockDataLight also fetches snapshots, but we need it here for the cached ones anyway.
    const snapshotData = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers`, { tickers: tickers.join(',') }).catch(() => null);
    const snapshotMap: Record<string, any> = {};
    (snapshotData?.tickers || []).forEach((t: any) => { snapshotMap[t.ticker] = t; });

    const { getMarketStatusSSOT } = await import('@/services/marketStatusProvider');
    const marketStatus = await getMarketStatusSSOT();
    const currentSession = marketStatus.session; // 'pre', 'regular', 'post', 'closed'

    // [V8 UNIFIED] Always fetch macro data — needed for V4.6 Alpha Score in BOTH cache hit and miss paths
    // Regime pillar (15점) requires VIX, NDX, TLT, GLD regardless of cache status
    let macroData: any = null;
    let fearGreedScore: number | null = null;
    if (mode === 'full') {
        try {
            const macro = await getMacroSnapshotSSOT();
            macroData = {
                ndxChangePct: macro.nqChangePercent ?? null,
                vixValue: macro.vix ?? null,
                vixChangePct: macro.factors?.vix?.chgPct ?? null,
                tltChangePct: macro.tltChangePct ?? null,
                gldChangePct: macro.gldChangePct ?? null,
                dxy: macro.dxy ?? null,
                realYieldStance: macro.realYield?.stance ?? null,
            };
        } catch (e) { console.warn('[Watchlist Batch] Macro fetch failed:', e); }

        try {
            const fgData = await getFromCache<{ score: number; rating: string }>('cnn:feargreed');
            fearGreedScore = fgData?.score ?? null;
        } catch { /* ignore */ }

        // [V5.5+] Read VIX3M from Redis for term structure analysis
        try {
            const vix3mData = await getFromCache<{ price: number; changePct: number }>('yahoo:vix3m');
            if (vix3mData?.price) {
                if (macroData) macroData.vix3mValue = vix3mData.price;
            }
        } catch { /* ignore */ }
    }

    // [STEP 1] Concurrency Control: Progressive Batching to prevent Vercel TCP connection drops
    // Processes up to 10 tickers at a time in parallel
    const results: any[] = [];
    const concurrencyLimit = 10;
    
    for (let i = 0; i < tickers.length; i += concurrencyLimit) {
        const chunk = tickers.slice(i, i + concurrencyLimit);
        const chunkResults = await Promise.all(chunk.map(async (ticker) => {
        const analysis = cached[ticker];
        const snap = snapshotMap[ticker];

        // --- Helper to build Base Price Object from Snapshot ---
        // ★ Command 페이지와 동일한 방식:
        //   메인 가격 = 항상 본장 가격 (regular: liveTick, pre/post: dayClose)
        //   changePct = 항상 본장 등락 (dayClose vs prevDayClose)
        //   extendedPrice = PRE/POST 가격 (별도 표시)
        // [FIX 2026-05-06] dailyCloses 파라미터 추가:
        //   PRE 마켓에서 Polygon day.c=0이면 daily aggs[-2].c를 사용하여
        //   정확한 본장 등락률 계산 (Yahoo Finance와 동일)
        const buildBasePrice = (dailyCloses?: number[]) => {
            if (!snap) return { displayPrice: 0, changePct: 0, extendedPrice: null, extendedChangePct: null, extendedLabel: undefined, vwap: null, volume: 0, prevDayClose: 0 };

            const liveLast = snap.lastTrade?.p || 0;
            const dayClose = snap.day?.c || 0;
            const prevDayClose = snap.prevDay?.c || 0;
            const volume = snap.day?.v || 0;
            const vwap = snap.day?.vw || null;

            // ★ 메인 가격: regular=실시간, pre/post=본장 종가(dayClose)
            let displayPrice = 0;
            if (currentSession === 'regular') {
                displayPrice = liveLast || dayClose || prevDayClose;
            } else {
                // PRE/POST/CLOSED: 항상 본장 종가를 메인으로
                displayPrice = dayClose || prevDayClose;
            }

            // ★ changePct: 항상 본장 등락 (dayClose vs prevDayClose)
            // [FIX] PRE 마켓에서 day.c=0이면 daily aggs에서 정확한 본장% 계산
            let changePct = 0;
            if (currentSession === 'regular') {
                // Regular: 실시간 가격 기준
                if (liveLast > 0 && prevDayClose > 0) {
                    changePct = ((liveLast - prevDayClose) / prevDayClose) * 100;
                } else {
                    changePct = snap.todaysChangePerc || 0;
                }
            } else {
                // PRE/POST: 본장 종가 vs 전일 종가
                if (dayClose > 0 && prevDayClose > 0) {
                    changePct = ((dayClose - prevDayClose) / prevDayClose) * 100;
                } else if (dailyCloses && dailyCloses.length >= 2) {
                    // [FIX] day.c=0 (PRE 마켓): daily aggs에서 본장 등락률 계산
                    // dailyCloses[-1] = 어제 종가, dailyCloses[-2] = 2거래일 전 종가
                    const prev1 = dailyCloses[dailyCloses.length - 1];
                    const prev2 = dailyCloses[dailyCloses.length - 2];
                    if (prev2 > 0) {
                        changePct = ((prev1 - prev2) / prev2) * 100;
                    }
                } else {
                    // 최후 폴백: 0 반환 (todaysChangePerc는 PRE 가격 포함이라 사용 금지)
                    changePct = 0;
                }
            }

            // ★ Extended: PRE/POST 가격은 별도 필드로 (Command 페이지의 서브 라인)
            let extendedPrice: number | null = null;
            let extendedLabel: string | undefined = undefined;
            let extendedChangePct: number | null = null;
            if (currentSession === 'pre') {
                const prePrice = liveLast || snap.min?.c;
                if (prePrice > 0 && prePrice !== displayPrice) {
                    extendedPrice = prePrice;
                    extendedLabel = 'PRE';
                    extendedChangePct = displayPrice > 0 ? ((prePrice - displayPrice) / displayPrice) * 100 : 0;
                }
            } else if (currentSession === 'post' || currentSession === 'closed') {
                const postPrice = liveLast || snap.afterHours?.p || snap.min?.c;
                if (postPrice > 0 && postPrice !== displayPrice) {
                    extendedPrice = postPrice;
                    extendedLabel = 'POST';
                    extendedChangePct = displayPrice > 0 ? ((postPrice - displayPrice) / displayPrice) * 100 : 0;
                }
            }

            return { displayPrice, changePct, extendedPrice, extendedChangePct, extendedLabel, vwap, volume, prevDayClose };
        };

        // ============================================
        // A. CACHE HIT: V4.6 RECALCULATION (ONE ENGINE, ONE RESULT)
        // [V8 UNIFIED] Lambda alphaSnapshot을 무시하고, 캐시된 raw 데이터 + live 가격으로
        // Vercel V4.6 엔진으로 재계산. 유니버스/비유니버스/CACHE HIT/MISS 모두 동일 결과.
        // ============================================
        // [V3.1 FIX] Removed broken isStaleV3Cache logic.
        // Lambda v8 doesn't write shortVolPct to cache:analysis, so checking for it
        // causes the frontend to constantly throw away perfectly good caches.
        if (analysis) {
            const base = buildBasePrice(analysis.sparkline);

            // [SELF-HEAL] Sparkline이 오염(빈 배열)된 캐시 자동 복구
            // 이전 DynamoDB Fallback 버그로 sparkline:[]이 Redis에 저장된 경우 대비
            // getStockDataLight(~500ms)로 보충 후 캐시 업데이트 — 1회만 발생, 이후 캐시 정상
            if (!analysis.sparkline || analysis.sparkline.length === 0) {
                try {
                    const healData = await getStockDataLight(ticker).catch(() => null);
                    if (healData) {
                        const freshSparkline = healData.history?.slice(-20).map((h: any) => h.close) || [];
                        if (freshSparkline.length > 0) {
                            analysis.sparkline = freshSparkline;
                            analysis.rsi = healData.rsi ?? analysis.rsi;
                            analysis.return3d = healData.return3d ?? analysis.return3d;
                            // Update Redis cache with healed sparkline (fire-and-forget)
                            writeAnalysisCache(ticker, analysis as any).catch(() => {});
                        }
                    }
                } catch { /* silent — proceed with empty sparkline */ }
            }

            // [SELF-HEAL] ivSkew 오염 자동 복구
            // Lambda harvest가 impliedMovePct를 ivSkew에 기록한 경우 (ivSkew > 2.0은 불가능)
            // getOptionsData로 rawContracts 가져와 computeIVSkew로 정확한 값 재계산 — 1회만 발생
            if (analysis.ivSkew == null || analysis.ivSkew > 2.0) {
                try {
                    const healOpts: any = await getOptionsData(ticker).catch(() => null);
                    if (healOpts?.rawContracts?.length > 0) {
                        const currentPrice = analysis.sparkline?.length > 0
                            ? analysis.sparkline[analysis.sparkline.length - 1]
                            : 0;
                        if (currentPrice > 0) {
                            const freshIvSkew = computeIVSkew(healOpts.rawContracts, currentPrice);
                            if (freshIvSkew != null && freshIvSkew <= 2.0) {
                                analysis.ivSkew = freshIvSkew;
                                writeAnalysisCache(ticker, analysis as any).catch(() => {});
                            }
                        }
                    }
                } catch { /* silent — proceed with null ivSkew */ }
            }

            // 🔥 [SSR FAST-TRACK / STEP 3] SSR initial render: Bypass heavy computations & EC2 calls
            // Returns the Stale cache natively in 0.05s to eliminate Skeleton Hang completely
            if (mode === 'ssr' || mode === 'price' || mode === 'price-dp') {
                const refPrice = base.extendedPrice || base.displayPrice;
                const cachedTradeData = mode === 'price-dp'
                    ? await fetchCachedTradeDataOnly(ticker)
                    : null;
                const fastDarkPoolPct = (cachedTradeData?.darkPoolPercent && cachedTradeData.darkPoolPercent > 0)
                    ? cachedTradeData.darkPoolPercent
                    : (analysis.darkPoolPct ?? null);
                const fastBlockTrades = cachedTradeData?.blockTrades ?? null;
                const fastWhaleIndex = calculateWhaleIndex(
                    analysis.gex,
                    fastDarkPoolPct,
                    fastBlockTrades,
                    analysis.netPremium
                );
                return {
                    ticker,
                    alphaSnapshot: analysis.alphaSnapshot || null,
                    realtime: {
                        price: base.displayPrice,
                        changePct: base.changePct,
                        session: currentSession === 'regular' ? 'reg' : currentSession,
                        rsi: analysis.rsi ?? null,
                        return3d: analysis.return3d ?? null,
                        sparkline: analysis.sparkline ?? [],
                        maxPain: analysis.maxPain ?? null,
                        maxPainDist: (analysis.maxPain && refPrice) ? Number(((analysis.maxPain - refPrice) / refPrice * 100).toFixed(2)) : null,
                        gex: analysis.gex ?? null,
                        gexM: analysis.gexM ?? null,
                        pcr: analysis.pcr ?? null,
                        whaleIndex: fastWhaleIndex,
                        whaleConfidence: analysis.whaleConfidence ?? 'NONE',
                        darkPoolPct: fastDarkPoolPct,
                        squeezeScore: analysis.squeezeScore ?? null,
                        ivSkew: (analysis.ivSkew != null && analysis.ivSkew <= 2.0) ? analysis.ivSkew : null,
                        impliedMovePct: analysis.impliedMovePct ?? null,
                        gammaFlipLevel: analysis.gammaFlipLevel ?? null,
                        iv: analysis.iv ?? null,
                        vwap: base.vwap ?? null,
                        vwapDist: (base.vwap && refPrice) ? Number(((refPrice - base.vwap) / base.vwap * 100).toFixed(2)) : null,
                        callWall: analysis.callWall ?? null,
                        putFloor: analysis.putFloor ?? null,
                        netPremium: analysis.netPremium ?? null,
                        blockTrades: fastBlockTrades,
                        blockVolume: cachedTradeData?.blockVolume ?? null,
                        netBuyValue: cachedTradeData?.netBuyValue ?? null,
                        volume: base.volume ?? 0,
                        relVol: analysis.relVol ?? 0,
                        extendedPrice: base.extendedPrice ?? null,
                        extendedChangePct: base.extendedChangePct ?? null,
                        extendedLabel: base.extendedLabel ?? undefined,
                    }
                };
            }

            // [V5.0] ALWAYS fetch live dark pool from EC2 ElastiCache (100% accuracy, ~3ms)
            // Previous: only fetched when cache was 0 → stale Polygon samples persisted
            let liveDarkPoolPct: number | null = analysis.darkPoolPct ?? null;
            try {
                const tradeData = await fetchTradeData(ticker);
                if (tradeData && tradeData.darkPoolPercent > 0) {
                    liveDarkPoolPct = tradeData.darkPoolPercent;
                }
            } catch { /* silent — keep cached value */ }

            const finalChangePct = base.changePct;
            const refPrice = base.extendedPrice || base.displayPrice;

            // [FIX 2026-05-04] Score Consistency: Use cached snapshot when market is CLOSED/POST
            // Recalculating with CLOSED session applies momentum penalties → lower score
            // Only recalculate during active market (REG/PRE) for live accuracy
            const sessionMap: Record<string, AlphaSession> = { pre: 'PRE', regular: 'REG', post: 'POST', closed: 'CLOSED' };
            const alphaSession: AlphaSession = sessionMap[currentSession] || 'CLOSED';
            let alphaSnapshotV4: any = analysis.alphaSnapshot; // default: use cached snapshot (SSOT)

            if (alphaSession === 'REG' || alphaSession === 'PRE') {
              try {
                const alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(),
                    session: alphaSession,
                    price: base.displayPrice,
                    prevClose: base.prevDayClose || 0,
                    changePct: finalChangePct,
                    vwap: base.vwap ?? null,
                    return3D: analysis.return3d ?? null,
                    rsi14: analysis.rsi ?? null,
                    pcr: analysis.pcr ?? null,
                    gex: analysis.gex ?? null,
                    callWall: analysis.callWall ?? null,
                    putFloor: analysis.putFloor ?? null,
                    gammaFlipLevel: analysis.gammaFlipLevel ?? null,
                    squeezeScore: analysis.squeezeScore ?? null,
                    atmIv: analysis.iv ?? null,
                    ivSkew: (analysis.ivSkew != null && analysis.ivSkew <= 2.0) ? analysis.ivSkew : null,
                    darkPoolPct: liveDarkPoolPct,
                    shortVolPct: analysis.shortVolPct ?? null,
                    whaleIndex: analysis.whaleIndex ?? 0,
                    relVol: analysis.relVol ?? null,
                    netFlow: analysis.netPremium ?? null,
                    blockTrades: null,
                    impliedMovePct: analysis.impliedMovePct ?? null,
                    optionsDataAvailable: analysis.gex !== null,
                    ndxChangePct: macroData?.nqChangePercent ?? null,
                    vixValue: macroData?.vix ?? null,
                    vixChangePct: macroData?.factors?.vix?.chgPct ?? null,
                    tltChangePct: macroData?.tltChangePct ?? null,
                    gldChangePct: macroData?.gldChangePct ?? null,
                    dxy: macroData?.dxy ?? null,
                    realYieldStance: macroData?.realYield?.stance ?? null,
                    fearGreedScore,
                    vix3mValue: macroData?.vix3mValue ?? null,
                });
                alphaSnapshotV4 = {
                    score: alphaResult.score,
                    grade: alphaResult.grade,
                    action: alphaResult.action,
                    actionKR: alphaResult.actionKR,
                    whyKR: alphaResult.whyKR,
                    confidence: Math.round(alphaResult.dataCompleteness),
                    triggers: alphaResult.triggerCodes,
                    pillars: {
                        momentum: alphaResult.pillars.momentum.score,
                        structure: alphaResult.pillars.structure.score,
                        flow: alphaResult.pillars.flow.score,
                        regime: alphaResult.pillars.regime.score,
                        catalyst: alphaResult.pillars.catalyst.score,
                    },
                    gatesApplied: alphaResult.gatesApplied,
                    engineVersion: alphaResult.engineVersion,
                    capturedAt: new Date().toISOString(),
                };

                // 🔥 [ROOT FIX] WRITING BACK THE RECALCULATED SCORE TO CACHE — ONLY during active market
                // This upgrades the Lambda's simplified score to the HD V4.6 Sector Grid score globally
                // [FIX] Sanitize ivSkew: Lambda may have written impliedMovePct into ivSkew field
                const sanitizedIvSkew = (analysis.ivSkew != null && analysis.ivSkew <= 2.0) ? analysis.ivSkew : null;
                const updatedAnalysis = { ...analysis, alphaSnapshot: alphaSnapshotV4, ivSkew: sanitizedIvSkew };
                import('@/services/analysisCache').then(m => m.writeAnalysisCache(ticker, updatedAnalysis as any).catch(() => {}));
              } catch (e) {
                console.warn(`[Watchlist CACHE HIT] V4.6 recalc failed for ${ticker}, using cached:`, e);
              }
            }

            return {
                ticker,
                alphaSnapshot: alphaSnapshotV4,
                realtime: {
                    price: base.displayPrice,
                    changePct: finalChangePct,
                    session: currentSession === 'regular' ? 'reg' : currentSession,
                    rsi: analysis.rsi,
                    return3d: analysis.return3d,
                    sparkline: analysis.sparkline,
                    maxPain: analysis.maxPain,
                    maxPainDist: (analysis.maxPain && refPrice) ? Number(((analysis.maxPain - refPrice) / refPrice * 100).toFixed(2)) : null,
                    gex: analysis.gex,
                    gexM: analysis.gexM,
                    pcr: analysis.pcr,
                    whaleIndex: calculateWhaleIndex(analysis.gex, analysis.darkPoolPct, null, analysis.netPremium),
                    whaleConfidence: analysis.whaleConfidence,
                    darkPoolPct: liveDarkPoolPct,
                    squeezeScore: analysis.squeezeScore,
                    ivSkew: (analysis.ivSkew != null && analysis.ivSkew <= 2.0) ? analysis.ivSkew : null,
                    impliedMovePct: analysis.impliedMovePct ?? null,
                    gammaFlipLevel: analysis.gammaFlipLevel,
                    iv: analysis.iv,
                    vwap: base.vwap,
                    vwapDist: (base.vwap && refPrice) ? Number(((refPrice - base.vwap) / base.vwap * 100).toFixed(2)) : null,
                    callWall: analysis.callWall,
                    putFloor: analysis.putFloor,
                    netPremium: analysis.netPremium,
                    volume: base.volume,
                    relVol: analysis.relVol ?? 0,
                    extendedPrice: base.extendedPrice,
                    extendedChangePct: base.extendedChangePct,
                    extendedLabel: base.extendedLabel,
                }
            };
        }

        // ============================================
        // B. CACHE MISS & FAST MODE (PRICE | SSR)
        // ============================================
        if (mode === 'price' || mode === 'price-dp' || mode === 'ssr') {
            const base = buildBasePrice();  // CACHE MISS + fast mode: no dailyCloses available, falls back to 0
            const cachedTradeData = mode === 'price-dp'
                ? await fetchCachedTradeDataOnly(ticker)
                : null;
            const fastDarkPoolPct = (cachedTradeData?.darkPoolPercent && cachedTradeData.darkPoolPercent > 0)
                ? cachedTradeData.darkPoolPercent
                : null;   // 측정 불가는 0 이 아니라 없음
            const fastBlockTrades = cachedTradeData?.blockTrades ?? null;

            return {
                ticker,
                realtime: {
                    price: base.displayPrice,
                    changePct: base.changePct,
                    session: currentSession === 'regular' ? 'reg' : currentSession,
                    extendedPrice: base.extendedPrice,
                    extendedChangePct: base.extendedChangePct,
                    extendedLabel: base.extendedLabel,
                    volume: base.volume,
                    vwap: base.vwap,
                    whaleIndex: calculateWhaleIndex(null, fastDarkPoolPct, fastBlockTrades, null),
                    darkPoolPct: fastDarkPoolPct,
                    blockTrades: fastBlockTrades,
                    blockVolume: cachedTradeData?.blockVolume ?? null,
                    netBuyValue: cachedTradeData?.netBuyValue ?? null,
                }
            };
        }

        // ============================================
        // C. CACHE MISS & FULL MODE — AWS-FIRST STRATEGY
        // Step 1: Try DynamoDB unified-cache (Lambda saves all 1000 tickers here)
        // Step 2: Only fall back to Polygon if DynamoDB also misses (non-universe tickers)
        // ============================================
        // [Step 1] DynamoDB Fallback (~50ms vs Polygon 5-280s)
        try {
            const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
            const dynamoData = await Promise.race([
                getUnifiedCache(ticker, 'en'),
                new Promise<null>(r => setTimeout(() => r(null), 3000)) // 3s safety timeout
            ]).catch(() => null);

            if (dynamoData) {
                const dynAny = dynamoData as any;
                const gd = dynAny.structure;
                
                // [FIX] DB에 존재하는 유니버스 종목이 비-유니버스 종목보다 스파크라인 표출에 불이익을 받는 모순 해결.
                // 빠른 응답을 유지하되, Polygon의 가벼운 Price+Aggs 데이터만 추가 병렬 호출하여 스파크라인과 3D리턴 복구.
                const stockData = await getStockDataLight(ticker).catch(() => null);
                const base = buildBasePrice(stockData?.dailyResults?.map((d: any) => d.close));
                const dynamoCachedTradeData = await fetchCachedTradeDataOnly(ticker);
                const dynamoDarkPoolPct = (dynamoCachedTradeData?.darkPoolPercent && dynamoCachedTradeData.darkPoolPercent > 0)
                    ? dynamoCachedTradeData.darkPoolPercent
                    // DynamoDB 의 institutional 은 Massive 시절 잔재다. 게이트가 꺼져 있으면 쓰지 않는다.
                    : (tickDataAvailable() ? (dynAny.institutional?.darkPool?.percent ?? null) : null);
                const dynamoBlockTrades = dynamoCachedTradeData?.blockTrades ?? null;

                // Build analysisEntry from DynamoDB data and write to Redis cache
                const dynamoAnalysis: Record<string, any> = {
                    ticker,
                    timestamp: Date.now(),
                    rsi: stockData?.rsi ?? dynAny._dynamoPrice?.rsi ?? null,
                    return3d: stockData?.return3d ?? dynAny._dynamoPrice?.return3d ?? null,
                    sparkline: stockData?.history?.map((h: any) => h.close) ?? [],
                    relVol: null,
                    expiration: gd?.expiration || null,
                    maxPain: gd?.maxPain || null,
                    gex: gd?.netGex || null,
                    gexM: gd?.netGex ? Math.round(gd.netGex / 1000000 * 10) / 10 : null,
                    pcr: gd?.pcRatio || null,
                    callWall: gd?.levels?.callWall || null,
                    putFloor: gd?.levels?.putFloor || null,
                    gammaFlipLevel: gd?.gammaFlipLevel || null,
                    squeezeScore: dynAny.squeeze?.riskScore ?? null,
                    iv: dynAny.volatility?.iv || null,
                    whaleIndex: calculateWhaleIndex(gd?.netGex, dynamoDarkPoolPct, dynamoBlockTrades, null),
                    whaleConfidence: (gd?.netGex != null) ? 'MED' : 'NONE',
                    darkPoolPct: dynamoDarkPoolPct,
                    blockTrades: dynamoBlockTrades,
                    blockVolume: dynamoCachedTradeData?.blockVolume ?? null,
                    netBuyValue: dynamoCachedTradeData?.netBuyValue ?? null,
                    netPremium: null,
                    vwapDist: null,
                    volume: base.volume || null,
                    ivSkew: null,
                    impliedMovePct: null,
                    shortVolPct: dynAny.squeeze?.shortVolPercent || null,
                    vwap: base.vwap || null,
                    volumePcr: null,
                    volumePcrCallVol: null,
                    volumePcrPutVol: null,
                    impliedMoveDir: null,
                    zeroDtePct: null,
                };

                // V4.6 Alpha recalculation (same as CACHE HIT path)
                const sessionMap2: Record<string, AlphaSession> = { pre: 'PRE', regular: 'REG', post: 'POST', closed: 'CLOSED' };
                const alphaSession2: AlphaSession = sessionMap2[currentSession] || 'CLOSED';
                let alphaSnapshot2: any = { score: 50, grade: 'C', action: 'HOLD' };
                try {
                    const ar = calculateAlphaScore({
                        ticker: ticker.toUpperCase(),
                        session: alphaSession2,
                        price: base.displayPrice,
                        prevClose: base.prevDayClose || 0,
                        changePct: base.changePct,
                        vwap: base.vwap ?? null,
                        return3D: dynamoAnalysis.return3d ?? null,
                        rsi14: dynamoAnalysis.rsi ?? null,
                        pcr: dynamoAnalysis.pcr ?? null,
                        gex: dynamoAnalysis.gex ?? null,
                        callWall: dynamoAnalysis.callWall ?? null,
                        putFloor: dynamoAnalysis.putFloor ?? null,
                        gammaFlipLevel: dynamoAnalysis.gammaFlipLevel ?? null,
                        squeezeScore: dynamoAnalysis.squeezeScore ?? null,
                        atmIv: dynamoAnalysis.iv ?? null,
                        darkPoolPct: dynamoAnalysis.darkPoolPct ?? null,
                        shortVolPct: dynamoAnalysis.shortVolPct ?? null,
                        whaleIndex: calculateWhaleIndex(dynamoAnalysis.gex, dynamoAnalysis.darkPoolPct, null, dynamoAnalysis.netPremium),
                        relVol: dynamoAnalysis.relVol ?? null,
                        netFlow: dynamoAnalysis.netPremium ?? null,
                        blockTrades: null,
                        impliedMovePct: dynamoAnalysis.impliedMovePct ?? null,
                        optionsDataAvailable: dynamoAnalysis.gex !== null,
                        ndxChangePct: macroData?.nqChangePercent ?? null,
                        vixValue: macroData?.vix ?? null,
                        vixChangePct: macroData?.factors?.vix?.chgPct ?? null,
                        tltChangePct: macroData?.tltChangePct ?? null,
                        gldChangePct: macroData?.gldChangePct ?? null,
                        dxy: macroData?.dxy ?? null,
                        realYieldStance: macroData?.realYield?.stance ?? null,
                        fearGreedScore,
                        vix3mValue: macroData?.vix3mValue ?? null,
                    });
                    alphaSnapshot2 = {
                        score: ar.score, grade: ar.grade, action: ar.action,
                        actionKR: ar.actionKR,
                        confidence: Math.min(100, Math.max(0, Math.abs(ar.score - 50) * 2)),
                        triggers: [],
                        engineVersion: ar.engineVersion,
                    };
                } catch { /* use default */ }

                // Write to Redis cache for next time (CACHE HIT path)
                dynamoAnalysis.alphaSnapshot = alphaSnapshot2;
                writeAnalysisCache(ticker, dynamoAnalysis as any).catch(() => {});

                // [FIX] Return structure MUST match Path A (Cache Hit) format
                // Frontend parser requires: apiData.alphaSnapshot && apiData.realtime.sparkline
                const refPriceC = base.extendedPrice || base.displayPrice;
                return {
                    ticker,
                    alphaSnapshot: alphaSnapshot2,
                    realtime: {
                        price: base.displayPrice,
                        changePct: base.changePct,
                        session: currentSession === 'regular' ? 'reg' : currentSession,
                        rsi: dynamoAnalysis.rsi,
                        return3d: dynamoAnalysis.return3d,
                        sparkline: dynamoAnalysis.sparkline,
                        maxPain: dynamoAnalysis.maxPain,
                        maxPainDist: (dynamoAnalysis.maxPain && refPriceC) ? Number(((dynamoAnalysis.maxPain - refPriceC) / refPriceC * 100).toFixed(2)) : null,
                        gex: dynamoAnalysis.gex,
                        gexM: dynamoAnalysis.gexM,
                        pcr: dynamoAnalysis.pcr,
                        whaleIndex: calculateWhaleIndex(dynamoAnalysis.gex, dynamoAnalysis.darkPoolPct, null, dynamoAnalysis.netPremium),
                        whaleConfidence: dynamoAnalysis.whaleConfidence ?? 'NONE',
                        darkPoolPct: dynamoAnalysis.darkPoolPct ?? 0,
                        squeezeScore: dynamoAnalysis.squeezeScore,
                        ivSkew: (dynamoAnalysis.ivSkew != null && dynamoAnalysis.ivSkew <= 2.0) ? dynamoAnalysis.ivSkew : null,
                        impliedMovePct: dynamoAnalysis.impliedMovePct ?? null,
                        gammaFlipLevel: dynamoAnalysis.gammaFlipLevel,
                        iv: dynamoAnalysis.iv,
                        vwap: base.vwap,
                        vwapDist: (base.vwap && refPriceC) ? Number(((refPriceC - base.vwap) / base.vwap * 100).toFixed(2)) : null,
                        callWall: dynamoAnalysis.callWall,
                        putFloor: dynamoAnalysis.putFloor,
                        netPremium: dynamoAnalysis.netPremium,
                        volume: base.volume,
                        relVol: dynamoAnalysis.relVol ?? 0,
                        extendedPrice: base.extendedPrice,
                        extendedChangePct: base.extendedChangePct,
                        extendedLabel: base.extendedLabel,
                    }
                };
            }
        } catch { /* DynamoDB unavailable, continue to Polygon */ }

        // [Step 2] Polygon Full Compute (original path — only reaches here if DynamoDB also missed)
        try {
            // [PERF] 2-Phase Progressive Loading for non-universe tickers
            // All 5 calls start SIMULTANEOUSLY. Phase 1 awaits only getStockDataLight (~500ms for sparkline).
            // Phase 2: heavy calls get a 2.5s competitive deadline — fast ones (trade ~1s, shortVol ~1s) usually arrive;
            // slow ones (options ~5s) gracefully timeout as null. Total max: ~3s vs previous 5-15s.
            // Existing processing code handles null gracefully (?? null, || null everywhere).
            const stockDataPromise = getStockDataLight(ticker).catch(() => null);
            const optionsPromise = getOptionsData(ticker).catch(() => null);
            const structurePromise = getStructureData(ticker).catch(() => null);
            const tradePromise = fetchTradeData(ticker).catch(() => null);
            const shortVolPromise = fetchShortVolumeData(ticker).catch(() => null);

            // Phase 1: Await sparkline data (fast, ~500ms)
            const stockData = await stockDataPromise;

            // Phase 2: Competitive deadline — heavy calls already running since Phase 1 started
            const ENRICHMENT_DEADLINE_MS = 2500;
            const deadline = new Promise<null>(r => setTimeout(() => r(null), ENRICHMENT_DEADLINE_MS));
            const [optionsData, structureRes, tradeData, shortVolData] = await Promise.all([
                Promise.race([optionsPromise, deadline]),
                Promise.race([structurePromise, deadline]),
                Promise.race([tradePromise, deadline]),
                Promise.race([shortVolPromise, deadline]),
            ]);

            if (!stockData) return { ticker, error: 'Stock data unavailable' };

            const sessionMap: Record<string, AlphaSession> = { pre: 'PRE', reg: 'REG', post: 'POST' };
            const alphaSession: AlphaSession = sessionMap[stockData.session] || 'CLOSED';
            const isREG = alphaSession === 'REG';
            const dailyResults = stockData.dailyResults || [];

            // [FIX] Use getStockDataLight's changePct directly (snapshot-based, always correct)
            // Previously: dailyResults[-2] could be wrong date due to weekends/holidays
            const changePct = stockData.changePercent || 0;

            let relVol: number | null = null;
            if (isREG) {
                const dayVol = stockData.volume || 0;
                const prevVol = stockData.prevDayVolume || 1;
                relVol = dayVol > 0 ? dayVol / prevVol : null;
            } else if (dailyResults.length >= 2) {
                const lastVol = dailyResults[dailyResults.length - 1]?.volume || 0;
                const prevVol = dailyResults[dailyResults.length - 2]?.volume || 1;
                relVol = lastVol > 0 ? lastVol / prevVol : null;
            }

            let return3D = stockData.return3d ?? null;
            if (!isREG && dailyResults.length >= 4) {
                const lastClose = dailyResults[dailyResults.length - 1]?.close;
                const close4dAgo = dailyResults[dailyResults.length - 4]?.close;
                if (lastClose && close4dAgo) {
                    return3D = ((lastClose - close4dAgo) / close4dAgo) * 100;
                }
            }

            let sma20: number | null = null;
            const dailyCloses = dailyResults.map((d: any) => d.close).filter(Boolean);
            if (dailyCloses.length >= 20) {
                const last20 = dailyCloses.slice(-20);
                sma20 = parseFloat((last20.reduce((a: number, b: number) => a + b, 0) / 20).toFixed(2));
            }

            const opts = optionsData as any;
            const alphaGex = structureRes?.netGex ?? opts?.gems?.gex ?? opts?.gex ?? null;
            const alphaPcr = opts?.putCallRatio ?? null;
            const alphaGammaFlip = structureRes?.gammaFlipLevel ?? opts?.gems?.gammaFlipLevel ?? null;

            let alphaSqueezeScore = structureRes?.squeezeScore ?? null;
            if (alphaSqueezeScore === null && alphaGex !== null) {
                let sq = 25;
                const absGex = Math.abs(alphaGex);
                if (alphaGex < 0) sq += 15;
                if (absGex > 50_000_000) sq += 15;
                else if (absGex > 10_000_000) sq += 10;
                else if (absGex > 1_000_000) sq += 5;
                const pcr = alphaPcr ?? 1;
                if (pcr <= 0.4 || pcr >= 1.8) sq += 10;
                else if (pcr <= 0.6 || pcr >= 1.5) sq += 5;
                alphaSqueezeScore = Math.min(100, Math.max(0, sq));
            }

            const rawContracts = opts?.rawContracts || [];
            const currentPrice = stockData.price || 0;
            const ivSkew = computeIVSkew(rawContracts, currentPrice);

            let maxCallOI = 0, maxPutOI = 0;
            let directCallWall = 0, directPutFloor = 0;
            for (const c of rawContracts) {
                const oi = c.open_interest || 0;
                const strike = c.strike_price || 0;
                if (c.contract_type === 'call' && oi > maxCallOI) { maxCallOI = oi; directCallWall = strike; }
                if (c.contract_type === 'put' && oi > maxPutOI) { maxPutOI = oi; directPutFloor = strike; }
            }

            let impliedMovePct = null;
            if (directCallWall > 0 && directPutFloor > 0 && currentPrice > 0) {
                impliedMovePct = ((directCallWall - directPutFloor) / currentPrice) * 100;
            } else {
                impliedMovePct = computeImpliedMovePct(rawContracts, currentPrice);
            }

            const darkPoolPct = tradeData?.darkPoolPercent ?? null;
            const shortVolPct = shortVolData?.shortVolPercent ?? null;
            const blockTradesCount = tradeData?.blockTrades ?? null;

            // [V3 FIX] Volume P/C Ratio — from rawContracts volume (same source as structureService)
            let volumePcrVal: number | null = null;
            let volumePcrCallVolVal: number | null = null;
            let volumePcrPutVolVal: number | null = null;
            if (rawContracts.length > 0) {
                let callVol = 0, putVol = 0;
                let callOI = 0, putOI = 0;
                for (const c of rawContracts) {
                    const vol = c.day?.volume || c.volume || 0;
                    const oi = c.open_interest || 0;
                    if (c.contract_type === 'call') { callVol += vol; callOI += oi; }
                    else if (c.contract_type === 'put') { putVol += vol; putOI += oi; }
                }
                // Primary: volume-based PCR. Fallback: OI-based PCR (for pre-market when volume=0)
                if (callVol > 0) {
                    volumePcrVal = parseFloat((putVol / callVol).toFixed(3));
                    volumePcrCallVolVal = callVol;
                    volumePcrPutVolVal = putVol;
                } else if (callOI > 0) {
                    // [FIX] Pre-market fallback: use OI when no volume yet
                    volumePcrVal = parseFloat((putOI / callOI).toFixed(3));
                    volumePcrCallVolVal = callOI;
                    volumePcrPutVolVal = putOI;
                }
            }

            // [V3 FIX] 0DTE Options % — OI of today's expiry / total OI
            let zeroDtePctVal: number | null = null;
            if (rawContracts.length > 0) {
                const today = new Date().toISOString().split('T')[0];
                let todayOI = 0, totalOI = 0;
                for (const c of rawContracts) {
                    const oi = c.open_interest || 0;
                    totalOI += oi;
                    const exp = c.details?.expiration_date || c.expiration_date || '';
                    if (exp === today) todayOI += oi;
                }
                if (totalOI > 0) {
                    zeroDtePctVal = parseFloat(((todayOI / totalOI) * 100).toFixed(1));
                }
            }

            // [V3 FIX] Implied Move Direction — call vs put volume bias
            let impliedMoveDirVal: string | null = null;
            if (volumePcrCallVolVal && volumePcrPutVolVal) {
                const ratio = volumePcrPutVolVal / volumePcrCallVolVal;
                if (ratio > 1.3) impliedMoveDirVal = 'PUT';
                else if (ratio < 0.7) impliedMoveDirVal = 'CALL';
                else impliedMoveDirVal = 'NEUTRAL';
            }
            const netPremium = structureRes?.netPremium ?? null;
            const whaleIndex = calculateWhaleIndex(alphaGex, darkPoolPct, blockTradesCount, netPremium);

            let alphaResult;
            try {
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(),
                    session: alphaSession,
                    price: currentPrice,
                    prevClose: stockData.prevClose || 0,
                    changePct,
                    vwap: stockData.vwap ?? null,
                    return3D,
                    rsi14: stockData.rsi ?? null,
                    pcr: alphaPcr,
                    gex: alphaGex,
                    rawChain: rawContracts,
                    callWall: directCallWall || structureRes?.callWall || null,
                    putFloor: directPutFloor || structureRes?.putFloor || null,
                    gammaFlipLevel: alphaGammaFlip,
                    squeezeScore: alphaSqueezeScore,
                    relVol,
                    optionsDataAvailable: !!opts,
                    preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                    ndxChangePct: macroData?.nqChangePercent ?? null,
                    vixValue: macroData?.vix ?? null,
                    vixChangePct: macroData?.factors?.vix?.chgPct ?? null,
                    tltChangePct: macroData?.tltChangePct ?? null,
                    gldChangePct: macroData?.gldChangePct ?? null,
                    dxy: macroData?.dxy ?? null,
                    realYieldStance: macroData?.realYield?.stance ?? null,
                    darkPoolPct, shortVolPct, blockTrades: blockTradesCount,
                    whaleIndex, netFlow: netPremium, sma20, ivSkew, impliedMovePct,
                    atmIv: structureRes?.atmIv ?? null, fearGreedScore,
                    // [V5.5+] MACD + VIX Term Structure
                    macdHistogram: (stockData as any).macdHistogram ?? null,
                    vix3mValue: macroData?.vix3mValue ?? null,
                });
            } catch (e) {
                console.error(`[Watchlist Batch] V5 Engine failed for ${ticker}:`, e);
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(), session: alphaSession, price: currentPrice,
                    prevClose: stockData.prevClose || 0, changePct,
                    preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                    ndxChangePct: macroData?.nqChangePercent ?? null, vixValue: macroData?.vix ?? null,
                    tltChangePct: macroData?.tltChangePct ?? null, gldChangePct: macroData?.gldChangePct ?? null,
                });
            }

            const { score, grade, action, actionKR, whyKR, triggerCodes: triggers, dataCompleteness: confidence } = alphaResult;

            const hasOptionsData = opts && (opts?.maxPain || opts?.gems?.gex || opts?.gex);
            const maxPain = hasOptionsData ? (opts?.maxPain || null) : null;
            const rawGex = opts?.gems?.gex || opts?.gex;
            const gex = hasOptionsData ? (rawGex || null) : null;

            let whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE' = 'NONE';
            const pcr = opts?.putCallRatio || 1;
            if (gex !== null && gex !== undefined) {
                if (gex > 0 && pcr < 0.8) whaleConfidence = 'HIGH';
                else if (gex > 0 && pcr <= 1.2) whaleConfidence = 'MED';
                else whaleConfidence = 'LOW';
            }

            const gammaFlipLevel = structureRes?.gammaFlipLevel ?? null;
            const structureGexM = structureRes?.netGex ? Number((structureRes.netGex / 1000000).toFixed(2)) : null;
            const structureMaxPain = structureRes?.maxPain ?? null;
            const iv = structureRes?.atmIv ?? opts?.gems?.iv ?? opts?.iv ?? null;

            const finalMaxPain = structureMaxPain ?? maxPain;
            const finalMaxPainDist = (finalMaxPain && currentPrice) ? Number(((finalMaxPain - currentPrice) / currentPrice * 100).toFixed(2)) : null;

            const fullObj = {
                ticker,
                alphaSnapshot: {
                    score, grade, action, actionKR, whyKR, confidence: Math.round(confidence),
                    triggers, pillars: alphaResult.pillars, gatesApplied: alphaResult.gatesApplied,
                    engineVersion: alphaResult.engineVersion, capturedAt: new Date().toISOString()
                },
                realtime: {
                    price: stockData.price || 0, changePct, session: stockData.session || 'reg',
                    rsi: stockData.rsi || null, return3d: stockData.return3d || null,
                    sparkline: stockData.history?.slice(-20).map((h: any) => h.close) || [],
                    maxPain: finalMaxPain, maxPainDist: finalMaxPainDist,
                    gex: structureRes?.netGex ?? null, gexM: structureGexM,
                    pcr: opts?.putCallRatio || null, whaleIndex: Math.round(whaleIndex),
                    whaleConfidence, gammaFlipLevel, iv, vwap: stockData.vwap || null,
                    vwapDist: (stockData.vwap && stockData.price) ? Number(((stockData.price - stockData.vwap) / stockData.vwap * 100).toFixed(2)) : null,
                    callWall: structureRes?.levels?.callWall ?? null, putFloor: structureRes?.levels?.putFloor ?? null,
                    netPremium: structureRes?.netPremium ?? null, volume: stockData.volume || 0,
                    relVol: relVol ?? 0,
                    extendedPrice: (stockData as any).extendedPrice || null,
                    extendedChangePct: (stockData as any).extendedChangePct || null,
                    extendedLabel: (stockData as any).extendedLabel || undefined,
                    ivSkew: typeof ivSkew === 'number' ? ivSkew : (typeof ivSkew === 'object' && ivSkew !== null ? (ivSkew as any).value ?? null : null),
                    impliedMovePct: impliedMovePct ?? null,
                }
            };

            // 🔥 [GLOBAL CACHE WARMMER] Instantly write ANY custom ticker to Cache for future Zero-Latency SSR
            writeAnalysisCache(ticker, {
                ticker,
                timestamp: Date.now(),
                alphaSnapshot: fullObj.alphaSnapshot,
                rsi: fullObj.realtime.rsi,
                return3d: fullObj.realtime.return3d,
                sparkline: fullObj.realtime.sparkline,
                relVol: fullObj.realtime.relVol,
                expiration: structureRes?.expiration ?? null,
                maxPain: fullObj.realtime.maxPain,
                gex: fullObj.realtime.gex,
                gexM: fullObj.realtime.gexM,
                pcr: fullObj.realtime.pcr,
                callWall: fullObj.realtime.callWall,
                putFloor: fullObj.realtime.putFloor,
                gammaFlipLevel: fullObj.realtime.gammaFlipLevel,
                squeezeScore: alphaSqueezeScore,
                iv: fullObj.realtime.iv,
                whaleIndex: fullObj.realtime.whaleIndex,
                whaleConfidence: fullObj.realtime.whaleConfidence,
                netPremium: fullObj.realtime.netPremium,
                vwapDist: fullObj.realtime.vwapDist,
                volume: fullObj.realtime.volume,
                darkPoolPct: darkPoolPct ?? 0,
                ivSkew: typeof ivSkew === 'number' ? ivSkew : (typeof ivSkew === 'object' && ivSkew !== null ? (ivSkew as any).value ?? null : null),
                impliedMovePct: impliedMovePct ?? null,
                // [V3 FIX] Dashboard card fields
                shortVolPct: shortVolPct ?? null,
                vwap: stockData.vwap ?? null,
                volumePcr: volumePcrVal,
                volumePcrCallVol: volumePcrCallVolVal,
                volumePcrPutVol: volumePcrPutVolVal,
                zeroDtePct: zeroDtePctVal,
                impliedMoveDir: impliedMoveDirVal,
            }).catch(e => console.error(`Failed to write analysis cache for ${ticker}`, e));

            // 🔥 [V4.6 WRITE-BACK] Record accurate SSR Alpha Score to DynamoDB
            // Replaces Lambda's simplified 3-factor score with full V4.6 pillar breakdown
            recordAlphaDaily(ticker, {
                alphaScore: alphaResult.score,
                qualityTier: 'SSR_V46',
                changePct,
                gex: alphaGex ?? 0,
                pcr: alphaPcr ?? 0,
                grade: alphaResult.grade,
                momentum: alphaResult.pillars.momentum.score,
                structure: alphaResult.pillars.structure.score,
                flow: alphaResult.pillars.flow.score,
                regime: alphaResult.pillars.regime.score,
                catalyst: alphaResult.pillars.catalyst.score,
                engineVersion: alphaResult.engineVersion,
                price: currentPrice,
                // [V5.0] Full input vector for future re-calculation
                rsi14: stockData.rsi ?? null,
                atmIv: structureRes?.atmIv ?? null,
                darkPoolPct: darkPoolPct ?? null,
                whaleIndex: Math.round(whaleIndex),
                squeezeScore: alphaSqueezeScore ?? null,
                relVol: relVol ?? null,
                shortVolPct: shortVolPct ?? null,
                callWall: directCallWall || structureRes?.levels?.callWall || structureRes?.callWall || null,
                putFloor: directPutFloor || structureRes?.levels?.putFloor || structureRes?.putFloor || null,
                gammaFlipLevel: alphaGammaFlip ?? null,
                return3D: return3D ?? null,
                netPremium: netPremium ?? null,
                ivSkew: typeof ivSkew === 'number' ? ivSkew : (typeof ivSkew === 'object' && ivSkew !== null ? (ivSkew as any).value ?? null : null),
                impliedMovePct: impliedMovePct ?? null,
            });

            return fullObj;

        } catch (error) {
            console.error(`Batch analyze error for ${ticker}:`, error);
            return { ticker, error: 'Analysis failed' };
        }
    }));
        results.push(...chunkResults);
    }

    return {
        results,
        meta: {
            count: tickers.length,
            elapsed: Date.now() - startTime,
            source: mode === 'full' ? (missingTickers.length === 0 ? 'analysis_cache' : 'hybrid_compute') : 'polygon_snapshot_fast',
            cached: missingTickers.length === 0
        }
    };
}
