import { NextRequest, NextResponse } from 'next/server';
import { calculateAlphaScore, calculateWhaleIndex, type AlphaSession } from '@/services/alphaEngine';

// [V4.1] Polygon API for technical indicators (return3D, sma20, rsi14, relVol)
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const POLYGON_BASE = 'https://api.polygon.io';

// [V4.1] Fetch daily bars and compute return3D, sma20, rsi14, relVol in one call
async function fetchTechnicalIndicators(ticker: string): Promise<{
    return3D: number | null;
    sma20: number | null;
    rsi14: number | null;
    relVol: number | null;
}> {
    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0]; // 45 calendar days for 20+ trading days
        const url = `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5min
        if (!res.ok) return { return3D: null, sma20: null, rsi14: null, relVol: null };

        const data = await res.json();
        const bars = data.results || [];
        if (bars.length < 4) return { return3D: null, sma20: null, rsi14: null, relVol: null };

        const closes: number[] = bars.map((b: any) => b.c);
        const volumes: number[] = bars.map((b: any) => b.v);

        // return3D: 3-trading-day return
        let return3D: number | null = null;
        if (closes.length >= 4) {
            const recent = closes.slice(-4);
            return3D = parseFloat((((recent[3] - recent[0]) / recent[0]) * 100).toFixed(2));
        }

        // sma20: 20-day simple moving average
        let sma20: number | null = null;
        if (closes.length >= 20) {
            const last20 = closes.slice(-20);
            sma20 = parseFloat((last20.reduce((a, b) => a + b, 0) / 20).toFixed(2));
        }

        // rsi14: 14-period RSI (Wilder's smoothing)
        let rsi14: number | null = null;
        if (closes.length >= 15) {
            const changes = closes.slice(1).map((c, i) => c - closes[i]);
            let avgGain = 0, avgLoss = 0;
            for (let i = 0; i < 14; i++) {
                if (changes[i] > 0) avgGain += changes[i];
                else avgLoss += Math.abs(changes[i]);
            }
            avgGain /= 14;
            avgLoss /= 14;
            // Wilder's smoothing for remaining periods
            for (let i = 14; i < changes.length; i++) {
                if (changes[i] > 0) {
                    avgGain = (avgGain * 13 + changes[i]) / 14;
                    avgLoss = (avgLoss * 13) / 14;
                } else {
                    avgGain = (avgGain * 13) / 14;
                    avgLoss = (avgLoss * 13 + Math.abs(changes[i])) / 14;
                }
            }
            const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
            rsi14 = parseFloat((100 - 100 / (1 + rs)).toFixed(1));
        }

        // relVol: current day volume / 20-day average volume
        let relVol: number | null = null;
        if (volumes.length >= 21) {
            const todayVol = volumes[volumes.length - 1];
            const avg20Vol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
            relVol = avg20Vol > 0 ? parseFloat((todayVol / avg20Vol).toFixed(2)) : null;
        }

        return { return3D, sma20, rsi14, relVol };
    } catch {
        return { return3D: null, sma20: null, rsi14: null, relVol: null };
    }
}

// [V4.1] Calculate ivSkew from rawChain: Put ATM IV / Call ATM IV
function calculateIvSkew(rawChain: any[], price: number): number | null {
    if (!rawChain || rawChain.length === 0 || !price) return null;
    try {
        const tolerance = price * 0.05; // ±5% of price
        const atmCalls = rawChain.filter((c: any) =>
            c.details?.contract_type === 'call' &&
            Math.abs((c.details?.strike_price || 0) - price) <= tolerance &&
            c.implied_volatility > 0
        );
        const atmPuts = rawChain.filter((c: any) =>
            c.details?.contract_type === 'put' &&
            Math.abs((c.details?.strike_price || 0) - price) <= tolerance &&
            c.implied_volatility > 0
        );
        if (atmCalls.length === 0 || atmPuts.length === 0) return null;

        const avgCallIV = atmCalls.reduce((s: number, c: any) => s + c.implied_volatility, 0) / atmCalls.length;
        const avgPutIV = atmPuts.reduce((s: number, c: any) => s + c.implied_volatility, 0) / atmPuts.length;
        if (avgCallIV <= 0) return null;

        return parseFloat((avgPutIV / avgCallIV).toFixed(3)); // >1 = institutional hedging
    } catch {
        return null;
    }
}

// [PERFORMANCE] Stale-While-Revalidate Cache
interface CacheEntry {
    data: any;
    timestamp: number;
    isRevalidating?: boolean;
}
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 60000; // 60 seconds (fresh)
const STALE_TTL_MS = 300000; // 5 minutes (stale but usable)

// Default tickers for dashboard
const DEFAULT_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];

// [PERFORMANCE] Build response object from fetched results
function buildResponseFromResults(
    tickerResults: { ticker: string; data: any; error: string | null }[],
    marketData: any
) {
    const tickersData: Record<string, any> = {};
    const signals: any[] = [];

    tickerResults.forEach(({ ticker, data, error }) => {
        if (data) {
            tickersData[ticker] = {
                underlyingPrice: data.underlyingPrice,
                changePercent: data.changePercent,
                prevClose: data.prevClose,
                // [INTRADAY FIX] Today's regular session close
                regularCloseToday: data.regularCloseToday || null,
                // [INTRADAY FIX] Intraday-only change (regularCloseToday vs prevClose)
                intradayChangePct: data.intradayChangePct || data.prevChangePct || null,
                extended: data.extended || null,
                session: data.session || 'CLOSED',
                netGex: data.netGex,
                maxPain: data.maxPain,
                pcr: data.pcr,
                isGammaSqueeze: data.isGammaSqueeze,
                gammaFlipLevel: data.gammaFlipLevel,
                atmIv: data.atmIv || null,
                squeezeScore: data.squeezeScore ?? null,     // [SQUEEZE FIX] 0-100 score from structureService
                squeezeRisk: data.squeezeRisk ?? null,       // [SQUEEZE FIX] LOW/MEDIUM/HIGH/EXTREME
                // [DASHBOARD V2] New intraday indicators
                vwap: data.vwap ?? null,
                darkPoolPct: data.darkPoolPct ?? null,
                shortVolPct: data.shortVolPct ?? null,
                zeroDtePct: data.zeroDtePct ?? null,
                impliedMovePct: data.impliedMovePct ?? null,
                impliedMoveDir: data.impliedMoveDir ?? null,
                gammaConcentration: data.gammaConcentration ?? null,
                // [P/C RATIO VOLUME] Volume-based P/C ratio from rawChain
                volumePcr: data.volumePcr ?? null,
                volumePcrCallVol: data.volumePcrCallVol ?? null,
                volumePcrPutVol: data.volumePcrPutVol ?? null,
                levels: data.levels,
                expiration: data.expiration,
                options_status: data.options_status,
            };

            // [V3.0] Alpha Engine V3 — Real-time scoring (SWR path)
            try {
                const sessionMap: Record<string, AlphaSession> = { PRE: 'PRE', REG: 'REG', POST: 'POST', CLOSED: 'CLOSED' };
                const alphaSession: AlphaSession = sessionMap[data.session || 'CLOSED'] || 'CLOSED';
                const whaleIndex = calculateWhaleIndex(data.netGex);
                const alphaResult = calculateAlphaScore({
                    ticker,
                    session: alphaSession,
                    price: data.underlyingPrice || 0,
                    prevClose: data.prevClose || 0,
                    changePct: data.changePercent || 0,
                    vwap: data.vwap ?? null,
                    return3D: data._return3D ?? null, // [V4.1]
                    sma20: data._sma20 ?? null, // [V4.1]
                    rsi14: data._rsi14 ?? null, // [V4.1]
                    pcr: data.pcr ?? null,
                    gex: data.netGex ?? null,
                    callWall: data.levels?.callWall ?? null,
                    putFloor: data.levels?.putFloor ?? null,
                    gammaFlipLevel: data.gammaFlipLevel ?? null,
                    rawChain: data._rawChain ?? [],
                    squeezeScore: data.squeezeScore ?? null,
                    atmIv: data.atmIv ?? null,
                    ivSkew: data._ivSkew ?? null, // [V4.1]
                    darkPoolPct: data.darkPoolPct ?? null,
                    shortVolPct: data.shortVolPct ?? null,
                    whaleIndex,
                    relVol: data._relVol ?? null, // [V4.1]
                    netFlow: data._netPremium ?? null,
                    ndxChangePct: marketData?.nq?.change ?? null,
                    vixValue: marketData?.vix ?? null,
                    impliedMovePct: data.impliedMovePct ?? null,
                    blockTrades: data._blockTrades ?? null, // [V4.1]
                    tltChangePct: marketData?.tltChangePct ?? null, // [V4.1]
                    gldChangePct: marketData?.gldChangePct ?? null, // [V4.1]
                    optionsDataAvailable: data.options_status === 'OK',
                });
                tickersData[ticker].alpha = {
                    score: alphaResult.score,
                    grade: alphaResult.grade,
                    action: alphaResult.action,
                    actionKR: alphaResult.actionKR,
                    whyKR: alphaResult.whyKR,
                    pillars: {
                        momentum: alphaResult.pillars.momentum.score,
                        structure: alphaResult.pillars.structure.score,
                        flow: alphaResult.pillars.flow.score,
                        regime: alphaResult.pillars.regime.score,
                        catalyst: alphaResult.pillars.catalyst.score,
                    },
                    gatesApplied: alphaResult.gatesApplied,
                    dataCompleteness: alphaResult.dataCompleteness,
                    engineVersion: alphaResult.engineVersion,
                };
            } catch (e) {
                console.error(`[Dashboard V3 SWR] Alpha failed for ${ticker}:`, e);
            }

            // Generate signals — ONLY during regular market hours (REG)
            // [SIGNAL AUDIT V2] Removed: Gamma LONG/SHORT (always-firing), GEX<0 (structural noise)
            // Added: Dark Pool ≥60%, Short Vol ≥50%, Implied Move ≥5%
            const session = data.session || 'CLOSED';
            if (session === 'REG') {
                const timestamp = new Date().toISOString();
                const price = data.underlyingPrice;
                const callWall = data.levels?.callWall;
                const putFloor = data.levels?.putFloor;

                // BUY signals
                if (putFloor && price && data.netGex && price <= putFloor * 1.02 && data.netGex > 0) {
                    signals.push({ time: timestamp, ticker, type: 'BUY', message: `지지선 매수 기회 (Put Floor $${putFloor})` });
                }
                if (data.pcr && data.pcr < 0.7) {
                    signals.push({ time: timestamp, ticker, type: 'BUY', message: `콜 강세 (PCR ${data.pcr.toFixed(2)}) - 상승 추세` });
                }

                // SELL signals
                if (callWall && price && data.netGex && price >= callWall * 0.98 && data.netGex < 0) {
                    signals.push({ time: timestamp, ticker, type: 'SELL', message: `저항선 도달 - 익절 고려 (Call Wall $${callWall})` });
                }
                if (data.pcr && data.pcr > 1.3) {
                    signals.push({ time: timestamp, ticker, type: 'SELL', message: `풋 헤징 증가 (PCR ${data.pcr.toFixed(2)}) - 하락 주의` });
                }

                // WHALE signals
                if (data.netGex && Math.abs(data.netGex) > 100000000) {
                    const size = Math.abs(data.netGex) > 500000000 ? '🐋🐋 초대형' : '🐋';
                    signals.push({ time: timestamp, ticker, type: 'WHALE', message: `${size} 고래 GEX ($${(data.netGex / 1e6).toFixed(0)}M)` });
                }

                // ALERT signals — core
                if (data.isGammaSqueeze) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `🔥 감마 스퀴즈 - 급등 임박!` });
                }
                if (data.atmIv && data.atmIv > 60) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `📈 고변동성 (IV ${data.atmIv}%) - 큰 움직임 예상` });
                }
                if (callWall && price && price > callWall) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `🚀 Call Wall 돌파 ($${callWall}) - 신규 고점` });
                }
                if (putFloor && price && price < putFloor) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `💥 Put Floor 이탈 ($${putFloor}) - 손절 고려` });
                }

                // ALERT signals — V2 dashboard card signals
                if (data.darkPoolPct && data.darkPoolPct >= 60) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `🏦 Dark Pool 집중 (${data.darkPoolPct.toFixed(1)}%) - 기관 대량 거래` });
                }
                if (data.shortVolPct && data.shortVolPct >= 50) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `📉 Short Vol 급증 (${data.shortVolPct.toFixed(1)}%) - 공매도 공세` });
                }
                if (data.impliedMovePct && data.impliedMovePct >= 5) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `⚡ Implied Move ±${data.impliedMovePct}% - 대폭 변동 예상` });
                }
            }
        } else {
            tickersData[ticker] = { error };
        }
    });

    return {
        timestamp: new Date().toISOString(),
        market: marketData,
        tickers: tickersData,
        signals: signals.slice(0, 20),
        meta: {
            tickerCount: Object.keys(tickersData).length,
            cacheTTL: CACHE_TTL_MS / 1000
        }
    };
}

// Background revalidation function
async function revalidateCache(cacheKey: string, tickers: string[], request: NextRequest) {
    const cached = cache.get(cacheKey);
    if (cached?.isRevalidating) return; // Already revalidating

    // Mark as revalidating
    if (cached) {
        cache.set(cacheKey, { ...cached, isRevalidating: true });
    }

    try {
        const marketData = await fetchMarketData();
        const tickerResults = await Promise.all(
            tickers.map(async (ticker) => {
                try {
                    const data = await fetchTickerData(ticker, request);
                    return { ticker, data, error: null };
                } catch (e: any) {
                    return { ticker, data: null, error: e.message };
                }
            })
        );

        const response = buildResponseFromResults(tickerResults, marketData);
        cache.set(cacheKey, { data: response, timestamp: Date.now() });
        console.log(`[SWR] Background revalidation complete for: ${cacheKey}`);
    } catch (error) {
        console.error('[SWR] Background revalidation failed:', error);
        if (cached) {
            cache.set(cacheKey, { ...cached, isRevalidating: false });
        }
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const tickers = tickersParam
        ? tickersParam.split(',').slice(0, 10) // Max 10 tickers
        : DEFAULT_TICKERS;

    const cacheKey = tickers.sort().join(',');
    const cached = cache.get(cacheKey);
    const now = Date.now();

    // [SWR] Fresh cache - return immediately
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
        return NextResponse.json({
            ...cached.data,
            _cached: true,
            _cacheAge: Math.round((now - cached.timestamp) / 1000),
            _status: 'fresh'
        });
    }

    // [SWR] Stale cache - return immediately, revalidate in background
    if (cached && (now - cached.timestamp) < STALE_TTL_MS) {
        // Trigger background revalidation (non-blocking)
        revalidateCache(cacheKey, tickers, request);

        return NextResponse.json({
            ...cached.data,
            _cached: true,
            _cacheAge: Math.round((now - cached.timestamp) / 1000),
            _status: 'stale-while-revalidate'
        });
    }

    // [SWR] No cache or expired - must fetch synchronously

    try {
        // [PERF] Parallel fetch: market data AND all ticker data together
        const tickerPromises = tickers.map(async (ticker) => {
            try {
                const data = await fetchTickerData(ticker, request);
                return { ticker, data, error: null };
            } catch (e: any) {
                return { ticker, data: null, error: e.message };
            }
        });

        // Wait for both market and tickers in parallel
        const [marketData, ...tickerResults] = await Promise.all([
            fetchMarketData(),
            ...tickerPromises
        ]);

        // Build unified response
        const tickersData: Record<string, any> = {};
        const signals: any[] = [];

        tickerResults.forEach(({ ticker, data, error }) => {
            if (data) {
                tickersData[ticker] = {
                    underlyingPrice: data.underlyingPrice,
                    changePercent: data.changePercent,
                    prevClose: data.prevClose,
                    // [INTRADAY FIX] Today's regular session close for proper intraday display
                    regularCloseToday: data.regularCloseToday || null,
                    // [INTRADAY FIX] Intraday-only change (regularCloseToday vs prevClose)
                    intradayChangePct: data.intradayChangePct || data.prevChangePct || null,
                    // [S-78] Extended session data for Watchlist (Command style)
                    extended: data.extended || null,
                    session: data.session || 'CLOSED',
                    netGex: data.netGex,
                    maxPain: data.maxPain,
                    pcr: data.pcr,
                    isGammaSqueeze: data.isGammaSqueeze,
                    gammaFlipLevel: data.gammaFlipLevel,
                    atmIv: data.atmIv || null,  // [S-78] ATM IV for premium cards
                    squeezeScore: data.squeezeScore ?? null,   // [SQUEEZE FIX] 0-100 score from structureService
                    squeezeRisk: data.squeezeRisk ?? null,     // [SQUEEZE FIX] LOW/MEDIUM/HIGH/EXTREME
                    // [DASHBOARD V2] New intraday indicators
                    vwap: data.vwap ?? null,
                    darkPoolPct: data.darkPoolPct ?? null,
                    shortVolPct: data.shortVolPct ?? null,
                    zeroDtePct: data.zeroDtePct ?? null,
                    impliedMovePct: data.impliedMovePct ?? null,
                    impliedMoveDir: data.impliedMoveDir ?? null,
                    gammaConcentration: data.gammaConcentration ?? null,
                    levels: data.levels,
                    expiration: data.expiration,
                    options_status: data.options_status
                    // structure removed - FlowRadar fetches rawChain directly
                };

                // [V3.0] Alpha Engine V3 — Real-time absolute scoring
                try {
                    const sessionMap: Record<string, AlphaSession> = { PRE: 'PRE', REG: 'REG', POST: 'POST', CLOSED: 'CLOSED' };
                    const alphaSession: AlphaSession = sessionMap[data.session || 'CLOSED'] || 'CLOSED';
                    const whaleIndex = calculateWhaleIndex(data.netGex);
                    const alphaResult = calculateAlphaScore({
                        ticker,
                        session: alphaSession,
                        price: data.underlyingPrice || 0,
                        prevClose: data.prevClose || 0,
                        changePct: data.changePercent || 0,
                        vwap: data.vwap ?? null,
                        return3D: data._return3D ?? null, // [V4.1]
                        sma20: data._sma20 ?? null, // [V4.1]
                        rsi14: data._rsi14 ?? null, // [V4.1]
                        pcr: data.pcr ?? null,
                        gex: data.netGex ?? null,
                        callWall: data.levels?.callWall ?? null,
                        putFloor: data.levels?.putFloor ?? null,
                        gammaFlipLevel: data.gammaFlipLevel ?? null,
                        rawChain: data._rawChain ?? [],
                        squeezeScore: data.squeezeScore ?? null,
                        atmIv: data.atmIv ?? null,
                        ivSkew: data._ivSkew ?? null, // [V4.1]
                        darkPoolPct: data.darkPoolPct ?? null,
                        shortVolPct: data.shortVolPct ?? null,
                        whaleIndex,
                        relVol: data._relVol ?? null, // [V4.1]
                        netFlow: data._netPremium ?? null,
                        ndxChangePct: marketData?.nq?.change ?? null,
                        vixValue: marketData?.vix ?? null,
                        impliedMovePct: data.impliedMovePct ?? null,
                        blockTrades: data._blockTrades ?? null, // [V4.1]
                        tltChangePct: marketData?.tltChangePct ?? null, // [V4.1]
                        gldChangePct: marketData?.gldChangePct ?? null, // [V4.1]
                        optionsDataAvailable: data.options_status === 'OK',
                    });
                    tickersData[ticker].alpha = {
                        score: alphaResult.score,
                        grade: alphaResult.grade,
                        action: alphaResult.action,
                        actionKR: alphaResult.actionKR,
                        whyKR: alphaResult.whyKR,
                        pillars: {
                            momentum: alphaResult.pillars.momentum.score,
                            structure: alphaResult.pillars.structure.score,
                            flow: alphaResult.pillars.flow.score,
                            regime: alphaResult.pillars.regime.score,
                            catalyst: alphaResult.pillars.catalyst.score,
                        },
                        gatesApplied: alphaResult.gatesApplied,
                        dataCompleteness: alphaResult.dataCompleteness,
                        engineVersion: alphaResult.engineVersion,
                    };
                } catch (e) {
                    console.error(`[Dashboard V3] Alpha failed for ${ticker}:`, e);
                }
                // [LOCALIZATION] Use ISO timestamp - client will format based on locale
                const timestamp = new Date().toISOString();
                const price = data.underlyingPrice;
                const callWall = data.levels?.callWall;
                const putFloor = data.levels?.putFloor;
                const gammaFlip = data.gammaFlipLevel;
                const isLong = gammaFlip && price ? price > gammaFlip : null;

                // [REG SESSION ONLY] Generate options signals only during regular market hours
                const isRegularSession = marketData?.marketStatus === 'OPEN';

                if (isRegularSession) {
                    // === BUY SIGNALS ===
                    // Put Floor support + positive GEX
                    if (putFloor && price && data.netGex && price <= putFloor * 1.02 && data.netGex > 0) {
                        signals.push({
                            time: timestamp, ticker, type: 'BUY',
                            message: `지지선 매수 기회 (Put Floor $${putFloor})`
                        });
                    }
                    // Gamma LONG transition
                    if (isLong === true && data.netGex && data.netGex > 0) {
                        signals.push({
                            time: timestamp, ticker, type: 'BUY',
                            message: `Gamma LONG - 반등 구간 진입`
                        });
                    }
                    // Strong call dominance (bullish)
                    if (data.pcr && data.pcr < 0.7) {
                        signals.push({
                            time: timestamp, ticker, type: 'BUY',
                            message: `콜 강세 (PCR ${data.pcr.toFixed(2)}) - 상승 추세`
                        });
                    }

                    // === SELL SIGNALS ===
                    // Call Wall resistance + negative GEX
                    if (callWall && price && data.netGex && price >= callWall * 0.98 && data.netGex < 0) {
                        signals.push({
                            time: timestamp, ticker, type: 'SELL',
                            message: `저항선 도달 - 익절 고려 (Call Wall $${callWall})`
                        });
                    }
                    // Gamma SHORT - high volatility zone
                    if (isLong === false) {
                        signals.push({
                            time: timestamp, ticker, type: 'SELL',
                            message: `Gamma SHORT - 하락 변동성 주의`
                        });
                    }
                    // Strong put dominance (bearish)
                    if (data.pcr && data.pcr > 1.3) {
                        signals.push({
                            time: timestamp, ticker, type: 'SELL',
                            message: `풋 헤징 증가 (PCR ${data.pcr.toFixed(2)}) - 하락 주의`
                        });
                    }

                    // === WHALE SIGNALS ===
                    if (data.netGex && Math.abs(data.netGex) > 100000000) {
                        const size = Math.abs(data.netGex) > 500000000 ? '🐋🐋 초대형' : '🐋';
                        signals.push({
                            time: timestamp, ticker, type: 'WHALE',
                            message: `${size} 고래 GEX ($${(data.netGex / 1e6).toFixed(0)}M)`
                        });
                    }

                    // === ALERT SIGNALS ===
                    // Gamma Squeeze
                    if (data.isGammaSqueeze) {
                        signals.push({
                            time: timestamp, ticker, type: 'ALERT',
                            message: `🔥 감마 스퀴즈 - 급등 임박!`
                        });
                    }
                    // High IV
                    if (data.atmIv && data.atmIv > 60) {
                        signals.push({
                            time: timestamp, ticker, type: 'ALERT',
                            message: `📈 고변동성 (IV ${data.atmIv}%) - 큰 움직임 예상`
                        });
                    }
                    // GEX negative flip
                    if (data.netGex && data.netGex < 0) {
                        signals.push({
                            time: timestamp, ticker, type: 'ALERT',
                            message: `⚠️ GEX 음수 - 변동성 확대`
                        });
                    }
                    // Call Wall breakout
                    if (callWall && price && price > callWall) {
                        signals.push({
                            time: timestamp, ticker, type: 'ALERT',
                            message: `🚀 Call Wall 돌파 ($${callWall}) - 신규 고점`
                        });
                    }
                    if (putFloor && price && price < putFloor) {
                        signals.push({
                            time: timestamp, ticker, type: 'ALERT',
                            message: `💥 Put Floor 이탈 ($${putFloor}) - 손절 고려`
                        });
                    }
                } // End of isRegularSession check
            } else {
                tickersData[ticker] = { error };
            }
        });

        const response = {
            timestamp: new Date().toISOString(),
            market: marketData,
            tickers: tickersData,
            signals: signals.slice(0, 15), // Max 15 signals (reduced from 20)
            meta: {
                tickerCount: Object.keys(tickersData).length,
                cacheTTL: CACHE_TTL_MS / 1000
            }
        };

        // Store in cache
        cache.set(cacheKey, { data: response, timestamp: Date.now() });

        return NextResponse.json(response);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Fetch market overview data - uses macro cache for NQ data (faster, no separate fetch)
async function fetchMarketData() {
    try {
        // [PERF] Direct import instead of HTTP call - faster and more reliable
        const { getMacroSnapshotSSOT } = await import('@/services/macroHubProvider');
        const macro = await getMacroSnapshotSSOT();

        const nqChange = macro?.nqChangePercent || 0;
        const nqPrice = macro?.nq || null;
        const vix = macro?.vix || null;

        // Determine market phase based on NQ metrics
        let phase = 'NEUTRAL';
        if (nqChange > 0.5) {
            phase = 'BULLISH_EXPANSION';
        } else if (nqChange < -0.5) {
            phase = 'BEARISH_DECLINE';
        } else if (nqChange > 0) {
            phase = 'BULLISH';
        } else if (nqChange < 0) {
            phase = 'BEARISH';
        }

        return {
            // [V45.13] Changed from SPY to NQ (NASDAQ 100)
            nq: {
                price: nqPrice,
                change: nqChange
            },
            vix,
            phase,
            marketStatus: getMarketStatus(),
            // [V4.1] Safe Haven ETFs for AlphaEngine regime scoring
            tltChangePct: (macro as any)?.tltChangePct ?? null,
            gldChangePct: (macro as any)?.gldChangePct ?? null,
        };
    } catch {
        return {
            nq: { price: null, change: 0 },
            vix: null,
            phase: 'UNKNOWN',
            marketStatus: getMarketStatus()
        };
    }
}

// Fetch individual ticker data using structure + ticker API for extended prices
// [DATA VALIDATION] Auto-retry when validation.confidence is LOW
async function fetchTickerData(ticker: string, request: NextRequest, maxRetries: number = 3): Promise<any> {
    const baseUrl = new URL(request.url).origin;
    let retryCount = 0;

    const attemptFetch = async (): Promise<any> => {
        // [DASHBOARD V2] Parallel fetch: structure + ticker + realtime-metrics + technical indicators
        const [structureRes, tickerRes, metricsRes, techIndicators] = await Promise.all([
            fetch(`${baseUrl}/api/live/options/structure?t=${ticker}`),
            fetch(`${baseUrl}/api/live/ticker?t=${ticker}`),
            fetch(`${baseUrl}/api/flow/realtime-metrics?ticker=${ticker}`).catch(() => null),
            fetchTechnicalIndicators(ticker) // [V4.1] return3D, sma20, rsi14, relVol
        ]);

        if (!structureRes.ok) {
            throw new Error(`Failed to fetch ${ticker}: ${structureRes.status}`);
        }

        const structureData = await structureRes.json();

        // [DATA VALIDATION] Auto-retry if confidence is LOW
        if (structureData.validation?.confidence === 'LOW' && retryCount < maxRetries) {
            retryCount++;
            console.log(`[Dashboard] ${ticker} validation LOW, retry ${retryCount}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 300));
            return attemptFetch();
        }

        // Merge extended session data from ticker API (Command style)
        let tickerRawChain: any[] = [];
        if (tickerRes.ok) {
            const tickerData = await tickerRes.json();
            structureData.extended = tickerData.extended || null;
            structureData.session = tickerData.session || 'CLOSED';
            structureData.prevClose = tickerData.prices?.prevRegularClose || structureData.prevClose;
            structureData.regularCloseToday = tickerData.prices?.regularCloseToday || null;
            structureData.intradayChangePct = tickerData.prices?.prevChangePct || null;
            // [DASHBOARD V2] VWAP from ticker API
            structureData.vwap = tickerData.vwap ?? null;
            // [DASHBOARD V2] Save rawChain for 0DTE/IM computation
            tickerRawChain = tickerData.flow?.rawChain || [];
        }

        // [DASHBOARD V2] Dark Pool % & Short Vol % from realtime-metrics
        if (metricsRes && metricsRes.ok) {
            try {
                const metrics = await metricsRes.json();
                structureData.darkPoolPct = metrics.darkPool?.percent ?? null;
                structureData.shortVolPct = metrics.shortVolume?.percent ?? null;
                structureData._blockTrades = metrics.blockTrade?.count ?? null; // [V4.1] Block trades for AlphaEngine
            } catch {
                // Continue without metrics
            }
        }

        // [DASHBOARD V2] 0DTE Impact & Implied Move from rawChain (ticker API)
        // Uses gamma-weighted ratio matching FlowRadar.tsx
        try {
            const rawChain = tickerRawChain;
            const price = structureData.underlyingPrice || 0;

            if (rawChain.length > 0 && price > 0) {
                // Find nearest expiry (same as FlowRadar)
                const expirySet = new Set<string>();
                rawChain.forEach((o: any) => {
                    const exp = o.details?.expiration_date;
                    if (exp) expirySet.add(exp);
                });
                const sortedExpiries = Array.from(expirySet).sort();
                const today = new Date().toISOString().split('T')[0];
                let targetExpiry = today;
                if (!expirySet.has(today)) {
                    targetExpiry = sortedExpiries.find(e => e >= today) || sortedExpiries[0] || today;
                }

                // Gamma-weighted 0DTE (same logic as FlowRadar)
                let totalGamma = 0;
                let nearestGamma = 0;
                let atmGamma = 0; // [GEX REGIME] ATM concentration for pinStrength
                rawChain.forEach((o: any) => {
                    const gamma = o.greeks?.gamma || 0;
                    const oi = o.open_interest || 0;
                    const strike = o.details?.strike_price || 0;
                    const gammaExposure = Math.abs(gamma * oi * 100);
                    totalGamma += gammaExposure;
                    if (o.details?.expiration_date === targetExpiry) {
                        nearestGamma += gammaExposure;
                    }
                    // ATM = within 2% of current price (matches FlowRadar)
                    if (Math.abs(strike - price) / price < 0.02) {
                        atmGamma += gammaExposure;
                    }
                });
                structureData.zeroDtePct = totalGamma > 0 ? Math.round((nearestGamma / totalGamma) * 100) : 0;
                structureData.gammaConcentration = totalGamma > 0 ? Math.round((atmGamma / totalGamma) * 100) : 0;

                // Implied Move: ATM straddle price / underlying price * 100
                // [FIX] Use FlowRadar's nearest-strike approach (not rounded ATM ±5)
                const nearestContracts = rawChain.filter((o: any) => o.details?.expiration_date === targetExpiry);
                let nearestCall: any = null, nearestPut: any = null;
                let minCallDist = Infinity, minPutDist = Infinity;
                nearestContracts.forEach((o: any) => {
                    const strike = o.details?.strike_price;
                    if (!strike) return;
                    const dist = Math.abs(strike - price);
                    if (o.details?.contract_type === 'call' && dist < minCallDist) { minCallDist = dist; nearestCall = o; }
                    if (o.details?.contract_type === 'put' && dist < minPutDist) { minPutDist = dist; nearestPut = o; }
                });
                const callMid = nearestCall?.last_trade?.price || nearestCall?.day?.close || 0;
                const putMid = nearestPut?.last_trade?.price || nearestPut?.day?.close || 0;
                if (callMid > 0 && putMid > 0 && price > 0) {
                    structureData.impliedMovePct = parseFloat(((callMid + putMid) / price * 100).toFixed(1));
                    structureData.impliedMoveDir = callMid > putMid ? 'bullish' : callMid < putMid ? 'bearish' : 'neutral';
                }

                // [P/C RATIO VOLUME] Calculate call/put volume ratio (matches FlowRadar.tsx pcRatio exactly)
                // rawChain = weekly expiration contracts from CentralDataHub._fetchOptionsChain()
                let callVol = 0, putVol = 0;
                rawChain.forEach((o: any) => {
                    const vol = o.day?.volume || 0;
                    const type = o.details?.contract_type;
                    if (type === 'call') callVol += vol;
                    else if (type === 'put') putVol += vol;
                });
                if (callVol > 0 || putVol > 0) {
                    structureData.volumePcr = putVol > 0 ? Math.round((callVol / putVol) * 100) / 100 : (callVol > 0 ? 10 : 0);
                    structureData.volumePcrCallVol = callVol;
                    structureData.volumePcrPutVol = putVol;
                }
            }
        } catch (e) {
            // Continue without 0DTE/IM data
        }

        // [V3 PIPELINE] Pass rawChain and net premium for alpha scoring
        structureData._rawChain = tickerRawChain;
        // Calculate net premium from rawChain for flow scoring
        let netPremium = 0;
        try {
            tickerRawChain.forEach((o: any) => {
                const premium = (o.last_trade?.price || o.day?.close || 0) * (o.open_interest || 0) * 100;
                const type = o.details?.contract_type;
                if (type === 'call') netPremium += premium;
                else if (type === 'put') netPremium -= premium;
            });
        } catch { /* ignore */ }
        structureData._netPremium = netPremium !== 0 ? netPremium : null;

        // [V4.1] Technical indicators (return3D, sma20, rsi14, relVol)
        structureData._return3D = techIndicators.return3D;
        structureData._sma20 = techIndicators.sma20;
        structureData._rsi14 = techIndicators.rsi14;
        structureData._relVol = techIndicators.relVol;

        // [V4.1] IV Skew from rawChain (Put IV / Call IV at ATM)
        structureData._ivSkew = calculateIvSkew(tickerRawChain, structureData.underlyingPrice);

        return structureData;
    };

    return attemptFetch();
}

// Determine current market status
function getMarketStatus(): 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED' {
    const now = new Date();
    const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();
    const day = nyTime.getDay();

    // Weekend
    if (day === 0 || day === 6) return 'CLOSED';

    const timeInMinutes = hour * 60 + minute;

    // Pre-market: 4:00 AM - 9:30 AM
    if (timeInMinutes >= 240 && timeInMinutes < 570) return 'PRE';
    // Regular: 9:30 AM - 4:00 PM
    if (timeInMinutes >= 570 && timeInMinutes < 960) return 'OPEN';
    // After-hours: 4:00 PM - 8:00 PM
    if (timeInMinutes >= 960 && timeInMinutes < 1200) return 'AFTER';

    return 'CLOSED';
}
