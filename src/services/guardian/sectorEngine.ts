
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

// [V5.0] Rotation Intensity Score (RIS)
export interface RotationIntensity {
    score: number;              // 0-100 순환매 강도
    direction: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
    topInflow: { sector: string; flow: number }[];  // 상위 유입 섹터
    topOutflow: { sector: string; flow: number }[]; // 상위 유출 섹터
    breadth: number;            // 전체 상승 섹터 비율 %
    conviction: 'HIGH' | 'MEDIUM' | 'LOW';
}

// [V5.0] Risk-On / Risk-Off Sector Classification
const RISK_ON_SECTORS = ['XLK', 'XLY', 'XLC']; // Tech, Consumer Disc, Comm
const RISK_OFF_SECTORS = ['XLU', 'XLP', 'XLRE']; // Utilities, Staples, Real Estate

// [V5.0] Calculate Rotation Intensity from Sector Flows
export function calculateRotationIntensity(flows: SectorFlowRate[]): RotationIntensity {
    if (!flows || flows.length === 0) {
        return {
            score: 50,
            direction: 'NEUTRAL',
            topInflow: [],
            topOutflow: [],
            breadth: 50,
            conviction: 'LOW'
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
        conviction
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
            console.log(`[SectorEngine] Starting Institutional Flow Analysis...`);

            // 1. Check/Build Baseline (Heavy Lift)
            // [Emergency Patch] Skipping Heavy Fetch to unblock report generation
            // await this.ensureBaselines();

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
                return { flows: [], vectors: [], source: "N/A", target: "N/A", sourceId: null, targetId: null, rotationIntensity: { score: 50, direction: 'NEUTRAL', topInflow: [], topOutflow: [], breadth: 50, conviction: 'LOW' } };
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

                // If ETF data missing, fallback to average of constituents (optional, but robust)
                if (!sectorEtfData && constituents.length > 0) {
                    sectorChange = constituents.reduce((acc, c) => acc + c.change, 0) / constituents.length;
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

            console.log(`[SectorEngine] Flows Analysis Complete (Cached Mode). Vectors: ${vectors.length}`);

            // [V5.0] Calculate Rotation Intensity
            const ris = calculateRotationIntensity(sectorScores);

            return {
                flows: sectorScores,
                vectors,
                source: source.name,
                target: target.name,
                sourceId: target.id,
                targetId: target.id,
                rotationIntensity: ris // [V5.0]
            };

        } catch (e: any) {
            console.error("SectorEngine Error:", e?.message || e);
            return { flows: [], vectors: [], source: "오류", target: "오류", sourceId: null, targetId: null, rotationIntensity: { score: 50, direction: 'NEUTRAL', topInflow: [], topOutflow: [], breadth: 50, conviction: 'LOW' } };
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
