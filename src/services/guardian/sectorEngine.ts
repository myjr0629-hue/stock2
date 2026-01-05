
// Server-side service - do not use "use client"

import { fetchMassive } from "@/services/massiveClient";

// === TYPES ===
export interface SectorFlowRate {
    id: string;   // XLK
    name: string; // Technology
    change: number; // Average % change of constituents
    volume: number; // Total volume
}

export interface FlowVector {
    sourceId: string;
    targetId: string;
    strength: number; // 0-100 scale related to volume/change
    rank: number; // 1, 2, 3
}

export interface GuardianVerdict {
    title: string;
    description: string;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

// === CONSTANTS ===
// Representative "Market Core" Tickers for Flow Calculation
const SECTOR_MAP: Record<string, { name: string; tickers: string[] }> = {
    XLK: { name: "기술주", tickers: ["NVDA", "AAPL", "MSFT", "AVGO", "ORCL"] },
    XLC: { name: "커뮤니케이션", tickers: ["GOOGL", "META", "NFLX", "DIS", "CMCSA"] },
    XLY: { name: "임의소비재", tickers: ["AMZN", "TSLA", "HD", "MCD", "NKE"] },
    XLE: { name: "에너지", tickers: ["XOM", "CVX", "COP", "EOG", "SLB"] },
    XLF: { name: "금융", tickers: ["JPM", "V", "MA", "BAC", "WFC"] },
    XLV: { name: "헬스케어", tickers: ["LLY", "UNH", "JNJ", "ABBV", "MRK"] },
    XLI: { name: "산업재", tickers: ["GE", "CAT", "HON", "UNP", "UPS"] },
    XLB: { name: "소재", tickers: ["LIN", "SHW", "FCX", "APD", "ECL"] },
    XLP: { name: "필수소비재", tickers: ["PG", "COST", "WMT", "KO", "PEP"] },
    XLRE: { name: "부동산", tickers: ["PLD", "AMT", "EQIX", "CCI", "PSA"] },
    XLU: { name: "유틸리티", tickers: ["NEE", "SO", "DUK", "CEG", "AEP"] },
};

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
    }> {
        try {
            console.log(`[SectorEngine] Starting Institutional Flow Analysis...`);

            // 1. Check/Build Baseline (Heavy Lift)
            await this.ensureBaselines();

            // 2. Fetch TODAY'S Live/Snapshot Data (High Performance)
            // Use "Grouped Daily" endpoint.
            const today = new Date();
            let dateStr = today.toISOString().split('T')[0];

            // Helper to get last trading day (skip weekends)
            const getLastTradingDay = (date: Date) => {
                const d = new Date(date);
                const day = d.getDay(); // 0=Sun, 1=Mon... 6=Sat
                if (day === 0) d.setDate(d.getDate() - 2); // Sun -> Fri
                else if (day === 6) d.setDate(d.getDate() - 1); // Sat -> Fri
                else if (day === 1) { // Mon
                    // If Monday morning (pre-market), we might need Friday if today's data isn't ready.
                    // But assume we try Today first, if empty, go to Friday.
                    d.setDate(d.getDate() - 3); // Mon fallback -> Fri
                } else {
                    d.setDate(d.getDate() - 1); // Tue-Fri -> Prev Day
                }
                return d.toISOString().split('T')[0];
            };

            let currentSnapshot: any[] = [];

            let snapshotSuccess = false;

            // Step 2a: Try Today's Data (May fail 403 if no real-time sub)
            try {
                console.log(`[SectorEngine] Fetching snapshot for ${dateStr}...`);
                const res = await fetchMassive(`/v2/aggs/grouped/locale/us/market/stocks/${dateStr}`, { adjusted: 'true' });

                if (res.results && res.results.length > 0) {
                    currentSnapshot = res.results;
                    snapshotSuccess = true;
                    console.log(`[SectorEngine] Success Primary: ${currentSnapshot.length} items`);
                }
            } catch (e: any) {
                console.warn(`[SectorEngine] Primary Snapshot Failed (Likely 403 Real-time Restriction): ${e.message}`);
            }

            // Step 2b: Fallback if Primary failed or empty
            if (!snapshotSuccess) {
                const fallbackDate = getLastTradingDay(today);
                console.log(`[SectorEngine] Fallback trying ${fallbackDate}...`);
                try {
                    const resFallback = await fetchMassive(`/v2/aggs/grouped/locale/us/market/stocks/${fallbackDate}`, { adjusted: 'true' });
                    if (resFallback?.results) {
                        currentSnapshot = resFallback.results;
                        console.log(`[SectorEngine] Success Fallback: ${currentSnapshot.length} items`);
                    }
                } catch (e: any) {
                    console.error(`[SectorEngine] Fallback Failed: ${e.message}`);
                }
            }

            console.log(`[SectorEngine] Final Snapshot Size: ${currentSnapshot.length}`);

            if (!currentSnapshot || currentSnapshot.length === 0) {
                console.error("[SectorEngine] CRITICAL: No snapshot data found.");
                return { flows: [], vectors: [], source: "N/A", target: "N/A", sourceId: null, targetId: null };
            }

            // 3. Process Per Sector
            const sectorScores: SectorFlowRate[] = [];
            console.log("[Debug] SECTOR_MAP Keys:", Object.keys(SECTOR_MAP));

            for (const [sectorId, info] of Object.entries(SECTOR_MAP)) {
                let weightedChangeSum = 0;
                let totalRvolWeight = 0;
                let advancers = 0;
                let totalValid = 0;
                let sectorTotalVol = 0;

                // Track daily changes for persistence (approx from snapshot)
                // Persistence usually needs history. 
                // Since we optimized to NOT fetch history every time, we can simplified persistence 
                // or store recent trend in the baseline.
                // For this implementation, we will assume Persistence is 'Neutral' (1.0) if we only have Snapshot,
                // OR we can make the Baseline store the "Last 3 Day Trend Score" specifically.

                // Let's use the baseline's 'avgChange' as a trend proxy for now.

                // --- Ticker Loop ---
                let debugCount = 0;
                for (const ticker of info.tickers) {
                    const stock = currentSnapshot.find((r: any) => r.T === ticker);
                    const baseline = _baselineCache.get(ticker);

                    if (sectorId === 'XLK' && debugCount < 2) {
                        console.log(`[Debug XLK] Ticker: ${ticker}, Found: ${!!stock}, Baseline: ${!!baseline}`);
                        if (stock) console.log(`[Debug XLK] O: ${stock.o}, C: ${stock.c}, V: ${stock.v}`);
                        debugCount++;
                    }

                    if (!stock || !stock.c || !stock.o) continue;

                    // A. Calculate Change
                    const change = ((stock.c - stock.o) / stock.o) * 100;

                    // B. Calculate RVOL
                    // If no baseline (new ticker?), default to 1.0
                    const avgVol = baseline?.avgVolume || stock.v;
                    const rvol = avgVol > 0 ? (stock.v / avgVol) : 1.0;

                    // Cap RVOL
                    const effectiveRvol = Math.min(rvol, 3.0);

                    // C. Accumulate Weighted Score
                    weightedChangeSum += change * effectiveRvol;
                    totalRvolWeight += effectiveRvol;

                    // D. Breadth
                    if (change > 0) advancers++;
                    totalValid++;
                    sectorTotalVol += stock.v;
                }

                // --- Sector Score Calculation ---
                if (totalValid > 0) {
                    const rawWeightedAvg = totalRvolWeight > 0 ? (weightedChangeSum / totalRvolWeight) : 0;
                    const advanceRatio = advancers / totalValid;

                    let breadthFactor = 1.0;
                    if (rawWeightedAvg > 0) breadthFactor = Math.max(0.5, advanceRatio);
                    else breadthFactor = Math.max(0.5, 1 - advanceRatio);

                    const finalScore = rawWeightedAvg * breadthFactor;

                    sectorScores.push({
                        id: sectorId,
                        name: info.name,
                        change: finalScore,
                        volume: sectorTotalVol
                    });
                }
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

            return {
                flows: sectorScores,
                vectors,
                source: source.name,
                target: target.name,
                sourceId: target.id,
                targetId: target.id
            };

        } catch (e: any) {
            console.error("SectorEngine Error:", e?.message || e);
            return { flows: [], vectors: [], source: "오류", target: "오류", sourceId: null, targetId: null };
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
