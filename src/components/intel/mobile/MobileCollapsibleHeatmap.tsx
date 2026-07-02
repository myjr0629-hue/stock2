'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { FlashPrice } from '@/components/ui/PriceDisplay';

interface SectorStat {
    def: {
        key: string;
        tabKey: string;
        shortLabel: string;
        icon: string;
        accent: string;
    };
    stats: {
        avgChange: number;
        upCount: number;
        downCount: number;
    };
    quotes: IntelQuote[];
}

interface MobileCollapsibleHeatmapProps {
    sectorStats: SectorStat[];
    onTickerClick: (ticker: IntelQuote) => void;
}

export function MobileCollapsibleHeatmap({ sectorStats, onTickerClick }: MobileCollapsibleHeatmapProps) {
    const [expandedSector, setExpandedSector] = useState<string | null>(null);

    const toggleSector = (key: string) => {
        if (expandedSector === key) {
            // Provide haptic feedback for closing
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
            setExpandedSector(null);
        } else {
            // Provide haptic feedback for opening
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40);
            setExpandedSector(key);
        }
    };

    return (
        <div className="w-full space-y-3 px-3">
            <h2 className="text-[13px] font-bold text-slate-400 tracking-wider uppercase mb-2">SECTOR HEATMAP</h2>
            
            {sectorStats.map((sector) => {
                const isExpanded = expandedSector === sector.def.key;
                const isBullish = sector.stats.avgChange >= 0;

                return (
                    <div key={sector.def.key} className="bg-[#0a1120] border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                        {/* Sector Header / Bar */}
                        <button
                            onClick={() => toggleSector(sector.def.key)}
                            className="w-full flex items-center justify-between p-4 active:bg-white/5 transition-colors touch-manipulation"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl">{sector.def.icon}</span>
                                <span className={`font-black text-[15px] ${sector.def.accent}`}>{sector.def.shortLabel}</span>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-right flex flex-col items-end">
                                    <span className={`text-[15px] font-bold font-mono tracking-tight ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isBullish ? '+' : ''}{sector.stats.avgChange.toFixed(2)}%
                                    </span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-emerald-500/80 font-bold bg-emerald-500/10 px-1 rounded">{sector.stats.upCount}↑</span>
                                        <span className="text-[10px] text-rose-500/80 font-bold bg-rose-500/10 px-1 rounded">{sector.stats.downCount}↓</span>
                                    </div>
                                </div>
                                <motion.div
                                    animate={{ rotate: isExpanded ? 180 : 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                    className="text-slate-500"
                                >
                                    <ChevronDown className="w-5 h-5" />
                                </motion.div>
                            </div>
                        </button>

                        {/* Collapsible Content */}
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                    className="overflow-hidden"
                                >
                                    <div className="p-2 pt-0 grid grid-cols-1 gap-1.5 border-t border-white/5 mt-1 bg-black/20">
                                        {sector.quotes.filter(q => q.price > 0).sort((a,b) => b.changePct - a.changePct).map(quote => (
                                            <button
                                                key={quote.ticker}
                                                onClick={() => {
                                                    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
                                                    onTickerClick(quote);
                                                }}
                                                className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/5 transition-colors touch-manipulation"
                                                style={{ WebkitTapHighlightColor: 'transparent' }}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="font-bold text-white text-[15px] w-12 text-left">{quote.ticker}</span>
                                                    {/* Context Badge (A, B, C) */}
                                                    <div className={`flex items-center justify-center w-6 h-6 rounded-full border ${quote.alphaScore >= 60 ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : quote.alphaScore >= 40 ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'border-rose-500/50 bg-rose-500/10 text-rose-400'}`}>
                                                        <span className="text-[10px] font-black">{quote.alphaScore >= 60 ? 'A' : quote.alphaScore >= 40 ? 'B' : 'C'}</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end">
                                                    <FlashPrice value={quote.price} className="text-sm font-mono text-white font-semibold" />
                                                    <span className={`text-[12px] font-mono font-bold ${quote.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
}
