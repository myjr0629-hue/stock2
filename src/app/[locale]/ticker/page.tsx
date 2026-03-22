// src/app/ticker/page.tsx
// [PERF V73] ZERO BLANK SCREEN — 4-Tier SSR Data Pipeline
// Tier 1: Redis (0ms) → Tier 2: DynamoDB Unified Cache (~50ms) → Tier 3: DynamoDB Snapshots (~200ms) → Tier 4: Safe fallback
// LiveTickerDashboard uses useFlowData (SWR) internally for all price data.

import { TickerPageClient } from "./TickerPageClient";
import { TerminalGateWrapper } from '@/components/gate/TerminalGateWrapper';
import { getFromCache, setInCache } from '@/services/redisClient';
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

    // [SSR HYDRATION] Pre-fetch stock data, unified cache, and chart — ALL in parallel
    // Chart has a 500ms timeout — if Polygon is slow, client SWR will load it instead
    const chartWithTimeout = Promise.race([
        getStockChartData(ticker, (range || '1d') as any).catch(() => null),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 500))
    ]);

    const [initialStockData, rawUnifiedData, rawOverviewData, initialChartData] = await Promise.all([
        getStockDataLight(ticker).catch(() => null),
        getFromCache<any>(`cache:command:unified:${ticker}`).catch(() => null),         // Language-independent data
        getFromCache<any>(`cache:command:overview:${ticker}:${locale}`).catch(() => null), // Language-specific overview
        chartWithTimeout,
    ]);

    // ═══════════════════════════════════════════════════════════════
    // [V73] 4-TIER SSR DATA PIPELINE — guarantees data for every load
    // ═══════════════════════════════════════════════════════════════
    let initialUnifiedData = rawUnifiedData ? { ...rawUnifiedData, overview: rawOverviewData || rawUnifiedData.overview || null } : null;

    // ── Tier 2: DynamoDB Unified Cache (2s timeout — DynamoDB can hang on Vercel) ──
    if (!initialUnifiedData) {
        try {
            const dynamoUnified = await Promise.race([
                import('@/lib/aws/unifiedCacheProvider').then(m => m.getUnifiedCache(ticker, locale)),
                new Promise<null>(r => setTimeout(() => r(null), 2000))
            ]);
            if (dynamoUnified && (dynamoUnified.structure || dynamoUnified.options)) {
                const { overview: _discard, ...dynData } = dynamoUnified;
                const dynOverview = rawOverviewData || await getFromCache<any>(`cache:command:overview:${ticker}:${locale}`).catch(() => null);
                initialUnifiedData = { ...dynData, overview: dynOverview || null };
                setInCache(`cache:command:unified:${ticker}`, dynData, 1800).catch(() => {});
            }
        } catch { /* DynamoDB Unified Cache unavailable */ }
    }

    // ── Tier 3: DynamoDB Individual Snapshots (2s timeout) ──
    if (!initialUnifiedData) {
        try {
            const snapResult = await Promise.race([
                import('@/lib/aws/dynamoDataProvider').then(async m => {
                    const snap = await m.getTickerSnapshot(ticker);
                    return { snap, isDataFresh: m.isDataFresh };
                }),
                new Promise<null>(r => setTimeout(() => r(null), 2000))
            ]);
            if (snapResult) {
                const { snap, isDataFresh } = snapResult;
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
                    fundamentals: snap.fundamentals ? {
                        ticker, name: snap.fundamentals.name || ticker,
                        marketCap: snap.fundamentals.marketCap, sector: snap.fundamentals.sector,
                        score: snap.fundamentals.score ?? null, grade: snap.fundamentals.grade ?? null,
                        pe: snap.fundamentals.pe ?? null, roe: snap.fundamentals.roe ?? null,
                        de: snap.fundamentals.de ?? null, revenueGrowth: snap.fundamentals.revenueGrowth ?? null,
                        netMargin: snap.fundamentals.netMargin ?? null, breakdown: snap.fundamentals.breakdown ?? null,
                    } : null,
                    related: snap.related?.tickers ? {
                        ticker, count: snap.related.tickers.length,
                        topRelated: snap.related.tickers.slice(0, 4).map((t: string) => ({ ticker: t, price: 0, change: 0, logo: null })),
                        relatedTickers: snap.related.tickers, allTickers: snap.related.tickers,
                    } : null,
                    _dynamoPrice: { price: p.close, open: p.open, high: p.high, low: p.low, volume: p.volume, changePct: p.changePct },
                    timestamp: Date.now(), _source: 'ssr-dynamodb',
                };
                }
            }
        } catch { /* DynamoDB unavailable in SSR — continue without initial data */ }
    }

    // ── [극강 Layer 3] SSR Direct Build — server fetches unified API if ALL caches miss ──
    // 3-second timeout: if Polygon is slow, fall through to client SWR (current behavior)
    if (!initialUnifiedData) {
        try {
            const headers = new Headers();
            headers.set('x-ssr-direct', '1'); // Tag for logging
            const baseUrl = process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : `http://localhost:${process.env.PORT || 3000}`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

            const ssrRes = await fetch(
                `${baseUrl}/api/command/unified?t=${ticker}&lang=${locale}`,
                { signal: controller.signal, cache: 'no-store' }
            );
            clearTimeout(timeout);

            if (ssrRes.ok) {
                const ssrData = await ssrRes.json();
                if (ssrData && (ssrData.structure || ssrData.options)) {
                    initialUnifiedData = ssrData;
                    console.log(`[SSR] 극강 Layer 3: Direct build for ${ticker} succeeded`);
                }
            }
        } catch (e: any) {
            // AbortError = timeout (safe, expected), other errors = also safe
            if (e?.name !== 'AbortError') {
                console.warn(`[SSR] Layer 3 direct build failed for ${ticker}:`, e?.message);
            } else {
                console.log(`[SSR] Layer 3 timeout for ${ticker} (3s) — client SWR will handle`);
            }
        }
    }

    // ── Apply DynamoDB price to stockData if Polygon failed ──
    // This prevents the price=0 loading gate deadlock
    const dynamoPrice = initialUnifiedData?._dynamoPrice;
    const safeStockData = initialStockData || (dynamoPrice?.price > 0 ? {
        symbol: ticker,
        name: ticker,
        price: dynamoPrice.price,
        change: 0,
        changePercent: dynamoPrice.changePct || 0,
        prevClose: 0,
        vwap: 0,
        currency: "USD",
        history: [],
        session: 'closed',
    } : {
        symbol: ticker,
        name: ticker,
        price: 0,
        change: 0,
        changePercent: 0,
        currency: "USD",
        history: [],
    });

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
