
import { fetchMassive } from "@/services/massiveClient";
import { getTreasuryYields } from "@/services/fedApiClient";
import { fetchStockNews, NewsItem } from "@/services/newsHubProvider";
import { getMacroSnapshotSSOT } from "@/services/macroHubProvider";

// === CONFIGURATION ===
const MARKET_CORE_10 = [
    'QQQ', 'SPY', 'IWM', // Indices
    'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA' // M7
];

const MOMENTUM_TICKER = 'QQQ';
const MOMENTUM_WINDOW_DAYS = 22; // Approx 1 month trading days

// === TYPES ===
export interface RLSIResult {
    score: number;       // 0-100
    level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL';
    components: {
        sentimentRaw: number; // -1 to 1
        sentimentScore: number; // 0-100
        momentumRaw: number;  // ratio (e.g. 1.05)
        momentumScore: number; // 0-100
        yieldRaw: number;     // %
        yieldPenalty: number; // deduction
        vix: number;
        vixMultiplier: number;
    };
    timestamp: string;
}

// === HELPER: Sentiment Calculation ===
// Returns -1.0 to 1.0
function calculateSentimentScore(news: NewsItem[]): number {
    if (!news || news.length === 0) return 0;

    let score = 0;
    let totalWeight = 0;

    // Weight recency
    const now = Date.now();

    for (const item of news) {
        // Decay score by age (older = less weight)
        // 0h: 1.0, 24h: 0.5, 48h: 0.25
        const ageHours = item.catalystAge;
        const weight = Math.max(0.1, 1 / (1 + ageHours / 24));

        let itemScore = 0;
        if (item.sentiment === 'positive') itemScore = 1;
        if (item.sentiment === 'negative') itemScore = -1;

        score += itemScore * weight;
        totalWeight += weight;
    }

    if (totalWeight === 0) return 0;

    // Normalize to -1 to 1 range
    // We dampen extreme swings slightly
    const rawRatio = score / totalWeight;
    return Math.max(-1, Math.min(1, rawRatio));
}

// === HELPER: Momentum Calculation ===
// Returns current / 20MA ratio
async function getQQQMomentum(): Promise<number> {
    try {
        // Fetch last 22 daily bars for 20MA
        // We use a simplified endpoint if available, but poly/v2/aggs is standard
        const to = new Date().toISOString().split('T')[0];
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 40); // Safe buffer for weekends
        const from = fromDate.toISOString().split('T')[0];

        const endpoint = `/v2/aggs/ticker/${MOMENTUM_TICKER}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=${MOMENTUM_WINDOW_DAYS}`;
        const data = await fetchMassive(endpoint, {}, true);

        if (!data.results || data.results.length < 5) return 1.0; // Fallback

        const closes = data.results.map((r: any) => r.c);
        const current = closes[0];
        const maSlice = closes.slice(0, 20); // Last 20 days
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

// === MAIN ENGINE ===

export async function calculateRLSI(force: boolean = false): Promise<RLSIResult> {
    // 0. Check Cache
    if (!force && cachedRLSI) {
        const age = Date.now() - new Date(cachedRLSI.timestamp).getTime();
        if (age < CACHE_DURATION_MS) {
            return cachedRLSI;
        }
    }

    try {
        // 1. Parallel Fetch Data (with defensive catch per fetch)
        const [news, momentum, yields, macro] = await Promise.all([
            fetchStockNews(MARKET_CORE_10, 30).catch(e => { console.warn("[RLSI] News fetch failed:", e?.message); return []; }),
            getQQQMomentum().catch(e => { console.warn("[RLSI] Momentum fetch failed:", e?.message); return 1.0; }),
            getTreasuryYields().catch(e => { console.warn("[RLSI] Yields fetch failed:", e?.message); return { us10y: 4.0 } as any; }),
            getMacroSnapshotSSOT().catch(e => { console.warn("[RLSI] Macro fetch failed:", e?.message); return { vix: 15 } as any; })
        ]);

        // 2. Component Calculations

        // A. Sentiment Factor (0-100)
        const sentimentRaw = calculateSentimentScore(news);
        // Formula: (S + 1) * 50 -> Maps -1..1 to 0..100
        const sentimentScore = (sentimentRaw + 1) * 50;

        // B. Momentum Factor (0-100)
        // Formula: 50 + (Ratio - 1) * 1000
        // 1.00 -> 50
        // 1.01 (+1%) -> 60
        // 1.05 (+5%) -> 100 (Clamped)
        // 0.95 (-5%) -> 0 (Clamped)
        const momentumRaw = momentum;
        let momentumScore = 50 + (momentumRaw - 1) * 1000;
        momentumScore = Math.max(0, Math.min(100, momentumScore));

        // C. Yield Penalty
        // Formula: max(0, (Y - 3.5) * 10)
        const yieldRaw = yields.us10y || 4.0; // Default 4.0 if fail
        const yieldPenalty = Math.max(0, (yieldRaw - 3.5) * 10);

        // D. VIX Filter
        // If VIX > 20: * 0.8
        // If VIX > 30: * 0.5
        const vix = macro?.vix || 15;
        let vixMultiplier = 1.0;
        if (vix > 30) vixMultiplier = 0.5;
        else if (vix > 20) vixMultiplier = 0.8;

        // 3. Final Calculation
        // Base = (Sentiment * 0.4) + (Momentum * 0.4) + 20 - Penalty
        // Note: The '20' is a base buffer to prevent 0 too easily
        let baseScore = (sentimentScore * 0.4) + (momentumScore * 0.4) + 20 - yieldPenalty;

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
            components: {
                sentimentRaw: Number(sentimentRaw.toFixed(2)),
                sentimentScore: Number(sentimentScore.toFixed(1)),
                momentumRaw: Number(momentumRaw.toFixed(3)),
                momentumScore: Number(momentumScore.toFixed(1)),
                yieldRaw: Number(yieldRaw.toFixed(2)),
                yieldPenalty: Number(yieldPenalty.toFixed(1)),
                vix: Number(vix.toFixed(2)),
                vixMultiplier
            },
            timestamp: new Date().toISOString()
        };

        // Update Cache
        cachedRLSI = result;
        console.log(`[RLSI] Calculation complete. Score: ${result.score}`);
        return result;

    } catch (error: any) {
        console.error("[RLSI] CRITICAL ERROR in calculateRLSI:", error?.message || error);
        // Return a safe fallback result
        return {
            score: 50,
            level: 'NEUTRAL',
            components: {
                sentimentRaw: 0,
                sentimentScore: 50,
                momentumRaw: 1.0,
                momentumScore: 50,
                yieldRaw: 4.0,
                yieldPenalty: 5,
                vix: 15,
                vixMultiplier: 1.0
            },
            timestamp: new Date().toISOString()
        };
    }
}
