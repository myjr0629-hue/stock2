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
    alphaScore: number | null;
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
    isEntryTriggered?: boolean;  // [V6.0] Real-time entry zone triggered flag
    isHighRisk?: boolean;
    variant?: 'hero' | 'compact';
    onClick?: () => void;
    // === Engine data ===
    whyKR?: string;
    actionKR?: string;
    action?: string;
    grade?: string;
    triggerCodes?: string[];
    whyFactors?: string[];
    darkPoolPct?: number;
    shortVolPct?: number;
    relVol?: number;
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

// Grade-to-color mapping (single source of truth)
const GRADE_COLORS: Record<string, { stroke: string; glow: string; text: string; bg: string; border: string }> = {
    S: { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.30)', text: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
    A: { stroke: '#22d3ee', glow: 'rgba(34,211,238,0.25)', text: 'text-cyan-300', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
    B: { stroke: '#34d399', glow: 'rgba(52,211,153,0.20)', text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
    C: { stroke: '#94a3b8', glow: 'rgba(148,163,184,0.10)', text: 'text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/30' },
    D: { stroke: '#fb923c', glow: 'rgba(251,146,60,0.15)', text: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/30' },
    F: { stroke: '#f87171', glow: 'rgba(248,113,113,0.15)', text: 'text-rose-300', bg: 'bg-rose-500/15', border: 'border-rose-500/30' },
};
const DEFAULT_GRADE_COLOR = GRADE_COLORS.C;

function ScoreRing({ score, grade, size = 64, strokeWidth = 4 }: { score: number | null; grade?: string; size?: number; strokeWidth?: number }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    // [XS-2.0] score can be null (engine gave none) — empty ring + '—', never a fake number
    const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;
    const offset = circumference - (pct / 100) * circumference;
    const center = size / 2;

    const c = score != null ? (GRADE_COLORS[grade || ''] || DEFAULT_GRADE_COLOR) : DEFAULT_GRADE_COLOR;
    const label = score == null ? '' : grade || (score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : score >= 25 ? 'D' : 'F');

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
                <span className={cn("font-black leading-none font-jakarta", c.text, size >= 60 ? "text-[20px]" : "text-[15px]")}>{score != null ? score.toFixed(1) : '—'}</span>
                <span className={cn("font-bold opacity-80 mt-0.5 font-jakarta", c.text, "text-xs")}>{label}</span>
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
        size: 'w-6 h-6 text-xs',
    } : rank === 3 ? {
        bg: 'bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700',
        text: 'text-amber-100',
        shadow: 'shadow-[0_0_8px_rgba(217,119,6,0.3)]',
        size: 'w-6 h-6 text-xs',
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
        color: 'text-slate-300', bgClass: 'bg-[#0f172a] border-slate-700/50',
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

// =============================================================================
// SIGNAL GRID CONFIG (Maps whyFactor codes to i18n + UI)
// =============================================================================

const SIGNAL_CONFIG: Record<string, { i18nKey: string; icon: React.ReactNode; color: string }> = {
    STRONG_MOMENTUM: { i18nKey: 'sigMomStrong', icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'emerald' },
    MOMENTUM_UP: { i18nKey: 'sigMomUp', icon: <ArrowUp className="w-3.5 h-3.5" />, color: 'emerald' },
    TREND_3D: { i18nKey: 'sigTrend3D', icon: <BarChart className="w-3.5 h-3.5" />, color: 'emerald' },
    SMART_DIP: { i18nKey: 'sigSmartDip', icon: <Building2 className="w-3.5 h-3.5" />, color: 'cyan' },
    GEX_SAFE: { i18nKey: 'sigGexSafe', icon: <Shield className="w-3.5 h-3.5" />, color: 'cyan' },
    GEX_NEGATIVE: { i18nKey: 'sigGexNeg', icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'amber' },
    SQUEEZE_READY: { i18nKey: 'sigSqueeze', icon: <Zap className="w-3.5 h-3.5" />, color: 'violet' },
    CALL_DOMINANT: { i18nKey: 'sigCallDom', icon: <ArrowUp className="w-3.5 h-3.5" />, color: 'emerald' },
    DARK_POOL_HIGH: { i18nKey: 'sigDarkPool', icon: <Eye className="w-3.5 h-3.5" />, color: 'violet' },
    WHALE_IN: { i18nKey: 'sigWhaleIn', icon: <Waves className="w-3.5 h-3.5" />, color: 'cyan' },
    SHORT_ALERT: { i18nKey: 'sigShortAlert', icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'rose' },
    VOL_EXPLOSION: { i18nKey: 'sigVolBoom', icon: <Activity className="w-3.5 h-3.5" />, color: 'amber' },
    REGIME_FAVORABLE: { i18nKey: 'sigRegimeFav', icon: <Radio className="w-3.5 h-3.5" />, color: 'emerald' },
    REGIME_ADVERSE: { i18nKey: 'sigRegimeOff', icon: <Radio className="w-3.5 h-3.5" />, color: 'rose' },
    SERIAL_WINNER: { i18nKey: 'sigSerialWin', icon: <Target className="w-3.5 h-3.5" />, color: 'amber' },
    SERIAL_LOSER: { i18nKey: 'sigSerialLose', icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'rose' },
};

const SIGNAL_COLOR_MAP: Record<string, { bg: string; border: string; iconColor: string; label: string }> = {
    emerald: { bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/20', iconColor: 'text-emerald-400', label: 'text-emerald-300/80' },
    cyan: { bg: 'bg-cyan-500/[0.08]', border: 'border-cyan-500/20', iconColor: 'text-cyan-400', label: 'text-cyan-300/80' },
    violet: { bg: 'bg-violet-500/[0.08]', border: 'border-violet-500/20', iconColor: 'text-violet-400', label: 'text-violet-300/80' },
    amber: { bg: 'bg-amber-500/[0.08]', border: 'border-amber-500/20', iconColor: 'text-amber-400', label: 'text-amber-300/80' },
    rose: { bg: 'bg-rose-500/[0.08]', border: 'border-rose-500/20', iconColor: 'text-rose-400', label: 'text-rose-300/80' },
};

function getSignalValue(code: string, data: AlphaCardProps): string | null {
    switch (code) {
        case 'STRONG_MOMENTUM':
        case 'MOMENTUM_UP': return data.pillars?.momentum?.pct ? `${data.pillars.momentum.pct}%` : null;
        case 'DARK_POOL_HIGH': return data.darkPoolPct ? `DP ${Math.round(data.darkPoolPct)}%` : null;
        case 'SHORT_ALERT': return data.shortVolPct ? `${Math.round(data.shortVolPct)}%` : null;
        case 'WHALE_IN': return data.whaleNetM ? `${data.whaleNetM >= 0 ? '+' : ''}${data.whaleNetM.toFixed(1)}M` : null;
        case 'VOL_EXPLOSION': return data.relVol ? `${data.relVol.toFixed(1)}x` : null;
        case 'GEX_SAFE':
        case 'GEX_NEGATIVE': return data.pillars?.structure?.pct ? `${data.pillars.structure.pct}%` : null;
        case 'SQUEEZE_READY': return data.pillars?.structure?.pct ? `${data.pillars.structure.pct}%` : null;
        default: return null;
    }
}

// =============================================================================
// AI ANALYSIS GENERATOR (Natural language from structured data)
// =============================================================================

function generateAlphaAnalysis(data: AlphaCardProps, t: (key: string, params?: Record<string, any>) => string): string {
    const parts: string[] = [];

    const momPct = data.pillars?.momentum?.pct || 0;
    if (momPct >= 80) parts.push(t('analysisMomStrong'));
    else if (momPct >= 60) parts.push(t('analysisMomModerate'));

    if (data.whyFactors?.includes('TREND_3D')) parts.push(t('analysisTrend3D'));

    if (data.whyFactors?.includes('GEX_SAFE')) parts.push(t('analysisGexSafe'));
    else if (data.whyFactors?.includes('GEX_NEGATIVE')) parts.push(t('analysisGexNeg'));

    if (data.darkPoolPct && data.darkPoolPct >= 50)
        parts.push(t('analysisDarkPool', { pct: Math.round(data.darkPoolPct) }));

    if (data.whyFactors?.includes('WHALE_IN')) parts.push(t('analysisWhaleIn'));

    if (data.shortVolPct && data.shortVolPct >= 50)
        parts.push(t('analysisShortHigh', { pct: Math.round(data.shortVolPct) }));

    if (data.whyFactors?.includes('SQUEEZE_READY')) parts.push(t('analysisSqueeze'));

    if (data.relVol && data.relVol >= 2.5)
        parts.push(t('analysisVolBoom', { rv: data.relVol.toFixed(1) }));

    if (data.callWall && data.price >= data.callWall * 0.98)
        parts.push(t('analysisNearCW', { cw: data.callWall.toFixed(0) }));
    else if (data.putFloor && data.price <= data.putFloor * 1.03)
        parts.push(t('analysisNearPF', { pf: data.putFloor.toFixed(0) }));

    if (data.gatesApplied?.includes('EXHAUSTION')) parts.push(t('analysisGateExhaust'));
    if (data.gatesApplied?.includes('FAKE_PUMP')) parts.push(t('analysisGateFake'));

    if (data.entryLow && data.cutPrice && data.targetPrice && data.cutPrice > 0) {
        const entry = (data.entryLow + (data.entryHigh || data.entryLow)) / 2;
        const risk = entry - data.cutPrice;
        const reward = data.targetPrice - entry;
        if (risk > 0) parts.push(t('analysisRR', { rr: (reward / risk).toFixed(1) }));
    }

    if (data.grade) {
        const key = (data.grade === 'S' || data.grade === 'A') ? 'conclusionBuy'
            : data.grade === 'B' ? 'conclusionWatch'
                : data.grade === 'C' ? 'conclusionHold'
                    : 'conclusionCaution';
        parts.push(t(key, { grade: data.grade }));
    }

    return parts.join(' ');
}

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
            <div className={cn("w-4 flex-shrink-0", c.text, "opacity-80")}>{config.icon}</div>
            <span className="text-xs text-slate-300 w-14 flex-shrink-0 font-semibold font-jakarta">{t(config.key)}</span>
            <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all duration-700", c.bar)}
                    style={{ width: `${pct}%`, opacity: pct > 50 ? 0.9 : 0.5 }}
                />
            </div>
            <span className={cn("text-xs font-mono font-bold w-10 text-right font-jakarta",
                pct >= 70 ? c.text : pct >= 40 ? "text-slate-300" : "text-slate-300"
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
                        <Database className="w-3.5 h-3.5 text-white/60" />
                        <span className={cn("font-mono font-bold",
                            dataCompleteness >= 80 ? "text-emerald-300" :
                                dataCompleteness >= 50 ? "text-amber-300" : "text-slate-300"
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

function PriceLevelBar({ price, entryLow, entryHigh, targetPrice, cutPrice, callWall, isEntryTriggered, t }: {
    price: number; entryLow: number; entryHigh: number; targetPrice: number; cutPrice: number; callWall?: number; isEntryTriggered?: boolean; t: any;
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
            <div className="relative h-3 bg-white/[0.10] rounded-full overflow-visible">
                {entryLow > 0 && entryHigh > 0 && (
                    <div
                        className="absolute top-0 h-full bg-emerald-500/35 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.25)]"
                        style={{ left: `${pos(entryLow)}%`, width: `${pos(entryHigh) - pos(entryLow)}%` }}
                    />
                )}
                {cutPrice > 0 && (
                    <div className="absolute top-0 w-[3px] h-full bg-rose-400 rounded-full shadow-[0_0_6px_rgba(251,113,133,0.5)]"
                        style={{ left: `${pos(cutPrice)}%` }}
                    />
                )}
                {targetPrice > 0 && (
                    <div className="absolute top-0 w-[3px] h-full bg-emerald-400 rounded-full shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                        style={{ left: `${pos(targetPrice)}%` }}
                    />
                )}
                <div
                    className="absolute w-4 h-4 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)] border-2 border-white z-10"
                    style={{ left: `${pos(price)}%`, top: '50%', transform: 'translate(-50%,-50%)' }}
                />
            </div>

            {/* Numeric labels — M7 style grid boxes */}
            <div className="grid grid-cols-3 gap-1">
                <div className="bg-white/[0.06] rounded-lg py-1.5 px-1.5 border border-white/[0.08] text-center min-w-0 overflow-hidden">
                    <p className="text-xs text-slate-300 uppercase tracking-[0.08em] font-bold font-jakarta">{t('cutZone')}</p>
                    <p className="text-sm font-bold text-rose-300 font-mono font-jakarta truncate">${cutPrice.toFixed(0)}</p>
                    <p className="text-[13px] text-rose-400 font-bold font-mono font-jakarta">{downside.toFixed(1)}%</p>
                </div>
                <div className="bg-white/[0.08] rounded-lg py-1.5 px-1.5 border border-emerald-500/15 text-center shadow-[0_0_15px_rgba(16,185,129,0.05)] min-w-0 overflow-hidden relative">
                    <p className="text-xs text-emerald-400 uppercase tracking-[0.08em] font-bold font-jakarta">{t('entryZone')}</p>
                    {isEntryTriggered && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border border-emerald-300" />
                        </span>
                    )}
                    <p className="text-sm font-bold text-white/90 font-mono font-jakarta leading-snug">
                        <span className="whitespace-nowrap">${entryLow.toFixed(0)}</span>
                        <span className="text-white/50">~</span>
                        <span className="whitespace-nowrap">${entryHigh.toFixed(0)}</span>
                    </p>
                </div>
                <div className="bg-white/[0.06] rounded-lg py-1.5 px-1.5 border border-white/[0.08] text-center min-w-0 overflow-hidden">
                    <p className="text-xs text-slate-300 uppercase tracking-[0.08em] font-bold font-jakarta">TARGET</p>
                    <p className="text-sm font-bold text-emerald-300 font-mono font-jakarta truncate">${targetPrice.toFixed(0)}</p>
                    <p className="text-[13px] text-emerald-400 font-bold font-mono font-jakarta">+{upside.toFixed(1)}%</p>
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
    whaleNetM, callWall, putFloor, isLive = false, isEntryTriggered = false, isHighRisk = false,
    variant = 'compact', onClick,
    whyKR, actionKR, action, grade, triggerCodes, whyFactors,
    darkPoolPct, shortVolPct, relVol,
    pillars, gatesApplied, dataCompleteness,
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

    // Dynamic border based on grade
    const gradeColor = GRADE_COLORS[grade || ''] || DEFAULT_GRADE_COLOR;
    const borderColor = grade === 'S'
        ? 'border-amber-400/30 hover:border-amber-400/50'
        : grade === 'A'
            ? 'border-cyan-400/30 hover:border-cyan-400/50'
            : grade === 'B'
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
            {/* Glass shine — top edge reflection */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent z-10" />

            {/* ═══ Premium Infographic Background ═══ */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl z-0">
                {/* 1. Large radial grade glow — top right */}
                <div
                    className={cn(
                        "absolute -top-20 -right-20 w-72 h-72 rounded-full",
                        grade === 'S' ? 'bg-amber-500/25' :
                            grade === 'A' ? 'bg-cyan-500/20' :
                                grade === 'B' ? 'bg-emerald-500/[0.18]' :
                                    grade === 'C' ? 'bg-blue-500/[0.12]' :
                                        'bg-slate-400/10'
                    )}
                    style={{ filter: 'blur(50px)' }}
                />
                {/* 2. Secondary glow — bottom left */}
                <div
                    className={cn(
                        "absolute -bottom-16 -left-16 w-48 h-48 rounded-full",
                        grade === 'S' ? 'bg-orange-500/[0.15]' :
                            grade === 'A' ? 'bg-blue-500/[0.12]' :
                                grade === 'B' ? 'bg-teal-500/10' :
                                    'bg-indigo-500/[0.08]'
                    )}
                    style={{ filter: 'blur(40px)' }}
                />
                {/* 3. Fine dot pattern — tech HUD feel */}
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                        opacity: 0.4
                    }}
                />
                {/* 4. Frosted white highlight — top band */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-white/[0.06] to-transparent" />
                {/* 5. Bottom vignette for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
            </div>

            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10" />

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
                            <h3 className="text-base font-black text-white tracking-tight font-jakarta">{ticker}</h3>
                            {grade && (
                                <span className={cn(
                                    "text-xs font-black px-1.5 py-0.5 rounded border backdrop-blur-sm font-jakarta tracking-wide",
                                    gradeColor.bg, gradeColor.border, gradeColor.text
                                )}>{grade}</span>
                            )}
                            {isHighRisk && (
                                <span className="text-xs font-bold bg-rose-500/15 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/20 uppercase tracking-wider font-jakarta">
                                    SPEC
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <ScoreRing score={alphaScore} grade={grade} size={52} strokeWidth={3.5} />
            </div>

            {/* ─── PRICE SECTION (M7 style — centered, large) ─── */}
            <div className="flex flex-col items-center px-4 pb-2">
                <div className="text-3xl font-black text-white tracking-tighter tabular-nums font-jakarta drop-shadow-md">
                    ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={cn(
                    "flex items-center gap-0.5 text-sm font-black mt-0.5 font-jakarta",
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
                            <span className={cn("text-sm font-bold font-jakarta border-b border-current pb-0.5", entrySignal.color)}>{entrySignal.label}</span>
                            <span className={cn("text-sm font-mono font-bold font-jakarta", entrySignal.color)}>{entrySignal.detail}</span>
                        </div>
                        {action ? (
                            <p className={cn("text-xs mt-1.5 leading-relaxed font-jakarta font-bold tracking-wide uppercase", gradeColor.text)}>
                                {t(`action_${action.toLowerCase()}`)}
                            </p>
                        ) : actionKR ? (
                            <p className="text-xs text-white/85 mt-1.5 leading-relaxed font-jakarta font-medium">
                                {actionKR.replace(/[🔥✅👀⏸️⚠️🚫]/g, '').trim()}
                            </p>
                        ) : null}
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
                        isEntryTriggered={isEntryTriggered}
                        t={t}
                    />
                </div>
            )}

            {/* ─── QUICK STATS (M7 grid style) ─── */}
            <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-white/[0.08] border border-white/[0.10]">
                <div className="flex items-center justify-between text-xs text-white/70 font-jakarta">
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

            {/* ─── SIGNAL GRID (M7-style mini-cards — replaces whyKR) ─── */}
            {whyFactors && whyFactors.length > 0 ? (
                <div className="mx-4 mb-3">
                    <div className={cn(
                        "grid gap-1.5",
                        whyFactors.filter(c => SIGNAL_CONFIG[c]).length <= 2 ? 'grid-cols-2' : 'grid-cols-3'
                    )}>
                        {whyFactors.slice(0, 4).map(code => {
                            const cfg = SIGNAL_CONFIG[code];
                            if (!cfg) return null;
                            const colors = SIGNAL_COLOR_MAP[cfg.color] || SIGNAL_COLOR_MAP.emerald;
                            const val = getSignalValue(code, { ticker, rank, price, changePct, alphaScore, whaleNetM, pillars, darkPoolPct, shortVolPct, relVol } as AlphaCardProps);
                            return (
                                <div key={code} className={cn(
                                    "rounded-lg p-2 text-center border transition-all duration-300",
                                    colors.bg, colors.border
                                )}>
                                    <div className="flex items-center justify-center gap-1 mb-1.5">
                                        <span className={colors.iconColor}>{cfg.icon}</span>
                                    </div>
                                    {val && (
                                        <div className={cn("text-sm font-black font-mono tracking-tight mb-0.5", colors.iconColor)}>
                                            {val}
                                        </div>
                                    )}
                                    <div className={cn("text-xs font-bold uppercase tracking-wider font-jakarta", colors.label)}>
                                        {t(cfg.i18nKey)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : whyKR ? (
                <div className="mx-4 mb-3 px-3 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]">
                    <p className="text-xs text-white/85 leading-relaxed font-jakarta font-medium" data-ai-prose>{whyKR}</p>
                </div>
            ) : null}

            {/* ─── AI ANALYSIS (Natural language — M7 TacticalDeck style) ─── */}
            {(() => {
                const analysisText = generateAlphaAnalysis(
                    {
                        ticker, rank, price, changePct, alphaScore, whaleNetM, callWall, putFloor,
                        entryLow, entryHigh, targetPrice, cutPrice, grade, whyFactors,
                        darkPoolPct, shortVolPct, relVol, pillars, gatesApplied
                    } as AlphaCardProps,
                    t
                );
                if (!analysisText) return null;
                return (
                    <div className="mx-4 mb-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <Crosshair className="w-3 h-3 text-violet-400" />
                            <span className="text-xs font-bold text-white/60 uppercase tracking-wider font-jakarta">AI Analysis</span>
                        </div>
                        <div className="px-3 py-2.5 rounded-lg bg-violet-500/[0.06] border border-violet-500/15 shadow-[inset_0_1px_4px_rgba(0,0,0,0.15)]">
                            <p className="text-xs text-white/85 leading-[1.6] font-medium font-jakarta" data-ai-prose>{analysisText}</p>
                        </div>
                    </div>
                );
            })()}

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
