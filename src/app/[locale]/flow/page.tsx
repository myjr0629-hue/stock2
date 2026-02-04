// src/app/[locale]/flow/page.tsx
// FLOW - Options Intelligence Page (Flow Radar moved from COMMAND)
"use client";

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { FlowRadar } from '@/components/FlowRadar';
import { TrendingUp, TrendingDown, Loader2, RefreshCw } from 'lucide-react';
import { FavoriteToggle } from '@/components/FavoriteToggle';

interface QuoteData {
    price: number;
    changePercent: number;
    prevClose: number;
    name?: string;
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
                expiration_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Assume 7 DTE
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

    const [quote, setQuote] = useState<QuoteData | null>(null);
    const [rawChain, setRawChain] = useState<any[]>([]);
    const [currentPrice, setCurrentPrice] = useState(0);
    const [loading, setLoading] = useState(true);
    const [quoteLoading, setQuoteLoading] = useState(false);

    // Fetch quote data
    const fetchQuote = useCallback(async () => {
        setQuoteLoading(true);
        try {
            const res = await fetch(`/api/live/quote?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setQuote({
                    price: data.display?.price || data.price || 0,
                    changePercent: data.display?.changePctPct || data.changePercent || 0,
                    prevClose: data.prevClose || data.prices?.prevRegularClose || 0,
                    name: data.name || ticker,
                });
                setCurrentPrice(data.display?.price || data.price || 0);
            }
        } catch (e) {
            console.error('[Flow] Quote fetch error:', e);
        } finally {
            setQuoteLoading(false);
        }
    }, [ticker]);

    // Fetch structure data and convert to rawChain
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
        fetchQuote();
        fetchStructure();

        // Polling for live updates
        const quoteInterval = setInterval(fetchQuote, 10000);
        const structInterval = setInterval(fetchStructure, 30000);
        return () => {
            clearInterval(quoteInterval);
            clearInterval(structInterval);
        };
    }, [ticker, fetchQuote, fetchStructure]);

    const displayPrice = quote?.price || currentPrice || 0;
    const changePct = quote?.changePercent || 0;
    const isPositive = changePct >= 0;

    return (
        <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
            {/* Header Navigation */}
            <LandingHeader />

            {/* Background Effects (same as login page) */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px]" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/15 rounded-full blur-[120px]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
            </div>

            {/* Main Content */}
            <main className="relative z-10 mx-auto max-w-7xl w-full px-6 lg:px-8 pt-20 pb-12">

                {/* Ticker Header (COMMAND Style Match) */}
                <div className="flex flex-col gap-4 pb-6 border-b border-white/10 mb-6">
                    {/* Row 1: Identity & Price (Inline) */}
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
                                <p className="text-sm text-slate-500 font-bold tracking-tight uppercase">{quote?.name || 'Loading...'}</p>
                            </div>
                        </div>

                        {/* Main Price Group */}
                        <div className="hidden sm:block pb-1">
                            <div className="flex items-baseline gap-3">
                                <div className="text-2xl lg:text-3xl font-black text-white tracking-tighter tabular-nums">
                                    ${displayPrice?.toFixed(2) || '—'}
                                </div>
                                <div className={`text-lg font-bold font-mono tracking-tighter ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
                                    {isPositive ? "+" : ""}{changePct?.toFixed(2)}%
                                </div>
                            </div>
                        </div>

                        {/* POST/PRE Session Badge */}
                        {quote?.prevClose && quote.prevClose > 0 && (
                            <div className="hidden sm:block pb-1.5">
                                <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                        PREV CLOSE
                                    </span>
                                    <span className="text-xs font-bold text-slate-200 tabular-nums">
                                        ${quote.prevClose.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mobile Only: Price Row */}
                    <div className="flex flex-col gap-2 sm:hidden">
                        <div className="flex items-baseline gap-3">
                            <div className="text-4xl font-black text-white tracking-tighter tabular-nums">
                                ${displayPrice?.toFixed(2) || '—'}
                            </div>
                            <div className={`text-xl font-bold font-mono tracking-tighter ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
                                {isPositive ? "+" : ""}{changePct?.toFixed(2)}%
                            </div>
                        </div>
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
