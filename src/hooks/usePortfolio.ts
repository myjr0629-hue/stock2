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
                    // Demo alpha data (to be replaced with real API)
                    alphaScore: Math.floor(Math.random() * 40) + 40,
                    alphaGrade: (['A', 'B', 'C', 'D', 'F'] as const)[Math.floor(Math.random() * 3)], // Mostly A-C
                    action: ['HOLD', 'ADD', 'TRIM', 'WATCH'][Math.floor(Math.random() * 4)] as EnrichedHolding['action'],
                    confidence: Math.floor(Math.random() * 40) + 55, // 55-95%
                    threeDay: (Math.random() * 10) - 5,
                    rsi: Math.floor(Math.random() * 40) + 30,
                    sectorFlow: ['INFLOW', 'OUTFLOW', 'NEUTRAL'][Math.floor(Math.random() * 3)] as EnrichedHolding['sectorFlow'],
                    // Premium Edge Indicators
                    rvol: parseFloat((Math.random() * 2 + 0.5).toFixed(1)), // 0.5x - 2.5x
                    maxPainDist: parseFloat(((Math.random() * 10) - 5).toFixed(1)), // -5% to +5%
                    tripleA: {
                        direction: Math.random() > 0.3,
                        acceleration: Math.random() > 0.4,
                        accumulation: Math.random() > 0.5
                    }
                };
            });

            setHoldings(enriched);

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
