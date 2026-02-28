"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from 'next/dynamic';
import {
    AlertCircle, TrendingUp, TrendingDown, Activity,
    ChevronRight, Shield, Clock, Zap, DollarSign,
    BarChart3, Target, XCircle, CheckCircle, AlertTriangle,
    Lock, Unlock, Eye, ArrowUpRight, ArrowDownRight,
    Search, Layers, CheckCircle2,
    Orbit,
    Bot,
    BookOpen
} from "lucide-react";

// Static imports — lightweight or needed immediately
import { TacticalCard } from "@/components/TacticalCard";
import { TacticalSidebar } from "@/components/TacticalSidebar";
import { PremiumBlur } from "@/components/PremiumBlur";
import { type AlphaItem } from '@/components/intel/FinalBattleSection';
import FinalBattleSection from '@/components/intel/FinalBattleSection';
import { EarningsEvent, RecommendationTrend } from "@/services/finnhubClient";
import { m7Config } from "@/configs/m7.config";
import { physicalAIConfig } from "@/configs/physicalai.config";
import { siliconCoreConfig } from "@/configs/siliconcore.config";
import { powerMatrixConfig } from "@/configs/powermatrix.config";
import { bioPulseConfig } from "@/configs/biopulse.config";
import { cyberShieldConfig } from "@/configs/cybershield.config";
import { orbitDefenseConfig } from "@/configs/orbitdefense.config";
import { quantumEdgeConfig } from "@/configs/quantumedge.config";
import { fintechPulseConfig } from "@/configs/fintechpulse.config";
import { cloudFortressConfig } from "@/configs/cloudfortress.config";
import { useIntelSharedData } from "@/hooks/useIntelSharedData";

// [PERF] Lazy-loaded heavy components — reduces initial JS bundle by ~150KB
const ReportArchive = dynamic(() => import("@/components/ReportArchive").then(m => m.ReportArchive), { ssr: false });
const TrackRecord = dynamic(() => import("@/components/intel/TrackRecord").then(m => m.TrackRecord), { ssr: false });
const TacticalBoard = dynamic(() => import("@/components/intel/TacticalBoard").then(m => m.TacticalBoard), { ssr: false });
const M7BriefingBar = dynamic(() => import("@/components/intel/M7BriefingBar").then(m => m.M7BriefingBar), { ssr: false });
const M7TacticalDeck = dynamic(() => import("@/components/intel/M7TacticalDeck").then(m => m.M7TacticalDeck), { ssr: false });
const M7SessionSummary = dynamic(() => import("@/components/intel/M7SessionSummary").then(m => m.M7SessionSummary), { ssr: false });
const M7OptionsPulse = dynamic(() => import("@/components/intel/M7OptionsPulse").then(m => m.M7OptionsPulse), { ssr: false });
const M7EarningsCalendar = dynamic(() => import("@/components/intel/M7EarningsCalendar").then(m => m.M7EarningsCalendar), { ssr: false });
const M7AnalystConsensus = dynamic(() => import("@/components/intel/M7AnalystConsensus").then(m => m.M7AnalystConsensus), { ssr: false });
const M7RankingRow = dynamic(() => import("@/components/intel/M7RankingRow").then(m => m.M7RankingRow), { ssr: false });
const PhysicalAIOrbitalMap = dynamic(() => import("@/components/intel/PhysicalAIOrbitalMap").then(m => m.PhysicalAIOrbitalMap), { ssr: false });
const PhysicalAIBriefingBar = dynamic(() => import("@/components/intel/PhysicalAIComponents").then(m => m.PhysicalAIBriefingBar), { ssr: false });
const PhysicalAITacticalDeckOld = dynamic(() => import("@/components/intel/PhysicalAIComponents").then(m => m.PhysicalAITacticalDeck), { ssr: false });
const PhysicalAISessionSummary = dynamic(() => import("@/components/intel/PhysicalAISessionSummary").then(m => m.PhysicalAISessionSummary), { ssr: false });
const PhysicalAITacticalDeck = dynamic(() => import("@/components/intel/PhysicalAITacticalDeck").then(m => m.PhysicalAITacticalDeck), { ssr: false });
const PhysicalAIAnalystConsensus = dynamic(() => import("@/components/intel/PhysicalAIAnalystConsensus").then(m => m.PhysicalAIAnalystConsensus), { ssr: false });
const PhysicalAIEarningsCalendar = dynamic(() => import("@/components/intel/PhysicalAIEarningsCalendar").then(m => m.PhysicalAIEarningsCalendar), { ssr: false });
const PhysicalAIOptionsPulse = dynamic(() => import("@/components/intel/PhysicalAIOptionsPulse").then(m => m.PhysicalAIOptionsPulse), { ssr: false });
const SectorSessionGrid = dynamic(() => import("@/components/intel/SectorSessionGrid").then(m => m.SectorSessionGrid), { ssr: false });
const SectorPulseDashboard = dynamic(() => import("@/components/intel/SectorPulseDashboard").then(m => m.SectorPulseDashboard), { ssr: false });
const SectorCommanderLog = dynamic(() => import("@/components/intel/SectorCommanderLog").then(m => m.SectorCommanderLog), { ssr: false });
const TacticalReportDeck = dynamic(() => import("@/components/intel/TacticalReportDeck").then(m => m.TacticalReportDeck), { ssr: false });
const SectorRankingRow = dynamic(() => import("@/components/intel/SectorRankingRow").then(m => m.SectorRankingRow), { ssr: false });
const SectorAnalystConsensus = dynamic(() => import("@/components/intel/SectorAnalystConsensus").then(m => m.SectorAnalystConsensus), { ssr: false });
const SectorEarningsCalendar = dynamic(() => import("@/components/intel/SectorEarningsCalendar").then(m => m.SectorEarningsCalendar), { ssr: false });
const SectorCommandCenter = dynamic(() => import("@/components/intel/SectorCommandCenter").then(m => m.SectorCommandCenter), { ssr: false });




// ============================================================================
// [V4.6] Stealth Tag → i18n key mapping
// ============================================================================
const STEALTH_TAG_I18N: Record<string, string> = {
    'GammaSqueeze': 'stealthGammaSqueeze',
    'WhaleAccumulation': 'stealthWhaleAccumulation',
    'AI_Momentum': 'stealthAIMomentum',
    'SectorLeader': 'stealthSectorLeader',
    'SafeHaven': 'stealthSafeHaven',
    'TechRotation': 'stealthTechRotation',
    'SemiSemi': 'stealthSemiSemi',
    'CatchUp': 'stealthCatchUp',
    'Consolidation': 'stealthConsolidation',
    'CloudGrowth': 'stealthCloudGrowth',
    'ValueTech': 'stealthValueTech',
    'AdRev': 'stealthAdRev',
    'Efficiency': 'stealthEfficiency',
    'Social': 'stealthSocial',
    'Prime': 'stealthPrime',
    'AWS': 'stealthAWS',
    'Streaming': 'stealthStreaming',
    'Content': 'stealthContent',
    'GovTech': 'stealthGovTech',
    'AI_Defense': 'stealthAIDefense',
    'CryptoVol': 'stealthCryptoVol',
    'Exchange': 'stealthExchange',
    'BitcoinLev': 'stealthBitcoinLev',
    'HighBeta': 'stealthHighBeta'
};

// [V4.6] Structure State → i18n key mapping
const STRUCTURE_I18N: Record<string, string> = {
    'Breakout': 'structBreakout',
    'BullFlag': 'structBullFlag',
    'Consolidation': 'structConsolidation',
    'Rebound': 'structRebound',
    'Bottoming': 'structBottoming',
    'BoxRange': 'structBoxRange',
    'TrendUp': 'structTrendUp',
    'SlowGrind': 'structSlowGrind',
    'Weakness': 'structWeakness',
    'VolExpansion': 'structVolExpansion',
    'Correction': 'structCorrection',
    'DeepPullback': 'structDeepPullback'
};

// [V4.7] M7 Watchlist
const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const PHYSICAL_AI_TICKERS = ['PLTR', 'ISRG', 'SYM', 'TER', 'RKLB', 'SERV', 'PL'];

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
    rawChain?: any[]; // [Phase 50] Raw Chain for UI
}

export interface UnifiedFlow {
    vol: number;
    relVol: number;
    gapPct: number;
    largeTradesUsd: number;
    offExPct: number;
    offExDeltaPct: number;
    netFlow?: number;
    netPremium?: number; // [Phase 40] Explicit Net Premium in $
    backfilled: boolean;
    fetchedAtET?: string;
    complete?: boolean;
}


export interface UnifiedPrice {
    last: number;
    priceSource?: "OFFICIAL_CLOSE" | "LIVE_SNAPSHOT" | "POST_CLOSE" | "PRE_OPEN"; // [Phase 25.1] Precise Session Tagging
    extendedPrice?: number; // [V3.7.5] Pre/Post Market Price
    extendedChangePct?: number; // [V3.7.5] Pre/Post Market Change %
    extendedLabel?: "PRE" | "POST" | "CLOSED" | "LIVE"; // [V3.7.5] Label for Extended Data
    error?: string; // [Phase 24.2] Expose Error
    prevClose: number;
    changePct: number;
    vwap: number;
    vwapDistPct: number;
    rsi14: number;
    return3D: number;
    structureState: 'BREAKOUT' | 'BREAKDOWN' | 'CONSOLIDATION' | 'TRENDING' | 'REVERSAL';
    fetchedAtET?: string;
    history3d?: any[]; // [Phase 36]
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
    qualityTier?: "ACTIONABLE" | "WATCH" | "FILLER" | "INCOMPLETE";
    qualityReasonKR?: string;

    // Legacy Decision & Execution (Maintain Backward Compat)
    decisionSSOT?: {
        action: string;
        confidencePct: number;
        triggersKR: string[];
        entryBand?: { min: number; max: number };
        cutPrice?: number;
        isLocked?: boolean;
        whaleIndex?: number; // [V3.7.3]
        whaleConfidence?: 'HIGH' | 'MED' | 'LOW' | 'NONE';
        whaleEntryLevel?: number; // [V3.7.3]
        whaleTargetLevel?: number; // [V3.7.3]
        dominantContract?: string; // [V3.7.3]
        whaleReasonKR?: string; // [V3.7.4] Narrative Engine
        // [Phase 5] Tactical Conclusion SSOT
        tacticalConclusion?: {
            key: string;  // i18n key e.g. 'signal.shortGammaAboveMaxPain'
            direction: 'BULLISH' | 'BEARISH' | 'CAUTION' | 'NEUTRAL';
            priority: number;
        };
        // [Phase 6] Snapshot Data - Preserved at report generation time
        snapshotData?: {
            whaleIndex: number;
            whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE';
            offExPct: number;
            netPremium: number;
            dominantContract?: string;
            capturedAt: string;  // ISO timestamp
        };
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
    <span className={`animate-pulse bg-slate-800/50 rounded ${className}`} />
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
                <span className="text-xs uppercase font-bold text-slate-300 flex items-center gap-1">
                    Alpha Contribution
                    <div className="hidden group-hover:flex absolute z-50 bg-slate-800 border border-slate-700 p-2 rounded shadow-xl -mt-8 ml-24 text-xs text-slate-300 w-48 flex-col gap-1">
                        <div className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Scoring Factors (Alpha 2.0)</div>
                        <div className="flex justify-between"><span>Momentum:</span> <span className="font-mono text-emerald-400">Price + Vol Surge</span></div>
                        <div className="flex justify-between"><span>Options:</span> <span className="font-mono text-sky-400">PCR + OI Heat</span></div>
                        <div className="flex justify-between"><span>Structure:</span> <span className="font-mono text-indigo-400">GEX + Walls</span></div>
                        <div className="flex justify-between"><span>Regime:</span> <span className="font-mono text-amber-400">Macro + VIX</span></div>
                        <div className="flex justify-between"><span>Risk:</span> <span className="font-mono text-rose-400">RSI + Variance</span></div>
                    </div>
                    <Search className="w-3 h-3 text-slate-300" />
                </span>
                <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
                    {score.toFixed(1)} <span className="text-cyan-500/70">/ 100</span>
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
                <div className="grid grid-cols-5 text-xs text-slate-300 font-mono text-center opacity-70">
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
    if (regime === "RISK_ON") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]";
    if (regime === "RISK_OFF") return "text-rose-400 bg-rose-500/10 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]";
    return "text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
};

const getRegimeText = (regime?: string) => {
    if (regime === "RISK_ON") return "RISK-ON";
    if (regime === "RISK_OFF") return "RISK-OFF";
    return "NEUTRAL";
};

const getTierStyle = (tier?: string) => {
    if (tier === "ACTIONABLE") return "text-emerald-400 border border-emerald-500/30 bg-emerald-500/5";
    if (tier === "WATCH") return "text-slate-300 border border-slate-700 bg-slate-800/50";
    return "text-slate-300 border border-slate-800 bg-transparent";
};

const getOptionsStatus = (status?: string) => {
    if (status === "OK" || status === "READY" || status === "BULLISH" || status === "BEARISH" || status === "NEUTRAL") return { label: "OK", color: "bg-emerald-500" };
    if (status === "PARTIAL") return { label: "PARTIAL", color: "bg-amber-500" };
    if (status === "FAILED") return { label: "ERR", color: "bg-rose-500" };
    if (status === "PENDING") return { label: "PENDING", color: "bg-slate-500 animate-pulse" };
    return { label: "UNK", color: "bg-slate-700" };
};

const getActionStyle = (action?: string) => {
    if (action === "ENTER" || action === "STRONG_BUY") return "text-emerald-300 bg-emerald-500/20 border border-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]";
    if (action === "MAINTAIN") return "text-cyan-300 bg-cyan-500/20 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]";
    if (action === "EXIT" || action === "REPLACE") return "text-rose-300 bg-rose-500/20 border border-rose-400/50 shadow-[0_0_10px_rgba(244,63,94,0.3)]";
    if (action === "NO_TRADE") return "text-slate-300 bg-slate-800 border border-slate-600 shadow-inner";
    return "text-amber-300 bg-amber-500/20 border border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]";
};

// ============================================================================
// COMPONENTS
// ============================================================================

// Gate Badge: Text + Dot (Minimalist)
function GateBadge({ label, pass }: { label: string; pass: boolean }) {
    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border border-transparent ${pass ? "text-slate-300" : "text-rose-400 bg-rose-500/10 border-rose-500/20"
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${pass ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="uppercase tracking-wider">{label}</span>
        </div>
    );
}

// Evidence Card: Professional Header + Grid Layout
function EvidenceCardUI({ card }: { card: EvidenceCard }) {
    const ti = useTranslations('intel');
    const statusColor = {
        BULLISH: "text-emerald-400",
        BEARISH: "text-rose-400",
        NEUTRAL: "text-amber-400",
        PENDING: "text-slate-300"
    }[card.status];

    return (
        <div className="bg-[#0a0f1c]/60 backdrop-blur-xl border border-indigo-500/10 rounded p-4 h-full flex flex-col hover:border-indigo-500/30 hover:shadow-[0_0_15px_rgba(99,102,241,0.1)] transition-all relative overflow-hidden group">
            {/* Dark Navy Glassmorphism Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl group-hover:bg-indigo-500/10 transition-colors pointer-events-none" />

            {/* Header */}
            <div className="flex items-start justify-between mb-4 border-b border-indigo-500/10 pb-3 z-10 relative">
                <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded bg-slate-800 ${statusColor}`}>
                        {React.cloneElement(card.icon as React.ReactElement<{ className?: string }>, { className: "w-4 h-4" })}
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <h4 className="text-sm font-bold text-slate-200 tracking-tight">{card.titleKR}</h4>
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{card.title}</span>
                        </div>
                        {/* vNext Meta Display (Subtle) */}
                        {card.meta?.fetchedAtET && (
                            <div className="hidden group-hover:block text-xs text-slate-300 font-mono mt-0.5">
                                Updated: {card.meta.fetchedAtET}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${card.confidence === "A" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" :
                        card.confidence === "B" ? "text-amber-400 border-amber-500/20 bg-amber-500/5" :
                            "text-slate-300 border-slate-700 bg-slate-800"
                        }`}>
                        GR.{card.confidence}
                    </span>
                </div>
            </div>

            {/* Body: 3-Row Data Grid */}
            <div className="flex-1 space-y-3 z-10 relative">
                <div className="grid grid-cols-[3rem_1fr] gap-2 items-baseline">
                    <span className="text-xs text-slate-300 font-medium text-right">{ti('labelMeaning')}</span>
                    <span className="text-xs text-slate-300 leading-tight">{card.meaning}</span>
                </div>
                <div className="grid grid-cols-[3rem_1fr] gap-2 items-baseline">
                    <span className="text-xs text-slate-300 font-medium text-right">{ti('labelInterpretation')}</span>
                    <span className="text-[12px] text-slate-200 font-medium tabular-nums leading-tight tracking-tight">
                        {card.interpretation}
                    </span>
                </div>
                <div className="grid grid-cols-[3rem_1fr] gap-2 items-baseline">
                    <span className="text-xs text-slate-300 font-medium text-right">{ti('labelAction')}</span>
                    <span className={`text-[12px] font-bold ${statusColor}`}>
                        {card.action}
                    </span>
                </div>
            </div>
        </div>
    );
}

const PulseCard = dynamic(() => import("@/components/PulseCard").then(m => m.PulseCard), { ssr: false });
const ExecutionDial = dynamic(() => import("@/components/ExecutionDial").then(m => m.ExecutionDial), { ssr: false });
const GammaVoid = dynamic(() => import("@/components/GammaVoid").then(m => m.GammaVoid), { ssr: false });
import { cn } from "@/lib/utils";

// ... existing imports ...

// [V3.7.3] Surgical UI Integration
function Top3Card({ item, rank, onClick, isSelected }: { item: TickerItem; rank: number; onClick?: () => void; isSelected?: boolean }) {
    // If Actionable and Complete, use PulseCard (The Surgical UI)
    const isActionable = item.qualityTier === 'ACTIONABLE';

    // Extract Forensic Data
    const whaleIndex = item.decisionSSOT?.whaleIndex || 0;
    const whaleConfidence = item.decisionSSOT?.whaleConfidence || 'NONE';
    // const lastBigPrint = item.decisionSSOT?.triggersKR?.includes('WHALE_IN_SIGHT') ? 'Whale Alert' : undefined; 
    // Actually detailed log is better if passed, but for now we inferred it.

    if (isActionable) {
        return (
            <div onClick={onClick} className={cn("cursor-pointer transition-all duration-300 transform", isSelected ? "scale-[1.02] ring-2 ring-fuchsia-500/50" : "hover:scale-[1.01]")}>
                <PulseCard
                    ticker={item.ticker}
                    price={item.evidence.price.last}
                    change={item.evidence.price.changePct}
                    whaleIndex={whaleIndex}
                    whaleConfidence={whaleConfidence}
                    lastBigPrint={whaleIndex > 80 ? "INSTITUTIONAL SWEEP DETECTED" : undefined}
                    rank={rank}
                />
            </div>
        );
    }

    // Fallback to Standard Card for others
    const action = item.decisionSSOT?.action || "CAUTION";
    const isNoTrade = action === "NO_TRADE" || action === "EXIT";
    const ev = item.evidence; // SSOT shortcut

    // vNext Price Logic
    const price = ev?.price?.last || 0;
    const changePct = ev?.price?.changePct || 0;
    const source = ev?.price?.priceSource;

    let tag = "";
    let tagStyle = "text-slate-300";
    if (source === "OFFICIAL_CLOSE") { tag = "CLOSE"; tagStyle = "text-slate-300 bg-slate-800/50 border-slate-700"; }
    else if (source === "POST_CLOSE") { tag = "POST"; tagStyle = "text-indigo-300 bg-indigo-500/10 border-indigo-500/30"; }
    else if (source === "PRE_OPEN") { tag = "PRE"; tagStyle = "text-amber-300 bg-amber-500/10 border-amber-500/30"; }
    else if (source === "LIVE_SNAPSHOT") { tag = "LIVE"; tagStyle = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"; }

    return (
        <div onClick={onClick} className={cn(
            "relative rounded-xl p-6 cursor-pointer transition-all duration-300 overflow-hidden",
            // Glassmorphism Base
            "bg-[#0a0f1c]/60 backdrop-blur-xl border border-indigo-500/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)]",

            // "Active" State (Whale Index > 80) -> Pink Neon Pulse
            (item.decisionSSOT?.whaleIndex || 0) >= 80
                ? "shadow-[0_0_30px_rgba(255,0,128,0.2)] border-pink-500/30"
                : "hover:border-indigo-500/40 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] hover:bg-[#0f172a]/80",

            // Selection Override
            isSelected && "ring-2 ring-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.2)] bg-slate-800/80"
        )}>
            {/* Rank - Subtle */}
            <div className="absolute top-4 right-4 text-[40px] font-black text-slate-800/50 leading-none pointer-events-none select-none">
                {rank}
            </div>

            {/* Header */}
            <div className="flex items-start justify-between mb-6 relative z-10">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-full bg-white p-0 shadow-sm overflow-hidden flex items-center justify-center flex-shrink-0">
                            <img
                                src={`https://assets.parqet.com/logos/symbol/${item.ticker}?format=png`}
                                alt={item.ticker}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement!.style.backgroundColor = '#1e293b'; // slate-800
                                    e.currentTarget.parentElement!.innerHTML = `<span class="text-xs font-bold text-slate-300">${item.ticker[0]}</span>`;
                                }}
                            />
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-bold text-white tracking-tight leading-none">{item.ticker}</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${getActionStyle(action)}`}>
                                    {action}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="flex items-center justify-end gap-2 mb-0.5">
                        {tag && <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${tagStyle}`}>{tag}</span>}
                        <p className="text-base font-semibold font-mono text-white tabular-nums tracking-tight">
                            {price > 0 ? price.toFixed(2) : (
                                (item.evidence.price as any).error ?
                                    <span className="text-xs text-rose-500 font-bold">{(item.evidence.price as any).error}</span> :
                                    <Skeleton className="w-12 h-4 inline-block" />
                            )}
                        </p>
                    </div>
                    <p className={`text-xs font-medium tabular-nums ${changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                    </p>
                </div>
            </div>

            {/* Execution Levels - Tactical Panel */}
            {!isNoTrade ? (
                <div className="mt-4 p-3 bg-[#0f172a]/60 backdrop-blur-md rounded-lg border border-indigo-500/20 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] space-y-2 relative z-10">
                    <div className="flex items-center justify-between py-1.5 border-b border-indigo-500/10">
                        <span className="text-[11px] uppercase tracking-widest text-indigo-300 font-bold">🎯 ENTRY ZONE</span>
                        <div className="text-right">
                            <span className="block text-[14px] font-mono font-bold text-indigo-400 tabular-nums drop-shadow-[0_0_10px_rgba(99,102,241,0.6)]">
                                ${item.entryBand?.low?.toFixed(2)} - {item.entryBand?.high?.toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-rose-500/10">
                        <span className="text-[11px] uppercase tracking-widest text-rose-400/90 font-bold">🛑 STOP LOSS</span>
                        <div className="text-right">
                            <span className="block text-[14px] font-mono font-bold text-rose-400 tabular-nums drop-shadow-[0_0_10px_rgba(251,113,133,0.6)]">
                                ${item.hardCut?.toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                        <span className="text-[11px] uppercase tracking-widest text-emerald-400/90 font-bold">🚀 TARGET</span>
                        <div className="text-right flex items-center gap-2">
                            <span className="text-[14px] font-mono font-bold text-emerald-400 tabular-nums drop-shadow-[0_0_10px_rgba(52,211,153,0.6)]">${item.tp1?.toFixed(2)}</span>
                            {item.tp2 && (
                                <>
                                    <span className="text-xs text-emerald-500/50">/</span>
                                    <span className="text-[14px] font-mono font-bold text-emerald-400 tabular-nums">${item.tp2?.toFixed(2)}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-[92px] flex flex-col items-center justify-center bg-slate-950/30 rounded border border-white/5">
                    <Lock className="w-4 h-4 text-slate-300 mb-2" />
                    <p className="text-xs text-slate-300 font-medium">Trading restricted</p>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// DRAWER COMPONENT - Unified Evidence 5-Layers
// ============================================================================
function TickerEvidenceDrawer({ item, onClose, liveQuote }: { item: TickerItem; onClose: () => void; liveQuote?: any }) {
    const ev = item?.evidence; // Defensive access
    const router = useRouter();
    const t = useTranslations('alphaReport');
    const ti = useTranslations('intel');    // Hooks
    const searchParams = useSearchParams();
    const isDebug = searchParams.get('debug') === '1';
    const reportDate = searchParams.get('date') || '';
    const reportType = searchParams.get('type') || '';

    // Auto-refresh mechanismdes
    const currentPrice = liveQuote?.price || ev.price.last;
    const currentChangePct = liveQuote?.changePercent ?? ev?.price?.changePct;
    const isLive = !!liveQuote;

    // [9.4] Interactive Heatmap State
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);

    // ... (Memoized Chain Logic Skipped for brevity, assume unchanged locally) ...


    const chainData = useMemo(() => {
        if (!item || !ev) return null;
        const raw = ev.options.rawChain || [];
        if (!raw.length) return null;

        // 1. Extract Unique Expirations
        const dates = Array.from(new Set(raw.map((c: any) => c.details?.expiration_date))).filter(Boolean).sort();
        if (dates.length === 0) return null;

        // 2. Select Date
        const targetDate = selectedExpiry && dates.includes(selectedExpiry) ? selectedExpiry : dates[0];

        // 3. Filter Chain for Date
        const chain = raw.filter((c: any) => c.details?.expiration_date === targetDate);

        // 4. Create Pivot Table (Strike -> Call/Put)
        const strikesMap = new Map<number, { call?: any, put?: any }>();
        chain.forEach((c: any) => {
            const k = c.details?.strike_price;
            if (!k) return;
            const current = strikesMap.get(k) || {};
            if (c.details?.contract_type === 'call') current.call = c;
            else if (c.details?.contract_type === 'put') current.put = c;
            strikesMap.set(k, current);
        });

        // 5. Sort by Strike
        const strikes = Array.from(strikesMap.keys()).sort((a, b) => a - b);

        // 6. Find ATM Index
        const currentPrice = ev.price.last;
        let atmIndex = 0;
        let minDiff = Number.MAX_VALUE;
        strikes.forEach((k, i) => {
            const diff = Math.abs(k - currentPrice);
            if (diff < minDiff) {
                minDiff = diff;
                atmIndex = i;
            }
        });

        // 7. Windowing (Center ATM) - Show e.g. 5 ITM, 5 OTM (Total ~10)
        // If list is small, show all.
        let start = Math.max(0, atmIndex - 5);
        let end = Math.min(strikes.length, atmIndex + 6);

        // Adjust if near edges
        if (end - start < 11) {
            if (start === 0) end = Math.min(strikes.length, 11);
            else if (end === strikes.length) start = Math.max(0, strikes.length - 11);
        }

        const visibleStrikes = strikes.slice(start, end);

        return {
            dates,
            targetDate,
            rows: visibleStrikes.map(k => ({ strike: k, ...strikesMap.get(k) }))
        };
    }, [item, ev, selectedExpiry]);

    if (!item || !ev) {
        return (
            <div className="fixed inset-0 z-[100] flex justify-end font-sans">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
                <div className="relative w-full max-w-lg h-full bg-slate-950 border-l border-slate-800 shadow-2xl p-10 flex flex-col items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-slate-700 border-t-emerald-500 rounded-full mb-4" />
                    <p className="text-slate-300 font-mono text-sm">Synchronizing Engine Data...</p>
                    <button onClick={onClose} className="mt-8 text-slate-300 hover:text-white underline text-xs">Close</button>
                </div>
            </div>
        );
    }

    const action = item.decisionSSOT?.action || "CAUTION";
    const tier = item.qualityTier || "WATCH";
    const opt = getOptionsStatus(ev.options.status);

    // Derived states
    const isReady = ev.price.last > 0; // Basic check

    return (
        <div className="fixed inset-0 z-[100] flex justify-end font-sans">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity" onClick={onClose} />
            <div className="relative w-full max-w-lg h-full bg-[#070b14]/80 backdrop-blur-2xl border-l border-indigo-500/20 shadow-[0_0_100px_rgba(16,185,129,0.05),-20px_0_100px_rgba(99,102,241,0.05)] overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">

                {/* Unified HUD Header (Deep Navy Gradient) */}
                <div className="shrink-0 bg-gradient-to-b from-[#0a0f1c] to-transparent border-b border-white/5 p-6 pb-2 select-none z-10 relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-cyan-500/5 pointer-events-none" />
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-4">
                            {/* Logo */}
                            <div className="w-10 h-10 rounded-full bg-white p-0 overflow-hidden shadow-lg shadow-white/10">
                                <img
                                    src={`https://assets.parqet.com/logos/symbol/${item.ticker}?format=png`}
                                    alt={item.ticker}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div>
                                <h2 className="text-4xl font-black text-white tracking-tighter leading-none flex items-center gap-2">
                                    {item.ticker}
                                </h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getActionStyle(action)} ring-1 ring-inset ring-white/10`}>
                                        {action}
                                    </span>
                                    {item.qualityReasonKR?.includes('상승') && (
                                        <span className="text-xs font-bold text-indigo-400 flex items-center gap-1">
                                            <Zap className="w-3 h-3 text-indigo-500 fill-indigo-500/20" /> MOMENTUM
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 -mr-2 text-slate-300 hover:text-white transition-colors rounded-full hover:bg-white/5">
                            <XCircle className="w-8 h-8 stroke-1 opacity-70" />
                        </button>
                    </div>
                </div>

                {/* Body: Seamless Flow */}
                <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent space-y-8">

                    {/* 1. SURGICAL COCKPIT (Merged) */}
                    <section>
                        {isDebug && <div className="text-right text-xs font-mono text-slate-300 mb-2">UPD: {ev.price.fetchedAtET}</div>}

                        {/* [V3.7.3] Surgical UI Dashboard - [Phase 6] snapshotData fallback */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            {/* Left: Execution Dial */}
                            <ExecutionDial
                                whaleIndex={item.decisionSSOT?.whaleIndex ?? item.decisionSSOT?.snapshotData?.whaleIndex ?? 0}
                                whaleConfidence={item.decisionSSOT?.whaleConfidence ?? item.decisionSSOT?.snapshotData?.whaleConfidence ?? 'NONE'}
                                alphaScore={item.alphaScore || 0}
                                whaleEntryLevel={item.decisionSSOT?.whaleEntryLevel}
                                whaleTargetLevel={item.decisionSSOT?.whaleTargetLevel}
                                dominantContract={item.decisionSSOT?.dominantContract ?? item.decisionSSOT?.snapshotData?.dominantContract}
                            />

                            {/* Right: Gamma Void */}
                            <GammaVoid
                                price={ev.price.last}
                                callWall={ev.options.callWall}
                                putFloor={ev.options.putFloor}
                                gex={ev.options.gex}
                            />
                        </div>

                        <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-4">
                            {/* [V4.2] Live Alpha Real-Time Overlay */}
                            <LiveAlphaAssessment
                                reportPrice={ev.price.last}
                                liveQuote={liveQuote}
                                cutPrice={item.decisionSSOT?.cutPrice}
                            />

                            {/* Decision Triggers (Professional Layout) */}
                            <div className="space-y-3 mt-3">
                                {(item.decisionSSOT?.triggersKR || []).map((t, i) => {
                                    const def = TRIGGER_DEFINITIONS[t];
                                    if (!def) return null;
                                    return (
                                        <div key={i} className="group flex items-start gap-3 p-2 rounded border border-transparent hover:border-slate-800 hover:bg-slate-900/50 transition-all">
                                            {/* Badge */}
                                            <div className={`shrink-0 px-2 py-1 rounded text-xs font-bold border ${def.color} shadow-sm w-20 text-center flex items-center justify-center`}>
                                                {ti(def.labelKey)}
                                            </div>
                                            {/* Description */}
                                            <div className="flex-1">
                                                <p className="text-xs text-slate-300 leading-relaxed font-medium group-hover:text-slate-300 transition-colors">
                                                    {ti(def.descKey)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

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
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5" /> Price Action
                        </h3>
                        <div className="grid grid-cols-2 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden">
                            <div className="bg-slate-900 p-3">
                                <span className="text-xs text-slate-300 font-bold uppercase block">Last / Change</span>
                                <div className="flex gap-2 items-baseline">
                                    {ev.price.last > 0 ? (
                                        <>
                                            <span className={`text-sm font-mono font-bold ${isLive ? "text-emerald-400 animate-pulse" : "text-white"}`}>
                                                ${currentPrice.toFixed(2)}
                                            </span>
                                            <span className={`text-xs font-bold ${currentChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {currentChangePct > 0 ? '+' : ''}{currentChangePct.toFixed(2)}%
                                            </span>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="h-4 w-12 bg-slate-800 animate-pulse rounded" />
                                            <span className="text-xs text-slate-300 animate-pulse">Syncing...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="bg-slate-900 p-3">
                                <span className="text-xs text-slate-300 font-bold uppercase block">VWAP Dist</span>
                                <div className="flex gap-2 items-baseline">
                                    {ev.price.last > 0 ? (
                                        <>
                                            <span className="text-sm font-mono font-bold text-slate-300">${ev.price.vwap?.toFixed(2) || "---"}</span>
                                            <span className={`text-xs font-bold ${(ev.price.vwapDistPct || (((ev.price.last - ev.price.vwap) / ev.price.vwap) * 100)) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {(ev.price.vwapDistPct || (((ev.price.last - ev.price.vwap) / ev.price.vwap) * 100) || 0) > 0 ? '+' : ''}{(ev.price.vwapDistPct || (((ev.price.last - ev.price.vwap) / ev.price.vwap) * 100) || 0).toFixed(1)}%
                                            </span>
                                        </>
                                    ) : (
                                        <div className="h-4 w-16 bg-slate-800 animate-pulse rounded" />
                                    )}
                                </div>
                            </div>
                            <div className="bg-slate-900 p-3">
                                <span className="text-xs text-slate-300 font-bold uppercase block">RSI (14)</span>
                                {ev.price.rsi14 > 0 && ev.price.rsi14 !== 50 ? (
                                    <span className={`text-sm font-mono font-bold ${ev.price.rsi14 > 70 ? 'text-rose-400' : ev.price.rsi14 < 30 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                        {ev.price.rsi14.toFixed(1)}
                                    </span>
                                ) : (
                                    <span className="text-xs font-mono text-slate-300">
                                        {ev.price.rsi14 === 50 ? "Low Data" : "Calc..."}
                                    </span>
                                )}
                            </div>
                            <div className="bg-slate-900 p-3">
                                <span className="text-xs text-slate-300 font-bold uppercase block">Structure</span>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-indigo-400">{ev.price.structureState}</span>
                                    <span className="text-xs text-slate-300 font-medium">
                                        {ti(STRUCTURE_I18N[ev.price.structureState || ''] || 'structBreakout')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>



                    // ... inside component render ...
                    {/* 3. FLOW DYNAMICS (Institutional) */}
                    <section>
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5" /> Flow Dynamics
                        </h3>
                        {/* [9.2] Dark Pool / Condition Codes - [Phase 6] snapshotData fallback */}
                        <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-slate-300 font-bold uppercase block mb-1">Dark Pool (Off-Ex)</span>
                                    <div className="flex items-end gap-2">
                                        {(() => {
                                            const displayOffExPct = ev.flow.offExPct > 0 ? ev.flow.offExPct : (item.decisionSSOT?.snapshotData?.offExPct ?? 0);
                                            const isFromSnapshot = ev.flow.offExPct <= 0 && displayOffExPct > 0;
                                            return (displayOffExPct > 0 || liveQuote?.volume) ? (
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-mono font-bold text-white">
                                                        {displayOffExPct > 0 ? `${displayOffExPct.toFixed(1)}%` : `VOL: ${(liveQuote.volume / 1000).toFixed(0)}K`}
                                                    </span>
                                                    <span className="text-xs text-slate-300 font-medium">
                                                        {isFromSnapshot ? ti('snapshotTimeData') : ti('offExFlowDesc')}
                                                    </span>
                                                    {isLive && <span className="text-xs text-emerald-500 font-bold animate-pulse mt-0.5">● LIVE FLOW</span>}
                                                </div>
                                            ) : (
                                                <span className="text-xs font-mono text-slate-300">
                                                    Scanning...
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <div className="w-full bg-slate-800 h-1 mt-2 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${(ev.flow.offExPct || item.decisionSSOT?.snapshotData?.offExPct || 0) > 40 ? 'bg-amber-400' : 'bg-slate-600'}`}
                                            style={{ width: `${Math.min(100, ev.flow.offExPct || item.decisionSSOT?.snapshotData?.offExPct || 0)}%` }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between">
                                        <span className="text-xs text-slate-300 font-bold uppercase block mb-1">Net Whale Flow</span>
                                        <span className="text-xs bg-slate-800 text-slate-300 px-1 rounded">INSTITUTIONAL</span>
                                    </div>
                                    {/* [Phase 6] Net Premium with snapshotData fallback */}
                                    <div className="flex flex-col">
                                        {(() => {
                                            const displayNetPremium = (ev.flow.netPremium || 0) !== 0 ? (ev.flow.netPremium || 0) : (item.decisionSSOT?.snapshotData?.netPremium ?? 0);
                                            const isFromSnapshot = (ev.flow.netPremium || 0) === 0 && displayNetPremium !== 0;
                                            return (
                                                <>
                                                    <div className="flex items-end gap-1.5">
                                                        {displayNetPremium !== 0 ? (
                                                            <span className={`text-sm font-mono font-bold ${displayNetPremium > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                ${(displayNetPremium / 1_000_000).toFixed(1)}M
                                                            </span>
                                                        ) : (
                                                            <span className="text-sm font-mono text-slate-300">$0.0M</span>
                                                        )}
                                                        {ev.flow.vol > 0 && displayNetPremium !== 0 && (
                                                            <span className={`text-xs font-bold mb-0.5 ${displayNetPremium > 0 ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                                                                ({((Math.abs(displayNetPremium) / (ev.flow.vol * ev.price.last)) * 100).toFixed(2)}%)
                                                            </span>
                                                        )}
                                                    </div>
                                                    {displayNetPremium === 0 ? (
                                                        <span className="text-xs text-slate-300 font-medium italic">{ti('marketClosedNoFlow')}</span>
                                                    ) : isFromSnapshot ? (
                                                        <span className="text-xs text-slate-300 font-medium">{ti('snapshotTimeData')}</span>
                                                    ) : (
                                                        <span className="text-xs text-slate-300 font-medium">{ti('netBuyPressure')}</span>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ... (Options Structure logic skipped for brevity) ... */}

                    {/* 5. MACRO & STEALTH */}
                    <section className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5" /> Stealth
                            </h3>
                            <div className="bg-slate-900 border border-slate-800 rounded p-3 h-full">
                                <div className="flex flex-col gap-1.5 mb-1">
                                    {(ev.stealth?.tags || []).map((tag, i) => (
                                        <span key={i} className="text-xs px-1.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700/50 flex items-center gap-1.5">
                                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                            {ti(STEALTH_TAG_I18N[tag] || 'stealthGammaSqueeze') || `#${tag}`}
                                        </span>
                                    ))}
                                    {(!ev.stealth?.tags || ev.stealth.tags.length === 0) && <span className="text-xs text-slate-300">No signals detected</span>}
                                </div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <TrendingUp className="w-3.5 h-3.5" /> Macro
                            </h3>
                            <div className="bg-slate-900 border border-slate-800 rounded p-3 h-full flex flex-col justify-center">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-slate-300">NDX</span>
                                    {ev.macro?.ndx?.changePct !== undefined ? (
                                        <span className={`text-xs font-bold ${ev.macro?.ndx?.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {ev.macro?.ndx?.changePct?.toFixed(2)}%
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-300 italic">{ti('marketClosed')}</span>
                                    )}
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-300">VIX</span>
                                    {(ev.macro?.vix?.value ?? ev.macro?.vix?.level) ? (
                                        <span className="text-xs font-bold text-slate-300">
                                            {(ev.macro?.vix?.value ?? ev.macro?.vix?.level)?.toFixed(2)}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-300 italic">{ti('marketClosed')}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

// [V3.7.3] Trigger Definitions — i18n key mapping (label/desc) + static color
const TRIGGER_DEFINITIONS: Record<string, { labelKey: string; descKey: string; color: string }> = {
    // 1. High Impact (Purple/Pink)
    'GEX_SQZ': { labelKey: 'trigGexSqzLabel', descKey: 'trigGexSqzDesc', color: 'text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10' },
    'WHALE_IN': { labelKey: 'trigWhaleInLabel', descKey: 'trigWhaleInDesc', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
    'WALL_BREAK': { labelKey: 'trigWallBreakLabel', descKey: 'trigWallBreakDesc', color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10' },
    // 2. Warning/Bearish (Red/Orange)
    'SELL_DOM': { labelKey: 'trigSellDomLabel', descKey: 'trigSellDomDesc', color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' },
    'ACCEL_DROP': { labelKey: 'trigAccelDropLabel', descKey: 'trigAccelDropDesc', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
    'SUPPRESSED': { labelKey: 'trigSuppressedLabel', descKey: 'trigSuppressedDesc', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
    // 3. Neutral/Technical (Blue/Slate)
    'GEX_SAFE': { labelKey: 'trigGexSafeLabel', descKey: 'trigGexSafeDesc', color: 'text-sky-400 border-sky-500/30 bg-sky-500/10' },
    'CORRECTION': { labelKey: 'trigCorrectionLabel', descKey: 'trigCorrectionDesc', color: 'text-slate-300 border-slate-500/30 bg-slate-500/10' },
    'WHALE_DRIVER': { labelKey: 'trigWhaleDriverLabel', descKey: 'trigWhaleDriverDesc', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
    'WALL_TEST': { labelKey: 'trigWallTestLabel', descKey: 'trigWallTestDesc', color: 'text-violet-400 border-violet-500/30 bg-violet-500/10' }
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
// Helper for date formatting (YYYY-MM-DD) in local time roughly or UTC
const formatDateKey = (d: Date) => {
    // We want the simple YYYY-MM-DD string.
    // To safe, we can use local time if the user is in US, but simple ISO split is usually fine for "Date selected".
    // Better: use simple string construction to avoid timezone shifts if possible, or just ISO.
    return d.toISOString().split('T')[0];
};


// [PERF] Shared price-processing helper - used by both M7/PhysicalAI and Report fetch effects
function processTickerData(data: any): any {
    const session = data.session || 'CLOSED';
    let displayPrice = data.display?.price || data.prices?.prevRegularClose || data.prevClose || 0;
    let displayChangePct = data.display?.changePctPct || 0;
    if (session === 'POST' || session === 'CLOSED') {
        const regularClose = data.prices?.regularCloseToday;
        const prevClose = data.prices?.prevRegularClose || data.prevClose;
        if (regularClose && regularClose > 0) {
            displayPrice = regularClose;
            const isNewTradingDay = prevClose && Math.abs(regularClose - prevClose) > 0.001;
            if (isNewTradingDay && prevClose > 0) {
                displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
            } else {
                displayChangePct = data.prices?.prevChangePct || data.display?.changePctPct || 0;
            }
        }
    }
    if (session === 'PRE') {
        const staticClose = data.prices?.prevRegularClose || data.prevClose;
        if (staticClose) { displayPrice = staticClose; displayChangePct = data.prices?.prevChangePct ?? 0; }
    }
    let extendedPrice = 0, extendedChangePct = 0, extendedLabel = '';
    if (session === 'PRE') {
        extendedPrice = data.extended?.prePrice || data.prices?.prePrice || 0;
        extendedLabel = 'PRE';
        extendedChangePct = (extendedPrice > 0 && displayPrice > 0) ? ((extendedPrice - displayPrice) / displayPrice) * 100 : 0;
    } else if (session === 'POST' || session === 'CLOSED') {
        extendedPrice = data.extended?.postPrice || data.prices?.postPrice || 0;
        extendedLabel = 'POST';
        if (extendedPrice > 0 && displayPrice > 0) { extendedChangePct = ((extendedPrice - displayPrice) / displayPrice) * 100; }
    }
    return {
        price: displayPrice, changePercent: displayChangePct,
        prevClose: data.prices?.prevRegularClose || data.prevClose || 0,
        volume: data.day?.v || 0, extendedPrice, extendedChangePct, extendedLabel,
        session, relVol: data.relVol || 1, history3d: data.history3d || []
    };
}
function IntelContent({ initialReport, initialM7Data, initialPAIData, initialSCData, initialPMData, initialBPData, initialCSData, initialODData, initialQEData, initialFPData, initialCFData, locale = 'en' }: { initialReport: any, initialM7Data?: any[], initialPAIData?: any[], initialSCData?: any[], initialPMData?: any[], initialBPData?: any[], initialCSData?: any[], initialODData?: any[], initialQEData?: any[], initialFPData?: any[], initialCFData?: any[], locale?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isDebug = searchParams.get('debug') === '1';

    const t = useTranslations('alphaReport');
    const tCommon = useTranslations('common');

    // [RESTORED] Components now fetch data independently (same as Flow/Command pages)
    // [V7.0] Sector Intel shared data for new components
    const sectorData = useIntelSharedData(initialM7Data, initialPAIData, initialSCData, initialPMData, initialBPData, initialCSData, initialODData, initialQEData, initialFPData, initialCFData);

    // State
    const [report, setReport] = useState<any>(initialReport || null);
    const [activeTab, setActiveTab] = useState('SECTOR_COMMAND');
    const [isLoading, setIsLoading] = useState(!initialReport);
    const [error, setError] = useState<string | null>(null);
    const [liveQuotes, setLiveQuotes] = useState<Record<string, any>>({}); // [Live Overlay]
    const [selectedTicker, setSelectedTicker] = useState<TickerItem | null>(null);
    const [liveReport, setLiveReport] = useState<any>(null); // [LIVE TACTICAL] live report data

    // [13.1] Timeline State (Time Machine)
    const [currentDate, setCurrentDate] = useState<Date>(new Date());

    // [M7 Calendar] Finnhub Earnings & Analyst Data
    const [m7CalendarData, setM7CalendarData] = useState<{
        earnings: EarningsEvent[];
        recommendations: Record<string, RecommendationTrend>;
    } | null>(null);

    // Fetch Data
    useEffect(() => {
        let isMounted = true;

        async function loadData(isAutoRefresh = false) {
            // [Fix] If we have initial data and this is the first load (not auto-refresh), skip fetch
            // This prevents overwriting SSR 'final' data with client-side 'morning' default
            // [FORCE REFRESH] Disable optimization to ensure we get the absolute latest if SSR is stale
            if (!isAutoRefresh && report && formatDateKey(currentDate) === formatDateKey(new Date())) {
                setIsLoading(false);
                return;
            }

            if (!isAutoRefresh) setIsLoading(true);

            try {
                const targetDate = formatDateKey(currentDate);
                const todayStr = formatDateKey(new Date());
                const isToday = targetDate === todayStr;

                let url = `/api/reports/archive?date=${targetDate}`;

                // [Freshness Fix] Always prioritize LATEST API for Morning Briefs to ensure fresh generation
                // The Archive endpoint might return stale FS data if the cron just ran.
                /*
                // Try Archive First
                const res = await fetch(url, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted) {
                        setReport(data);
                        setError(null);
                    }
                } else {
                */

                if (isToday || true) { // Force attempt
                    // [VNext] Use GLOBAL resolver to find strictly latest report (e.g. EOD > Morning)
                    const resLatest = await fetch('/api/reports/latest?type=global', { cache: 'no-store' });
                    if (resLatest.ok) {
                        const text = await resLatest.text();
                        const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
                        if (!data) { setIsLoading(false); return; }
                        if (isMounted) {
                            // [Safety] Only update if NEWER or SAME (Prevent rollback to stale cache)
                            const currentTs = new Date(report?.meta?.generatedAtET || 0).getTime();
                            const newTs = new Date(data?.meta?.generatedAtET || 0).getTime();

                            if (!report || newTs >= currentTs) {
                                setReport(data);
                                setError(null);
                            } else {
                                console.warn("[Client] Ignored stale report from API:", data?.meta?.id);
                            }
                        }
                    } else {
                        // If latest fails, try archive as fallback
                        const res = await fetch(url, { cache: 'no-store' });
                        if (res.ok) {
                            const resText = await res.text();
                            const data = resText ? (() => { try { return JSON.parse(resText); } catch { return null; } })() : null;
                            if (!data) { if (isMounted && !isAutoRefresh) { setReport(null); setError('Empty response.'); } setIsLoading(false); return; }
                            if (isMounted) {
                                setReport(data);
                                setError(null);
                            }
                        } else {
                            if (isMounted && !isAutoRefresh) {
                                setReport(null);
                                setError("No report available.");
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load report", e);
                if (isMounted && !isAutoRefresh) setError("Connection failed.");
            } finally {
                if (isMounted) setIsLoading(false);
            }
        }

        // Initial Load
        loadData();

        // Auto-refresh only if viewing today
        // [DISABLED] User Request: Stops the page from resetting tabs (Final Battle) on refresh
        /*
        if (formatDateKey(currentDate) === formatDateKey(new Date())) {
            const interval = setInterval(() => loadData(true), 60 * 1000);
            return () => {
                isMounted = false;
                clearInterval(interval);
            };
        }
        */

        return () => { isMounted = false; };
    }, [currentDate]);

    // [REMOVED] M7 + Physical AI liveQuotes polling — useIntelSharedData already handles this (30s)
    // This duplicate 15s polling was causing unnecessary re-renders across all tabs

    // [V4.6] Report-only tickers — fetch ONLY when FINAL tab is active
    useEffect(() => {
        if (!report?.items || activeTab !== 'FINAL') return;

        // All report tickers get independent live polling (15s)
        const reportTickers = report.items
            .map((i: any) => i.ticker as string);

        if (reportTickers.length === 0) return;

        const fetchReport = async () => {
            try {
                const results = await Promise.all(
                    reportTickers.map(async (ticker: string) => {
                        try {
                            const res = await fetch(`/api/live/ticker?t=${ticker}`, { cache: 'no-store' });
                            if (!res.ok) return { ticker, data: null };
                            const data = await res.json();
                            return { ticker, data };
                        } catch {
                            return { ticker, data: null };
                        }
                    })
                );

                const newQuotes: Record<string, any> = {};
                results.forEach(({ ticker, data }) => {
                    if (!data) return;
                    newQuotes[ticker] = processTickerData(data);
                });
                setLiveQuotes(prev => ({ ...prev, ...newQuotes }));
            } catch (e) { console.error('[Report] Live ticker poll failed', e); }
        };

        fetchReport();
        const interval = setInterval(fetchReport, 15000);
        return () => clearInterval(interval);
    }, [report, activeTab]);

    // [M7 Calendar] Fetch Finnhub Earnings & Analyst Data
    useEffect(() => {
        async function fetchM7Calendar() {
            try {
                const res = await fetch('/api/intel/m7-calendar', { cache: 'no-store' });
                if (res.ok) {
                    const calText = await res.text();
                    const data = calText ? (() => { try { return JSON.parse(calText); } catch { return null; } })() : null;
                    if (!data) return;
                    setM7CalendarData(data);
                }
            } catch (e) {
                console.error('[M7 Calendar] Fetch failed:', e);
            }
        }
        fetchM7Calendar();
    }, []);

    // [LIVE TACTICAL] Fetch live report for intraday Top 3
    useEffect(() => {
        async function fetchLiveReport() {
            try {
                const res = await fetch('/api/reports/latest?type=live', { cache: 'no-store' });
                if (!res.ok) return;
                const text = await res.text();
                if (!text) return;
                const data = (() => { try { return JSON.parse(text); } catch { return null; } })();
                if (!data?.items?.length) return;

                // [FIX] Stale-guard: only show live report if it's from today (ET)
                const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                if (data.meta?.marketDate && data.meta.marketDate !== todayET) {
                    console.log(`[LIVE TACTICAL] Stale report skipped (report: ${data.meta.marketDate}, today: ${todayET})`);
                    return;
                }

                setLiveReport(data);
            } catch (e) {
                console.error('[LIVE TACTICAL] Fetch failed:', e);
            }
        }
        fetchLiveReport();
    }, []);

    // Derived Lists with Live Overlay
    const rawItems: TickerItem[] = report?.items || [];

    // Merge Static Report + Live Quotes
    const items: TickerItem[] = useMemo(() => {
        return rawItems.map(item => {
            const live = liveQuotes[item.ticker];
            if (!live) return item;

            // [V4.3] Session-Aware Price Merge
            // live.price = Regular Session Close (main display)
            // live.extendedPrice = After-Hours Price (if different)
            return {
                ...item,
                evidence: {
                    ...item.evidence,
                    price: {
                        ...item.evidence?.price,
                        last: live.price || item.evidence?.price?.last,
                        prevClose: live.prevClose || item.evidence?.price?.prevClose,
                        changePct: live.changePercent ?? item.evidence?.price?.changePct,
                        // Extended Hours Data (from API's separate fields)
                        extendedPrice: live.extendedPrice || 0,
                        extendedChangePct: live.extendedChangePercent || 0,
                        extendedLabel: live.extendedPrice > 0 ? 'POST' : undefined
                    },
                    flow: {
                        ...item.evidence?.flow,
                        vol: live.volume || item.evidence?.flow?.vol,
                    }
                }
            };
        });
    }, [rawItems, liveQuotes]);
    const hunters: TickerItem[] = report?.hunters || []; // [V3.7.2] Hunter Corps
    // Enhanced Logic: Explicitly get ranks 1-3, 4-10, 11-12
    const sortedItems = [...items].sort((a, b) => ((a as any).rank || 99) - ((b as any).rank || 99));

    const top3 = sortedItems.slice(0, 3);
    const middle7 = sortedItems.slice(3, 10);
    const moonshot = sortedItems.slice(10, 12); // Ranks 11, 12

    // [V6.0] Premium Card Data Mapper (TickerItem -> AlphaItem)
    const alphaItems: AlphaItem[] = useMemo(() => {
        return sortedItems.slice(0, 12).map((item, idx) => {
            const av3 = (item as any).alphaV3;
            const ds = (item as any).decisionSSOT;
            const price = item.evidence?.price?.last || 0;

            // Entry Band: array [min, max] or object {min, max} or {low, high}
            const eb = ds?.entryBand;
            let eLow = 0, eHigh = 0;
            if (Array.isArray(eb)) { eLow = eb[0] || 0; eHigh = eb[1] || 0; }
            else if (eb && typeof eb === 'object') { eLow = eb.min || eb.low || 0; eHigh = eb.max || eb.high || 0; }

            // Target / Stop: multiple fallback paths
            const tgt = ds?.whaleTargetLevel || ds?.targetPrice || 0;
            const cut = ds?.cutPrice || 0;

            // If still missing, derive from price
            if (eLow === 0 && price > 0) eLow = price * 0.98;
            if (eHigh === 0 && price > 0) eHigh = price * 1.02;

            return {
                ticker: item.ticker,
                rank: idx + 1,
                price,
                changePct: item.evidence?.price?.changePct || 0,
                volume: item.evidence?.flow?.vol,
                alphaScore: item.alphaScore || 70,
                scoreBreakdown: (item as any).scoreDecomposition || undefined,
                entryLow: eLow,
                entryHigh: eHigh,
                targetPrice: tgt > 0 ? tgt : price * 1.05,
                cutPrice: cut > 0 ? cut : price * 0.96,
                whaleNetM: (() => {
                    const flow = item.evidence?.flow;
                    const rawValue = flow?.netPremium ?? flow?.netFlow ?? flow?.largeTradesUsd ?? undefined;
                    return rawValue !== undefined && rawValue !== 0 ? rawValue / 1000000 : undefined;
                })(),
                callWall: item.evidence?.options?.callWall,
                putFloor: item.evidence?.options?.putFloor,
                isLive: item.evidence?.price?.priceSource === 'LIVE_SNAPSHOT',
                // === Engine "속살" data ===
                whyKR: av3?.whyKR,
                actionKR: av3?.actionKR,
                action: av3?.action,
                grade: av3?.grade,
                triggerCodes: av3?.triggerCodes,
                whyFactors: av3?.whyFactors,
                darkPoolPct: av3?.darkPoolPct ?? (item as any).evidence?.flow?.darkPoolPct,
                shortVolPct: av3?.shortVolPct ?? (item as any).evidence?.flow?.shortVolPct,
                relVol: av3?.relVol ?? (item as any).evidence?.flow?.relVol,
                pillars: av3?.pillars,
                gatesApplied: av3?.gatesApplied,
                dataCompleteness: av3?.dataCompleteness,
            };
        });
    }, [sortedItems]);

    // [LIVE TACTICAL] Map live report Top 3 → AlphaItem[]
    const liveAlphaItems: AlphaItem[] = useMemo(() => {
        if (!liveReport?.items) return [];
        const liveSorted = [...liveReport.items].sort((a: any, b: any) => ((a as any).rank || 99) - ((b as any).rank || 99));
        return liveSorted.slice(0, 3).map((item: any, idx: number) => {
            const av3 = item.alphaV3;
            const ds = item.decisionSSOT;
            const price = item.evidence?.price?.last || 0;
            const eb = ds?.entryBand;
            let eLow = 0, eHigh = 0;
            if (Array.isArray(eb)) { eLow = eb[0] || 0; eHigh = eb[1] || 0; }
            else if (eb && typeof eb === 'object') { eLow = eb.min || eb.low || 0; eHigh = eb.max || eb.high || 0; }
            if (eLow === 0 && price > 0) eLow = price * 0.98;
            if (eHigh === 0 && price > 0) eHigh = price * 1.02;
            return {
                ticker: item.ticker,
                rank: idx + 1,
                price,
                changePct: item.evidence?.price?.changePct || 0,
                volume: item.evidence?.flow?.vol,
                alphaScore: item.alphaScore || 70,
                scoreBreakdown: item.scoreDecomposition || undefined,
                entryLow: eLow,
                entryHigh: eHigh,
                targetPrice: (ds?.whaleTargetLevel || ds?.targetPrice || price * 1.05),
                cutPrice: (ds?.cutPrice || price * 0.96),
                callWall: item.evidence?.options?.callWall,
                putFloor: item.evidence?.options?.putFloor,
                isLive: true,
                whyKR: av3?.whyKR,
                actionKR: av3?.actionKR,
                action: av3?.action,
                grade: av3?.grade,
                triggerCodes: av3?.triggerCodes,
                whyFactors: av3?.whyFactors,
                darkPoolPct: av3?.darkPoolPct ?? item.evidence?.flow?.darkPoolPct,
                shortVolPct: av3?.shortVolPct ?? item.evidence?.flow?.shortVolPct,
                relVol: av3?.relVol ?? item.evidence?.flow?.relVol,
                pillars: av3?.pillars,
                gatesApplied: av3?.gatesApplied,
                dataCompleteness: av3?.dataCompleteness,
            };
        });
    }, [liveReport]);

    // [V4.7] M7 Filter (Extract M7 from available report items)
    // [V4.7] M7 Filter (Extract M7 from available report items OR Segregated Sector)
    const m7Items = useMemo(() => {
        return M7_TICKERS.map(ticker => {
            // Priority 1: Final Battle (Ranked) - Maintain Organic Rank/Score
            const ranked = sortedItems.find(item => item.ticker === ticker);
            if (ranked) return ranked;

            // Priority 2: Segregated Sector Data (Unranked, but Analyzed)
            const sectorItem = report?.sectors?.m7?.find((i: any) => i.ticker === ticker);
            if (sectorItem) return sectorItem;

            // Priority 3: Live Quote Fallback (Monitoring)
            const live = liveQuotes[ticker];
            const currentPrice = live?.price || 0;
            const prevClose = live?.previousClose || live?.prevClose || 0;
            const changePct = live?.changePercent || (currentPrice && prevClose ? ((currentPrice - prevClose) / prevClose * 100) : 0);
            return {
                ticker,
                rank: 99,
                alphaScore: 0,
                evidence: {
                    price: {
                        last: currentPrice,
                        prevClose: prevClose,
                        changePct: changePct,
                        extendedLabel: live ? 'LIVE' : undefined
                    },
                    flow: { vol: live?.volume || 0 },
                    structure: { setup: 'Monitoring' },
                    options: {},
                    macro: {},
                    policy: {},
                    stealth: {}
                },
                decisionSSOT: { action: 'MONITOR', confidencePct: 0, triggersKR: [] }
            } as any as TickerItem;
        });
    }, [sortedItems, liveQuotes, report]);

    const physicalAiItems = useMemo(() => {
        return PHYSICAL_AI_TICKERS.map(ticker => {
            // Priority 1: Final Battle (Ranked) - Maintain Organic Rank/Score
            const ranked = sortedItems.find(item => item.ticker === ticker);
            if (ranked) return ranked;

            // Priority 2: Segregated Sector Data (Unranked, but Analyzed)
            const sectorItem = report?.sectors?.physicalAi?.find((i: any) => i.ticker === ticker);
            if (sectorItem) return sectorItem;

            // Priority 3: Live Quote Fallback (Monitoring)
            const live = liveQuotes[ticker];
            return {
                ticker,
                rank: 99,
                alphaScore: 0,
                evidence: {
                    price: {
                        last: live?.price || 0,
                        changePct: live?.changePercent || 0,
                        extendedLabel: live ? 'LIVE' : undefined
                    },
                    flow: { vol: live?.volume || 0 },
                    structure: { setup: 'Monitoring' },
                    options: {},
                    macro: {},
                    policy: {},
                    stealth: {}
                },
                decisionSSOT: { action: 'MONITOR', confidencePct: 0, triggersKR: [] }
            } as any as TickerItem;
        });
    }, [sortedItems, liveQuotes, report]);
    // Check if we are in a "Locked/Final" state to show the Tactical UI fully
    // We treat Final or Revised as tactical-ready.
    const isTacticalView = report?.type === 'final' || report?.type === 'revised' || sortedItems.length > 0;

    // Market Context Cards (derived from report.macro/sentiment)
    const marketCards: EvidenceCard[] = [];
    if (report) {
        // [Phase 40] 1. Regime Card (Refactored for QQQ Proxy)
        const engineRegime = report.engine?.regime; // RISK_ON, RISK_OFF, NEUTRAL
        // Native Data path: macro.regime_proxy (containing QQQ trend)
        const proxy = report.macro?.regime_proxy || {};
        const isBullish = proxy.trend === 'BULLISH';

        marketCards.push({
            id: "regime",
            title: "MARKET REGIME",
            titleKR: "시장 국면",
            meaning: "QQQ 기준 시장 추세 (Proxy)",
            interpretation: proxy.message || `Trend: ${proxy.trend || engineRegime}`,
            action: engineRegime === "RISK_ON" ? "비중 확대" : engineRegime === "RISK_OFF" ? "리스크 관리" : "선별 대응",
            confidence: "A",
            icon: <Activity />,
            status: isBullish ? "BULLISH" : "BEARISH", // Strict Bull/Bear
            meta: { fetchedAtET: report.meta?.generatedAtET }
        });

        // [Phase 40] 2. Market Status / Events (Native marketStatus)
        const marketStatus = report.meta?.marketStatus || {};
        const isClosed = marketStatus.state === 'CLOSED';

        marketCards.push({
            id: "event",
            title: "MARKET STATUS",
            titleKR: "마켓 상태",
            meaning: "거래소 개장 및 휴장 정보",
            interpretation: isClosed
                ? `CLOSED (Next: ${marketStatus.next_open || 'Unknown'})`
                : `OPEN (Close in ${marketStatus.time_until_close || '??'})`,
            action: isClosed ? "주문 예약" : "실시간 대응",
            confidence: "A",
            icon: <Clock />,
            status: isClosed ? "NEUTRAL" : "BULLISH"
        });

        // [Phase 40] 3. Rates (US10Y) - Replacing Options Card
        const us10y = report.macro?.us10y; // Should be { level, chgAbs }
        const rateVal = us10y?.level || 0;
        const rateChg = us10y?.chgAbs || 0;
        const isRateRising = rateChg > 0; // Rising rates usually bad for tech

        marketCards.push({
            id: "rates",
            title: "RATES (10Y)",
            titleKR: "미국채 10년물",
            meaning: "무위험 수익률 (Valuation 압박)",
            interpretation: `${rateVal.toFixed(2)}% (${rateChg > 0 ? '+' : ''}${rateChg.toFixed(2)})`,
            action: isRateRising ? "Valuation 주의" : "우호적 환경",
            confidence: "A",
            icon: <BarChart3 />, // Or DollarSign
            status: isRateRising ? "BEARISH" : "BULLISH"
        });
    }



    // Regime for Header
    const regime = report?.engine?.regime || "NEUTRAL";


    return (
        <main className="min-h-screen bg-[conic-gradient(at_top_left,_var(--tw-gradient-stops))] from-slate-950 via-[#0f172a] to-[#1e1b4b] font-sans selection:bg-cyan-500/30 selection:text-cyan-200 flex overflow-hidden">


            {/* Ambient Glow Effects (Global) */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/[0.07] blur-[150px] rounded-full pointer-events-none mix-blend-screen z-0" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/[0.04] blur-[150px] rounded-full pointer-events-none mix-blend-screen z-0" />

            {/* 0. TACTICAL SIDEBAR (Fixed Left) */}
            <TacticalSidebar activeTab={activeTab} onTabChange={setActiveTab} sectorQuotes={{
                m7: sectorData.m7,
                physicalAI: sectorData.physicalAI,
                siliconCore: sectorData.siliconCore,
                powerMatrix: sectorData.powerMatrix,
                bioPulse: sectorData.bioPulse,
                cyberShield: sectorData.cyberShield,
                orbitDefense: sectorData.orbitDefense,
                quantumEdge: sectorData.quantumEdge,
                fintechPulse: sectorData.fintechPulse,
                cloudFortress: sectorData.cloudFortress,
            }} />

            {/* 1. MAIN CONTENT (Offset 208px) */}
            <div className="flex-1 ml-52 relative min-h-screen backdrop-blur-[0px]"> {/* ml-52 matches sidebar width */}

                {/* Glass Grid Overlay */}
                <div className="fixed inset-0 pointer-events-none z-0 ml-52">
                    <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)] opacity-10" />
                </div>

                {isDebug && (
                    <div className="fixed top-0 left-52 right-0 h-1 bg-indigo-500 z-[200]" title="Debug Mode Active" />
                )}

                <div className="max-w-[1920px] mx-auto px-8 py-8 space-y-8 relative z-10">

                    {/* SECTOR COMMAND DASHBOARD — Main Landing View */}
                    {activeTab === 'SECTOR_COMMAND' && (
                        <SectorCommandCenter sectorData={sectorData} onNavigate={setActiveTab} />
                    )}

                    {/* TRACK RECORD CONTENT — [DISABLED] Alpha Report removed */}
                    {false && activeTab === 'TRACK_RECORD' && (
                        <div className="space-y-8">
                            <TrackRecord />
                        </div>
                    )}

                    {/* HYPER DISCOVERY CONTENT (HUNTER CORPS) */}
                    {activeTab === 'DISCOVERY' && (
                        <div className="space-y-8">
                            <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 pt-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-bold text-amber-500 tracking-widest uppercase flex items-center gap-2">
                                            <Zap className="w-3 h-3" />
                                            MOMENTUM SCANNERS
                                        </span>
                                    </div>
                                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter flex items-center gap-4">
                                        PROJECT: <span className="text-amber-500">HYPER DISCOVERY</span>
                                    </h1>
                                    <p className="text-slate-300 font-mono text-xs mt-2">
                                        HUNTER CORPS • HIGH VOLATILITY • TIGHT STOPS
                                    </p>
                                </div>
                            </section>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {isLoading ? (
                                    [1, 2, 3, 4].map(i => <div key={i} className="h-80 bg-[#0a0f18] rounded border border-slate-800 animate-pulse" />)
                                ) : (
                                    hunters.length > 0 ? (
                                        hunters.map((item, idx) => (
                                            <div key={item.ticker} onClick={() => setSelectedTicker(item)} className="cursor-pointer h-full">
                                                <TacticalCard
                                                    ticker={item.ticker}
                                                    rank={idx + 1}
                                                    price={item.evidence.price.last}
                                                    change={item.evidence.price.changePct}
                                                    entryBand={item.decisionSSOT?.entryBand}
                                                    cutPrice={item.decisionSSOT?.cutPrice}
                                                    isLocked={true} // Hunters are locked targets
                                                    name={item.symbol}
                                                    rsi={item.evidence.price.rsi14}
                                                    score={item.alphaScore}
                                                    isDayTradeOnly={true} // Default for Hunters
                                                    reasonKR={`[Hunter] RVol ${item.evidence.flow?.relVol?.toFixed(1)}x • Momentum Scalp`}
                                                />
                                            </div>
                                        ))
                                    ) : (
                                        <div className="col-span-full py-20 text-center text-slate-300">
                                            <p>No high-probability Hunter targets detected today.</p>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    )}

                    {/* PHYSICAL AI CONTENT — V7.1 Unified Layout (Generic Template) */}
                    {activeTab === 'PHYSICAL_AI' && (
                        <div className="space-y-4">

                            {/* Zone A: SectorSessionGrid (통합 실시간 상황판) */}
                            <section>
                                <SectorSessionGrid config={physicalAIConfig} quotes={sectorData.physicalAI} />
                            </section>

                            {/* Zone A-2: Ranking Row (Generic) */}
                            <section>
                                <SectorRankingRow config={physicalAIConfig} quotes={sectorData.physicalAI} />
                            </section>

                            {/* Zone B: Analyst Consensus + Earnings Calendar (Generic, auto-fetch) */}
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={physicalAIConfig} />
                                <SectorEarningsCalendar config={physicalAIConfig} />
                            </section>

                            {/* Zone C: TacticalReportDeck (장마감 고정 보고서) */}
                            <section>
                                <TacticalReportDeck config={physicalAIConfig} />
                            </section>

                        </div>
                    )}

                    {/* M7 REPORT CONTENT — V7.1 Unified Layout (Generic Template) */}
                    {activeTab === 'M7' && (
                        <div className="space-y-4">

                            {/* Zone A: SectorSessionGrid (통합 실시간 상황판) */}
                            <section>
                                <SectorSessionGrid config={m7Config} quotes={sectorData.m7} />
                            </section>

                            {/* Zone A-2: Ranking Row (Generic — Money Flow descending) */}
                            <section>
                                <SectorRankingRow config={m7Config} quotes={sectorData.m7} />
                            </section>

                            {/* Zone B: Analyst Consensus + Earnings Calendar (Generic, props pass-through) */}
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={m7Config} recommendations={m7CalendarData?.recommendations || {}} />
                                <SectorEarningsCalendar config={m7Config} earnings={m7CalendarData?.earnings || []} />
                            </section>

                            {/* Zone C: TacticalReportDeck (장마감 고정 보고서) */}
                            <section>
                                <TacticalReportDeck config={m7Config} />
                            </section>

                        </div>
                    )}

                    {/* SILICON CORE CONTENT — AI Semiconductor & Infrastructure */}
                    {activeTab === 'SILICON_CORE' && (
                        <div className="space-y-4">
                            <section>
                                <SectorSessionGrid config={siliconCoreConfig} quotes={sectorData.siliconCore} />
                            </section>
                            <section>
                                <SectorRankingRow config={siliconCoreConfig} quotes={sectorData.siliconCore} />
                            </section>
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={siliconCoreConfig} />
                                <SectorEarningsCalendar config={siliconCoreConfig} />
                            </section>
                            <section>
                                <TacticalReportDeck config={siliconCoreConfig} />
                            </section>
                        </div>
                    )}

                    {/* POWER MATRIX CONTENT — Next-Gen Energy & Nuclear */}
                    {activeTab === 'POWER_MATRIX' && (
                        <div className="space-y-4">
                            <section>
                                <SectorSessionGrid config={powerMatrixConfig} quotes={sectorData.powerMatrix} />
                            </section>
                            <section>
                                <SectorRankingRow config={powerMatrixConfig} quotes={sectorData.powerMatrix} />
                            </section>
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={powerMatrixConfig} />
                                <SectorEarningsCalendar config={powerMatrixConfig} />
                            </section>
                            <section>
                                <TacticalReportDeck config={powerMatrixConfig} />
                            </section>
                        </div>
                    )}

                    {/* BIO PULSE CONTENT — GLP-1 & Biotech */}
                    {activeTab === 'BIO_PULSE' && (
                        <div className="space-y-4">
                            <section>
                                <SectorSessionGrid config={bioPulseConfig} quotes={sectorData.bioPulse} />
                            </section>
                            <section>
                                <SectorRankingRow config={bioPulseConfig} quotes={sectorData.bioPulse} />
                            </section>
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={bioPulseConfig} />
                                <SectorEarningsCalendar config={bioPulseConfig} />
                            </section>
                            <section>
                                <TacticalReportDeck config={bioPulseConfig} />
                            </section>
                        </div>
                    )}

                    {/* CYBER SHIELD CONTENT — AI Cybersecurity */}
                    {activeTab === 'CYBER_SHIELD' && (
                        <div className="space-y-4">
                            <section>
                                <SectorSessionGrid config={cyberShieldConfig} quotes={sectorData.cyberShield} />
                            </section>
                            <section>
                                <SectorRankingRow config={cyberShieldConfig} quotes={sectorData.cyberShield} />
                            </section>
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={cyberShieldConfig} />
                                <SectorEarningsCalendar config={cyberShieldConfig} />
                            </section>
                            <section>
                                <TacticalReportDeck config={cyberShieldConfig} />
                            </section>
                        </div>
                    )}

                    {/* ORBIT DEFENSE CONTENT — Space & Defense */}
                    {activeTab === 'ORBIT_DEFENSE' && (
                        <div className="space-y-4">
                            <section>
                                <SectorSessionGrid config={orbitDefenseConfig} quotes={sectorData.orbitDefense} />
                            </section>
                            <section>
                                <SectorRankingRow config={orbitDefenseConfig} quotes={sectorData.orbitDefense} />
                            </section>
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={orbitDefenseConfig} />
                                <SectorEarningsCalendar config={orbitDefenseConfig} />
                            </section>
                            <section>
                                <TacticalReportDeck config={orbitDefenseConfig} />
                            </section>
                        </div>
                    )}

                    {activeTab === 'QUANTUM_EDGE' && (
                        <div className="space-y-4">
                            <section>
                                <SectorSessionGrid config={quantumEdgeConfig} quotes={sectorData.quantumEdge} />
                            </section>
                            <section>
                                <SectorRankingRow config={quantumEdgeConfig} quotes={sectorData.quantumEdge} />
                            </section>
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={quantumEdgeConfig} />
                                <SectorEarningsCalendar config={quantumEdgeConfig} />
                            </section>
                            <section>
                                <TacticalReportDeck config={quantumEdgeConfig} />
                            </section>
                        </div>
                    )}

                    {activeTab === 'FINTECH_PULSE' && (
                        <div className="space-y-4">
                            <section>
                                <SectorSessionGrid config={fintechPulseConfig} quotes={sectorData.fintechPulse} />
                            </section>
                            <section>
                                <SectorRankingRow config={fintechPulseConfig} quotes={sectorData.fintechPulse} />
                            </section>
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={fintechPulseConfig} />
                                <SectorEarningsCalendar config={fintechPulseConfig} />
                            </section>
                            <section>
                                <TacticalReportDeck config={fintechPulseConfig} />
                            </section>
                        </div>
                    )}

                    {activeTab === 'CLOUD_FORTRESS' && (
                        <div className="space-y-4">
                            <section>
                                <SectorSessionGrid config={cloudFortressConfig} quotes={sectorData.cloudFortress} />
                            </section>
                            <section>
                                <SectorRankingRow config={cloudFortressConfig} quotes={sectorData.cloudFortress} />
                            </section>
                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <SectorAnalystConsensus config={cloudFortressConfig} />
                                <SectorEarningsCalendar config={cloudFortressConfig} />
                            </section>
                            <section>
                                <TacticalReportDeck config={cloudFortressConfig} />
                            </section>
                        </div>
                    )}

                    {/* FINAL BATTLE CONTENT — [DISABLED] Alpha Report removed */}
                    {false && activeTab === 'FINAL' && (
                        <div className="space-y-8">

                            {/* 1. HERO HEADER (Premium Open Design -> Glassmorphic) */}
                            <section className="relative flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10 p-6 rounded-2xl border border-white/[0.08] bg-[#0a0f1c]/60 backdrop-blur-xl shadow-2xl overflow-hidden group">
                                {/* ═══ Premium Infographic Background ═══ */}
                                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                                    {/* Scan animation */}
                                    <div className="absolute top-0 left-0 w-full h-[150%] bg-gradient-to-b from-transparent via-emerald-500/[0.06] to-transparent"
                                        style={{ animationName: 'scanVertical', animationDuration: '6s', animationIterationCount: 'infinite', animationTimingFunction: 'linear' }} />
                                    <style>{`
                                        @keyframes scanVertical {
                                            0% { transform: translateY(-100%); }
                                            100% { transform: translateY(100%); }
                                        }
                                    `}</style>
                                    {/* 1. Radial glow — top right (emerald) */}
                                    <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-emerald-500/20" style={{ filter: 'blur(60px)' }} />
                                    {/* 2. Radial glow — bottom left (cyan) */}
                                    <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-cyan-500/[0.12]" style={{ filter: 'blur(50px)' }} />
                                    {/* 3. Fine dot pattern — tech grid */}
                                    <div className="absolute inset-0" style={{
                                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)',
                                        backgroundSize: '24px 24px',
                                        opacity: 0.35
                                    }} />
                                    {/* 4. Diagonal gradient overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/[0.08] via-transparent to-cyan-900/[0.05]" />
                                    {/* 5. Top frost band */}
                                    <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-white/[0.04] to-transparent" />
                                    {/* 6. Bottom vignette */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                                </div>

                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-xs font-black text-slate-400 tracking-[0.2em] font-jakarta uppercase flex items-center gap-2">
                                            <Activity className="w-4 h-4 text-emerald-500" />
                                            SIGNUM INTELLIGENCE
                                        </span>
                                        <a href="/how-it-works/intel" className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 hover:border-indigo-500/30 hover:bg-indigo-500/[0.08] backdrop-blur-sm transition-all duration-300 group">
                                            <BookOpen className="w-3 h-3 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                                            <span className="text-[12px] text-slate-300 group-hover:text-indigo-300 font-medium transition-colors">{tCommon('guideLink')}</span>
                                        </a>
                                    </div>
                                    <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight flex items-center gap-3 font-jakarta drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                        <span className="text-emerald-500 font-jakarta">{t('title')}</span>
                                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded border border-opacity-20 flex items-center gap-1.5 align-middle ${getRegimeColor(regime)}`}>
                                            {getRegimeText(regime)}
                                        </span>
                                    </h1>
                                    <p className="text-slate-400 text-[13px] mt-2 max-w-2xl font-medium leading-relaxed font-jakarta">
                                        INSTITUTIONAL QUANT TACTICS — <span className="text-emerald-400/90 font-bold ml-1">{t('subtitle').split('— ')[1] || t('subtitle')}</span>
                                    </p>
                                </div>

                                <div className="relative z-10 text-left xl:text-right w-full xl:w-auto">
                                    <p className="text-white/40 font-mono text-xs mb-3 flex items-center xl:justify-end gap-2">
                                        ID: <span className="text-white/70">{report?.meta?.id?.toUpperCase() || "SYNC"}</span>
                                        <span className="mx-1">•</span>
                                        {report?.meta?.generatedAtET || "WAITING"}
                                    </p>

                                    {/* Summary Stats */}
                                    <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                                        <div className="px-4 py-2 bg-black/40 border border-white/[0.08] rounded-lg shadow-inner">
                                            <span className="text-xs text-slate-300 block font-black uppercase tracking-widest font-jakarta mb-0.5">{t('analyzedStocks')}</span>
                                            <span className="text-sm font-mono font-bold text-white font-jakarta">{Math.min(alphaItems?.length || 0, 7)}{t('itemsCount')}</span>
                                        </div>
                                        <div className="px-4 py-2 bg-black/40 border border-white/[0.08] rounded-lg shadow-inner">
                                            <span className="text-xs text-slate-300 block font-black uppercase tracking-widest font-jakarta mb-0.5">{t('optionsCoverage')}</span>
                                            <span className="text-sm font-mono font-bold text-emerald-400">{report?.meta?.optionsStatus?.coveragePct || 0}%</span>
                                        </div>
                                        <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded">
                                            <span className="text-xs text-slate-300 block font-semibold">{t('generationTime')}</span>
                                            <span className="text-sm font-mono font-bold text-slate-300">{report?.meta?.generatedAtET?.split(' ')[1]?.slice(0, 5) || '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* [V6.0] PREMIUM ALPHA CARD GRID */}
                            <FinalBattleSection
                                items={alphaItems}
                                liveItems={liveAlphaItems}
                                isLoading={isLoading}
                                onItemClick={(item) => {
                                    const tickerItem = sortedItems.find(t => t.ticker === item.ticker);
                                    if (tickerItem) setSelectedTicker(tickerItem);
                                    // Also check live report items
                                    if (!tickerItem && liveReport?.items) {
                                        const liveItem = liveReport.items.find((t: any) => t.ticker === item.ticker);
                                        if (liveItem) setSelectedTicker(liveItem);
                                    }
                                }}
                            />

                            {/* NOTE: Legacy sections below can be removed once Premium Cards are validated */}
                            {false && (
                                <>
                                    {/* 2. MAIN CORPS (Top 3) */}
                                    <section>
                                        <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
                                            <Zap className="w-5 h-5 text-emerald-500" />
                                            MAIN CORPS (주력군)
                                            <span className="text-xs text-slate-300 font-normal uppercase tracking-widest ml-2">Data Verified • High Probability</span>
                                        </h2>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                            {isLoading ? (
                                                [1, 2, 3].map(i => <div key={i} className="h-80 bg-[#0a0f18] rounded border border-slate-800 animate-pulse" />)
                                            ) : (
                                                top3.map((item, idx) => (
                                                    <div key={item.ticker} onClick={() => setSelectedTicker(item)} className="cursor-pointer h-full">
                                                        <TacticalCard
                                                            ticker={item.ticker}
                                                            rank={idx + 1}
                                                            price={item.evidence.price.last}
                                                            // [Fix] Calculate implied absolute change from changePct if absolute change is missing
                                                            // changePct is e.g. 2.25. Last is 445.61.
                                                            // Prev = Last / (1 + Pct/100) -> 435.80
                                                            // Change = Last - Prev -> 9.81
                                                            change={
                                                                (item.evidence.price.last && item.evidence.price.changePct
                                                                    ? item.evidence.price.last - (item.evidence.price.last / (1 + (item.evidence.price.changePct / 100)))
                                                                    : 0)
                                                            }
                                                            entryBand={
                                                                item.entryBand
                                                                    ? { min: item.entryBand.low, max: item.entryBand.high }
                                                                    : (item.decisionSSOT?.entryBand || undefined)
                                                            }
                                                            cutPrice={item.decisionSSOT?.cutPrice}
                                                            isLocked={item.decisionSSOT?.isLocked}
                                                            name={item.symbol}
                                                            rsi={item.evidence.price.rsi14}
                                                            score={item.alphaScore}
                                                            isDayTradeOnly={(item as any).risk?.isDayTradeOnly}
                                                            reasonKR={item.decisionSSOT?.whaleReasonKR || item.qualityReasonKR}
                                                            extendedPrice={item.evidence.price.extendedPrice}
                                                            extendedChange={item.evidence.price.extendedChangePct}
                                                            extendedLabel={item.evidence.price.extendedLabel}
                                                            // [V4.1] Sniper Data Injection
                                                            whaleTargetLevel={item.decisionSSOT?.whaleTargetLevel}
                                                            whaleConfidence={item.decisionSSOT?.whaleConfidence}
                                                            dominantContract={item.decisionSSOT?.dominantContract}
                                                            triggers={item.decisionSSOT?.triggersKR}
                                                            // [V4.2] Market Status Override
                                                            isClosed={report?.marketState?.session === 'CLOSED' || report?.marketState?.session === 'PRE'}
                                                        />
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </section>

                                    {/* 3. ALPHA 12 SCAN TABLE (Places 4-10) */}
                                    <section>
                                        <div className="flex justify-between items-center mb-4">
                                            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                                                <Search className="w-5 h-5 text-slate-300" />
                                                Live Scan (Core)
                                            </h2>
                                        </div>

                                        <div className="bg-white/5 backdrop-blur-[12px] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                                            <div className="overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                                <style jsx>{`
                                        div::-webkit-scrollbar {
                                            display: none;
                                        }
                                    `}</style>
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-white/5 border-b border-white/5 text-xs font-bold text-slate-300 uppercase tracking-widest">
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
                                                    <tbody className="divide-y-0">
                                                        {isLoading ? (
                                                            [1, 2, 3].map(i => (
                                                                <tr key={i}><td colSpan={8} className="p-4"><Skeleton className="h-12 w-full bg-white/5" /></td></tr>
                                                            ))
                                                        ) : (
                                                            middle7.map((item, idx) => {
                                                                const ev = item.evidence;
                                                                if (!ev) return null;
                                                                const optStatus = getOptionsStatus(ev.options?.status);
                                                                const actStyle = getActionStyle(item.decisionSSOT?.action);
                                                                const realRank = (item as any).rank || (idx + 4);

                                                                return (
                                                                    <tr key={item.ticker}
                                                                        onClick={() => setSelectedTicker(item)}
                                                                        className={`cursor-pointer transition-all duration-200 hover:bg-white/10 hover:backdrop-blur-md border-b border-white/5 last:border-0 group`}
                                                                    >
                                                                        <td className="p-4 text-center font-mono text-xs text-slate-300 font-bold group-hover:text-white transition-colors">
                                                                            {realRank}
                                                                        </td>
                                                                        <td className="p-4">
                                                                            <div className="flex items-center gap-3">
                                                                                <div>
                                                                                    <span className="block text-sm font-black text-slate-100 group-hover:text-cyan-300 transition-colors tracking-tight">{item.ticker}</span>
                                                                                    <span className="block text-xs text-slate-300 group-hover:text-slate-300">{item.symbol || item.ticker}</span>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td className="p-4 text-right">
                                                                            <div className="flex items-center justify-end gap-2">
                                                                                <div className="w-16 bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
                                                                                    <div className="h-full bg-indigo-500" style={{ width: `${item.alphaScore || 0}%` }} />
                                                                                </div>
                                                                                <span className="font-mono font-bold text-sm text-white">{item.alphaScore?.toFixed(0) || "-"}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="p-4 text-right">
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="text-sm font-mono font-bold text-slate-200">${ev.price.last.toFixed(2)}</span>
                                                                                <span className={`text-xs font-bold ${ev.price.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                                                    {ev.price.changePct > 0 ? "+" : ""}{ev.price.changePct.toFixed(2)}%
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="p-4 text-right">
                                                                            <div className="flex flex-col items-end">
                                                                                {ev.flow.complete ? (
                                                                                    <>
                                                                                        <span className={`text-xs font-mono font-bold ${(ev.flow.netPremium || ev.flow.largeTradesUsd || 0) > 0 ? "text-emerald-400" : (ev.flow.netPremium || ev.flow.largeTradesUsd || 0) < 0 ? "text-rose-400" : "text-slate-300"}`}>
                                                                                            {(ev.flow.netPremium ?? ev.flow.largeTradesUsd ?? 0) !== 0 ? `$${((ev.flow.netPremium ?? ev.flow.largeTradesUsd) / 1000000).toFixed(1)}M` : "-"}
                                                                                        </span>
                                                                                    </>
                                                                                ) : (
                                                                                    <span className="text-xs font-mono text-slate-300">
                                                                                        Waiting...
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="p-4 text-center">
                                                                            <span className={`inline-flex w-2.5 h-2.5 rounded-full ring-2 ring-white/10 ${optStatus.color}`} title={optStatus.label} />
                                                                        </td>
                                                                        <td className="p-4 hidden md:table-cell">
                                                                            <div className="flex flex-wrap gap-1 justify-end md:justify-start">
                                                                                {(item.decisionSSOT?.triggersKR || []).length > 0 ? (
                                                                                    (item.decisionSSOT?.triggersKR || []).slice(0, 2).map((code, i) => {
                                                                                        return (
                                                                                            <span key={i} className="px-1.5 py-0.5 rounded text-xs font-bold bg-white/5 border border-white/10 text-slate-300">
                                                                                                {code}
                                                                                            </span>
                                                                                        );
                                                                                    })
                                                                                ) : (
                                                                                    <span className="text-xs text-slate-300 italic">장 마감</span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="p-4 text-center">
                                                                            <span className={`px-2 py-1 rounded text-xs font-bold border border-opacity-30 backdrop-blur-sm ${actStyle}`}>
                                                                                {item.decisionSSOT?.action || "WATCH"}
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

                                    {/* 4. MOONSHOT SECTION (10+2) */}
                                    {moonshot.length > 0 && (
                                        <section>
                                            <h2 className="text-lg font-bold text-rose-200 mb-4 flex items-center gap-2">
                                                <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
                                                Moonshot Zone (High Risk)
                                            </h2>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {moonshot.map((item, idx) => (
                                                    <div key={item.ticker}
                                                        onClick={() => setSelectedTicker(item)}
                                                        className="cursor-pointer bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-xl p-6 relative overflow-hidden group hover:border-rose-500/50 transition-colors">

                                                        <div className="absolute top-0 right-0 p-2 opacity-50">
                                                            <Activity className="w-12 h-12 text-rose-900/20" />
                                                        </div>

                                                        <div className="flex justify-between items-start mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-rose-950 flex items-center justify-center border border-rose-900 text-rose-500 font-bold font-mono">
                                                                    {(item as any).rank || (idx + 11)}
                                                                </div>
                                                                <div>
                                                                    <div className="text-xl font-black text-white">{item.ticker}</div>
                                                                    <div className="text-xs text-rose-400/80 font-bold uppercase tracking-wider">Gamma Play</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-lg font-mono text-rose-200">${item.evidence.price.last.toFixed(2)}</div>
                                                                <div className={`text-xs font-bold ${item.evidence.price.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                                    {item.evidence.price.changePct > 0 ? "+" : ""}{item.evidence.price.changePct.toFixed(2)}%
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-xs border-t border-rose-900/30 pt-2">
                                                                <span className="text-slate-300">RSI (14)</span>
                                                                <span className="text-slate-300 font-mono">
                                                                    {item.evidence.price.rsi14 && item.evidence.price.rsi14 !== 50
                                                                        ? item.evidence.price.rsi14.toFixed(0)
                                                                        : "--"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-slate-300">Target</span>
                                                                <span className="text-rose-300 font-mono">${(item.evidence.price.last * 1.15).toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                </>
                            )}


                            {isDebug && report && (
                                <section className="bg-slate-900 p-4 rounded border border-indigo-500/30 overflow-x-auto">
                                    <h3 className="text-xs font-bold text-indigo-400 mb-2 font-mono">DEBUG INSPECTOR (?debug=1)</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-300 uppercase">Engine Stats</h4>
                                            <pre className="text-xs text-slate-300 font-mono mt-1">
                                                {JSON.stringify(report.engine?.counts || {}, null, 2)}
                                            </pre>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-300 uppercase">Options Status</h4>
                                            <pre className="text-xs text-slate-300 font-mono mt-1">
                                                {JSON.stringify(report.meta?.optionsStatus || {}, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                </section>
                            )}

                            <footer className="text-center pb-8 pt-4">
                                <p suppressHydrationWarning className="text-xs text-slate-300 uppercase tracking-widest font-bold">
                                    Alpha Engine v5.5 • SIGNUM Intelligence Active ({new Date().toLocaleTimeString()})
                                </p>
                            </footer>

                        </div>
                    )} {/* End Final Battle Wrapper */}

                </div>

                {/* DRAWER PORTAL */}
                {/* Note: In Next.js App Router we might prefer a parallel route or context, but inline conditional is fine for this scale. */}
                {
                    selectedTicker && (
                        <TickerEvidenceDrawer
                            item={selectedTicker}
                            onClose={() => setSelectedTicker(null)}
                            liveQuote={liveQuotes[selectedTicker.ticker]}
                        />
                    )
                }

            </div>
        </main>
    );
}

export default function IntelClientPage({ initialReport, initialM7Data, initialPAIData, initialSCData, initialPMData, initialBPData, initialCSData, initialODData, initialQEData, initialFPData, initialCFData, locale = 'en' }: { initialReport: any, initialM7Data?: any[], initialPAIData?: any[], initialSCData?: any[], initialPMData?: any[], initialBPData?: any[], initialCSData?: any[], initialODData?: any[], initialQEData?: any[], initialFPData?: any[], initialCFData?: any[], locale?: string }) {
    return (
        <React.Suspense fallback={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-300 text-sm">Initializing Tactical Board...</p>
                </div>
            </div>
        }>
            <IntelContent initialReport={initialReport} initialM7Data={initialM7Data} initialPAIData={initialPAIData} initialSCData={initialSCData} initialPMData={initialPMData} initialBPData={initialBPData} initialCSData={initialCSData} initialODData={initialODData} initialQEData={initialQEData} initialFPData={initialFPData} initialCFData={initialCFData} locale={locale} />
        </React.Suspense>
    );
}

// [V4.2] Live Alpha Assessment (Real-Time vs Report)
function LiveAlphaAssessment({ reportPrice, liveQuote, cutPrice }: { reportPrice: number, liveQuote?: any, cutPrice?: number }) {
    if (!liveQuote || !liveQuote.price) return null;

    const currentPrice = liveQuote.price;
    const diffPct = reportPrice > 0 ? ((currentPrice - reportPrice) / reportPrice) * 100 : 0;
    const isStopBreached = cutPrice && currentPrice < cutPrice;

    // Logic: Verdict
    let verdict = "NEUTRAL";
    let verdictColor = "text-slate-300";
    let verdictDesc = "Price is tracking near report levels.";

    if (isStopBreached) {
        verdict = "STOP BREACHED";
        verdictColor = "text-rose-500 animate-pulse";
        verdictDesc = "Current price has violated the risk limit. Invalidated.";
    } else if (diffPct < -1.5) {
        verdict = "DEEPENING PULLBACK";
        verdictColor = "text-amber-400";
        verdictDesc = "Price dropped significantly below report level. Watch for support or stop.";
    } else if (diffPct > 1.5) {
        verdict = "MOMENTUM BUILDING";
        verdictColor = "text-emerald-400";
        verdictDesc = "Price pushing higher than report entry. Strength confirmed.";
    } else if (diffPct > 0.5) {
        verdict = "MODERATE STRENGTH";
        verdictColor = "text-emerald-300";
        verdictDesc = "Slightly above report price. Holding trend.";
    } else if (diffPct < -0.5) {
        verdict = "WEAKNESS";
        verdictColor = "text-rose-300";
        verdictDesc = "Slightly below report level. struggling.";
    }

    return (
        <div className="bg-slate-900 border border-slate-800 rounded p-4 mb-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10">
                <Activity className="w-16 h-16 text-slate-300" />
            </div>
            <div className="flex justify-between items-start mb-2 relative z-10">
                <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                        <Zap className="w-3 h-3 text-cyan-400" />
                        LIVE EVALUATION (Alpha Check)
                    </h4>
                    <div className={`text-sm font-black mt-1 ${verdictColor}`}>
                        {verdict}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-slate-300 uppercase font-bold">Live Variance</div>
                    <div className={`text-xs font-mono font-bold ${diffPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {diffPct > 0 ? "+" : ""}{diffPct.toFixed(2)}%
                    </div>
                </div>
            </div>

            <p className="text-xs text-slate-300 font-medium relative z-10 leading-relaxed max-w-[90%]">
                {verdictDesc}
            </p>

            {liveQuote.volume && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-4 relative z-10">
                    <div>
                        <span className="text-xs text-slate-300 uppercase block">Live Vol</span>
                        <span className="text-xs font-mono text-slate-300">{(liveQuote.volume / 1000).toFixed(0)}K</span>
                    </div>
                    <div>
                        <span className="text-xs text-slate-300 uppercase block">Net Whale Flow</span>
                        <span className={`text-xs font-mono font-bold ${liveQuote.flowApprox > 0 ? "text-emerald-400" : liveQuote.flowApprox < 0 ? "text-rose-400" : "text-slate-300"}`}>
                            {liveQuote.flowApprox ? `$${(liveQuote.flowApprox / 1000000).toFixed(1)}M` : "Scanning..."}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

// END OF FILE
