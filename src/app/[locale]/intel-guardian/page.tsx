
"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Activity, Shield, Zap, AlertTriangle, Layers, ArrowRight, Radio } from "lucide-react";
import { TradingViewTicker } from "@/components/TradingViewTicker";

import SmartMoneyMap from "@/components/guardian/SmartMoneyMap";
import GravityGauge from "@/components/guardian/GravityGauge";
import { TypewriterText } from "@/components/guardian/TypewriterText";
import { RealityCheck } from "@/components/guardian/RealityCheck";
import { useGuardian } from "@/components/guardian/GuardianProvider";
import { VitalsPanel } from "@/components/guardian/VitalsPanel";
import { OracleHeader } from "@/components/guardian/OracleHeader";

// === TYPES ===
interface RLSIResult {
    score: number;
    level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL';
    session?: 'PRE' | 'REG' | 'POST' | 'CLOSED'; // [V5.0] Session indicator
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
    topConstituents?: { symbol: string; price: number; change: number; volume: number }[];
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
    realityInsight?: string;
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
    tripleA?: {
        regime: 'BULL' | 'BEAR' | 'NEUTRAL';
        alignment: boolean;
        acceleration: boolean;
        accumulation: boolean;
        isTargetLock: boolean;
        checklist?: {
            passedCount: number;
            totalCount: number;
            message: string;
        };
    };
    verdictSourceId: string | null;
    verdictTargetId: string | null;
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    timestamp: string;
}

export default function GuardianPage() {
    const { data: globalData, loading, refresh } = useGuardian();
    const t = useTranslations('guardian');
    // Map global data to local type if necessary, or just cast
    const data = globalData as GuardianContext | null;
    const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);

    // useEffect removed to prevent double-fetch (Provider handles it)

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
            sentiment: v.sentiment,
            realityInsight: v.realityInsight
        };
    }, [data]);

    // Find selected sector data
    const selectedSector = data?.sectors.find(s => s.id === selectedSectorId);

    // Determine Movers (Use dynamic data or empty)
    const topMovers = selectedSector?.topConstituents || [];

    // [V3.0] Regime Logic
    const isTargetLocked = data?.tripleA?.isTargetLock || false;
    const regime = data?.tripleA?.regime || 'NEUTRAL';
    const isBullMode = regime === 'BULL';

    // Dynamic Map Border
    const mapBorderClass = isTargetLocked
        ? "border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.3)] animate-pulse" // Locked (Gold)
        : isBullMode
            ? "border-emerald-500/30"
            : "border-slate-800";



    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30 overflow-y-auto">
            <LandingHeader />

            {/* MACRO TICKER (Engine Data) */}
            {/* VISUAL TRACK: TRADINGVIEW WIDGET (User Request) */}
            <div className="fixed top-12 left-0 right-0 z-40 shadow-lg shadow-black/20">
                <TradingViewTicker key="v4-debug-force" />
            </div>
            {/* Spacer to prevent content overlap */}
            <div className="h-[28px]"></div>



            {/* ORACLE HEADER (Sticky below Nav) */}
            <div>
                <OracleHeader
                    nasdaq={data?.market?.nqChangePercent || 0}
                    rlsi={data?.rlsi.score || 0}
                    verdictTitle={verdict.title}
                    isDivergent={data?.divergence?.isDivergent || false}
                    timestamp={data?.timestamp || ""}
                />
            </div>

            {/* MAIN HUD CONTAINER */}
            <main className="pb-4 px-4 min-h-[calc(100vh-110px)] max-w-[1920px] mx-auto flex flex-col gap-4 mt-4">

                {/* --- TOP ROW: GAUGE | REALITY | MAP | VERDICT (GRID) --- */}
                {/* 
                    Layout Strategy based on Mockup:
                    The Mockup shows a complex grid.
                    Let's use a Dashboard Grid architecture.
                    
                    Row 1 (Top): Gravity Gauge (Left), Reality Check (Right Top)
                    Row 2 (Mid): Flow Map (Left Big), Tactical Verdict (Right)
                    Row 3 (Bot): Sector Intel (Left), Actions (Right)
                    
                    Actually, looking at the image:
                    Top Left: Gravity Gauge
                    Top Right: Reality Check
                    Mid Left: Flow Map
                    Mid Right: Tactical Verdict
                    Bot Left: Sector Intel
                    Bot Right: Login/Force (Control Bar)
                */}

                <div className="flex-1 grid grid-cols-12 grid-rows-[auto_1fr_30px] gap-4 min-h-0">

                    {/* BLOCK A: GAUGE (Top Left - 4 cols) */}
                    <div className="col-span-12 lg:col-span-4 bg-[#0a0e14] border border-slate-800 rounded-lg p-6 relative shadow-2xl flex flex-col justify-center">
                        {/* Sci-Fi Corner Decors */}
                        <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-slate-600"></div>
                        <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-slate-600"></div>
                        <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-slate-600"></div>
                        <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-slate-600"></div>

                        <GravityGauge score={data?.rlsi.score || 0} loading={loading} session={data?.rlsi.session} />

                        {/* Scanline Overlay */}
                        <div className="absolute inset-0 bg-[url('/scanline.png')] opacity-5 pointer-events-none"></div>
                    </div>

                    {/* BLOCK B: REALITY CHECK (Top Right - 8 cols) - VIX/DXY now inline in header */}
                    <div className="col-span-12 lg:col-span-8 bg-[#0a0e14]/80 backdrop-blur-md border border-slate-800 rounded-lg p-3 relative shadow-2xl flex flex-col justify-center">
                        <RealityCheck
                            nasdaqChange={data?.market?.nqChangePercent || 0}
                            guardianScore={data?.rlsi.score || 0}
                            divergenceCase={data?.divergence?.caseId as "N" | "A" | "B" | "C" | "D" | undefined}
                            rvolNdx={data?.rvol?.ndx?.rvol || 1.0}
                            rvolDow={data?.rvol?.dow?.rvol || 1.0}
                            verdict={{
                                title: "MARKET ESSENCE",
                                desc: verdict.realityInsight || "Gathering Pulse...",
                                sentiment: verdict.sentiment as 'BULLISH' | 'BEARISH' | 'NEUTRAL'
                            }}
                        />
                    </div>

                    {/* ROW 2: SPLIT (MAP vs INTELLIGENCE STACK) */}

                    {/* LEFT: MAP (Cols 1-8) */}
                    <div className={`col-span-12 lg:col-span-8 bg-[#0a0e14] border rounded-lg relative overflow-hidden group flex flex-col transition-all duration-500 ${mapBorderClass}`}>
                        <div className="absolute top-6 left-6 z-10">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-2 inline-block">
                                Flow Topography Map v3.0
                            </h3>
                        </div>

                        {/* [V3.0] TARGET LOCK HOLOGRAM OVERLAY - Positioned at bottom, slow animation */}
                        {isTargetLocked && (
                            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center select-none">
                                {/* Subtle Crosshair - smaller, behind text */}
                                <div className="absolute w-[180px] h-[180px] border border-amber-500/15 rounded-full animate-[spin_12s_linear_infinite]" />
                                <div className="absolute w-[120px] h-[120px] border border-dashed border-amber-500/25 rounded-full animate-[spin_6s_linear_infinite_reverse]" />

                                <div className="text-2xl font-black text-amber-400 tracking-[0.15em] animate-[pulse_3s_ease-in-out_infinite] drop-shadow-[0_0_20px_rgba(245,158,11,0.6)] whitespace-nowrap">
                                    TARGET LOCKED
                                </div>
                                <div className="text-[10px] text-amber-200 tracking-[0.5em] mt-2 uppercase font-bold bg-black/60 px-3 py-1 rounded border border-amber-500/30">
                                    TRIPLE-A SEQUENCE ENGAGED
                                </div>
                            </div>
                        )}

                        <div className="flex-1 relative">
                            <SmartMoneyMap
                                sectors={(data?.sectors || []).map(s => ({
                                    id: s.id,
                                    name: s.name,
                                    density: s.change,
                                    height: Math.min(2.5, Math.abs(s.change)), // Allow more dynamic height range
                                    topTickers: [],
                                    color: s.change >= 0 ? '#10b981' : '#f43f5e'
                                }))}
                                vectors={data?.vectors || []}
                                sourceId={data?.verdictSourceId}
                                targetId={data?.verdictTargetId}
                                onSectorSelect={setSelectedSectorId}
                                isBullMode={isBullMode}
                            />
                        </div>
                    </div>

                    {/* RIGHT: INTELLIGENCE STACK (Cols 9-12) */}
                    <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 min-w-0 h-full">

                        {/* 1. TACTICAL VERDICT (Compact, Top) */}
                        <div className="bg-[#0a0e14] border border-slate-800 rounded-lg p-5 relative flex flex-col shadow-2xl flex-none">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
                                    TACTICAL VERDICT
                                </h3>
                                <span className="text-[9px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                                    V.2.5 FLASH
                                </span>
                            </div>

                            <div className="overflow-hidden mb-2">
                                <h4 className={`text-sm font-bold mb-2 uppercase tracking-wide ${verdict.color}`}>{verdict.title}</h4>
                                <div className="text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-wrap opacity-90">
                                    <TypewriterText text={verdict.desc} speed={10} />
                                </div>
                            </div>

                            {/* COMPACT METRICS */}
                            <div className="mt-auto pt-3 border-t border-slate-800 grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-[9px] text-white font-bold mb-0.5 tracking-wider">MOMENTUM</div>
                                    <div className="text-sm font-mono font-bold text-emerald-400">
                                        {((data?.rlsi.components.momentumRaw || 1) - 1) * 100 > 0 ? "+" : ""}
                                        {(((data?.rlsi.components.momentumRaw || 1) - 1) * 100).toFixed(1)}%
                                    </div>
                                    <div className="text-[9px] text-white font-bold mt-1 tracking-wide opacity-90">3-DAY VELOCITY</div>
                                </div>
                                <div>
                                    <div className="text-[9px] text-white font-bold mb-0.5 tracking-wider">TARGET LOCK</div>
                                    <div className={`text-sm font-mono font-bold ${data?.tripleA?.isTargetLock ? "text-amber-400 animate-pulse" : "text-white"}`}>
                                        {data?.tripleA?.isTargetLock ? "LOCKED" : "SEARCHING"}
                                    </div>
                                    <div className="text-[9px] text-white font-bold mt-1 tracking-wide opacity-90">
                                        {data?.tripleA?.regime || "NEUTRAL"} REGIME
                                    </div>
                                    <div className={`text-[8px] font-medium mt-0.5 tracking-tight ${data?.tripleA?.regime === 'BULL' ? "text-emerald-400" :
                                        data?.tripleA?.regime === 'BEAR' ? "text-rose-400" : "text-white"
                                        }`}>
                                        {data?.tripleA?.regime === 'BULL' ? t('bullRegime') :
                                            data?.tripleA?.regime === 'BEAR' ? t('bearRegime') :
                                                t('neutralRegime')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. SECTOR INTEL (Fill Rest, Bottom) */}
                        <div className="flex-1 bg-[#0a0e14] border border-slate-800 rounded-lg p-6 relative shadow-2xl flex flex-col min-h-0">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-4 border-b border-cyan-900/30 pb-2 flex-none">
                                SECTOR INTEL {selectedSector && <span className="text-slate-500 font-mono opacity-50 ml-2">:: {selectedSector.id}</span>}
                            </h3>

                            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                                {selectedSector ? (
                                    <div className="h-full flex flex-col">
                                        <div className="flex justify-between items-baseline mb-4 flex-none">
                                            <span className="text-lg font-bold text-white">{selectedSector.name}</span>
                                            <span className={`text-xl font-mono ${selectedSector.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                {selectedSector.change > 0 ? "+" : ""}{selectedSector.change.toFixed(2)}%
                                            </span>
                                        </div>

                                        {/* LIVE TICKER TABLE */}
                                        <div className="space-y-1">
                                            {topMovers.length > 0 ? (
                                                topMovers.map(stock => (
                                                    <a key={stock.symbol} href={`/ticker?ticker=${stock.symbol}`} className="flex items-center justify-between text-xs py-2 px-2 rounded hover:bg-slate-800/50 border border-transparent hover:border-slate-700/50 transition-all group">
                                                        {/* Left: Logo & Symbol */}
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 relative">
                                                                <span className="text-[7px] font-bold text-slate-500 absolute">{stock.symbol.substring(0, 2)}</span>
                                                                <img
                                                                    src={`https://financialmodelingprep.com/image-stock/${stock.symbol}.png`}
                                                                    alt={stock.symbol}
                                                                    className="w-full h-full object-contain relative z-10"
                                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                />
                                                            </div>
                                                            <span className="font-bold text-slate-200 group-hover:text-cyan-300 w-10">{stock.symbol}</span>
                                                        </div>

                                                        {/* Right: Data */}
                                                        <div className="text-right">
                                                            <div className="text-slate-200 font-mono">${stock.price.toFixed(2)}</div>
                                                            <div className={`text-[10px] font-bold ${stock.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                                {stock.change > 0 ? "+" : ""}{stock.change.toFixed(2)}%
                                                            </div>
                                                        </div>
                                                    </a>
                                                ))
                                            ) : (
                                                <div className="text-xs text-slate-500 py-2 text-center">Loading live data...</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-xs text-slate-600">
                                        <Layers className="w-8 h-8 opacity-20 mb-2" />
                                        SELECT A SECTOR ON MAP
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                </div>
            </main>
        </div>
    );
}
