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
import { useTranslations } from 'next-intl';
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
                <span className={cn("font-black leading-none font-jakarta", c.text, size >= 60 ? "text-[20px]" : "text-[15px]")}>{score.toFixed(1)}</span>
                <span className={cn("font-bold opacity-70 mt-0.5 font-jakarta", c.text, size >= 60 ? "text-[12px]" : "text-[11px]")}>{c.label}</span>
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
        text: 'text-white/70',
        shadow: '',
        size: 'w-6 h-6 text-xs',
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
    price: number, entryLow: number, entryHigh: number, cutPrice: number, callWall: number | undefined, t: any
): { status: EntryStatus; label: string; detail: string; color: string; bgClass: string; icon: React.ReactNode } {
    if (price <= cutPrice) {
        return {
            status: 'CUT_ZONE', label: t('cutZone'),
            detail: `$${cutPrice.toFixed(0)} ${t('cutDetail')}`,
            color: 'text-rose-400', bgClass: 'bg-[#0f172a] border-slate-700/50',
            icon: <XCircle className="w-3.5 h-3.5" />
        };
    }
    if (callWall && price >= callWall * 0.98) {
        return {
            status: 'EXTENDED', label: t('extended'),
            detail: `CW $${callWall.toFixed(0)} ${t('extendedDetail')}`,
            color: 'text-amber-400', bgClass: 'bg-[#0f172a] border-slate-700/50',
            icon: <AlertTriangle className="w-3.5 h-3.5" />
        };
    }
    if (price >= entryLow && price <= entryHigh) {
        return {
            status: 'ENTRY_ZONE', label: t('entryZone'),
            detail: `$${entryLow.toFixed(0)}~$${entryHigh.toFixed(0)}`,
            color: 'text-emerald-400', bgClass: 'bg-[#0f172a] border-slate-700/50',
            icon: <CheckCircle className="w-3.5 h-3.5" />
        };
    }
    return {
        status: 'WAIT', label: t('waitZone'),
        detail: price > entryHigh ? `$${entryHigh.toFixed(0)} ${t('waitBelow')}` : `$${entryLow.toFixed(0)} ${t('waitAbove')}`,
        color: 'text-slate-400', bgClass: 'bg-[#0f172a] border-slate-700/50',
        icon: <Clock className="w-3.5 h-3.5" />
    };
}

// =============================================================================
// TRIGGER BADGE CONFIG
// =============================================================================

const TRIGGER_I18N_KEY: Record<string, { key: string; icon: React.ReactNode; type: 'positive' | 'negative' | 'neutral' }> = {
    MOM_STRONG: { key: 'trigMomStrong', icon: <TrendingUp className="w-3 h-3" />, type: 'positive' },
    MOMENTUM_UP: { key: 'trigMomUp', icon: <ArrowUp className="w-3 h-3" />, type: 'positive' },
    TREND_3D: { key: 'trigTrend3D', icon: <BarChart className="w-3 h-3" />, type: 'positive' },
    SMART_DIP: { key: 'trigSmartDip', icon: <Building2 className="w-3 h-3" />, type: 'positive' },
    GEX_SAFE: { key: 'trigGexSafe', icon: <Shield className="w-3 h-3" />, type: 'positive' },
    GEX_NEG: { key: 'trigGexNeg', icon: <AlertTriangle className="w-3 h-3" />, type: 'negative' },
    GEX_SQZ: { key: 'trigGexSqz', icon: <Zap className="w-3 h-3" />, type: 'positive' },
    SQUEEZE: { key: 'trigSqueeze', icon: <Zap className="w-3 h-3" />, type: 'positive' },
    DP_HIGH: { key: 'trigDpHigh', icon: <Eye className="w-3 h-3" />, type: 'positive' },
    WHALE_IN: { key: 'trigWhaleIn', icon: <Waves className="w-3 h-3" />, type: 'positive' },
    SHORT_ALERT: { key: 'trigShortAlert', icon: <ArrowDown className="w-3 h-3" />, type: 'negative' },
    VOL_BOOM: { key: 'trigVolBoom', icon: <Activity className="w-3 h-3" />, type: 'positive' },
    REGIME_OFF: { key: 'trigRegimeOff', icon: <Radio className="w-3 h-3" />, type: 'negative' },
    CALL_DOMINANT: { key: 'trigCallDom', icon: <ArrowUp className="w-3 h-3" />, type: 'positive' },
    PUT_DOMINANT: { key: 'trigPutDom', icon: <ArrowDown className="w-3 h-3" />, type: 'negative' },
    GATE_EXHAUST: { key: 'trigGateExhaust', icon: <Flame className="w-3 h-3" />, type: 'negative' },
    GATE_FAKE: { key: 'trigGateFake', icon: <AlertTriangle className="w-3 h-3" />, type: 'negative' },
    GATE_WALL: { key: 'trigGateWall', icon: <Shield className="w-3 h-3" />, type: 'negative' },
    GATE_SHORT: { key: 'trigGateShort', icon: <Activity className="w-3 h-3" />, type: 'negative' },
    SUPPRESSED: { key: 'trigSuppressed', icon: <Minus className="w-3 h-3" />, type: 'neutral' },
    ACCEL_DROP: { key: 'trigAccelDrop', icon: <ArrowDown className="w-3 h-3" />, type: 'negative' },
    CORRECTION: { key: 'trigCorrection', icon: <ArrowDown className="w-3 h-3" />, type: 'negative' },
    REGIME_FAVORABLE: { key: 'trigRegimeFav', icon: <Radio className="w-3 h-3" />, type: 'positive' },
};

// =============================================================================
// PILLAR BAR CONFIG
// =============================================================================

const PILLAR_I18N_KEY: Record<string, { key: string; icon: React.ReactNode; color: string }> = {
    momentum: { key: 'pillarMomentum', icon: <TrendingUp className="w-3 h-3" />, color: 'emerald' },
    structure: { key: 'pillarStructure', icon: <BarChart3 className="w-3 h-3" />, color: 'blue' },
    flow: { key: 'pillarFlow', icon: <Activity className="w-3 h-3" />, color: 'violet' },
    regime: { key: 'pillarRegime', icon: <Radio className="w-3 h-3" />, color: 'amber' },
    catalyst: { key: 'pillarCatalyst', icon: <Zap className="w-3 h-3" />, color: 'cyan' },
};

function PillarBar({ name, pillar, t }: { name: string; pillar: PillarData; t: any }) {
    const config = PILLAR_I18N_KEY[name];
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
            <div className={cn("w-4 flex-shrink-0", c.text, "opacity-70")}>{config.icon}</div>
            <span className="text-xs text-slate-300 w-14 flex-shrink-0 font-semibold font-jakarta">{t(config.key)}</span>
            <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all duration-700", c.bar)}
                    style={{ width: `${pct}%`, opacity: pct > 50 ? 0.9 : 0.5 }}
                />
            </div>
            <span className={cn("text-xs font-mono font-bold w-10 text-right font-jakarta",
                pct >= 70 ? c.text : pct >= 40 ? "text-slate-300" : "text-slate-300/60"
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
    pillars, gatesApplied, dataCompleteness, t
}: {
    pillars: AlphaCardProps['pillars'];
    gatesApplied?: string[];
    dataCompleteness?: number;
    t: any;
}) {
    if (!pillars) {
        return (
            <div className="mt-3 py-4 text-center">
                <p className="text-slate-300 text-xs">{t('noEngineData')}</p>
            </div>
        );
    }

    const pillarEntries = Object.entries(pillars) as [string, PillarData][];

    return (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
            {pillarEntries.map(([key, pillar]) => (
                <PillarBar key={key} name={key} pillar={pillar} t={t} />
            ))}

            {/* Gates & Data Quality footer */}
            <div className="flex items-center justify-between pt-2 text-xs">
                {gatesApplied && gatesApplied.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-rose-400">
                        <Shield className="w-3.5 h-3.5" />
                        <span className="font-bold">{gatesApplied.join(', ')}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-emerald-400/70">
                        <Shield className="w-3.5 h-3.5" />
                        <span className="font-semibold">{t('gatesPassed')}</span>
                    </div>
                )}
                {dataCompleteness !== undefined && (
                    <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-white/40" />
                        <span className={cn("font-mono font-bold",
                            dataCompleteness >= 80 ? "text-emerald-300" :
                                dataCompleteness >= 50 ? "text-amber-300" : "text-slate-400"
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

function PriceLevelBar({ price, entryLow, entryHigh, targetPrice, cutPrice, callWall, t }: {
    price: number; entryLow: number; entryHigh: number; targetPrice: number; cutPrice: number; callWall?: number; t: any;
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
                    className="absolute w-3 h-3 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] border-2 border-white/90 z-10"
                    style={{ left: `${pos(price)}%`, top: '50%', transform: 'translate(-50%,-50%)' }}
                />
            </div>

            {/* Numeric labels — M7 style grid boxes */}
            <div className="grid grid-cols-3 gap-1">
                <div className="bg-white/[0.06] rounded-lg py-1.5 px-2 border border-white/[0.08] text-center">
                    <p className="text-xs text-slate-300 uppercase tracking-[0.12em] font-bold font-jakarta">{t('cutZone')}</p>
                    <p className="text-sm font-bold text-rose-300 font-mono font-jakarta">${cutPrice.toFixed(0)}</p>
                    <p className="text-xs text-rose-400/80 font-mono font-jakarta">{downside.toFixed(1)}%</p>
                </div>
                <div className="bg-white/[0.08] rounded-lg py-1.5 px-2 border border-emerald-500/15 text-center shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                    <p className="text-xs text-emerald-400/80 uppercase tracking-[0.12em] font-bold font-jakarta">{t('entryZone')}</p>
                    <p className="text-sm font-bold text-white/90 font-mono font-jakarta">
                        ${entryLow.toFixed(0)}<span className="text-white/50 px-0.5">~</span>${entryHigh.toFixed(0)}
                    </p>
                </div>
                <div className="bg-white/[0.06] rounded-lg py-1.5 px-2 border border-white/[0.08] text-center">
                    <p className="text-xs text-slate-300 uppercase tracking-[0.12em] font-bold font-jakarta">TARGET</p>
                    <p className="text-sm font-bold text-emerald-300 font-mono font-jakarta">${targetPrice.toFixed(0)}</p>
                    <p className="text-xs text-emerald-400/80 font-mono font-jakarta">+{upside.toFixed(1)}%</p>
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
    const t = useTranslations('alphaReport');
    const [showInsight, setShowInsight] = useState(false);

    const entrySignal = getEntrySignal(price, entryLow, entryHigh, cutPrice, callWall, t);
    const logoUrl = `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

    const upside = targetPrice > 0 && price > 0 ? ((targetPrice - price) / price * 100) : 0;
    const downside = cutPrice > 0 && price > 0 ? ((cutPrice - price) / price * 100) : 0;
    const rr = downside !== 0 ? Math.abs(upside / downside) : 0;

    const handleClick = () => router.push(`/ticker?ticker=${ticker}`);
    const handleInsightToggle = (e: React.MouseEvent) => { e.stopPropagation(); setShowInsight(!showInsight); };

    // Dynamic border based on conviction
    const borderColor = alphaScore >= 80
        ? 'border-cyan-400/30 hover:border-cyan-400/50'
        : alphaScore >= 65
            ? 'border-emerald-400/25 hover:border-emerald-400/40'
            : isHighRisk
                ? 'border-rose-500/20 hover:border-rose-500/35'
                : 'border-white/[0.12] hover:border-white/[0.22]';

    const isUp = changePct >= 0;

    return (
        <div
            className={cn(
                // ── M7 Glassmorphism Card Shell ──
                "relative flex flex-col rounded-xl border transition-all duration-300 overflow-hidden group cursor-pointer",
                "bg-slate-800/40 backdrop-blur-xl shadow-lg shadow-black/20",
                "hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]",
                borderColor,
            )}
            onClick={handleClick}
        >
            {/* Glass shine — M7 signature */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50 z-10" />

            {/* Premium Infographic Background (Boosted Visibility) */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl opacity-100 z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:16px_16px]" />
                <div className="absolute -top-10 -right-10 w-48 h-48 bg-[radial-gradient(circle,rgba(52,211,153,0.15)_0%,transparent_70%)] rounded-full mix-blend-screen" />
            </div>

            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10" />

            {/* ─── HEADER: Rank + Logo + Ticker | Score Ring ─── */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-3">
                    <RankBadge rank={rank} />
                    {/* M7-style circular logo */}
                    <div className="w-10 h-10 rounded-full p-[1px] bg-gradient-to-b from-white/20 to-white/5 shadow-lg flex-shrink-0">
                        <div className="w-full h-full rounded-full bg-[#0a0f14] overflow-hidden flex items-center justify-center relative">
                            <img src={logoUrl} alt={ticker} className="w-full h-full object-cover scale-[1.05]"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_10px_rgba(255,255,255,0.1)] pointer-events-none" />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-white tracking-tight font-jakarta">{ticker}</h3>
                            {isHighRisk && (
                                <span className="text-xs font-bold bg-rose-500/15 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/20 uppercase tracking-wider font-jakarta">
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
                <div className="text-3xl font-black text-white tracking-tighter tabular-nums font-jakarta drop-shadow-md">
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
                            <span className={cn("text-[13px] font-bold font-jakarta border-b border-current pb-0.5", entrySignal.color)}>{entrySignal.label}</span>
                            <span className={cn("text-[13px] font-mono font-bold font-jakarta", entrySignal.color)}>{entrySignal.detail}</span>
                        </div>
                        {actionKR && (
                            <p className="text-xs text-white/80 mt-1.5 leading-relaxed font-jakarta font-medium">
                                {actionKR.replace(/[🔥✅👀⏸️⚠️🚫]/g, '').trim()}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── PRICE LEVEL BAR ─── */}
            {entryLow > 0 && (
                <div className="mx-4 mb-3 p-3 rounded-lg bg-gradient-to-br from-white/[0.10] to-white/[0.04] border border-white/[0.12]">
                    <PriceLevelBar
                        price={price}
                        entryLow={entryLow}
                        entryHigh={entryHigh}
                        targetPrice={targetPrice}
                        cutPrice={cutPrice}
                        callWall={callWall}
                        t={t}
                    />
                </div>
            )}

            {/* ─── QUICK STATS (M7 grid style) ─── */}
            <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-white/[0.08] border border-white/[0.10]">
                <div className="flex items-center justify-between text-xs text-white/60">
                    <div className="flex items-center gap-3">
                        {callWall ? <span>CW <span className="text-white/80 font-mono font-bold">${callWall.toFixed(0)}</span></span> : null}
                        {putFloor ? <span>PF <span className="text-white/80 font-mono font-bold">${putFloor.toFixed(0)}</span></span> : null}
                        {whaleNetM !== undefined && whaleNetM !== 0 && (
                            <span className={cn("font-bold flex items-center gap-0.5",
                                whaleNetM >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'
                            )}>
                                <Waves className="w-3 h-3" />
                                {whaleNetM >= 0 ? '+' : ''}{whaleNetM.toFixed(1)}M
                            </span>
                        )}
                    </div>
                    {rr > 0 && (
                        <span className="text-white/60 font-mono">
                            R:R <span className={cn("font-bold", rr >= 2 ? 'text-emerald-300' : 'text-white/70')}>{rr.toFixed(1)}:1</span>
                        </span>
                    )}
                </div>
            </div>

            {/* ─── WHY (Analysis text — M7 card analysis style) ─── */}
            {whyKR && (
                <div className="mx-4 mb-3 px-3 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]">
                    <p className="text-xs text-white/80 leading-relaxed font-jakarta font-medium">{whyKR}</p>
                </div>
            )}

            {/* ─── TRIGGER BADGES (M7 tag style) ─── */}
            {triggerCodes && triggerCodes.length > 0 && (
                <div className="mx-4 mb-3 px-3 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.08] flex flex-wrap gap-1.5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)]">
                    {triggerCodes.slice(0, 6).map(code => {
                        const trigCfg = TRIGGER_I18N_KEY[code];
                        if (!trigCfg) return null;
                        return (
                            <span key={code} className={cn(
                                "text-xs font-bold px-2 py-1 rounded-md border flex items-center gap-1.5 font-jakarta shadow-sm",
                                "bg-[#0f172a] text-slate-300 border-slate-700/50"
                            )}>
                                <span className={cn(
                                    trigCfg.type === 'positive' ? 'text-emerald-400' :
                                        trigCfg.type === 'negative' ? 'text-rose-400' : 'text-slate-300'
                                )}>{trigCfg.icon}</span>
                                {t(trigCfg.key)}
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
                        "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all duration-300 border",
                        showInsight
                            ? "bg-white/[0.08] border-white/[0.15] text-white/80"
                            : "bg-white/[0.04] border-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.06]"
                    )}
                >
                    <Gauge className="w-3.5 h-3.5" />
                    {showInsight ? t('insightFold') : t('insightUnfold')}
                    {showInsight ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {/* INSIGHT LAYER */}
                {showInsight && (
                    <InsightPanel pillars={pillars} gatesApplied={gatesApplied} dataCompleteness={dataCompleteness} t={t} />
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
