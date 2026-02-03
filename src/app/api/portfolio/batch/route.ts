// Portfolio Batch API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [One Pipe] Uses Full Engine (analyzeGemsTicker) for unified alpha calculation

import { NextResponse } from 'next/server';
import { getStockData, getOptionsData } from '@/services/stockApi';
import { analyzeGemsTicker } from '@/services/stockTypes';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam) {
        return NextResponse.json({ error: 'tickers required (comma-separated)' }, { status: 400 });
    }

    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

    if (tickers.length === 0) {
        return NextResponse.json({ error: 'No valid tickers provided' }, { status: 400 });
    }

    if (tickers.length > 30) {
        return NextResponse.json({ error: 'Max 30 tickers per request' }, { status: 400 });
    }

    const startTime = Date.now();
    const baseUrl = request.url.split('/api/')[0];

    // Process all tickers in parallel
    const results = await Promise.all(tickers.map(async (ticker) => {
        try {
            // Parallel fetch: stock data, options, and structure
            const [stockData, optionsData, structureRes] = await Promise.all([
                getStockData(ticker, '1d').catch(() => null),
                getOptionsData(ticker).catch(() => null),
                fetch(`${baseUrl}/api/live/options/structure?t=${ticker}`)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            ]);

            if (!stockData) {
                return { ticker, error: 'Stock data unavailable' };
            }

            // [One Pipe] Full Engine Alpha Score (5-factor: Momentum, Options, Structure, Regime, Risk)
            const opts = optionsData as any;
            const changePct = stockData.changePercent || 0;

            // Prepare data for Full Engine
            const rawTicker = {
                ticker: ticker.toUpperCase(),
                lastTrade: { p: stockData.price },
                todaysChangePerc: changePct,
                day: { v: stockData.volume },
                prevDay: { c: stockData.prevClose, v: stockData.volume }
            };

            const optionsForEngine = opts ? {
                currentPrice: stockData.price,
                putCallRatio: opts.putCallRatio || 1,
                gems: {
                    gex: opts?.gems?.gex || opts?.gex || 0,
                    gammaFlipLevel: opts?.gems?.gammaFlipLevel || null,
                    gammaState: null,
                    mmPos: '',
                    edge: ''
                },
                maxPain: opts?.maxPain || null,
                callWall: opts?.callWall || null,
                putFloor: opts?.putFloor || null,
                rsi14: 50,
                options_status: 'OK' as const,
                rawChain: opts?.rawChain || []
            } : undefined;

            // Call Full Engine
            let score = 50;
            let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'C';
            let action: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH' = 'HOLD';
            let confidence = 50;
            let triggers: string[] = [];

            try {
                const result = analyzeGemsTicker(rawTicker, 'Neutral', optionsForEngine, false);
                score = result.alphaScore;
                grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
                action = result.v71?.action === 'Enter' ? 'ADD'
                    : result.v71?.action === 'Hold' ? 'HOLD'
                        : result.v71?.action === 'Reduce' ? 'TRIM'
                            : 'WATCH';
                confidence = result.decisionSSOT?.confidence || 50;
                triggers = result.decisionSSOT?.triggersKR || [];
            } catch (e) {
                console.error(`[Portfolio Batch] Full Engine failed for ${ticker}:`, e);
                // Fallback to simple calculation
                score = 50 + Math.round(changePct * 5);
                score = Math.max(0, Math.min(100, score));
                grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
                triggers = ['알파 계산 실패'];
            }

            // === OPTIONS INDICATORS ===
            const currentPrice = stockData.price || 0;
            const maxPain = structureRes?.maxPain || opts?.maxPain || null;
            const maxPainDist = (maxPain && currentPrice)
                ? Number(((maxPain - currentPrice) / currentPrice * 100).toFixed(2))
                : null;

            const rawGex = opts?.gems?.gex || opts?.gex;
            const gex = structureRes?.netGex ?? rawGex ?? null;
            const gexM = gex !== null ? Number((gex / 1000000).toFixed(2)) : null;
            const gammaFlipLevel = structureRes?.gammaFlipLevel ?? null;

            // === TRIPLE-A ===
            const tripleA = {
                direction: changePct > 0,
                acceleration: Math.abs(changePct) > 1,
                accumulation: gex !== null ? gex > 0 : false
            };

            return {
                ticker,
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
                    change: stockData.change || 0,
                    changePct,
                    session: stockData.session || 'reg',
                    extPrice: stockData.extPrice,
                    extChangePercent: stockData.extChangePercent,
                    isExtended: stockData.session !== 'reg',
                    rvol: (stockData as any).rvol || 1.0,
                    sparkline: stockData.history?.slice(-20).map((h: any) => h.close) || [],
                    threeDay: stockData.return3d || 0,
                    rsi: stockData.rsi || null,
                    maxPain,
                    maxPainDist,
                    gex,
                    gexM,
                    gammaFlipLevel,
                    pcr: opts?.putCallRatio || null,
                    tripleA
                }
            };
        } catch (error) {
            console.error(`Portfolio batch error for ${ticker}:`, error);
            return { ticker, error: 'Analysis failed' };
        }
    }));

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
        results,
        meta: {
            count: tickers.length,
            elapsed,
            source: 'portfolio_batch_engine'
        }
    });
}
