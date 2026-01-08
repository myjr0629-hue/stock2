'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Crosshair, Users, Activity, TrendingUp, AlertTriangle, ShieldAlert, Target, Zap, Lock, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StockItem {
    ticker: string;
    powerScore: number;
    price: number;
    changePct: number;
    rank: number;
    qualityReasonKR: string;
    decisionSSOT: {
        action: string;
        entryBand?: [number, number];
        cutPrice?: number;
        whaleEntryLevel?: number;
        whaleTargetLevel?: number;
        dominantContract?: string;
        triggersKR?: string[];
        whaleConfidence?: number;
        targetPrice?: number;
    };
    isDiscovery?: boolean;
}

export function TacticalBoard({ items }: { items: StockItem[] }) {
    const mainCorps = items.slice(0, 10);
    const discovery = items.slice(10, 12);

    return (
        <div className="w-full max-w-7xl mx-auto space-y-12 pb-20">
            {/* SECTION 1: MAIN CORPS (Tier 1) */}
            <div>
                <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
                    <h2 className="text-2xl font-black flex items-center gap-3 text-white tracking-tight">
                        <Users className="text-cyan-400 w-6 h-6" />
                        MAIN CORPS
                        <span className="text-sm text-white/40 font-mono font-normal ml-2 tracking-normal">// ALPHASCORE VERIFIED</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                    {mainCorps.map((item) => (
                        <SniperCard key={item.ticker} item={item} />
                    ))}
                </div>
            </div>

            {/* SECTION 2: DISCOVERY SQUAD (Tier 2) */}
            <div>
                <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
                    <h2 className="text-2xl font-black flex items-center gap-3 text-amber-500 tracking-tight">
                        <Flame className="w-6 h-6 animate-pulse" />
                        DISCOVERY SQUAD
                        <span className="text-sm text-white/40 font-mono font-normal ml-2 tracking-normal">// HIGH RISK • HIGH REWARD</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                    {discovery.map((item) => (
                        <SniperCard key={item.ticker} item={item} isDiscovery={true} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function SniperCard({ item, isDiscovery = false }: { item: StockItem, isDiscovery?: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const { decisionSSOT: ssot } = item;
    const isPositive = item.changePct >= 0;

    // Sniper Data Detection
    const hasWhaleData = !!ssot.whaleEntryLevel && !!ssot.whaleTargetLevel;
    const isWhaleDriver = ssot.triggersKR?.includes('WHALE_DRIVER');

    // Theme Colors
    const themeColor = isDiscovery ? "amber" : "cyan";
    const accentColor = "emerald"; // For Action buttons

    // Dynamic Analysis Generation (The "Insider Thesis")
    const generateInsiderNote = () => {
        if (hasWhaleData) {
            const spread = ((ssot.whaleTargetLevel! - item.price) / item.price * 100).toFixed(1);
            return `Major Whale positioning detected via ${ssot.dominantContract || 'Options Flow'}. Targeting ${spread}% upside to Break-even ($${ssot.whaleTargetLevel}).`;
        }
        return item.qualityReasonKR || "Algorithmic momentum detected. Standard tactical setup.";
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "relative rounded-xl border transition-all duration-300 overflow-hidden group bg-slate-900/80 backdrop-blur-sm",
                expanded ? `border-${themeColor}-500/50 shadow-[0_0_30px_-5px_rgba(6,182,212,0.15)] ring-1 ring-${themeColor}-500/20`
                    : "border-white/10 hover:border-white/20 hover:bg-slate-800/80"
            )}
        >
            {/* Header Strip - Always Visible */}
            <div
                className="p-5 cursor-pointer relative z-10"
                onClick={() => setExpanded(!expanded)}
            >
                {/* Top Row: Ticker & Rank */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg shadow-inner",
                            isDiscovery ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        )}>
                            {item.rank}
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-white tracking-tighter leading-none">{item.ticker}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                {isWhaleDriver && (
                                    <span className="text-[10px] px-1.5 rounded-sm bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 font-bold">
                                        <Zap size={10} className="fill-indigo-300" /> SNIPER ACTIVE
                                    </span>
                                )}
                                <span className="text-[10px] text-white/30 font-mono">SCORE {item.powerScore.toFixed(0)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-xl font-mono font-bold text-white tracking-tight">${item.price.toFixed(2)}</div>
                        <div className={cn("text-xs font-mono font-bold flex justify-end items-center gap-1", isPositive ? "text-emerald-400" : "text-rose-400")}>
                            {isPositive ? "+" : ""}{item.changePct.toFixed(2)}%
                        </div>
                    </div>
                </div>

                {/* Kill Box: High Contrast Data Display */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                    {/* TARGET (Gold) */}
                    <div className="bg-slate-950/50 rounded p-2 border border-white/5 flex flex-col items-center justify-center group-hover:border-amber-500/30 transition-colors">
                        <span className="text-[9px] text-amber-500/70 font-bold uppercase tracking-wider mb-0.5">TARGET (BEP)</span>
                        <span className="text-lg font-mono font-bold text-amber-400 tracking-tighter">
                            ${(ssot.whaleTargetLevel || ssot.targetPrice || 0).toFixed(2)}
                        </span>
                    </div>

                    {/* ENTRY (Cyan) */}
                    <div className="bg-slate-950/50 rounded p-2 border border-white/5 flex flex-col items-center justify-center group-hover:border-cyan-500/30 transition-colors">
                        <span className="text-[9px] text-cyan-500/70 font-bold uppercase tracking-wider mb-0.5">ENTRY ZONE</span>
                        <span className="text-base font-mono font-bold text-cyan-300 tracking-tighter">
                            ${(ssot.whaleEntryLevel || ssot.entryBand?.[0] || 0)?.toFixed(2)}
                        </span>
                    </div>

                    {/* STOP (Rose) */}
                    <div className="bg-slate-950/50 rounded p-2 border border-white/5 flex flex-col items-center justify-center group-hover:border-rose-500/30 transition-colors">
                        <span className="text-[9px] text-rose-500/70 font-bold uppercase tracking-wider mb-0.5">STOP LOSS</span>
                        <span className="text-base font-mono font-bold text-rose-400 tracking-tighter">
                            ${(ssot.cutPrice || 0).toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Expander Arrow */}
                <div className="flex justify-center mt-3 -mb-2 opacity-30 group-hover:opacity-100 transition-opacity">
                    <ChevronDown size={16} className={cn("transition-transform duration-300", expanded && "rotate-180")} />
                </div>
            </div>

            {/* Deep Intel Expansion (The "Why") */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-white/5 bg-black/20"
                    >
                        <div className="p-5 space-y-4">
                            {/* 1. The Insider Thesis */}
                            <div>
                                <h4 className="flex items-center gap-2 text-xs font-bold text-white/50 uppercase mb-2">
                                    <Lock size={12} className="text-emerald-500" />
                                    Insider Thesis (Black Box)
                                </h4>
                                <p className="text-sm text-slate-300 leading-relaxed border-l-2 border-emerald-500/50 pl-3">
                                    {generateInsiderNote()}
                                </p>
                            </div>

                            {/* 2. Forensic Data Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/5 rounded p-2 border border-white/5">
                                    <span className="block text-[10px] text-white/40 uppercase">Whale Confidence</span>
                                    <div className="flex items-end gap-1">
                                        <span className="text-xl font-bold text-white">{ssot.whaleConfidence || item.powerScore.toFixed(0)}%</span>
                                        <div className="h-1.5 flex-1 bg-slate-700 rounded-full mb-1.5 ml-2 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500"
                                                style={{ width: `${ssot.whaleConfidence || item.powerScore}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white/5 rounded p-2 border border-white/5">
                                    <span className="block text-[10px] text-white/40 uppercase">Dominant Engine</span>
                                    <span className="text-sm font-mono text-cyan-300 truncate block">
                                        {ssot.dominantContract || "EQUITY FLOW"}
                                    </span>
                                </div>
                            </div>

                            {/* 3. Action Button */}
                            <button className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center justify-center gap-2 transition-colors uppercase tracking-wider text-sm shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)]">
                                <Crosshair size={16} />
                                Initiate Sighting
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hover Scanline Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/0 via-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" />
        </motion.div>
    );
}
