// src/app/[locale]/flow/page.tsx
// FLOW - Options Intelligence Page (FlowRadar with SAME data as COMMAND)
// [PERF] SWR-powered: stale-while-revalidate caching for instant revisit
"use client";

import React, { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { FlowRadar } from '@/components/FlowRadar';
import { Loader2, RefreshCw } from 'lucide-react';
import { FavoriteToggle } from '@/components/FavoriteToggle';
import { useFlowData } from '@/hooks/useFlowData';
import { useLivePrice } from '@/hooks/useLivePrice';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';
import useSWR from 'swr';

function FlowPageContent() {
    const searchParams = useSearchParams();
    // Support both ?ticker= and ?t= for cross-page compatibility
    const ticker = searchParams.get('ticker')?.toUpperCase()
        || searchParams.get('t')?.toUpperCase()
        || 'TSLA';

    // [PERF] SWR replaces useState+useEffect+fetch+setInterval
    // - Cached data returned instantly on revisit (0ms)
    // - Background refresh every 15s
    // - Deduplication prevents concurrent duplicate requests
    const { data: liveQuote, isLoading: loading, isValidating: quoteLoading } = useFlowData(ticker, {
        refreshInterval: 5000,  // 5s polling (matches Command page)
    });

    // Sparkline chart data
    const chartFetcher = (url: string) => fetch(url).then(r => r.json());
    const { data: chartRes } = useSWR(
        ticker ? `/api/chart?symbol=${ticker}&range=1d` : null,
        chartFetcher,
        { refreshInterval: 60000, revalidateOnFocus: false }
    );

    const sparklinePath = useMemo(() => {
        const points: number[] = (chartRes?.data || []).map((d: any) => d.close).filter((v: number) => v > 0);
        if (points.length < 2) return null;
        const min = Math.min(...points);
        const max = Math.max(...points);
        const range = max - min || 1;
        const w = 120;
        const h = 32;
        const step = w / (points.length - 1);
        const coords = points.map((p: number, i: number) => {
            const x = i * step;
            const y = h - ((p - min) / range) * (h - 4) - 2;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        return {
            path: coords.join(' '),
            isUp: points[points.length - 1] >= points[0],
            prevClose: points[0],
            lastPrice: points[points.length - 1]
        };
    }, [chartRes]);

    // [PERF] 5s real-time price polling (separate from heavy 60s ticker API)
    const livePrice = useLivePrice(ticker);

    // [UNIFIED] All price display logic via shared calcPriceDisplay()
    const { displayPrice, displayChangePct, activeExtPrice, activeExtType, activeExtLabel, activeExtPct } = calcPriceDisplay({
        livePrice: livePrice?.price,
        liveChangePct: livePrice?.changePercent,
        apiDisplayPrice: liveQuote?.display?.price,
        apiDisplayChangePct: liveQuote?.display?.changePctPct,
        session: liveQuote?.session || 'CLOSED',
        prevRegularClose: liveQuote?.prices?.prevRegularClose,
        prevClose: liveQuote?.prevClose,
        regularCloseToday: liveQuote?.prices?.regularCloseToday,
        prevChangePct: liveQuote?.prices?.prevChangePct,
        fallbackChangePct: liveQuote?.changePercent || 0,
        lastTrade: liveQuote?.prices?.lastTrade || liveQuote?.price,
        extended: liveQuote?.extended,
        prices: liveQuote?.prices,
    });

    const isPositive = displayChangePct >= 0;

    // EXACT SAME rawChain source as COMMAND (L1152)
    const rawChain = liveQuote?.flow?.rawChain || [];
    const allExpiryChain = liveQuote?.flow?.allExpiryChain || [];
    const gammaFlipLevel = liveQuote?.flow?.gammaFlipLevel ?? null;
    const oiPcr = liveQuote?.flow?.oiPcr ?? null;

    return (
        <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
            {/* Fixed dark background to cover body gradient */}
            <div className="fixed inset-0 bg-[#0a0f1a] -z-50" />
            {/* Header Navigation */}
            <LandingHeader />

            {/* Main Content Container */}
            <div className="flex-1 relative">
                {/* Background Effects */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                    <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[150px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-600/25 rounded-full blur-[150px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-purple-600/20 rounded-full blur-[180px]" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
                </div>

                {/* Content - pt adjusted for fixed header (nav 48px + ticker ~40px) */}
                <main className="relative z-10 mx-auto max-w-[1400px] w-full px-4 sm:px-6 pb-48 min-h-screen">

                    <div className="sticky top-[78px] z-30 bg-white/5 backdrop-blur-xl rounded-xl py-1 px-3 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] flex items-center justify-between">
                        <div>
                            {/* Row 1: Identity (all inline) */}
                            <div className="flex items-center gap-2.5">
                                <div className="relative w-10 h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
                                    <img
                                        src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                        alt={`${ticker} logo`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                </div>
                                <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tighter font-jakarta">{ticker}</h1>
                                <span className="text-xs text-slate-500 font-bold tracking-tight uppercase font-jakarta">{liveQuote?.name || 'Loading...'}</span>
                                <FavoriteToggle ticker={ticker} name={liveQuote?.name} />
                            </div>

                            {/* Row 2: Price + Extended Badge (fixed position, independent of ticker) */}
                            <div className="hidden sm:flex items-baseline gap-3 -mt-0.5 pl-[50px] lg:pl-[58px]">
                                <div className="text-2xl font-black text-white tracking-tighter tabular-nums leading-none">
                                    ${displayPrice?.toFixed(2) || '—'}
                                </div>
                                <div className={`text-sm font-bold tabular-nums tracking-tighter ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
                                    {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                                </div>

                                {/* Extended Session Badge */}
                                {activeExtPrice > 0 && (
                                    <div className="flex items-center gap-2 px-2.5 py-0.5 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md">
                                        <div className={`w-1.5 h-1.5 rounded-full ${activeExtType.includes('PRE') ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />
                                        <div className="flex items-baseline gap-2">
                                            <span className={`text-[11px] font-black uppercase tracking-widest ${activeExtType.includes('PRE') ? 'text-amber-400' : 'text-indigo-400'}`}>
                                                {activeExtLabel}
                                            </span>
                                            <span className="text-xs font-bold text-slate-200 tabular-nums">
                                                ${activeExtPrice.toFixed(2)}
                                            </span>
                                            <span className={`text-[11px] tabular-nums font-bold ${activeExtPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                {activeExtPct > 0 ? "+" : ""}{activeExtPct.toFixed(2)}%
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Mini Sparkline Chart (right side) */}
                        {sparklinePath && (
                            <div className="hidden sm:flex items-center pr-1">
                                <svg width="120" height="32" viewBox="0 0 120 32" className="opacity-70">
                                    <defs>
                                        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={sparklinePath.isUp ? '#10b981' : '#f43f5e'} stopOpacity="0.3" />
                                            <stop offset="100%" stopColor={sparklinePath.isUp ? '#10b981' : '#f43f5e'} stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                    <polygon
                                        points={`0,32 ${sparklinePath.path} 120,32`}
                                        fill="url(#sparkGrad)"
                                    />
                                    <polyline
                                        points={sparklinePath.path}
                                        fill="none"
                                        stroke={sparklinePath.isUp ? '#10b981' : '#f43f5e'}
                                        strokeWidth="1.5"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </div>
                        )}

                        {/* Mobile Price Row */}
                        <div className="flex flex-col gap-2 sm:hidden">
                            <div className="flex items-baseline gap-3">
                                <div className="text-4xl font-black text-white tracking-tighter tabular-nums">
                                    ${displayPrice?.toFixed(2) || '—'}
                                </div>
                                <div className={`text-xl font-bold font-mono tracking-tighter ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
                                    {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Flow Radar Component (EXACT SAME rawChain as COMMAND L1152) */}
                    {loading ? (
                        <div className="space-y-6 animate-pulse">
                            {/* AI VERDICT Skeleton */}
                            <div className="p-6 bg-[#0d1829]/80 rounded-xl border border-white/5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-700" />
                                    <div className="flex-1">
                                        <div className="h-4 w-32 bg-slate-700 rounded mb-2" />
                                        <div className="h-3 w-48 bg-slate-700/50 rounded" />
                                    </div>
                                    <div className="h-8 w-24 bg-cyan-500/20 rounded-lg" />
                                </div>
                                <div className="h-12 bg-slate-700/50 rounded-lg mb-3" />
                                <div className="h-4 bg-slate-700/30 rounded w-3/4" />
                            </div>

                            {/* Options Grid Skeleton */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="p-4 bg-[#0d1829]/80 rounded-xl border border-white/5">
                                        <div className="h-3 w-20 bg-slate-700 rounded mb-3" />
                                        <div className="h-6 w-16 bg-slate-700/70 rounded mb-2" />
                                        <div className="h-3 w-24 bg-slate-700/30 rounded" />
                                    </div>
                                ))}
                            </div>

                            {/* Chart Skeleton */}
                            <div className="p-6 bg-[#0d1829]/80 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="h-4 w-40 bg-slate-700 rounded" />
                                    <div className="flex gap-2">
                                        <div className="h-6 w-16 bg-slate-700/50 rounded" />
                                        <div className="h-6 w-16 bg-slate-700/50 rounded" />
                                    </div>
                                </div>
                                <div className="h-[300px] bg-gradient-to-b from-slate-800/50 to-slate-800/20 rounded-lg flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-cyan-500/50" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <FlowRadar
                                ticker={ticker}
                                rawChain={rawChain}
                                allExpiryChain={allExpiryChain}
                                gammaFlipLevel={gammaFlipLevel}
                                oiPcr={oiPcr}
                                currentPrice={displayPrice}
                                squeezeScore={liveQuote?.flow?.squeezeScore}
                                squeezeRisk={liveQuote?.flow?.squeezeRisk}
                            />
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default function FlowPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            </div>
        }>
            <FlowPageContent />
        </Suspense>
    );
}
