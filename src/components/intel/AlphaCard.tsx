'use client';

import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import {
    ChevronRight, TrendingUp, TrendingDown, Zap, Activity, Target,
    ChevronDown, BarChart3, Layers, Shield, Radio, Triangle, Circle, Minus
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const getScoreColor = (score: number) => {
    if (score >= 90) return {
        main: '#ffd700',
        glow: 'rgba(255, 215, 0, 0.5)',
        bg: 'rgba(255, 215, 0, 0.15)',
        grade: 'ELITE'
    };
    if (score >= 80) return {
        main: '#10b981',
        glow: 'rgba(16, 185, 129, 0.4)',
        bg: 'rgba(16, 185, 129, 0.1)',
        grade: 'STRONG'
    };
    if (score >= 70) return {
        main: '#00d4ff',
        glow: 'rgba(0, 212, 255, 0.4)',
        bg: 'rgba(0, 212, 255, 0.1)',
        grade: 'GOOD'
    };
    if (score >= 60) return {
        main: '#fbbf24',
        glow: 'rgba(251, 191, 36, 0.4)',
        bg: 'rgba(251, 191, 36, 0.1)',
        grade: 'NEUTRAL'
    };
    return {
        main: '#64748b',
        glow: 'rgba(100, 116, 139, 0.3)',
        bg: 'rgba(100, 116, 139, 0.1)',
        grade: 'WEAK'
    };
};

// =============================================================================
// TRADE SCENARIO VISUAL - PREMIUM INFOGRAPHIC
// =============================================================================

function TradeScenarioVisual({
    currentPrice,
    entryLow,
    entryHigh,
    targetPrice,
    riskLine
}: {
    currentPrice: number;
    entryLow: number;
    entryHigh: number;
    targetPrice: number;
    riskLine: number;
}) {
    const targetPct = ((targetPrice - currentPrice) / currentPrice * 100).toFixed(1);
    const riskPct = ((riskLine - currentPrice) / currentPrice * 100).toFixed(1);
    const rrRatio = Math.abs((targetPrice - currentPrice) / (currentPrice - riskLine)).toFixed(1);

    return (
        <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900/90 to-slate-800/60 border border-white/10">
            {/* Title */}
            <h4 className="text-center text-xs font-bold text-white tracking-wider mb-3">
                TRADE SCENARIO
            </h4>

            {/* Horizontal Entry Line */}
            <div className="relative mb-4">
                <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-white">${entryLow.toFixed(2)}</span>
                    <span className="text-cyan-400 font-bold">${currentPrice.toFixed(2)}</span>
                    <span className="text-white">${entryHigh.toFixed(2)}</span>
                </div>
                <div className="relative h-[4px] bg-gradient-to-r from-slate-700 via-cyan-500/60 to-slate-700 rounded-full">
                    <div
                        className="absolute left-1/2 top-1/2 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white shadow-[0_0_10px_rgba(0,212,255,0.8)]"
                        style={{ transform: 'translate(-50%, -50%)' }}
                    />
                </div>
                <div className="flex justify-between text-xs mt-1">
                    <span className="text-white">Entry Start</span>
                    <span className="text-cyan-400 font-bold">Current</span>
                    <span className="text-white">Entry End</span>
                </div>
            </div>

            {/* Vertical Timeline */}
            <div className="relative py-2">
                {/* Gradient Line */}
                <div className="absolute left-5 top-5 bottom-5 w-[2px] bg-gradient-to-b from-emerald-500 via-cyan-500 to-rose-500 rounded-full" />

                {/* Nodes */}
                <div className="space-y-4 relative">
                    {/* Target */}
                    <div className="flex items-center gap-4 pl-1">
                        <div className="w-9 h-9 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.5)] z-10">
                            <Triangle className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                        </div>
                        <div className="flex-1 flex items-center justify-between">
                            <div>
                                <span className="text-xs text-emerald-400 font-bold">Target</span>
                                <span className="ml-2 text-sm font-mono font-bold text-white">${targetPrice.toFixed(2)}</span>
                            </div>
                            <span className="text-emerald-400 text-sm font-bold">+{targetPct}%</span>
                        </div>
                    </div>

                    {/* Current */}
                    <div className="flex items-center gap-4 pl-1">
                        <div className="w-9 h-9 rounded-full bg-cyan-500/20 border-2 border-cyan-500 flex items-center justify-center shadow-[0_0_12px_rgba(0,212,255,0.5)] z-10">
                            <Minus className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className="flex-1">
                            <span className="text-xs text-cyan-400 font-bold">Current</span>
                            <span className="ml-2 text-sm font-mono font-bold text-white">${currentPrice.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Risk */}
                    <div className="flex items-center gap-4 pl-1">
                        <div className="w-9 h-9 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.5)] z-10">
                            <Triangle className="w-4 h-4 text-rose-400 fill-rose-400 rotate-180" />
                        </div>
                        <div className="flex-1 flex items-center justify-between">
                            <div>
                                <span className="text-xs text-rose-400 font-bold">Risk Line</span>
                                <span className="ml-2 text-sm font-mono font-bold text-white">${riskLine.toFixed(2)}</span>
                            </div>
                            <span className="text-rose-400 text-sm font-bold">{riskPct}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Stats */}
            <div className="flex items-center justify-center gap-8 pt-3 mt-2 border-t border-white/10">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-white">ATM IV:</span>
                    <span className="text-xs font-bold text-cyan-400">45%</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-white">R:R</span>
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
    const isLarge = size === 'large';

    // SVG circle gauge calculations
    const gaugeSize = isLarge ? 64 : 44;
    const strokeWidth = isLarge ? 4 : 3;
    const radius = (gaugeSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(100, Math.max(0, score)) / 100;
    const strokeDashoffset = circumference * (1 - progress);

    return (
        <div className="relative" style={{ width: gaugeSize, height: gaugeSize }}>
            {/* Background Circle */}
            <svg
                width={gaugeSize}
                height={gaugeSize}
                className="absolute top-0 left-0 -rotate-90"
            >
                {/* Track */}
                <circle
                    cx={gaugeSize / 2}
                    cy={gaugeSize / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={strokeWidth}
                />
                {/* Progress */}
                <circle
                    cx={gaugeSize / 2}
                    cy={gaugeSize / 2}
                    r={radius}
                    fill="none"
                    stroke={colors.main}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    style={{
                        filter: `drop-shadow(0 0 6px ${colors.glow})`,
                        transition: 'stroke-dashoffset 0.5s ease-out'
                    }}
                />
            </svg>

            {/* Center Content */}
            <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                style={{ textShadow: `0 0 10px ${colors.glow}` }}
            >
                <span
                    className={cn("font-black tabular-nums", isLarge ? "text-xl" : "text-sm")}
                    style={{ color: colors.main }}
                >
                    {Number(score).toFixed(1)}
                </span>
                {isLarge && (
                    <span
                        className="text-[7px] font-bold uppercase tracking-wider"
                        style={{ color: colors.main }}
                    >
                        {colors.grade}
                    </span>
                )}
            </div>

            {/* Grade label below for small size */}
            {!isLarge && (
                <span
                    className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: colors.main }}
                >
                    {colors.grade}
                </span>
            )}
        </div>
    );
}

// =============================================================================
// FACTOR BARS
// =============================================================================

function FactorBar({ label, value, color }: { label: string; value: number; color: string }) {
    const pct = Math.min(100, Math.max(0, value));

    return (
        <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-500 uppercase w-7 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${color}80, ${color})`,
                        boxShadow: `0 0 8px ${color}60`
                    }}
                />
            </div>
            <span className="text-[9px] font-mono font-bold text-slate-400 w-6 text-right">{value}</span>
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
            <div className="space-y-5">

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

                {/* HERO: Quick Stats - Horizontal Inline */}
                {isHero && ((callWall && putFloor) || whaleNetM !== undefined) && (
                    <div
                        className="flex items-center justify-between gap-4 p-3 rounded-xl"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}
                    >
                        {/* Call Wall */}
                        {callWall && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-white font-semibold">Call Wall</span>
                                <span className="text-sm font-mono font-bold text-cyan-400">${callWall}</span>
                            </div>
                        )}

                        {/* Put Floor */}
                        {putFloor && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-white font-semibold">Put Floor</span>
                                <span className="text-sm font-mono font-bold text-rose-400">${putFloor}</span>
                            </div>
                        )}

                        {/* Whale Flow with Infographic */}
                        {whaleNetM !== undefined && (
                            <div className="flex items-center gap-2">
                                {/* Whale Icon - Realistic Design */}
                                <svg
                                    className={cn(
                                        "w-6 h-6",
                                        whaleNetM >= 0 ? "text-emerald-400" : "text-rose-400"
                                    )}
                                    viewBox="0 0 32 32"
                                    fill="currentColor"
                                >
                                    {/* Whale body */}
                                    <ellipse cx="16" cy="16" rx="12" ry="8" opacity="0.9" />
                                    {/* Tail fin */}
                                    <path d="M4 16 C2 12, 1 10, 3 8 C5 10, 5 14, 4 16 M4 16 C2 20, 1 22, 3 24 C5 22, 5 18, 4 16" opacity="0.85" />
                                    {/* Top fin */}
                                    <path d="M18 8 Q20 4, 22 6 Q20 8, 18 8" opacity="0.8" />
                                    {/* Eye */}
                                    <circle cx="24" cy="14" r="1.5" fill="white" />
                                    {/* Water spout */}
                                    <path d="M26 10 Q28 6, 26 4 M26 10 Q24 6, 26 4" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6" />
                                </svg>
                                <span className={cn(
                                    "text-sm font-mono font-bold",
                                    whaleNetM >= 0 ? "text-emerald-400" : "text-rose-400"
                                )}>
                                    {whaleNetM >= 0 ? '+' : ''}${Math.abs(whaleNetM).toFixed(1)}M
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* HERO VARIANT: Trade Scenario Visual */}
                {isHero && (
                    <>
                        <TradeScenarioVisual
                            currentPrice={safePrice}
                            entryLow={minEntry}
                            entryHigh={maxEntry}
                            targetPrice={target}
                            riskLine={stop}
                        />

                        {/* Score X-Ray Toggle for Hero */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpanded(!expanded);
                            }}
                            className="w-full py-2 rounded-lg font-bold uppercase tracking-wider text-[10px] flex items-center justify-center gap-2 transition-all bg-white/5 text-slate-400 hover:bg-white/10 hover:text-cyan-400 border border-white/10"
                        >
                            <BarChart3 className="w-3.5 h-3.5" />
                            {expanded ? 'Hide Score X-Ray' : 'View Score X-Ray'}
                            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
                        </button>

                        {/* Score X-Ray Panel */}
                        {expanded && (
                            <div className="p-3 rounded-lg bg-gradient-to-br from-slate-900/80 to-slate-800/40 border border-white/5 animate-in slide-in-from-top-2 duration-300">
                                <div className="flex items-center gap-2 mb-3">
                                    <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Score X-Ray</span>
                                </div>
                                <div className="space-y-2">
                                    <FactorBar label="MOM" value={scores.momentum} color="#00ffa3" />
                                    <FactorBar label="OPT" value={scores.options} color="#00d4ff" />
                                    <FactorBar label="STR" value={scores.structure} color="#a855f7" />
                                    <FactorBar label="REG" value={scores.regime} color="#ffd000" />
                                    <FactorBar label="RISK" value={scores.risk} color="#ff4d6a" />
                                </div>
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
                                        {/* Whale Icon - Realistic Design */}
                                        <svg
                                            className={cn(
                                                "w-5 h-5",
                                                whaleNetM >= 0 ? "text-emerald-400" : "text-rose-400"
                                            )}
                                            viewBox="0 0 32 32"
                                            fill="currentColor"
                                        >
                                            <ellipse cx="16" cy="16" rx="12" ry="8" opacity="0.9" />
                                            <path d="M4 16 C2 12, 1 10, 3 8 C5 10, 5 14, 4 16 M4 16 C2 20, 1 22, 3 24 C5 22, 5 18, 4 16" opacity="0.85" />
                                            <path d="M18 8 Q20 4, 22 6 Q20 8, 18 8" opacity="0.8" />
                                            <circle cx="24" cy="14" r="1.5" fill="white" />
                                            <path d="M26 10 Q28 6, 26 4 M26 10 Q24 6, 26 4" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6" />
                                        </svg>
                                        <span className={cn(
                                            "text-sm font-mono font-bold",
                                            whaleNetM >= 0 ? "text-emerald-400" : "text-rose-400"
                                        )}>
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

                {/* View Scenario Button (Non-Hero only - Hero shows scenario inline) */}
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
                            {expanded ? 'Hide Details' : 'View Scenario'}
                            <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
                        </button>

                        {/* Expanded Details */}
                        {expanded && (
                            <div className="mt-4 pt-4 border-t border-white/10 space-y-4 animate-in slide-in-from-top-2 duration-300">
                                {/* Score X-Ray */}
                                <div className="p-3 rounded-lg bg-gradient-to-br from-slate-900/80 to-slate-800/40 border border-white/5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                                        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Score X-Ray</span>
                                    </div>
                                    <div className="space-y-2">
                                        <FactorBar label="MOM" value={scores.momentum} color="#00ffa3" />
                                        <FactorBar label="OPT" value={scores.options} color="#00d4ff" />
                                        <FactorBar label="STR" value={scores.structure} color="#a855f7" />
                                        <FactorBar label="REG" value={scores.regime} color="#ffd000" />
                                        <FactorBar label="RISK" value={scores.risk} color="#ff4d6a" />
                                    </div>
                                </div>

                                {/* Trade Scenario Visual */}
                                <TradeScenarioVisual
                                    currentPrice={safePrice}
                                    entryLow={minEntry}
                                    entryHigh={maxEntry}
                                    targetPrice={target}
                                    riskLine={stop}
                                />
                            </div>
                        )}
                    </>
                )}
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
