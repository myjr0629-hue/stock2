// src/app/[locale]/flow/page.tsx
// FLOW - Options Intelligence Page (Flow Radar moved from COMMAND)
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { FlowRadar } from '@/components/FlowRadar';
import { Heart, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { FavoriteToggle } from '@/components/FavoriteToggle';

interface QuoteData {
    price: number;
    changePercent: number;
    prevClose: number;
    name?: string;
    flow?: {
        rawChain: any[];
    };
}

export default function FlowPage() {
    const searchParams = useSearchParams();
    const ticker = searchParams.get('ticker')?.toUpperCase() || 'TSLA';

    const [quote, setQuote] = useState<QuoteData | null>(null);
    const [loading, setLoading] = useState(true);
    const [rawChain, setRawChain] = useState<any[]>([]);

    // Fetch quote data
    const fetchQuote = useCallback(async () => {
        try {
            const res = await fetch(`/api/live/quote?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setQuote({
                    price: data.display?.price || data.price || 0,
                    changePercent: data.display?.changePctPct || data.changePercent || 0,
                    prevClose: data.prevClose || 0,
                    name: data.name || ticker,
                });
            }
        } catch (e) {
            console.error('[Flow] Quote fetch error:', e);
        }
    }, [ticker]);

    // Fetch flow/rawChain data
    const fetchFlow = useCallback(async () => {
        try {
            const res = await fetch(`/api/live/options/atm?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setRawChain(data.rawChain || []);
            }
        } catch (e) {
            console.error('[Flow] ATM fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [ticker]);

    useEffect(() => {
        setLoading(true);
        fetchQuote();
        fetchFlow();

        // Polling for live updates
        const interval = setInterval(fetchQuote, 10000);
        return () => clearInterval(interval);
    }, [ticker, fetchQuote, fetchFlow]);

    const displayPrice = quote?.price || 0;
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

                {/* Ticker Header (same style as COMMAND) */}
                <div className="flex items-center gap-6 mb-8">
                    {/* Logo */}
                    <div className="w-14 h-14 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-center overflow-hidden">
                        <img
                            src={`https://financialmodelingprep.com/image-stock/${ticker}.png`}
                            alt={ticker}
                            className="w-10 h-10 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    </div>

                    {/* Ticker Info */}
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-black text-white tracking-tight">{ticker}</h1>
                            <FavoriteToggle ticker={ticker} />
                            <span className="text-xs text-slate-500 uppercase tracking-wider">
                                {quote?.name || 'Loading...'}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <span className="text-2xl font-mono font-bold text-white">
                                ${displayPrice.toFixed(2)}
                            </span>
                            <span className={`flex items-center gap-1 text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                {isPositive ? '+' : ''}{changePct.toFixed(2)}%
                            </span>
                            {quote?.prevClose && (
                                <span className="text-xs text-slate-500">
                                    PRE CLOSE ${quote.prevClose.toFixed(2)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Flow Radar Component (unchanged) */}
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
