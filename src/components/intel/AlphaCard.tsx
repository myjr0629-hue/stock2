'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    CheckCircle, XCircle, AlertTriangle, Clock,
    ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight,
    Shield, Activity, Zap, TrendingUp, BarChart3,
    Eye, Radio, Database, Target, Crosshair, Flame,
    Building2, Waves, BarChart, Gauge, CircleDot,
    ArrowUp, ArrowDown, Minus
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface PillarFactor {
    name: string;
    value: number;
    max: number;
    detail?: string;
}

interface PillarData {
    score: number;
    max: number;
    pct: number;
    factors: PillarFactor[];
}

export interface AlphaCardProps {
    ticker: string;
    rank: number;
    price: number;
    changePct: number;
    volume?: number;
    alphaScore: number;
    scoreBreakdown?: {
        momentum: number;
        options: number;
        structure: number;
        regime: number;
        risk: number;
    };
    entryLow?: number;
    entryHigh?: number;
    targetPrice?: number;
    cutPrice?: number;
    whaleNetM?: number;
    callWall?: number;
    putFloor?: number;
    isLive?: boolean;
    isHighRisk?: boolean;
    variant?: 'hero' | 'compact';
    onClick?: () => void;
    // === Engine data ===
    whyKR?: string;
    actionKR?: string;
    grade?: string;
    triggerCodes?: string[];
    pillars?: {
        momentum: PillarData;
        structure: PillarData;
        flow: PillarData;
        regime: PillarData;
        catalyst: PillarData;
    };
    gatesApplied?: string[];
    dataCompleteness?: number;
}

// =============================================================================
// SVG SCORE RING (Circular Progress)
// =============================================================================

function ScoreRing({ score, size = 64, strokeWidth = 4 }: { score: number; size?: number; strokeWidth?: number }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const pct = Math.min(100, Math.max(0, score));
    const offset = circumference - (pct / 100) * circumference;
    const center = size / 2;

    // Color gradient based on score
    const getColor = () => {
        if (score >= 80) return { stroke: '#22d3ee', glow: 'rgba(34,211,238,0.25)', text: 'text-cyan-300', label: 'S' };
        if (score >= 65) return { stroke: '#34d399', glow: 'rgba(52,211,153,0.20)', text: 'text-emerald-300', label: 'A' };
        if (score >= 50) return { stroke: '#60a5fa', glow: 'rgba(96,165,250,0.15)', text: 'text-blue-300', label: 'B' };
        if (score >= 35) return { stroke: '#94a3b8', glow: 'rgba(148,163,184,0.10)', text: 'text-slate-300', label: 'C' };
        return { stroke: '#f87171', glow: 'rgba(248,113,113,0.15)', text: 'text-rose-300', label: 'D' };
    };

    const c = getColor();

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                {/* Background track */}
                <circle
                    cx={center} cy={center} r={radius}
                    fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth}
                />
                {/* Progress arc */}
                <circle
                    cx={center} cy={center} r={radius}
                    fill="none" stroke={c.stroke} strokeWidth={strokeWidth}
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{
                        filter: `drop-shadow(0 0 6px ${c.glow})`,
                        transition: 'stroke-dashoffset 0.8s ease-out'
                    }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("font-black leading-none", c.text, size >= 60 ? "text-[18px]" : "text-[14px]")}>{score.toFixed(1)}</span>
                <span className={cn("font-bold opacity-50 mt-0.5", c.text, size >= 60 ? "text-[9px]" : "text-[7px]")}>{c.label}</span>
            </div>
        </div>
    );
}

// =============================================================================
// RANK BADGE (Premium — M7 style)
// =============================================================================

function RankBadge({ rank }: { rank: number }) {
    if (rank > 12) return null;

    const config = rank === 1 ? {
        bg: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500',
        text: 'text-amber-950',
        shadow: 'shadow-[0_0_12px_rgba(251,191,36,0.4)]',
        size: 'w-7 h-7 text-xs',
    } : rank === 2 ? {
        bg: 'bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400',
        text: 'text-slate-800',
        shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.3)]',
        size: 'w-6 h-6 text-[11px]',
    } : rank === 3 ? {
        bg: 'bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700',
        text: 'text-amber-100',
        shadow: 'shadow-[0_0_8px_rgba(217,119,6,0.3)]',
        size: 'w-6 h-6 text-[11px]',
    } : {
        bg: 'bg-white/[0.08] border border-white/[0.12]',
        text: 'text-white/50',
        shadow: '',
        size: 'w-5 h-5 text-[10px]',
    };

    return (
        <div className={cn(
            "rounded-lg flex items-center justify-center font-black backdrop-blur-sm",
            config.bg, config.text, config.shadow, config.size
        )}>
            {rank}
        </div>
    );
}

// =============================================================================
// ENTRY SIGNAL
// =============================================================================

type EntryStatus = 'ENTRY_ZONE' | 'WAIT' | 'EXTENDED' | 'CUT_ZONE';

function getEntrySignal(
    price: number, entryLow: number, entryHigh: number, cutPrice: number, callWall?: number
): { status: EntryStatus; label: string; detail: string; color: string; bgClass: string; icon: React.ReactNode } {
    if (price <= cutPrice) {
        return {
            status: 'CUT_ZONE', label: '손절 구간',
            detail: `$${cutPrice.toFixed(0)} 이탈`,
            color: 'text-rose-300', bgClass: 'bg-rose-500/[0.08] border-rose-500/20',
            icon: <XCircle className="w-3.5 h-3.5" />
        };
    }
    if (callWall && price >= callWall * 0.98) {
        return {
            status: 'EXTENDED', label: '과열 구간',
            detail: `CW $${callWall.toFixed(0)} 근접`,
            color: 'text-amber-300', bgClass: 'bg-amber-500/[0.08] border-amber-500/20',
            icon: <AlertTriangle className="w-3.5 h-3.5" />
        };
    }
    if (price >= entryLow && price <= entryHigh) {
        return {
            status: 'ENTRY_ZONE', label: '진입 구간',
            detail: `$${entryLow.toFixed(0)}~$${entryHigh.toFixed(0)}`,
            color: 'text-emerald-300', bgClass: 'bg-emerald-500/[0.08] border-emerald-500/20',
            icon: <CheckCircle className="w-3.5 h-3.5" />
        };
    }
    return {
        status: 'WAIT', label: '진입 대기',
        detail: price > entryHigh ? `$${entryHigh.toFixed(0)} 이하 대기` : `$${entryLow.toFixed(0)} 이상 대기`,
        color: 'text-slate-400', bgClass: 'bg-white/[0.04] border-white/[0.08]',
        icon: <Clock className="w-3.5 h-3.5" />
    };
}

// =============================================================================
// TRIGGER BADGE CONFIG
// =============================================================================

const TRIGGER_CONFIG: Record<string, { label: string; icon: React.ReactNode; type: 'positive' | 'negative' | 'neutral' }> = {
    MOM_STRONG: { label: '모멘텀', icon: <TrendingUp className="w-3 h-3" />, type: 'positive' },
    MOMENTUM_UP: { label: '상승세', icon: <ArrowUp className="w-3 h-3" />, type: 'positive' },
    TREND_3D: { label: '3일상승', icon: <BarChart className="w-3 h-3" />, type: 'positive' },
    SMART_DIP: { label: '기관매집', icon: <Building2 className="w-3 h-3" />, type: 'positive' },
    GEX_SAFE: { label: 'GEX+', icon: <Shield className="w-3 h-3" />, type: 'positive' },
    GEX_NEG: { label: 'GEX−', icon: <AlertTriangle className="w-3 h-3" />, type: 'negative' },
    GEX_SQZ: { label: '스퀴즈', icon: <Zap className="w-3 h-3" />, type: 'positive' },
    SQUEEZE: { label: '스퀴즈', icon: <Zap className="w-3 h-3" />, type: 'positive' },
    DP_HIGH: { label: '다크풀', icon: <Eye className="w-3 h-3" />, type: 'positive' },
    WHALE_IN: { label: '고래유입', icon: <Waves className="w-3 h-3" />, type: 'positive' },
    SHORT_ALERT: { label: '공매도', icon: <ArrowDown className="w-3 h-3" />, type: 'negative' },
    VOL_BOOM: { label: '거래폭발', icon: <Activity className="w-3 h-3" />, type: 'positive' },
    REGIME_OFF: { label: '시장악화', icon: <Radio className="w-3 h-3" />, type: 'negative' },
    CALL_DOMINANT: { label: '콜우세', icon: <ArrowUp className="w-3 h-3" />, type: 'positive' },
    PUT_DOMINANT: { label: '풋우세', icon: <ArrowDown className="w-3 h-3" />, type: 'negative' },
    GATE_EXHAUST: { label: '과열', icon: <Flame className="w-3 h-3" />, type: 'negative' },
    GATE_FAKE: { label: '가짜상승', icon: <AlertTriangle className="w-3 h-3" />, type: 'negative' },
    GATE_WALL: { label: '벽저항', icon: <Shield className="w-3 h-3" />, type: 'negative' },
    GATE_SHORT: { label: 'Short폭풍', icon: <Activity className="w-3 h-3" />, type: 'negative' },
    SUPPRESSED: { label: '상방억제', icon: <Minus className="w-3 h-3" />, type: 'neutral' },
    ACCEL_DROP: { label: '가속하락', icon: <ArrowDown className="w-3 h-3" />, type: 'negative' },
    CORRECTION: { label: '조정', icon: <ArrowDown className="w-3 h-3" />, type: 'negative' },
    REGIME_FAVORABLE: { label: '시장우호', icon: <Radio className="w-3 h-3" />, type: 'positive' },
};

// =============================================================================
// PILLAR BAR CONFIG
// =============================================================================

const PILLAR_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    momentum: { label: '모멘텀', icon: <TrendingUp className="w-3 h-3" />, color: 'emerald' },
    structure: { label: '옵션구조', icon: <BarChart3 className="w-3 h-3" />, color: 'blue' },
    flow: { label: '자금흐름', icon: <Activity className="w-3 h-3" />, color: 'violet' },
    regime: { label: '시장환경', icon: <Radio className="w-3 h-3" />, color: 'amber' },
    catalyst: { label: '촉매', icon: <Zap className="w-3 h-3" />, color: 'cyan' },
};

function PillarBar({ name, pillar }: { name: string; pillar: PillarData }) {
    const config = PILLAR_CONFIG[name];
    if (!config) return null;
    const pct = Math.min(100, pillar.pct);

    const colorMap: Record<string, { bar: string; text: string }> = {
        emerald: { bar: 'bg-emerald-400', text: 'text-emerald-300' },
        blue: { bar: 'bg-blue-400', text: 'text-blue-300' },
        violet: { bar: 'bg-violet-400', text: 'text-violet-300' },
        amber: { bar: 'bg-amber-400', text: 'text-amber-300' },
        cyan: { bar: 'bg-cyan-400', text: 'text-cyan-300' },
    };
    const c = colorMap[config.color] || colorMap.emerald;

    return (
        <div className="flex items-center gap-2 group/pillar">
            <div className={cn("w-4 flex-shrink-0", c.text, "opacity-50")}>{config.icon}</div>
            <span className="text-[10px] text-white/40 w-12 flex-shrink-0 font-medium">{config.label}</span>
            <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all duration-700", c.bar)}
                    style={{ width: `${pct}%`, opacity: pct > 50 ? 0.9 : 0.5 }}
                />
            </div>
            <span className={cn("text-[10px] font-mono font-bold w-7 text-right",
                pct >= 70 ? c.text : pct >= 40 ? "text-white/50" : "text-white/30"
            )}>
                {pillar.score}/{pillar.max}
            </span>
        </div>
    );
}

// =============================================================================
// INSIGHT PANEL (Expandable Engine Details)
// =============================================================================

function InsightPanel({
    pillars, gatesApplied, dataCompleteness
}: {
    pillars: AlphaCardProps['pillars'];
    gatesApplied?: string[];
    dataCompleteness?: number;
}) {
    if (!pillars) {
        return (
            <div className="mt-3 py-4 text-center">
                <p className="text-slate-500 text-xs">엔진 데이터 미수집</p>
            </div>
        );
    }

    const pillarEntries = Object.entries(pillars) as [string, PillarData][];

    return (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
            {pillarEntries.map(([key, pillar]) => (
                <PillarBar key={key} name={key} pillar={pillar} />
            ))}

            {/* Gates & Data Quality footer */}
            <div className="flex items-center justify-between pt-2 text-[10px]">
                {gatesApplied && gatesApplied.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-rose-400/70">
                        <Shield className="w-3 h-3" />
                        <span className="font-medium">{gatesApplied.join(', ')}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-emerald-400/40">
                        <Shield className="w-3 h-3" />
                        <span>게이트 통과</span>
                    </div>
                )}
                {dataCompleteness !== undefined && (
                    <div className="flex items-center gap-1.5">
                        <Database className="w-3 h-3 text-white/20" />
                        <span className={cn("font-mono font-bold",
                            dataCompleteness >= 80 ? "text-emerald-300/60" :
                                dataCompleteness >= 50 ? "text-amber-300/60" : "text-slate-500"
                        )}>
                            {dataCompleteness}%
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// PRICE LEVEL BAR (Visual Entry/Target/Stop Infographic)
// =============================================================================

function PriceLevelBar({ price, entryLow, entryHigh, targetPrice, cutPrice, callWall }: {
    price: number; entryLow: number; entryHigh: number; targetPrice: number; cutPrice: number; callWall?: number;
}) {
    const allLevels = [cutPrice, entryLow, entryHigh, targetPrice, price].filter(v => v > 0);
    if (callWall && callWall > 0) allLevels.push(callWall);
    const min = Math.min(...allLevels) * 0.98;
    const max = Math.max(...allLevels) * 1.02;
    const range = max - min || 1;
    const pos = (v: number) => ((v - min) / range) * 100;

    const upside = targetPrice > 0 && price > 0 ? ((targetPrice - price) / price * 100) : 0;
    const downside = cutPrice > 0 && price > 0 ? ((cutPrice - price) / price * 100) : 0;

    return (
        <div className="space-y-2">
            {/* Visual bar */}
            <div className="relative h-2 bg-white/[0.04] rounded-full overflow-visible">
                {entryLow > 0 && entryHigh > 0 && (
                    <div
                        className="absolute top-0 h-full bg-emerald-500/15 rounded-full"
                        style={{ left: `${pos(entryLow)}%`, width: `${pos(entryHigh) - pos(entryLow)}%` }}
                    />
                )}
                {cutPrice > 0 && (
                    <div className="absolute top-0 w-0.5 h-full bg-rose-400/60 rounded-full"
                        style={{ left: `${pos(cutPrice)}%` }}
                    />
                )}
                {targetPrice > 0 && (
                    <div className="absolute top-0 w-0.5 h-full bg-emerald-400/60 rounded-full"
                        style={{ left: `${pos(targetPrice)}%` }}
                    />
                )}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)] border border-white/80"
                    style={{ left: `${pos(price)}%`, transform: 'translate(-50%,-50%)' }}
                />
            </div>

            {/* Numeric labels — M7 style grid boxes */}
            <div className="grid grid-cols-3 gap-1">
                <div className="bg-white/[0.04] rounded-lg py-1.5 px-2 border border-white/[0.06] text-center">
                    <p className="text-[7px] text-white/30 uppercase tracking-[0.12em] font-bold">STOP</p>
                    <p className="text-[11px] font-bold text-rose-300/80 font-mono">${cutPrice.toFixed(0)}</p>
                    <p className="text-[8px] text-rose-400/50 font-mono">{downside.toFixed(1)}%</p>
                </div>
                <div className="bg-white/[0.06] rounded-lg py-1.5 px-2 border border-emerald-500/10 text-center">
                    <p className="text-[7px] text-white/30 uppercase tracking-[0.12em] font-bold">ENTRY</p>
                    <p className="text-[11px] font-bold text-white/80 font-mono">
                        ${entryLow.toFixed(0)}<span className="text-white/30">~</span>${entryHigh.toFixed(0)}
                    </p>
                </div>
                <div className="bg-white/[0.04] rounded-lg py-1.5 px-2 border border-white/[0.06] text-center">
                    <p className="text-[7px] text-white/30 uppercase tracking-[0.12em] font-bold">TARGET</p>
                    <p className="text-[11px] font-bold text-emerald-300/80 font-mono">${targetPrice.toFixed(0)}</p>
                    <p className="text-[8px] text-emerald-400/50 font-mono">+{upside.toFixed(1)}%</p>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// MAIN: AlphaCard (M7 Style — Glassmorphism Card)
// =============================================================================

export function AlphaCard({
    ticker, rank, price, changePct, volume, alphaScore,
    entryLow = 0, entryHigh = 0, targetPrice = 0, cutPrice = 0,
    whaleNetM, callWall, putFloor, isLive = false, isHighRisk = false,
    variant = 'compact', onClick,
    whyKR, actionKR, grade, triggerCodes, pillars, gatesApplied, dataCompleteness,
}: AlphaCardProps) {
    const router = useRouter();
    const [showInsight, setShowInsight] = useState(false);

    const entrySignal = getEntrySignal(price, entryLow, entryHigh, cutPrice, callWall);
    const logoUrl = `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

    const upside = targetPrice > 0 && price > 0 ? ((targetPrice - price) / price * 100) : 0;
    const downside = cutPrice > 0 && price > 0 ? ((cutPrice - price) / price * 100) : 0;
    const rr = downside !== 0 ? Math.abs(upside / downside) : 0;

    const handleClick = () => router.push(`/ticker?ticker=${ticker}`);
    const handleInsightToggle = (e: React.MouseEvent) => { e.stopPropagation(); setShowInsight(!showInsight); };

    // Dynamic border based on conviction
    const borderColor = alphaScore >= 80
        ? 'border-cyan-400/25 hover:border-cyan-400/40'
        : alphaScore >= 65
            ? 'border-emerald-400/20 hover:border-emerald-400/35'
            : isHighRisk
                ? 'border-rose-500/15 hover:border-rose-500/30'
                : 'border-white/[0.10] hover:border-white/[0.18]';

    const isUp = changePct >= 0;

    return (
        <div
            className={cn(
                // ── M7 Style Card Shell ──
                "relative flex flex-col rounded-xl border transition-all duration-300 overflow-hidden group cursor-pointer",
                "bg-white/[0.02] backdrop-blur-md",
                "hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]",
                borderColor,
            )}
            onClick={handleClick}
        >
            {/* Glass shine — M7 signature */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

            {/* ─── HEADER: Rank + Logo + Ticker | Score Ring ─── */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2.5">
                    <RankBadge rank={rank} />
                    <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] overflow-hidden flex-shrink-0">
                        <img src={logoUrl} alt={ticker} className="w-full h-full object-contain p-1"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-white tracking-tight">{ticker}</h3>
                            {isHighRisk && (
                                <span className="text-[7px] font-bold bg-rose-500/15 text-rose-300/80 px-1.5 py-0.5 rounded border border-rose-500/15 uppercase tracking-wider">
                                    SPEC
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <ScoreRing score={alphaScore} size={52} strokeWidth={3.5} />
            </div>

            {/* ─── PRICE SECTION (M7 style — centered, large) ─── */}
            <div className="flex flex-col items-center px-4 pb-2">
                <div className="text-2xl font-black text-white tracking-tighter tabular-nums">
                    ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={cn(
                    "flex items-center gap-0.5 text-sm font-bold mt-0.5",
                    isUp ? "text-emerald-400" : "text-rose-400"
                )}>
                    {isUp
                        ? <ArrowUpRight className="w-3.5 h-3.5" />
                        : <ArrowDownRight className="w-3.5 h-3.5" />
                    }
                    {isUp ? '+' : ''}{changePct.toFixed(2)}%
                </div>
            </div>

            {/* ─── ACTION VERDICT (M7 analysis text style) ─── */}
            <div className="px-4 pb-3">
                <div className={cn(
                    "flex items-start gap-2 px-3 py-2 rounded-lg border",
                    entrySignal.bgClass
                )}>
                    <span className={cn("mt-0.5 flex-shrink-0", entrySignal.color)}>{entrySignal.icon}</span>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <span className={cn("text-xs font-bold", entrySignal.color)}>{entrySignal.label}</span>
                            <span className={cn("text-[11px] font-mono", entrySignal.color)}>{entrySignal.detail}</span>
                        </div>
                        {actionKR && (
                            <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{actionKR}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── PRICE LEVEL BAR ─── */}
            {entryLow > 0 && (
                <div className="px-4 pb-3">
                    <PriceLevelBar
                        price={price}
                        entryLow={entryLow}
                        entryHigh={entryHigh}
                        targetPrice={targetPrice}
                        cutPrice={cutPrice}
                        callWall={callWall}
                    />
                </div>
            )}

            {/* ─── QUICK STATS (M7 grid style) ─── */}
            <div className="px-4 pb-2">
                <div className="flex items-center justify-between text-[10px] text-white/40">
                    <div className="flex items-center gap-3">
                        {callWall ? <span>CW <span className="text-white/60 font-mono font-medium">${callWall.toFixed(0)}</span></span> : null}
                        {putFloor ? <span>PF <span className="text-white/60 font-mono font-medium">${putFloor.toFixed(0)}</span></span> : null}
                        {whaleNetM !== undefined && whaleNetM !== 0 && (
                            <span className={cn("font-bold flex items-center gap-0.5",
                                whaleNetM >= 0 ? 'text-emerald-400/60' : 'text-rose-400/60'
                            )}>
                                <Waves className="w-3 h-3" />
                                {whaleNetM >= 0 ? '+' : ''}{whaleNetM.toFixed(1)}M
                            </span>
                        )}
                    </div>
                    {rr > 0 && (
                        <span className="text-white/40 font-mono">
                            R:R <span className={cn("font-bold", rr >= 2 ? 'text-emerald-300/70' : 'text-white/50')}>{rr.toFixed(1)}:1</span>
                        </span>
                    )}
                </div>
            </div>

            {/* ─── WHY (Analysis text — M7 card analysis style) ─── */}
            {whyKR && (
                <div className="px-4 pb-3">
                    <p className="text-[11px] text-white/40 leading-relaxed line-clamp-3">{whyKR}</p>
                </div>
            )}

            {/* ─── TRIGGER BADGES (M7 tag style) ─── */}
            {triggerCodes && triggerCodes.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-1">
                    {triggerCodes.slice(0, 6).map(code => {
                        const t = TRIGGER_CONFIG[code];
                        if (!t) return null;
                        return (
                            <span key={code} className={cn(
                                "text-[9px] font-bold px-1.5 py-1 rounded-md border flex items-center gap-1",
                                t.type === 'positive' ? "bg-emerald-500/[0.06] text-emerald-300/70 border-emerald-500/10" :
                                    t.type === 'negative' ? "bg-rose-500/[0.06] text-rose-300/70 border-rose-500/10" :
                                        "bg-white/[0.04] text-white/40 border-white/[0.06]"
                            )}>
                                {t.icon}
                                {t.label}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* ─── ENGINE INSIGHT TOGGLE ─── */}
            <div className="px-4 pb-4">
                <button
                    onClick={handleInsightToggle}
                    className={cn(
                        "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-bold transition-all duration-300 border",
                        showInsight
                            ? "bg-white/[0.06] border-white/[0.12] text-white/60"
                            : "bg-white/[0.02] border-white/[0.05] text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
                    )}
                >
                    <Gauge className="w-3.5 h-3.5" />
                    {showInsight ? '엔진 분석 접기' : '엔진 분석 보기'}
                    {showInsight ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {/* INSIGHT LAYER */}
                {showInsight && (
                    <InsightPanel pillars={pillars} gatesApplied={gatesApplied} dataCompleteness={dataCompleteness} />
                )}
            </div>
        </div>
    );
}

// =============================================================================
// COMPACT VARIANT
// =============================================================================

export function AlphaCardCompact(props: Omit<AlphaCardProps, 'variant'>) {
    return <AlphaCard {...props} variant="compact" />;
}
