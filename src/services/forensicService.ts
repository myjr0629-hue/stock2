import { getOptionTrades, getOptionQuotes } from './massiveClient';
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
    };
    analyzedAt: number;
}

const BLOCK_THRESHOLD = 50000; // $50k min for block detection

export class ForensicService {

    // Core Sniper Method
    static async analyzeTarget(ticker: string): Promise<ForensicResult> {
        try {
            // 1. Fetch Tick Data (The Snipe)
            // Default: 1000 most recent trades
            const [trades, quotes] = await Promise.all([
                getOptionTrades(ticker, { limit: '1000', sort: 'desc' }),
                getOptionQuotes(ticker, { limit: '10', sort: 'desc' }) // Just for context
            ]);

            if (!trades || trades.length === 0) {
                return this.createEmptyResult(ticker);
            }

            // 2. Forensics: Aggressor Logic
            let totalVol = 0;
            let aggressorVol = 0;
            let blockCount = 0;
            let maxBlockSize = 0;
            let bearVol = 0; // Trades at Bid (for Sentiment)

            // Approximate reference price from last quote or recent trade
            // Ideally we compare each trade to the NBBO at that nanosecond, 
            // but for "Wide Sniper", we compare to the trade stream average or verify against quotes if aligned timestamps
            // Simplified Aggressor: Since we don't have historical NBBO synchronized perfect here without heavy compute,
            // We use the 'conditions' flag if available, or assume:
            // High Side of Spread = Buy? No, price alone is weak.
            // Let's use a heuristic: 
            // If Trade Price >= Recent Ask (from quotes), it's Aggressor Buy. 
            // If Trade Price <= Recent Bid, it's Aggressor Sell.

            // Context Quote (Latest)
            const refQuote = quotes[0];
            const refAsk = refQuote ? refQuote.ask_price : 0;
            const refBid = refQuote ? refQuote.bid_price : 0;

            for (const t of trades) {
                const value = t.price * t.size * 100;
                totalVol += t.size;

                if (value > maxBlockSize) maxBlockSize = value;
                if (value >= BLOCK_THRESHOLD) blockCount++;

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
                    lastBigPrint
                },
                analyzedAt: Date.now()
            };

        } catch (e) {
            console.error(`[Forensic] Analysis failed for ${ticker}`, e);
            return this.createEmptyResult(ticker);
        }
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
