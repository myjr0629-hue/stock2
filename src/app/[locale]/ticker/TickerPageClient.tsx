"use client";

// [PERF V73] ZERO BLANK SCREEN — SSR Card Preview + Skeleton + CSR Dashboard hybrid
// 1. SSR: CommandSSRCards renders 10 data-filled cards instantly (when data exists)
// 2. SKELETON: Premium animated skeleton when SSR data unavailable (NEVER blank)
// 3. CSR: LiveTickerDashboard loads asynchronously with full interactivity
// 4. When dashboard mounts → SSR preview/skeleton removed seamlessly

import React, { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { CommandSSRCards } from "./CommandSSRCards";

// Dynamic import with NO loading skeleton — SSR cards/skeleton serve as the loading UI
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

// Premium skeleton card — matches CommandSSRCards layout exactly
function SkeletonCard({ label }: { label: string }) {
    return (
        <div className="relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] bg-slate-800/40 border border-slate-700/50 transition-all duration-500 backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10 space-y-2">
                <div className="flex items-center gap-1">
                    <div className="w-3.5 h-3.5 bg-slate-700/50 rounded animate-pulse" />
                    <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider font-jakarta">{label}</span>
                </div>
                <div className="h-6 w-20 bg-slate-700/30 rounded animate-pulse" />
                <div className="h-3 w-28 bg-slate-700/20 rounded animate-pulse" />
                <div className="h-2.5 w-36 bg-slate-700/10 rounded animate-pulse" />
            </div>
        </div>
    );
}

const SKELETON_LABELS_ROW1 = ['VOL REGIME', 'CONVICTION', 'VWAP', 'IV SKEW', 'ANALYST'];
const SKELETON_LABELS_ROW2 = ['INST RADAR', 'TREND PHASE', 'FUNDAMENTAL', 'EARNINGS', 'RELATED'];

export function TickerPageClient({ ticker, range, initialStockData, initialUnifiedData, initialChartData }: TickerPageClientProps) {
    const [dashboardReady, setDashboardReady] = useState(false);

    const handleDashboardReady = useCallback(() => {
        setDashboardReady(true);
    }, []);

    const hasData = !!initialUnifiedData;
    const hasPrice = initialStockData?.price > 0;
    const dynamoPrice = initialUnifiedData?._dynamoPrice?.price;
    const showPrice = hasPrice || (dynamoPrice && dynamoPrice > 0);
    const displayPrice = hasPrice ? initialStockData.price : dynamoPrice || 0;
    const displayChange = hasPrice ? (initialStockData.changePercent || 0) : (initialUnifiedData?._dynamoPrice?.changePct || 0);

    return (
        <>
            {/* ═══════════════════════════════════════════════════════════════
                SSR INSTANT PREVIEW — ALWAYS visible until LiveTickerDashboard mounts
                With data: real cards. Without data: premium skeleton. NEVER blank.
                ═══════════════════════════════════════════════════════════════ */}
            {!dashboardReady && (
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
                            {showPrice ? (
                                <div className="ml-auto flex items-baseline gap-3">
                                    <span className="text-3xl font-black text-white tracking-tighter tabular-nums">
                                        ${displayPrice.toFixed(2)}
                                    </span>
                                    <span className={`text-lg font-bold font-mono tracking-tighter ${displayChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {displayChange > 0 ? '+' : ''}{displayChange.toFixed(2)}%
                                    </span>
                                </div>
                            ) : (
                                <div className="ml-auto flex items-baseline gap-3 animate-pulse">
                                    <div className="h-8 w-28 bg-slate-700/30 rounded" />
                                    <div className="h-5 w-16 bg-slate-700/20 rounded" />
                                </div>
                            )}
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                <span className="text-[12px] font-mono text-indigo-300 font-jakarta">LOADING</span>
                            </div>
                        </div>
                    </div>

                    {/* Cards: real data OR premium skeleton — NEVER blank */}
                    {hasData ? (
                        <CommandSSRCards data={initialUnifiedData} stockData={initialStockData} ticker={ticker} />
                    ) : (
                        <div className="relative -mt-4 mb-3" id="ssr-skeleton-preview">
                            <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 30%, rgba(99,102,241,0.06) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(16,185,129,0.04) 0%, transparent 50%)' }} />
                            <div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1.5">
                                {SKELETON_LABELS_ROW1.map(label => <SkeletonCard key={label} label={label} />)}
                                {SKELETON_LABELS_ROW2.map(label => <SkeletonCard key={label} label={label} />)}
                            </div>
                        </div>
                    )}

                    {/* Chart skeleton placeholder */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                        <div className="lg:col-span-8 h-[320px] lg:h-[520px] rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden relative">
                            <div className="absolute -top-3 left-4 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/30 rounded text-[12px] font-black text-indigo-300 uppercase tracking-widest z-20 backdrop-blur-md shadow-lg flex items-center gap-2 font-jakarta">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> Price History
                            </div>
                            {/* Decorative fake chart lines */}
                            <div className="absolute inset-0 flex flex-col justify-between px-8 py-12 pointer-events-none">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="w-full h-px bg-white/[0.03]" />
                                ))}
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                    <span className="text-[12px] font-mono text-slate-400 tracking-wider font-jakarta">LOADING CHART</span>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-4 space-y-4">
                            <div className="h-[250px] bg-slate-800/20 rounded-lg border border-slate-700/15 p-4 animate-pulse">
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
