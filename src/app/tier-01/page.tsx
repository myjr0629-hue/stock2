"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LandingHeader } from "@/components/landing/LandingHeader";
import {
    AlertCircle, TrendingUp, TrendingDown, Activity,
    ChevronRight, Shield, Clock, Zap, DollarSign,
    BarChart3, Target, XCircle, CheckCircle, AlertTriangle,
    Lock, Unlock, Eye, ArrowUpRight, ArrowDownRight,
    Search, Layers
} from "lucide-react";

// ============================================================================
// TYPES (vNext Unified Evidence Model)
// ============================================================================

export interface UnifiedOptions {
    status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'PENDING' | 'FAILED';
    coveragePct: number;
    gammaRegime: string; // "Long Gamma" | "Short Gamma" | "Neutral"
    gex: number;
    pcr: number;
    callWall: number;
    putFloor: number;
    pinZone: number;
    maxPain: number;
    oiClusters: {
        callsTop: number[];
        putsTop: number[];
    };
    backfilled: boolean;
    fetchedAtET?: string;
}

export interface UnifiedFlow {
    vol: number;
    relVol: number;
    gapPct: number;
    largeTradesUsd: number;
    offExPct: number;
    offExDeltaPct: number;
    backfilled: boolean;
    fetchedAtET?: string;
}

export interface UnifiedPrice {
    last: number;
    prevClose: number;
    changePct: number;
    vwap: number;
    vwapDistPct: number;
    rsi14: number;
    return3D: number;
    structureState: 'BREAKOUT' | 'BREAKDOWN' | 'CONSOLIDATION' | 'TRENDING' | 'REVERSAL';
    fetchedAtET?: string;
}

export interface UnifiedStealth {
    label: 'A' | 'B' | 'C';
    tags: string[];
    impact: 'BOOST' | 'WARN' | 'NEUTRAL';
    lastSeenET?: string;
}

export interface UnifiedEvidence {
    price: UnifiedPrice;
    flow: UnifiedFlow;
    options: UnifiedOptions;
    macro: any; // Context-heavy, keep flexible
    policy: {
        gate: {
            P0: string[];
            P1: string[];
            P2: string[];
            blocked: boolean;
        };
        gradeA_B_C_counts: { A: number; B: number; C: number };
        fetchedAtET?: string;
    };
    stealth: UnifiedStealth;
}

export interface TickerItem {
    ticker: string;
    evidence: UnifiedEvidence; // MANDATORY SSOT

    // Legacy / Convenience (Frontend Calculated or Passthrough)
    symbol?: string; // alias to ticker
    alphaScore?: number;
    qualityTier?: "ACTIONABLE" | "WATCH" | "FILLER";

    // Legacy Decision & Execution (Maintain Backward Compat)
    decisionSSOT?: {
        action: string;
        confidencePct: number;
        triggersKR: string[];
    };
    entryBand?: { low: number; high: number };
    hardCut?: number;
    tp1?: number;
    tp2?: number;

    // UI State
    isLoading?: boolean;
}

interface EvidenceCard {
    id: string;
    title: string;
    titleKR: string;
    meaning: string;
    interpretation: string;
    action: string;
    confidence: "A" | "B" | "C";
    icon: React.ReactNode;
    status: "BULLISH" | "NEUTRAL" | "BEARISH" | "PENDING";
    // Metadata for vNext
    meta?: {
        fetchedAtET?: string;
        source?: string;
        ttl?: number;
    }
}

interface GateStatus {
    price: boolean;
    options: boolean;
    macro: boolean;
    event: boolean;
    policy: boolean;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const Skeleton = ({ className }: { className: string }) => (
    <div className={`animate-pulse bg-slate-800/50 rounded ${className}`} />
);

const ScoreBreakdown = ({ evidence, item }: { evidence: UnifiedEvidence, item: TickerItem }) => {
    // [9.1] Transparency: Use real decomposition if available
    const decomp = (item as any).scoreDecomposition || {
        momentum: 0,
        options: 0,
        structure: 0,
        regime: 0,
        risk: 0
    };

    const hasDecomp = (item as any).scoreDecomposition;
    const score = item.alphaScore || 0;

    // Helper for bar width/color
    const getBarParams = (val: number, max: number, colorClass: string) => {
        const pct = Math.min(100, Math.max(0, (val / max) * 100));
        return { width: `${pct}%`, className: `${colorClass} ${val === 0 ? 'opacity-30' : ''}` };
    };

    return (
        <div className="w-full space-y-2 select-none group">
            <div className="flex justify-between items-end">
                <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                    Alpha Contribution
                    <div className="hidden group-hover:flex absolute z-50 bg-slate-800 border border-slate-700 p-2 rounded shadow-xl -mt-8 ml-24 text-[10px] text-slate-300 w-48 flex-col gap-1">
                        <div className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Scoring Factors (Alpha 2.0)</div>
                        <div className="flex justify-between"><span>Momentum:</span> <span className="font-mono text-emerald-400">Price + Vol Surge</span></div>
                        <div className="flex justify-between"><span>Options:</span> <span className="font-mono text-sky-400">PCR + OI Heat</span></div>
                        <div className="flex justify-between"><span>Structure:</span> <span className="font-mono text-indigo-400">GEX + Walls</span></div>
                        <div className="flex justify-between"><span>Regime:</span> <span className="font-mono text-amber-400">Macro + VIX</span></div>
                        <div className="flex justify-between"><span>Risk:</span> <span className="font-mono text-rose-400">RSI + Variance</span></div>
                    </div>
                    <Search className="w-3 h-3 text-slate-600" />
                </span>
                <span className="text-[10px] font-mono font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                    {score.toFixed(1)} <span className="text-slate-500">/ 100</span>
                </span>
            </div>

            {hasDecomp ? (
                <div className="grid grid-cols-5 gap-0.5 h-2 w-full rounded-sm overflow-hidden bg-slate-800/50">
                    <div className={`h-full bg-emerald-500 transition-all duration-500`} style={{ width: `${(decomp.momentum / 20) * 100}%` }} title={`Momentum: ${decomp.momentum}/20`} />
                    <div className={`h-full bg-sky-500 transition-all duration-500`} style={{ width: `${(decomp.options / 20) * 100}%` }} title={`Options: ${decomp.options}/20`} />
                    <div className={`h-full bg-indigo-500 transition-all duration-500`} style={{ width: `${(decomp.structure / 20) * 100}%` }} title={`Structure: ${decomp.structure}/20`} />
                    <div className={`h-full bg-amber-500 transition-all duration-500`} style={{ width: `${(decomp.regime / 20) * 100}%` }} title={`Regime: ${decomp.regime}/20`} />
                    <div className={`h-full bg-purple-500 transition-all duration-500`} style={{ width: `${(decomp.risk / 20) * 100}%` }} title={`Risk: ${decomp.risk}/20`} />
                </div>
            ) : (
                <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-slate-800">
                    <div style={{ width: '25%' }} className={`bg-emerald-500/80 ${score < 20 ? 'opacity-30' : ''}`} title="Price Est." />
                    <div style={{ width: '25%' }} className={`bg-sky-500/80 ${score < 40 ? 'opacity-30' : ''}`} title="Options Est." />
                    <div style={{ width: '20%' }} className={`bg-indigo-500/80 ${score < 60 ? 'opacity-30' : ''}`} title="Flow Est." />
                    <div style={{ width: '15%' }} className={`bg-amber-500/80 ${score < 80 ? 'opacity-30' : ''}`} title="Macro Est." />
                    <div style={{ width: '15%' }} className={`bg-purple-500/80 ${score < 90 ? 'opacity-30' : ''}`} title="Stealth Est." />
                </div>
            )}

            {hasDecomp && (
                <div className="grid grid-cols-5 text-[9px] text-slate-500 font-mono text-center opacity-70">
                    <span>MOM</span>
                    <span>OPT</span>
                    <span>STR</span>
                    <span>RGM</span>
                    <span>RSK</span>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// STYLES & UTILS
// ============================================================================
const getRegimeColor = (regime?: string) => {
    if (regime === "RISK_ON") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    if (regime === "RISK_OFF") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
    return "text-amber-400 bg-amber-500/10 border-amber-500/20";
};

const getRegimeText = (regime?: string) => {
    if (regime === "RISK_ON") return "RISK-ON";
    if (regime === "RISK_OFF") return "RISK-OFF";
    return "NEUTRAL";
};

const getTierStyle = (tier?: string) => {
    if (tier === "ACTIONABLE") return "text-emerald-400 border border-emerald-500/30 bg-emerald-500/5";
    if (tier === "WATCH") return "text-slate-300 border border-slate-700 bg-slate-800/50";
    return "text-slate-500 border border-slate-800 bg-transparent";
};

const getOptionsStatus = (status?: string) => {
    if (status === "OK" || status === "READY" || status === "BULLISH" || status === "BEARISH" || status === "NEUTRAL") return { label: "OK", color: "bg-emerald-500" };
    if (status === "PARTIAL") return { label: "PARTIAL", color: "bg-amber-500" };
    if (status === "FAILED") return { label: "ERR", color: "bg-rose-500" };
    if (status === "PENDING") return { label: "PENDING", color: "bg-slate-500 animate-pulse" };
    return { label: "UNK", color: "bg-slate-700" };
};

const getActionStyle = (action?: string) => {
    if (action === "ENTER" || action === "STRONG_BUY") return "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
    if (action === "MAINTAIN") return "text-sky-400 bg-sky-500/10 border border-sky-500/20";
    if (action === "EXIT" || action === "REPLACE") return "text-rose-400 bg-rose-500/10 border border-rose-500/20";
    if (action === "NO_TRADE") return "text-slate-400 bg-slate-800 border border-slate-700";
    return "text-amber-400 bg-amber-500/10 border border-amber-500/20";
};

// ============================================================================
// COMPONENTS
// ============================================================================

// Gate Badge: Text + Dot (Minimalist)
function GateBadge({ label, pass }: { label: string; pass: boolean }) {
    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border border-transparent ${pass ? "text-slate-300" : "text-rose-400 bg-rose-500/10 border-rose-500/20"
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${pass ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="uppercase tracking-wider">{label}</span>
        </div>
    );
}

// Evidence Card: Professional Header + Grid Layout
function EvidenceCardUI({ card }: { card: EvidenceCard }) {
    const statusColor = {
        BULLISH: "text-emerald-400",
        BEARISH: "text-rose-400",
        NEUTRAL: "text-amber-400",
        PENDING: "text-slate-400"
    }[card.status];

    return (
        <div className="bg-slate-900 border border-slate-800 rounded p-4 h-full flex flex-col hover:border-slate-700 transition-colors relative overflow-hidden group">
            {/* Header */}
            <div className="flex items-start justify-between mb-4 border-b border-slate-800/50 pb-3 z-10 relative">
                <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded bg-slate-800 ${statusColor}`}>
                        {React.cloneElement(card.icon as React.ReactElement<{ className?: string }>, { className: "w-4 h-4" })}
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <h4 className="text-sm font-bold text-slate-200 tracking-tight">{card.titleKR}</h4>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{card.title}</span>
                        </div>
                        {/* vNext Meta Display (Subtle) */}
                        {card.meta?.fetchedAtET && (
                            <div className="hidden group-hover:block text-[9px] text-slate-600 font-mono mt-0.5">
                                Updated: {card.meta.fetchedAtET}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${card.confidence === "A" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" :
                        card.confidence === "B" ? "text-amber-400 border-amber-500/20 bg-amber-500/5" :
                            "text-slate-500 border-slate-700 bg-slate-800"
                        }`}>
                        GR.{card.confidence}
                    </span>
                </div>
            </div>

            {/* Body: 3-Row Data Grid */}
            <div className="flex-1 space-y-3 z-10 relative">
                <div className="grid grid-cols-[3rem_1fr] gap-2 items-baseline">
                    <span className="text-[10px] text-slate-500 font-medium text-right">의미</span>
                    <span className="text-[11px] text-slate-400 leading-tight">{card.meaning}</span>
                </div>
                <div className="grid grid-cols-[3rem_1fr] gap-2 items-baseline">
                    <span className="text-[10px] text-slate-500 font-medium text-right">해석</span>
                    <span className="text-[12px] text-slate-200 font-medium tabular-nums leading-tight tracking-tight">
                        {card.interpretation}
                    </span>
                </div>
                <div className="grid grid-cols-[3rem_1fr] gap-2 items-baseline">
                    <span className="text-[10px] text-slate-500 font-medium text-right">행동</span>
                    <span className={`text-[12px] font-bold ${statusColor}`}>
                        {card.action}
                    </span>
                </div>
            </div>
        </div>
    );
}

// Top3 Execution Card: Simplified, cleaner typography
function Top3Card({ item, rank }: { item: TickerItem; rank: number }) {
    const action = item.decisionSSOT?.action || "CAUTION";
    const isNoTrade = action === "NO_TRADE" || action === "EXIT";
    const ev = item.evidence; // SSOT shortcut

    // vNext Price Logic
    const price = ev?.price?.last || 0;
    const changePct = ev?.price?.changePct || 0;

    return (
        <div className={`relative bg-slate-900 border rounded p-4 ${isNoTrade ? "border-slate-800 opacity-70" : "border-slate-800 hover:border-slate-600 transition-colors"}`}>
            {/* Rank - Subtle */}
            <div className="absolute top-4 right-4 text-[40px] font-black text-slate-800/50 leading-none pointer-events-none select-none">
                {rank}
            </div>

            {/* Header */}
            <div className="flex items-start justify-between mb-6 relative z-10">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-full bg-white p-0.5 shadow-sm overflow-hidden flex items-center justify-center">
                            <img
                                src={`https://assets.parqet.com/logos/symbol/${item.ticker}?format=png`}
                                alt={item.ticker}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement!.style.backgroundColor = '#1e293b'; // slate-800
                                    e.currentTarget.parentElement!.innerHTML = `<span class="text-[10px] font-bold text-slate-400">${item.ticker[0]}</span>`;
                                }}
                            />
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-bold text-white tracking-tight leading-none">{item.ticker}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getActionStyle(action)}`}>
                                    {action}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-base font-semibold font-mono text-white tabular-nums tracking-tight">
                        {price > 0 ? price.toFixed(2) : <Skeleton className="w-12 h-4 inline-block" />}
                    </p>
                    <p className={`text-[11px] font-medium tabular-nums ${changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                    </p>
                </div>
            </div>

            {/* Execution Levels - Clean Grid */}
            {!isNoTrade ? (
                <div className="space-y-2 relative z-10">
                    <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                        <span className="text-[11px] text-slate-500 font-medium">Entry</span>
                        <div className="text-right">
                            <span className="block text-[13px] font-mono font-medium text-white tabular-nums">
                                ${item.entryBand?.low?.toFixed(2)} - {item.entryBand?.high?.toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                        <span className="text-[11px] text-rose-400/80 font-medium">Cut</span>
                        <div className="text-right">
                            <span className="block text-[13px] font-mono font-medium text-rose-300 tabular-nums">
                                ${item.hardCut?.toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1">
                        <span className="text-[11px] text-emerald-400/80 font-medium">Target</span>
                        <div className="text-right flex items-center gap-3">
                            <span className="text-[13px] font-mono font-medium text-emerald-300 tabular-nums">${item.tp1?.toFixed(2)}</span>
                            <span className="text-[11px] text-slate-600">/</span>
                            <span className="text-[13px] font-mono font-medium text-emerald-300 tabular-nums">${item.tp2?.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-[92px] flex flex-col items-center justify-center bg-slate-950/50 rounded border border-slate-800/50 border-dashed">
                    <Lock className="w-4 h-4 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Trading restricted</p>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// DRAWER COMPONENT - Unified Evidence 5-Layers
// ============================================================================
function TickerEvidenceDrawer({ item, onClose }: { item: TickerItem; onClose: () => void }) {
    if (!item) return null;
    const ev = item.evidence;
    const router = useRouter();
    const searchParams = useSearchParams();
    const isDebug = searchParams.get('debug') === '1';

    // [9.4] Interactive Heatmap State
    const [showHeatmap, setShowHeatmap] = useState(false);

    const action = item.decisionSSOT?.action || "CAUTION";

    const tier = item.qualityTier || "WATCH";

    // [Emergency Patch] Defensive check for missing evidence (Legacy Data Support)
    if (!ev) {
        return (
            <div className="fixed inset-0 z-[100] flex justify-end font-sans">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
                <div className="relative w-full max-w-lg h-full bg-slate-950 border-l border-slate-800 shadow-2xl p-10 flex flex-col items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-slate-700 border-t-emerald-500 rounded-full mb-4" />
                    <p className="text-slate-400 font-mono text-sm">Synchronizing Engine Data...</p>
                    <button onClick={onClose} className="mt-8 text-slate-500 hover:text-white underline text-xs">Close</button>
                </div>
            </div>
        );
    }

    const opt = getOptionsStatus(ev.options.status);

    // Derived states
    const isReady = ev.price.last > 0; // Basic check

    return (
        <div className="fixed inset-0 z-[100] flex justify-end font-sans">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
            <div className="relative w-full max-w-lg h-full bg-slate-950 border-l border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-200">

                {/* Header */}
                <div className="shrink-0 bg-slate-950 border-b border-slate-800 p-5 flex items-start justify-between select-none">
                    <div className="flex gap-4 items-center">
                        <h2 className="text-3xl font-bold text-white tracking-tight">{item.ticker}</h2>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getActionStyle(action)}`}>
                            {action}
                        </span>
                        <div className="h-4 w-px bg-slate-800 mx-1" />
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Alpha</span>
                            <span className="text-xs font-mono font-bold text-white">{item.alphaScore?.toFixed(1) || "-"}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors">
                            <XCircle className="w-6 h-6 stroke-1" />
                        </button>
                    </div>
                </div>

                {/* Body: 5-Layer Evidence Stack */}
                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent space-y-8">

                    {/* 1. OVERVIEW & SCORE */}
                    <section>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Target className="w-3.5 h-3.5" /> Overview
                            </h3>
                            {isDebug && <span className="text-[9px] font-mono text-indigo-400">upd: {ev.price.fetchedAtET}</span>}
                        </div>

                        <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-4">
                            {/* Score Breakdown */}
                            <ScoreBreakdown evidence={ev} item={item} />

                            {/* Decision Triggers */}
                            <ul className="space-y-2 mt-2">
                                {(item.decisionSSOT?.triggersKR || []).map((t, i) => (
                                    <li key={i} className="flex gap-2 text-xs text-slate-300 leading-snug">
                                        <div className="w-1 h-1 rounded-full bg-slate-500 mt-1.5 shrink-0" />
                                        {t}
                                    </li>
                                ))}
                            </ul>

                            {/* Mini Gates (Visual only) */}
                            <div className="flex gap-2 pt-2 border-t border-slate-800/50">
                                <GateBadge label="P" pass={true} />
                                <GateBadge label="OPT" pass={ev.options.status !== 'FAILED'} />
                                <GateBadge label="M" pass={true} />
                                <GateBadge label="EV" pass={true} />
                            </div>
                        </div>
                    </section>

                    {/* 2. PRICE ACTION */}
                    <section>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5" /> Price Action
                        </h3>
                        <div className="grid grid-cols-2 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden">
                            <div className="bg-slate-900 p-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase block">Last / Change</span>
                                <div className="flex gap-2 items-baseline">
                                    <span className="text-sm font-mono font-bold text-white">${ev.price.last.toFixed(2)}</span>
                                    <span className={`text-xs font-bold ${ev.price.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {ev.price.changePct > 0 ? '+' : ''}{ev.price.changePct.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                            <div className="bg-slate-900 p-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase block">VWAP Dist</span>
                                <div className="flex gap-2 items-baseline">
                                    <span className="text-sm font-mono font-bold text-slate-300">${ev.price.vwap.toFixed(2)}</span>
                                    <span className={`text-xs font-bold ${ev.price.vwapDistPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {ev.price.vwapDistPct > 0 ? '+' : ''}{ev.price.vwapDistPct.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                            <div className="bg-slate-900 p-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase block">RSI (14)</span>
                                <span className={`text-sm font-mono font-bold ${ev.price.rsi14 > 70 ? 'text-rose-400' : ev.price.rsi14 < 30 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                    {ev.price.rsi14.toFixed(1)}
                                </span>
                            </div>
                            <div className="bg-slate-900 p-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase block">Structure</span>
                                <span className="text-xs font-bold text-indigo-400">{ev.price.structureState}</span>
                            </div>
                        </div>
                    </section>

                    {/* 3. FLOW DYNAMICS (Institutional) */}
                    <section>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5" /> Flow Dynamics
                        </h3>
                        {/* [9.2] Dark Pool / Condition Codes */}
                        <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Dark Pool (Off-Ex)</span>
                                    <div className="flex items-end gap-2">
                                        {ev.flow.offExPct > 0 ? (
                                            <>
                                                <span className="text-sm font-mono font-bold text-white">{ev.flow.offExPct.toFixed(1)}%</span>
                                                <span className={`text-[10px] font-bold ${ev.flow.offExDeltaPct > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                    ({ev.flow.offExDeltaPct > 0 ? '+' : ''}{ev.flow.offExDeltaPct.toFixed(1)}%)
                                                </span>
                                            </>
                                        ) : (
                                            <div className="flex items-center gap-2 h-5">
                                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                                <span className="text-[10px] font-mono text-emerald-500 animate-pulse">Scanning...</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-full bg-slate-800 h-1 mt-2 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${ev.flow.offExPct > 40 ? 'bg-amber-400' : 'bg-slate-600'}`}
                                            style={{ width: `${Math.min(100, ev.flow.offExPct)}%` }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between">
                                        <span className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Net Prem (Est)</span>
                                        <span className="text-[8px] bg-slate-800 text-slate-400 px-1 rounded">COND: I, T</span>
                                    </div>
                                    <span className={`text-sm font-mono font-bold ${ev.flow.largeTradesUsd > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        ${(ev.flow.largeTradesUsd / 1_000_000).toFixed(1)}M
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>


                    {/* 4. OPTIONS STRUCTURE (GEMS) [9.4] Interactive Heatmap */}
                    <section>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 cursor-pointer hover:text-slate-300 transition-colors"
                                onClick={() => setShowHeatmap(!showHeatmap)}>
                                <BarChart3 className="w-3.5 h-3.5" /> Options Structure
                                <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded ml-1">
                                    {showHeatmap ? 'HIDE MAP' : 'VIEW MAP'}
                                </span>
                            </h3>
                            <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${opt.color} text-white`}>
                                {opt.label} ({ev.options.coveragePct}%)
                            </div>
                        </div>

                        {/* [9.4] Toggleable View */}
                        {showHeatmap ? (
                            <div className="bg-slate-900 border border-slate-800 rounded p-4 animate-in fade-in duration-300">
                                <span className="text-[9px] text-slate-500 uppercase font-bold mb-3 block">OI Cluster Heatmap (Dark Pool Magnets)</span>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-[9px] font-bold text-emerald-500 mb-1">
                                            <span>CALL WALL RESISTANCE</span>
                                            <span>OI VOL</span>
                                        </div>
                                        <div className="space-y-1">
                                            {(ev.options.oiClusters?.callsTop || []).slice(0, 3).map((strike, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <span className="w-12 text-[10px] font-mono text-right text-slate-300">${strike}</span>
                                                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-emerald-500/50" style={{ width: `${100 - (i * 20)}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                            {(ev.options.oiClusters?.callsTop || []).length === 0 && <span className="text-[10px] text-slate-600">No data</span>}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-[9px] font-bold text-rose-500 mb-1">
                                            <span>PUT FLOOR SUPPORT</span>
                                            <span>OI VOL</span>
                                        </div>
                                        <div className="space-y-1">
                                            {(ev.options.oiClusters?.putsTop || []).slice(0, 3).map((strike, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <span className="w-12 text-[10px] font-mono text-right text-slate-300">${strike}</span>
                                                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-rose-500/50" style={{ width: `${100 - (i * 20)}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Key Levels (Clickable) */}
                                <div className="grid grid-cols-3 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden text-center cursor-pointer group"
                                    onClick={() => setShowHeatmap(true)}>
                                    <div className="bg-slate-900 p-2 group-hover:bg-slate-800/80 transition-colors">
                                        <span className="text-[9px] text-slate-500 block">Call Wall</span>
                                        <span className="text-xs font-mono font-bold text-emerald-400">${ev.options.callWall}</span>
                                    </div>
                                    <div className="bg-slate-900 p-2 group-hover:bg-slate-800/80 transition-colors">
                                        <span className="text-[9px] text-slate-500 block">Max Pain</span>
                                        <span className="text-xs font-mono font-bold text-amber-400">${ev.options.maxPain}</span>
                                    </div>
                                    <div className="bg-slate-900 p-2 group-hover:bg-slate-800/80 transition-colors">
                                        <span className="text-[9px] text-slate-500 block">Put Floor</span>
                                        <span className="text-xs font-mono font-bold text-rose-400">${ev.options.putFloor}</span>
                                    </div>
                                </div>

                                {/* GEX / PCR */}
                                <div className="grid grid-cols-2 gap-4 bg-slate-900 border border-slate-800 rounded p-3">
                                    <div>
                                        <span className="text-[9px] text-slate-500 uppercase font-bold">Gamma Regime</span>
                                        <div className="text-xs font-bold text-slate-200 mt-1">{ev.options.gammaRegime}</div>
                                        <div className="text-[10px] text-slate-500 font-mono">GEX: ${ev.options.gex.toFixed(2)}M</div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[9px] text-slate-500 uppercase font-bold">Put/Call Ratio</span>
                                        <div className={`text-lg font-mono font-bold mt-0.5 ${ev.options.pcr > 1.2 ? 'text-rose-400' : ev.options.pcr < 0.7 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                            {ev.options.pcr.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* 5. MACRO & STEALTH */}
                    <section className="grid grid-cols-2 gap-4">
                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5" /> Stealth
                            </h3>
                            <div className="bg-slate-900 border border-slate-800 rounded p-3 h-full">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-base font-black ${ev.stealth.label === 'A' ? 'text-emerald-400' : ev.stealth.label === 'B' ? 'text-amber-400' : 'text-slate-500'}`}>
                                        GR.{ev.stealth.label}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-bold">{ev.stealth.impact}</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {ev.stealth.tags.map((tag, i) => (
                                        <span key={i} className="text-[9px] px-1 py-0.5 bg-slate-800 text-slate-400 rounded">
                                            #{tag}
                                        </span>
                                    ))}
                                    {ev.stealth.tags.length === 0 && <span className="text-[9px] text-slate-600">No signals</span>}
                                </div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <TrendingUp className="w-3.5 h-3.5" /> Macro
                            </h3>
                            <div className="bg-slate-900 border border-slate-800 rounded p-3 h-full flex flex-col justify-center">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] text-slate-500">NDX</span>
                                    <span className={`text-[10px] font-bold ${ev.macro?.ndx?.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {ev.macro?.ndx?.changePct?.toFixed(2)}%
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-slate-500">VIX</span>
                                    <span className="text-[10px] font-bold text-slate-300">{ev.macro?.vix?.level?.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
function Tier01Content() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isDebug = searchParams.get('debug') === '1';

    // State
    const [report, setReport] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTicker, setSelectedTicker] = useState<TickerItem | null>(null);

    // Fetch Data
    useEffect(() => {
        let isMounted = true;

        async function loadData() {
            try {
                // 1. Try Fetching Morning Report (Priority)
                // Use /api/reports/latest to get the actual data, not the cron result
                const resMorning = await fetch('/api/reports/latest?type=morning', { cache: 'no-store' });
                if (resMorning.ok) {
                    const data = await resMorning.json();
                    if (isMounted) {
                        setReport(data);
                        setIsLoading(false);
                    }
                    return; // Success, done.
                }

                // 2. Fallback: Fetch EOD Report (Immediate Display)
                console.warn("[Tier01] Morning report missing. Falling back to EOD.");
                const resEod = await fetch('/api/reports/latest?type=eod', { cache: 'no-store' });
                if (resEod.ok) {
                    const data = await resEod.json();
                    if (isMounted) {
                        setReport(data);
                        setIsLoading(false); // Show EOD data to remove skeleton immediately
                    }
                } else {
                    // Nothing found at all
                    if (isMounted) setIsLoading(false);
                }

                // 3. Trigger Auto-Seeding (Background)
                console.log("[Tier01] Triggering on-demand seed...");
                fetch('/api/seed/morning', { method: 'POST' })
                    .then(r => r.json())
                    .then(result => {
                        console.log("[Tier01] Seed result:", result);
                        if (result.ok || result.error === 'Seeding already in progress') {
                            // Start Polling for the new report
                            const pollId = setInterval(async () => {
                                if (!isMounted) {
                                    clearInterval(pollId);
                                    return;
                                }
                                console.log("[Tier01] Polling for fresh Morning report...");
                                const checkRes = await fetch('/api/reports/latest?type=morning', { cache: 'no-store' });
                                if (checkRes.ok) {
                                    const newData = await checkRes.json();
                                    if (isMounted) {
                                        console.log("[Tier01] Fresh Morning report loaded. Swapping.");
                                        setReport(newData);
                                        clearInterval(pollId);
                                    }
                                }
                            }, 3000); // Check every 3s

                            // Safety: Stop polling after 60s
                            setTimeout(() => clearInterval(pollId), 60000);
                        }
                    })
                    .catch(e => console.error("[Tier01] Seed trigger error:", e));

            } catch (e) {
                console.error("Data load critical error:", e);
                if (isMounted) setIsLoading(false);
            }
        }

        loadData();
        return () => { isMounted = false; };
    }, []);

    // Derived Lists
    const items: TickerItem[] = report?.items || [];
    // Ensure Top 3 are actually the ones ranked 1, 2, 3
    const top3 = items.filter(i => (i as any).rank <= 3).sort((a, b) => ((a as any).rank || 99) - ((b as any).rank || 99));
    const alpha12 = items.sort((a, b) => ((a as any).rank || 99) - ((b as any).rank || 99));

    // Market Context Cards (derived from report.macro/sentiment)
    // We construct these dynamically based on the fetched report data
    const marketCards: EvidenceCard[] = [];

    if (report) {
        // 1. Regime Card
        const regime = report.engine?.regime || "NEUTRAL";
        marketCards.push({
            id: "regime",
            title: "MARKET REGIME",
            titleKR: "시장 국면",
            meaning: "시장 전체의 위험 선호도",
            interpretation: report.engine?.regimeReasonKR || "데이터 분석 중...",
            action: regime === "RISK_ON" ? "비중 확대" : regime === "RISK_OFF" ? "리스크 관리" : "선별 대응",
            confidence: "A",
            icon: <Activity />,
            status: regime === "RISK_ON" ? "BULLISH" : regime === "RISK_OFF" ? "BEARISH" : "NEUTRAL",
            meta: { fetchedAtET: report.meta?.generatedAtET }
        });

        // 2. Policy/Event Card (Combined or Highest Priority)
        const events = report.events?.events || [];
        const policies = report.policy?.policies72h || [];
        const highRiskEvents = events.filter((e: any) => e.importance === "HIGH");
        const p0Policies = policies.filter((p: any) => p.category === "P0");

        if (p0Policies.length > 0) {
            marketCards.push({
                id: "policy",
                title: "POLICY GATE",
                titleKR: "정책 리스크",
                meaning: "행정명령 및 규제 충돌",
                interpretation: `P0급 충돌: ${p0Policies[0].titleKR}`,
                action: "신규 진입 금지",
                confidence: "A",
                icon: <Shield />,
                status: "BEARISH"
            });
        } else if (highRiskEvents.length > 0) {
            marketCards.push({
                id: "event",
                title: "MACRO EVENT",
                titleKR: "주요 이벤트",
                meaning: "경제 지표 발표 및 연준 일정",
                interpretation: `${highRiskEvents[0].nameKR} 등 ${highRiskEvents.length}건`,
                action: "변동성 주의",
                confidence: "B",
                icon: <Clock />,
                status: "NEUTRAL"
            });
        } else {
            // Default if quiet
            marketCards.push({
                id: "macro_ok",
                title: "MACRO",
                titleKR: "거시 환경",
                meaning: "주요 경제 이벤트 및 정책",
                interpretation: "특이사항 없음 (72h)",
                action: "전략 정상 실행",
                confidence: "A",
                icon: <Zap />,
                status: "BULLISH"
            });
        }

        // 3. Options Status Card
        const optState = report.meta?.optionsStatus?.state || "UNKNOWN";
        const optCov = report.meta?.optionsStatus?.coveragePct || 0;
        marketCards.push({
            id: "options",
            title: "OPTIONS",
            titleKR: "옵션 시장",
            meaning: "파생상품 수급 및 구조",
            interpretation: `커버리지 ${optCov}% (${optState})`,
            action: optState === "READY" ? "레벨 신뢰 가능" : "보수적 운용",
            confidence: optState === "READY" ? "A" : "C",
            icon: <BarChart3 />,
            status: optState === "READY" ? "BULLISH" : optState === "FAILED" ? "PENDING" : "NEUTRAL"
        });
    }

    // Regime for Header
    const regime = report?.engine?.regime || "NEUTRAL";

    return (
        <main className="min-h-screen bg-slate-950 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
            {isDebug && (
                <div className="fixed top-0 left-0 right-0 h-1 bg-indigo-500 z-[200]" title="Debug Mode Active" />
            )}

            <LandingHeader />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

                {/* 1. HEADER & MARKET CONTEXT */}
                <section>
                    <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                                Alpha12 Terminal
                                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${getRegimeColor(regime)}`}>
                                    {getRegimeText(regime)}
                                </span>
                            </h1>
                            <div className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Unified Output • {report?.meta?.generatedAtET || <Skeleton className="w-16 h-3 inline-block" />}
                            </div>
                        </div>
                        {/* Debug & Meta */}
                        <div className="flex items-center gap-3">
                            <div className="text-right hidden md:block">
                                <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">PIPELINE</span>
                                <span className="block text-xs font-mono text-slate-300">{report?.meta?.pipelineVersion || "v--"}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {isLoading ? (
                            [1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-900 rounded border border-slate-800 animate-pulse" />)
                        ) : (
                            marketCards.map(card => <EvidenceCardUI key={card.id} card={card} />)
                        )}
                        {/* Fallback if no cards yet (loading or empty report) */}
                        {!isLoading && marketCards.length === 0 && (
                            <div className="col-span-3 text-center p-8 border border-slate-800 border-dashed rounded text-slate-500 text-sm">
                                Waiting for Market Snapshot...
                            </div>
                        )}
                    </div>
                </section>

                {/* 2. TOP 3 ALPHA */}
                <section>
                    <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-400" />
                        Alpha Picks (Top 3)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {isLoading ? (
                            [1, 2, 3].map(i => <div key={i} className="h-64 bg-slate-900 rounded border border-slate-800 animate-pulse" />)
                        ) : (
                            top3.map((item, idx) => (
                                <div key={item.ticker} onClick={() => setSelectedTicker(item)} className="cursor-pointer h-full">
                                    <Top3Card item={item} rank={idx + 1} />
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* 3. ALPHA 12 SCAN TABLE */}
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                            <Search className="w-5 h-5 text-slate-400" />
                            Live Scan
                        </h2>
                        <div className="flex gap-4">
                            <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Options Ready
                            </span>
                            <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-600" /> No Data
                            </span>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        <th className="p-4 w-[60px] text-center">Rank</th>
                                        <th className="p-4 w-[120px]">Ticker</th>
                                        <th className="p-4 text-right">Score</th>
                                        <th className="p-4 text-right">Price</th>
                                        <th className="p-4 text-right">Flow</th>
                                        <th className="p-4 text-center">Options</th>
                                        <th className="p-4 hidden md:table-cell">Triggers</th>
                                        <th className="p-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {isLoading ? (
                                        [1, 2, 3, 4, 5].map(i => (
                                            <tr key={i}>
                                                <td colSpan={8} className="p-4"><Skeleton className="h-12 w-full" /></td>
                                            </tr>
                                        ))
                                    ) : (
                                        alpha12.map((item, idx) => {
                                            const ev = item.evidence;

                                            // Safety check: if ev is missing (legacy report), fallback
                                            if (!ev) return null;

                                            const optStatus = getOptionsStatus(ev.options?.status);
                                            const actStyle = getActionStyle(item.decisionSSOT?.action);
                                            const isTop3 = idx < 3;

                                            // Debug highlighting
                                            const rowBg = isDebug && ev.options?.backfilled ? "bg-indigo-950/10" : isTop3 ? "bg-slate-800/30 hover:bg-slate-800/60" : "hover:bg-slate-800/50";

                                            return (
                                                <tr key={item.ticker}
                                                    onClick={() => setSelectedTicker(item)}
                                                    className={`cursor-pointer transition-colors group ${rowBg}`}
                                                >
                                                    <td className={`p-4 text-center font-mono text-xs ${isTop3 ? "font-bold text-white" : "text-slate-500"}`}>
                                                        {(item as any).rank || idx + 1}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 bg-white rounded-full p-0.5 flex-shrink-0 shadow-sm">
                                                                <img
                                                                    src={`https://assets.parqet.com/logos/symbol/${item.ticker}?format=png`}
                                                                    className="w-full h-full object-contain rounded-full"
                                                                    onError={(e) => {
                                                                        e.currentTarget.style.display = 'none';
                                                                        e.currentTarget.parentElement!.style.backgroundColor = '#334155';
                                                                    }}
                                                                />
                                                            </div>
                                                            <div>
                                                                <span className="block text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{item.ticker}</span>
                                                                <span className="block text-[10px] text-slate-500">{item.symbol || item.ticker}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <span className={`font-mono font-bold text-sm ${(item.alphaScore || 0) > 80 ? "text-emerald-400" : (item.alphaScore || 0) > 50 ? "text-slate-300" : "text-slate-500"
                                                            }`}>
                                                            {item.alphaScore?.toFixed(0) || "-"}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-sm font-mono text-slate-200">${ev.price.last.toFixed(2)}</span>
                                                            <span className={`text-[10px] font-bold ${ev.price.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                                {ev.price.changePct > 0 ? "+" : ""}{ev.price.changePct.toFixed(2)}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className={`text-xs font-mono ${(ev.flow.largeTradesUsd || 0) > 0 ? "text-emerald-400" : "text-slate-500"}`}>
                                                                ${(ev.flow.largeTradesUsd / 1000000).toFixed(1)}M
                                                            </span>
                                                            <span className="text-[10px] text-slate-500">
                                                                OffEx {ev.flow.offExPct.toFixed(0)}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`inline-flex w-2.5 h-2.5 rounded-full ${optStatus.color}`} title={optStatus.label} />
                                                    </td>
                                                    <td className="p-4 hidden md:table-cell">
                                                        <div className="flex flex-wrap gap-1 justify-end md:justify-start">
                                                            {(item.decisionSSOT?.triggersKR || []).slice(0, 2).map((t, i) => (
                                                                <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400 border border-slate-700 whitespace-nowrap">
                                                                    {t}
                                                                </span>
                                                            ))}
                                                            {(item.decisionSSOT?.triggersKR?.length || 0) > 2 && (
                                                                <span className="text-[9px] text-slate-600">+{(item.decisionSSOT?.triggersKR?.length || 0) - 2}</span>
                                                            )}
                                                            {(item.decisionSSOT?.triggersKR?.length || 0) === 0 && (
                                                                <span className="text-[9px] text-slate-700">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold border ${actStyle}`}>
                                                            {item.decisionSSOT?.action || "WAIT"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* 4. FOOTER / DEBUG INFO */}
                {isDebug && report && (
                    <section className="bg-slate-900 p-4 rounded border border-indigo-500/30 overflow-x-auto">
                        <h3 className="text-xs font-bold text-indigo-400 mb-2 font-mono">DEBUG INSPECTOR (?debug=1)</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase">Engine Stats</h4>
                                <pre className="text-[10px] text-slate-400 font-mono mt-1">
                                    {JSON.stringify(report.engine?.counts || {}, null, 2)}
                                </pre>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase">Options Status</h4>
                                <pre className="text-[10px] text-slate-400 font-mono mt-1">
                                    {JSON.stringify(report.meta?.optionsStatus || {}, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </section>
                )}

                <footer className="text-center pb-8 pt-4">
                    <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                        GEMS v8.1 Unified Engine • Tier 0.1
                    </p>
                </footer>

            </div>

            {/* DRAWER PORTAL */}
            {selectedTicker && (
                <TickerEvidenceDrawer item={selectedTicker} onClose={() => setSelectedTicker(null)} />
            )}

        </main>
    );
}

export default function Tier01Page() {
    return (
        <React.Suspense fallback={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 text-sm">Initializing Terminal...</p>
                </div>
            </div>
        }>
            <Tier01Content />
        </React.Suspense>
    );
}
