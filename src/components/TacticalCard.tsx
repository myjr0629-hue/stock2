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
    // [V4.1] Sniper Data
    whaleTargetLevel?: number;
    whaleConfidence?: string;
    dominantContract?: string;
    triggers?: string[];
}

export function TacticalCard({ ticker, rank, price, change, entryBand, cutPrice, isLocked, name, rsi, score, isDayTradeOnly, reasonKR, extendedPrice, extendedChange, extendedLabel, whaleTargetLevel, whaleConfidence, dominantContract, triggers }: TacticalCardProps) {

    // Safety Fallbacks
    const safePrice = price || 0;
    const safeChange = change || 0;
    const isPositive = safeChange >= 0;

    // [V4.5] Glass Design System - "Crystal Intel"
    const minEntry = (entryBand && typeof entryBand.min === 'number') ? entryBand.min : safePrice * 0.99;
    const maxEntry = (entryBand && typeof entryBand.max === 'number') ? entryBand.max : safePrice * 1.01;
    const isBuyZone = safePrice >= minEntry && safePrice <= maxEntry;

    // Determine score color text
    const scoreColorText = (score || 0) >= 80 ? "text-emerald-400" : (score || 0) >= 50 ? "text-amber-400" : "text-slate-400";

    // Sniper/Whale Active Logic
    const hasWhale = !!whaleTargetLevel && whaleTargetLevel > 0;

    return (
        <Card className={cn(
            "w-full h-full min-h-[340px] relative overflow-hidden transition-all duration-300 group cursor-pointer",
            "bg-white/5 backdrop-blur-[12px] border border-white/10 shadow-2xl",
            "hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_40px_rgba(56,189,248,0.15)] hover:scale-[1.01]"
        )}>
            {/* 1. GLASS HIGHLIGHTS & EFFECTS */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-50" />
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/20 blur-[80px] rounded-full pointer-events-none group-hover:bg-cyan-400/30 transition-colors" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/20 blur-[80px] rounded-full pointer-events-none" />

            {/* [NEW] INFOGRAPHIC RANK BACKGROUND */}
            <div className="absolute top-[-20px] right-[-10px] text-[140px] font-black text-white/5 leading-none pointer-events-none select-none z-0 tracking-tighter" style={{ fontFamily: 'var(--font-geist-mono)' }}>
                {rank}
            </div>

            {/* 2. CARD CONTENT LAYER */}
            <div className="relative z-10 p-5 flex flex-col h-full justify-between">

                {/* HEADLINE: Ticker & Score */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-inner overflow-hidden relative group-hover:border-white/20 transition-colors">
                            <img
                                src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                alt={ticker}
                                className="w-full h-full object-cover scale-110"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                            />
                            <div className="hidden w-full h-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">
                                {ticker.substring(0, 1)}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-3xl font-black text-white tracking-tighter leading-none drop-shadow-sm flex items-center gap-2">
                                {ticker}
                            </h3>
                            <div className="flex items-center gap-2 mt-1.5">
                                {/* [NEW] HIGH VISIBILITY SCORE */}
                                <div className={cn("flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-md border backdrop-blur-md", scoreColorText.replace('text-', 'border-').replace('400', '500/30 bg-').replace('text-', 'bg-').replace('bg-', '') + '900/20')}>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SCORE</span>
                                    <span className={cn("text-base font-black tracking-tight", scoreColorText)}>
                                        {score?.toFixed(0)}
                                    </span>
                                </div>

                                {hasWhale && (
                                    <span className="text-[10px] bg-indigo-500/20 px-1.5 py-1 rounded border border-indigo-500/30 text-indigo-300 font-bold flex items-center gap-1 uppercase tracking-wider animate-pulse">
                                        <Zap className="w-3 h-3 text-indigo-400" /> Sniper
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* PRICE ROW (Moved below header for better hierarchy) */}
                <div className="flex justify-between items-baseline mb-4 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            "text-3xl font-bold font-mono tracking-tighter tabular-nums",
                            isPositive ? "text-white" : "text-white"
                        )}>
                            ${safePrice.toFixed(2)}
                        </span>
                    </div>
                    <div className={cn(
                        "text-sm font-bold flex items-center gap-1 px-2 py-1 rounded",
                        isPositive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    )}>
                        {isPositive ? '+' : ''}{safeChange.toFixed(2)}%
                    </div>
                </div>

                {/* MIDDLE: THE REASONING (Explicit Thesis) */}
                <div className="mb-4 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", scoreColorText.replace('text-', 'bg-'))} />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Investment Thesis</span>
                    </div>

                    <div className="p-3.5 rounded-lg bg-black/20 border border-white/5 backdrop-blur-sm group-hover:bg-black/30 transition-colors shadow-inner">
                        <p className="text-sm font-medium text-slate-100 leading-relaxed text-pretty">
                            {reasonKR || "분석 완료. 매수 시그널 대기 중."}
                        </p>
                    </div>

                    {/* Tags / Triggers */}
                    {triggers && triggers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {triggers.slice(0, 3).map((t, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-medium">
                                    {t}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* BOTTOM: ACTION DATA GRID */}
                <div className="grid grid-cols-2 gap-2 mt-auto">
                    {/* Entry Zone */}
                    <div className="relative p-2.5 rounded bg-amber-500/5 border border-amber-500/10 overflow-hidden group/zone">
                        <span className="block text-[9px] text-amber-500/60 font-bold uppercase tracking-wider mb-0.5">Entry Zone</span>
                        <div className="text-sm font-mono font-bold text-amber-500">
                            ${minEntry.toFixed(2)}<span className="text-amber-500/30 mx-0.5">~</span>${maxEntry.toFixed(2)}
                        </div>
                        {isBuyZone && <div className="absolute inset-0 border border-amber-500/40 rounded animate-pulse" />}
                    </div>

                    {/* Target/Stop */}
                    <div className="p-2.5 rounded bg-white/5 border border-white/5">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Target</span>
                            <span className="text-[11px] font-mono font-bold text-cyan-400">${whaleTargetLevel ? whaleTargetLevel.toFixed(2) : '-'}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-white/5 pt-1">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Stop</span>
                            <span className="text-[11px] font-mono font-bold text-rose-400">${cutPrice ? cutPrice.toFixed(2) : '-'}</span>
                        </div>
                    </div>
                </div>

                {/* Hover Glow Accent */}
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>
        </Card >
    );
}
