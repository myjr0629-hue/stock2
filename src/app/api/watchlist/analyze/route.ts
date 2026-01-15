// Watchlist Analyze API - Extended alpha analysis with premium indicators
// Returns Alpha score, Whale Index, RSI, RVOL for watchlist items

import { NextResponse } from 'next/server';
import { getStockData, getOptionsData } from '@/services/stockApi';

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

        // === ALPHA SCORE CALCULATION ===
        let score = 50;

        const changePct = stockData.changePercent || 0;
        if (changePct > 2) score += 15;
        else if (changePct > 0) score += changePct * 7;
        else if (changePct < -2) score -= 15;
        else score += changePct * 7;

        if (optionsData) {
            const pcRatio = optionsData.putCallRatio || 1;
            if (pcRatio < 0.7) score += 10;
            else if (pcRatio > 1.3) score -= 10;
        }

        const opts = optionsData as any;
        if (opts?.gex !== undefined) {
            if (opts.gex > 0) score += 5;
            else score -= 5;
        }

        score = Math.max(0, Math.min(100, Math.round(score)));
        const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';

        // === ACTION & TRIGGERS ===
        let action: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH' = 'HOLD';
        let confidence = 50;
        const triggers: string[] = [];

        if (score >= 75) triggers.push(`Alpha ${score}점 (강세)`);
        else if (score >= 50) triggers.push(`Alpha ${score}점 (중립)`);
        else triggers.push(`Alpha ${score}점 (약세)`);

        if (changePct > 2) triggers.push(`금일 +${changePct.toFixed(1)}% 상승`);
        else if (changePct > 0) triggers.push(`금일 +${changePct.toFixed(1)}%`);
        else if (changePct < -2) triggers.push(`금일 ${changePct.toFixed(1)}% 하락`);
        else if (changePct < 0) triggers.push(`금일 ${changePct.toFixed(1)}%`);

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

        // === OPTIONS INDICATORS ===
        const hasOptionsData = optionsData && (opts?.maxPain || opts?.gems?.gex || opts?.gex);
        const maxPain = hasOptionsData ? (opts?.maxPain || null) : null;
        const currentPrice = stockData.price || 0;
        const maxPainDist = (maxPain && currentPrice)
            ? Number(((maxPain - currentPrice) / currentPrice * 100).toFixed(2))
            : null;

        const rawGex = opts?.gems?.gex || opts?.gex;
        const gex = hasOptionsData ? (rawGex || null) : null;
        const gexM = gex !== null ? Number((gex / 1000000).toFixed(2)) : null;

        // === WHALE INDEX (Simplified - based on volume & options) ===
        // Full forensic analysis is heavy, use lightweight proxy
        let whaleIndex = 0;
        let whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE' = 'NONE';

        const rvol = (stockData as any).rvol ||
            ((stockData as any).volume && (stockData as any).avgVolume
                ? (stockData as any).volume / (stockData as any).avgVolume
                : 1.0);

        // Whale heuristics: High RVOL + Positive GEX = Accumulation signals
        if (rvol > 2.0 && gex && gex > 0) {
            whaleIndex = Math.min(85, 50 + rvol * 10);
            whaleConfidence = 'MED';
        } else if (rvol > 1.5) {
            whaleIndex = Math.min(60, 30 + rvol * 15);
            whaleConfidence = 'LOW';
        } else {
            whaleIndex = Math.min(30, rvol * 20);
            whaleConfidence = 'NONE';
        }

        // === RESPONSE ===
        const result = {
            ticker: tickerUpper,
            alphaSnapshot: {
                score,
                grade,
                action,
                confidence: Math.round(confidence),
                triggers,
                capturedAt: new Date().toISOString()
            },
            realtime: {
                price: stockData.price || 0,
                changePct,
                session: stockData.session || 'reg',
                rvol: Number(rvol.toFixed(2)),
                rsi: stockData.rsi || null,
                return3d: stockData.return3d || null,
                sparkline: stockData.history?.slice(-20).map(h => h.close) || [],
                // Options
                maxPain,
                maxPainDist,
                gex,
                gexM,
                pcr: opts?.putCallRatio || null,
                // Whale
                whaleIndex: Math.round(whaleIndex),
                whaleConfidence
            },
            meta: {
                elapsed,
                source: 'watchlist_engine'
            }
        };

        return NextResponse.json(result);

    } catch (error) {
        console.error('Watchlist analyze error:', error);
        return NextResponse.json({
            error: 'Failed to analyze ticker',
            ticker: tickerUpper,
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
