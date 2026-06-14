
// src/services/guardian/rlsiEngine.ts
// RLSI V2.0 — Gamma-Enhanced Macro Gauge
// The world's first composite index fusing options gamma structure with macro sentiment.
// 8 components + adaptive VIX dampening + contrarian Z-Score reversal.

import { fetchMassive } from "@/services/massiveClient";
import { getTreasuryYields } from "@/services/fedApiClient";
import { getMacroSnapshotSSOT } from "@/services/macroHubProvider";
import { getMarketBreadth, BreadthSnapshot } from "./breadthEngine";
import { getYahooDataSSOT } from "@/services/yahooFinanceHub";
import { getFromCache, setInCache } from '@/services/redisClient';
import { GammaShieldData } from "./gammaShieldEngine";

// === CONFIGURATION ===
const MOMENTUM_TICKER = 'QQQ';

// [V2.0] 8-Factor Weight Configuration
const WEIGHTS = {
    CROSS_ASSET_MOMENTUM: 0.20,   // QQQ/20MA + RUT/SPX relative strength
    BREADTH_MCCLELLAN: 0.15,      // A/D + McClellan Oscillator
    GAMMA_STRUCTURE: 0.15,        // GEX Index + Squeeze + Flip distance (🆕)
    LIQUIDITY_FLOW: 0.10,         // TLT+GLD+BTC cross-asset flow (🆕)
    VOLATILITY_REGIME: 0.10,      // VIX level + VIX/VIX3M term structure (🆕 independent)
    ROTATION: 0.10,               // Sector rotation intensity
    SENTIMENT: 0.10,              // CNN F&G
    CONTRARIAN_ZSCORE: 0.05,      // Extreme reversal signal (🆕)
    BASE_BUFFER: 5                // Base stability buffer (reduced from 10)
};

// === TYPES ===
export type MarketSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';

// [V2.0] Enhanced Market Regime
export type MarketRegime = 'RISK_ON' | 'RISK_OFF' | 'ROTATION' | 'PANIC' | 'NEUTRAL';

export interface RLSIResult {
    score: number;       // 0-100
    level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL';
    session: MarketSession;
    // [V2.0] New fields
    regime: MarketRegime;
    zScore: number | null;         // Standard deviations from 20-period mean
    zSignal: string | null;        // 'EXTREME_FEAR_REVERSAL' | 'OVERHEATED' | null
    gammaAdjustment: number;       // Points added/subtracted by gamma
    components: {
        // Cross-Asset Momentum
        priceActionRaw: number;
        priceActionScore: number;
        // [V2.0] RUT/SPX Relative Strength
        rutSpxRatio: number;          // RUT relative to SPX (>1 = small-cap outperform)
        crossAssetMomentumScore: number;
        // Market Breadth + McClellan
        breadthPct: number;
        breadthScore: number;
        adRatio: number;
        volumeBreadth: number;
        breadthSignal: string;
        breadthDivergent: boolean;
        mcClellanOsc: number;         // [V2.0] McClellan Oscillator value
        breadthMcClellanScore: number;
        // [V2.0] Gamma Structure
        gexIndex: number;             // -100 to +100
        gexLevel: string;             // LONG_GAMMA | NEUTRAL | SHORT_GAMMA
        squeezeRisk: number;          // 0-100
        gammaScore: number;           // 0-100 normalized
        // [V2.0] Liquidity Flow
        tltChange: number;
        gldChange: number;
        btcChange: number;
        safeHavenFlow: number;
        liquidityScore: number;       // 0-100
        // [V2.0] Volatility Regime
        vix: number;
        vixTermStructure: number;
        volatilityScore: number;      // 0-100
        // Sentiment
        sentimentRaw: number;
        sentimentScore: number;
        sentimentSource?: string;
        // Momentum
        momentumRaw: number;
        momentumScore: number;
        // Rotation
        rotationScore: number;
        // Yield
        yieldRaw: number;
        yieldPenalty: number;
        // VIX (legacy compat)
        vixMultiplier: number;
        // [V2.0] Flow
        bondFlow: number;
        goldFlow: number;
    };
    timestamp: string;
}

// === Session Detection ===
export function getMarketSession(): MarketSession {
    const now = new Date();
    const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    const hour = et.getHours();
    const minute = et.getMinutes();
    const day = et.getDay();

    if (day === 0 || day === 6) return 'CLOSED';

    const time = hour * 100 + minute;
    if (time >= 400 && time < 930) return 'PRE';
    if (time >= 930 && time < 1600) return 'REG';
    if (time >= 1600 && time < 2000) return 'POST';
    return 'CLOSED';
}

// === [V2.0] Cross-Asset Regime Detection ===
function detectRegime(data: {
    vix: number; vixTerm: number;
    tltChange: number; gldChange: number; btcChange: number;
    rutChange: number; nqChange: number;
}): MarketRegime {
    const { vix, tltChange, gldChange, btcChange, rutChange, nqChange } = data;
    
    // PANIC: VIX > 35, all risk assets down
    if (vix > 35 && nqChange < -1 && rutChange < -1 && btcChange < -2) {
        return 'PANIC';
    }
    
    // RISK_OFF: VIX > 25, safe havens rising
    if (vix > 25 && (tltChange + gldChange) > 0.5 && nqChange < 0) {
        return 'RISK_OFF';
    }
    
    // ROTATION: RUT up but NQ down (or vice versa, large divergence)
    if (Math.abs(rutChange - nqChange) > 1.5) {
        if (rutChange > 0 && nqChange < 0) return 'ROTATION';
        if (nqChange > 0 && rutChange < -1) return 'ROTATION';
    }
    
    // RISK_ON: VIX < 18, risk assets up, safe havens down
    if (vix < 18 && nqChange > 0 && (tltChange + gldChange) < 0) {
        return 'RISK_ON';
    }
    
    return 'NEUTRAL';
}

// === [V2.0] Gamma Structure Score ===
function calculateGammaScore(gamma: GammaShieldData | null): {
    score: number; gexIndex: number; gexLevel: string; squeezeRisk: number;
} {
    if (!gamma || gamma.confidence === 'LOW') {
        return { score: 50, gexIndex: 0, gexLevel: 'NEUTRAL', squeezeRisk: 0 };
    }
    
    let score = 50; // neutral baseline
    
    // GEX contribution: -100~+100 → -25~+25 points
    score += gamma.gexIndex * 0.25;
    
    // Squeeze Risk bonus (high squeeze = short covering pressure = potential rally)
    if (gamma.squeezeRisk > 60) {
        score += (gamma.squeezeRisk - 60) * 0.15; // max +6
    }
    
    // Gamma Flip proximity warning
    if (gamma.currentPrice && gamma.gammaFlipPoint && gamma.gammaFlipPoint > 0) {
        const distPct = (gamma.currentPrice - gamma.gammaFlipPoint) / gamma.currentPrice * 100;
        if (distPct < 5 && distPct > 0) {
            // Close to flip point → reduce score (danger of regime change)
            score -= (5 - distPct) * 2; // max -10
        } else if (distPct < 0) {
            // Already below flip → short gamma environment
            score -= 10;
        }
    }
    
    // GEX trend: if getting worse rapidly
    if (gamma.gexChange !== null && gamma.gexChange < -15) {
        score -= 5; // Rapid deterioration penalty
    }
    
    return {
        score: Math.max(0, Math.min(100, Math.round(score))),
        gexIndex: gamma.gexIndex,
        gexLevel: gamma.gexLevel,
        squeezeRisk: gamma.squeezeRisk
    };
}

// === [V2.0] Z-Score Contrarian Signal ===
const ZSCORE_HISTORY_KEY = 'rlsi:zscore_history';

async function calculateZScore(currentScore: number): Promise<{
    zScore: number | null;
    zSignal: string | null;
    contrarianAdjustment: number;
}> {
    try {
        const history = await getFromCache<number[]>(ZSCORE_HISTORY_KEY);
        
        if (!history || history.length < 10) {
            // Not enough data for meaningful Z-Score
            return { zScore: null, zSignal: null, contrarianAdjustment: 0 };
        }
        
        // Use last 20 entries (or all if less)
        const window = history.slice(-20);
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
        const stdDev = Math.sqrt(variance);
        
        if (stdDev < 1) {
            // Too little variance, Z-Score not meaningful
            return { zScore: null, zSignal: null, contrarianAdjustment: 0 };
        }
        
        const zScore = (currentScore - mean) / stdDev;
        
        let zSignal: string | null = null;
        let contrarianAdjustment = 0;
        
        // EXTREME FEAR: Z < -2.0 → historical extreme → mean reversion likely
        if (zScore < -2.5) {
            zSignal = 'EXTREME_FEAR_REVERSAL';
            contrarianAdjustment = 10; // Strong reversal boost
        } else if (zScore < -2.0) {
            zSignal = 'FEAR_REVERSAL';
            contrarianAdjustment = 5;  // Moderate reversal boost
        }
        // OVERHEATED: Z > +2.0 → historically stretched
        else if (zScore > 2.5) {
            zSignal = 'EXTREME_OVERHEATED';
            contrarianAdjustment = -8;
        } else if (zScore > 2.0) {
            zSignal = 'OVERHEATED';
            contrarianAdjustment = -4;
        }
        
        return { zScore: Number(zScore.toFixed(2)), zSignal, contrarianAdjustment };
    } catch (e) {
        console.warn('[RLSI V2.0] Z-Score calculation failed:', e);
        return { zScore: null, zSignal: null, contrarianAdjustment: 0 };
    }
}

async function appendZScoreHistory(score: number): Promise<void> {
    try {
        let history = await getFromCache<number[]>(ZSCORE_HISTORY_KEY) || [];
        history.push(Math.round(score));
        // Keep last 100 entries (~8 hours at 5min intervals)
        if (history.length > 100) history = history.slice(-100);
        await setInCache(ZSCORE_HISTORY_KEY, history, 7 * 24 * 60 * 60); // 7 days TTL
    } catch { /* non-critical */ }
}

// === [V2.0] McClellan Oscillator (EMA-based breadth acceleration) ===
const MCCLELLAN_KEY = 'rlsi:mcclellan';

interface McClellanState {
    ema19: number;
    ema39: number;
    oscillator: number;
    lastUpdate: string;
}

async function updateMcClellan(advancers: number, decliners: number): Promise<number> {
    const adDiff = advancers - decliners;
    
    try {
        const prev = await getFromCache<McClellanState>(MCCLELLAN_KEY);
        
        const k19 = 2 / (19 + 1); // EMA smoothing factor
        const k39 = 2 / (39 + 1);
        
        let ema19: number, ema39: number;
        
        if (prev) {
            ema19 = adDiff * k19 + prev.ema19 * (1 - k19);
            ema39 = adDiff * k39 + prev.ema39 * (1 - k39);
        } else {
            // Cold start: use current value as seed
            ema19 = adDiff;
            ema39 = adDiff;
        }
        
        const oscillator = ema19 - ema39;
        
        const state: McClellanState = {
            ema19: Number(ema19.toFixed(2)),
            ema39: Number(ema39.toFixed(2)),
            oscillator: Number(oscillator.toFixed(2)),
            lastUpdate: new Date().toISOString()
        };
        
        await setInCache(MCCLELLAN_KEY, state, 7 * 24 * 60 * 60); // 7 days
        
        console.log(`[RLSI V2.0] McClellan: EMA19=${ema19.toFixed(0)}, EMA39=${ema39.toFixed(0)}, Osc=${oscillator.toFixed(0)}`);
        return oscillator;
    } catch (e) {
        console.warn('[RLSI V2.0] McClellan update failed:', e);
        return 0;
    }
}

// === [V2.0] Liquidity Flow Score ===
function calculateLiquidityScore(tltChange: number, gldChange: number, btcChange: number): {
    score: number; safeHavenFlow: number;
} {
    // Safe Haven Flow: TLT + GLD combined movement
    const safeHavenFlow = tltChange + gldChange;
    
    let score = 50; // neutral
    
    // If money FLEEING to safety (TLT+GLD rising) → negative for equities
    if (safeHavenFlow > 1.0) {
        score -= safeHavenFlow * 12; // Severe flight to safety
    } else if (safeHavenFlow > 0.5) {
        score -= safeHavenFlow * 8;
    } else if (safeHavenFlow < -0.5) {
        // Money LEAVING safety → positive for equities (risk-on)
        score -= safeHavenFlow * 6; // safeHavenFlow is negative, so this adds
    }
    
    // BTC as risk sentiment proxy
    if (btcChange > 2) score += 5;       // Strong risk-on
    else if (btcChange < -3) score -= 8; // Risk-off signal
    
    return {
        score: Math.max(0, Math.min(100, Math.round(score))),
        safeHavenFlow
    };
}

// === [V2.0] Volatility Regime Score ===
function calculateVolatilityScore(vix: number, vixTermStructure: number): number {
    let score = 50;
    
    // VIX Level (inverse: low VIX = high score)
    // VIX 12 = 85, VIX 20 = 50, VIX 30 = 20, VIX 40 = 5
    score = Math.max(5, Math.min(85, 95 - vix * 2.5));
    
    // VIX Term Structure adjustment
    // Contango (VIX < VIX3M, ratio < 1.0) → normal/positive
    // Backwardation (VIX > VIX3M, ratio > 1.0) → panic/negative
    if (vixTermStructure > 1.05) {
        score -= 15; // Severe backwardation = panic
    } else if (vixTermStructure > 1.0) {
        score -= 8;  // Mild backwardation
    } else if (vixTermStructure < 0.85) {
        score += 5;  // Steep contango = very relaxed
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
}

// === Pre-market ETF Snapshot ===
async function getETFPremarketData(tickers: string[]): Promise<{ avgChange: number; upRatio: number }> {
    try {
        const tickerStr = tickers.join(',');
        const data = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerStr}`, {}, true);

        if (!data.tickers || data.tickers.length === 0) return { avgChange: 0, upRatio: 0.5 };

        let totalWeightedChange = 0, totalWeight = 0, upCount = 0, validCount = 0;
        for (const t of data.tickers) {
            const change = t.todaysChangePerc || 0;
            const volume = t.day?.v || t.min?.v || 10;
            if (volume > 100) {
                const weight = Math.max(1, Math.log10(volume));
                totalWeightedChange += (change * weight);
                totalWeight += weight;
                validCount++;
                if (change > 0) upCount++;
            }
        }
        return {
            avgChange: totalWeight > 0 ? totalWeightedChange / totalWeight : 0,
            upRatio: validCount > 0 ? (upCount / validCount) : 0.5
        };
    } catch {
        return { avgChange: 0, upRatio: 0.5 };
    }
}

// === Price Action Sentiment ===
async function getPriceActionSentiment(): Promise<number> {
    try {
        const tickers = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'QQQ', 'SPY', 'IWM'];
        const data = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}`, {}, true);
        if (!data.tickers || data.tickers.length === 0) return 0.5;

        let totalWeight = 0, upWeight = 0;
        for (const t of data.tickers) {
            const change = t.todaysChangePerc || 0;
            const volume = t.day?.v || t.min?.v || 10;
            if (volume > 1000) {
                const weight = Math.max(1, Math.log10(volume));
                totalWeight += weight;
                if (change > 0) upWeight += weight;
            }
        }
        return totalWeight > 0 ? (upWeight / totalWeight) : 0.5;
    } catch {
        return 0.5;
    }
}

// === CNN Fear & Greed Index ===
async function fetchFearGreedIndex(): Promise<{ score: number; rating: string }> {
    try {
        const cached = await getFromCache<{ score: number; rating: string; updatedAt: string }>('cnn:feargreed');
        if (cached && typeof cached.score === 'number') {
            return { score: cached.score, rating: cached.rating };
        }
        // Strict Redis Policy: NO external HTTP calls outside cron. Fallback to VIX is handled in the caller when score is negative.
        return { score: -1, rating: 'fallback' };
    } catch {
        return { score: -1, rating: 'fallback' };
    }
}

function vixToSentiment(vix: number): number {
    if (vix <= 12) return 100;
    if (vix >= 35) return 0;
    return Math.round(100 - ((vix - 12) / 23) * 100);
}

// === Momentum: QQQ vs 20MA ===
async function getQQQMomentum(): Promise<number> {
    try {
        const to = new Date().toISOString().split('T')[0];
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 40);
        const from = fromDate.toISOString().split('T')[0];

        const data = await fetchMassive(`/v2/aggs/ticker/${MOMENTUM_TICKER}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=22`, {}, true);
        if (!data.results || data.results.length < 5) return 1.0;

        const closes = data.results.map((r: any) => r.c);
        const current = closes[0];
        const avg = closes.slice(0, 20).reduce((a: number, b: number) => a + b, 0) / Math.min(closes.length, 20);
        return avg === 0 ? 1.0 : current / avg;
    } catch {
        return 1.0;
    }
}

// === CACHE ===
let cachedRLSI: RLSIResult | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000;

// === [V2.0] MAIN ENGINE — GAMMA-ENHANCED MACRO GAUGE ===

export async function calculateRLSI(
    force: boolean = false,
    rotationScore: number = 50,
    gammaData: GammaShieldData | null = null
): Promise<RLSIResult> {
    // Cache check
    if (!force && cachedRLSI) {
        const age = Date.now() - new Date(cachedRLSI.timestamp).getTime();
        if (age < CACHE_DURATION_MS) return cachedRLSI;
    }

    const session = getMarketSession();
    console.log(`[RLSI V2.0] Session: ${session}, Calculating with Gamma+CrossAsset+ZScore+McClellan...`);

    try {
        // === 1. Parallel Data Fetch ===
        let priceActionRaw: number;
        let momentumRaw: number;

        if (session === 'PRE' || session === 'CLOSED') {
            const etfData = await getETFPremarketData(['QQQ', 'SPY', 'IWM', 'NVDA', 'AAPL', 'MSFT', 'AMZN']);
            priceActionRaw = etfData.upRatio;
            momentumRaw = 1 + (etfData.avgChange / 100);
        } else {
            const [priceAction, momentum] = await Promise.all([
                getPriceActionSentiment(),
                getQQQMomentum()
            ]);
            priceActionRaw = priceAction;
            momentumRaw = momentum;
        }

        // Universal data fetching
        const [yields, macro, breadth, yahooData, fgData] = await Promise.all([
            getTreasuryYields().catch(() => ({ us10y: 4.0 } as any)),
            getMacroSnapshotSSOT().catch(() => ({ vix: 15 } as any)),
            getMarketBreadth(0).catch(() => null as BreadthSnapshot | null),
            getYahooDataSSOT(),
            fetchFearGreedIndex()
        ]);

        // === 2. Component Calculations ===

        // A. Cross-Asset Momentum Score (20%)
        const priceActionScore = priceActionRaw * 100;
        let momentumScore = 50 + (momentumRaw - 1) * 1000;
        momentumScore = Math.max(0, Math.min(100, momentumScore));
        
        // RUT/SPX relative strength
        const rutChange = yahooData.rut?.changePct || 0;
        const nqChange = yahooData.nq?.changePct || 0;
        const rutSpxRatio = (100 + rutChange) / (100 + (yahooData.spx?.changePct || 0));
        
        // Blend: 60% momentum + 25% price action + 15% RUT relative
        const rutRelScore = Math.max(0, Math.min(100, 50 + (rutChange - nqChange) * 10));
        const crossAssetMomentumScore = Math.round(
            momentumScore * 0.60 + priceActionScore * 0.25 + rutRelScore * 0.15
        );

        // B. Market Breadth + McClellan (15%)
        const breadthScoreValue = breadth?.breadthScore ?? 50;
        const mcClellanOsc = breadth
            ? await updateMcClellan(breadth.advancers, breadth.decliners)
            : 0;
        
        // McClellan contribution: normalize -500~+500 to 0-100
        const mcClellanNorm = Math.max(0, Math.min(100, 50 + mcClellanOsc / 10));
        // Blend: 60% breadth score + 40% McClellan
        const breadthMcClellanScore = Math.round(breadthScoreValue * 0.6 + mcClellanNorm * 0.4);

        // C. Gamma Structure Score (15%) — 🆕
        const gammaResult = calculateGammaScore(gammaData);

        // D. Liquidity Flow Score (10%) — 🆕
        const tltChange = yahooData.tlt?.changePct || 0;
        const gldChange = yahooData.gold?.changePct || 0;
        const btcChange = yahooData.btc?.changePct || 0;
        const liquidityResult = calculateLiquidityScore(tltChange, gldChange, btcChange);

        // E. Volatility Regime Score (10%) — 🆕
        const vix = macro?.vix || 15;
        const vix3m = yahooData.vix3m?.price || 18;
        const vixTermStructure = (vix > 0 && vix3m > 0) ? vix / vix3m : 1.0;
        const volatilityScore = calculateVolatilityScore(vix, vixTermStructure);

        // F. Sentiment Score (10%)
        const sentimentRaw = fgData.score >= 0 ? (fgData.score / 50) - 1 : 0;
        const sentimentScore = fgData.score >= 0 ? fgData.score : vixToSentiment(vix);

        // G. Rotation Score (10%)
        const rotationScoreNorm = Math.max(0, Math.min(100, rotationScore));

        // H. Yield Penalty (reduced from ×10 to ×5)
        const yieldRaw = yields.us10y || 4.0;
        const yieldPenalty = Math.max(0, (yieldRaw - 3.5) * 5);

        // I. VIX Dampening (smoother curve)
        // Old: VIX>30 → 0.5, VIX>20 → 0.8
        // New: clamp(1.15 - VIX/50, 0.65, 1.1)
        const vixMultiplier = Math.max(0.65, Math.min(1.1, 1.15 - vix / 50));

        // === 3. Regime Detection ===
        const regime = detectRegime({
            vix,
            vixTerm: vixTermStructure,
            tltChange, gldChange, btcChange,
            rutChange, nqChange
        });

        // === 4. Weighted Sum ===
        let baseScore =
            (crossAssetMomentumScore * WEIGHTS.CROSS_ASSET_MOMENTUM) +
            (breadthMcClellanScore * WEIGHTS.BREADTH_MCCLELLAN) +
            (gammaResult.score * WEIGHTS.GAMMA_STRUCTURE) +
            (liquidityResult.score * WEIGHTS.LIQUIDITY_FLOW) +
            (volatilityScore * WEIGHTS.VOLATILITY_REGIME) +
            (rotationScoreNorm * WEIGHTS.ROTATION) +
            (sentimentScore * WEIGHTS.SENTIMENT) +
            WEIGHTS.BASE_BUFFER -
            yieldPenalty;

        // Apply VIX dampening (smoother)
        let dampened = baseScore * vixMultiplier;

        // === 5. Z-Score Contrarian Adjustment ===
        const zResult = await calculateZScore(dampened);
        
        // Apply contrarian Z-Score adjustment (max 5% weight)
        // Scale: ±10 points max adjustment
        const contrarianScore = 50 + (zResult.contrarianAdjustment * 5);
        dampened += contrarianScore * WEIGHTS.CONTRARIAN_ZSCORE;

        // Gamma adjustment tracking (for transparency)
        const gammaAdjustment = Math.round((gammaResult.score - 50) * WEIGHTS.GAMMA_STRUCTURE);

        // Clamp 0-100
        let finalScore = Math.max(0, Math.min(100, dampened));

        // Append to Z-Score history (for future calculations)
        await appendZScoreHistory(finalScore);

        // Determine Level
        let level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL' = 'NEUTRAL';
        if (finalScore >= 71) level = 'OPTIMAL';
        else if (finalScore <= 30) level = 'DANGER';

        const result: RLSIResult = {
            score: Number(finalScore.toFixed(1)),
            level,
            session,
            regime,
            zScore: zResult.zScore,
            zSignal: zResult.zSignal,
            gammaAdjustment,
            components: {
                priceActionRaw: Number(priceActionRaw.toFixed(2)),
                priceActionScore: Number(priceActionScore.toFixed(1)),
                rutSpxRatio: Number(rutSpxRatio.toFixed(3)),
                crossAssetMomentumScore,
                breadthPct: breadth?.breadthPct ?? 50,
                breadthScore: breadthScoreValue,
                adRatio: breadth?.adRatio ?? 1,
                volumeBreadth: breadth?.volumeBreadth ?? 50,
                breadthSignal: breadth?.signal ?? 'NEUTRAL',
                breadthDivergent: breadth?.isDivergent ?? false,
                mcClellanOsc: Number(mcClellanOsc.toFixed(0)),
                breadthMcClellanScore,
                gexIndex: gammaResult.gexIndex,
                gexLevel: gammaResult.gexLevel,
                squeezeRisk: gammaResult.squeezeRisk,
                gammaScore: gammaResult.score,
                tltChange: Number(tltChange.toFixed(2)),
                gldChange: Number(gldChange.toFixed(2)),
                btcChange: Number(btcChange.toFixed(2)),
                safeHavenFlow: Number(liquidityResult.safeHavenFlow.toFixed(2)),
                liquidityScore: liquidityResult.score,
                vix: Number(vix.toFixed(2)),
                vixTermStructure: Number(vixTermStructure.toFixed(2)),
                volatilityScore,
                sentimentRaw: Number(sentimentRaw.toFixed(2)),
                sentimentScore: Number(sentimentScore.toFixed(1)),
                sentimentSource: fgData.score >= 0 ? `CNN F&G: ${fgData.rating}` : 'VIX Fallback',
                momentumRaw: Number(momentumRaw.toFixed(3)),
                momentumScore: Number(momentumScore.toFixed(1)),
                rotationScore: Number(rotationScoreNorm.toFixed(1)),
                yieldRaw: Number(yieldRaw.toFixed(2)),
                yieldPenalty: Number(yieldPenalty.toFixed(1)),
                vixMultiplier: Number(vixMultiplier.toFixed(3)),
                bondFlow: Number(tltChange.toFixed(2)),
                goldFlow: Number(gldChange.toFixed(2))
            },
            timestamp: new Date().toISOString()
        };

        cachedRLSI = result;
        console.log(`[RLSI V2.0] Complete. Score: ${result.score}, Level: ${result.level}, Regime: ${regime}, Gamma: ${gammaResult.gexLevel}(${gammaResult.gexIndex}), Z-Score: ${zResult.zScore ?? 'N/A'}, McClellan: ${mcClellanOsc.toFixed(0)}`);
        return result;

    } catch (error: any) {
        console.error("[RLSI V2.0] CRITICAL ERROR:", error?.message || error);
        return {
            score: 50,
            level: 'NEUTRAL',
            session,
            regime: 'NEUTRAL',
            zScore: null,
            zSignal: null,
            gammaAdjustment: 0,
            components: {
                priceActionRaw: 0.5, priceActionScore: 50,
                rutSpxRatio: 1, crossAssetMomentumScore: 50,
                breadthPct: 50, breadthScore: 50, adRatio: 1,
                volumeBreadth: 50, breadthSignal: 'NEUTRAL', breadthDivergent: false,
                mcClellanOsc: 0, breadthMcClellanScore: 50,
                gexIndex: 0, gexLevel: 'NEUTRAL', squeezeRisk: 0, gammaScore: 50,
                tltChange: 0, gldChange: 0, btcChange: 0, safeHavenFlow: 0, liquidityScore: 50,
                vix: 15, vixTermStructure: 1.0, volatilityScore: 50,
                sentimentRaw: 0, sentimentScore: 50,
                momentumRaw: 1.0, momentumScore: 50,
                rotationScore: 50,
                yieldRaw: 4.0, yieldPenalty: 2.5,
                vixMultiplier: 1.0,
                bondFlow: 0, goldFlow: 0
            },
            timestamp: new Date().toISOString()
        };
    }
}
