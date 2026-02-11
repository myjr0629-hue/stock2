'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
    // Session info
    session?: 'pre' | 'reg' | 'post';
    isExtended?: boolean;
    // Alpha engine data (to be enriched)
    alphaScore?: number;
    alphaGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
    action?: 'HOLD' | 'TRIM' | 'ADD' | 'WATCH';
    confidence?: number; // 0-100%
    triggers?: string[]; // Signal reasoning
    sparkline?: number[]; // Intraday price chart data
    threeDay?: number;
    rsi?: number;
    sectorFlow?: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
    // Premium Edge Indicators
    rvol?: number; // Relative Volume (1.0 = average)
    maxPainDist?: number; // % distance from max pain
    gex?: number; // Gamma Exposure (raw)
    gexM?: number; // Gamma Exposure (millions)
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
    const [isRefreshing, setIsRefreshing] = useState(false); // Background refresh indicator
    const [error, setError] = useState<string | null>(null);
    const isInitialLoad = useRef(true);

    // Load and enrich holdings
    const loadHoldings = useCallback(async () => {
        try {
            // Only show full loading spinner on initial load
            if (isInitialLoad.current) {
                setLoading(true);
            } else {
                setIsRefreshing(true); // Silent background refresh
            }

            const data = getPortfolio();
            const tickers = data.holdings.map(h => h.ticker);

            // [OPTIMIZATION] Use batch API for all tickers at once
            if (tickers.length === 0) {
                setHoldings([]);
                setSummary({
                    totalValue: 0,
                    totalCost: 0,
                    totalGainLoss: 0,
                    totalGainLossPct: 0,
                    holdingsCount: 0
                });
                setError(null);
                return;
            }

            let apiResults: Record<string, any> = {};
            try {
                const res = await fetch(`/api/portfolio/batch?tickers=${tickers.join(',')}`);
                if (res.ok) {
                    const batchData = await res.json();
                    // Convert array to map for easy lookup
                    batchData.results?.forEach((result: any) => {
                        if (result && !result.error) {
                            apiResults[result.ticker] = result;
                        }
                    });
                }
            } catch {
                console.error('Portfolio batch API failed, items will show loading state');
            }

            // Enrich holdings with API data
            const enriched: EnrichedHolding[] = data.holdings.map((holding) => {
                const apiData = apiResults[holding.ticker];

                if (apiData && apiData.realtime) {
                    const rt = apiData.realtime;
                    const alpha = apiData.alphaSnapshot;

                    // [V3.2] Use price/changePct directly from batch API
                    // The batch API already handles session-aware pricing (same as watchlist)
                    const price = rt.price || 0;
                    const changePct = rt.changePct || 0;

                    const marketValue = holding.quantity * price;
                    const costBasis = holding.quantity * holding.avgPrice;
                    const gainLoss = marketValue - costBasis;
                    const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

                    return {
                        ...holding,
                        currentPrice: price,
                        change: rt.change || 0,
                        changePct,
                        session: rt.session,
                        isExtended: rt.isExtended,
                        marketValue,
                        gainLoss,
                        gainLossPct,
                        // Alpha data (from V3.2 engine)
                        alphaScore: alpha?.score,
                        alphaGrade: alpha?.grade,
                        action: alpha?.action,
                        confidence: alpha?.confidence,
                        triggers: alpha?.triggers,
                        sparkline: rt.sparkline,
                        threeDay: rt.threeDay,
                        rsi: rt.rsi,
                        rvol: rt.rvol,
                        maxPainDist: rt.maxPainDist,
                        gex: rt.gex,
                        gexM: rt.gexM,
                        tripleA: rt.tripleA
                    };
                }

                // Fallback when no API data
                const marketValue = holding.quantity * holding.avgPrice;
                return {
                    ...holding,
                    currentPrice: holding.avgPrice,
                    change: 0,
                    changePct: 0,
                    marketValue,
                    gainLoss: 0,
                    gainLossPct: 0
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
            setIsRefreshing(false);
            isInitialLoad.current = false;
        }
    }, []);

    // Price-only refresh (preserves alpha/signal/action from last full load)
    const loadPricesOnly = useCallback(async () => {
        try {
            const data = getPortfolio();
            const tickers = data.holdings.map(h => h.ticker);
            if (tickers.length === 0) return;

            setIsRefreshing(true);
            const res = await fetch(`/api/portfolio/batch?tickers=${tickers.join(',')}&mode=price`);
            if (!res.ok) return;
            const batchData = await res.json();
            const priceMap: Record<string, any> = {};
            batchData.results?.forEach((r: any) => {
                if (r && !r.error) priceMap[r.ticker] = r.realtime;
            });

            setHoldings(prev => {
                const updated = prev.map(h => {
                    const rt = priceMap[h.ticker];
                    if (!rt) return h;
                    const marketValue = h.quantity * rt.price;
                    const costBasis = h.quantity * h.avgPrice;
                    const gainLoss = marketValue - costBasis;
                    const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
                    return {
                        ...h,
                        currentPrice: rt.price,
                        change: rt.change || 0,
                        changePct: rt.changePct,
                        session: rt.session,
                        isExtended: rt.isExtended,
                        sparkline: rt.sparkline || h.sparkline,
                        marketValue,
                        gainLoss,
                        gainLossPct
                    };
                });

                // Also update summary
                const totalValue = updated.reduce((sum, h) => sum + h.marketValue, 0);
                const totalCost = updated.reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
                const totalGainLoss = totalValue - totalCost;
                const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
                setSummary({ totalValue, totalCost, totalGainLoss, totalGainLossPct, holdingsCount: updated.length });

                return updated;
            });
        } catch (e) {
            console.error('Price-only refresh failed:', e);
        } finally {
            setIsRefreshing(false);
        }
    }, []);

    // Fetch prices from API with session info
    async function fetchPrices(tickers: string[]): Promise<Record<string, {
        price: number;
        change: number;
        changePct: number;
        session?: 'pre' | 'reg' | 'post';
        isExtended?: boolean;
    }>> {
        const result: Record<string, {
            price: number;
            change: number;
            changePct: number;
            session?: 'pre' | 'reg' | 'post';
            isExtended?: boolean;
        }> = {};

        // Batch fetch (or individual if batch not available)
        for (const ticker of tickers) {
            try {
                // Fixed: use 'symbol=' instead of 'ticker='
                const res = await fetch(`/api/stock?symbol=${ticker}`);
                if (res.ok) {
                    const data = await res.json();

                    // Use extended hours price if available, otherwise regular price
                    const isExtended = data.session === 'pre' || data.session === 'post';
                    const displayPrice = isExtended && data.extPrice ? data.extPrice : (data.price || data.last || 0);
                    const displayChange = isExtended && data.extChangePercent !== undefined
                        ? data.extChangePercent
                        : (data.changePct || data.changePercent || 0);

                    result[ticker] = {
                        price: displayPrice,
                        change: data.change || 0,
                        changePct: displayChange,
                        session: data.session as 'pre' | 'reg' | 'post',
                        isExtended
                    };
                }
            } catch {
                // Use placeholder if API fails
                result[ticker] = { price: 0, change: 0, changePct: 0 };
            }
        }

        return result;
    }

    // Fetch Alpha data by calling Alpha engine for each ticker
    interface AlphaData {
        score: number;
        grade: 'A' | 'B' | 'C' | 'D' | 'F';
        action: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH';
        confidence: number;
        triggers: string[];
        sparkline: number[];
        threeDay: number;
        rvol: number;
        maxPainDist: number;
        gex: number;
        gexM: number;
        tripleA: { direction: boolean; acceleration: boolean; accumulation: boolean };
    }

    async function fetchAlphaData(tickers: string[]): Promise<Record<string, AlphaData>> {
        const result: Record<string, AlphaData> = {};

        // Call Alpha engine API for each ticker in parallel (with limit)
        const analyzePromises = tickers.map(async (ticker) => {
            try {
                const res = await fetch(`/api/portfolio/analyze?ticker=${ticker.toUpperCase()}`);
                if (!res.ok) return null;

                const data = await res.json();
                if (data.alphaSnapshot && data.realtime) {
                    result[ticker] = {
                        score: data.alphaSnapshot.score,
                        grade: data.alphaSnapshot.grade,
                        action: data.alphaSnapshot.action,
                        confidence: data.alphaSnapshot.confidence,
                        triggers: data.alphaSnapshot.triggers || [],
                        sparkline: data.realtime.sparkline || [],
                        threeDay: data.realtime.changePct || 0,
                        rvol: data.realtime.rvol || 1.0,
                        maxPainDist: data.realtime.maxPainDist, // Keep null if no options data
                        gex: data.realtime.gex,
                        gexM: data.realtime.gexM, // Keep null if no options data
                        tripleA: data.realtime.tripleA || { direction: false, acceleration: false, accumulation: false }
                    };
                }
                return data;
            } catch (e) {
                console.error(`Failed to analyze ${ticker}:`, e);
                return null;
            }
        });

        await Promise.all(analyzePromises);
        return result;
    }

    // Add holding (basic - without alpha)
    const addHolding = useCallback((holding: Omit<Holding, 'addedAt'>) => {
        storeAddHolding(holding);
        loadHoldings();
    }, [loadHoldings]);

    // Add holding with Alpha snapshot (called from modal after API analysis)
    const addHoldingWithAlpha = useCallback((holding: Omit<Holding, 'addedAt'>) => {
        // This will include alphaSnapshot if provided
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
        isRefreshing, // For subtle refresh indicator
        error,
        addHolding,
        addHoldingWithAlpha,
        removeHolding,
        refresh,
        refreshPriceOnly: loadPricesOnly
    };
}
