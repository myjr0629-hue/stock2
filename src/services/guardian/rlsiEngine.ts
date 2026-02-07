
import { fetchMassive } from "@/services/massiveClient";
import { getTreasuryYields } from "@/services/fedApiClient";
import { fetchStockNews, NewsItem } from "@/services/newsHubProvider";
import { getMacroSnapshotSSOT } from "@/services/macroHubProvider";
import { getMarketBreadth, BreadthSnapshot } from "./breadthEngine";

// === CONFIGURATION ===
const MARKET_CORE_10 = [
    'QQQ', 'SPY', 'IWM', // Indices
    'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA' // M7
];

const MOMENTUM_TICKER = 'QQQ';
const MOMENTUM_WINDOW_DAYS = 22; // Approx 1 month trading days

// [V6.0] Weight Configuration — Breadth 추가, 균형 재배분
const WEIGHTS = {
    PRICE_ACTION: 0.20,    // 가격 액션 센티먼트 (M7 10종목)
    BREADTH: 0.20,         // [V6.0] Market Breadth (5000+ 종목 A/D)
    NEWS_SENTIMENT: 0.10,  // 뉴스 센티먼트
    MOMENTUM: 0.30,        // 모멘텀 (20MA 대비)
    ROTATION: 0.10,        // 순환매 강도 (외부 전달)
    BASE_BUFFER: 10        // 기본 버퍼
};

// === TYPES ===
export type MarketSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';

export interface RLSIResult {
    score: number;       // 0-100
    level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL';
    session: MarketSession; // [V5.0] Current session
    components: {
        // [V5.0] Price Action Sentiment
        priceActionRaw: number;    // 0-1 (상승 종목 비율)
        priceActionScore: number;  // 0-100
        // [V6.0] Market Breadth
        breadthPct: number;        // 상승 종목 비율 (0-100)
        breadthScore: number;      // 정규화 점수 (0-100)
        adRatio: number;           // A/D Ratio
        volumeBreadth: number;     // 거래량 기반 breadth (0-100)
        breadthSignal: string;     // STRONG/HEALTHY/NEUTRAL/WEAK/CRITICAL
        breadthDivergent: boolean; // NQ↑ but Breadth↓
        // News Sentiment
        sentimentRaw: number;      // -1 to 1
        sentimentScore: number;    // 0-100
        // Momentum
        momentumRaw: number;       // ratio (e.g. 1.05)
        momentumScore: number;     // 0-100
        // [V5.0] Rotation (from external)
        rotationScore: number;     // 0-100
        // Yield & VIX
        yieldRaw: number;
        yieldPenalty: number;
        vix: number;
        vixMultiplier: number;
    };
    timestamp: string;
}

// === [V5.0] NEW: Session Detection ===
export function getMarketSession(): MarketSession {
    const now = new Date();
    const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    const hour = et.getHours();
    const minute = et.getMinutes();
    const day = et.getDay();

    // Weekend
    if (day === 0 || day === 6) return 'CLOSED';

    const time = hour * 100 + minute;
    if (time >= 400 && time < 930) return 'PRE';
    if (time >= 930 && time < 1600) return 'REG';
    if (time >= 1600 && time < 2000) return 'POST';
    return 'CLOSED';
}

// === [V5.0] NEW: Pre-market ETF Snapshot ===
async function getETFPremarketData(tickers: string[]): Promise<{ avgChange: number; upRatio: number }> {
    try {
        const tickerStr = tickers.join(',');
        const endpoint = `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerStr}`;
        const data = await fetchMassive(endpoint, {}, true);

        if (!data.tickers || data.tickers.length === 0) {
            return { avgChange: 0, upRatio: 0.5 };
        }

        let totalChange = 0;
        let upCount = 0;

        for (const t of data.tickers) {
            const change = t.todaysChangePerc || 0;
            totalChange += change;
            if (change > 0) upCount++;
        }

        const avgChange = totalChange / data.tickers.length;
        const upRatio = upCount / data.tickers.length;

        console.log(`[RLSI V5.0] Pre-market: avgChange=${avgChange.toFixed(2)}%, upRatio=${(upRatio * 100).toFixed(0)}%`);
        return { avgChange, upRatio };
    } catch (e) {
        console.warn("[RLSI] Pre-market ETF fetch failed:", e);
        return { avgChange: 0, upRatio: 0.5 };
    }
}

// === [V5.0] NEW: Price Action Sentiment ===
// Uses real-time stock performance instead of news
async function getPriceActionSentiment(): Promise<number> {
    try {
        const tickers = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'QQQ', 'SPY', 'IWM'];
        const tickerStr = tickers.join(',');
        const endpoint = `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerStr}`;
        const data = await fetchMassive(endpoint, {}, true);

        if (!data.tickers || data.tickers.length === 0) return 0.5;

        const upCount = data.tickers.filter((t: any) => (t.todaysChangePerc || 0) > 0).length;
        return upCount / data.tickers.length; // 0-1
    } catch (e) {
        console.warn("[RLSI] Price action fetch failed:", e);
        return 0.5; // Neutral
    }
}

// === HELPER: News Sentiment Calculation ===
// Returns -1.0 to 1.0
function calculateNewsSentimentScore(news: NewsItem[]): number {
    if (!news || news.length === 0) return 0;

    let score = 0;
    let totalWeight = 0;

    for (const item of news) {
        const ageHours = item.catalystAge;
        const weight = Math.max(0.1, 1 / (1 + ageHours / 24));

        let itemScore = 0;
        if (item.sentiment === 'positive') itemScore = 1;
        if (item.sentiment === 'negative') itemScore = -1;

        score += itemScore * weight;
        totalWeight += weight;
    }

    if (totalWeight === 0) return 0;
    return Math.max(-1, Math.min(1, score / totalWeight));
}

// === HELPER: Momentum Calculation ===
// Returns current / 20MA ratio (regular session only)
async function getQQQMomentum(): Promise<number> {
    try {
        const to = new Date().toISOString().split('T')[0];
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 40);
        const from = fromDate.toISOString().split('T')[0];

        const endpoint = `/v2/aggs/ticker/${MOMENTUM_TICKER}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=${MOMENTUM_WINDOW_DAYS}`;
        const data = await fetchMassive(endpoint, {}, true);

        if (!data.results || data.results.length < 5) return 1.0;

        const closes = data.results.map((r: any) => r.c);
        const current = closes[0];
        const maSlice = closes.slice(0, 20);
        const avg = maSlice.reduce((a: number, b: number) => a + b, 0) / maSlice.length;

        if (avg === 0) return 1.0;
        return current / avg;
    } catch (e) {
        console.warn("[RLSI] Momentum fetch failed:", e);
        return 1.0;
    }
}

// === CACHE STATE ===
let cachedRLSI: RLSIResult | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 Minutes

// === [V6.0] MAIN ENGINE - BREADTH INTEGRATED ===

export async function calculateRLSI(force: boolean = false, rotationScore: number = 50): Promise<RLSIResult> {
    // 0. Check Cache
    if (!force && cachedRLSI) {
        const age = Date.now() - new Date(cachedRLSI.timestamp).getTime();
        if (age < CACHE_DURATION_MS) {
            return cachedRLSI;
        }
    }

    const session = getMarketSession();
    console.log(`[RLSI V5.0] Session: ${session}, Calculating...`);

    try {
        // 1. Parallel Fetch Data based on session
        let priceActionRaw: number;
        let momentumRaw: number;

        // [V5.0] Session-aware data fetching
        if (session === 'PRE' || session === 'CLOSED') {
            // Pre-market/Closed: Use ETF snapshots for both
            const etfData = await getETFPremarketData(['QQQ', 'SPY', 'IWM', 'NVDA', 'AAPL', 'MSFT', 'AMZN']);
            priceActionRaw = etfData.upRatio;
            momentumRaw = 1 + (etfData.avgChange / 100); // Convert % to ratio
        } else {
            // Regular/Post: Use full data
            const [priceAction, momentum] = await Promise.all([
                getPriceActionSentiment(),
                getQQQMomentum()
            ]);
            priceActionRaw = priceAction;
            momentumRaw = momentum;
        }

        // Fetch other data (universal across sessions)
        // [V6.0] Added breadth parallel fetch
        const [news, yields, macro, breadth] = await Promise.all([
            fetchStockNews(MARKET_CORE_10, 30).catch(() => []),
            getTreasuryYields().catch(() => ({ us10y: 4.0 } as any)),
            getMacroSnapshotSSOT().catch(() => ({ vix: 15 } as any)),
            getMarketBreadth(0).catch(() => null as BreadthSnapshot | null)
        ]);

        // 2. Component Calculations

        // A. Price Action Score (0-100)
        const priceActionScore = priceActionRaw * 100;

        // B. [V6.0] Market Breadth Score (0-100)
        const breadthScoreValue = breadth?.breadthScore ?? 50;

        // C. News Sentiment Score (0-100)
        const sentimentRaw = calculateNewsSentimentScore(news);
        const sentimentScore = (sentimentRaw + 1) * 50;

        // D. Momentum Score (0-100)
        let momentumScore = 50 + (momentumRaw - 1) * 1000;
        momentumScore = Math.max(0, Math.min(100, momentumScore));

        // E. Rotation Score (passed from SectorEngine)
        const rotationScoreNorm = Math.max(0, Math.min(100, rotationScore));

        // F. Yield Penalty
        const yieldRaw = yields.us10y || 4.0;
        const yieldPenalty = Math.max(0, (yieldRaw - 3.5) * 10);

        // G. VIX Filter
        const vix = macro?.vix || 15;
        let vixMultiplier = 1.0;
        if (vix > 30) vixMultiplier = 0.5;
        else if (vix > 20) vixMultiplier = 0.8;

        // 3. [V6.0] Final Calculation with Breadth Integration
        // PriceAction 20% + Breadth 20% + News 10% + Momentum 30% + Rotation 10% + Base 10 - Penalty
        let baseScore =
            (priceActionScore * WEIGHTS.PRICE_ACTION) +
            (breadthScoreValue * WEIGHTS.BREADTH) +
            (sentimentScore * WEIGHTS.NEWS_SENTIMENT) +
            (momentumScore * WEIGHTS.MOMENTUM) +
            (rotationScoreNorm * WEIGHTS.ROTATION) +
            WEIGHTS.BASE_BUFFER -
            yieldPenalty;

        // Apply VIX Multiplier
        let finalScore = baseScore * vixMultiplier;

        // Clamp 0-100
        finalScore = Math.max(0, Math.min(100, finalScore));

        // Determine Level
        let level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL' = 'NEUTRAL';
        if (finalScore >= 71) level = 'OPTIMAL';
        else if (finalScore <= 30) level = 'DANGER';

        const result: RLSIResult = {
            score: Number(finalScore.toFixed(1)),
            level,
            session,
            components: {
                priceActionRaw: Number(priceActionRaw.toFixed(2)),
                priceActionScore: Number(priceActionScore.toFixed(1)),
                // [V6.0] Market Breadth
                breadthPct: breadth?.breadthPct ?? 50,
                breadthScore: breadthScoreValue,
                adRatio: breadth?.adRatio ?? 1,
                volumeBreadth: breadth?.volumeBreadth ?? 50,
                breadthSignal: breadth?.signal ?? 'NEUTRAL',
                breadthDivergent: breadth?.isDivergent ?? false,
                // News
                sentimentRaw: Number(sentimentRaw.toFixed(2)),
                sentimentScore: Number(sentimentScore.toFixed(1)),
                momentumRaw: Number(momentumRaw.toFixed(3)),
                momentumScore: Number(momentumScore.toFixed(1)),
                rotationScore: Number(rotationScoreNorm.toFixed(1)),
                yieldRaw: Number(yieldRaw.toFixed(2)),
                yieldPenalty: Number(yieldPenalty.toFixed(1)),
                vix: Number(vix.toFixed(2)),
                vixMultiplier
            },
            timestamp: new Date().toISOString()
        };

        // Update Cache
        cachedRLSI = result;
        console.log(`[RLSI V6.0] Complete. Score: ${result.score}, Level: ${result.level}, Session: ${session}, Breadth: ${breadth?.breadthPct?.toFixed(1) ?? 'N/A'}%`);
        return result;

    } catch (error: any) {
        console.error("[RLSI] CRITICAL ERROR:", error?.message || error);
        return {
            score: 50,
            level: 'NEUTRAL',
            session,
            components: {
                priceActionRaw: 0.5,
                priceActionScore: 50,
                breadthPct: 50,
                breadthScore: 50,
                adRatio: 1,
                volumeBreadth: 50,
                breadthSignal: 'NEUTRAL',
                breadthDivergent: false,
                sentimentRaw: 0,
                sentimentScore: 50,
                momentumRaw: 1.0,
                momentumScore: 50,
                rotationScore: 50,
                yieldRaw: 4.0,
                yieldPenalty: 5,
                vix: 15,
                vixMultiplier: 1.0
            },
            timestamp: new Date().toISOString()
        };
    }
}
