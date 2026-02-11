'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import {
    getPortfolio,
    addHolding as storeAddHolding,
    removeHolding as storeRemoveHolding,
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
    // Session-aware price decomposition
    regChangePct?: number;     // Regular session change % (from prevClose)
    extChangePct?: number;     // Extended hours change % (from reg close)
    extLabel?: 'PRE' | 'POST'; // Extended session label
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

const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error('Failed to fetch portfolio data');
    return res.json();
});

export function usePortfolio() {
    // Local portfolio from localStorage
    const [portfolioData, setPortfolioData] = useState<PortfolioData>(() => getPortfolio());

    const tickerString = portfolioData.holdings.map(h => h.ticker).join(',');

    // ── SWR: Full data with 30s auto-refresh (Alpha, Signal, Action, etc.) ──
    const { data: fullData, error: fullError, isLoading, isValidating, mutate } = useSWR(
        tickerString ? `/api/portfolio/batch?tickers=${tickerString}` : null,
        fetcher,
        {
            refreshInterval: 30000,      // 30s full refresh
            revalidateOnFocus: false,
            dedupingInterval: 5000,
        }
    );

    // ── SWR: Price-only with 5s auto-refresh (lightweight) ──
    const { data: priceData } = useSWR(
        tickerString ? `/api/portfolio/batch?tickers=${tickerString}&mode=price` : null,
        fetcher,
        {
            refreshInterval: 5000,       // 5s fast price polling
            revalidateOnFocus: false,
            dedupingInterval: 2000,
        }
    );

    // ── SWR: Live quotes for session-aware extended pricing (10s) ──
    const { data: liveQuotes } = useSWR(
        tickerString ? `/api/live/quotes?symbols=${tickerString}` : null,
        fetcher,
        {
            refreshInterval: 10000,
            revalidateOnFocus: false,
            dedupingInterval: 3000,
        }
    );

    // ── Enrich portfolio holdings with API data + fast price overlay ──
    const holdings = useMemo<EnrichedHolding[]>(() => {
        if (portfolioData.holdings.length === 0) return [];

        // Full batch data (30s)
        const fullResults: Record<string, any> = {};
        if (fullData?.results) {
            fullData.results.forEach((r: any) => {
                if (r && !r.error) fullResults[r.ticker] = r;
            });
        }

        // Fast price data (5s)
        const priceResults: Record<string, any> = {};
        if (priceData?.results) {
            priceData.results.forEach((r: any) => {
                if (r && !r.error) priceResults[r.ticker] = r;
            });
        }

        // Live quotes for extended prices (10s)
        const liveMap: Record<string, any> = {};
        if (liveQuotes?.data) {
            Object.entries(liveQuotes.data).forEach(([ticker, d]: [string, any]) => {
                if (d && d.price > 0) liveMap[ticker] = d;
            });
        }

        return portfolioData.holdings.map((holding) => {
            const fullApi = fullResults[holding.ticker];
            const priceApi = priceResults[holding.ticker];
            const liveQ = liveMap[holding.ticker];

            // Use 5s fast price if available, else 30s full data
            // Merge: price from fast poll, sparkline/indicators from full data
            const fullRt = fullApi?.realtime;
            const priceRt = priceApi?.realtime;
            const rt = fullRt || priceRt;
            const alpha = fullApi?.alphaSnapshot; // Alpha only from full data

            // Session-aware extended price decomposition from /api/live/quotes
            let regChangePct: number | undefined;
            let extChangePct: number | undefined;
            let extLabel: 'PRE' | 'POST' | undefined;
            let displayPrice: number | undefined;

            if (liveQ) {
                const hasExtended = liveQ.extendedPrice && liveQ.extendedPrice > 0;
                regChangePct = liveQ.changePercent || 0;
                if (hasExtended) {
                    extChangePct = liveQ.extendedChangePercent || 0;
                    extLabel = liveQ.extendedLabel || undefined;
                    const prevClose = liveQ.previousClose || liveQ.prevClose || 0;
                    displayPrice = liveQ.extendedPrice;
                }
            }

            if (rt) {
                // Price: prefer extended live > fast 5s poll > full 30s
                const price = displayPrice || priceRt?.price || fullRt?.price || 0;
                const changePct = displayPrice && liveQ
                    ? ((displayPrice - (liveQ.previousClose || liveQ.prevClose || price)) / (liveQ.previousClose || liveQ.prevClose || price)) * 100
                    : (priceRt?.changePct ?? fullRt?.changePct ?? 0);
                const marketValue = holding.quantity * price;
                const costBasis = holding.quantity * holding.avgPrice;
                const gainLoss = marketValue - costBasis;
                const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

                return {
                    ...holding,
                    currentPrice: price,
                    change: priceRt?.change ?? fullRt?.change ?? 0,
                    changePct,
                    session: priceRt?.session || fullRt?.session,
                    isExtended: priceRt?.isExtended ?? fullRt?.isExtended,
                    regChangePct,
                    extChangePct,
                    extLabel,
                    marketValue,
                    gainLoss,
                    gainLossPct,
                    // Alpha from full data (30s)
                    alphaScore: alpha?.score,
                    alphaGrade: alpha?.grade,
                    action: alpha?.action,
                    confidence: alpha?.confidence,
                    triggers: alpha?.triggers,
                    // Sparkline & indicators from full data (30s) — preserved
                    sparkline: fullRt?.sparkline,
                    threeDay: fullRt?.threeDay,
                    rsi: fullRt?.rsi,
                    rvol: fullRt?.rvol,
                    maxPainDist: fullRt?.maxPainDist,
                    gex: fullRt?.gex,
                    gexM: fullRt?.gexM,
                    tripleA: fullRt?.tripleA,
                };
            }

            // Fallback
            const marketValue = holding.quantity * holding.avgPrice;
            return {
                ...holding,
                currentPrice: holding.avgPrice,
                change: 0,
                changePct: 0,
                marketValue,
                gainLoss: 0,
                gainLossPct: 0,
            };
        });
    }, [fullData, priceData, liveQuotes, portfolioData]);

    // ── Summary (derived from holdings) ──
    const summary = useMemo<PortfolioSummary>(() => {
        const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
        const totalCost = holdings.reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
        const totalGainLoss = totalValue - totalCost;
        const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
        return { totalValue, totalCost, totalGainLoss, totalGainLossPct, holdingsCount: holdings.length };
    }, [holdings]);

    // ── Portfolio Score ──
    const portfolioScore = useMemo(() => {
        const scored = holdings.filter(h => h.alphaScore != null);
        if (scored.length === 0) return undefined;
        const totalWeight = scored.reduce((s, h) => s + h.marketValue, 0);
        if (totalWeight === 0) return undefined;
        return scored.reduce((s, h) => s + (h.alphaScore! * h.marketValue), 0) / totalWeight;
    }, [holdings]);

    // ── Actions ──
    const addHolding = useCallback((holding: Omit<Holding, 'addedAt'>) => {
        storeAddHolding(holding);
        setPortfolioData(getPortfolio());
        mutate();
    }, [mutate]);

    const addHoldingWithAlpha = useCallback((holding: Omit<Holding, 'addedAt'>) => {
        storeAddHolding(holding);
        setPortfolioData(getPortfolio());
        mutate();
    }, [mutate]);

    const removeHolding = useCallback((ticker: string) => {
        storeRemoveHolding(ticker);
        setPortfolioData(getPortfolio());
        mutate();
    }, [mutate]);

    const refresh = useCallback(() => {
        mutate();
    }, [mutate]);

    return {
        holdings,
        summary,
        portfolioScore,
        loading: isLoading,
        isRefreshing: isValidating && !isLoading,
        error: fullError?.message || null,
        addHolding,
        addHoldingWithAlpha,
        removeHolding,
        refresh,
        refreshPriceOnly: refresh, // SWR handles price polling automatically
    };
}
