'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import {
    getPortfolio,
    addHolding as storeAddHolding,
    removeHolding as storeRemoveHolding,
    type Holding,
    type PortfolioData
} from '@/lib/storage/portfolioStore';
import { useMarketStatus } from './useMarketStatus';
import { useOnePipe } from '@/hooks/useOnePipe';

export interface EnrichedHolding extends Holding {
    currentPrice: number;
    change: number;
    changePct: number;
    marketValue: number;
    gainLoss: number;
    gainLossPct: number;
    // Session info
    session?: string;
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

export function usePortfolio(initialHoldings?: Holding[], initialFullData?: any[]) {
    // Server-side portfolio from Supabase
    const [portfolioData, setPortfolioData] = useState<PortfolioData>({
        holdings: initialHoldings || [],
        updatedAt: new Date().toISOString()
    });
    const [storeLoading, setStoreLoading] = useState(!initialHoldings);

    // Load portfolio from Supabase on mount only if there is no initial data
    useEffect(() => {
        if (!initialHoldings) {
            loadPortfolio();
        }
    }, [initialHoldings]);

    const loadPortfolio = async () => {
        setStoreLoading(true);
        try {
            const data = await getPortfolio();
            setPortfolioData(data);
        } catch (e) {
            console.error('Failed to load portfolio:', e);
        } finally {
            setStoreLoading(false);
        }
    };

    const tickerString = portfolioData.holdings.map(h => h.ticker).join(',');
    const tickerArray = useMemo(() => portfolioData.holdings.map(h => h.ticker), [portfolioData.holdings]);

    // [PERF] Stop polling when market is closed (weekends, nights)
    const { status: marketStatus } = useMarketStatus();
    const isClosed = marketStatus.session === 'closed';

    // ── [ONE-PIPE] 가격은 useOnePipe 단일 경로 ──
    const onePipePrices = useOnePipe(tickerArray, { refreshInterval: 5000 });

    // ── SWR: Full data with 30s auto-refresh (Alpha, Signal, Action, etc.) ──
    const { data: fullData, error: fullError, isLoading: fullLoading, isValidating: fullValidating, mutate } = useSWR(
        tickerString ? `/api/portfolio/batch?tickers=${tickerString}` : null,
        fetcher,
        {
            fallbackData: initialFullData && initialFullData.length > 0
                ? { results: initialFullData }
                : undefined,
            refreshInterval: isClosed ? 0 : 30000,
            revalidateOnMount: true,
            revalidateOnFocus: false,
            dedupingInterval: 5000,
        }
    );

    // ── Enrich portfolio holdings with API data + ONE-PIPE price ──
    const holdings = useMemo<EnrichedHolding[]>(() => {
        if (portfolioData.holdings.length === 0) return [];

        const fullResults: Record<string, any> = {};
        if (fullData?.results) {
            fullData.results.forEach((r: any) => {
                if (r && !r.error) fullResults[r.ticker] = r;
            });
        }

        return portfolioData.holdings.map((holding) => {
            const fullApi = fullResults[holding.ticker];
            const alpha = fullApi?.alphaSnapshot;
            const fullRt = fullApi?.realtime;

            // ── [ONE-PIPE] 가격은 useOnePipe에서 ──
            const pipe = onePipePrices.get(holding.ticker);

            if (pipe && pipe.price > 0) {
                // POST/CLOSED에서는 ext 가격으로 시가총액 계산
                const displayPrice = (pipe.session === 'POST' || pipe.session === 'CLOSED') && pipe.extPrice
                    ? pipe.extPrice : pipe.price;

                const marketValue = holding.quantity * displayPrice;
                const costBasis = holding.quantity * holding.avgPrice;
                const gainLoss = marketValue - costBasis;
                const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

                return {
                    ...holding,
                    currentPrice: displayPrice,
                    change: fullRt?.change ?? 0,
                    changePct: pipe.changePct,
                    session: pipe.session?.toLowerCase(),
                    isExtended: pipe.session === 'PRE' || pipe.session === 'POST',
                    regChangePct: pipe.changePct,
                    extChangePct: pipe.extChangePct ?? undefined,
                    extLabel: pipe.extLabel === 'PRE CLOSE' ? 'PRE' as const : (pipe.extLabel as 'PRE' | 'POST' | undefined),
                    marketValue,
                    gainLoss,
                    gainLossPct,
                    alphaScore: alpha?.score,
                    alphaGrade: alpha?.grade,
                    action: alpha?.action,
                    confidence: alpha?.confidence,
                    triggers: alpha?.triggers,
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
    }, [fullData, portfolioData, onePipePrices]);

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
    const addHolding = useCallback(async (holding: Omit<Holding, 'addedAt'>) => {
        const updated = await storeAddHolding(holding);
        setPortfolioData(updated);
        mutate();
    }, [mutate]);

    const addHoldingWithAlpha = useCallback(async (holding: Omit<Holding, 'addedAt'>) => {
        const updated = await storeAddHolding(holding);
        setPortfolioData(updated);
        mutate();
    }, [mutate]);

    const removeHolding = useCallback(async (ticker: string) => {
        const updated = await storeRemoveHolding(ticker);
        setPortfolioData(updated);
        mutate();
    }, [mutate]);

    const refresh = useCallback(() => {
        mutate();
    }, [mutate]);

    return {
        holdings,
        summary,
        portfolioScore,
        loading: storeLoading || (fullLoading && holdings.length === 0),
        isRefreshing: fullValidating && !fullLoading,
        error: fullError?.message || null,
        addHolding,
        addHoldingWithAlpha,
        removeHolding,
        refresh,
        refreshPriceOnly: refresh, // SWR handles price polling automatically
    };
}
