'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Flame, Crosshair, Users, Activity, TrendingUp, AlertTriangle } from 'lucide-react';
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
    };
    isDiscovery?: boolean;
}

export function TacticalBoard({ items }: { items: StockItem[] }) {
    // Separate Main Corps (1-10) and Discovery (11-12)
    const mainCorps = items.slice(0, 10);
    const discovery = items.slice(10, 12);

    return (
        <div className="w-full max-w-7xl mx-auto space-y-12">
            {/* SECTION 1: MAIN CORPS (Tier 1) */}
            <div>
                <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-2">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                        <Users className="text-cyan-500" />
                        MAIN CORPS (주력군)
                        <span className="text-xs text-white/40 ml-2 font-normal">DATA VERIFIED • HIGH PROBABILITY</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {mainCorps.map((item) => (
                        <TacticalCard key={item.ticker} item={item} />
                    ))}
                </div>
            </div>

            {/* SECTION 2: DISCOVERY SQUAD (Tier 2) */}
            <div>
                <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-2">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-amber-500">
                        <Flame className="animate-pulse" />
                        DISCOVERY SQUAD (수색대)
                        <span className="text-xs text-white/40 ml-2 font-normal">HIGH RISKS • HIGH REWARDS • UNVERIFIED</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                    {discovery.map((item) => (
                        <TacticalCard key={item.ticker} item={item} isDiscovery={true} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function TacticalCard({ item, isDiscovery = false }: { item: StockItem, isDiscovery?: boolean }) {
    const isPositive = item.changePct >= 0;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.03)' }}
            className={cn(
                "relative p-4 rounded-sm border transition-all duration-300 group cursor-pointer h-[240px] flex flex-col justify-between overflow-hidden",
                isDiscovery ? "border-amber-500/30 bg-amber-950/10 hover:border-amber-500/60" : "border-white/10 bg-white/5 hover:border-cyan-500/50"
            )}
        >
            {/* Background Heatmap Effect (Hover) */}
            <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            {/* Header */}
            <div className="flex justify-between items-start z-10">
                <div>
                    <div className="flex items-center gap-2">
                        <span className={cn("text-2xl font-bold tracking-tighter", isDiscovery ? "text-amber-400" : "text-white")}>
                            {item.ticker}
                        </span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded border",
                            item.decisionSSOT.action === 'BUY' ? "border-emerald-500 text-emerald-500" : "border-white/20 text-white/40"
                        )}>
                            {item.decisionSSOT.action}
                        </span>
                    </div>
                    <div className="text-xs text-white/40 mt-1">RANK #{item.rank}</div>
                </div>
                <div className="text-right">
                    <div className="text-lg font-mono">${item.price.toFixed(2)}</div>
                    <div className={cn("text-xs font-mono flex items-center justify-end gap-1", isPositive ? "text-emerald-400" : "text-red-400")}>
                        {isPositive ? <TrendingUp size={12} /> : <TrendingUp size={12} className="rotate-180" />}
                        {item.changePct.toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* Score & Reason */}
            <div className="z-10">
                <div className="flex items-end gap-2 mb-2">
                    <div className="text-4xl font-black text-white/10 group-hover:text-white/20 transition-colors">
                        {item.powerScore.toFixed(0)}
                    </div>
                    <div className="text-[10px] text-white/40 mb-1.5">ALPHA SCORE</div>
                </div>
                <div className="text-xs text-white/70 line-clamp-2 h-8 leading-relaxed">
                    {item.qualityReasonKR}
                </div>
            </div>

            {/* Tactical Footer */}
            <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center z-10">
                <div className="flex flex-col">
                    <span className="text-[10px] text-white/30 uppercase">Entry Zone</span>
                    <span className="text-xs font-mono text-cyan-400">
                        {item.decisionSSOT.entryBand ? `$${item.decisionSSOT.entryBand[0]} - $${item.decisionSSOT.entryBand[1]}` : 'N/A'}
                    </span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-[10px] text-white/30 uppercase">Stop Loss</span>
                    <span className="text-xs font-mono text-pink-500">
                        {item.decisionSSOT.cutPrice ? `$${item.decisionSSOT.cutPrice}` : 'N/A'}
                    </span>
                </div>
            </div>

            {isDiscovery && (
                <div className="absolute top-2 right-2 text-amber-500 animate-pulse">
                    <AlertTriangle size={16} />
                </div>
            )}
        </motion.div>
    );
}
