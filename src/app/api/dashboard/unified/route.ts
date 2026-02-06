import { NextRequest, NextResponse } from 'next/server';

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
                extended: data.extended || null,
                session: data.session || 'CLOSED',
                netGex: data.netGex,
                maxPain: data.maxPain,
                pcr: data.pcr,
                isGammaSqueeze: data.isGammaSqueeze,
                gammaFlipLevel: data.gammaFlipLevel,
                atmIv: data.atmIv || null,
                levels: data.levels,
                expiration: data.expiration,
                options_status: data.options_status
            };

            // Generate signals
            const timestamp = new Date().toISOString();
            const price = data.underlyingPrice;
            const callWall = data.levels?.callWall;
            const putFloor = data.levels?.putFloor;
            const gammaFlip = data.gammaFlipLevel;
            const isLong = gammaFlip && price ? price > gammaFlip : null;

            // BUY signals
            if (putFloor && price && data.netGex && price <= putFloor * 1.02 && data.netGex > 0) {
                signals.push({ time: timestamp, ticker, type: 'BUY', message: `지지선 매수 기회 (Put Floor $${putFloor})` });
            }
            if (isLong === true && data.netGex && data.netGex > 0) {
                signals.push({ time: timestamp, ticker, type: 'BUY', message: `Gamma LONG - 반등 구간 진입` });
            }
            if (data.pcr && data.pcr < 0.7) {
                signals.push({ time: timestamp, ticker, type: 'BUY', message: `콜 강세 (PCR ${data.pcr.toFixed(2)}) - 상승 추세` });
            }

            // SELL signals
            if (callWall && price && data.netGex && price >= callWall * 0.98 && data.netGex < 0) {
                signals.push({ time: timestamp, ticker, type: 'SELL', message: `저항선 도달 - 익절 고려 (Call Wall $${callWall})` });
            }
            if (isLong === false) {
                signals.push({ time: timestamp, ticker, type: 'SELL', message: `Gamma SHORT - 하락 변동성 주의` });
            }
            if (data.pcr && data.pcr > 1.3) {
                signals.push({ time: timestamp, ticker, type: 'SELL', message: `풋 헤징 증가 (PCR ${data.pcr.toFixed(2)}) - 하락 주의` });
            }

            // WHALE signals
            if (data.netGex && Math.abs(data.netGex) > 100000000) {
                const size = Math.abs(data.netGex) > 500000000 ? '🐋🐋 초대형' : '🐋';
                signals.push({ time: timestamp, ticker, type: 'WHALE', message: `${size} 고래 GEX ($${(data.netGex / 1e6).toFixed(0)}M)` });
            }

            // ALERT signals
            if (data.isGammaSqueeze) {
                signals.push({ time: timestamp, ticker, type: 'ALERT', message: `🔥 감마 스퀴즈 - 급등 임박!` });
            }
            if (data.atmIv && data.atmIv > 60) {
                signals.push({ time: timestamp, ticker, type: 'ALERT', message: `📈 고변동성 (IV ${data.atmIv}%) - 큰 움직임 예상` });
            }
            if (data.netGex && data.netGex < 0) {
                signals.push({ time: timestamp, ticker, type: 'ALERT', message: `⚠️ GEX 음수 - 변동성 확대` });
            }
            if (callWall && price && price > callWall) {
                signals.push({ time: timestamp, ticker, type: 'ALERT', message: `🚀 Call Wall 돌파 ($${callWall}) - 신규 고점` });
            }
            if (putFloor && price && price < putFloor) {
                signals.push({ time: timestamp, ticker, type: 'ALERT', message: `💥 Put Floor 이탈 ($${putFloor}) - 손절 고려` });
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
        // Fetch market data (VIX, SPY)
        const marketData = await fetchMarketData();

        // Fetch all ticker data in parallel
        const tickerPromises = tickers.map(async (ticker) => {
            try {
                const data = await fetchTickerData(ticker, request);
                return { ticker, data, error: null };
            } catch (e: any) {
                return { ticker, data: null, error: e.message };
            }
        });

        const tickerResults = await Promise.all(tickerPromises);

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
                    // [S-78] Extended session data for Watchlist (Command style)
                    extended: data.extended || null,
                    session: data.session || 'CLOSED',
                    netGex: data.netGex,
                    maxPain: data.maxPain,
                    pcr: data.pcr,
                    isGammaSqueeze: data.isGammaSqueeze,
                    gammaFlipLevel: data.gammaFlipLevel,
                    atmIv: data.atmIv || null,  // [S-78] ATM IV for premium cards
                    levels: data.levels,
                    expiration: data.expiration,
                    options_status: data.options_status
                    // structure removed - FlowRadar fetches rawChain directly
                };

                // Generate actionable trading signals
                // [LOCALIZATION] Use ISO timestamp - client will format based on locale
                const timestamp = new Date().toISOString();
                const price = data.underlyingPrice;
                const callWall = data.levels?.callWall;
                const putFloor = data.levels?.putFloor;
                const gammaFlip = data.gammaFlipLevel;
                const isLong = gammaFlip && price ? price > gammaFlip : null;

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
                // Put Floor breakdown
                if (putFloor && price && price < putFloor) {
                    signals.push({
                        time: timestamp, ticker, type: 'ALERT',
                        message: `💥 Put Floor 이탈 ($${putFloor}) - 손절 고려`
                    });
                }
            } else {
                tickersData[ticker] = { error };
            }
        });

        const response = {
            timestamp: new Date().toISOString(),
            market: marketData,
            tickers: tickersData,
            signals: signals.slice(0, 20), // Max 20 signals
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

// Fetch market overview data
async function fetchMarketData() {
    try {
        // Use our existing API for SPY
        const spyRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/live/options/structure?t=SPY`);
        const spy = await spyRes.json();

        // Determine market phase based on SPY metrics
        let phase = 'NEUTRAL';
        if (spy.changePercent > 0.5 && spy.netGex && spy.netGex > 0) {
            phase = 'BULLISH_EXPANSION';
        } else if (spy.changePercent < -0.5 && spy.netGex && spy.netGex < 0) {
            phase = 'BEARISH_DECLINE';
        } else if (spy.changePercent > 0) {
            phase = 'BULLISH';
        } else if (spy.changePercent < 0) {
            phase = 'BEARISH';
        }

        return {
            spy: {
                price: spy.underlyingPrice || null,
                change: spy.changePercent || 0
            },
            vix: null, // VIX requires separate data source
            phase,
            marketStatus: getMarketStatus()
        };
    } catch {
        return {
            spy: { price: null, change: 0 },
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
        // [S-78] Parallel fetch: structure (for options data) + ticker (for extended prices)
        const [structureRes, tickerRes] = await Promise.all([
            fetch(`${baseUrl}/api/live/options/structure?t=${ticker}`),
            fetch(`${baseUrl}/api/live/ticker?t=${ticker}`)
        ]);

        if (!structureRes.ok) {
            throw new Error(`Failed to fetch ${ticker}: ${structureRes.status}`);
        }

        const structureData = await structureRes.json();

        // [DATA VALIDATION] Auto-retry if confidence is LOW
        if (structureData.validation?.confidence === 'LOW' && retryCount < maxRetries) {
            retryCount++;
            console.log(`[Dashboard] ${ticker} validation LOW, retry ${retryCount}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay for speed
            return attemptFetch();
        }

        // Merge extended session data from ticker API (Command style)
        if (tickerRes.ok) {
            const tickerData = await tickerRes.json();
            structureData.extended = tickerData.extended || null;
            structureData.session = tickerData.session || 'CLOSED';
            structureData.prevClose = tickerData.prices?.prevRegularClose || structureData.prevClose;
            // [INTRADAY FIX] Add today's regular close for proper intraday display
            structureData.regularCloseToday = tickerData.prices?.regularCloseToday || null;
        }

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
