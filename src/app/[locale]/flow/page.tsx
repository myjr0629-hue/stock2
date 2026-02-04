// src/app/[locale]/flow/page.tsx
// FLOW - Options Intelligence Page (FlowRadar with SAME data as COMMAND)
"use client";

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { FlowRadar } from '@/components/FlowRadar';
import { Loader2, RefreshCw } from 'lucide-react';
import { FavoriteToggle } from '@/components/FavoriteToggle';

function FlowPageContent() {
    const searchParams = useSearchParams();
    // Support both ?ticker= and ?t= for cross-page compatibility
    const ticker = searchParams.get('ticker')?.toUpperCase()
        || searchParams.get('t')?.toUpperCase()
        || 'TSLA';

    // EXACT SAME state as LiveTickerDashboard
    const [liveQuote, setLiveQuote] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [quoteLoading, setQuoteLoading] = useState(false);

    // Fetch ticker data (EXACT same API as COMMAND - L236)
    // This API returns flow.rawChain which FlowRadar uses
    const fetchTicker = useCallback(async () => {
        setQuoteLoading(true);
        try {
            const res = await fetch(`/api/live/ticker?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setLiveQuote(data);
                setLoading(false);
            }
        } catch (e) {
            console.error('[Flow] Ticker fetch error:', e);
            setLoading(false);
        } finally {
            setQuoteLoading(false);
        }
    }, [ticker]);

    useEffect(() => {
        setLoading(true);
        setLiveQuote(null);
        fetchTicker();

        // Poll every 10s (same as COMMAND)
        const quoteInterval = setInterval(fetchTicker, 10000);
        return () => clearInterval(quoteInterval);
    }, [ticker, fetchTicker]);

    // =====================================================
    // PRICE DISPLAY LOGIC (EXACT COPY from LiveTickerDashboard L305-417)
    // =====================================================
    const session = liveQuote?.session || 'CLOSED';

    // Main Display Price (L306)
    let displayPrice = liveQuote?.display?.price || liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose || 0;

    // Display Change Percentage (L309)
    let displayChangePct = liveQuote?.display?.changePctPct || 0;

    // POST/CLOSED Override (L312-340)
    if (session === 'POST' || session === 'CLOSED') {
        const regularClose = liveQuote?.prices?.regularCloseToday;
        const prevClose = liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose;

        if (regularClose && regularClose > 0) {
            displayPrice = regularClose;
            const isNewTradingDay = prevClose && Math.abs(regularClose - prevClose) > 0.001;

            if (isNewTradingDay && prevClose > 0) {
                displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
            } else {
                displayChangePct = liveQuote?.prices?.prevChangePct || liveQuote?.display?.changePctPct || 0;
            }
        }
    }

    // PRE Session Override (L347-358)
    if (session === 'PRE') {
        const staticClose = liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose;
        if (staticClose) {
            displayPrice = staticClose;
            displayChangePct = liveQuote?.prices?.prevChangePct ?? 0;
        }
    }

    // Extended Session Badge (L368-417)
    let activeExtPrice = 0;
    let activeExtType = "";
    let activeExtLabel = "";
    let activeExtPct = 0;

    if (session === 'PRE') {
        activeExtPrice = liveQuote?.extended?.prePrice || liveQuote?.prices?.prePrice || 0;
        activeExtType = 'PRE';
        activeExtLabel = 'PRE';
        activeExtPct = liveQuote?.extended?.preChangePct ? liveQuote.extended.preChangePct * 100 : 0;
    } else if (session === 'POST' || session === 'CLOSED') {
        activeExtPrice = liveQuote?.extended?.postPrice || liveQuote?.prices?.postPrice || 0;
        activeExtType = 'POST';
        activeExtLabel = session === 'CLOSED' ? 'POST (CLOSED)' : 'POST';
        if (activeExtPrice > 0 && displayPrice > 0) {
            activeExtPct = ((activeExtPrice - displayPrice) / displayPrice) * 100;
        }
    }

    const isPositive = displayChangePct >= 0;

    // EXACT SAME rawChain source as COMMAND (L1152)
    const rawChain = liveQuote?.flow?.rawChain || [];

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

                    {/* Ticker Header - Sticky below main header */}
                    <div className="sticky top-[78px] z-30 bg-[#0a0f1a]/90 backdrop-blur-md flex flex-col gap-4 pb-6 border-b border-white/10 mb-6">
                        <div className="flex items-end gap-x-6 flex-wrap">
                            {/* Identity Group */}
                            <div className="flex items-center gap-3">
                                <div className="relative w-10 h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                                    <img
                                        src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                        alt={`${ticker} logo`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tighter">{ticker}</h1>
                                        <FavoriteToggle ticker={ticker} />
                                        {quoteLoading && <RefreshCw className="animate-spin text-slate-500" size={14} />}
                                    </div>
                                    <p className="text-sm text-slate-500 font-bold tracking-tight uppercase">
                                        {liveQuote?.name || 'Loading...'}
                                    </p>
                                </div>
                            </div>

                            {/* Main Price (EXACT COMMAND style L465-473) */}
                            <div className="hidden sm:block pb-1">
                                <div className="flex items-baseline gap-3">
                                    <div className="text-2xl lg:text-3xl font-black text-white tracking-tighter tabular-nums">
                                        ${displayPrice?.toFixed(2) || '—'}
                                    </div>
                                    <div className={`text-lg font-bold font-mono tracking-tighter ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
                                        {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                                    </div>
                                </div>
                            </div>

                            {/* Extended Session Badge (L477-497) */}
                            {activeExtPrice > 0 && (
                                <div className="hidden sm:block pb-1.5">
                                    <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md">
                                        <div className={`w-1.5 h-1.5 rounded-full ${activeExtType.includes('PRE') ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />
                                        <div className="flex items-baseline gap-2">
                                            <span className={`text-[9px] font-black uppercase tracking-widest ${activeExtType.includes('PRE') ? 'text-amber-400' : 'text-indigo-400'}`}>
                                                {activeExtLabel}
                                            </span>
                                            <span className="text-xs font-bold text-slate-200 tabular-nums">
                                                ${activeExtPrice.toFixed(2)}
                                            </span>
                                            <span className={`text-[10px] font-mono font-bold ${activeExtPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                {activeExtPct > 0 ? "+" : ""}{activeExtPct.toFixed(2)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

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
                        <div className="flex items-center justify-center h-[600px]">
                            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                        </div>
                    ) : (
                        <div className="min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <FlowRadar
                                ticker={ticker}
                                rawChain={rawChain}
                                currentPrice={displayPrice}
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
