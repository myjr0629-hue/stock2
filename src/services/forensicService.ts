import { getOptionTrades, fetchOptionSnapshot, getOptionChainSnapshot } from './massiveClient';
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
    static async analyzeTarget(ticker: string, targetDate?: string, fallbackPrice: number = 0): Promise<ForensicResult> {
        try {
            // [V3.8] PRE-EMPTIVE SNAPSHOT PROTOCOL (The "Unified" Source)
            // Fetch Snapshot first. It contains Volume/OI/Greeks for ALL contracts. 
            // This guarantees data even if trade history is empty (weekend/holiday).
            const snapshotPromise = getOptionChainSnapshot(ticker);

            // 1. Fetch Tick Data (Today/Target) - for "Aggressor" Flow Analysis
            const params: any = { limit: '1000', sort: 'desc' };
            // [V3.7.3] Smart Date Resolution: rely on passed targetDate (SSOT)
            if (targetDate) params.date = targetDate;

            let trades: any[] = [];
            let tradesPromise = (async () => {
                let attempts = 0;
                const maxAttempts = 3;
                while (attempts < maxAttempts) {
                    try {
                        attempts++;
                        const res = await getOptionTrades(ticker, params);
                        return res;
                    } catch (e: any) {
                        if (e.httpStatus === 403 || e.code === 'AUTH_ERROR') return [];
                        if (attempts < maxAttempts) {
                            const wait = 500 * Math.pow(2, attempts - 1);
                            await new Promise(res => setTimeout(res, wait));
                        }
                    }
                }
                return [];
            })();

            // Run in parallel
            const [chainSnapshot, tradeData] = await Promise.all([snapshotPromise, tradesPromise]);

            // 2. Base Analysis from Snapshot (Guaranteed Data)
            // Find Dominant Contract by Volume (Activity) or Open Interest (Positioning)
            let domContract = '';
            let whaleTargetLevel = 0;
            let maxVol = 0;
            let snapshotSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
            let marketMakerPutWall = 0; // Put Floor candidate
            let marketMakerCallWall = 0; // Call Wall candidate

            if (chainSnapshot.length > 0) {
                // Find most active contract
                for (const c of chainSnapshot) {
                    const vol = c.day?.volume || 0;
                    if (vol > maxVol) {
                        maxVol = vol;
                        domContract = c.details.ticker;

                        // Calculate Target
                        const premium = c.day?.close || c.day?.last || 0;
                        if (c.details.contract_type === 'call') {
                            whaleTargetLevel = c.details.strike_price + premium;
                            snapshotSentiment = 'BULLISH';
                        } else {
                            whaleTargetLevel = c.details.strike_price - premium;
                            snapshotSentiment = 'BEARISH';
                        }
                    }
                }
            }

            // 3. Analyze Trades (Flow Context) - Enhances the Snapshot
            let result = this.analyzeData(ticker, tradeData || []);

            // [V3.8] MERGE PROTOCOL: Result + Snapshot
            // If Trade analysis yielded no data (e.g. weekend), overwrite with Snapshot findings
            if (result.details.maxBlockSize === 0 && maxVol > 0) {
                result.whaleIndex = Math.min(50 + (maxVol > 1000 ? 20 : 0), 80); // Heuristic based on Vol
                result.whaleConfidence = 'MED'; // Snapshot is reliable but lacks flow direction
                result.details.sentiment = snapshotSentiment;
                result.details.dominantContract = domContract;
                result.details.whaleTargetLevel = whaleTargetLevel;
                // Use fallback price for entry if unknown
                result.details.whaleEntryLevel = fallbackPrice > 0 ? fallbackPrice : undefined;
                result.details.whaleStopLevel = fallbackPrice > 0 ? fallbackPrice * 0.95 : undefined;
            } else {
                // If Trade analysis worked, just fill in gaps
                if (!result.details.dominantContract && domContract) result.details.dominantContract = domContract;
                if (!result.details.whaleTargetLevel && whaleTargetLevel) result.details.whaleTargetLevel = whaleTargetLevel;
            }

            return result;

        } catch (e) {
            console.error(`[Forensic] Analysis failed for ${ticker}`, e);
            return this.createEmptyResult(ticker, fallbackPrice);
        }
    }

    // Refactored core logic
    private static analyzeData(ticker: string, trades: any[]): ForensicResult {
        // 2. Forensics: Aggressor Logic (Simplified without Quotes)
        let totalVol = 0;
        let blockCount = 0;
        let maxBlockSize = 0;

        // Whale logic variables
        const contractMap = new Map<string, { vol: number, val: number, strike: number, type: 'call' | 'put' }>();

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
        }

        // 3. Calculate Whale Index
        // Without Quotes, we can't do Aggressor Ratio precisely.
        // We rely on "Block Intensity".
        // Base Score: 50 + (BlockCount * 10)
        let score = 0;
        if (blockCount > 0) {
            score = 40 + Math.min(blockCount * 15, 60); // Max 100
        }

        // Sentiment: Simplified
        // If we have blocks, assume "Smart Money" is directionally betting via contract type.
        // (This is a heuristic: Usually blocks are opening positions)
        let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        if (score >= 50) sentiment = 'BULLISH'; // Default to Bullish if Whale detected?
        // Actually best to look at Call vs Put volume in blocks

        let callBlockVol = 0;
        let putBlockVol = 0;
        contractMap.forEach(v => {
            if (v.type === 'call') callBlockVol += v.vol;
            else putBlockVol += v.vol;
        });

        if (callBlockVol > putBlockVol * 1.5) sentiment = 'BULLISH';
        else if (putBlockVol > callBlockVol * 1.5) sentiment = 'BEARISH';
        else if (blockCount > 0) sentiment = 'NEUTRAL';

        const aggressorRatio = 0.5; // Placeholder

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

    private static createEmptyResult(ticker: string, fallbackLevel: number = 0): ForensicResult {
        return {
            ticker,
            whaleIndex: 0,
            whaleConfidence: 'NONE',
            details: {
                aggressorRatio: 0,
                blockCount: 0,
                maxBlockSize: 0,
                sentiment: 'NEUTRAL',
                // [Revert] User explicitly rejected fallback estimation.
                // We return undefined so UI knows data is genuinely missing if fetch fails.
                whaleEntryLevel: undefined,
                whaleTargetLevel: undefined,
                whaleStopLevel: undefined
            },
            analyzedAt: Date.now()
        };
    }
}
