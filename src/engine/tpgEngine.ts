// [S-51.0] TPG Engine - Trend Persistence Gate & Relative Strength
// [S-51.3] Enhanced with VWAP/RSI/News scoring from Massive API
// Core logic for "오르는 종목" selection

import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

// TPG Result Interface
export interface TPGResult {
    passed: boolean;           // 2+ gates passed
    score: number;             // 0-4 (gates passed count)
    gates: {
        highZone: boolean;     // 고점권 유지 (within 5% of 52w high)
        retestRecovery: boolean; // 되감기 후 회복
        rsRising: boolean;     // RS 상승 (vs SPY + peers)
        sectorSync: boolean;   // 섹터 리더 동조
    };
    retestStatus: 'FIRST_BREAK' | 'PULLBACK' | 'RETEST_OK' | 'FAIL' | 'NO_DATA';
    rsScore: number;           // -100 to +100 (relative strength)
    // [S-51.3] Enhanced fields
    vwapPosition: 'ABOVE' | 'BELOW' | 'AT' | 'NO_DATA';
    vwapDistance: number;      // % distance from VWAP
    rsiValue: number | null;   // RSI 14
    rsiStatus: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' | 'NO_DATA';
    newsShelfLife: 'FRESH' | 'STALE' | 'NO_NEWS';
    explanation: string;       // Korean explanation
    whySummary: string;        // Top3 WHY 1-line summary
}

// Relative Strength Data
interface RSData {
    rsSpy: number;
    rsSector: number;
    rsComposite: number;  // 0.6*rsSector + 0.4*rsSpy
    peerGroup: string[];
}

// Helper: Fetch aggregates for RS calculation
async function fetchAggregates(symbol: string, days: number): Promise<number[]> {
    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const data = await fetchMassive(
            `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`,
            { adjusted: 'true' },
            true,
            undefined,
            CACHE_POLICY.REPORT_GEN
        );

        if (data.results && data.results.length > 0) {
            return data.results.map((r: any) => r.c);
        }
        return [];
    } catch (e) {
        console.warn(`[TPG] Failed to fetch aggs for ${symbol}:`, (e as Error).message);
        return [];
    }
}

// Helper: Calculate return over period
function calcReturn(prices: number[]): number {
    if (prices.length < 2) return 0;
    const start = prices[0];
    const end = prices[prices.length - 1];
    return ((end - start) / start) * 100;
}

// Calculate RS vs SPY
async function calculateRS(symbol: string): Promise<RSData> {
    const days = 10;  // 10-day window for RS

    const [tickerPrices, spyPrices] = await Promise.all([
        fetchAggregates(symbol, days),
        fetchAggregates('SPY', days)
    ]);

    const tickerReturn = calcReturn(tickerPrices);
    const spyReturn = calcReturn(spyPrices);

    const rsSpy = tickerReturn - spyReturn;

    // For sector, we'll use SPY as proxy for now (peer group calculation is expensive)
    // This can be enhanced with Related Tickers API later
    const rsSector = rsSpy * 1.1;  // Slight variance for now

    const rsComposite = 0.6 * rsSector + 0.4 * rsSpy;

    return {
        rsSpy: Number(rsSpy.toFixed(2)),
        rsSector: Number(rsSector.toFixed(2)),
        rsComposite: Number(rsComposite.toFixed(2)),
        peerGroup: ['SPY']  // MVP: SPY only
    };
}

// Check if price is in "고점권" (high zone - within 5% of recent high)
function checkHighZone(currentPrice: number, high52w: number | null, recentHigh: number | null): boolean {
    const referenceHigh = high52w || recentHigh || currentPrice;
    if (referenceHigh <= 0) return false;

    const distanceFromHigh = ((referenceHigh - currentPrice) / referenceHigh) * 100;
    return distanceFromHigh <= 5;  // Within 5% of high
}

// Check retest status based on price action
function checkRetestStatus(
    currentPrice: number,
    vwap: number | null,
    prevClose: number,
    dayHigh: number,
    dayLow: number
): 'FIRST_BREAK' | 'PULLBACK' | 'RETEST_OK' | 'FAIL' | 'NO_DATA' {
    if (!vwap || dayHigh === 0) return 'NO_DATA';

    const priceAboveVwap = currentPrice > vwap;
    const priceAbovePrevClose = currentPrice > prevClose;
    const pullbackDepth = ((dayHigh - currentPrice) / dayHigh) * 100;
    const recoveryFromLow = ((currentPrice - dayLow) / dayLow) * 100;

    // RETEST_OK: Price pulled back but now recovering above VWAP
    if (priceAboveVwap && pullbackDepth > 1 && recoveryFromLow > 0.5) {
        return 'RETEST_OK';
    }

    // FIRST_BREAK: Price just broke above VWAP for first time (no pullback yet)
    if (priceAboveVwap && pullbackDepth < 0.5) {
        return 'FIRST_BREAK';
    }

    // PULLBACK: Currently in pullback phase (below VWAP after being above)
    if (!priceAboveVwap && priceAbovePrevClose) {
        return 'PULLBACK';
    }

    // FAIL: Below both VWAP and prev close
    return 'FAIL';
}

// [S-51.3] Calculate VWAP position and distance
function getVwapPosition(price: number, vwap: number | null): { position: 'ABOVE' | 'BELOW' | 'AT' | 'NO_DATA'; distance: number } {
    if (!vwap || vwap === 0) return { position: 'NO_DATA', distance: 0 };

    const distance = ((price - vwap) / vwap) * 100;

    if (Math.abs(distance) < 0.2) return { position: 'AT', distance: 0 };
    return { position: distance > 0 ? 'ABOVE' : 'BELOW', distance: Number(distance.toFixed(2)) };
}

// [S-51.3] RSI Status from ticker data or estimated
function getRsiStatus(rsi: number | null): { value: number | null; status: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' | 'NO_DATA' } {
    if (rsi === null || rsi === undefined) return { value: null, status: 'NO_DATA' };

    if (rsi >= 70) return { value: rsi, status: 'OVERBOUGHT' };
    if (rsi <= 30) return { value: rsi, status: 'OVERSOLD' };
    return { value: rsi, status: 'NEUTRAL' };
}

// [S-51.3] News Shelf-life check (based on news timestamp if available)
function getNewsShelfLife(ticker: any): 'FRESH' | 'STALE' | 'NO_NEWS' {
    // Check if ticker has recent news metadata
    const newsTime = ticker.lastNewsTime || ticker.catalystTime || null;

    if (!newsTime) return 'NO_NEWS';

    const newsDate = new Date(newsTime);
    const now = new Date();
    const hoursDiff = (now.getTime() - newsDate.getTime()) / (1000 * 60 * 60);

    return hoursDiff <= 72 ? 'FRESH' : 'STALE';
}

// [S-51.3] Generate WHY summary for Top3
function generateWhySummary(
    gates: { highZone: boolean; retestRecovery: boolean; rsRising: boolean; sectorSync: boolean },
    vwapPos: 'ABOVE' | 'BELOW' | 'AT' | 'NO_DATA',
    rsiStatus: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' | 'NO_DATA',
    newsLife: 'FRESH' | 'STALE' | 'NO_NEWS',
    changePercent: number
): string {
    const reasons: string[] = [];
    const risks: string[] = [];

    // Reasons (2개)
    if (vwapPos === 'ABOVE') reasons.push('VWAP 상회 유지');
    if (gates.retestRecovery) reasons.push('리테스트 성공');
    if (gates.rsRising) reasons.push('RS 상위');
    if (gates.highZone) reasons.push('고점권 유지');
    if (gates.sectorSync) reasons.push('섹터 동조');
    if (changePercent > 2) reasons.push(`+${changePercent.toFixed(1)}% 강세`);

    // Risks (1개)
    if (rsiStatus === 'OVERBOUGHT') risks.push('RSI 과열');
    if (vwapPos === 'BELOW') risks.push('VWAP 하회');
    if (newsLife === 'STALE') risks.push('촉매 72h 경과');
    if (newsLife === 'NO_NEWS' && changePercent > 3) risks.push('뉴스 없는 급등');
    if (gates.highZone) risks.push('전고점 근접');

    const twoReasons = reasons.slice(0, 2).join(' + ') || '흐름 보통';
    const oneRisk = risks[0] || '리스크 낮음';

    // Action based on status
    let action = 'VWAP 지지 확인 후 진입';
    if (gates.retestRecovery) action = '리테스트 성공 → 진입 가능';
    if (rsiStatus === 'OVERBOUGHT') action = '과열 → 추격 자제';

    return `${twoReasons} / 리스크: ${oneRisk} / ${action}`;
}

// Main TPG Calculation
export async function calculateTPG(
    ticker: any,
    vwap?: number | null,
    relatedTickers?: string[]
): Promise<TPGResult> {
    const symbol = ticker.ticker || ticker.symbol || 'N/A';
    const currentPrice = ticker.lastTrade?.p || ticker.day?.c || ticker.price || 0;
    const prevClose = ticker.prevDay?.c || 0;
    const dayHigh = ticker.day?.h || currentPrice;
    const dayLow = ticker.day?.l || currentPrice;
    const high52w = ticker.high52w || null;
    const changePercent = ticker.todaysChangePerc || ((currentPrice - prevClose) / prevClose) * 100 || 0;
    const tickerRsi = ticker.v71?.rsi14 || ticker.rsi14 || null;

    // Calculate all gates
    const rsData = await calculateRS(symbol);

    // Gate 1: 고점권 유지
    const highZone = checkHighZone(currentPrice, high52w, dayHigh);

    // Gate 2: 되감기 후 회복
    const retestStatus = checkRetestStatus(currentPrice, vwap || null, prevClose, dayHigh, dayLow);
    const retestRecovery = retestStatus === 'RETEST_OK';

    // Gate 3: RS 상승
    const rsRising = rsData.rsComposite > 0;

    // Gate 4: 섹터 리더 동조 (simplified: positive change + positive RS)
    const sectorSync = changePercent > 0 && rsRising;

    const gates = { highZone, retestRecovery, rsRising, sectorSync };
    const gateCount = Object.values(gates).filter(Boolean).length;
    const passed = gateCount >= 2;

    // [S-51.3] Enhanced fields
    const vwapData = getVwapPosition(currentPrice, vwap || null);
    const rsiData = getRsiStatus(tickerRsi);
    const newsShelfLife = getNewsShelfLife(ticker);

    // Generate Korean explanation
    let explanation = '';
    if (passed) {
        const passedGates: string[] = [];
        if (highZone) passedGates.push('고점권 유지');
        if (retestRecovery) passedGates.push('리테스트 성공');
        if (rsRising) passedGates.push('RS 상승');
        if (sectorSync) passedGates.push('섹터 동조');
        explanation = `TPG ${gateCount}/4 통과 (${passedGates.join(', ')})`;

        // Add VWAP/RSI/News context
        if (vwapData.position === 'ABOVE') explanation += ` | VWAP +${vwapData.distance}%`;
        if (rsiData.status === 'OVERBOUGHT') explanation += ` | RSI 과열 ${rsiData.value}`;
        if (newsShelfLife === 'STALE') explanation += ` | 촉매 경과`;
    } else {
        explanation = `TPG 미달 (${gateCount}/4) - Top3 후보 제외`;
    }

    // [S-51.3] WHY Summary for Top3 card
    const whySummary = generateWhySummary(gates, vwapData.position, rsiData.status, newsShelfLife, changePercent);

    return {
        passed,
        score: gateCount,
        gates,
        retestStatus,
        rsScore: rsData.rsComposite,
        vwapPosition: vwapData.position,
        vwapDistance: vwapData.distance,
        rsiValue: rsiData.value,
        rsiStatus: rsiData.status,
        newsShelfLife,
        explanation,
        whySummary
    };
}

// Quick TPG check without async (for filtering)
export function quickTPGCheck(ticker: any): { estimatedPass: boolean; reason: string } {
    const changePercent = ticker.todaysChangePerc || 0;
    const volRatio = (ticker.day?.v || 1) / (ticker.prevDay?.v || 1);
    const velocity = ticker.velocity;

    // Quick heuristic: positive change + above average volume + positive velocity
    const estimatedPass = changePercent > 0 && volRatio > 0.8 && velocity !== '▼';

    return {
        estimatedPass,
        reason: estimatedPass
            ? `예비 TPG 통과 (변동 +${changePercent.toFixed(1)}%, 거래량 ${volRatio.toFixed(1)}x)`
            : '예비 TPG 미달'
    };
}

// Calculate TPG score adjustment for AlphaScore
export function getTPGScoreAdjustment(tpg: TPGResult): number {
    let adjustment = 0;

    // Base TPG score (0-20)
    adjustment = tpg.score * 5;  // Each gate = 5 points

    // Retest bonus/penalty
    if (tpg.retestStatus === 'RETEST_OK') adjustment += 5;
    if (tpg.retestStatus === 'FIRST_BREAK') adjustment -= 10;  // Penalty for chase
    if (tpg.retestStatus === 'FAIL') adjustment -= 5;

    // RS bonus
    if (tpg.rsScore > 5) adjustment += 3;
    if (tpg.rsScore > 10) adjustment += 2;

    // [S-51.3] VWAP position scoring
    if (tpg.vwapPosition === 'ABOVE') adjustment += 2;
    if (tpg.vwapPosition === 'BELOW') adjustment -= 2;

    // [S-51.3] RSI overbought/oversold guards
    if (tpg.rsiStatus === 'OVERBOUGHT') adjustment -= 3;  // Chase prevention
    if (tpg.rsiStatus === 'OVERSOLD') adjustment -= 1;    // Counter-trend warning

    // [S-51.3] News shelf-life penalty
    if (tpg.newsShelfLife === 'STALE') adjustment -= 2;   // Catalyst 72h passed
    // No news + significant rise = speculative
    // (This is handled in WHY summary, not score here)

    return Math.max(0, Math.min(30, adjustment));  // Cap at 0-30
}
