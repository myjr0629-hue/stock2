'use client';

import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import {
    ChevronRight, TrendingUp, TrendingDown, Zap, Activity, Target,
    ChevronDown, BarChart3, Layers, Shield, Radio, Triangle, Circle, Minus,
    ExternalLink, AlertTriangle, CheckCircle, Clock, XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from 'next/navigation';

// =============================================================================
// TYPES
// =============================================================================

interface ScoreBreakdown {
    momentum: number;
    options: number;
    structure: number;
    regime: number;
    risk: number;
}

interface AlphaCardProps {
    ticker: string;
    rank: number;
    price: number;
    changePct: number;
    volume?: number;
    alphaScore?: number;
    scoreBreakdown?: ScoreBreakdown;
    entryLow?: number;
    entryHigh?: number;
    targetPrice?: number;
    cutPrice?: number;
    whaleNetM?: number;
    callWall?: number;
    putFloor?: number;
    isLive?: boolean;
    isHighRisk?: boolean;
    variant?: 'hero' | 'large' | 'compact';
    onClick?: () => void;
}

// =============================================================================
// PREMIUM COLOR SYSTEM - 5-TIER SCORING
// =============================================================================

function getScoreColor(score: number) {
    if (score >= 80) return {
        main: '#00ffa3', glow: 'rgba(0, 255, 163, 0.4)',
        bg: 'rgba(0, 255, 163, 0.1)', text: 'text-emerald-400',
        label: 'EXCELLENT', labelKR: '최상', border: 'border-emerald-500/40'
    };
    if (score >= 65) return {
        main: '#00d4ff', glow: 'rgba(0, 212, 255, 0.4)',
        bg: 'rgba(0, 212, 255, 0.1)', text: 'text-cyan-400',
        label: 'GOOD', labelKR: '양호', border: 'border-cyan-500/40'
    };
    if (score >= 50) return {
        main: '#ffd000', glow: 'rgba(255, 208, 0, 0.4)',
        bg: 'rgba(255, 208, 0, 0.1)', text: 'text-amber-400',
        label: 'NEUTRAL', labelKR: '보통', border: 'border-amber-500/40'
    };
    if (score >= 35) return {
        main: '#ff8c00', glow: 'rgba(255, 140, 0, 0.4)',
        bg: 'rgba(255, 140, 0, 0.1)', text: 'text-orange-400',
        label: 'WEAK', labelKR: '약세', border: 'border-orange-500/40'
    };
    return {
        main: '#ff4d6a', glow: 'rgba(255, 77, 106, 0.4)',
        bg: 'rgba(255, 77, 106, 0.1)', text: 'text-rose-400',
        label: 'POOR', labelKR: '위험', border: 'border-rose-500/40'
    };
}

// =============================================================================
// ENTRY SIGNAL INDICATOR — "지금 살 수 있나?" 즉시 판단
// =============================================================================

type EntryStatus = 'ENTRY_ZONE' | 'WAIT' | 'EXTENDED' | 'CUT_ZONE';

function getEntryStatus(price: number, entryLow: number, entryHigh: number, cutPrice: number, callWall?: number): {
    status: EntryStatus;
    icon: React.ReactNode;
    label: string;
    detail: string;
    color: string;
    bgColor: string;
} {
    if (price <= cutPrice) {
        return {
            status: 'CUT_ZONE',
            icon: <XCircle className="w-3.5 h-3.5" />,
            label: '손절 구간',
            detail: `지지선 $${cutPrice.toFixed(0)} 이탈`,
            color: 'text-rose-400',
            bgColor: 'bg-rose-500/15 border-rose-500/30'
        };
    }
    if (callWall && price >= callWall * 0.98) {
        return {
            status: 'EXTENDED',
            icon: <AlertTriangle className="w-3.5 h-3.5" />,
            label: '과열 구간',
            detail: `저항선 $${callWall.toFixed(0)} 접근`,
            color: 'text-amber-400',
            bgColor: 'bg-amber-500/15 border-amber-500/30'
        };
    }
    if (price >= entryLow && price <= entryHigh) {
        return {
            status: 'ENTRY_ZONE',
            icon: <CheckCircle className="w-3.5 h-3.5" />,
            label: '진입 구간 내',
            detail: `$${entryLow.toFixed(0)}~$${entryHigh.toFixed(0)}`,
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/15 border-emerald-500/30'
        };
    }
    return {
        status: 'WAIT',
        icon: <Clock className="w-3.5 h-3.5" />,
        label: '대기',
        detail: price > entryHigh ? `$${entryHigh.toFixed(0)} 이하 대기` : `$${entryLow.toFixed(0)} 이상 대기`,
        color: 'text-slate-400',
        bgColor: 'bg-slate-500/15 border-slate-500/30'
    };
}


// =============================================================================
// TRADE MAP — REDESIGNED (TP/Current/Stop with real labels)
// =============================================================================

function TradeMap({
    currentPrice, targetPrice, riskLine, callWall, putFloor
}: {
    currentPrice: number; targetPrice: number; riskLine: number;
    callWall?: number; putFloor?: number;
}) {
    const targetPct = ((targetPrice - currentPrice) / currentPrice * 100).toFixed(1);
    const riskPct = ((riskLine - currentPrice) / currentPrice * 100).toFixed(1);
    const potentialGain = targetPrice - currentPrice;
    const potentialLoss = currentPrice - riskLine;
    const rrRatio = potentialLoss > 0 ? (potentialGain / potentialLoss).toFixed(1) : '∞';

    return (
        <div className="p-3 rounded-xl bg-gradient-to-br from-slate-900/90 to-slate-800/60 border border-white/10">
            <h4 className="text-center text-[10px] font-bold text-slate-400 tracking-wider mb-3 uppercase">
                Trade Map
            </h4>
            <div className="relative py-1">
                <div className="absolute left-5 top-4 bottom-4 w-[2px] bg-gradient-to-b from-emerald-500 via-cyan-500 to-rose-500 rounded-full" />
                <div className="space-y-3 relative">
                    {/* Target */}
                    <div className="flex items-center gap-3 pl-1">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.4)] z-10">
                            <Triangle className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                        </div>
                        <div className="flex-1 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-emerald-400 font-bold">TP</span>
                                <span className="ml-1.5 text-sm font-mono font-bold text-white">${targetPrice.toFixed(2)}</span>
                                {callWall && <span className="ml-1.5 text-[9px] text-slate-500">Call Wall</span>}
                            </div>
                            <span className="text-emerald-400 text-xs font-bold">+{targetPct}%</span>
                        </div>
                    </div>
                    {/* Current */}
                    <div className="flex items-center gap-3 pl-1">
                        <div className="w-8 h-8 rounded-full bg-cyan-500/20 border-2 border-cyan-500 flex items-center justify-center shadow-[0_0_10px_rgba(0,212,255,0.4)] z-10">
                            <Minus className="w-3.5 h-3.5 text-cyan-400" />
                        </div>
                        <div className="flex-1">
                            <span className="text-[10px] text-cyan-400 font-bold">NOW</span>
                            <span className="ml-1.5 text-sm font-mono font-bold text-white">${currentPrice.toFixed(2)}</span>
                        </div>
                    </div>
                    {/* Stop */}
                    <div className="flex items-center gap-3 pl-1">
                        <div className="w-8 h-8 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center shadow-[0_0_10px_rgba(244,63,94,0.4)] z-10">
                            <Triangle className="w-3.5 h-3.5 text-rose-400 fill-rose-400 rotate-180" />
                        </div>
                        <div className="flex-1 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-rose-400 font-bold">SL</span>
                                <span className="ml-1.5 text-sm font-mono font-bold text-white">${riskLine.toFixed(2)}</span>
                                {putFloor && <span className="ml-1.5 text-[9px] text-slate-500">Put Floor</span>}
                            </div>
                            <span className="text-rose-400 text-xs font-bold">{riskPct}%</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-center gap-6 pt-2 mt-2 border-t border-white/10">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">R:R</span>
                    <span className="text-xs font-bold text-emerald-400">{rrRatio}:1</span>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// ALPHA SCORE BADGE - CIRCULAR GAUGE
// =============================================================================

function AlphaScoreBadge({ score, size = 'large' }: { score: number; size?: 'large' | 'small' }) {
    const colors = getScoreColor(score);
    const radius = size === 'large' ? 32 : 24;
    const circumference = 2 * Math.PI * radius;
    const fillAmount = (score / 100) * circumference;
    const svgSize = size === 'large' ? 80 : 60;
    const strokeWidth = size === 'large' ? 4 : 3;

    return (
        <div className="relative flex-shrink-0">
            <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
                {/* Background Track */}
                <circle
                    cx={svgSize / 2} cy={svgSize / 2} r={radius}
                    fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth}
                />
                {/* Score Arc */}
                <circle
                    cx={svgSize / 2} cy={svgSize / 2} r={radius}
                    fill="none" stroke={colors.main} strokeWidth={strokeWidth}
                    strokeDasharray={`${fillAmount} ${circumference}`}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${svgSize / 2} ${svgSize / 2})`}
                    style={{
                        filter: `drop-shadow(0 0 8px ${colors.glow})`,
                        transition: 'stroke-dasharray 1s ease-out'
                    }}
                />
            </svg>
            {/* Score Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn(
                    "font-black font-mono leading-none",
                    size === 'large' ? "text-lg" : "text-base"
                )} style={{ color: colors.main }}>
                    {score.toFixed(1)}
                </span>
                <span className={cn(
                    "font-bold uppercase tracking-wider mt-0.5",
                    size === 'large' ? "text-[8px]" : "text-[7px]"
                )} style={{ color: colors.main, opacity: 0.8 }}>
                    {colors.label}
                </span>
            </div>
        </div>
    );
}

// =============================================================================
// CONVICTION PANEL — Factor breakdown with explanations
// =============================================================================

function ConvictionPanel({ scores }: { scores: ScoreBreakdown }) {
    const factors = [
        { key: 'momentum', label: '모멘텀', max: 20, color: '#00ffa3', icon: '📈' },
        { key: 'options', label: '옵션', max: 20, color: '#00d4ff', icon: '🎯' },
        { key: 'structure', label: '구조', max: 20, color: '#a855f7', icon: '🏗️' },
        { key: 'regime', label: '시장환경', max: 20, color: '#ffd000', icon: '🌐' },
        { key: 'risk', label: '리스크', max: 20, color: '#ff4d6a', icon: '🛡️' },
    ] as const;

    return (
        <div className="p-3 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-800/40 border border-white/5">
            <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Conviction Breakdown</span>
            </div>
            <div className="space-y-2.5">
                {factors.map(f => {
                    const value = scores[f.key as keyof ScoreBreakdown];
                    const pct = Math.min(100, (value / f.max) * 100);
                    const status = pct >= 75 ? '✓' : pct >= 40 ? '○' : '✗';
                    const statusColor = pct >= 75 ? 'text-emerald-400' : pct >= 40 ? 'text-slate-500' : 'text-rose-400';

                    return (
                        <div key={f.key}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                    <span className={cn("text-[10px] font-bold", statusColor)}>{status}</span>
                                    <span className="text-[10px] text-slate-400 font-medium">{f.label}</span>
                                </div>
                                <span className="text-[10px] font-mono font-bold" style={{ color: f.color }}>
                                    {value.toFixed(1)}/{f.max}
                                </span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                        width: `${pct}%`,
                                        background: `linear-gradient(90deg, ${f.color}88, ${f.color})`,
                                        boxShadow: `0 0 8px ${f.color}40`
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT - PREMIUM GLASSMORPHISM DESIGN
// =============================================================================

export function AlphaCard({
    ticker,
    rank,
    price,
    changePct,
    alphaScore = 70,
    scoreBreakdown,
    entryLow,
    entryHigh,
    targetPrice,
    cutPrice,
    whaleNetM,
    callWall,
    putFloor,
    isLive = false,
    isHighRisk = false,
    variant = 'large',
    onClick
}: AlphaCardProps) {
    const [expanded, setExpanded] = useState(false);
    const router = useRouter();

    const safePrice = price || 0;
    const minEntry = entryLow || safePrice * 0.97;
    const maxEntry = entryHigh || safePrice * 1.02;
    const target = targetPrice || safePrice * 1.08;
    const stop = cutPrice || safePrice * 0.95;
    const isPositive = changePct >= 0;
    const colors = getScoreColor(alphaScore);

    // R:R Ratio
    const potentialGain = target - safePrice;
    const potentialLoss = safePrice - stop;
    const rrRatio = potentialLoss > 0 ? (potentialGain / potentialLoss).toFixed(1) : '∞';

    const isHero = variant === 'hero';
    const isCompact = variant === 'compact';

    // Score breakdown defaults
    const scores = scoreBreakdown || {
        momentum: Math.round(alphaScore * 0.9),
        options: Math.round(alphaScore * 0.85),
        structure: Math.round(alphaScore * 0.95),
        regime: Math.round(alphaScore * 0.88),
        risk: Math.round(alphaScore * 0.82)
    };

    // Entry Signal
    const entrySignal = getEntryStatus(safePrice, minEntry, maxEntry, stop, callWall);

    // Navigate to Command page
    const handleCardClick = () => {
        if (onClick) onClick();
        router.push(`/command?ticker=${ticker}`);
    };

    return (
        <Card
            className={cn(
                "relative overflow-hidden cursor-pointer transition-all duration-300 group",
                "bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/80",
                "backdrop-blur-xl border-2",
                isHighRisk
                    ? "border-rose-500/40 hover:border-rose-400/60 shadow-[0_0_40px_rgba(255,77,106,0.2)]"
                    : "border-cyan-500/30 hover:border-cyan-400/50 shadow-[0_0_40px_rgba(0,212,255,0.15)]",
                isHero ? "p-6" : isCompact ? "p-4" : "p-5"
            )}
            style={{
                background: isHighRisk
                    ? 'linear-gradient(135deg, rgba(30, 10, 20, 0.95), rgba(15, 15, 25, 0.9))'
                    : 'linear-gradient(135deg, rgba(10, 20, 35, 0.95), rgba(15, 15, 25, 0.9))'
            }}
            onClick={handleCardClick}
        >
            {/* Top Accent Glow Line */}
            <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{
                    background: isHighRisk
                        ? 'linear-gradient(90deg, transparent, #ff4d6a, #ff4d6a, transparent)'
                        : `linear-gradient(90deg, transparent, ${colors.main}, ${colors.main}, transparent)`,
                    boxShadow: isHighRisk
                        ? '0 0 20px rgba(255, 77, 106, 0.6)'
                        : `0 0 20px ${colors.glow}`
                }}
            />

            {/* Corner Glow */}
            <div
                className={cn(
                    "absolute rounded-full blur-[80px] opacity-40 pointer-events-none",
                    isHero ? "-top-32 -right-32 w-64 h-64" : "-top-20 -right-20 w-40 h-40"
                )}
                style={{ background: isHighRisk ? '#ff4d6a' : colors.main }}
            />

            {/* Rank Display - Watermark Style */}
            <div
                className={cn(
                    "absolute font-black font-mono pointer-events-none select-none leading-none",
                    isHero
                        ? "right-4 bottom-4 text-[100px]"
                        : isCompact
                            ? "left-3 top-3 text-[50px]"
                            : "left-3 top-3 text-[70px]"
                )}
                style={{
                    color: isHero ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.12)',
                    textShadow: '0 0 30px rgba(255, 255, 255, 0.1)'
                }}
            >
                {rank}
            </div>

            {/* Main Content */}
            <div className="space-y-4">

                {/* Header: Logo + Ticker + Score */}
                <div className="flex items-start gap-5">
                    {/* Ticker Logo */}
                    <div
                        className={cn(
                            "rounded-xl overflow-hidden flex-shrink-0 p-1",
                            isHero ? "w-14 h-14" : isCompact ? "w-12 h-12" : "w-16 h-16"
                        )}
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
                            border: '1px solid rgba(255,255,255,0.2)',
                            boxShadow: `0 0 30px ${colors.bg}`
                        }}
                    >
                        <img
                            src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                            alt={ticker}
                            className="w-full h-full object-cover rounded-xl"
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                            }}
                        />
                    </div>

                    {/* Ticker Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={cn(
                                "font-black text-white tracking-tight",
                                isHero ? "text-xl" : isCompact ? "text-xl" : "text-2xl"
                            )}>
                                {ticker}
                            </h3>
                            {isLive && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                                    <Radio className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                                    <span className="text-[9px] font-bold text-emerald-400">LIVE</span>
                                </span>
                            )}
                            {isHighRisk && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40">
                                    <Shield className="w-2.5 h-2.5 text-rose-400" />
                                    <span className="text-[9px] font-bold text-rose-400">HIGH RISK</span>
                                </span>
                            )}
                        </div>

                        {/* Price */}
                        <div className="flex items-baseline gap-2 mt-0.5">
                            <span className={cn(
                                "font-mono font-bold text-white",
                                isHero ? "text-lg" : isCompact ? "text-lg" : "text-2xl"
                            )}>
                                ${safePrice.toFixed(2)}
                            </span>
                            <span className={cn(
                                "font-mono font-bold flex items-center gap-0.5",
                                isHero ? "text-sm" : isCompact ? "text-sm" : "text-base",
                                isPositive ? "text-emerald-400" : "text-rose-400"
                            )}>
                                {isPositive
                                    ? <TrendingUp className="w-4 h-4" />
                                    : <TrendingDown className="w-4 h-4" />
                                }
                                {isPositive ? '+' : ''}{changePct.toFixed(2)}%
                            </span>
                        </div>
                    </div>

                    {/* Alpha Score Badge */}
                    <AlphaScoreBadge score={alphaScore} size={isHero || !isCompact ? 'large' : 'small'} />
                </div>

                {/* ━━━ ENTRY SIGNAL — 핵심: "지금 살 수 있나?" ━━━ */}
                <div className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold",
                    entrySignal.bgColor, entrySignal.color
                )}>
                    {entrySignal.icon}
                    <span>{entrySignal.label}</span>
                    <span className="text-slate-500 font-normal ml-auto">{entrySignal.detail}</span>
                </div>

                {/* HERO: Quick Stats - Horizontal Inline */}
                {isHero && ((callWall && putFloor) || whaleNetM !== undefined) && (
                    <div
                        className="flex items-center justify-between gap-4 p-3 rounded-xl"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}
                    >
                        {callWall && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-white font-semibold">Call Wall</span>
                                <span className="text-sm font-mono font-bold text-cyan-400">${callWall}</span>
                            </div>
                        )}
                        {putFloor && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-white font-semibold">Put Floor</span>
                                <span className="text-sm font-mono font-bold text-rose-400">${putFloor}</span>
                            </div>
                        )}
                        {whaleNetM !== undefined && (
                            <div className="flex items-center gap-2">
                                <svg className={cn("w-6 h-6", whaleNetM >= 0 ? "text-emerald-400" : "text-rose-400")}
                                    viewBox="0 0 32 32" fill="currentColor">
                                    <ellipse cx="16" cy="16" rx="12" ry="8" opacity="0.9" />
                                    <path d="M4 16 C2 12, 1 10, 3 8 C5 10, 5 14, 4 16 M4 16 C2 20, 1 22, 3 24 C5 22, 5 18, 4 16" opacity="0.85" />
                                    <path d="M18 8 Q20 4, 22 6 Q20 8, 18 8" opacity="0.8" />
                                    <circle cx="24" cy="14" r="1.5" fill="white" />
                                    <path d="M26 10 Q28 6, 26 4 M26 10 Q24 6, 26 4" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6" />
                                </svg>
                                <span className={cn("text-sm font-mono font-bold", whaleNetM >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                    {whaleNetM >= 0 ? '+' : ''}${Math.abs(whaleNetM).toFixed(1)}M
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* HERO VARIANT: Trade Map + Conviction Panel */}
                {isHero && (
                    <>
                        <TradeMap
                            currentPrice={safePrice}
                            targetPrice={target}
                            riskLine={stop}
                            callWall={callWall}
                            putFloor={putFloor}
                        />

                        {/* Conviction Panel Toggle for Hero */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpanded(!expanded);
                            }}
                            className="w-full py-2 rounded-lg font-bold uppercase tracking-wider text-[10px] flex items-center justify-center gap-2 transition-all bg-white/5 text-slate-400 hover:bg-white/10 hover:text-cyan-400 border border-white/10"
                        >
                            <BarChart3 className="w-3.5 h-3.5" />
                            {expanded ? '접기' : 'Conviction 분석'}
                            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
                        </button>

                        {expanded && (
                            <div className="animate-in slide-in-from-top-2 duration-300">
                                <ConvictionPanel scores={scores} />
                            </div>
                        )}
                    </>
                )}

                {/* Non-Hero: Quick Stats + Entry/Target */}
                {!isHero && (
                    <>
                        {/* Quick Stats Row */}
                        {(callWall && putFloor) || whaleNetM !== undefined ? (
                            <div
                                className="flex items-center justify-between gap-3 p-3 rounded-xl"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
                                    border: '1px solid rgba(255,255,255,0.08)'
                                }}
                            >
                                {callWall && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-white font-semibold">Call Wall</span>
                                        <span className="text-sm font-mono font-bold text-cyan-400">${callWall}</span>
                                    </div>
                                )}
                                {putFloor && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-white font-semibold">Put Floor</span>
                                        <span className="text-sm font-mono font-bold text-rose-400">${putFloor}</span>
                                    </div>
                                )}
                                {whaleNetM !== undefined && (
                                    <div className="flex items-center gap-1.5">
                                        <svg className={cn("w-5 h-5", whaleNetM >= 0 ? "text-emerald-400" : "text-rose-400")}
                                            viewBox="0 0 32 32" fill="currentColor">
                                            <ellipse cx="16" cy="16" rx="12" ry="8" opacity="0.9" />
                                            <path d="M4 16 C2 12, 1 10, 3 8 C5 10, 5 14, 4 16 M4 16 C2 20, 1 22, 3 24 C5 22, 5 18, 4 16" opacity="0.85" />
                                            <path d="M18 8 Q20 4, 22 6 Q20 8, 18 8" opacity="0.8" />
                                            <circle cx="24" cy="14" r="1.5" fill="white" />
                                            <path d="M26 10 Q28 6, 26 4 M26 10 Q24 6, 26 4" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6" />
                                        </svg>
                                        <span className={cn("text-sm font-mono font-bold", whaleNetM >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                            {whaleNetM >= 0 ? '+' : ''}${Math.abs(whaleNetM).toFixed(1)}M
                                        </span>
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {/* Entry → Target (Large variant) */}
                        {!isCompact && (
                            <div
                                className="flex items-center justify-between p-3 rounded-xl"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(0,255,163,0.05))',
                                    border: '1px solid rgba(0,212,255,0.2)'
                                }}
                            >
                                <div className="text-center">
                                    <span className="block text-[9px] text-slate-500 uppercase font-bold tracking-wider">Entry</span>
                                    <span className="text-sm font-mono font-bold text-emerald-400">
                                        ${minEntry.toFixed(0)}-${maxEntry.toFixed(0)}
                                    </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-600" />
                                <div className="text-center">
                                    <span className="block text-[9px] text-slate-500 uppercase font-bold tracking-wider">Target</span>
                                    <span className="text-sm font-mono font-bold text-cyan-400">${target.toFixed(0)}</span>
                                </div>
                                <div className="text-center pl-3 border-l border-white/10">
                                    <span className="block text-[9px] text-slate-500 uppercase font-bold tracking-wider">R:R</span>
                                    <span className="text-sm font-mono font-bold text-white">{rrRatio}:1</span>
                                </div>
                            </div>
                        )}

                        {/* Compact Entry/Target */}
                        {isCompact && (
                            <div className="flex items-center justify-between text-[11px]">
                                <span>
                                    <span className="text-slate-500">Entry </span>
                                    <span className="font-mono font-bold text-emerald-400">${minEntry.toFixed(0)}-${maxEntry.toFixed(0)}</span>
                                </span>
                                <span>
                                    <span className="text-slate-500">Target </span>
                                    <span className="font-mono font-bold text-cyan-400">${target.toFixed(0)}</span>
                                </span>
                                <span>
                                    <span className="text-slate-500">R:R </span>
                                    <span className="font-mono font-bold text-white">{rrRatio}:1</span>
                                </span>
                            </div>
                        )}
                    </>
                )}

                {/* View Details Button (Non-Hero only) */}
                {!isHero && (
                    <>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpanded(!expanded);
                            }}
                            className={cn(
                                "w-full py-2.5 rounded-xl font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all",
                                isHighRisk
                                    ? "bg-gradient-to-r from-rose-500/20 to-rose-600/10 text-rose-400 hover:from-rose-500/30 border border-rose-500/30"
                                    : "bg-gradient-to-r from-cyan-500/20 to-emerald-500/10 text-cyan-400 hover:from-cyan-500/30 border border-cyan-500/30"
                            )}
                        >
                            <Zap className="w-3.5 h-3.5" />
                            {expanded ? '접기' : '상세 분석'}
                            <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
                        </button>

                        {/* Expanded Details */}
                        {expanded && (
                            <div className="mt-3 pt-3 border-t border-white/10 space-y-3 animate-in slide-in-from-top-2 duration-300">
                                <ConvictionPanel scores={scores} />
                                <TradeMap
                                    currentPrice={safePrice}
                                    targetPrice={target}
                                    riskLine={stop}
                                    callWall={callWall}
                                    putFloor={putFloor}
                                />
                            </div>
                        )}
                    </>
                )}

                {/* Command Link - Bottom */}
                <div className="flex items-center justify-end pt-1">
                    <span className="flex items-center gap-1 text-[10px] text-slate-600 group-hover:text-cyan-400 transition-colors">
                        <ExternalLink className="w-3 h-3" />
                        상세 분석
                    </span>
                </div>
            </div>
        </Card>
    );
}

// Variant exports
export function AlphaCardCompact(props: Omit<AlphaCardProps, 'variant'>) {
    return <AlphaCard {...props} variant="compact" />;
}

export function AlphaCardHero(props: Omit<AlphaCardProps, 'variant'>) {
    return <AlphaCard {...props} variant="hero" />;
}
