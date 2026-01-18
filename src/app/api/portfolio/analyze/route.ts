// Portfolio Analyze API - Run Alpha engine for a single ticker
// Returns Alpha score, grade, action, confidence for portfolio holdings

import { NextResponse } from 'next/server';
import { getStockData, getOptionsData } from '@/services/stockApi';

// Simplified Alpha calculation for portfolio holdings

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    // Force Recompile 1234

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
    }

    const tickerUpper = ticker.toUpperCase();

    try {
        const startTime = Date.now();

        // [FIX] Fetch options structure from same API as Command page for consistency
        const baseUrl = request.url.split('/api/')[0];

        // Parallel fetch stock data, options, and options structure
        const [stockData, optionsData, structureRes] = await Promise.all([
            getStockData(tickerUpper, '1d'),
            getOptionsData(tickerUpper).catch(() => null),
            fetch(`${baseUrl}/api/live/options/structure?t=${tickerUpper}`).then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        const elapsed = Date.now() - startTime;

        // Calculate Alpha score (simplified version of powerEngine)
        let score = 50; // Base score
        const triggers: string[] = [];
        const currentPrice = stockData.price || 0;

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

        // [S-99] Gamma Flip Integration (Accelerator/Brake)
        const gammaFlip = opts?.gems?.gammaFlipLevel;
        const gammaState = opts?.gems?.gammaState; // 'SHORT_GAMMA' | 'LONG_GAMMA'

        if (gammaFlip) {
            // 1. Short Gamma Acceleration (Price > Flip)
            if (gammaState === 'SHORT_GAMMA') {
                if (changePct > 0) {
                    score += 10; // Momentum Boost
                    triggers.push(`🚀 Gamma Flip($${gammaFlip}) 돌파 (가속)`);
                } else {
                    triggers.push(`⚠️ 숏감마 구간 진입 ($${gammaFlip} 위)`);
                }
            }
            // 2. Long Gamma Stability (Price < Flip)
            else if (gammaState === 'LONG_GAMMA') {
                if (changePct > -2) {
                    score += 5; // Stability Bonus
                    triggers.push(`🛡️ 롱감마 구간 ($${gammaFlip} 아래)`);
                }
            }
        }

        // Clamp score to 0-100
        score = Math.max(0, Math.min(100, Math.round(score)));

        // Determine grade
        const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';

        // Determine action with triggers (reasons)
        let action: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH' = 'HOLD';
        let confidence = 50;

        // Build triggers based on conditions
        if (score >= 75) triggers.push(`Alpha ${score}점 (강세)`);
        else if (score >= 50) triggers.push(`Alpha ${score}점 (중립)`);
        else triggers.push(`Alpha ${score}점 (약세)`);

        if (changePct > 2) triggers.push(`금일 +${changePct.toFixed(1)}% 상승`);
        else if (changePct > 0) triggers.push(`금일 +${changePct.toFixed(1)}%`);
        else if (changePct < -2) triggers.push(`금일 ${changePct.toFixed(1)}% 하락`);
        else if (changePct < 0) triggers.push(`금일 ${changePct.toFixed(1)}%`);

        if (optionsData) {
            const pcRatio = optionsData.putCallRatio || 1;
            if (pcRatio < 0.7) triggers.push('콜옵션 우세 (강세)');
            else if (pcRatio > 1.3) triggers.push('풋옵션 우세 (약세)');
        }

        // Determine action
        if (score >= 75 && changePct > 0) {
            action = 'ADD';
            confidence = Math.min(90, 50 + score - 50);
            triggers.push('→ 추가 매수 적합');
        } else if (score <= 35 || (changePct < -3 && score < 50)) {
            action = 'TRIM';
            confidence = Math.min(90, 50 + (50 - score));
            triggers.push('→ 비중 축소 권장');
        } else if (score >= 50 && score < 75) {
            action = 'HOLD';
            confidence = 60 + (score - 50);
            triggers.push('→ 현 포지션 유지');
        } else {
            action = 'WATCH';
            confidence = 50;
            triggers.push('→ 관망 권장');
        }

        // [FIX] Use options/structure API for MaxPain (same source as Command page)
        const hasOptionsData = optionsData && (opts?.maxPain || opts?.gems?.gex || opts?.gex);
        const maxPain = structureRes?.maxPain || (hasOptionsData ? (opts?.maxPain || null) : null);
        const maxPainDist = (maxPain && currentPrice)
            ? Number(((maxPain - currentPrice) / currentPrice * 100).toFixed(2))
            : null;

        // [FIX] Use options/structure API for GEX (same source as Command page)
        const rawGex = opts?.gems?.gex || opts?.gex;
        const gex = structureRes?.netGex ?? (hasOptionsData ? (rawGex || null) : null);
        const gexM = gex !== null ? Number((gex / 1000000).toFixed(2)) : null;

        // [FIX] Use Gamma Flip from structure API for consistency
        const gammaFlipFromStructure = structureRes?.gammaFlipLevel || null;

        const result = {
            ticker: tickerUpper,
            alphaSnapshot: {
                score,
                grade,
                action,
                confidence: Math.round(confidence),
                triggers, // Signal reasoning
                capturedAt: new Date().toISOString()
            },
            // Real-time indicators
            realtime: {
                price: stockData.price || 0,
                changePct: changePct,
                session: stockData.session || 'reg',
                rvol: (stockData as any).rvol || ((stockData as any).volume && (stockData as any).avgVolume ? (stockData as any).volume / (stockData as any).avgVolume : 1.0),
                // Sparkline data (last 20 intraday prices)
                sparkline: stockData.history?.slice(-20).map(h => h.close) || [],
                // Options indicators - null if no data
                maxPain: maxPain,
                maxPainDist: maxPainDist,
                gex: gex,
                gexM: gexM,
                gammaFlip: gammaFlipFromStructure || gammaFlip || null, // [FIX] Prioritize structure API
                gammaState: gammaState || null, // [S-99] Exposed for UI/Debug
                pcr: opts?.putCallRatio || null, // Put/Call Ratio
                tripleA: {
                    direction: changePct > 0,
                    acceleration: Math.abs(changePct) > 1,
                    accumulation: gex > 0 // Positive GEX = accumulation
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
