import { NextRequest, NextResponse } from 'next/server';

// In-memory cache with 30-second TTL
interface CacheEntry {
    data: any;
    timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds

// Default tickers for dashboard
const DEFAULT_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const tickers = tickersParam
        ? tickersParam.split(',').slice(0, 10) // Max 10 tickers
        : DEFAULT_TICKERS;

    // Check cache
    const cacheKey = tickers.sort().join(',');
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json({
            ...cached.data,
            _cached: true,
            _cacheAge: Math.round((Date.now() - cached.timestamp) / 1000)
        });
    }

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

                // Generate signals for notable conditions
                const timestamp = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

                // Gamma Squeeze condition
                if (data.isGammaSqueeze) {
                    signals.push({
                        time: timestamp,
                        ticker,
                        type: 'SQUEEZE',
                        message: `${ticker} 감마 스퀴즈 조건 충족 - 급등 가능성`
                    });
                }

                // Whale activity (large GEX)
                if (data.netGex && Math.abs(data.netGex) > 500000000) {
                    signals.push({
                        time: timestamp,
                        ticker,
                        type: 'WHALE',
                        message: `${ticker} 대형 GEX 포지션 ($${(data.netGex / 1e9).toFixed(2)}B)`
                    });
                }

                // Extreme PCR (Put/Call Ratio)
                if (data.pcr && data.pcr > 1.2) {
                    signals.push({
                        time: timestamp,
                        ticker,
                        type: 'ALERT',
                        message: `${ticker} 높은 풋/콜 비율 (${data.pcr.toFixed(2)}) - 하락 헤지 증가`
                    });
                } else if (data.pcr && data.pcr < 0.5) {
                    signals.push({
                        time: timestamp,
                        ticker,
                        type: 'HOT',
                        message: `${ticker} 낮은 풋/콜 비율 (${data.pcr.toFixed(2)}) - 콜 매수 강세`
                    });
                }

                // Price near Max Pain (pinning effect)
                if (data.underlyingPrice && data.maxPain) {
                    const distance = Math.abs(data.underlyingPrice - data.maxPain) / data.underlyingPrice * 100;
                    if (distance < 1) {
                        signals.push({
                            time: timestamp,
                            ticker,
                            type: 'ALERT',
                            message: `${ticker} Max Pain 근접 ($${data.maxPain}) - 핀닝 효과 예상`
                        });
                    }
                }

                // High momentum (change > 2%)
                if (data.changePercent && Math.abs(data.changePercent) > 2) {
                    signals.push({
                        time: timestamp,
                        ticker,
                        type: data.changePercent > 0 ? 'HOT' : 'ALERT',
                        message: `${ticker} 강한 모멘텀 ${data.changePercent > 0 ? '상승' : '하락'} (${data.changePercent.toFixed(2)}%)`
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
async function fetchTickerData(ticker: string, request: NextRequest) {
    const baseUrl = new URL(request.url).origin;

    // [S-78] Parallel fetch: structure (for options data) + ticker (for extended prices)
    const [structureRes, tickerRes] = await Promise.all([
        fetch(`${baseUrl}/api/live/options/structure?t=${ticker}`),
        fetch(`${baseUrl}/api/live/ticker?t=${ticker}`)
    ]);

    if (!structureRes.ok) {
        throw new Error(`Failed to fetch ${ticker}: ${structureRes.status}`);
    }

    const structureData = await structureRes.json();

    // Merge extended session data from ticker API (Command style)
    if (tickerRes.ok) {
        const tickerData = await tickerRes.json();
        structureData.extended = tickerData.extended || null;
        structureData.session = tickerData.session || 'CLOSED';
        structureData.prevClose = tickerData.prices?.prevRegularClose || structureData.prevClose;
    }

    return structureData;
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
