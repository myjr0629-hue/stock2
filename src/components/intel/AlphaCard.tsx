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
): { status: EntryStatus; label: string; detail: string; color: string; bgClass: string; icon: React.ReactNode } {
    if (price <= cutPrice) {
        return {
            status: 'CUT_ZONE', label: '❌ 손절 구간',
            detail: `$${cutPrice.toFixed(0)} 이탈`,
            color: 'text-rose-300', bgClass: 'bg-rose-500/15 border-rose-400/25',
            icon: <XCircle className="w-3.5 h-3.5" />
        };
    }
    if (callWall && price >= callWall * 0.98) {
        return {
            status: 'EXTENDED', label: '⚠️ 과열 구간',
            detail: `CW $${callWall.toFixed(0)} 근접`,
            color: 'text-amber-300', bgClass: 'bg-amber-500/15 border-amber-400/25',
            icon: <AlertTriangle className="w-3.5 h-3.5" />
        };
    }
    if (price >= entryLow && price <= entryHigh) {
        return {
            status: 'ENTRY_ZONE', label: '✅ 진입 적기',
            detail: `$${entryLow.toFixed(0)}~$${entryHigh.toFixed(0)}`,
            color: 'text-emerald-300', bgClass: 'bg-emerald-500/15 border-emerald-400/25',
            icon: <CheckCircle className="w-3.5 h-3.5" />
        };
    }
    return {
        status: 'WAIT', label: '⏳ 대기',
        detail: price > entryHigh ? `$${entryHigh.toFixed(0)} 이하 대기` : `$${entryLow.toFixed(0)} 이상 대기`,
        color: 'text-slate-300', bgClass: 'bg-white/5 border-white/10',
        icon: <Clock className="w-3.5 h-3.5" />
    };
}

// =============================================================================
// HELPER: Grade Badge (Glassmorphic)
// =============================================================================

function GradeBadge({ score, grade }: { score: number; grade?: string }) {
    const g = grade || (score >= 80 ? 'S' : score >= 65 ? 'A' : score >= 50 ? 'B' : score >= 35 ? 'C' : 'D');
    const colors: Record<string, { bg: string; text: string; glow: string }> = {
        S: { bg: 'from-yellow-400/90 to-amber-500/90', text: 'text-black', glow: 'shadow-yellow-500/30' },
        A: { bg: 'from-emerald-400/90 to-cyan-500/90', text: 'text-black', glow: 'shadow-emerald-500/30' },
        B: { bg: 'from-blue-400/90 to-indigo-500/90', text: 'text-white', glow: 'shadow-blue-500/20' },
        C: { bg: 'from-slate-400/80 to-slate-500/80', text: 'text-white', glow: 'shadow-slate-500/10' },
        D: { bg: 'from-rose-400/90 to-red-500/90', text: 'text-white', glow: 'shadow-rose-500/20' },
        F: { bg: 'from-red-600/90 to-red-800/90', text: 'text-white', glow: 'shadow-red-600/20' },
    };
    const c = colors[g] || colors.C;
    return (
        <div className={cn(
            "w-[52px] h-[52px] rounded-2xl bg-gradient-to-br flex flex-col items-center justify-center",
            "shadow-lg backdrop-blur-sm",
            c.bg, c.text, c.glow
        )}>
            <span className="text-[17px] font-black leading-none">{score.toFixed(0)}</span>
            <span className="text-[9px] font-bold opacity-70 mt-0.5">{g}</span>
        </div>
    );
}

// =============================================================================
// TRIGGER BADGE CONFIG
// =============================================================================

const TRIGGER_LABELS: Record<string, { label: string; emoji: string; type: 'positive' | 'negative' | 'neutral' }> = {
    MOM_STRONG: { label: '모멘텀', emoji: '🚀', type: 'positive' },
    MOMENTUM_UP: { label: '상승세', emoji: '📈', type: 'positive' },
    TREND_3D: { label: '3일상승', emoji: '📊', type: 'positive' },
    SMART_DIP: { label: '기관매집', emoji: '🏦', type: 'positive' },
    GEX_SAFE: { label: 'GEX+', emoji: '🛡️', type: 'positive' },
    GEX_NEG: { label: 'GEX−', emoji: '⛔', type: 'negative' },
    SQUEEZE: { label: '스퀴즈', emoji: '💥', type: 'positive' },
    DP_HIGH: { label: '다크풀', emoji: '🔮', type: 'positive' },
    WHALE_IN: { label: '고래유입', emoji: '🐋', type: 'positive' },
    SHORT_ALERT: { label: '공매도⚠', emoji: '🔴', type: 'negative' },
    VOL_BOOM: { label: '거래폭발', emoji: '💣', type: 'positive' },
    REGIME_OFF: { label: '시장악화', emoji: '🌧️', type: 'negative' },
    CALL_DOMINANT: { label: '콜우세', emoji: '📞', type: 'positive' },
    PUT_DOMINANT: { label: '풋우세', emoji: '📉', type: 'negative' },
    GATE_EXHAUST: { label: '과열', emoji: '🔥', type: 'negative' },
    GATE_FAKE: { label: '가짜상승', emoji: '🎭', type: 'negative' },
    GATE_WALL: { label: '벽저항', emoji: '🧱', type: 'negative' },
    GATE_SHORT: { label: 'Short폭풍', emoji: '🌪️', type: 'negative' },
};

// =============================================================================
// FACTOR DISPLAY NAME MAP & STATUS
// =============================================================================

function FactorIcon({ value, max }: { value: number; max: number }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    if (pct >= 70) return <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[8px] font-black">✓</span>;
    if (pct >= 35) return <span className="w-4 h-4 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-[8px]">○</span>;
    return <span className="w-4 h-4 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-500 text-[8px]">✗</span>;
}

const FACTOR_DISPLAY: Record<string, string> = {
    priceChange: '가격변동',
    vwapPosition: 'VWAP 위치',
    trend3D: '3일 추세',
    smartDip: 'Smart DIP',
    oiHeat: 'OI 집중도',
    gammaSetup: '감마 셋업',
    wallSandwich: '옵션 벽',
    pcrBalance: 'PCR 균형',
    squeezePotential: '스퀴즈 잠재력',
    ivSkew: 'IV 스큐',
    darkPool: '다크풀',
    darkPoolPct: '다크풀 비율',
    whaleIndex: '고래 지수',
    shortVolPct: '공매도 비율',
    shortVolume: '공매도',
    relativeVolume: '상대 거래량',
    relVol: '상대 거래량',
    vixLevel: 'VIX 수준',
    sectorStrength: '섹터 강도',
    marketTrend: '시장 추세',
    breadth: '시장 폭',
    earningsProximity: '실적 임박',
    sectorMomentum: '섹터 모멘텀',
    optionsData: '옵션 데이터',
};

// =============================================================================
// PILLAR CONFIG
// =============================================================================

const PILLAR_CONFIG: Record<string, { label: string; icon: React.ReactNode; gradient: string }> = {
    momentum: { label: '모멘텀', icon: <TrendingUp className="w-3.5 h-3.5" />, gradient: 'from-emerald-500/20 to-emerald-500/5' },
    structure: { label: '옵션 구조', icon: <BarChart3 className="w-3.5 h-3.5" />, gradient: 'from-blue-500/20 to-blue-500/5' },
    flow: { label: '자금 흐름', icon: <Activity className="w-3.5 h-3.5" />, gradient: 'from-purple-500/20 to-purple-500/5' },
    regime: { label: '시장 환경', icon: <Radio className="w-3.5 h-3.5" />, gradient: 'from-amber-500/20 to-amber-500/5' },
    catalyst: { label: '촉매', icon: <Zap className="w-3.5 h-3.5" />, gradient: 'from-cyan-500/20 to-cyan-500/5' },
};

// =============================================================================
// INSIGHT PANEL (Glassmorphic 속살)
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
    if (!pillars) {
        return (
            <div className="mt-3 py-4 text-center">
                <p className="text-slate-500 text-xs">엔진 상세 데이터를 수집하지 못했습니다</p>
                <p className="text-slate-600 text-[10px] mt-1">서버를 재시작하여 새 보고서를 생성해주세요</p>
            </div>
        );
    }

    const pillarEntries = Object.entries(pillars) as [string, PillarData][];

    return (
        <div className="mt-3 space-y-2">
            {pillarEntries.map(([key, pillar]) => {
                const config = PILLAR_CONFIG[key];
                if (!config) return null;
                const factors = pillar?.factors || [];
                const pct = pillar?.pct ?? 0;
                return (
                    <div key={key} className={cn(
                        "rounded-xl border border-white/[0.08] bg-gradient-to-r backdrop-blur-md px-3 py-2.5",
                        config.gradient
                    )}>
                        {/* Pillar Header */}
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="text-white/70">{config.icon}</div>
                                <span className="text-[12px] font-bold text-white/90">{config.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-20 h-2 bg-black/30 rounded-full overflow-hidden backdrop-blur-sm">
                                    <div
                                        className={cn("h-full rounded-full transition-all duration-500",
                                            pct >= 70 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" :
                                                pct >= 40 ? "bg-gradient-to-r from-yellow-400 to-amber-500" :
                                                    "bg-gradient-to-r from-slate-500 to-slate-600"
                                        )}
                                        style={{ width: `${Math.min(100, pct)}%` }}
                                    />
                                </div>
                                <span className={cn(
                                    "text-[11px] font-mono font-bold min-w-[32px] text-right",
                                    pct >= 70 ? "text-emerald-300" : pct >= 40 ? "text-amber-300" : "text-slate-400"
                                )}>
                                    {pillar.score}/{pillar.max}
                                </span>
                            </div>
                        </div>
                        {/* Factors */}
                        {factors.length > 0 && (
                            <div className="space-y-1 ml-1">
                                {factors.map((factor, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[11px]">
                                        <FactorIcon value={factor.value} max={factor.max} />
                                        <span className="text-white/60 w-[72px] flex-shrink-0 truncate">
                                            {FACTOR_DISPLAY[factor.name] || factor.name}
                                        </span>
                                        <span className="text-white/40 font-mono text-[10px] w-8">{factor.value}/{factor.max}</span>
                                        {factor.detail && (
                                            <span className="text-white/50 text-[10px] truncate ml-auto italic">{factor.detail}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Gates & Data Quality */}
            <div className="flex items-center justify-between pt-1 px-2">
                {gatesApplied && gatesApplied.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-rose-300">
                        <Shield className="w-3.5 h-3.5" />
                        <span className="font-medium">⚠ {gatesApplied.join(', ')}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/60">
                        <Shield className="w-3.5 h-3.5" />
                        <span>위험 게이트 없음</span>
                    </div>
                )}
                {dataCompleteness !== undefined && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                        <Database className="w-3 h-3 text-white/30" />
                        <span className={cn(
                            "font-mono font-bold",
                            dataCompleteness >= 80 ? "text-emerald-300" : dataCompleteness >= 50 ? "text-amber-300" : "text-slate-400"
                        )}>
                            데이터 {dataCompleteness}%
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}


// =============================================================================
// MAIN: AlphaCard (Glassmorphic Design)
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

    const upside = targetPrice > 0 && price > 0 ? ((targetPrice - price) / price * 100) : 0;
    const downside = cutPrice > 0 && price > 0 ? ((cutPrice - price) / price * 100) : 0;
    const rr = downside !== 0 ? Math.abs(upside / downside) : 0;

    const isHero = variant === 'hero';

    const handleClick = () => {
        router.push(`/command?ticker=${ticker}`);
    };

    const handleInsightToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowInsight(!showInsight);
    };

    const logoUrl = `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

    // Glassmorphism border glow based on grade
    const glowClass = isHighRisk
        ? "hover:shadow-[0_0_40px_rgba(244,63,94,0.12)]"
        : grade === 'S' ? "hover:shadow-[0_0_40px_rgba(250,204,21,0.12)]"
            : grade === 'A' ? "hover:shadow-[0_0_40px_rgba(52,211,153,0.12)]"
                : "hover:shadow-[0_0_40px_rgba(148,163,184,0.06)]";

    return (
        <div
            className={cn(
                "group relative rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden",
                // Glassmorphism
                "bg-white/[0.04] backdrop-blur-xl",
                "border-white/[0.08] hover:border-white/[0.18]",
                glowClass,
                isHero ? "p-5" : "p-4",
            )}
            onClick={handleClick}
        >
            {/* Ambient gradient glow */}
            <div className={cn(
                "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none",
                isHighRisk ? "bg-gradient-to-br from-rose-500/[0.03] via-transparent to-transparent"
                    : "bg-gradient-to-br from-cyan-500/[0.03] via-transparent to-transparent"
            )} />

            {/* Rank Badge */}
            {rank <= 3 && (
                <div className="absolute -top-1.5 -right-1.5 z-10">
                    <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shadow-lg backdrop-blur-sm",
                        rank === 1 ? "bg-gradient-to-br from-yellow-400/90 to-amber-500/90 text-black shadow-yellow-500/20" :
                            rank === 2 ? "bg-gradient-to-br from-slate-300/90 to-slate-400/90 text-black shadow-slate-400/20" :
                                "bg-gradient-to-br from-amber-600/90 to-amber-700/90 text-white shadow-amber-600/20"
                    )}>
                        {rank}
                    </div>
                </div>
            )}

            {/* === SURFACE LAYER === */}

            {/* Header: Logo + Ticker + Price + Grade */}
            <div className="relative flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] overflow-hidden flex-shrink-0 backdrop-blur-sm">
                        <img src={logoUrl} alt={ticker} className="w-full h-full object-contain p-1.5"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-black text-white tracking-tight">{ticker}</h3>
                            {isHighRisk && (
                                <span className="text-[7px] font-bold bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded-md border border-rose-500/20 backdrop-blur-sm uppercase tracking-wider">
                                    Risk
                                </span>
                            )}
                            {isLive && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-lg font-bold text-white/95 font-mono">${price.toFixed(2)}</span>
                            <span className={cn(
                                "text-xs font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-md",
                                changePct >= 0
                                    ? "text-emerald-300 bg-emerald-500/10"
                                    : "text-rose-300 bg-rose-500/10"
                            )}>
                                {changePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                </div>
                <GradeBadge score={alphaScore} grade={grade} />
            </div>

            {/* Action Verdict + Why KR */}
            <div className="mb-3 bg-white/[0.03] rounded-xl px-3 py-2.5 border border-white/[0.05]">
                {actionKR ? (
                    <span className={cn(
                        "text-xs font-bold",
                        grade === 'S' || grade === 'A' ? "text-emerald-300" :
                            grade === 'B' ? "text-blue-300" :
                                grade === 'D' || grade === 'F' ? "text-rose-300" :
                                    "text-slate-300"
                    )}>{actionKR}</span>
                ) : (
                    <span className="text-xs font-bold text-slate-400">AI 분석 대기중</span>
                )}
                {whyKR ? (
                    <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{whyKR}</p>
                ) : (
                    <p className="text-[11px] text-white/30 mt-1">엔진 재시작 시 상세 근거가 표시됩니다</p>
                )}
            </div>

            {/* Entry Signal Banner */}
            <div className={cn(
                "flex items-center justify-between px-3 py-2 rounded-xl mb-3 border backdrop-blur-sm",
                entrySignal.bgClass
            )}>
                <div className="flex items-center gap-2">
                    <span className={entrySignal.color}>{entrySignal.icon}</span>
                    <span className={cn("text-xs font-bold", entrySignal.color)}>{entrySignal.label}</span>
                </div>
                <span className={cn("text-[11px] font-mono", entrySignal.color)}>{entrySignal.detail}</span>
            </div>

            {/* Trade Summary: Entry / Target / Stop */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
                <div className="text-center bg-white/[0.04] rounded-xl py-2 px-1 border border-white/[0.05]">
                    <p className="text-[8px] text-white/30 uppercase tracking-widest font-bold">Entry</p>
                    <p className="text-[11px] font-bold text-white/80 font-mono mt-0.5">
                        ${entryLow.toFixed(0)}~${entryHigh.toFixed(0)}
                    </p>
                </div>
                <div className="text-center bg-emerald-500/[0.06] rounded-xl py-2 px-1 border border-emerald-500/[0.08]">
                    <p className="text-[8px] text-emerald-400/50 uppercase tracking-widest font-bold">Target</p>
                    <p className="text-[11px] font-bold text-emerald-300 font-mono mt-0.5">
                        ${targetPrice.toFixed(0)}
                        <span className="text-[9px] text-emerald-400/60 ml-0.5">+{upside.toFixed(1)}%</span>
                    </p>
                </div>
                <div className="text-center bg-rose-500/[0.06] rounded-xl py-2 px-1 border border-rose-500/[0.08]">
                    <p className="text-[8px] text-rose-400/50 uppercase tracking-widest font-bold">Stop</p>
                    <p className="text-[11px] font-bold text-rose-300 font-mono mt-0.5">
                        ${cutPrice.toFixed(0)}
                        <span className="text-[9px] text-rose-400/60 ml-0.5">{downside.toFixed(1)}%</span>
                    </p>
                </div>
            </div>

            {/* Quick Stats Row */}
            <div className="flex items-center justify-between text-[10px] text-white/40 mb-2.5 px-1">
                <div className="flex items-center gap-3">
                    {callWall ? <span>CW <span className="text-white/60 font-mono">${callWall.toFixed(0)}</span></span> : null}
                    {putFloor ? <span>PF <span className="text-white/60 font-mono">${putFloor.toFixed(0)}</span></span> : null}
                    {whaleNetM !== undefined && (
                        <span className={cn("font-bold", whaleNetM >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70')}>
                            🐋 {whaleNetM >= 0 ? '+' : ''}{whaleNetM.toFixed(1)}M
                        </span>
                    )}
                </div>
                {rr > 0 && (
                    <span className="text-white/40 font-mono">
                        R:R <span className={cn("font-bold", rr >= 2 ? 'text-emerald-300/80' : 'text-white/50')}>{rr.toFixed(1)}:1</span>
                    </span>
                )}
            </div>

            {/* Trigger Code Badges */}
            {triggerCodes && triggerCodes.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                    {triggerCodes.slice(0, 5).map(code => {
                        const t = TRIGGER_LABELS[code];
                        const emoji = t?.emoji || '📌';
                        const label = t?.label || code;
                        const type = t?.type || 'neutral';
                        return (
                            <span key={code} className={cn(
                                "text-[9px] font-bold px-1.5 py-1 rounded-lg border backdrop-blur-sm",
                                type === 'positive' ? "bg-emerald-500/10 text-emerald-300/80 border-emerald-500/15" :
                                    type === 'negative' ? "bg-rose-500/10 text-rose-300/80 border-rose-500/15" :
                                        "bg-white/5 text-white/50 border-white/10"
                            )}>
                                {emoji} {label}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* === INSIGHT TOGGLE === */}
            <button
                onClick={handleInsightToggle}
                className={cn(
                    "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold transition-all duration-300",
                    "border backdrop-blur-sm",
                    showInsight
                        ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
                        : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.05]"
                )}
            >
                <Eye className="w-3.5 h-3.5" />
                {showInsight ? '엔진 분석 접기' : '엔진 분석 속살 보기'}
                {showInsight ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
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
// COMPACT VARIANT
// =============================================================================

export function AlphaCardCompact(props: Omit<AlphaCardProps, 'variant'>) {
    return <AlphaCard {...props} variant="compact" />;
}
