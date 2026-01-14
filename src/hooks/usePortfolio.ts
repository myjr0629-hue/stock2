'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    getPortfolio,
    savePortfolio,
    addHolding as storeAddHolding,
    removeHolding as storeRemoveHolding,
    loadDemoPortfolio,
    type Holding,
    type PortfolioData
} from '@/lib/storage/portfolioStore';

export interface EnrichedHolding extends Holding {
    currentPrice: number;
    change: number;
    changePct: number;
    marketValue: number;
    gainLoss: number;
    gainLossPct: number;
    // Alpha engine data (to be enriched)
    alphaScore?: number;
    alphaGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
    action?: 'HOLD' | 'TRIM' | 'ADD' | 'WATCH';
    confidence?: number; // 0-100%
    threeDay?: number;
    rsi?: number;
    sectorFlow?: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
    // Premium Edge Indicators
    rvol?: number; // Relative Volume (1.0 = average)
    maxPainDist?: number; // % distance from max pain
    tripleA?: { direction: boolean; acceleration: boolean; accumulation: boolean }; // Triple-A alignment
}

export interface PortfolioSummary {
    totalValue: number;
    totalCost: number;
    totalGainLoss: number;
    totalGainLossPct: number;
    holdingsCount: number;
}

export function usePortfolio() {
    const [holdings, setHoldings] = useState<EnrichedHolding[]>([]);
    const [summary, setSummary] = useState<PortfolioSummary>({
        totalValue: 0,
        totalCost: 0,
        totalGainLoss: 0,
        totalGainLossPct: 0,
        holdingsCount: 0
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load and enrich holdings
    const loadHoldings = useCallback(async () => {
        try {
            setLoading(true);
            let data = getPortfolio();

            // If empty, load demo data
            if (data.holdings.length === 0) {
                data = loadDemoPortfolio();
            }

            // Fetch current prices for all tickers
            const tickers = data.holdings.map(h => h.ticker);
            const priceMap = await fetchPrices(tickers);

            // Enrich holdings with current prices
            const enriched: EnrichedHolding[] = data.holdings.map(holding => {
                const priceData = priceMap[holding.ticker] || { price: holding.avgPrice, change: 0, changePct: 0 };
                const marketValue = holding.quantity * priceData.price;
                const costBasis = holding.quantity * holding.avgPrice;
                const gainLoss = marketValue - costBasis;
                const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

                return {
                    ...holding,
                    currentPrice: priceData.price,
                    change: priceData.change,
                    changePct: priceData.changePct,
                    marketValue,
                    gainLoss,
                    gainLossPct,
                    // Placeholder - will be enriched from Reports API
                    alphaScore: undefined,
                    alphaGrade: undefined,
                    action: undefined,
                    confidence: undefined,
                    threeDay: undefined,
                    rvol: undefined,
                    maxPainDist: undefined,
                    tripleA: undefined
                };
            });

            // Enrich with Alpha data from Reports API
            const alphaMap = await fetchAlphaData(tickers);
            const fullyEnriched = enriched.map(h => {
                const alphaData = alphaMap[h.ticker];
                if (alphaData) {
                    return {
                        ...h,
                        alphaScore: alphaData.score,
                        alphaGrade: alphaData.grade,
                        action: alphaData.action,
                        confidence: alphaData.confidence,
                        threeDay: alphaData.threeDay,
                        rvol: alphaData.rvol,
                        maxPainDist: alphaData.maxPainDist,
                        tripleA: alphaData.tripleA
                    };
                }
                return h;
            });

            setHoldings(fullyEnriched);

            // Calculate summary
            const totalValue = enriched.reduce((sum, h) => sum + h.marketValue, 0);
            const totalCost = enriched.reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
            const totalGainLoss = totalValue - totalCost;
            const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

            setSummary({
                totalValue,
                totalCost,
                totalGainLoss,
                totalGainLossPct,
                holdingsCount: enriched.length
            });

            setError(null);
        } catch (e) {
            setError('Failed to load portfolio');
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch prices from API
    async function fetchPrices(tickers: string[]): Promise<Record<string, { price: number; change: number; changePct: number }>> {
        const result: Record<string, { price: number; change: number; changePct: number }> = {};

        // Batch fetch (or individual if batch not available)
        for (const ticker of tickers) {
            try {
                const res = await fetch(`/api/stock?ticker=${ticker}`);
                if (res.ok) {
                    const data = await res.json();
                    result[ticker] = {
                        price: data.price || data.last || 0,
                        change: data.change || 0,
                        changePct: data.changePct || data.changePercent || 0
                    };
                }
            } catch {
                // Use placeholder if API fails
                result[ticker] = { price: 0, change: 0, changePct: 0 };
            }
        }

        return result;
    }

    // Fetch Alpha data from Reports API
    interface AlphaData {
        score: number;
        grade: 'A' | 'B' | 'C' | 'D' | 'F';
        action: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH';
        confidence: number;
        threeDay: number;
        rvol: number;
        maxPainDist: number;
        tripleA: { direction: boolean; acceleration: boolean; accumulation: boolean };
    }

    async function fetchAlphaData(tickers: string[]): Promise<Record<string, AlphaData>> {
        const result: Record<string, AlphaData> = {};

        try {
            // Fetch latest report
            const res = await fetch('/api/reports/latest');
            if (!res.ok) return result;

            const report = await res.json();
            const items = report?.items || report?.data?.items || [];

            // Extract alpha data for each holding ticker
            for (const ticker of tickers) {
                const item = items.find((i: any) => i.ticker?.toUpperCase() === ticker.toUpperCase());
                if (item) {
                    const decisionSSOT = item.decisionSSOT || {};
                    const indicators = item.indicators || {};
                    const evidence = item.evidence || {};

                    // Calculate grade from score
                    const score = item.score?.final || item.alphaScore || 50;
                    const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';

                    result[ticker] = {
                        score,
                        grade: grade as AlphaData['grade'],
                        action: (decisionSSOT.action || 'HOLD') as AlphaData['action'],
                        confidence: decisionSSOT.confidencePct || 50,
                        threeDay: indicators.return3D || evidence?.price?.change3D || 0,
                        rvol: indicators.rvol || evidence?.volume?.rvol || 1.0,
                        maxPainDist: evidence?.options?.maxPainDistance || 0,
                        tripleA: {
                            direction: decisionSSOT.triggersKR?.includes('방향') || false,
                            acceleration: decisionSSOT.triggersKR?.includes('가속') || false,
                            accumulation: decisionSSOT.triggersKR?.includes('매집') || false
                        }
                    };
                }
            }
        } catch (e) {
            console.error('Failed to fetch alpha data:', e);
        }

        return result;
    }

    // Add holding
    const addHolding = useCallback((holding: Omit<Holding, 'addedAt'>) => {
        storeAddHolding(holding);
        loadHoldings();
    }, [loadHoldings]);

    // Remove holding
    const removeHolding = useCallback((ticker: string) => {
        storeRemoveHolding(ticker);
        loadHoldings();
    }, [loadHoldings]);

    // Refresh prices
    const refresh = useCallback(() => {
        loadHoldings();
    }, [loadHoldings]);

    // Load on mount
    useEffect(() => {
        loadHoldings();
    }, [loadHoldings]);

    return {
        holdings,
        summary,
        loading,
        error,
        addHolding,
        removeHolding,
        refresh
    };
}
