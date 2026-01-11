'use client';

import React from 'react';
import { Card } from "@/components/ui/card";
import { AlertOctagon, Zap, Shield, Target } from "lucide-react";
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
    // [V4.2] Market Status Override
    isClosed?: boolean;
}

export function TacticalCard({ ticker, rank, price, change, entryBand, cutPrice, isLocked, name, rsi, score, isDayTradeOnly, reasonKR, extendedPrice, extendedChange, extendedLabel, whaleTargetLevel, whaleConfidence, dominantContract, triggers, isClosed }: TacticalCardProps) {

    // Safety Fallbacks & Live Price Logic
    const isLive = extendedLabel === 'LIVE';
    const currentPrice = isLive && extendedPrice ? extendedPrice : (price || 0);
    const safePrice = price || 0;

    // Gain Calculation (Live vs Static)
    // [User Req] If Closed, show Recent Trading Day (Intraday) change, ignore Post-Market
    const useDayChange = isClosed || !isLive;
    let gain = (!useDayChange && extendedChange !== undefined) ? extendedChange : (change || 0);

    let gainPct = 0;

    // Calculate Percent if missing
    if (safePrice !== 0 && currentPrice !== 0) {
        const impliedPrevClose = safePrice - (change || 0);
        if (impliedPrevClose > 0) {
            // Recalculate based on the displayed 'gain'
            gainPct = (gain / impliedPrevClose) * 100;
        }
    }

    const isPositive = gain >= 0;

    // ... (Min Entry / Max Entry logic removed for brevity in diff, assume unchanged)
    const minEntry = (entryBand && typeof entryBand.min === 'number') ? entryBand.min : safePrice * 0.99;
    const maxEntry = (entryBand && typeof entryBand.max === 'number') ? entryBand.max : safePrice * 1.01;
    const isBuyZone = currentPrice >= minEntry && currentPrice <= maxEntry;
    const whaleEntryLevel = (minEntry + maxEntry) / 2;
    const scoreColorText = (score || 0) >= 80 ? "text-emerald-400" : (score || 0) >= 50 ? "text-amber-400" : "text-slate-400";
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
                        {/* 2. Main Price (Live Pulse) */}
                        <div className="text-center relative">
                            <div className="absolute top-[-10px] left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-500 whitespace-nowrap tracking-wider">
                                {isLive ? <span className="text-emerald-400 animate-pulse">● LIVE</span> : "CLOSE"}
                            </div>
                            {/* [User: Smaller Price] */}
                            <div className={`text-5xl font-black tabular-nums tracking-tighter drop-shadow-2xl ${gain >= 0
                                ? isLive ? "text-emerald-400" : "text-emerald-400"
                                : isLive ? "text-rose-400" : "text-rose-400"
                                }`}>
                                {extendedPrice?.toFixed(2) || currentPrice.toFixed(2)}
                            </div>

                            {/* SNIPER ACTION ZONE (Smart Entry Logic) */}
                            {cutPrice && currentPrice < cutPrice ? (
                                <div className="mt-2 text-xs font-black text-rose-400 uppercase tracking-widest animate-pulse">
                                    STOP BREACHED
                                </div>
                            ) : isBuyZone ? (
                                <div className="mt-2 text-xs font-black text-emerald-400 uppercase tracking-widest animate-pulse">
                                    EXECUTE ENTRY
                                </div>
                            ) : whaleTargetLevel && currentPrice >= whaleTargetLevel * 0.99 ? (
                                <div className="mt-2 text-xs font-black text-cyan-400 uppercase tracking-widest">
                                    TARGET APPROACH
                                </div>
                            ) : (
                                // Minimalist "Wait" Indicator
                                (whaleEntryLevel && currentPrice > whaleEntryLevel) ? (
                                    <div className="mt-2 text-[10px] font-bold text-slate-500/80 uppercase tracking-widest flex items-center justify-center gap-1">
                                        <div className="w-1 h-1 rounded-full bg-slate-500 animate-pulse" />
                                        WAIT (${whaleEntryLevel.toFixed(0)})
                                    </div>
                                ) : (
                                    <div className="mt-2 text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                                        MONITORING
                                    </div>
                                )
                            )}

                            {/* [User: Only %] */}
                            <div className={`text-lg font-bold mt-0.5 ${gain >= 0 ? "text-emerald-500/80" : "text-rose-500/80"}`}>
                                {gain >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
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

                {/* 3. REPORT BASELINE (Variance Check) */}
                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Report Price (Basis)</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-mono font-bold text-slate-400">
                                ${safePrice.toFixed(2)}
                            </span>
                            <span className="text-[9px] text-slate-600 font-medium">리포트 발행 기준가</span>
                        </div>
                    </div>

                    {isLive && (
                        <div className="text-right">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Alpha Return</span>
                            <div className={cn(
                                "text-sm font-bold flex items-center justify-end gap-1",
                                (currentPrice - safePrice) >= 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                                {safePrice > 0
                                    ? <>{(currentPrice - safePrice) > 0 ? "+" : ""}{((currentPrice - safePrice) / safePrice * 100).toFixed(2)}%</>
                                    : "N/A"
                                }
                            </div>
                            <span className="text-[9px] text-slate-600 font-medium block mt-0.5">실시간 수익률</span>
                        </div>
                    )}
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

                {/* FOOTER: ENTRIES & EXITS */}
                <div className="grid grid-cols-2 gap-2 mt-auto">
                    {/* Left: Entry Zone */}
                    <div className="p-3 rounded bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors">
                        <span className="text-[9px] font-bold text-emerald-500/50 uppercase tracking-widest block mb-0.5">Entry Zone</span>
                        <div className="text-lg font-mono font-bold text-emerald-400 tabular-nums tracking-tight">
                            ${minEntry.toFixed(2)} <span className="text-slate-600 text-xs mx-0.5">~</span> ${maxEntry.toFixed(2)}
                        </div>
                        <div className="text-[9px] text-emerald-500/50 font-medium leading-tight mt-0.5 -mb-0.5 tracking-tight">
                            기관(Whale) 매집 시작 안전 구간
                        </div>
                    </div>

                    {/* Right: Targets */}
                    <div className="space-y-1">
                        <div className="flex justify-between items-center px-2 py-1.5 rounded bg-white/5 border border-white/5">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Target</span>
                            <span className="text-sm font-mono font-bold text-sky-300 tabular-nums">
                                ${(safePrice * 1.05).toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center px-2 py-1.5 rounded bg-rose-500/5 border border-rose-500/10">
                            <span className="text-[9px] font-bold text-rose-500/50 uppercase tracking-widest">Stop</span>
                            <span className="text-sm font-mono font-bold text-rose-400 tabular-nums">
                                ${cutPrice?.toFixed(2) || (safePrice * 0.95).toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </Card>
    );
}
