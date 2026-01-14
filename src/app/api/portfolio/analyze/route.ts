// Portfolio Analyze API - Run Alpha engine for a single ticker
// Returns Alpha score, grade, action, confidence for portfolio holdings

import { NextResponse } from 'next/server';
import { getStockData, getOptionsData } from '@/services/stockApi';

// Simplified Alpha calculation for portfolio holdings

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
    }

    const tickerUpper = ticker.toUpperCase();

    try {
        const startTime = Date.now();

        // Parallel fetch stock data and options
        const [stockData, optionsData] = await Promise.all([
            getStockData(tickerUpper, '1d'),
            getOptionsData(tickerUpper).catch(() => null)
        ]);

        const elapsed = Date.now() - startTime;

        // Calculate Alpha score (simplified version of powerEngine)
        let score = 50; // Base score

        // Price momentum component (+/- 15) - using 'change' field
        const changePct = stockData.changePercent || 0;
        if (changePct > 2) score += 15;
        else if (changePct > 0) score += changePct * 7;
        else if (changePct < -2) score -= 15;
        else score += changePct * 7;

        // Options flow component (+/- 10)
        if (optionsData) {
            // Use putCallRatio from OptionData
            const pcRatio = optionsData.putCallRatio || 1;
            if (pcRatio < 0.7) score += 10; // Low put/call = bullish
            else if (pcRatio > 1.3) score -= 10; // High put/call = bearish
        }

        // GEX component (+/- 5)
        const opts = optionsData as any;
        if (opts && opts.gex !== undefined) {
            if (opts.gex > 0) score += 5; // Positive GEX
            else score -= 5; // Negative GEX
        }

        // Clamp score to 0-100
        score = Math.max(0, Math.min(100, Math.round(score)));

        // Determine grade
        const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';

        // Determine action
        let action: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH' = 'HOLD';
        let confidence = 50;

        if (score >= 75 && changePct > 0) {
            action = 'ADD';
            confidence = Math.min(90, 50 + score - 50);
        } else if (score <= 35 || (changePct < -3 && score < 50)) {
            action = 'TRIM';
            confidence = Math.min(90, 50 + (50 - score));
        } else if (score >= 50 && score < 75) {
            action = 'HOLD';
            confidence = 60 + (score - 50);
        } else {
            action = 'WATCH';
            confidence = 50;
        }

        const result = {
            ticker: tickerUpper,
            alphaSnapshot: {
                score,
                grade,
                action,
                confidence: Math.round(confidence),
                capturedAt: new Date().toISOString()
            },
            // Real-time indicators
            realtime: {
                price: stockData.price || 0,
                changePct: changePct,
                session: stockData.session || 'reg',
                rvol: (stockData as any).rvol || ((stockData as any).volume && (stockData as any).avgVolume ? (stockData as any).volume / (stockData as any).avgVolume : 1.0),
                maxPainDist: opts?.maxPainDistance || 0,
                tripleA: {
                    direction: changePct > 0,
                    acceleration: Math.abs(changePct) > 1,
                    accumulation: opts?.netFlow > 0 || false
                }
            },
            meta: {
                elapsed,
                source: 'alpha_engine_lite'
            }
        };

        return NextResponse.json(result);

    } catch (error) {
        console.error('Portfolio analyze error:', error);
        return NextResponse.json({
            error: 'Failed to analyze ticker',
            ticker: tickerUpper,
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
