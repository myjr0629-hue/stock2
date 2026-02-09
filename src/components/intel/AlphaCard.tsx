'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    CheckCircle, XCircle, AlertTriangle, Clock,
    ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight,
    Shield, Activity, Zap, TrendingUp, BarChart3,
    Eye, Radio, Database
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
    // === Engine "속살" data ===
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
// HELPER: Entry Signal
// =============================================================================

type EntryStatus = 'ENTRY_ZONE' | 'WAIT' | 'EXTENDED' | 'CUT_ZONE';

function getEntrySignal(
    price: number,
    entryLow: number,
    entryHigh: number,
    cutPrice: number,
    callWall?: number
): { status: EntryStatus; label: string; detail: string; color: string; bgColor: string; icon: React.ReactNode } {
    if (price <= cutPrice) {
        return {
            status: 'CUT_ZONE', label: '손절 구간',
            detail: `$${cutPrice.toFixed(0)} 이탈`,
            color: 'text-rose-400', bgColor: 'bg-rose-500/10 border-rose-500/20',
            icon: <XCircle className="w-3.5 h-3.5" />
        };
    }
    if (callWall && price >= callWall * 0.98) {
        return {
            status: 'EXTENDED', label: '과매수',
            detail: `CW $${callWall.toFixed(0)} 접근`,
            color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20',
            icon: <AlertTriangle className="w-3.5 h-3.5" />
        };
    }
    if (price >= entryLow && price <= entryHigh) {
        return {
            status: 'ENTRY_ZONE', label: '진입 적기',
            detail: `$${entryLow.toFixed(0)}~$${entryHigh.toFixed(0)}`,
            color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20',
            icon: <CheckCircle className="w-3.5 h-3.5" />
        };
    }
    return {
        status: 'WAIT', label: '대기',
        detail: price > entryHigh ? `$${entryHigh.toFixed(0)} 이하 대기` : `$${entryLow.toFixed(0)} 이상 대기`,
        color: 'text-slate-400', bgColor: 'bg-slate-500/10 border-slate-500/20',
        icon: <Clock className="w-3.5 h-3.5" />
    };
}

// =============================================================================
// HELPER: Score Grade Badge
// =============================================================================

function GradeBadge({ score, grade }: { score: number; grade?: string }) {
    const g = grade || (score >= 80 ? 'S' : score >= 65 ? 'A' : score >= 50 ? 'B' : score >= 35 ? 'C' : 'D');
    const colors: Record<string, string> = {
        S: 'from-yellow-400 to-amber-500 text-black',
        A: 'from-emerald-400 to-cyan-500 text-black',
        B: 'from-blue-400 to-indigo-500 text-white',
        C: 'from-slate-400 to-slate-500 text-white',
        D: 'from-rose-400 to-red-500 text-white',
        F: 'from-red-600 to-red-800 text-white',
    };
    return (
        <div className={cn(
            "w-14 h-14 rounded-xl bg-gradient-to-br flex flex-col items-center justify-center shadow-lg",
            colors[g] || colors.C
        )}>
            <span className="text-lg font-black leading-none">{score.toFixed(0)}</span>
            <span className="text-[9px] font-bold opacity-80">{g}</span>
        </div>
    );
}

// =============================================================================
// HELPER: Trigger Badge
// =============================================================================

const TRIGGER_LABELS: Record<string, { label: string; color: string }> = {
    MOM_STRONG: { label: '모멘텀↑', color: 'text-emerald-400 border-emerald-500/30' },
    TREND_3D: { label: '3일상승', color: 'text-emerald-400 border-emerald-500/30' },
    SMART_DIP: { label: '기관매집', color: 'text-cyan-400 border-cyan-500/30' },
    GEX_SAFE: { label: 'GEX+', color: 'text-blue-400 border-blue-500/30' },
    GEX_NEG: { label: 'GEX−', color: 'text-rose-400 border-rose-500/30' },
    SQUEEZE: { label: '스퀴즈', color: 'text-amber-400 border-amber-500/30' },
    DP_HIGH: { label: '다크풀↑', color: 'text-purple-400 border-purple-500/30' },
    WHALE_IN: { label: '고래유입', color: 'text-cyan-400 border-cyan-500/30' },
    SHORT_ALERT: { label: '공매도⚠', color: 'text-rose-400 border-rose-500/30' },
    VOL_BOOM: { label: '거래폭발', color: 'text-amber-400 border-amber-500/30' },
    REGIME_OFF: { label: '시장악화', color: 'text-rose-400 border-rose-500/30' },
    GATE_EXHAUST: { label: '과열', color: 'text-rose-400 border-rose-500/30' },
    GATE_FAKE: { label: '가짜상승', color: 'text-rose-400 border-rose-500/30' },
    GATE_WALL: { label: '벽저항', color: 'text-amber-400 border-amber-500/30' },
    GATE_SHORT: { label: 'Short폭풍', color: 'text-rose-400 border-rose-500/30' },
};

// =============================================================================
// HELPER: Factor Status Icon  
// =============================================================================

function FactorStatus({ value, max }: { value: number; max: number }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    if (pct >= 70) return <span className="text-emerald-400 text-xs font-bold">✓</span>;
    if (pct >= 35) return <span className="text-yellow-400 text-xs">○</span>;
    return <span className="text-slate-600 text-xs">✗</span>;
}

// =============================================================================
// FACTOR DISPLAY NAME MAP
// =============================================================================

const FACTOR_DISPLAY: Record<string, string> = {
    priceChange: '가격변동',
    vwapPosition: 'VWAP',
    trend3D: '3일추세',
    smartDip: 'Smart DIP',
    oiHeat: 'OI집중도',
    gammaSetup: '감마/GEX',
    wallSandwich: '옵션 벽',
    pcrBalance: 'PCR',
    squeezePotential: '스퀴즈',
    ivSkew: 'IV 스큐',
    darkPool: '다크풀',
    darkPoolPct: '다크풀',
    whaleIndex: '고래지수',
    shortVolPct: '공매도',
    shortVolume: '공매도',
    relativeVolume: '상대거래량',
    relVol: '상대거래량',
    vixLevel: 'VIX',
    sectorStrength: '섹터',
    marketTrend: '시장추세',
    breadth: '시장폭',
    earningsProximity: '실적임박',
    sectorMomentum: '섹터모멘텀',
    optionsData: '옵션데이터',
};

// =============================================================================
// PILLAR DISPLAY CONFIG
// =============================================================================

const PILLAR_CONFIG: Record<string, { label: string; labelEN: string; icon: React.ReactNode; color: string }> = {
    momentum: { label: '모멘텀', labelEN: 'Momentum', icon: <TrendingUp className="w-3 h-3" />, color: 'text-emerald-400' },
    structure: { label: '옵션구조', labelEN: 'Structure', icon: <BarChart3 className="w-3 h-3" />, color: 'text-blue-400' },
    flow: { label: '자금흐름', labelEN: 'Flow', icon: <Activity className="w-3 h-3" />, color: 'text-purple-400' },
    regime: { label: '시장환경', labelEN: 'Regime', icon: <Radio className="w-3 h-3" />, color: 'text-amber-400' },
    catalyst: { label: '촉매', labelEN: 'Catalyst', icon: <Zap className="w-3 h-3" />, color: 'text-cyan-400' },
};

// =============================================================================
// INSIGHT PANEL (속살)
// =============================================================================

function InsightPanel({
    pillars,
    gatesApplied,
    dataCompleteness
}: {
    pillars: AlphaCardProps['pillars'];
    gatesApplied?: string[];
    dataCompleteness?: number;
}) {
    if (!pillars) return null;

    const pillarEntries = Object.entries(pillars) as [string, PillarData][];

    return (
        <div className="mt-3 space-y-1">
            {pillarEntries.map(([key, pillar]) => {
                const config = PILLAR_CONFIG[key];
                if (!config || !pillar?.factors) return null;
                return (
                    <div key={key} className="bg-slate-900/60 rounded-lg px-3 py-2">
                        {/* Pillar Header */}
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                                <span className={config.color}>{config.icon}</span>
                                <span className="text-[11px] font-bold text-slate-300">{config.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full transition-all",
                                            pillar.pct >= 70 ? "bg-emerald-500" : pillar.pct >= 40 ? "bg-yellow-500" : "bg-slate-600"
                                        )}
                                        style={{ width: `${Math.min(100, pillar.pct)}%` }}
                                    />
                                </div>
                                <span className={cn(
                                    "text-[10px] font-mono font-bold",
                                    pillar.pct >= 70 ? "text-emerald-400" : pillar.pct >= 40 ? "text-yellow-400" : "text-slate-500"
                                )}>
                                    {pillar.score}/{pillar.max}
                                </span>
                            </div>
                        </div>
                        {/* Factors */}
                        <div className="space-y-0.5">
                            {pillar.factors.map((factor, i) => (
                                <div key={i} className="flex items-center gap-2 text-[10px]">
                                    <FactorStatus value={factor.value} max={factor.max} />
                                    <span className="text-slate-500 w-14 flex-shrink-0">
                                        {FACTOR_DISPLAY[factor.name] || factor.name}
                                    </span>
                                    <span className="text-slate-600 font-mono">{factor.value}/{factor.max}</span>
                                    {factor.detail && (
                                        <span className="text-slate-400 truncate ml-auto">{factor.detail}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* Gates & Data Quality */}
            <div className="flex items-center justify-between pt-1 px-1">
                {gatesApplied && gatesApplied.length > 0 ? (
                    <div className="flex items-center gap-1 text-[10px] text-rose-400">
                        <Shield className="w-3 h-3" />
                        <span>GATE: {gatesApplied.join(', ')}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 text-[10px] text-slate-600">
                        <Shield className="w-3 h-3" />
                        <span>GATE 없음</span>
                    </div>
                )}
                {dataCompleteness !== undefined && (
                    <div className="flex items-center gap-1 text-[10px]">
                        <Database className="w-3 h-3 text-slate-600" />
                        <span className={cn(
                            "font-mono",
                            dataCompleteness >= 80 ? "text-emerald-400" : dataCompleteness >= 50 ? "text-yellow-400" : "text-slate-500"
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
// MAIN: AlphaCard (Hero + Compact variants)
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

    const upside = targetPrice > 0 ? ((targetPrice - price) / price * 100) : 0;
    const downside = cutPrice > 0 ? ((cutPrice - price) / price * 100) : 0;
    const rr = downside !== 0 ? Math.abs(upside / downside) : 0;

    const isHero = variant === 'hero';

    const handleClick = () => {
        router.push(`/command?ticker=${ticker}`);
    };

    const handleInsightToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowInsight(!showInsight);
    };

    // Logo URL
    const logoUrl = `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

    return (
        <div
            className={cn(
                "group relative rounded-xl border transition-all duration-300 cursor-pointer",
                "bg-gradient-to-b from-slate-900/95 to-slate-950/95 backdrop-blur-xl",
                isHighRisk
                    ? "border-rose-500/20 hover:border-rose-500/40 hover:shadow-[0_0_30px_rgba(244,63,94,0.08)]"
                    : "border-white/[0.06] hover:border-white/[0.12] hover:shadow-[0_0_40px_rgba(0,0,0,0.3)]",
                isHero ? "p-5" : "p-4",
            )}
            onClick={handleClick}
        >
            {/* Rank Badge */}
            {rank <= 3 && (
                <div className="absolute -top-2 -right-2 z-10">
                    <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shadow-lg",
                        rank === 1 ? "bg-gradient-to-br from-yellow-400 to-amber-500 text-black" :
                            rank === 2 ? "bg-gradient-to-br from-slate-300 to-slate-400 text-black" :
                                "bg-gradient-to-br from-amber-600 to-amber-700 text-white"
                    )}>
                        {rank}
                    </div>
                </div>
            )}

            {/* === SURFACE LAYER === */}

            {/* Header: Logo + Ticker + Price + Grade */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-800/80 border border-white/5 overflow-hidden flex-shrink-0">
                        <img src={logoUrl} alt={ticker} className="w-full h-full object-contain p-1" onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-white tracking-tight">{ticker}</h3>
                            {isHighRisk && (
                                <span className="text-[8px] font-bold bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/20">
                                    HIGH RISK
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-white font-mono">${price.toFixed(2)}</span>
                            <span className={cn(
                                "text-xs font-bold flex items-center gap-0.5",
                                changePct >= 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                                {changePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                </div>
                <GradeBadge score={alphaScore} grade={grade} />
            </div>

            {/* Action + Why (Engine verdict) */}
            {(actionKR || whyKR) && (
                <div className="mb-3">
                    {actionKR && (
                        <span className="text-xs font-bold text-emerald-400">{actionKR}</span>
                    )}
                    {whyKR && (
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{whyKR}</p>
                    )}
                </div>
            )}

            {/* Entry Signal Banner */}
            <div className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg mb-3 border",
                entrySignal.bgColor
            )}>
                <div className="flex items-center gap-2">
                    <span className={entrySignal.color}>{entrySignal.icon}</span>
                    <span className={cn("text-xs font-bold", entrySignal.color)}>{entrySignal.label}</span>
                </div>
                <span className={cn("text-[11px] font-mono", entrySignal.color)}>{entrySignal.detail}</span>
            </div>

            {/* Trade Summary: Entry / Target / Stop in 1 row */}
            <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center bg-slate-800/40 rounded-lg py-2 px-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">Entry</p>
                    <p className="text-xs font-bold text-white font-mono">
                        ${entryLow.toFixed(0)}~${entryHigh.toFixed(0)}
                    </p>
                </div>
                <div className="text-center bg-slate-800/40 rounded-lg py-2 px-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">Target</p>
                    <p className="text-xs font-bold text-emerald-400 font-mono">
                        ${targetPrice.toFixed(0)}
                        <span className="text-[9px] ml-1">+{upside.toFixed(1)}%</span>
                    </p>
                </div>
                <div className="text-center bg-slate-800/40 rounded-lg py-2 px-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">Stop</p>
                    <p className="text-xs font-bold text-rose-400 font-mono">
                        ${cutPrice.toFixed(0)}
                        <span className="text-[9px] ml-1">{downside.toFixed(1)}%</span>
                    </p>
                </div>
            </div>

            {/* Options + Whale Quick Stats */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2 px-1">
                <div className="flex items-center gap-3">
                    {callWall && <span>CW <span className="text-slate-300 font-mono">${callWall.toFixed(0)}</span></span>}
                    {putFloor && <span>PF <span className="text-slate-300 font-mono">${putFloor.toFixed(0)}</span></span>}
                    {whaleNetM !== undefined && (
                        <span className={whaleNetM >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                            🐋 {whaleNetM >= 0 ? '+' : ''}{whaleNetM.toFixed(1)}M
                        </span>
                    )}
                </div>
                {rr > 0 && (
                    <span className="text-slate-400 font-mono">
                        R:R <span className={rr >= 2 ? 'text-emerald-400' : 'text-slate-300'}>{rr.toFixed(1)}:1</span>
                    </span>
                )}
            </div>

            {/* Trigger Code Badges */}
            {triggerCodes && triggerCodes.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {triggerCodes.slice(0, 5).map(code => {
                        const t = TRIGGER_LABELS[code];
                        const label = t?.label || code;
                        const color = t?.color || 'text-slate-400 border-slate-500/30';
                        return (
                            <span key={code} className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded border bg-slate-900/60",
                                color
                            )}>
                                {label}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* === INSIGHT TOGGLE === */}
            <button
                onClick={handleInsightToggle}
                className={cn(
                    "w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all",
                    "bg-slate-800/40 hover:bg-slate-800/70 border border-white/[0.04]",
                    showInsight ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"
                )}
            >
                <Eye className="w-3 h-3" />
                {showInsight ? '엔진 분석 접기' : '엔진 분석 속살 보기'}
                {showInsight ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* === INSIGHT LAYER (속살) === */}
            {showInsight && (
                <InsightPanel
                    pillars={pillars}
                    gatesApplied={gatesApplied}
                    dataCompleteness={dataCompleteness}
                />
            )}
        </div>
    );
}


// =============================================================================
// COMPACT VARIANT (used in ACTIONABLE section)
// =============================================================================

export function AlphaCardCompact(props: Omit<AlphaCardProps, 'variant'>) {
    return <AlphaCard {...props} variant="compact" />;
}
