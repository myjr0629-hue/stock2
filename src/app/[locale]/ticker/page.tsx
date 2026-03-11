// src/app/ticker/page.tsx
// [PERF] CSR-first: No SSR blocking. Page renders instantly, data loads via SWR.
// LiveTickerDashboard already uses useFlowData (SWR) internally for all price data.

import { TickerPageClient } from "./TickerPageClient";
import { TerminalGateWrapper } from '@/components/gate/TerminalGateWrapper';
import { getFromCache } from '@/services/redisClient';
import { getStockDataLight } from '@/services/marketDataLight';
import { getStockChartData } from '@/services/stockApi';

interface Props {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ ticker?: string; range?: string; extended?: string }>;
}

export default async function TickerPage({ params, searchParams }: Props) {
    const resolvedParams = await searchParams;
    const routeParams = await params;
    const ticker = resolvedParams.ticker?.toUpperCase();
    const range = resolvedParams.range || "1d";
    const locale = routeParams.locale || "en";

    if (!ticker) {
        return (
            <div className="min-h-screen font-sans bg-slate-950 text-slate-200">
                <main className="mx-auto max-w-5xl px-6 pb-12">
                    <div className="border border-slate-800 bg-slate-900/50 rounded-lg p-6">
                        <div className="text-lg font-bold mb-2 text-white">Ticker required</div>
                        <div className="text-sm text-slate-400">Example: /ticker?ticker=NVDA</div>
                    </div>
                </main>
            </div>
        );
    }

    // [SSR HYDRATION] Pre-fetch stock data and unified cache to eliminate skeleton
    // Tier 1: Redis cache | Tier 2: DynamoDB (if Redis miss, for 300 universe tickers)
    const [initialStockData, rawUnifiedData, initialChartData] = await Promise.all([
        getStockDataLight(ticker).catch(() => null),
        getFromCache<any>(`cache:command:unified:${ticker}:${locale}`).catch(() => null),
        getStockChartData(ticker, (range || '1d') as any).catch(() => null)
    ]);

    // [SSR DynamoDB FALLBACK] If Redis missed, try DynamoDB for instant SSR data
    let initialUnifiedData = rawUnifiedData;
    if (!initialUnifiedData) {
        try {
            const { getTickerSnapshot, isDataFresh } = await import('@/lib/aws/dynamoDataProvider');
            const snap = await getTickerSnapshot(ticker);
            if (snap.price && (isDataFresh(snap.price.date) || isWithin3Days(snap.price.date))) {
                const gex = snap.gex;
                const p = snap.price as any;
                initialUnifiedData = {
                    structure: gex ? {
                        options_status: 'OK', netGex: gex.gex, maxPain: gex.maxPain,
                        pcRatio: gex.pcr, levels: { callWall: gex.callWall, putFloor: gex.putFloor },
                        gammaFlipLevel: gex.flipLevel, gammaRegime: gex.gammaRegime,
                        totalContracts: gex.totalContracts, totalCallOI: gex.totalCallOI, totalPutOI: gex.totalPutOI,
                        validation: { confidence: 'HIGH', source: 'ssr-dynamodb' },
                    } : null,
                    options: gex ? { pcr: gex.pcr } : null,
                    sma: p.sma50 && p.sma200 ? { ticker, cross: p.cross || 'NONE', crossType: p.crossType || '', sma50: p.sma50, sma200: p.sma200, distance: Math.round(((p.sma50 - p.sma200) / p.sma200) * 10000) / 100, isImminent: Math.abs(((p.sma50 - p.sma200) / p.sma200) * 100) < 0.5, phase: 'NEUTRAL', label: '' } : null,
                    earnings: snap.earnings ? { ticker, nextEarningsDate: snap.earnings.nextDate, daysUntilEarnings: snap.earnings.daysUntil || 0, daysLabel: (snap.earnings.daysUntil || 0) <= 0 ? 'today' : `D-${snap.earnings.daysUntil}`, hasData: true } : null,
                    analyst: snap.analyst ? { ticker, consensus: snap.analyst.consensus || 'N/A', totalAnalysts: snap.analyst.totalAnalysts || 0, bullishPct: snap.analyst.bullishPct || 0, breakdown: snap.analyst.breakdown || {} } : null,
                    fundamentals: snap.fundamentals ? { ticker, name: snap.fundamentals.name || ticker, marketCap: snap.fundamentals.marketCap, sector: snap.fundamentals.sector } : null,
                    related: snap.related?.tickers ? { ticker, relatedTickers: snap.related.tickers } : null,
                    _dynamoPrice: { price: p.close, open: p.open, high: p.high, low: p.low, volume: p.volume, changePct: p.changePct },
                    timestamp: Date.now(), _source: 'ssr-dynamodb',
                };
            }
        } catch { /* DynamoDB unavailable in SSR — continue without initial data */ }
    }

    // Construct a safe minimal version if stock data fails
    const safeStockData = initialStockData || {
        symbol: ticker,
        name: ticker,
        price: 0,
        change: 0,
        changePercent: 0,
        currency: "USD",
        history: [],
    };

    return (
        <TerminalGateWrapper pageName="COMMAND">
            <div className="min-h-screen h-full selection:bg-emerald-500/30 selection:text-emerald-200 font-sans bg-[#050a14] text-slate-200">
                <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pb-24 md:pb-48 space-y-4 bg-[#050a14]">
                    <TickerPageClient
                        ticker={ticker}
                        range={range}
                        initialStockData={safeStockData}
                        initialUnifiedData={initialUnifiedData || undefined}
                        initialChartData={initialChartData || undefined}
                    />
                </main>
            </div>
        </TerminalGateWrapper>
    );
}

// Helper: Check if date string is within 3 days (covers weekends/holidays)
function isWithin3Days(dateStr: string): boolean {
    if (!dateStr) return false;
    const dataDate = new Date(dateStr + 'T12:00:00-05:00');
    const diffDays = (Date.now() - dataDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays < 3.5;
}
