'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import useSWR from 'swr';
import {
    getPortfolio,
    addHolding as storeAddHolding,
    removeHolding as storeRemoveHolding,
    type Holding,
    type PortfolioData
} from '@/lib/storage/portfolioStore';
import { useMarketStatus } from './useMarketStatus';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { calcUnifiedPrice, type MarketSession } from '@/services/unifiedPriceService';

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

    // [WS] Real-time price overlay via WebSocket (EC2 Price WS Hub)
    const { getPrice: wsGetPrice, connected: wsConnected } = useRealtimeData(tickerArray);

    // [ONE-PIPE] regularCloseToday 잠금 — Polygon CLOSED/POST 불안정 차단
    const closeLocks = useRef<Record<string, number>>({});
    // [FIX] SSR 데이터로 lock 초기화 (페이지 재진입 시 빈 lock 방지)
    if (initialFullData && initialFullData.length > 0 && Object.keys(closeLocks.current).length === 0) {
        initialFullData.forEach((r: any) => {
            const p = r?.realtime?.price;
            if (r?.ticker && p > 0) {
                closeLocks.current[r.ticker] = p;
            }
        });
    }

    // ── SWR: Full data with 30s auto-refresh (Alpha, Signal, Action, etc.) ──
    const { data: fullData, error: fullError, isLoading: fullLoading, isValidating: fullValidating, mutate } = useSWR(
        tickerString ? `/api/portfolio/batch?tickers=${tickerString}` : null,
        fetcher,
        {
            fallbackData: initialFullData && initialFullData.length > 0
                ? { results: initialFullData }
                : undefined,
            refreshInterval: isClosed ? 0 : 30000,      // 30s full refresh (disabled when closed)
            revalidateOnMount: true,                     // ← CRITICAL: fetch fresh data immediately on mount
            revalidateOnFocus: false,
            dedupingInterval: 5000,
        }
    );

    // ── SWR: Price-only with 2s auto-refresh (lightweight) ──
    const { data: priceData, isLoading: priceLoading } = useSWR(
        tickerString ? `/api/portfolio/batch?tickers=${tickerString}&mode=price` : null,
        fetcher,
        {
            // Extract lightweight prices from initialFullData
            fallbackData: initialFullData && initialFullData.length > 0 ? {
                results: initialFullData.map(r => ({
                    ticker: r.ticker,
                    realtime: {
                        price: r.realtime.price,
                        changePct: r.realtime.changePct,
                        session: r.realtime.session,
                        isExtended: r.realtime.isExtended,
                        extPrice: r.realtime.extPrice,
                        extChangePercent: r.realtime.extChangePercent
                    }
                }))
            } : undefined,
            refreshInterval: isClosed ? 0 : 10000,      // 10s price polling (WS provides real-time, this is fallback)
            revalidateOnMount: true,                     // ← CRITICAL: immediate first fetch
            revalidateOnFocus: false,
            dedupingInterval: 1000,                      // ← Reduced from 2s to 1s for snappier updates
        }
    );

    // ── SWR: Live quotes for session-aware extended pricing (2s) ──
    const { data: liveQuotes } = useSWR(
        tickerString ? `/api/live/quotes?symbols=${tickerString}` : null,
        fetcher,
        {
            fallbackData: initialFullData && initialFullData.length > 0 ? {
                data: initialFullData.reduce((acc, r) => {
                    acc[r.ticker] = r.realtime;
                    return acc;
                }, {} as Record<string, any>)
            } : undefined,
            refreshInterval: isClosed ? 0 : 10000,     // 10s live quotes (WS provides real-time, this is fallback)
            revalidateOnMount: true,                     // ← CRITICAL: immediate first fetch
            revalidateOnFocus: false,
            dedupingInterval: 1000,                      // ← Reduced from 3s to 1s
        }
    );

    // [ONE-PIPE] Session mapper helper
    const toSession = (s: string | undefined): MarketSession => {
        if (!s) return 'CLOSED';
        const u = s.toUpperCase();
        if (u === 'PRE' || u === 'PRE_MARKET' || u === 'PREMARKET') return 'PRE';
        if (u === 'REG' || u === 'REGULAR' || u === 'OPEN') return 'REG';
        if (u === 'POST' || u === 'POST_MARKET' || u === 'POSTMARKET') return 'POST';
        return 'CLOSED';
    };

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

            const fullRt = fullApi?.realtime;
            const priceRt = priceApi?.realtime;
            const rt = priceRt || fullRt;
            const alpha = fullApi?.alphaSnapshot;

            if (rt) {
                // [WS] WebSocket: REG 세션 최우선 (실시간 틱)
                const wsPrice = wsGetPrice(holding.ticker);
                const session = toSession(priceRt?.session || fullRt?.session || liveQ?.session);

                // [ONE-PIPE] regularCloseToday 잠금 — 최초 유효한 값 고정
                const apiPrice = liveQ?.price || priceRt?.price || fullRt?.price || 0;
                const prevCl = liveQ?.prevClose || priceRt?.prevDayClose || fullRt?.prevDayClose || 0;
                // [FIX] Polygon 버그 감지: CLOSED/POST에서 price ≈ prevClose면 lock 갱신 차단
                if (apiPrice > 0 && !closeLocks.current[holding.ticker]) {
                    const isSuspicious = prevCl > 0 && Math.abs(apiPrice - prevCl) < 0.01;
                    if (!isSuspicious || (session !== 'CLOSED' && session !== 'POST')) {
                        closeLocks.current[holding.ticker] = apiPrice;
                    }
                }
                const regCloseToday = closeLocks.current[holding.ticker] || apiPrice;

                // [ONE-PIPE] calcUnifiedPrice로 안정적 가격 계산
                const unified = calcUnifiedPrice({
                    session,
                    lastTradePrice: liveQ?.extendedPrice > 0 ? liveQ.extendedPrice : apiPrice,
                    dayClose: apiPrice,
                    prevDayClose: prevCl,
                    regularCloseToday: regCloseToday,
                    afterHoursPrice: liveQ?.extendedLabel === 'POST' && liveQ?.extendedPrice > 0 ? liveQ.extendedPrice : undefined,
                    preMarketPrice: liveQ?.extendedLabel === 'PRE' && liveQ?.extendedPrice > 0 ? liveQ.extendedPrice : undefined,
                });

                // Price priority: WS(장중 실시간) > ONE-PIPE regularPrice
                const price = (wsPrice?.price && wsPrice.price > 0) ? wsPrice.price : (unified.regularPrice ?? 0);
                // changePct: WS(장중) > ONE-PIPE (CLOSED/POST 안정)
                const changePct = (wsPrice?.changePct != null && session === 'REG') ? wsPrice.changePct : (unified.regularChangePct ?? 0);
                const regChangePct = unified.regularChangePct ?? 0;

                // Extended price decomposition (POST/PRE badges)
                const extChangePct = unified.postChangePct || unified.preChangePct || undefined;
                const postP = unified.postPrice ?? 0;
                const preP = unified.prePrice ?? 0;
                const extLabel: 'PRE' | 'POST' | undefined = postP > 0 ? 'POST'
                    : preP > 0 ? 'PRE' : undefined;

                const displayPrice = (session === 'POST' || session === 'CLOSED') && postP > 0
                    ? postP : price;

                const marketValue = holding.quantity * displayPrice;
                const costBasis = holding.quantity * holding.avgPrice;
                const gainLoss = marketValue - costBasis;
                const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

                return {
                    ...holding,
                    currentPrice: displayPrice,
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
    }, [fullData, priceData, liveQuotes, portfolioData, wsGetPrice]);

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
