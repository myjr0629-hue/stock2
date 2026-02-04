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
    const ticker = searchParams.get('ticker')?.toUpperCase() || 'TSLA';

    // State matching LiveTickerDashboard structure
    const [liveQuote, setLiveQuote] = useState<any>(null);
    const [rawChain, setRawChain] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [quoteLoading, setQuoteLoading] = useState(false);

    // Fetch ticker data (EXACT same API as COMMAND - L236)
    const fetchTicker = useCallback(async () => {
        setQuoteLoading(true);
        try {
            const res = await fetch(`/api/live/ticker?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setLiveQuote(data);
            }
        } catch (e) {
            console.error('[Flow] Ticker fetch error:', e);
        } finally {
            setQuoteLoading(false);
        }
    }, [ticker]);

    // Fetch rawChain (SAME data as COMMAND SSR uses)
    const fetchRawChain = useCallback(async () => {
        try {
            const res = await fetch(`/api/live/options/chain?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setRawChain(data.rawChain || []);
            }
        } catch (e) {
            console.error('[Flow] Chain fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [ticker]);

    useEffect(() => {
        setLoading(true);
        setRawChain([]);
        setLiveQuote(null);
        fetchTicker();
        fetchRawChain();

        const quoteInterval = setInterval(fetchTicker, 10000);
        const chainInterval = setInterval(fetchRawChain, 60000); // Refresh chain every 60s
        return () => {
            clearInterval(quoteInterval);
            clearInterval(chainInterval);
        };
    }, [ticker, fetchTicker, fetchRawChain]);

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

    return (
        <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
            {/* Header Navigation */}
            <LandingHeader />

            {/* Main Content Container */}
            <div className="flex-1 relative overflow-hidden">
                {/* Background Effects (EXACT copy from login/page.tsx L87-92) */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                    <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[150px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-600/25 rounded-full blur-[150px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-purple-600/20 rounded-full blur-[180px]" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
                </div>

                {/* Content (same width as COMMAND: max-w-[1600px]) */}
                <main className="relative z-10 mx-auto max-w-[1600px] w-full px-4 sm:px-6 pt-6 pb-12">

                    {/* Ticker Header (EXACT COMMAND Style) */}
                    <div className="flex flex-col gap-4 pb-6 border-b border-white/10 mb-6">
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

                    {/* Flow Radar Component (SAME rawChain as COMMAND) */}
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
