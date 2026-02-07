// Finnhub API Client - For Earnings Calendar & Analyst Data
// Free tier: 60 calls/min

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const BASE_URL = 'https://finnhub.io/api/v1';

export interface EarningsEvent {
    date: string;
    epsActual: number | null;
    epsEstimate: number | null;
    hour: 'bmo' | 'amc' | 'dmh'; // Before Market Open, After Market Close, During Market Hours
    quarter: number;
    revenueActual: number | null;
    revenueEstimate: number | null;
    symbol: string;
    year: number;
}

export interface RecommendationTrend {
    buy: number;
    hold: number;
    period: string;
    sell: number;
    strongBuy: number;
    strongSell: number;
    symbol: string;
}

export interface InsiderTransaction {
    name: string;
    share: number;
    change: number;
    filingDate: string;
    transactionDate: string;
    transactionCode: string;
    transactionPrice: number;
}

export interface PriceTarget {
    lastUpdated: string;
    symbol: string;
    targetHigh: number;
    targetLow: number;
    targetMean: number;
    targetMedian: number;
}

async function fetchFinnhub<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    if (!FINNHUB_API_KEY) {
        console.warn('[FinnhubClient] API key not configured');
        return null;
    }

    const queryParams = new URLSearchParams({ ...params, token: FINNHUB_API_KEY });
    const url = `${BASE_URL}${endpoint}?${queryParams}`;

    try {
        const res = await fetch(url, {
            next: { revalidate: 3600 }, // Cache for 1 hour
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
            console.error(`[FinnhubClient] ${endpoint} returned ${res.status}`);
            return null;
        }

        return await res.json();
    } catch (err) {
        console.error(`[FinnhubClient] Error fetching ${endpoint}:`, err);
        return null;
    }
}

/**
 * Get earnings calendar for a symbol
 */
export async function getEarningsCalendar(symbol: string, fromDate?: string, toDate?: string): Promise<EarningsEvent[]> {
    const today = new Date();
    const from = fromDate || today.toISOString().split('T')[0];
    const to = toDate || new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()).toISOString().split('T')[0];

    const data = await fetchFinnhub<{ earningsCalendar: EarningsEvent[] }>('/calendar/earnings', {
        symbol,
        from,
        to
    });

    return data?.earningsCalendar || [];
}

/**
 * Get earnings calendar for multiple symbols (M7)
 */
export async function getM7EarningsCalendar(): Promise<EarningsEvent[]> {
    const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'];
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const to = new Date(today.getFullYear(), today.getMonth() + 4, today.getDate()).toISOString().split('T')[0];

    const results: EarningsEvent[] = [];

    for (const symbol of M7_TICKERS) {
        const earnings = await getEarningsCalendar(symbol, from, to);
        results.push(...earnings);
    }

    // Sort by date (nearest first)
    return results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get analyst recommendation trends
 */
export async function getRecommendationTrends(symbol: string): Promise<RecommendationTrend[]> {
    const data = await fetchFinnhub<RecommendationTrend[]>('/stock/recommendation', { symbol });
    return data || [];
}

/**
 * Get M7 analyst recommendations (aggregated)
 */
export async function getM7Recommendations(): Promise<Map<string, RecommendationTrend>> {
    const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'];
    const result = new Map<string, RecommendationTrend>();

    for (const symbol of M7_TICKERS) {
        const trends = await getRecommendationTrends(symbol);
        if (trends.length > 0) {
            result.set(symbol, trends[0]); // Most recent
        }
    }

    return result;
}

/**
 * Get insider transactions
 */
export async function getInsiderTransactions(symbol: string): Promise<InsiderTransaction[]> {
    const data = await fetchFinnhub<{ data: InsiderTransaction[] }>('/stock/insider-transactions', { symbol });
    return data?.data || [];
}

/**
 * Get analyst price target consensus
 * Returns targetHigh, targetLow, targetMean, targetMedian
 */
export async function getPriceTarget(symbol: string): Promise<PriceTarget | null> {
    return fetchFinnhub<PriceTarget>('/stock/price-target', { symbol });
}

