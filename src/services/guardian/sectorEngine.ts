
// Server-side service - do not use "use client"

import { fetchMassive } from "@/services/massiveClient";

// === TYPES ===
export interface SectorFlowRate {
    id: string;   // XLK
    name: string; // Technology
    change: number; // Average % change of constituents
    volume: number; // Total volume
    topConstituents?: { symbol: string; price: number; change: number; volume: number }[];
}

export interface FlowVector {
    sourceId: string;
    targetId: string;
    strength: number; // 0-100 scale related to volume/change
    rank: number; // 1, 2, 3
}

// [V6.0] Rotation Regime Classification
export type RotationRegime = 'RISK_ON_GROWTH' | 'RISK_OFF_DEFENSE' | 'CYCLICAL_RECOVERY' | 'BROAD_RALLY' | 'BROAD_SELLOFF' | 'MIXED';

// [V6.0] Per-Sector 5-Day Analysis
export interface SectorTrendData {
    changes: number[];       // 4 daily returns (day-over-day)
    cumReturn: number;       // 5-day cumulative return
    rvol: number;            // relative volume (recent vs avg)
    consistency: number;     // direction consistency 0-1
    flowScore: number;       // final weighted score
    todayChange: number;     // today's single-day change
    isBounce: boolean;       // today opposite to 5d trend
}

// [V6.0] Enhanced Rotation Intensity Score (RIS V2)
export interface RotationIntensity {
    score: number;              // 0-100 rotation intensity
    direction: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
    topInflow: { sector: string; flow: number }[];  // top inflow sectors
    topOutflow: { sector: string; flow: number }[]; // top outflow sectors
    breadth: number;            // % of rising sectors
    conviction: 'HIGH' | 'MEDIUM' | 'LOW';
    // V6.0 Enhanced fields
    regime: RotationRegime;
    fiveDayData?: Record<string, SectorTrendData>;
    noiseFlags?: string[];      // sectors with <60% consistency
    bounceWarnings?: string[];  // sectors where today contradicts 5d trend
}

// [V6.0] Sector Group Classification
const GROWTH_SECTORS = ['XLK', 'XLY', 'XLC'];         // Tech, Consumer Disc, Comm
const DEFENSIVE_SECTORS = ['XLU', 'XLP', 'XLRE'];      // Utilities, Staples, Real Estate
const CYCLICAL_SECTORS = ['XLI', 'XLB', 'XLE', 'XLF']; // Industrials, Materials, Energy, Financials
const HEALTHCARE_SECTORS = ['XLV'];                     // Healthcare (neutral)

// Legacy aliases for backward compat
const RISK_ON_SECTORS = GROWTH_SECTORS;
const RISK_OFF_SECTORS = DEFENSIVE_SECTORS;

// [V6.0] 5-Day Sector Cache
interface FiveDayCache {
    data: Record<string, { closes: number[]; volumes: number[]; dates: string[] }>;
    fetchedAt: number;
}
let _fiveDayCache: FiveDayCache | null = null;
const FIVE_DAY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * [V6.0] Fetch 5-day historical data for all sector ETFs
 * Uses Polygon /v2/aggs API. Cached for 5 minutes.
 * Synthetic sectors (e.g. AI_PWR) use constituent-level averaging.
 */

// Known real ETF tickers — synthetic sectors like AI_PWR are NOT in Polygon
const REAL_ETF_SECTORS = new Set(['XLK', 'XLC', 'XLY', 'XLE', 'XLF', 'XLV', 'XLI', 'XLB', 'XLP', 'XLRE', 'XLU']);

async function fetch5DaySectorData(): Promise<Record<string, { closes: number[]; volumes: number[]; dates: string[] }>> {
    // Check cache
    if (_fiveDayCache && (Date.now() - _fiveDayCache.fetchedAt < FIVE_DAY_CACHE_TTL)) {
        return _fiveDayCache.data;
    }

    const sectorEtfs = Object.keys(SECTOR_MAP);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 12); // fetch 12 days to ensure we get 5 trading days
    const from = start.toISOString().split('T')[0];
    const to = end.toISOString().split('T')[0];

    const result: Record<string, { closes: number[]; volumes: number[]; dates: string[] }> = {};

    console.log(`[SectorEngine V6.0] Fetching 5-day series for ${sectorEtfs.length} sectors...`);

    // Helper: fetch single ticker's 5-day bars
    async function fetchBars(ticker: string): Promise<{ closes: number[]; volumes: number[]; dates: string[] } | null> {
        try {
            const data = await fetchMassive(
                `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`,
                { adjusted: 'true', sort: 'asc', limit: '15' }
            );
            const bars = (data.results || []).slice(-5);
            if (bars.length >= 2) {
                return {
                    closes: bars.map((b: any) => b.c),
                    volumes: bars.map((b: any) => b.v),
                    dates: bars.map((b: any) => new Date(b.t).toISOString().split('T')[0])
                };
            }
        } catch (e: any) {
            console.warn(`[SectorEngine V6.0] Failed to fetch 5d for ${ticker}: ${e.message}`);
        }
        return null;
    }

    // Fetch all sectors in parallel
    const promises = sectorEtfs.map(async (sectorId) => {
        if (REAL_ETF_SECTORS.has(sectorId)) {
            // Standard ETF — fetch directly
            const bars = await fetchBars(sectorId);
            if (bars) result[sectorId] = bars;
        } else {
            // Synthetic sector (e.g. AI_PWR) — average constituent bars
            const tickers = SECTOR_MAP[sectorId].tickers;
            const constituentBars = await Promise.all(tickers.map(t => fetchBars(t)));
            const validBars = constituentBars.filter((b): b is NonNullable<typeof b> => b !== null && b.closes.length >= 2);

            if (validBars.length >= 2) {
                // Find minimum bar count for alignment
                const minLen = Math.min(...validBars.map(b => b.closes.length));
                const avgCloses: number[] = [];
                const sumVolumes: number[] = [];

                for (let i = 0; i < minLen; i++) {
                    avgCloses.push(validBars.reduce((s, b) => s + b.closes[b.closes.length - minLen + i], 0) / validBars.length);
                    sumVolumes.push(validBars.reduce((s, b) => s + b.volumes[b.volumes.length - minLen + i], 0));
                }

                result[sectorId] = {
                    closes: avgCloses,
                    volumes: sumVolumes,
                    dates: validBars[0].dates.slice(-minLen)
                };
                console.log(`[SectorEngine V6.0] Synthetic sector ${sectorId}: synthesized from ${validBars.length}/${tickers.length} constituents`);
            } else {
                console.warn(`[SectorEngine V6.0] Synthetic sector ${sectorId}: insufficient data (${validBars.length} bars)`);
            }
        }
    });

    await Promise.all(promises);

    console.log(`[SectorEngine V6.0] 5-day series fetched for ${Object.keys(result).length} sectors`);

    // Cache result
    _fiveDayCache = { data: result, fetchedAt: Date.now() };
    return result;
}

/**
 * [V6.0] Calculate per-sector trend data from 5-day series
 */
function analyzeSectorTrend(ticker: string, series: { closes: number[]; volumes: number[] }, todayChange: number): SectorTrendData {
    const closes = series.closes;
    const volumes = series.volumes;

    // Calculate daily changes
    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        changes.push(+((closes[i] - closes[i - 1]) / closes[i - 1] * 100).toFixed(3));
    }

    // Cumulative return over the period
    const cumReturn = changes.length > 0 ? changes.reduce((a, b) => a + b, 0) : 0;

    // Consistency: what fraction of days move in the dominant direction
    const positives = changes.filter(c => c > 0).length;
    const negatives = changes.filter(c => c < 0).length;
    const consistency = changes.length > 0
        ? Math.max(positives, negatives) / changes.length
        : 0.5;

    // RVOL: recent 2-day avg volume vs overall avg volume
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVol = volumes.length >= 2
        ? (volumes[volumes.length - 1] + volumes[volumes.length - 2]) / 2
        : volumes[volumes.length - 1] || avgVol;
    const rvol = avgVol > 0 ? +(recentVol / avgVol).toFixed(2) : 1;

    // Flow Score: cumReturn * RVOL(capped) * consistency
    const cappedRvol = Math.min(rvol, 3.0);
    const flowScore = +(cumReturn * cappedRvol * consistency).toFixed(3);

    // Bounce detection: today's direction contradicts 5-day trend
    const isBounce = (todayChange > 0.3 && cumReturn < -1) || (todayChange < -0.3 && cumReturn > 1);

    return {
        changes,
        cumReturn: +cumReturn.toFixed(3),
        rvol,
        consistency: +consistency.toFixed(2),
        flowScore,
        todayChange: +todayChange.toFixed(3),
        isBounce
    };
}

/**
 * [V6.0] Determine rotation regime from sector group flows
 */
function classifyRegime(
    fiveDayData: Record<string, SectorTrendData>,
    flows: SectorFlowRate[]
): RotationRegime {
    // Calculate group-level 5-day cumulative returns
    const groupReturn = (tickers: string[]) => {
        const items = tickers.filter(t => fiveDayData[t]).map(t => fiveDayData[t].cumReturn);
        return items.length > 0 ? items.reduce((a, b) => a + b, 0) / items.length : 0;
    };

    const growthRet = groupReturn(GROWTH_SECTORS);
    const defenseRet = groupReturn(DEFENSIVE_SECTORS);
    const cyclicalRet = groupReturn(CYCLICAL_SECTORS);

    // Broad market check: if 80%+ of sectors move same direction
    const risingSectors = flows.filter(s => s.change > 0).length;
    const fallingRatio = flows.length > 0 ? (flows.length - risingSectors) / flows.length : 0;
    const risingRatio = flows.length > 0 ? risingSectors / flows.length : 0;

    if (risingRatio >= 0.8) return 'BROAD_RALLY';
    if (fallingRatio >= 0.8) return 'BROAD_SELLOFF';

    // Directional regime
    const growthVsDefense = growthRet - defenseRet;
    const cyclicalVsGrowth = cyclicalRet - growthRet;

    if (growthVsDefense > 1.5 && growthRet > 0.5) return 'RISK_ON_GROWTH';
    if (growthVsDefense < -1.5 && defenseRet > 0.5) return 'RISK_OFF_DEFENSE';
    if (cyclicalVsGrowth > 1.5 && cyclicalRet > 0.5) return 'CYCLICAL_RECOVERY';

    return 'MIXED';
}

/**
 * [V6.0] Enhanced Rotation Intensity Calculation with 5-day trend analysis
 */
export function calculateRotationIntensityV2(
    flows: SectorFlowRate[],
    fiveDaySeriesData: Record<string, { closes: number[]; volumes: number[] }>
): RotationIntensity {
    const defaultResult: RotationIntensity = {
        score: 50, direction: 'NEUTRAL', topInflow: [], topOutflow: [],
        breadth: 50, conviction: 'LOW', regime: 'MIXED'
    };

    if (!flows || flows.length === 0) return defaultResult;

    // 1. Build per-sector trend analysis
    const fiveDayData: Record<string, SectorTrendData> = {};
    const hasFiveDayData = Object.keys(fiveDaySeriesData).length > 0;

    for (const sector of flows) {
        const series = fiveDaySeriesData[sector.id];
        if (series && series.closes.length >= 2) {
            fiveDayData[sector.id] = analyzeSectorTrend(sector.id, series, sector.change);
        }
    }

    // 2. Score using 5-day flowScore if available, fall back to 1-day change
    const scoredSectors = flows.map(s => {
        const trend = fiveDayData[s.id];
        return {
            id: s.id,
            name: s.name,
            score: trend ? trend.flowScore : s.change,
            todayChange: s.change,
            cumReturn: trend?.cumReturn ?? s.change,
            consistency: trend?.consistency ?? 0.5,
            rvol: trend?.rvol ?? 1,
            isBounce: trend?.isBounce ?? false
        };
    }).sort((a, b) => b.score - a.score);

    const inflows = scoredSectors.filter(s => s.score > 0);
    const outflows = scoredSectors.filter(s => s.score < 0).sort((a, b) => a.score - b.score);

    // 3. Rotation Score: spread between top inflows and outflows
    const topInflowScore = inflows.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.score), 0);
    const topOutflowScore = outflows.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.score), 0);
    // Normalize: typical flowScores range from 0-10, so /20*100 = 0-100
    const rawScore = topInflowScore + topOutflowScore;
    const score = Math.min(100, hasFiveDayData ? rawScore * 8 : rawScore * 10);

    // 4. Direction from 5-day group flows
    const groupFlowScore = (tickers: string[]) =>
        scoredSectors.filter(s => tickers.includes(s.id)).reduce((sum, s) => sum + s.score, 0);

    const riskOnFlow = groupFlowScore(GROWTH_SECTORS);
    const riskOffFlow = groupFlowScore(DEFENSIVE_SECTORS);

    let direction: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' = 'NEUTRAL';
    if (riskOnFlow > riskOffFlow + 0.5) direction = 'RISK_ON';
    else if (riskOffFlow > riskOnFlow + 0.5) direction = 'RISK_OFF';

    // 5. Breadth (% of sectors with positive 5d flowScore)
    const breadth = flows.length > 0
        ? (inflows.length / flows.length) * 100
        : 50;

    // 6. Conviction: based on score AND consistency of top movers
    const topConsistency = [...inflows.slice(0, 3), ...outflows.slice(0, 3)]
        .map(s => s.consistency)
        .filter(c => c > 0);
    const avgConsistency = topConsistency.length > 0
        ? topConsistency.reduce((a, b) => a + b, 0) / topConsistency.length
        : 0.5;

    let conviction: 'HIGH' | 'MEDIUM' | 'LOW';
    if (score >= 60 && avgConsistency >= 0.7) conviction = 'HIGH';
    else if (score >= 35 && avgConsistency >= 0.5) conviction = 'MEDIUM';
    else conviction = 'LOW';

    // 7. Regime classification
    const regime = hasFiveDayData ? classifyRegime(fiveDayData, flows) : 'MIXED';

    // 8. Noise and bounce detection
    const noiseFlags = Object.entries(fiveDayData)
        .filter(([, d]) => d.consistency < 0.6)
        .map(([ticker]) => ticker);

    const bounceWarnings = Object.entries(fiveDayData)
        .filter(([, d]) => d.isBounce)
        .map(([ticker, d]) => `${ticker}: today ${d.todayChange > 0 ? '+' : ''}${d.todayChange}% but 5d ${d.cumReturn > 0 ? '+' : ''}${d.cumReturn}%`);

    console.log(`[RIS V6.0] Score: ${score.toFixed(1)}, Direction: ${direction}, Regime: ${regime}, Breadth: ${breadth.toFixed(0)}%, Conviction: ${conviction}`);
    if (noiseFlags.length > 0) console.log(`[RIS V6.0] Noise flags: ${noiseFlags.join(', ')}`);
    if (bounceWarnings.length > 0) console.log(`[RIS V6.0] Bounce warnings: ${bounceWarnings.join(' | ')}`);

    return {
        score: Number(score.toFixed(1)),
        direction,
        topInflow: inflows.slice(0, 3).map(s => ({ sector: s.name, flow: Number(s.score.toFixed(2)) })),
        topOutflow: outflows.slice(0, 3).map(s => ({ sector: s.name, flow: Number(s.score.toFixed(2)) })),
        breadth: Number(breadth.toFixed(1)),
        conviction,
        regime,
        fiveDayData: hasFiveDayData ? fiveDayData : undefined,
        noiseFlags: noiseFlags.length > 0 ? noiseFlags : undefined,
        bounceWarnings: bounceWarnings.length > 0 ? bounceWarnings : undefined
    };
}

// [V5.0] Calculate Rotation Intensity from Sector Flows
export function calculateRotationIntensity(flows: SectorFlowRate[]): RotationIntensity {
    if (!flows || flows.length === 0) {
        return {
            score: 50,
            direction: 'NEUTRAL',
            topInflow: [],
            topOutflow: [],
            breadth: 50,
            conviction: 'LOW',
            regime: 'MIXED'
        };
    }

    // 1. Sort by change
    const sorted = [...flows].sort((a, b) => b.change - a.change);

    // 2. Separate inflows and outflows
    const inflows = sorted.filter(s => s.change > 0);
    const outflows = sorted.filter(s => s.change < 0).sort((a, b) => a.change - b.change);

    // 3. Calculate intensity score
    // True rotation = both strong inflows AND outflows
    const topInflowSum = inflows.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.change), 0);
    const topOutflowSum = outflows.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.change), 0);

    // Score: Higher when both are active (genuine rotation)
    const score = Math.min(100, (topInflowSum + topOutflowSum) * 10);

    // 4. Determine direction (Risk-On vs Risk-Off)
    const riskOnFlow = flows
        .filter(s => RISK_ON_SECTORS.includes(s.id))
        .reduce((sum, s) => sum + s.change, 0);
    const riskOffFlow = flows
        .filter(s => RISK_OFF_SECTORS.includes(s.id))
        .reduce((sum, s) => sum + s.change, 0);

    let direction: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' = 'NEUTRAL';
    if (riskOnFlow > riskOffFlow + 0.5) direction = 'RISK_ON';
    else if (riskOffFlow > riskOnFlow + 0.5) direction = 'RISK_OFF';

    // 5. Breadth (% of sectors rising)
    const breadth = flows.length > 0
        ? (inflows.length / flows.length) * 100
        : 50;

    // 6. Conviction level
    const conviction: 'HIGH' | 'MEDIUM' | 'LOW' =
        score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';

    console.log(`[RIS V5.0] Score: ${score.toFixed(1)}, Direction: ${direction}, Breadth: ${breadth.toFixed(0)}%, Conviction: ${conviction}`);

    return {
        score: Number(score.toFixed(1)),
        direction,
        topInflow: inflows.slice(0, 3).map(s => ({ sector: s.name, flow: Number(s.change.toFixed(2)) })),
        topOutflow: outflows.slice(0, 3).map(s => ({ sector: s.name, flow: Number(s.change.toFixed(2)) })),
        breadth: Number(breadth.toFixed(1)),
        conviction,
        regime: 'MIXED'
    };
}

export interface GuardianVerdict {
    title: string;
    description: string;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    realityInsight?: string; // New Dual Stream
}

// === CONSTANTS ===
import { SECTOR_MAP } from "@/services/universePolicy";


// === ENGINE ===
// === CACHE TYPES ===
interface SectorBaseline {
    ticker: string;
    avgChange: number; // For Persistence check (simple proxy) or just keep history if needed?
    avgVolume: number; // 20-day Average Volume for RVOL
    updatedAt: number;
}

// Module-level Cache (Singleton in Server Memory)
// Map<Ticker, Baseline>
const _baselineCache = new Map<string, SectorBaseline>();
const BASELINE_TTL = 24 * 60 * 60 * 1000; // 24 Hours

export class SectorEngine {

    /**
     * Fetch Historical Data for Sector Tickers and Calculate Institutional Flow
     * Institutional Grade Upgrade: RVOL, Breadth, Persistence
     * *Optimized with Server-Side Caching*
     */
    static async getSectorFlows(): Promise<{
        flows: SectorFlowRate[];
        vectors: FlowVector[];
        source: string;
        target: string;
        sourceId: string | null;
        targetId: string | null;
        rotationIntensity: RotationIntensity; // [V5.0] Added
    }> {
        try {
            console.log(`[SectorEngine V6.0] Starting Institutional Flow Analysis...`);

            // 1. Fetch 5-day series data in parallel with snapshot
            const fiveDayPromise = fetch5DaySectorData();

            // 2. Fetch Real-time Snapshot
            const allTickers: string[] = [];
            // Add Sector ETFs themselves (XLK, XLE...)
            const sectorEtfs = Object.keys(SECTOR_MAP);
            allTickers.push(...sectorEtfs);
            // Add Constituents
            Object.values(SECTOR_MAP).forEach(s => allTickers.push(...s.tickers));

            // Deduplicate just in case
            const uniqueTickers = Array.from(new Set(allTickers));
            const tickerString = uniqueTickers.join(',');

            let currentSnapshot: any[] = [];

            try {
                console.log(`[SectorEngine] Fetching Real-time Snapshot for ${uniqueTickers.length} tickers...`);
                // Use Snapshot API for Real-Time Price
                const res = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerString}`, {});

                if (res.tickers && res.tickers.length > 0) {
                    // Normalize Snapshot Data to fit existing logic
                    // INTRADAY PRIORITY: day.c (Regular Session) > lastTrade.p (Ext fallback) > prevDay.c
                    currentSnapshot = res.tickers.map((t: any) => {
                        // Standard Session Price: Use 'day.c' (Rolling 24h/Day Close)
                        const currentPrice = t.day?.c || t.lastTrade?.p || t.prevDay?.c || 0;
                        const openPrice = t.day?.o || t.prevDay?.c || 0;
                        const prevClose = t.prevDay?.c || t.day?.o || 0;
                        const volume = t.day?.v || 0;

                        return {
                            T: t.ticker,
                            c: currentPrice,
                            o: openPrice,
                            pc: prevClose,
                            v: volume
                        };
                    });
                    console.log(`[SectorEngine] Snapshot Success: ${currentSnapshot.length} items (using day.c + prevDay.c)`);
                } else {
                    console.warn("[SectorEngine] Snapshot returned no tickers.");
                }

            } catch (e: any) {
                console.error(`[SectorEngine] Snapshot Failed: ${e.message}`);
            }

            // Fallback: If map is empty (Market Closed or API Error), try yesterday's grouped
            if (currentSnapshot.length === 0) {
                console.error("[SectorEngine] CRITICAL: No snapshot data found via Snapshot API.");
            }

            console.log(`[SectorEngine] Final Snapshot Size: ${currentSnapshot.length}`);

            if (!currentSnapshot || currentSnapshot.length === 0) {
                return { flows: [], vectors: [], source: "N/A", target: "N/A", sourceId: null, targetId: null, rotationIntensity: { score: 50, direction: 'NEUTRAL', topInflow: [], topOutflow: [], breadth: 50, conviction: 'LOW', regime: 'MIXED' } };
            }

            // 3. Process Per Sector
            const sectorScores: SectorFlowRate[] = [];
            console.log("[Debug] SECTOR_MAP Keys:", Object.keys(SECTOR_MAP));

            for (const [sectorId, info] of Object.entries(SECTOR_MAP)) {

                // Get Sector ETF Data Directly (e.g. XLK)
                const sectorEtfData = currentSnapshot.find((r: any) => r.T === sectorId);
                let sectorChange = 0;
                let sectorVolume = 0;

                if (sectorEtfData && sectorEtfData.pc > 0) {
                    // Use actual ETF change
                    sectorChange = ((sectorEtfData.c - sectorEtfData.pc) / sectorEtfData.pc) * 100;
                    sectorVolume = sectorEtfData.v;
                }

                // ... Constituent Processing (Keep for topConstituents & Breadth calculation if needed) ...
                // actually we don't need weighted average anymore for the main score if we use the ETF.
                // But we still need top constituents.

                const constituents = info.tickers.map(t => {
                    const s = currentSnapshot.find((r: any) => r.T === t);
                    if (!s || s.pc === 0) return null;
                    return {
                        symbol: t,
                        price: s.c,
                        change: ((s.c - s.pc) / s.pc) * 100,
                        volume: s.v
                    };
                }).filter((item): item is { symbol: string; price: number; change: number; volume: number } => item !== null)
                    .sort((a, b) => b.volume - a.volume) // Sort by Volume
                    .slice(0, 5); // Top 5

                // If ETF data missing (synthetic sectors), fallback to average of constituents
                if (!sectorEtfData && constituents.length > 0) {
                    sectorChange = constituents.reduce((acc, c) => acc + c.change, 0) / constituents.length;
                    sectorVolume = constituents.reduce((acc, c) => acc + c.volume, 0); // sum constituent volumes
                }

                sectorScores.push({
                    id: sectorId,
                    name: info.name,
                    change: sectorChange, // Use ETF Change
                    volume: sectorVolume, // Use ETF Volume
                    topConstituents: constituents
                });
            }

            // Sort by Change
            sectorScores.sort((a, b) => b.change - a.change);

            const target = sectorScores[0] || { name: "없음", id: null, change: 0 };
            const source = sectorScores[sectorScores.length - 1] || { name: "없음", id: null, change: 0 };

            // === Vector Persistence ===
            // Since we don't have full history loaded in this optimized run, 
            // we will skip the profound 3-day check OR use a simplified version.
            // *Optimization Compromise:* We will trust the RVOL/Breadth score heavily.
            // We can re-introduce Heavy History fetch in a background CRON job later if needed.

            const vectors: FlowVector[] = [];

            const gainers = sectorScores.filter(s => s.change > 0);
            const losers = sectorScores.filter(s => s.change < 0).sort((a, b) => a.change - b.change);

            const pairCount = Math.min(3, Math.min(gainers.length, losers.length));

            for (let i = 0; i < pairCount; i++) {
                const s = losers[i];
                const t = gainers[i];
                const strength = ((Math.abs(s.change) + t.change) / 2);

                vectors.push({
                    sourceId: s.id,
                    targetId: t.id,
                    strength: strength * 10,
                    rank: i + 1
                });
            }

            console.log(`[SectorEngine V6.0] Flows Analysis Complete. Vectors: ${vectors.length}`);

            // [V6.0] Get 5-day data (should already be resolved from parallel promise)
            let fiveDaySeriesData: Record<string, { closes: number[]; volumes: number[] }> = {};
            try {
                fiveDaySeriesData = await fiveDayPromise;
            } catch (e: any) {
                console.warn(`[SectorEngine V6.0] 5-day data failed, falling back to V5: ${e.message}`);
            }

            // [V6.0] Calculate Enhanced Rotation Intensity
            const ris = calculateRotationIntensityV2(sectorScores, fiveDaySeriesData);

            // [V6.0] Override vectors using 5-day flowScores for accurate source/target
            const enhancedVectors: FlowVector[] = [];
            if (ris.fiveDayData) {
                const ranked = Object.entries(ris.fiveDayData)
                    .sort((a, b) => b[1].flowScore - a[1].flowScore);
                const topInflows = ranked.filter(([, d]) => d.flowScore > 0).slice(0, 3);
                const topOutflows = ranked.filter(([, d]) => d.flowScore < 0)
                    .sort((a, b) => a[1].flowScore - b[1].flowScore).slice(0, 3);

                const pairLen = Math.min(topInflows.length, topOutflows.length, 3);
                for (let i = 0; i < pairLen; i++) {
                    enhancedVectors.push({
                        sourceId: topOutflows[i][0],
                        targetId: topInflows[i][0],
                        strength: (Math.abs(topOutflows[i][1].flowScore) + topInflows[i][1].flowScore) / 2 * 10,
                        rank: i + 1
                    });
                }
            }

            const finalVectors = enhancedVectors.length > 0 ? enhancedVectors : vectors;

            // Determine source/target from V2 ranking
            const v2Target = ris.topInflow[0]?.sector
                ? sectorScores.find(s => s.name === ris.topInflow[0].sector) || target
                : target;
            const v2Source = ris.topOutflow[0]?.sector
                ? sectorScores.find(s => s.name === ris.topOutflow[0].sector) || source
                : source;

            return {
                flows: sectorScores,
                vectors: finalVectors,
                source: v2Source.name,
                target: v2Target.name,
                sourceId: v2Source.id,
                targetId: v2Target.id,
                rotationIntensity: ris
            };

        } catch (e: any) {
            console.error("SectorEngine Error:", e?.message || e);
            return { flows: [], vectors: [], source: "오류", target: "오류", sourceId: null, targetId: null, rotationIntensity: { score: 50, direction: 'NEUTRAL', topInflow: [], topOutflow: [], breadth: 50, conviction: 'LOW', regime: 'MIXED' } };
        }
    }

    /**
     * Ensure Baselines (20-day Avg Vol) are loaded in memory
     * Run this once every 24h effectively
     */
    private static async ensureBaselines() {
        // Quick check if any ticker is loaded and fresh
        const sampleTicker = "NVDA";
        if (_baselineCache.has(sampleTicker)) {
            const entry = _baselineCache.get(sampleTicker);
            if (Date.now() - (entry?.updatedAt || 0) < BASELINE_TTL) {
                return; // Cache valid
            }
        }

        console.log("[SectorEngine] Building Baselines (Heavy Fetch)...");

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 35);
        const endStr = endDate.toISOString().split('T')[0];
        const startStr = startDate.toISOString().split('T')[0];

        const allTickers: string[] = [];
        Object.values(SECTOR_MAP).forEach(s => allTickers.push(...s.tickers));

        // Chunking the requests is handled by massiveClient's global limits, but let's just map all
        await Promise.all(allTickers.map(async (ticker) => {
            try {
                const res = await fetchMassive(`/v2/aggs/ticker/${ticker}/range/1/day/${startStr}/${endStr}`, {
                    adjusted: "true", limit: "100"
                });
                if (res.results && res.results.length >= 20) {
                    // Calc Avg Vol
                    const slice = res.results.slice(res.results.length - 21, res.results.length - 1);
                    const avgVol = slice.reduce((acc: number, val: any) => acc + val.v, 0) / slice.length;

                    _baselineCache.set(ticker, {
                        ticker,
                        avgChange: 0, // Placeholder
                        avgVolume: avgVol,
                        updatedAt: Date.now()
                    });
                }
            } catch (e) {
                // Ignore failures mainly
            }
        }));
        console.log(`[SectorEngine] Baselines built for ${_baselineCache.size} tickers.`);
    }

    /**
     * Smart Template Verdict Generator (Narrative Mode)
     */
    static generateVerdict(rlsiScore: number, source: string, target: string): GuardianVerdict {
        let title = "시장 스캔 중...";
        let desc = "기관 자금 흐름과 유동성을 분석하고 있습니다.";
        let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

        if (rlsiScore >= 75) {
            title = "적극 매수 (AGGRESSIVE LONG)";
            desc = `스마트 머니가 ${target} 섹터로 집중되고 있습니다. RVOL과 수급 집중도(Breadth)가 모두 강력하여 추가 상승 여력이 충분합니다. ${source} 섹터의 투매 물량을 받아내며 지수를 견인 중입니다.`;
            sentiment = 'BULLISH';
        } else if (rlsiScore <= 25) {
            title = "방어 태세 (DEFENSIVE)";
            desc = `기관들이 ${source} 섹터를 대량 매도하며 현금을 확보하고 있습니다. ${target} 섹터로의 피신 흐름이 보이지만 강도가 약합니다(Low Persistence). 보수적인 관점에서 리스크 관리가 최우선입니다.`;
            sentiment = 'BEARISH';
        } else {
            title = "섹터 순환 (SECTOR ROTATION)";
            if (rlsiScore >= 50) {
                desc = `건전한 순환매 장세입니다. ${source} 섹터의 차익 실현 물량이 ${target} 섹터(주도주)로 유입되고 있습니다. 3일 추세(Persistence)가 양호한 종목 위주로 선별 접근하십시오.`;
                sentiment = 'NEUTRAL';
            } else {
                desc = `제한적인 순환매 흐름입니다. ${target} 섹터가 반등 중이나 거래량(RVOL)이 부족하여 신뢰도가 낮습니다. 추격 매수보다는 ${source} 섹터의 하락이 멈추는지 확인이 필요합니다.`;
                sentiment = 'NEUTRAL';
            }
        }

        return { title, description: desc, sentiment };
    }
}
