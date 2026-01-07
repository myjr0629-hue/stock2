'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, AlertOctagon, TrendingUp, TrendingDown, Target, Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface TacticalCardProps {
    ticker: string;
    rank: number;
    price: number;
    change: number;
    entryBand?: { min: number; max: number };
    cutPrice?: number;
    isLocked?: boolean;
    name?: string; // Optional name/sector
    rsi?: number; // [Phase 40] Real RSI
    score?: number; // [Phase 40] Alpha Score
    isDayTradeOnly?: boolean; // [Phase 40] Risk Badge
    reasonKR?: string; // [V3.6] Reasoning
    // [V3.7.5] Extended Data Support
    extendedPrice?: number;
    extendedChange?: number;
    extendedLabel?: string;
}

export function TacticalCard({ ticker, rank, price, change, entryBand, cutPrice, isLocked, name, rsi, score, isDayTradeOnly, reasonKR, extendedPrice, extendedChange, extendedLabel }: TacticalCardProps) {

    // Safety Fallbacks
    const safePrice = price || 0;
    const safeChange = change || 0;
    const isPositive = safeChange >= 0;

    // [V4 Design System] - Neon Tactical
    // Colors: Emerald-400 (Profit), Rose-500 (Loss), Amber-400 (Entry)

    const minEntry = (entryBand && typeof entryBand.min === 'number') ? entryBand.min : safePrice * 0.99;
    const maxEntry = (entryBand && typeof entryBand.max === 'number') ? entryBand.max : safePrice * 1.01;
    const isBuyZone = safePrice >= minEntry && safePrice <= maxEntry;

    return (
        <Card className={cn(
            "w-full bg-[#0a0f18] border-none shadow-2xl overflow-hidden relative group transition-all duration-300",
            // Hover: Glowing Border
            "hover:ring-1 hover:ring-emerald-500/50"
        )}>
            {/* 1. Rank & Ticker Header (Left) */}
            <div className="absolute top-0 left-0 p-4 z-10">
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white tracking-tighter tabular-nums">{ticker}</span>
                    <span className="text-xs font-bold text-slate-500">#{rank}</span>
                </div>
                {/* Name/Reason Subtext */}
                <div className="mt-1 flex flex-col gap-0.5">
                    {name && <span className="text-[10px] text-slate-400 font-mono tracking-tight uppercase">{name}</span>}
                </div>
            </div>

            {/* 2. PRICE & CHANGE (Right - HUGE) */}
            <div className="absolute top-0 right-0 p-4 text-right z-10">
                <div className={cn(
                    "text-3xl font-black tracking-tight tabular-nums drop-shadow-lg",
                    isPositive ? "text-emerald-400" : "text-rose-500"
                )}>
                    ${safePrice.toFixed(2)}
                </div>
                <div className={cn(
                    "text-sm font-bold flex items-center justify-end gap-1 mt-0.5",
                    isPositive ? "text-emerald-500" : "text-rose-500"
                )}>
                    {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {isPositive ? '+' : ''}{safeChange.toFixed(2)}%
                </div>

                {/* [V3.7.5] Extended Session Badge */}
                {(extendedPrice && extendedPrice > 0) && (
                    <div className="flex items-center justify-end gap-1.5 mt-1 pt-1 border-t border-slate-800/50 opacity-80">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{extendedLabel || 'EXT'}</span>
                        <span className={cn(
                            "text-xs font-mono font-bold",
                            (extendedChange || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                            ${extendedPrice.toFixed(2)}
                        </span>
                    </div>
                )}
            </div>

            {/* SPACER FOR TOP SECTION */}
            <div className="h-24"></div>

            {/* 3. ALPHA SCORE & SIGNAL (Middle) */}
            <CardContent className="px-4 pb-4 pt-0">
                <div className="flex items-center justify-between mb-4">
                    {/* Circle Score */}
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "relative w-12 h-12 rounded-full flex items-center justify-center border-2",
                            (score || 0) >= 80 ? "border-emerald-500 bg-emerald-950/30 text-emerald-400" :
                                (score || 0) >= 50 ? "border-amber-500 bg-amber-950/30 text-amber-400" :
                                    "border-slate-600 bg-slate-800 text-slate-400"
                        )}>
                            <span className="text-lg font-black">{score?.toFixed(0) || '-'}</span>
                            {/* Glow Effect for Leaders */}
                            {(score || 0) >= 80 && <div className="absolute inset-0 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse" />}
                        </div>

                        {/* Reason Text */}
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ALPHA SIGNAL</span>
                            {/* Truncate long reasons gracefully */}
                            <span className={cn(
                                "text-xs font-bold line-clamp-2 leading-tight max-w-[140px]",
                                (score || 0) >= 80 ? "text-emerald-300" : "text-slate-300"
                            )}>
                                {reasonKR || "분석 대기중..."}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 4. TACTICAL TRIGGER BOX (Bottom) */}
                <div className={cn(
                    "rounded-lg border border-dashed p-2.5 flex justify-between items-center relative overflow-hidden",
                    // Dynamic Border Color
                    isBuyZone ? "border-amber-400/50 bg-amber-900/10" : "border-slate-700 bg-slate-900/50"
                )}>
                    {/* Buy Zone Label */}
                    <div className="flex flex-col z-10">
                        <span className="text-[9px] font-bold text-amber-500/80 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                            <Target className="w-3 h-3" /> ENTRY BAND
                        </span>
                        <div className="text-sm font-mono font-bold text-amber-400 flex items-center gap-1.5">
                            ${minEntry.toFixed(2)} <span className="text-slate-600">-</span> ${maxEntry.toFixed(2)}
                        </div>
                    </div>

                    {/* Stop Loss (Right) */}
                    <div className="flex flex-col items-end z-10">
                        <span className="text-[9px] font-bold text-rose-500/80 uppercase tracking-widest mb-0.5">STOP LOSS</span>
                        <span className="text-sm font-mono font-bold text-rose-500">
                            ${cutPrice ? cutPrice.toFixed(2) : '-'}
                        </span>
                    </div>

                    {/* Active Buy Indicator (Background Pulse) */}
                    {isBuyZone && (
                        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent pointer-events-none" />
                    )}
                </div>

            </CardContent>
        </Card>
    );
}
