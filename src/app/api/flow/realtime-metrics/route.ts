// API Route: /api/flow/realtime-metrics
// Fetches Dark Pool %, Short Volume %, Bid-Ask Spread, Block Trades
// Uses Polygon.io APIs

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const POLYGON_BASE = "https://api.polygon.io";

// [SSOT V3] EC2 Redis Proxy — reads from ElastiCache (VPC internal, $0 cost)
const EC2_REDIS_PROXY = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
const EC2_REDIS_PROXY_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";

async function fetchFromElastiCache(key: string): Promise<any | null> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout
        const res = await fetch(`${EC2_REDIS_PROXY}/get?key=${encodeURIComponent(key)}`, {
            headers: { 'Authorization': `Bearer ${EC2_REDIS_PROXY_KEY}` },
            signal: controller.signal,
            cache: 'no-store',
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.result || null;
    } catch {
        return null; // Proxy down → silent fallback to Upstash
    }
}

// Dark Pool Exchange Codes (FINRA TRF/ADF = Dark Pool)
const DARK_POOL_EXCHANGES: Set<number> = new Set([4, 15, 16, 19]);

interface TradeData {
    darkPoolPercent: number;
    darkPoolVolume: number;
    totalVolume: number;
    blockTrades: number;
    blockVolume: number;
    largestTrade: { size: number; price: number };
    avgTradeSize: number;
    // Buy/Sell classification (Quote Rule)
    buyPct: number;
    sellPct: number;
    buyVolume: number;
    sellVolume: number;
    buyVwap: number;
    sellVwap: number;
    netBuyValue: number;
}

interface QuoteData {
    bidAskSpread: number;
    bid: number;
    ask: number;
    spreadLabel: string;
}

interface ShortVolumeData {
    shortVolPercent: number;
    shortVolume: number;
    totalVolume: number;
}

// Fetch Trades for Dark Pool & Block Trade analysis + Buy/Sell classification (Quote Rule)
async function fetchTradeData(ticker: string): Promise<TradeData | null> {
    // ══════════════════════════════════════════════════════════════
    // [2026-08-29] 다크풀 계산 중단 — Massive 차단
    //
    // 이 함수는 /v3/trades + /v3/quotes 틱을 표본으로 다크풀%·블록트레이드를
    // 계산했다. Massive 차단 후 실측:
    //   /v3/trades  → HTTP 200 이지만 status:"DELAYED", **19시간 전 데이터**
    //   /v3/quotes  → 동일
    //   short-volume→ HTTP 200 이지만 date "2024-02-06" (2년 전)
    //   WebSocket   → close(1008) 차단
    //
    // 즉 "200 OK 인데 값은 어제 것"이라 **오탐이 가장 위험한 형태**였다.
    // 실제로 darkPool 50%·blockTrade 52 가 어제 값으로 계산돼 앱의
    // `darkPool >= 45` 판단 로직까지 오염시키고 있었다.
    //
    // Intrinio Startup 에는 틱 단위 체결/호가가 없다(Enterprise 전용).
    // → 다크풀 계열은 **제공 중단**하고 null 을 반환한다.
    //   소비처는 이미 0/null 을 '-' 로 표시하도록 되어 있다.
    //
    // 되살리려면: Intrinio Enterprise(15-Min Delayed SIP) 계약 후
    //   DELAYED_SIP provider 로 market_center 기반 재구현.
    // 정본: .agent/INTRINIO_MIGRATION_WORKLOG.md
    // ══════════════════════════════════════════════════════════════
    if (process.env.ENABLE_MASSIVE_TICKS !== "1") return null;

    try {
        // [PROD FIX] limit=5000 trades + 1000 quotes — sufficient sample for DP% calculation
        // Previous limit=50000 + next_url follow (100K+ trades) caused Vercel serverless timeout
        // 5000 trades is statistically representative for dark pool ratio (sampling-based)
        const [tradesRes, quotesRes] = await Promise.all([
            fetch(`${POLYGON_BASE}/v3/trades/${ticker}?limit=5000&apiKey=${POLYGON_API_KEY}`),
            fetch(`${POLYGON_BASE}/v3/quotes/${ticker}?limit=1000&order=desc&apiKey=${POLYGON_API_KEY}`),
        ]);

        if (!tradesRes.ok) {
            console.error(`[realtime-metrics] Trades API error: ${tradesRes.status}`);
            return null;
        }

        const tradesData = await tradesRes.json();
        const trades = tradesData.results || [];
        // NO next_url follow — 5K trades is sufficient and keeps response under 2s

        // Parse quotes for Quote Rule — sort ascending by timestamp for binary search
        const quotesRaw = quotesRes.ok
            ? ((await quotesRes.json()).results || [])
            : [];
        // Pre-sort quotes by sip_timestamp (ascending) for O(log N) binary search
        const quotes = quotesRaw.sort((a: any, b: any) => {
            const ta = BigInt(a.sip_timestamp);
            const tb = BigInt(b.sip_timestamp);
            return ta < tb ? -1 : ta > tb ? 1 : 0;
        });

        if (trades.length === 0) return null;

        // Binary search: find quote with nearest timestamp to target
        function findNearestQuote(targetTs: bigint): any {
            if (quotes.length === 0) return null;
            let lo = 0, hi = quotes.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                const midTs = BigInt(quotes[mid].sip_timestamp);
                if (midTs < targetTs) lo = mid + 1;
                else hi = mid;
            }
            // Compare lo and lo-1 to find the absolute nearest
            let best = lo;
            if (lo > 0) {
                const diffLo = targetTs - BigInt(quotes[lo - 1].sip_timestamp);
                const diffHi = BigInt(quotes[lo].sip_timestamp) - targetTs;
                if ((diffLo < BigInt(0) ? -diffLo : diffLo) < (diffHi < BigInt(0) ? -diffHi : diffHi)) {
                    best = lo - 1;
                }
            }
            return quotes[best];
        }

        let totalVolume = 0;
        let darkPoolVolume = 0;
        let blockTrades = 0;
        let blockVolume = 0;
        let largestTrade = { size: 0, price: 0 };

        // Buy/Sell classification accumulators
        let dpBuyVol = 0, dpSellVol = 0, dpNeutralVol = 0;
        let dpBuyVal = 0, dpSellVal = 0;

        for (const trade of trades) {
            const size = trade.size || 0;
            const price = trade.price || 0;
            const exchangeId = trade.exchange;

            totalVolume += size;

            // Dark Pool detection
            if (DARK_POOL_EXCHANGES.has(exchangeId)) {
                darkPoolVolume += size;

                // Quote Rule classification: binary search for nearest quote O(log N)
                if (quotes.length > 0) {
                    const bestQ = findNearestQuote(BigInt(trade.sip_timestamp));

                    if (bestQ && bestQ.bid_price > 0 && bestQ.ask_price > 0) {
                        const mid = (bestQ.bid_price + bestQ.ask_price) / 2;
                        if (price >= bestQ.ask_price) { dpBuyVol += size; dpBuyVal += size * price; }
                        else if (price <= bestQ.bid_price) { dpSellVol += size; dpSellVal += size * price; }
                        else if (price > mid) { dpBuyVol += size; dpBuyVal += size * price; }
                        else if (price < mid) { dpSellVol += size; dpSellVal += size * price; }
                        else { dpNeutralVol += size; }
                    } else {
                        dpNeutralVol += size;
                    }
                }
            }

            // Block Trade (≥10,000 shares OR ≥$200,000 value)
            if (size >= 10000 || (size * price) >= 200000) {
                blockTrades++;
                blockVolume += size;
            }

            // Track largest
            if (size > largestTrade.size) {
                largestTrade = { size, price };
            }
        }

        const darkPoolPercent = totalVolume > 0 ? (darkPoolVolume / totalVolume) * 100 : 0;
        const avgTradeSize = trades.length > 0 ? totalVolume / trades.length : 0;

        // Buy/Sell percentages
        const dpTotal = dpBuyVol + dpSellVol + dpNeutralVol;
        const buyPct = dpTotal > 0 ? Math.round((dpBuyVol / dpTotal) * 1000) / 10 : 0;
        const sellPct = dpTotal > 0 ? Math.round((dpSellVol / dpTotal) * 1000) / 10 : 0;

        return {
            darkPoolPercent: Math.round(darkPoolPercent * 10) / 10,
            darkPoolVolume,
            totalVolume,
            blockTrades,
            blockVolume,
            largestTrade,
            avgTradeSize: Math.round(avgTradeSize),
            // Buy/Sell classification
            buyPct,
            sellPct,
            buyVolume: dpBuyVol,
            sellVolume: dpSellVol,
            buyVwap: dpBuyVol > 0 ? Math.round((dpBuyVal / dpBuyVol) * 100) / 100 : 0,
            sellVwap: dpSellVol > 0 ? Math.round((dpSellVal / dpSellVol) * 100) / 100 : 0,
            netBuyValue: Math.round(dpBuyVal - dpSellVal),
        };
    } catch (error) {
        console.error('[realtime-metrics] fetchTradeData error:', error);
        return null;
    }
}

// Fetch Quotes for Bid-Ask Spread
async function fetchQuoteData(ticker: string): Promise<QuoteData | null> {
    try {
        const url = `${POLYGON_BASE}/v3/quotes/${ticker}?limit=1&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
            console.error(`[realtime-metrics] Quotes API error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const quote = data.results?.[0];

        if (!quote) return null;

        const bid = quote.bid_price || 0;
        const ask = quote.ask_price || 0;
        const spread = ask - bid;

        // Spread interpretation
        let spreadLabel = "보통";
        if (spread <= 0.01) spreadLabel = "매우 타이트";
        else if (spread <= 0.05) spreadLabel = "타이트";
        else if (spread <= 0.20) spreadLabel = "보통";
        else spreadLabel = "넓음";

        return {
            bidAskSpread: Math.round(spread * 100) / 100,
            bid,
            ask,
            spreadLabel,
        };
    } catch (error) {
        console.error('[realtime-metrics] fetchQuoteData error:', error);
        return null;
    }
}

// Fetch Short Volume (daily)
async function fetchShortVolumeData(ticker: string): Promise<ShortVolumeData | null> {
    // [2026-08-29] Massive short-volume 은 HTTP 200 을 주지만 실측 date 가
    // "2024-02-06" — **2년 전 데이터**다. 값이 있으니 정상처럼 보이는 게 더 위험하다.
    // Intrinio Startup 에는 공매도 잔고/거래량이 없다(Enterprise 전용) → 제공 중단.
    if (process.env.ENABLE_MASSIVE_TICKS !== "1") return null;

    try {
        const url = `${POLYGON_BASE}/stocks/v1/short-volume?ticker=${ticker}&limit=1&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
            console.error(`[realtime-metrics] Short Volume API error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const result = data.results?.[0];

        if (!result) return null;

        const shortVolume = result.short_volume || 0;
        const totalVolume = result.total_volume || 1;
        const shortVolPercent = (shortVolume / totalVolume) * 100;

        return {
            shortVolPercent: Math.round(shortVolPercent * 10) / 10,
            shortVolume,
            totalVolume,
        };
    } catch (error) {
        console.error('[realtime-metrics] fetchShortVolumeData error:', error);
        return null;
    }
}

// [SWR Helper] Build response object from fetched data
function buildResponse(ticker: string, tradeData: TradeData | null, quoteData: QuoteData | null, shortVolumeData: ShortVolumeData | null) {
    return {
        ticker,
        timestamp: new Date().toISOString(),
        _ts: Date.now(), // For SWR age detection
        darkPool: tradeData ? {
            percent: tradeData.darkPoolPercent,
            volume: tradeData.darkPoolVolume,
            totalVolume: tradeData.totalVolume,
            buyPct: tradeData.buyPct,
            sellPct: tradeData.sellPct,
            buyVolume: tradeData.buyVolume,
            sellVolume: tradeData.sellVolume,
            buyVwap: tradeData.buyVwap,
            sellVwap: tradeData.sellVwap,
            netBuyValue: tradeData.netBuyValue,
        } : null,
        blockTrade: tradeData ? {
            count: tradeData.blockTrades,
            volume: tradeData.blockVolume,
            largestTrade: tradeData.largestTrade,
        } : null,
        bidAsk: quoteData ? {
            spread: quoteData.bidAskSpread,
            bid: quoteData.bid,
            ask: quoteData.ask,
            label: quoteData.spreadLabel,
        } : null,
        shortVolume: shortVolumeData ? {
            percent: shortVolumeData.shortVolPercent,
            volume: shortVolumeData.shortVolume,
            totalVolume: shortVolumeData.totalVolume,
        } : null,
    };
}

// [SWR Helper] Background fetch + cache update (fire-and-forget)
async function fetchAndCacheMetrics(ticker: string, cacheKey: string, ttl: number) {
    try {
        const [tradeData, quoteData, shortVolumeData] = await Promise.all([
            fetchTradeData(ticker),
            fetchQuoteData(ticker),
            fetchShortVolumeData(ticker),
        ]);
        if (tradeData || quoteData || shortVolumeData) {
            const response = buildResponse(ticker, tradeData, quoteData, shortVolumeData);
            await setInCache(cacheKey, response, ttl);
            console.log(`[realtime-metrics] Background refresh complete for ${ticker}`);
        }
    } catch (e) {
        console.warn(`[realtime-metrics] Background refresh failed for ${ticker}:`, e);
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase() || 'TSLA';
    const cacheKey = `rt-metrics:${ticker}`;
    const REDIS_TTL = 600; // 10 minutes (Polygon sampling cache)
    const STALE_THRESHOLD_MS = 300_000; // 5 minutes (for Polygon sampling)
    const EC2_STALE_THRESHOLD_MS = 57_600_000; // 16 hours (for EC2 100% data — valid until next session)

    try {
        // [SSOT V3] PRIMARY: Read from EC2 ElastiCache via Redis Proxy
        // EC2 Flow Accumulator writes 100% accurate dark pool data here (vs 0.025% sampling)
        // Cost: $0 (ElastiCache is VPC-internal)
        const ec2Data = await fetchFromElastiCache(cacheKey).catch(() => null);
        if (ec2Data && ec2Data.darkPool) {
            // [FIX] EC2 flow accumulator writes real-time WebSocket data without _ts field.
            // Missing _ts = live EC2 data = treat as fresh (0ms age), NOT infinitely old.
            const cacheAge = ec2Data._ts ? Date.now() - ec2Data._ts : 0;
            // EC2 100% data is valid for 16 hours (until next market open)
            const threshold = ec2Data._source === 'ec2-flow-accumulator' ? EC2_STALE_THRESHOLD_MS : STALE_THRESHOLD_MS;
            if (cacheAge < threshold) {
                return NextResponse.json({ ...ec2Data, _cached: true, _ageMs: cacheAge, _via: 'elasticache' });
            }
        }

        // [FALLBACK] SECONDARY: Read from Upstash Redis (legacy cache)
        // [FIX V2] SWR PATTERN: Always serve cached data immediately (even if stale)
        // This handler fetches 50K+ trades (4-8s on Polygon) — cold fetch always times out
        // when called from unified route's callInternalGet with 8s timeout
        const cached = await getFromCache<any>(cacheKey).catch(() => null);
        if (cached && cached.darkPool) {
            const cacheAge = cached._ts ? Date.now() - cached._ts : Infinity;
            if (cacheAge < STALE_THRESHOLD_MS) {
                // Fresh cache — return immediately
                return NextResponse.json({ ...cached, _cached: true, _ageMs: cacheAge });
            }
            // Stale cache — return immediately BUT trigger background refresh
            // DO NOT await the refresh — user gets instant response
            fetchAndCacheMetrics(ticker, cacheKey, REDIS_TTL).catch(() => {});
            return NextResponse.json({ ...cached, _cached: true, _stale: true, _ageMs: cacheAge });
        }

        // Cache miss or stale — Fetch all data in parallel
        const [tradeData, quoteData, shortVolumeData] = await Promise.all([
            fetchTradeData(ticker),
            fetchQuoteData(ticker),
            fetchShortVolumeData(ticker),
        ]);

        // If all fetches failed, return empty
        if (!tradeData && !quoteData && !shortVolumeData) {
            return NextResponse.json({ ticker, darkPool: null, blockTrade: null, shortVolume: null, error: 'No data available' });
        }

        const response = buildResponse(ticker, tradeData, quoteData, shortVolumeData);

        // Save to Redis with timestamp for SWR age detection
        if (tradeData || quoteData || shortVolumeData) {
            setInCache(cacheKey, response, REDIS_TTL).catch(() => { }); // fire-and-forget
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error('[realtime-metrics] Error:', error);
        // On error → serve Redis cached data
        const cached = await getFromCache<any>(cacheKey);
        if (cached) {
            return NextResponse.json({ ...cached, _cached: true });
        }
        return NextResponse.json(
            { error: 'Failed to fetch metrics' },
            { status: 500 }
        );
    }
}
