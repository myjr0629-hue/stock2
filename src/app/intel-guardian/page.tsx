
"use client";

import React, { useEffect, useState } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Activity, Shield, Zap, AlertTriangle, Layers, ArrowRight, Radio } from "lucide-react";
import SmartMoneyMap from "@/components/guardian/SmartMoneyMap";
import GravityGauge from "@/components/guardian/GravityGauge";
import { TypewriterText } from "@/components/guardian/TypewriterText";
import { RealityCheck } from "@/components/guardian/RealityCheck";
import { useGuardian } from "@/components/guardian/GuardianProvider";
import { VitalsPanel } from "@/components/guardian/VitalsPanel";

// === TYPES ===
interface RLSIResult {
    score: number;
    level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL';
    components: {
        sentimentScore: number;
        momentumScore: number;
        yieldPenalty: number;
        vix: number;
        momentumRaw: number;
        [key: string]: any;
    };
    timestamp: string;
}

interface SectorFlowRate {
    id: string;
    name: string;
    change: number;
    volume: number;
}

interface FlowVector {
    sourceId: string;
    targetId: string;
    strength: number;
    rank: number;
}

interface GuardianVerdict {
    title: string;
    description: string;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

interface GuardianContext {
    rlsi: RLSIResult;
    market?: any;
    sectors: SectorFlowRate[];
    vectors?: FlowVector[];
    verdict: GuardianVerdict;
    divergence?: {
        caseId: string;
        verdictTitle: string;
        verdictDesc: string;
        isDivergent: boolean;
        score: number;
    };
    rvol?: {
        ndx: { rvol: number };
        dow: { rvol: number };
    };
    verdictSourceId: string | null;
    verdictTargetId: string | null;
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    timestamp: string;
}

// === STATIC DATA ===
// Expanded Ticker List for Richer Intel
const SECTOR_TICKERS: Record<string, string[]> = {
    "XLK": ["NVDA", "AAPL", "MSFT", "AVGO", "ORCL"],
    "XLC": ["META", "GOOGL", "NFLX", "DIS", "CMCSA"],
    "XLY": ["AMZN", "TSLA", "HD", "MCD", "NKE"],
    "XLE": ["XOM", "CVX", "COP", "EOG", "SLB"],
    "XLF": ["JPM", "V", "MA", "BAC", "WFC"],
    "XLV": ["LLY", "UNH", "JNJ", "ABBV", "MRK"],
    "XLI": ["GE", "CAT", "HON", "UNP", "UPS"],
    "XLB": ["LIN", "SHW", "FCX", "APD", "ECL"],
    "XLP": ["PG", "COST", "WMT", "KO", "PEP"],
    "XLRE": ["PLD", "AMT", "EQIX", "CCI", "PSA"],
    "XLU": ["NEE", "SO", "DUK", "CEG", "AEP"]
};

export default function GuardianPage() {
    const { data: globalData, loading, refresh } = useGuardian();
    // Map global data to local type if necessary, or just cast
    const data = globalData as GuardianContext | null;
    const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);

    useEffect(() => {
        // Trigger refresh on mount just in case, or rely on Provider's interval
        refresh();
    }, []);

    // Auto-select the 'Target' sector if available and nothing selected
    useEffect(() => {
        if (data?.verdictTargetId && !selectedSectorId) {
            setSelectedSectorId(data.verdictTargetId);
        }
    }, [data?.verdictTargetId, selectedSectorId]);

    const verdict = React.useMemo(() => {
        if (!data || !data.verdict) return {
            title: "SYSTEM INITIALIZING...",
            desc: "ESTABLISHING SECURE CONNECTION TO GUARDIAN NODE...",
            color: "text-slate-500",
            sentiment: "NEUTRAL"
        };

        const v = data.verdict;
        let color = "text-slate-300";
        if (v.sentiment === 'BULLISH') color = "text-emerald-400";
        if (v.sentiment === 'BEARISH') color = "text-rose-400";

        return {
            title: v.title,
            desc: v.description,
            color,
            sentiment: v.sentiment
        };
    }, [data]);

    // Find selected sector data
    const selectedSector = data?.sectors.find(s => s.id === selectedSectorId);
    // Determine Top Tickers
    const topTickers = selectedSectorId ? (SECTOR_TICKERS[selectedSectorId] || []) : [];

    return (
        <div className="min-h-screen bg-[#0a0e14] text-white overflow-hidden">
            <LandingHeader />

            <main className="pt-14 pb-3 px-3 max-w-[2000px] mx-auto h-screen overflow-hidden">

                {/* === PREMIUM LAYOUT === */}
                <div className="h-[calc(100vh-5.5rem)] overflow-hidden flex flex-col gap-3">

                    {/* === TOP ROW: HUD MODULES (12 Cols) === */}
                    <div className="shrink-0 grid grid-cols-12 gap-4 h-36">

                        {/* 1. LIQUIDITY ENGINE (Gauge) - 4 COLS */}
                        <div className="col-span-12 lg:col-span-4 bg-slate-950/60 backdrop-blur-md border border-emerald-500/10 rounded-2xl p-4 shadow-xl shadow-emerald-500/5 relative overflow-hidden flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                            <div className="flex flex-col h-full justify-between z-10 w-1/2">
                                <div>
                                    <div className="text-[10px] font-black text-emerald-400 tracking-widest mb-1 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">RLSI (LIQUIDITY SCORE)</div>
                                    <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500">INTERNAL STRENGTH</div>
                                </div>
                                <div className="mt-2">
                                    {/* DYNAMIC STATUS BADGE */}
                                    <div className={`text-xs font-bold px-2 py-1 rounded inline-block border ${data?.marketStatus === 'GO' ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20' :
                                        data?.marketStatus === 'STOP' ? 'text-rose-400 bg-rose-950/30 border-rose-500/20' :
                                            'text-amber-400 bg-amber-950/30 border-amber-500/20'
                                        }`}>
                                        {data?.verdict?.title || "MARKET IS STABLE"}
                                    </div>
                                </div>
                            </div>
                            <div className="w-48 h-full relative -mr-4 scale-110">
                                <GravityGauge score={data?.rlsi.score || 0} loading={loading} />
                            </div>
                            {/* Decorative Glow */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -z-0 pointer-events-none"></div>
                        </div>

                        {/* 2. TRUTH DETECTOR (Divergence) - 4 COLS */}
                        <div className="col-span-12 lg:col-span-4 bg-slate-950/60 backdrop-blur-md border border-cyan-500/10 rounded-2xl p-4 shadow-xl shadow-cyan-500/5 relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                            <RealityCheck
                                nasdaqChange={data?.market?.nqChangePercent || 0}
                                guardianScore={data?.rlsi.score || 0}
                                divergenceCase={data?.divergence?.caseId as any}
                            />
                            {/* Decorative Glow */}
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -z-0 pointer-events-none"></div>
                        </div>

                        {/* 3. VITALS & FLOW (RVOL) - 4 COLS */}
                        <div className="col-span-12 lg:col-span-4 bg-slate-950/60 backdrop-blur-md border border-indigo-500/10 rounded-2xl p-4 shadow-xl shadow-indigo-500/5 relative overflow-hidden group hover:border-indigo-500/30 transition-all">
                            <VitalsPanel
                                marketStatus={data?.marketStatus || 'WAIT'}
                                mode={data?.divergence?.caseId !== 'N' ? 'HEDGE' : 'STANDARD'}
                                rvol={data?.rvol}
                                loading={loading}
                            />
                            {/* Decorative Glow */}
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -z-0 pointer-events-none"></div>
                        </div>

                    </div>
                    {/* === MAIN ROW: MAP & SIDEBAR === */}
                    <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
                        {/* CENTER: 3D DENSITY RIMEMAP (Expanded to col-span-9) */}
                        <div className="col-span-12 lg:col-span-9 bg-slate-950/40 backdrop-blur-sm border border-white/5 rounded-2xl relative overflow-hidden group hover:border-white/10 transition-all">

                            {/* Header Overlay */}
                            <div className="absolute top-4 left-4 z-10 pointer-events-none">
                                <h3 className="text-xs font-black text-white/70 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    Flow Topography
                                </h3>
                                <div className="text-[10px] text-slate-500 mt-0.5">Real-time Institutional Volume Map</div>
                            </div>

                            <SmartMoneyMap
                                sectors={(data?.sectors || []).map(s => ({
                                    id: s.id,
                                    name: s.name,
                                    density: Math.abs(s.change) * 10,
                                    height: Math.min(1, Math.abs(s.change) / 5),
                                    topTickers: [],
                                    color: s.change >= 0 ? '#10b981' : '#f43f5e'
                                }))}
                                vectors={data?.vectors || []}
                                sourceId={data?.verdictSourceId}
                                targetId={data?.verdictTargetId}
                                onSectorSelect={setSelectedSectorId}
                            />
                        </div>

                        {/* RIGHT SIDEBAR (col-span-3) */}
                        <div className="col-span-12 lg:col-span-3 flex flex-col gap-3 h-full overflow-hidden">

                            {/* Verdict Panel + Stats */}
                            <div className="bg-slate-950/60 backdrop-blur-md border border-rose-500/20 rounded-2xl p-4 shadow-2xl shadow-rose-500/10 flex-shrink-0 hover:border-rose-500/40 transition-all">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 flex justify-between items-center">
                                    <span>TACTICAL VERDICT</span>
                                    <span className="text-[8px] font-mono text-emerald-500/80 bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                                        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                                        Google Gemini 1.5 Flash (Stabilized)
                                    </span>
                                </h3>

                                <div className="mb-4">
                                    <h4 className={`text-xl font-black mb-2 leading-tight ${verdict.color}`}>
                                        {verdict.title}
                                    </h4>
                                    {/* Full Text, No Scroll */}
                                    <div className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                                        <TypewriterText text={verdict.desc} speed={10} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                                    <div>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">VIX</div>
                                        <div className={`text-lg font-mono font-black ${(data?.rlsi.components.vix || 0) > 20 ? 'text-amber-500' : 'text-slate-400'}`}>
                                            {loading ? "..." : data?.rlsi.components.vix.toFixed(2)}
                                        </div>
                                        <div className="text-[8px] text-slate-600">Fear Index</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">MOMENTUM</div>
                                        <div className="text-lg font-mono font-black text-slate-400">
                                            {loading ? "..." : data?.rlsi.components.momentumRaw.toFixed(2)}x
                                        </div>
                                        {/* Explanation for Momentum */}
                                        <div className="text-[8px] text-slate-600">Trend Strength (vs 20d Avg)</div>
                                    </div>
                                    {/* RVOL Removed from here as per user request */}
                                </div>
                            </div>

                            {/* SECTOR INTEL (Replaces Radar) */}
                            <div className="flex-1 bg-slate-950/60 backdrop-blur-md border border-purple-500/20 rounded-2xl p-4 shadow-2xl shadow-purple-500/10 flex flex-col overflow-hidden">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400 mb-3 flex justify-between items-center">
                                    <span>SECTOR INTEL</span>
                                    {selectedSector && <span className="bg-purple-900/50 text-purple-200 px-1.5 py-0.5 rounded text-[9px]">{selectedSector.id}</span>}
                                </h3>

                                {selectedSector ? (
                                    <div className="flex-1 flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                        {/* Header */}
                                        <div>
                                            <div className="text-xl font-black text-white leading-none mb-1">{selectedSector.name}</div>
                                            <div className="flex items-baseline gap-2">
                                                <div className={`text-2xl font-mono font-bold ${selectedSector.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {selectedSector.change > 0 ? '+' : ''}{selectedSector.change.toFixed(2)}%
                                                </div>
                                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">(DAILY CHANGE)</span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 uppercase mt-1 flex flex-col">
                                                <span className="font-bold text-slate-400">Net Flow Volume</span>
                                                <span className="text-[9px] opacity-70">Institutional Money Movement</span>
                                            </div>
                                        </div>

                                        {/* Top Tickers List */}
                                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">
                                                TOP DRIVERS
                                            </div>
                                            <div className="space-y-2">
                                                {topTickers.map((ticker, i) => (
                                                    <a key={ticker} href={`/terminal?t=${ticker}`} target="_self" className="flex items-center justify-between bg-white/5 p-2 rounded border border-white/5 hover:bg-white/10 hover:border-purple-500/30 transition-colors group cursor-pointer block">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 group-hover:text-white">
                                                                {i + 1}
                                                            </div>
                                                            <span className="font-bold text-sm text-slate-200 group-hover:text-purple-300">{ticker}</span>
                                                        </div>
                                                        <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-purple-400" />
                                                    </a>
                                                ))}
                                                {topTickers.length === 0 && (
                                                    <div className="text-xs text-slate-500 italic p-2">
                                                        Top tickers data unavailable for {selectedSector.id}.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-50">
                                        <Layers className="w-12 h-12 mb-3" />
                                        <div className="text-xs text-center font-bold">SELECT A SECTOR<br />ON THE MAP</div>
                                    </div>
                                )}
                            </div>

                            {/* Refresh Button */}
                            <button
                                onClick={() => refresh(true)}
                                disabled={loading}
                                className="w-full h-10 shrink-0 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-xs font-bold text-emerald-400 uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Zap className="w-3 h-3" />
                                {loading ? "REFRESHING..." : "FORCE INTELLIGENCE"}
                            </button>

                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
