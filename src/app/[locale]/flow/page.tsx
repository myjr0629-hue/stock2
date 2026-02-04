// src/app/[locale]/flow/page.tsx
// FLOW - Options Intelligence Page (Flow Radar moved from COMMAND)
"use client";

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { FlowRadar } from '@/components/FlowRadar';
import { Loader2, RefreshCw } from 'lucide-react';
import { FavoriteToggle } from '@/components/FavoriteToggle';

interface TickerData {
    price: number;
    changePct: number;
    prevClose: number;
    name: string;
    session: string;
    // Extended session data
    preMarket?: { price: number; changePct: number };
    postMarket?: { price: number; changePct: number };
}

interface StructureData {
    underlyingPrice: number;
    structure: {
        strikes: number[];
        callsOI: number[];
        putsOI: number[];
        callsVol?: number[];
        putsVol?: number[];
    };
}

// Convert structure data to rawChain format for FlowRadar
function convertToRawChain(structure: StructureData): any[] {
    if (!structure?.structure?.strikes) return [];

    const { strikes, callsOI, putsOI, callsVol, putsVol } = structure.structure;
    const rawChain: any[] = [];

    strikes.forEach((strike, i) => {
        // Add call contract
        rawChain.push({
            details: {
                strike_price: strike,
                contract_type: 'call',
                expiration_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            },
            open_interest: callsOI?.[i] || 0,
            day: { volume: callsVol?.[i] || 0 }
        });
        // Add put contract
        rawChain.push({
            details: {
                strike_price: strike,
                contract_type: 'put',
                expiration_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            },
            open_interest: putsOI?.[i] || 0,
            day: { volume: putsVol?.[i] || 0 }
        });
    });

    return rawChain;
}

function FlowPageContent() {
    const searchParams = useSearchParams();
    const ticker = searchParams.get('ticker')?.toUpperCase() || 'TSLA';

    const [tickerData, setTickerData] = useState<TickerData | null>(null);
    const [rawChain, setRawChain] = useState<any[]>([]);
    const [currentPrice, setCurrentPrice] = useState(0);
    const [loading, setLoading] = useState(true);
    const [quoteLoading, setQuoteLoading] = useState(false);

    // Fetch ticker data (same API as COMMAND)
    const fetchTicker = useCallback(async () => {
        setQuoteLoading(true);
        try {
            const res = await fetch(`/api/live/ticker?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                // Extract price the same way as COMMAND
                const price = data.display?.price || data.prices?.regularClose || data.price || 0;
                const changePct = data.display?.changePctPct || data.prices?.regularChangePct || 0;

                setTickerData({
                    price,
                    changePct,
                    prevClose: data.prices?.prevRegularClose || 0,
                    name: data.name || ticker,
                    session: data.session || 'CLOSED',
                    preMarket: data.prices?.prePrice ? {
                        price: data.prices.prePrice,
                        changePct: data.prices.preChangePct || 0
                    } : undefined,
                    postMarket: data.prices?.postPrice ? {
                        price: data.prices.postPrice,
                        changePct: data.prices.postChangePct || 0
                    } : undefined
                });
                setCurrentPrice(price);
            }
        } catch (e) {
            console.error('[Flow] Ticker fetch error:', e);
        } finally {
            setQuoteLoading(false);
        }
    }, [ticker]);

    // Fetch structure data for rawChain
    const fetchStructure = useCallback(async () => {
        try {
            const res = await fetch(`/api/live/options/structure?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                if (data.underlyingPrice) {
                    setCurrentPrice(data.underlyingPrice);
                }
                const chain = convertToRawChain(data);
                setRawChain(chain);
            }
        } catch (e) {
            console.error('[Flow] Structure fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [ticker]);

    useEffect(() => {
        setLoading(true);
        setRawChain([]);
        setTickerData(null);
        fetchTicker();
        fetchStructure();

        // Polling for live updates
        const quoteInterval = setInterval(fetchTicker, 10000);
        const structInterval = setInterval(fetchStructure, 30000);
        return () => {
            clearInterval(quoteInterval);
            clearInterval(structInterval);
        };
    }, [ticker, fetchTicker, fetchStructure]);

    const displayPrice = tickerData?.price || currentPrice || 0;
    const displayChangePct = tickerData?.changePct || 0;
    const isPositive = displayChangePct >= 0;

    // Extended session data
    const activeExtPrice = tickerData?.session === 'PRE'
        ? tickerData.preMarket?.price
        : tickerData?.session === 'POST'
            ? tickerData.postMarket?.price
            : 0;
    const activeExtPct = tickerData?.session === 'PRE'
        ? tickerData.preMarket?.changePct
        : tickerData?.session === 'POST'
            ? tickerData.postMarket?.changePct
            : 0;
    const activeExtLabel = tickerData?.session === 'PRE' ? 'PRE' : 'POST';
    const activeExtType = tickerData?.session || '';

    return (
        <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
            {/* Header Navigation */}
            <LandingHeader />

            {/* Main Content with Background Effects (matching Login Page exactly) */}
            <div className="flex-1 flex flex-col relative overflow-hidden">
                {/* Background Effects (same structure as login/page.tsx L87-92) */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/15 rounded-full blur-[120px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px]" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
                </div>

                {/* Content */}
                <main className="relative z-10 mx-auto max-w-[1600px] w-full px-4 sm:px-6 pt-6 pb-12">

                    {/* Ticker Header (EXACT COMMAND Style - LiveTickerDashboard L436-498) */}
                    <div className="flex flex-col gap-4 pb-6 border-b border-white/10 mb-6">
                        {/* Row 1: Identity & Price & Extended (Inline) */}
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
                                            (e.target as HTMLImageElement).parentElement!.classList.add('hidden');
                                        }}
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tighter">{ticker}</h1>
                                        <FavoriteToggle ticker={ticker} />
                                        {quoteLoading && <RefreshCw className="animate-spin text-slate-500" size={14} />}
                                    </div>
                                    <p className="text-sm text-slate-500 font-bold tracking-tight uppercase">{tickerData?.name || 'Loading...'}</p>
                                </div>
                            </div>

                            {/* Main Price Group (Inline, Reduced Size) */}
                            <div className="hidden sm:block pb-1">
                                <div className="flex items-baseline gap-3">
                                    <div className="text-2xl lg:text-3xl font-black text-white tracking-tighter tabular-nums">
                                        ${displayPrice?.toFixed(2) || '—'}
                                    </div>
                                    <div className={`text-lg font-bold font-mono tracking-tighter ${displayChangePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                        {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                                    </div>
                                </div>
                            </div>

                            {/* Extended Session Badge (Inline with Price) */}
                            {activeExtPrice && activeExtPrice > 0 && (
                                <div className="hidden sm:block pb-1.5">
                                    <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md">
                                        <div className={`w-1.5 h-1.5 rounded-full ${activeExtType.includes('PRE') ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />

                                        <div className="flex flex-col leading-none">
                                            <div className="flex items-baseline gap-2">
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${activeExtType.includes('PRE') ? 'text-amber-400' : 'text-indigo-400'}`}>
                                                    {activeExtLabel}
                                                </span>
                                                <span className="text-xs font-bold text-slate-200 tabular-nums">
                                                    ${activeExtPrice.toFixed(2)}
                                                </span>
                                                <span className={`text-[10px] font-mono font-bold ${(activeExtPct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                    {(activeExtPct || 0) > 0 ? "+" : ""}{(activeExtPct || 0).toFixed(2)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Mobile Only: Price & Extended Row */}
                        <div className="flex flex-col gap-2 sm:hidden">
                            <div className="flex items-baseline gap-3">
                                <div className="text-4xl font-black text-white tracking-tighter tabular-nums">
                                    ${displayPrice?.toFixed(2) || '—'}
                                </div>
                                <div className={`text-xl font-bold font-mono tracking-tighter ${displayChangePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                    {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                                </div>
                            </div>

                            {/* Extended Mobile */}
                            {activeExtPrice && activeExtPrice > 0 && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md w-fit">
                                    <div className={`w-1.5 h-1.5 rounded-full ${activeExtType === 'PRE' ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${activeExtType === 'PRE' ? 'text-amber-400' : 'text-indigo-400'}`}>
                                            {activeExtType === 'PRE' ? 'Pre' : 'Post'}
                                        </span>
                                        <span className="text-sm font-bold text-slate-200 tabular-nums">
                                            ${activeExtPrice.toFixed(2)}
                                        </span>
                                        <span className={`text-xs font-mono font-bold ${(activeExtPct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                            {(activeExtPct || 0) > 0 ? "+" : ""}{(activeExtPct || 0).toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Flow Radar Component */}
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
