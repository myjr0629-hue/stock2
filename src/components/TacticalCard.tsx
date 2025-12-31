'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, AlertOctagon, TrendingUp, TrendingDown, Target } from "lucide-react";
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
}

export function TacticalCard({ ticker, rank, price, change, entryBand, cutPrice, isLocked, name, rsi, score, isDayTradeOnly }: TacticalCardProps) {
    // if (!isLocked || !entryBand) return null; // REMOVED STRICT CHECK

    const hasTacticalData = isLocked && entryBand && cutPrice;

    // Default / Fallback for non-tactical
    const minEntry = entryBand ? entryBand.min : price * 0.99;
    const maxEntry = entryBand ? entryBand.max : price * 1.01;

    const isBuyZone = price >= minEntry && price <= maxEntry;
    const isStopLoss = cutPrice ? price <= cutPrice : false;
    const isProfit = price > maxEntry;

    // Calculate visual position (0-100%)
    // Range: CutPrice (0%) -> MaxEntry * 1.05 (100%)
    const rangeMin = cutPrice ? cutPrice * 0.99 : minEntry * 0.95;
    const rangeMax = maxEntry * 1.05;
    const rangeSpan = rangeMax - rangeMin;

    const getPos = (val: number) => {
        if (!hasTacticalData) return 50;
        return Math.min(100, Math.max(0, ((val - rangeMin) / rangeSpan) * 100));
    };

    const curPos = getPos(price);
    const minPos = getPos(minEntry);
    const maxPos = getPos(maxEntry);
    const cutPos = cutPrice ? getPos(cutPrice) : 0;

    // [Phase 40] Score Color
    const getScoreColor = (s: number) => {
        if (s >= 80) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
        if (s >= 50) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
        return "text-rose-400 border-rose-500/30 bg-rose-500/10";
    };

    return (
        <Card className="w-full bg-slate-900 border-slate-700 shadow-xl overflow-hidden relative group hover:border-emerald-500/50 transition-all duration-300">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 opacity-90" />
            {isBuyZone && <div className="absolute inset-0 border-2 border-emerald-500/20 animate-pulse rounded-lg pointer-events-none" />}

            <CardContent className="relative p-5">
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-900/50 text-emerald-400 font-bold border border-emerald-700">
                            #{rank}
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                                {ticker}
                                <Lock className="w-4 h-4 text-emerald-500" />
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                                {name && <p className="text-xs text-slate-400">{name}</p>}
                                {/* [Phase 40] RSI & Score Badges */}
                                {score !== undefined && (
                                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border", getScoreColor(score))}>
                                        SCR {score.toFixed(0)}
                                    </span>
                                )}
                                {rsi !== undefined && (
                                    <span className={cn("text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300",
                                        rsi > 70 ? "text-rose-400" : rsi < 30 ? "text-emerald-400" : "")}>
                                        RSI {rsi.toFixed(1)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className={cn("text-2xl font-bold font-mono", change >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {price.toFixed(2)}
                        </div>
                        <div className={cn("text-xs font-bold flex items-center justify-end gap-1", change >= 0 ? "text-emerald-500" : "text-rose-500")}>
                            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {change > 0 ? '+' : ''}{change.toFixed(2)}%
                        </div>
                    </div>
                </div>

                {/* Tactical Visualizer */}
                <div className="relative mt-6 h-12 w-full select-none">
                    {/* Track */}
                    <div className="absolute top-4 left-0 right-0 h-2 bg-slate-800 rounded-full overflow-hidden">
                        {/* Entry Band Zone */}
                        <div
                            className="absolute top-0 bottom-0 bg-emerald-500/30 border-x border-emerald-500/50"
                            style={{ left: `${minPos}%`, width: `${maxPos - minPos}%` }}
                        />
                    </div>

                    {/* Cut Price Marker */}
                    {cutPrice && (
                        <div className="absolute top-1 bottom-1 w-0.5 bg-rose-600 z-10" style={{ left: `${cutPos}%` }}>
                            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-rose-500 font-bold whitespace-nowrap">
                                STOP {cutPrice}
                            </div>
                        </div>
                    )}

                    {/* Entry Labels */}
                    <div className="absolute -top-4 w-full text-[10px] text-slate-500 flex justify-between px-1">
                        <span style={{ left: `${minPos}%`, position: 'absolute', transform: 'translateX(-50%)' }}>
                            ENTRY {minEntry.toFixed(1)}
                        </span>
                        <span style={{ left: `${maxPos}%`, position: 'absolute', transform: 'translateX(-50%)' }}>
                            {maxEntry.toFixed(1)}
                        </span>
                    </div>

                    {/* Current Price Marker */}
                    <div
                        className="absolute top-2 w-0.5 h-6 bg-white z-20 shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all duration-1000 ease-out"
                        style={{ left: `${curPos}%` }}
                    >
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-600">
                            NOW
                        </div>
                    </div>
                </div>



            </CardContent>
        </Card>
    );
}
