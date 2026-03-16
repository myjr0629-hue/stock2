"use client";

// [PERF] SSR Card Preview + CSR Dashboard hybrid
// 1. SSR: CommandSSRCards renders 10 data-filled cards in HTML instantly
// 2. CSR: LiveTickerDashboard loads asynchronously with full interactivity
// 3. When dashboard mounts → SSR preview removed seamlessly

import React, { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { CommandSSRCards } from "./CommandSSRCards";

// Dynamic import with NO loading skeleton — SSR cards serve as the loading UI
const LiveTickerDashboard = dynamic(
    () => import("@/components/LiveTickerDashboard").then(mod => mod.LiveTickerDashboard),
    { ssr: false }
);

interface TickerPageClientProps {
    ticker: string;
    range: string;
    initialStockData: any;
    initialUnifiedData?: any;
    initialChartData?: any;
}

export function TickerPageClient({ ticker, range, initialStockData, initialUnifiedData, initialChartData }: TickerPageClientProps) {
    const [dashboardReady, setDashboardReady] = useState(false);

    const handleDashboardReady = useCallback(() => {
        setDashboardReady(true);
    }, []);

    return (
        <>
            {/* SSR Instant Preview — visible until LiveTickerDashboard fully renders */}
            {!dashboardReady && initialUnifiedData && (
                <div className="w-full max-w-[1600px] mx-auto space-y-4">
                    {/* Header preview with ticker + price */}
                    <div className="bg-white/5 backdrop-blur-xl rounded-xl py-2 px-4 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                        <div className="flex items-center gap-3">
                            <div className="relative w-11 h-11 rounded-full overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
                                <img
                                    loading="eager"
                                    src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                    alt={ticker}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl font-black text-white tracking-tighter font-jakarta">{ticker}</span>
                                <span className="text-xs text-slate-500 font-bold tracking-tight uppercase font-jakarta">{initialStockData?.name || ticker}</span>
                            </div>
                            {initialStockData?.price > 0 && (
                                <div className="ml-auto flex items-baseline gap-3">
                                    <span className="text-3xl font-black text-white tracking-tighter tabular-nums">
                                        ${initialStockData.price.toFixed(2)}
                                    </span>
                                    <span className={`text-lg font-bold font-mono tracking-tighter ${(initialStockData.changePercent || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {(initialStockData.changePercent || 0) > 0 ? '+' : ''}{(initialStockData.changePercent || 0).toFixed(2)}%
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                <span className="text-[12px] font-mono text-indigo-300 font-jakarta">LOADING</span>
                            </div>
                        </div>
                    </div>

                    {/* SSR Data Cards — immediate render with real data */}
                    <CommandSSRCards data={initialUnifiedData} stockData={initialStockData} ticker={ticker} />

                    {/* Chart skeleton placeholder */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                        <div className="lg:col-span-8 h-[320px] lg:h-[520px] rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden relative">
                            <div className="absolute -top-3 left-4 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/30 rounded text-[12px] font-black text-indigo-300 uppercase tracking-widest z-20 backdrop-blur-md shadow-lg flex items-center gap-2 font-jakarta">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> Price History
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                    <span className="text-[12px] font-mono text-slate-400 tracking-wider font-jakarta">LOADING CHART</span>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-4 space-y-4 animate-pulse">
                            <div className="h-[250px] bg-slate-800/20 rounded-lg border border-slate-700/15 p-4">
                                <div className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3 font-jakarta">SIGNAL FEED</div>
                                <div className="space-y-2">
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="h-4 bg-slate-700/20 rounded w-full" style={{ width: `${85 - i * 10}%` }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Full Interactive Dashboard — loads asynchronously */}
            <LiveTickerDashboard
                ticker={ticker}
                initialStockData={initialStockData}
                initialUnifiedData={initialUnifiedData}
                initialChartData={initialChartData}
                initialNews={[]}
                range={range}
                buildId="csr-ssr-hybrid"
                onReady={handleDashboardReady}
            />
        </>
    );
}
