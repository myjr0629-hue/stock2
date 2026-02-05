// Watchlist Batch Analyze API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [One Pipe] Uses Full Engine (analyzeGemsTicker) for unified alpha calculation

import { NextResponse } from 'next/server';
import { getStockData, getOptionsData } from '@/services/stockApi';
import { analyzeGemsTicker } from '@/services/stockTypes';
import { getStructureData } from '@/services/structureService';

// [S-76] Edge cache for 30 seconds - faster repeat loads
export const revalidate = 30;

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

    if (tickers.length > 20) {
        return NextResponse.json({ error: 'Max 20 tickers per request' }, { status: 400 });
    }

    const startTime = Date.now();
    const baseUrl = request.url.split('/api/')[0];

    // Process all tickers in parallel
    const results = await Promise.all(tickers.map(async (ticker) => {
        try {
            // Parallel fetch stock data, options, and structure
            const [stockData, optionsData, structureRes] = await Promise.all([
                getStockData(ticker, '1d').catch(() => null),
                getOptionsData(ticker).catch(() => null),
                getStructureData(ticker).catch(() => null)
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
                console.error(`[Watchlist Batch] Full Engine failed for ${ticker}:`, e);
                // Fallback to simple calculation
                score = 50 + Math.round(changePct * 5);
                score = Math.max(0, Math.min(100, score));
                grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
                triggers = ['알파 계산 실패'];
            }

            // === OPTIONS INDICATORS ===
            const hasOptionsData = opts && (opts?.maxPain || opts?.gems?.gex || opts?.gex);
            const maxPain = hasOptionsData ? (opts?.maxPain || null) : null;
            const currentPrice = stockData.price || 0;
            const maxPainDist = (maxPain && currentPrice)
                ? Number(((maxPain - currentPrice) / currentPrice * 100).toFixed(2))
                : null;

            const rawGex = opts?.gems?.gex || opts?.gex;
            const gex = hasOptionsData ? (rawGex || null) : null;
            const gexM = gex !== null ? Number((gex / 1000000).toFixed(2)) : null;

            // === WHALE INDEX ===
            let whaleIndex = 0;
            let whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE' = 'NONE';
            const pcr = opts?.putCallRatio || 1;

            if (gex !== null && gex !== undefined) {
                if (gex > 0 && pcr < 0.8) {
                    whaleIndex = Math.min(90, 60 + Math.abs(gex / 100000));
                    whaleConfidence = 'HIGH';
                } else if (gex > 0 && pcr <= 1.2) {
                    whaleIndex = Math.min(70, 40 + Math.abs(gex / 200000));
                    whaleConfidence = 'MED';
                } else if (gex < 0 || pcr > 1.3) {
                    whaleIndex = Math.max(10, 30 - Math.abs(gex / 500000));
                    whaleConfidence = 'LOW';
                } else {
                    whaleIndex = 35;
                    whaleConfidence = 'LOW';
                }
            }

            // === GAMMA FLIP & OPTIONS (Unified Pipeline from Structure API) ===
            // [S-76] Use structure API as primary source for consistency with Command page
            const gammaFlipLevel = structureRes?.gammaFlipLevel ?? null;
            const structureGexM = structureRes?.netGex ? Number((structureRes.netGex / 1000000).toFixed(2)) : null;
            const structureMaxPain = structureRes?.maxPain ?? null;
            // [S-76] ATM IV from structure API (primary) or fallback to getOptionsData
            const iv = structureRes?.atmIv ?? opts?.gems?.iv ?? opts?.iv ?? null;

            // Use structure API first (same data source as Command page)
            const finalMaxPain = structureMaxPain ?? maxPain;
            const finalMaxPainDist = (finalMaxPain && currentPrice)
                ? Number(((finalMaxPain - currentPrice) / currentPrice * 100).toFixed(2))
                : null;

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
                    changePct,
                    session: stockData.session || 'reg',
                    rsi: stockData.rsi || null,
                    return3d: stockData.return3d || null,
                    sparkline: stockData.history?.slice(-20).map((h: any) => h.close) || [],
                    maxPain: finalMaxPain,
                    maxPainDist: finalMaxPainDist,
                    // [S-77] Use Structure API only for GEX consistency across pages
                    gex: structureRes?.netGex ?? null,
                    gexM: structureGexM,
                    pcr: opts?.putCallRatio || null,
                    whaleIndex: Math.round(whaleIndex),
                    whaleConfidence,
                    gammaFlipLevel,
                    iv,
                    // [S-76] VWAP for price column
                    vwap: stockData.vwap || null,
                    vwapDist: (stockData.vwap && stockData.price)
                        ? Number(((stockData.price - stockData.vwap) / stockData.vwap * 100).toFixed(2))
                        : null
                }
            };
        } catch (error) {
            console.error(`Batch analyze error for ${ticker}:`, error);
            return { ticker, error: 'Analysis failed' };
        }
    }));

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
        results,
        meta: {
            count: tickers.length,
            elapsed,
            source: 'watchlist_batch_engine'
        }
    });
}
