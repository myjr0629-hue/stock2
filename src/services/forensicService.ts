import { getOptionTrades, getOptionQuotes, fetchOptionSnapshot } from './massiveClient';
import { OptionTrade } from '@/types';

// [V3.7.3] Forensic Analysis Result
export interface ForensicResult {
    ticker: string;
    whaleIndex: number; // 0-100
    whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE';
    details: {
        aggressorRatio: number; // Volume at Ask / Total Volume
        blockCount: number; // Trades > $50k
        maxBlockSize: number;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        lastBigPrint?: string;
        whaleEntryLevel?: number; // Underlying Stock Price (Precise)
        whaleTargetLevel?: number; // Break-even or Strike Target
        whaleStopLevel?: number; // [V3.7.3] Dynamic Stop
        dominantContract?: string; // e.g. "230C"
    };
    analyzedAt: number;
}

const BLOCK_THRESHOLD = 50000; // $50k min for block detection

export class ForensicService {

    // Core Sniper Method
    static async analyzeTarget(ticker: string): Promise<ForensicResult> {
        try {
            // 1. Fetch Tick Data (Today)
            const [trades, quotes] = await Promise.all([
                getOptionTrades(ticker, { limit: '1000', sort: 'desc' }),
                getOptionQuotes(ticker, { limit: '10', sort: 'desc' })
            ]);

            // 2. Analyze Today's Data
            let result = this.analyzeData(ticker, trades || [], quotes || []);

            // [V3.7.3] SNIPER LOGIC: Precision Injection
            if (result.details.dominantContract && result.whaleIndex >= 50) {
                // Fetch LIVE Greeks & Break-even for the Whale's Contract
                const snapshot = await fetchOptionSnapshot(ticker, result.details.dominantContract);
                if (snapshot) {
                    // 1. Precise Target: Break-even Price (Whale MUST cross this to profit)
                    if (snapshot.break_even_price > 0) {
                        result.details.whaleTargetLevel = snapshot.break_even_price;
                    }

                    // 2. Precise Entry: Underlying Price
                    // If snapshot.underlying_asset.price is valid, use it as Current Whale Entry
                    if (snapshot.underlying_asset.price > 0) {
                        result.details.whaleEntryLevel = snapshot.underlying_asset.price;

                        // 3. Precise Stop: Dynamic Delta-based Risk
                        // Logic: High Delta (Deep ITM) = Tight Stop (Stock Replacement). Low Delta (Lotto) = Wide Stop.
                        // Base Stop: 5%
                        // Adjustment: (0.5 - Delta) * 0.1
                        // If Delta 0.9 (Safe) -> Stop 1%
                        // If Delta 0.2 (Risky) -> Stop 8%
                        const delta = Math.abs(snapshot.greeks.delta || 0.5);
                        const riskFactor = 0.5 - delta;
                        let stopPct = 0.05 + (riskFactor * 0.1);
                        // Clamp: Min 2%, Max 10%
                        stopPct = Math.max(0.02, Math.min(0.10, stopPct));

                        const entry = result.details.whaleEntryLevel;
                        result.details.whaleStopLevel = entry * (1 - stopPct);

                        console.log(`[Forensic] 🎯 SNIPER PRECISION for ${ticker} (${result.details.dominantContract}): Entry=$${entry.toFixed(2)}, Target=$${snapshot.break_even_price}, Stop=$${result.details.whaleStopLevel.toFixed(2)} (Delta=${delta}, StopPct=${(stopPct * 100).toFixed(1)}%)`);
                    }
                }
            }

            // [V3.7.3] Historical Context Injection
            // If today shows NO WHALE ACTION (Index < 50 or No Blocks), look back at yesterday.
            // Whales don't disappear overnight. Their positions remain.
            if (result.whaleIndex < 50 || result.details.blockCount === 0) {
                const today = new Date();
                const prevDate = new Date(today);

                // Rollback logic (skip weekends)
                const day = today.getDay();
                if (day === 1) prevDate.setDate(today.getDate() - 3); // Mon -> Fri
                else if (day === 0) prevDate.setDate(today.getDate() - 2); // Sun -> Fri
                else if (day === 6) prevDate.setDate(today.getDate() - 1); // Sat -> Fri
                else prevDate.setDate(today.getDate() - 1);

                const dateStr = prevDate.toISOString().split('T')[0];
                // console.log(`[Forensic] Low activity for ${ticker}. Checking history for ${dateStr}...`);

                const [histTrades, histQuotes] = await Promise.all([
                    getOptionTrades(ticker, { limit: '1000', sort: 'desc', date: dateStr }),
                    getOptionQuotes(ticker, { limit: '10', sort: 'desc', date: dateStr })
                ]);

                if (histTrades && histTrades.length > 0) {
                    const histResult = this.analyzeData(ticker, histTrades, histQuotes || []);

                    // If history has a Whale, we USE IT as the "Dominant Structure"
                    if (histResult.whaleIndex >= 50 && histResult.details.whaleEntryLevel) {
                        console.log(`[Forensic] Used Historical Whale Data for ${ticker} (Date: ${dateStr})`);
                        // We preserve today's basic volume data if needed, but for "Strategy", History wins.
                        // Actually, let's return the Historical Result but maybe flag it?
                        // For now, swapping entirely is safer to ensure valid Entry/Target levels.
                        return {
                            ...histResult,
                            whaleConfidence: 'MED', // Decay confidence slightly for being day-old? No, Keep it real.
                            analyzedAt: Date.now() // Timestamp update
                        };
                    }
                }
            }

            return result;
        } catch (e) {
            console.error(`[Forensic] Analysis failed for ${ticker}`, e);
            return this.createEmptyResult(ticker);
        }
    }

    // Refactored core logic
    private static analyzeData(ticker: string, trades: any[], quotes: any[]): ForensicResult {
        // 2. Forensics: Aggressor Logic
        let totalVol = 0;
        let aggressorVol = 0;
        let blockCount = 0;
        let maxBlockSize = 0;
        let bearVol = 0; // Trades at Bid (for Sentiment)

        // Whale logic variables
        const contractMap = new Map<string, { vol: number, val: number, strike: number, type: 'call' | 'put' }>();

        const refQuote = quotes[0];
        const refAsk = refQuote ? refQuote.ask_price : 0;
        const refBid = refQuote ? refQuote.bid_price : 0;

        for (const t of trades) {
            const value = t.price * t.size * 100;
            totalVol += t.size;

            if (value > maxBlockSize) maxBlockSize = value;

            // Block Trade Logic
            if (value >= BLOCK_THRESHOLD) {
                blockCount++;

                // Group by Contract if details exist
                if (t.details) {
                    const k = `${t.details.strike_price}${t.details.contract_type === 'call' ? 'C' : 'P'}`;
                    const curr = contractMap.get(k) || { vol: 0, val: 0, strike: t.details.strike_price, type: t.details.contract_type };
                    curr.vol += t.size;
                    curr.val += (t.price * t.size); // Total Premium Paid
                    contractMap.set(k, curr);
                }
            }

            // Heuristic Aggressor
            if (refQuote) {
                if (t.price >= refAsk) {
                    aggressorVol += t.size;
                } else if (t.price <= refBid) {
                    bearVol += t.size;
                }
            }
        }

        // 3. Calculate Whale Index
        const aggressorRatio = totalVol > 0 ? (aggressorVol / totalVol) : 0;
        const bearRatio = totalVol > 0 ? (bearVol / totalVol) : 0;

        // Base Score: Aggressor Ratio * 60
        let score = aggressorRatio * 60;

        // Block Bonus: +10 per block (Max 40)
        score += Math.min(blockCount * 10, 40);

        // Sentiment Determination
        let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        if (aggressorRatio > 0.6) sentiment = 'BULLISH';
        else if (bearRatio > 0.6) sentiment = 'BEARISH';

        // Confidence
        let confidence: 'HIGH' | 'MED' | 'LOW' | 'NONE' = 'LOW';
        if (score >= 80) confidence = 'HIGH';
        else if (score >= 50) confidence = 'MED';
        else if (totalVol === 0) confidence = 'NONE';

        // [Strategy] Identify Dominant Whale Contract
        let domContract = '';
        let avgPremium = 0;
        let whaleTargetLevel = 0;

        if (contractMap.size > 0) {
            let maxVol = 0;
            let bestContract: { vol: number, val: number, strike: number, type: 'call' | 'put' } | null = null;

            contractMap.forEach((v, k) => {
                if (v.vol > maxVol) {
                    maxVol = v.vol;
                    domContract = k;
                    bestContract = v;
                }
            });

            if (bestContract) {
                const bc = bestContract as { vol: number, val: number, strike: number, type: 'call' | 'put' };
                avgPremium = bc.val / bc.vol; // VWAP of Premium

                // Target: Strike + Premium (Call) or Strike - Premium (Put) - Breakeven
                if (bc.type === 'call') {
                    whaleTargetLevel = bc.strike + avgPremium;
                } else {
                    whaleTargetLevel = bc.strike - avgPremium;
                }
            }
        }


        // Last Big Print String
        const lastBigPrint = maxBlockSize > 0
            ? `$${(maxBlockSize / 1000).toFixed(1)}k ${sentiment === 'BULLISH' ? 'Call' : 'Put'}`
            : undefined;

        return {
            ticker,
            whaleIndex: Math.min(Math.round(score), 100),
            whaleConfidence: confidence,
            details: {
                aggressorRatio,
                blockCount,
                maxBlockSize,
                sentiment,
                lastBigPrint,
                whaleEntryLevel: undefined, // [Fix] Don't return Premium as Stock Price
                whaleTargetLevel: whaleTargetLevel > 0 ? whaleTargetLevel : undefined,
                dominantContract: domContract || undefined
            },
            analyzedAt: Date.now()
        };
    }

    private static createEmptyResult(ticker: string): ForensicResult {
        return {
            ticker,
            whaleIndex: 0,
            whaleConfidence: 'NONE',
            details: { aggressorRatio: 0, blockCount: 0, maxBlockSize: 0, sentiment: 'NEUTRAL' },
            analyzedAt: Date.now()
        };
    }
}
