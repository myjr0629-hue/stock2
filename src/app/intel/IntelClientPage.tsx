"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    AlertCircle, TrendingUp, TrendingDown, Activity,
    ChevronRight, Shield, Clock, Zap, DollarSign,
    BarChart3, Target, XCircle, CheckCircle, AlertTriangle,
    Lock, Unlock, Eye, ArrowUpRight, ArrowDownRight,
    Search, Layers, CheckCircle2,
    Orbit,
    Bot
} from "lucide-react";
import { ReportArchive } from "@/components/ReportArchive";
import { TacticalCard } from "@/components/TacticalCard";
import { TacticalSidebar } from "@/components/TacticalSidebar"; // [NEW]
import { PremiumBlur } from "@/components/PremiumBlur";
import { TacticalBoard } from "@/components/intel/TacticalBoard"; // [NEW]
import { M7OrbitalMap } from "@/components/intel/M7OrbitalMap";
import { M7BriefingBar } from "@/components/intel/M7BriefingBar";
import { M7TacticalDeck } from "@/components/intel/M7TacticalDeck";
import { PhysicalAIOrbitalMap } from "@/components/intel/PhysicalAIOrbitalMap";
import { PhysicalAIBriefingBar, PhysicalAITacticalDeck } from "@/components/intel/PhysicalAIComponents";


// ============================================================================
// [V4.6] Stealth Tag Translator (Korean)
// ============================================================================
const STEALTH_TAG_MAP: Record<string, string> = {
    'GammaSqueeze': '감마 스퀴즈 (폭등 전조)',
    'WhaleAccumulation': '기관 매집 (바닥 다지기)',
    'AI_Momentum': 'AI 모멘텀 (주도주 강세)',
    'SectorLeader': '섹터 대장주 (수급 쏠림)',
    'SafeHaven': '안전 자산 (방어적 매수)',
    'TechRotation': '기술주 순환매 (자금 이동)',
    'SemiSemi': '반도체 동조화 (동반 상승)',
    'CatchUp': '기맞추기 반등 (후발 주자)',
    'Consolidation': '기간 조정 (매물 소화)',
    'CloudGrowth': '클라우드 성장성 (실적 기대)',
    'ValueTech': '가치주 성격 부각 (저평가)',
    'AdRev': '광고 매출 회복 (펀더멘털)',
    'Efficiency': '효율화 달성 (비용 절감)',
    'Social': '소셜 미디어 지배력',
    'Prime': 'Prime 구독 락인 효과',
    'AWS': '클라우드 점유율 1위',
    'Streaming': '스트리밍 지배력',
    'Content': '컨텐츠 경쟁력',
    'GovTech': '정부 수주 독점력',
    'AI_Defense': '국방 AI 수혜',
    'CryptoVol': '코인 변동성 연동',
    'Exchange': '거래소 수수료 수익',
    'BitcoinLev': '비트코인 레버리지',
    'HighBeta': '고베타 (높은 변동성)'
};

// [V4.6] Structure State Translator (Korean)
const STRUCTURE_MAP: Record<string, string> = {
    'Breakout': '강력한 상승 돌파 (매수 기회)',
    'BullFlag': '상승 깃발형 (추세 지속)',
    'Consolidation': '기간 조정 (에너지 응축)',
    'Rebound': '기술적 반등 (단기)',
    'Bottoming': '바닥 다지기 (저점 확인)',
    'BoxRange': '박스권 횡보 (방향 탐색)',
    'TrendUp': '상승 추세 (우상향)',
    'SlowGrind': '완만한 상승 (매물 소화)',
    'Weakness': '추세 약화 (주의)',
    'VolExpansion': '변동성 확대 (방향성 결정)',
    'Correction': '건전한 조정 (눌림목)',
    'DeepPullback': '과도한 하락 (저가 매수)'
};

// [V4.7] M7 Watchlist
const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const PHYSICAL_AI_TICKERS = ['PLTR', 'ISRG', 'SYM', 'TER', 'RKLB', 'SERV'];

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

import { PulseCard } from "@/components/PulseCard";
import { ExecutionDial } from "@/components/ExecutionDial";
import { GammaVoid } from "@/components/GammaVoid";
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
    let tagStyle = "text-slate-500";
    if (source === "OFFICIAL_CLOSE") { tag = "CLOSE"; tagStyle = "text-slate-500 bg-slate-800/50 border-slate-700"; }
    else if (source === "POST_CLOSE") { tag = "POST"; tagStyle = "text-indigo-300 bg-indigo-500/10 border-indigo-500/30"; }
    else if (source === "PRE_OPEN") { tag = "PRE"; tagStyle = "text-amber-300 bg-amber-500/10 border-amber-500/30"; }
    else if (source === "LIVE_SNAPSHOT") { tag = "LIVE"; tagStyle = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"; }

    return (
        <div onClick={onClick} className={cn(
            "relative rounded-xl p-6 cursor-pointer transition-all duration-300 overflow-hidden",
            // Glassmorphism Base
            "bg-slate-900/60 backdrop-blur-md border border-white/5 shadow-2xl shadow-black/50",

            // "Active" State (Whale Index > 80) -> Pink Neon Pulse
            (item.decisionSSOT?.whaleIndex || 0) >= 80
                ? "shadow-[0_0_30px_rgba(255,0,128,0.2)] border-pink-500/30"
                : "hover:ring-1 hover:ring-emerald-500/40 hover:bg-slate-800/60",

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
                    <div className="flex items-center justify-end gap-2 mb-0.5">
                        {tag && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tagStyle}`}>{tag}</span>}
                        <p className="text-base font-semibold font-mono text-white tabular-nums tracking-tight">
                            {price > 0 ? price.toFixed(2) : (
                                (item.evidence.price as any).error ?
                                    <span className="text-xs text-rose-500 font-bold">{(item.evidence.price as any).error}</span> :
                                    <Skeleton className="w-12 h-4 inline-block" />
                            )}
                        </p>
                    </div>
                    <p className={`text-[11px] font-medium tabular-nums ${changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                    </p>
                </div>
            </div>

            {/* Execution Levels - Clean Grid */}
            {!isNoTrade ? (
                <div className="space-y-2 relative z-10">
                    <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-[11px] text-slate-500 font-medium">Entry</span>
                        <div className="text-right">
                            <span className="block text-[13px] font-mono font-medium text-white tabular-nums">
                                ${item.entryBand?.low?.toFixed(2)} - {item.entryBand?.high?.toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-white/5">
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
                <div className="h-[92px] flex flex-col items-center justify-center bg-slate-950/30 rounded border border-white/5">
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
function TickerEvidenceDrawer({ item, onClose, liveQuote }: { item: TickerItem; onClose: () => void; liveQuote?: any }) {
    const ev = item?.evidence; // Defensive access
    const router = useRouter();
    const searchParams = useSearchParams();
    const isDebug = searchParams.get('debug') === '1';

    // Live Overrides
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
                    <p className="text-slate-400 font-mono text-sm">Synchronizing Engine Data...</p>
                    <button onClick={onClose} className="mt-8 text-slate-500 hover:text-white underline text-xs">Close</button>
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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
            <div className="relative w-full max-w-lg h-full bg-slate-950/90 backdrop-blur-2xl border-l border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">

                {/* Unified HUD Header (Deep Navy Gradient) */}
                <div className="shrink-0 bg-gradient-to-b from-[#0f172a] to-[#0f172a]/0 p-6 pb-2 select-none z-10">
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
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getActionStyle(action)} ring-1 ring-inset ring-white/10`}>
                                        {action}
                                    </span>
                                    {item.qualityReasonKR?.includes('상승') && (
                                        <span className="text-[10px] font-bold text-indigo-400 flex items-center gap-1">
                                            <Zap className="w-3 h-3 text-indigo-500 fill-indigo-500/20" /> MOMENTUM
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 -mr-2 text-slate-500 hover:text-white transition-colors rounded-full hover:bg-white/5">
                            <XCircle className="w-8 h-8 stroke-1 opacity-70" />
                        </button>
                    </div>
                </div>

                {/* Body: Seamless Flow */}
                <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent space-y-8">

                    {/* 1. SURGICAL COCKPIT (Merged) */}
                    <section>
                        {isDebug && <div className="text-right text-[9px] font-mono text-slate-600 mb-2">UPD: {ev.price.fetchedAtET}</div>}

                        {/* [V3.7.3] Surgical UI Dashboard */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            {/* Left: Execution Dial */}
                            <ExecutionDial
                                whaleIndex={item.decisionSSOT?.whaleIndex || 0}
                                whaleConfidence={item.decisionSSOT?.whaleConfidence || 'NONE'}
                                alphaScore={item.alphaScore || 0}
                                whaleEntryLevel={item.decisionSSOT?.whaleEntryLevel}
                                whaleTargetLevel={item.decisionSSOT?.whaleTargetLevel}
                                dominantContract={item.decisionSSOT?.dominantContract}
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
                                            <div className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold border ${def.color} shadow-sm w-20 text-center flex items-center justify-center`}>
                                                {def.label}
                                            </div>
                                            {/* Description */}
                                            <div className="flex-1">
                                                <p className="text-[11px] text-slate-400 leading-relaxed font-medium group-hover:text-slate-300 transition-colors">
                                                    {def.desc}
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
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5" /> Price Action
                        </h3>
                        <div className="grid grid-cols-2 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden">
                            <div className="bg-slate-900 p-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase block">Last / Change</span>
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
                                            <span className="text-[10px] text-slate-500 animate-pulse">Syncing...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="bg-slate-900 p-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase block">VWAP Dist</span>
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
                                <span className="text-[9px] text-slate-500 font-bold uppercase block">RSI (14)</span>
                                {ev.price.rsi14 > 0 && ev.price.rsi14 !== 50 ? (
                                    <span className={`text-sm font-mono font-bold ${ev.price.rsi14 > 70 ? 'text-rose-400' : ev.price.rsi14 < 30 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                        {ev.price.rsi14.toFixed(1)}
                                    </span>
                                ) : (
                                    <span className="text-xs font-mono text-slate-500">
                                        {ev.price.rsi14 === 50 ? "Low Data" : "Calc..."}
                                    </span>
                                )}
                            </div>
                            <div className="bg-slate-900 p-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase block">Structure</span>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-indigo-400">{ev.price.structureState}</span>
                                    <span className="text-[9px] text-slate-500 font-medium">
                                        {STRUCTURE_MAP[ev.price.structureState || ''] || ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>



                    // ... inside component render ...
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
                                        {(ev.flow.offExPct > 0 || liveQuote?.volume) ? (
                                            <div className="flex flex-col">
                                                <span className="text-sm font-mono font-bold text-white">
                                                    {ev.flow.offExPct > 0 ? `${ev.flow.offExPct.toFixed(1)}%` : `VOL: ${(liveQuote.volume / 1000).toFixed(0)}K`}
                                                </span>
                                                <span className="text-[9px] text-slate-500 font-medium">기관 비공개 거래소 물량</span>
                                                {isLive && <span className="text-[9px] text-emerald-500 font-bold animate-pulse mt-0.5">● LIVE FLOW</span>}
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-mono text-slate-500">
                                                Scanning...
                                            </span>
                                        )}
                                    </div>
                                    <div className="w-full bg-slate-800 h-1 mt-2 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${ev.flow.offExPct > 40 ? 'bg-amber-400' : 'bg-slate-600'}`}
                                            style={{ width: `${Math.min(100, ev.flow.offExPct || 0)}%` }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between">
                                        <span className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Net Whale Flow</span>
                                        <span className="text-[8px] bg-slate-800 text-slate-400 px-1 rounded">INSTITUTIONAL</span>
                                    </div>
                                    {/* [Phase 40] Net Premium Calculation */}
                                    <div className="flex flex-col">
                                        <div className="flex items-end gap-1.5">
                                            <span className={`text-sm font-mono font-bold ${(ev.flow.netPremium || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                ${((ev.flow.netPremium || 0) / 1_000_000).toFixed(1)}M
                                            </span>
                                            {/* Calculate Ratio vs Total Volume (Approx) or just show direction */}
                                            {ev.flow.vol > 0 && (
                                                <span className={`text-[10px] font-bold mb-0.5 ${(ev.flow.netPremium || 0) > 0 ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                                                    ({((Math.abs(ev.flow.netPremium || 0) / (ev.flow.vol * ev.price.last)) * 100).toFixed(2)}%)
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-medium">실질적 매수 압력 강도</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ... (Options Structure logic skipped for brevity) ... */}

                    {/* 5. MACRO & STEALTH */}
                    <section className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5" /> Stealth
                            </h3>
                            <div className="bg-slate-900 border border-slate-800 rounded p-3 h-full">
                                <div className="flex flex-col gap-1.5 mb-1">
                                    {(ev.stealth?.tags || []).map((tag, i) => (
                                        <span key={i} className="text-[10px] px-1.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700/50 flex items-center gap-1.5">
                                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                            {STEALTH_TAG_MAP[tag] || `#${tag}`}
                                        </span>
                                    ))}
                                    {(!ev.stealth?.tags || ev.stealth.tags.length === 0) && <span className="text-[9px] text-slate-600">No signals detected</span>}
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

// [V3.7.3] Trigger Definitions for UI Tooltips
const TRIGGER_DEFINITIONS: Record<string, { label: string; desc: string; color: string }> = {
    // 1. High Impact (Purple/Pink)
    'GEX_SQZ': {
        label: '감마스퀴즈',
        desc: '옵션 시장의 쏠림(Short Gamma)으로 인해 주가 변동성이 폭발적으로 확대되는 현상',
        color: 'text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10'
    },
    'WHALE_IN': {
        label: '고래유입',
        desc: '500만 달러 이상의 대규모 매수 자금이 포착됨 (스마트머니 진입)',
        color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    },
    'WALL_BREAK': {
        label: '저항돌파',
        desc: '콜 옵션 매도벽(Call Wall)을 강한 거래량으로 뚫어내는 강력한 상승 신호',
        color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'
    },

    // 2. Warning/Bearish (Red/Orange)
    'SELL_DOM': {
        label: '매도우위',
        desc: '500만 달러 이상의 대규모 매도세가 우세함',
        color: 'text-rose-400 border-rose-500/30 bg-rose-500/10'
    },
    'ACCEL_DROP': {
        label: '가속하락',
        desc: '풋 옵션 매수 급증과 숏 감마가 결합되어 하락 속도가 빨라짐',
        color: 'text-orange-400 border-orange-500/30 bg-orange-500/10'
    },
    'SUPPRESSED': {
        label: '상방억제',
        desc: '상승 하려는 힘은 있으나 과도한 콜 옵션 매도로 인해 상승폭이 제한됨',
        color: 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    },

    // 3. Neutral/Technical (Blue/Slate)
    'GEX_SAFE': {
        label: '안전지대',
        desc: '롱 감마(Long Gamma) 구간으로 진입하여 주가 변동성이 줄어들고 지지력이 강해짐',
        color: 'text-sky-400 border-sky-500/30 bg-sky-500/10'
    },
    'CORRECTION': {
        label: '건전조정',
        desc: '상승 추세 중 일시적인 매물 소화 과정 (지지력 확인 시 재매수 기회)',
        color: 'text-slate-300 border-slate-500/30 bg-slate-500/10'
    },
    'WHALE_DRIVER': {
        label: '고래주도',
        desc: '고래 평단가가 진입 구간을 지지하며, 목표가(손익분기)까지 상승 여력이 확보된 상태 (정밀 타격)',
        color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    },
    'WALL_TEST': {
        label: '저항테스트',
        desc: '현재 주가가 주요 저항벽(Call Wall) 근처에 도달하여 돌파 시도 중',
        color: 'text-violet-400 border-violet-500/30 bg-violet-500/10'
    }
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

function IntelContent({ initialReport }: { initialReport: any }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isDebug = searchParams.get('debug') === '1';

    // State
    const [report, setReport] = useState<any>(initialReport || null);
    const [activeTab, setActiveTab] = useState('FINAL');
    const [isLoading, setIsLoading] = useState(!initialReport);
    const [error, setError] = useState<string | null>(null);
    const [liveQuotes, setLiveQuotes] = useState<Record<string, any>>({}); // [Live Overlay]
    const [selectedTicker, setSelectedTicker] = useState<TickerItem | null>(null);

    // [13.1] Timeline State (Time Machine)
    const [currentDate, setCurrentDate] = useState<Date>(new Date());

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
                        const data = await resLatest.json();
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
                            const data = await res.json();
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
        if (formatDateKey(currentDate) === formatDateKey(new Date())) {
            const interval = setInterval(() => loadData(true), 60 * 1000);
            return () => {
                isMounted = false;
                clearInterval(interval);
            };
        }

        return () => { isMounted = false; };
    }, [currentDate]);

    // [Live Overlay] Poll for real-time prices every 15s
    useEffect(() => {
        if (!report?.items) return;

        const fetchQuotes = async () => {
            try {
                const symbols = report.items.map((i: any) => i.ticker).join(',');
                if (!symbols) return;

                const res = await fetch(`/api/live/quotes?symbols=${symbols}`, { cache: 'no-store' });
                if (res.ok) {
                    const json = await res.json();
                    if (json.data) {
                        setLiveQuotes(prev => ({ ...prev, ...json.data }));
                    }
                }
            } catch (e) { console.error("Live quote poll failed", e); }
        };

        fetchQuotes(); // Initial
        const interval = setInterval(fetchQuotes, 15000);
        return () => clearInterval(interval);
    }, [report]);

    // Derived Lists with Live Overlay
    const rawItems: TickerItem[] = report?.items || [];

    // Merge Static Report + Live Quotes
    const items: TickerItem[] = useMemo(() => {
        return rawItems.map(item => {
            const live = liveQuotes[item.ticker];
            if (!live) return item;

            // Override price/change evidence
            return {
                ...item,
                evidence: {
                    ...item.evidence,
                    price: {
                        ...item.evidence?.price,
                        last: live.price || item.evidence?.price?.last,
                        changePct: live.changePercent || item.evidence?.price?.changePct,
                        // Mark as live updated
                        extendedPrice: live.price,
                        extendedChangePct: live.changePercent,
                        extendedLabel: 'LIVE'
                    },
                    flow: {
                        ...item.evidence?.flow,
                        // Update volume if available
                        vol: live.volume || item.evidence?.flow?.vol,
                        // Rough approximation of updated "Net Flow" visual if needed
                        // For now we keep the sophisticated "Net Flow" static as it requires deep analysis
                        // but we rely on the Price/Vol update to show liveliness.
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

    // [V4.7] M7 Filter (Extract M7 from available report items)
    const m7Items = useMemo(() =>
        sortedItems.filter(item => M7_TICKERS.includes(item.ticker)),
        [sortedItems]
    );

    const physicalAiItems = useMemo(() =>
        sortedItems.filter(item => PHYSICAL_AI_TICKERS.includes(item.ticker)),
        [sortedItems]
    );
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
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[150px] rounded-full pointer-events-none mix-blend-screen z-0" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/5 blur-[150px] rounded-full pointer-events-none mix-blend-screen z-0" />

            {/* 0. TACTICAL SIDEBAR (Fixed Left) */}
            <TacticalSidebar activeTab={activeTab} onTabChange={setActiveTab} />

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

                    {/* Placeholder for Non-Final Tabs */}
                    {activeTab !== 'FINAL' && activeTab !== 'DISCOVERY' && activeTab !== 'M7' && (
                        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in fade-in zoom-in duration-300">
                            <div className="w-20 h-20 bg-slate-900/50 rounded-full flex items-center justify-center mb-6 border border-slate-800 shadow-2xl">
                                <Shield className="w-10 h-10 text-slate-600" />
                            </div>
                            <h2 className="text-3xl font-black text-slate-200 mb-2 tracking-tight">RESTRICTED AREA</h2>
                            <div className="w-12 h-1 bg-emerald-500/20 rounded-full mb-6" />
                            <p className="text-slate-400 max-w-md text-lg leading-relaxed">
                                Tactical module <span className="text-emerald-400 font-mono font-bold">{activeTab}</span> is currently<br />undergoing final calibration.
                            </p>
                            <button
                                onClick={() => setActiveTab('FINAL')}
                                className="mt-8 px-6 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest rounded border border-emerald-500/20 transition-all"
                            >
                                Return to Final Battle
                            </button>
                        </div>
                    )}

                    {/* HYPER DISCOVERY CONTENT (HUNTER CORPS) */}
                    <div className={activeTab === 'DISCOVERY' ? "space-y-8" : "hidden"}>
                        <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 pt-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[10px] font-bold text-amber-500 tracking-widest uppercase flex items-center gap-2">
                                        <Zap className="w-3 h-3" />
                                        MOMENTUM SCANNERS
                                    </span>
                                </div>
                                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter flex items-center gap-4">
                                    PROJECT: <span className="text-amber-500">HYPER DISCOVERY</span>
                                </h1>
                                <p className="text-slate-400 font-mono text-xs mt-2">
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
                                    <div className="col-span-full py-20 text-center text-slate-500">
                                        <p>No high-probability Hunter targets detected today.</p>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {/* PHYSICAL AI CONTENT (The Iron Legion) */}
                    <div className={activeTab === 'PHYSICAL_AI' ? "space-y-6" : "hidden"}>

                        {/* Zone A: Orbital Map */}
                        <section>
                            <PhysicalAIOrbitalMap items={physicalAiItems} />
                        </section>

                        {/* Zone B: Briefing Bar */}
                        <section>
                            <div className="mb-2 px-2 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-amber-600/70 tracking-widest uppercase">
                                    PHYSICAL AI SECTOR ANALYSIS (물리적 AI / 로보틱스)
                                </span>
                                <span className="text-[10px] font-bold text-amber-600/70 tracking-widest uppercase">
                                    COMPLETED AT 21:00 EST
                                </span>
                            </div>
                            <PhysicalAIBriefingBar
                                message={
                                    physicalAiItems.length > 0
                                        ? `DETECTING HEAVY CAPITAL DEPLOYMENT IN ${physicalAiItems[0].ticker}. SECTOR MOMENTUM: ${physicalAiItems[0].evidence?.price?.changePct && physicalAiItems[0].evidence.price.changePct > 0 ? "ACCELERATING" : "STABILIZING"}.`
                                        : "ESTABLISHING UPLINK TO INDUSTRIAL GRID..."
                                }
                            />
                        </section>

                        {/* Zone C: Tactical Deck */}
                        <section>
                            <h2 className="text-sm font-bold text-amber-700/50 mb-4 px-2 flex items-center gap-2">
                                <Bot className="w-4 h-4 text-amber-500" />
                                TACTICAL DECK <span className="text-[10px] text-amber-800 uppercase tracking-wider">Sorted by Alpha Priority</span>
                            </h2>
                            <PhysicalAITacticalDeck
                                items={physicalAiItems}
                                selectedTicker={selectedTicker}
                                onSelect={setSelectedTicker}
                            />
                        </section>

                    </div>


                    {/* M7 REPORT CONTENT (ORBITAL COMMAND) */}
                    <div className={activeTab === 'M7' ? "space-y-6" : "hidden"}>

                        {/* Zone A: Orbital Map */}
                        <section>
                            <M7OrbitalMap items={m7Items} />
                        </section>

                        {/* Zone B: Briefing Bar */}
                        <section>
                            <div className="mb-2 px-2 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">
                                    POST-MARKET FINAL ANALYSIS (장마감 정밀보고)
                                </span>
                                <span className="text-[10px] font-bold text-slate-600 tracking-widest uppercase">
                                    COMPLETED AT 21:00 EST
                                </span>
                            </div>
                            <M7BriefingBar
                                message={
                                    // Simple logic for briefing: Top 1 vs Top 2 comparison
                                    m7Items.length > 1
                                        ? `Today's capital flow is concentrating on ${m7Items.sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0))[0].ticker}, while ${m7Items.sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0))[1].ticker} shows defensive posturing.`
                                        : "M7 Sector Analysis: Waiting for Market Data..."
                                }
                            />
                        </section>

                        {/* Zone C: Tactical Deck */}
                        <section>
                            <h2 className="text-sm font-bold text-slate-400 mb-4 px-2 flex items-center gap-2">
                                <Layers className="w-4 h-4 text-emerald-500" />
                                TACTICAL DECK <span className="text-[10px] text-slate-600 uppercase tracking-wider">Sorted by Alpha Priority</span>
                            </h2>
                            <M7TacticalDeck
                                items={m7Items}
                                selectedTicker={selectedTicker}
                                onSelect={setSelectedTicker}
                            />
                        </section>

                    </div>

                    {/* FINAL BATTLE CONTENT */}
                    <div className={activeTab === 'FINAL' ? "space-y-8" : "hidden"}>

                        {/* 1. HERO HEADER (Premium Open Design) */}
                        <section className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8 pt-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase flex items-center gap-2">
                                        <Activity className="w-3 h-3 text-emerald-500" />
                                        LIVE OPERATIONS
                                    </span>
                                </div>
                                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                                    <span className="text-emerald-500">ALPHA DAWN</span>
                                    <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-opacity-20 flex items-center gap-1.5 align-middle ${getRegimeColor(regime)}`}>
                                        {getRegimeText(regime)}
                                    </span>
                                </h1>
                                <p className="text-slate-400 text-xs mt-1 max-w-2xl font-medium leading-relaxed">
                                    Identifying high-probability opening drive setups using <span className="text-slate-300 font-bold">Options-Flow</span> and <span className="text-slate-300 font-bold">Gamma Exposure</span>.
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-slate-500 font-mono text-[10px] mt-2 bg-slate-800/50 px-2 py-1 rounded inline-block">
                                    ID: {report?.meta?.id?.toUpperCase() || "SYNC"} • {report?.meta?.generatedAtET || "WAITING"}
                                </p>
                            </div>

                            {/* Archive & Status Controls */}
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                {/* Mini Status Cards */}
                                <div className="flex items-center gap-4">
                                    <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded">
                                        <span className="text-[10px] text-slate-500 block">OPTIONS COVERAGE</span>
                                        <span className="text-sm font-mono font-bold text-emerald-400">{report?.meta?.optionsStatus?.coveragePct || 0}%</span>
                                    </div>
                                    <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded">
                                        <span className="text-[10px] text-slate-500 block">EXECUTION RISK</span>
                                        <span className="text-sm font-mono font-bold text-amber-400">MODERATE</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 2. MAIN CORPS (Top 3) */}
                        <section>
                            <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
                                <Zap className="w-5 h-5 text-emerald-500" />
                                MAIN CORPS (주력군)
                                <span className="text-[10px] text-slate-500 font-normal uppercase tracking-widest ml-2">Data Verified • High Probability</span>
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
                                    <Search className="w-5 h-5 text-slate-400" />
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
                                            <tr className="bg-white/5 border-b border-white/5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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
                                                            <td className="p-4 text-center font-mono text-xs text-slate-400 font-bold group-hover:text-white transition-colors">
                                                                {realRank}
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div>
                                                                        <span className="block text-sm font-black text-slate-100 group-hover:text-cyan-300 transition-colors tracking-tight">{item.ticker}</span>
                                                                        <span className="block text-[10px] text-slate-400 group-hover:text-slate-300">{item.symbol || item.ticker}</span>
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
                                                                    <span className={`text-[10px] font-bold ${ev.price.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                                        {ev.price.changePct > 0 ? "+" : ""}{ev.price.changePct.toFixed(2)}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <div className="flex flex-col items-end">
                                                                    {ev.flow.complete ? (
                                                                        <>
                                                                            <span className={`text-xs font-mono font-bold ${(ev.flow.netPremium || ev.flow.largeTradesUsd || 0) > 0 ? "text-emerald-400" : (ev.flow.netPremium || ev.flow.largeTradesUsd || 0) < 0 ? "text-rose-400" : "text-slate-400"}`}>
                                                                                {(ev.flow.netPremium ?? ev.flow.largeTradesUsd ?? 0) !== 0 ? `$${((ev.flow.netPremium ?? ev.flow.largeTradesUsd) / 1000000).toFixed(1)}M` : "-"}
                                                                            </span>
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-[10px] font-mono text-slate-500">
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
                                                                    {(item.decisionSSOT?.triggersKR || []).slice(0, 2).map((code, i) => {
                                                                        // Simplified tag rendering for table
                                                                        return (
                                                                            <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/5 border border-white/10 text-slate-300">
                                                                                {code}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <span className={`px-2 py-1 rounded text-[10px] font-bold border border-opacity-30 backdrop-blur-sm ${actStyle}`}>
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
                                                        <div className="text-[10px] text-rose-400/80 font-bold uppercase tracking-wider">Gamma Play</div>
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
                                                    <span className="text-slate-500">RSI (14)</span>
                                                    <span className="text-slate-300 font-mono">
                                                        {item.evidence.price.rsi14 && item.evidence.price.rsi14 !== 50
                                                            ? item.evidence.price.rsi14.toFixed(0)
                                                            : "--"}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-500">Target</span>
                                                    <span className="text-rose-300 font-mono">${(item.evidence.price.last * 1.15).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}



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
                            <p suppressHydrationWarning className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                                GEMS v8.1 Unified Engine • Iron Man HUD Active ({new Date().toLocaleTimeString()})
                            </p>
                        </footer>

                    </div> {/* End Final Battle Wrapper */}

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

export default function IntelClientPage({ initialReport }: { initialReport: any }) {
    return (
        <React.Suspense fallback={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 text-sm">Initializing Tactical Board...</p>
                </div>
            </div>
        }>
            <IntelContent initialReport={initialReport} />
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
    let verdictColor = "text-slate-400";
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
                <Activity className="w-16 h-16 text-slate-500" />
            </div>
            <div className="flex justify-between items-start mb-2 relative z-10">
                <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                        <Zap className="w-3 h-3 text-cyan-400" />
                        LIVE EVALUATION (Alpha Check)
                    </h4>
                    <div className={`text-sm font-black mt-1 ${verdictColor}`}>
                        {verdict}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Live Variance</div>
                    <div className={`text-xs font-mono font-bold ${diffPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {diffPct > 0 ? "+" : ""}{diffPct.toFixed(2)}%
                    </div>
                </div>
            </div>

            <p className="text-xs text-slate-400 font-medium relative z-10 leading-relaxed max-w-[90%]">
                {verdictDesc}
            </p>

            {liveQuote.volume && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-4 relative z-10">
                    <div>
                        <span className="text-[9px] text-slate-500 uppercase block">Live Vol</span>
                        <span className="text-xs font-mono text-slate-300">{(liveQuote.volume / 1000).toFixed(0)}K</span>
                    </div>
                    <div>
                        <span className="text-[9px] text-slate-500 uppercase block">Net Whale Flow</span>
                        <span className={`text-xs font-mono font-bold ${liveQuote.flowApprox > 0 ? "text-emerald-400" : liveQuote.flowApprox < 0 ? "text-rose-400" : "text-slate-400"}`}>
                            {liveQuote.flowApprox ? `$${(liveQuote.flowApprox / 1000000).toFixed(1)}M` : "Scanning..."}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

// END OF FILE
