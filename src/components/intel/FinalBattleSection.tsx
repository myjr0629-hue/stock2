'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, Crosshair, Eye, type LucideIcon } from 'lucide-react';
import { AlphaCard, AlphaCardCompact } from './AlphaCard';

// =============================================================================
// TYPES
// =============================================================================

export interface AlphaItem {
    ticker: string;
    rank: number;
    price: number;
    changePct: number;
    volume?: number;
    alphaScore: number;
    scoreBreakdown?: {
        momentum: number;
        options: number;
        structure: number;
        regime: number;
        risk: number;
    };
    entryLow?: number;
    entryHigh?: number;
    targetPrice?: number;
    cutPrice?: number;
    whaleNetM?: number;
    callWall?: number;
    putFloor?: number;
    isLive?: boolean;
}

interface FinalBattleSectionProps {
    items: AlphaItem[];
    isLoading?: boolean;
    onItemClick?: (item: AlphaItem) => void;
}

// =============================================================================
// SECTION HEADER
// =============================================================================

function SectionHeader({
    icon: Icon,
    title,
    subtitle,
    count,
    variant = 'default'
}: {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    count: number;
    variant?: 'default' | 'warning';
}) {
    const iconColor = variant === 'warning' ? 'text-rose-400' : 'text-cyan-400';
    const bgColor = variant === 'warning' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-cyan-500/10 border-cyan-500/20';
    const badgeColor = variant === 'warning' ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/20 text-cyan-400';

    return (
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${bgColor}`}>
                    <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <div>
                    <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                        {title}
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${badgeColor}`}>
                            {count}
                        </span>
                    </h2>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{subtitle}</p>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function CardSkeleton({ variant = 'large' }: { variant?: 'large' | 'compact' }) {
    return (
        <div className={`rounded-xl border border-white/5 bg-slate-900/50 animate-pulse ${variant === 'large' ? 'h-[420px]' : 'h-[320px]'}`}>
            <div className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-xl bg-slate-800" />
                        <div className="space-y-2">
                            <div className="h-6 w-20 bg-slate-800 rounded" />
                            <div className="h-8 w-32 bg-slate-800 rounded" />
                        </div>
                    </div>
                    <div className="w-[92px] h-[92px] rounded-full bg-slate-800" />
                </div>
                <div className="h-6 w-24 bg-slate-800 rounded" />
                <div className="space-y-2 py-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-2 bg-slate-800 rounded-full" />
                    ))}
                </div>
                <div className="h-12 bg-slate-800 rounded-lg" />
                <div className="h-12 bg-slate-800 rounded-lg" />
            </div>
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function FinalBattleSection({ items, isLoading = false, onItemClick }: FinalBattleSectionProps) {
    const mainCorps = items.filter(i => i.rank <= 3);
    const core12 = items.filter(i => i.rank >= 4 && i.rank <= 10);
    const moonshot = items.filter(i => i.rank >= 11);

    return (
        <div className="space-y-12">

            {/* MAIN CORPS (Top 3) */}
            <section>
                <SectionHeader
                    icon={Crosshair}
                    title="MAIN CORPS"
                    subtitle="Data Verified • High Probability"
                    count={mainCorps.length}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {isLoading ? (
                        [1, 2, 3].map(i => <CardSkeleton key={i} variant="large" />)
                    ) : (
                        mainCorps.map((item) => (
                            <motion.div
                                key={item.ticker}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: item.rank * 0.1 }}
                            >
                                <AlphaCard
                                    ticker={item.ticker}
                                    rank={item.rank}
                                    price={item.price}
                                    changePct={item.changePct}
                                    volume={item.volume}
                                    alphaScore={item.alphaScore}
                                    entryLow={item.entryLow}
                                    entryHigh={item.entryHigh}
                                    targetPrice={item.targetPrice}
                                    cutPrice={item.cutPrice}
                                    whaleNetM={item.whaleNetM}
                                    callWall={item.callWall}
                                    putFloor={item.putFloor}
                                    isLive={item.isLive}
                                    variant="hero"
                                    onClick={() => onItemClick?.(item)}
                                />
                            </motion.div>
                        ))
                    )}
                </div>
            </section>

            {/* CORE ALPHA (Ranks 4-10) */}
            <section>
                <SectionHeader
                    icon={Eye}
                    title="CORE ALPHA"
                    subtitle="Strong Signals • Watch Zone"
                    count={core12.length}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {isLoading ? (
                        [1, 2, 3, 4, 5, 6, 7].map(i => <CardSkeleton key={i} variant="compact" />)
                    ) : (
                        core12.map((item) => (
                            <motion.div
                                key={item.ticker}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: item.rank * 0.05 }}
                            >
                                <AlphaCardCompact
                                    ticker={item.ticker}
                                    rank={item.rank}
                                    price={item.price}
                                    changePct={item.changePct}
                                    volume={item.volume}
                                    alphaScore={item.alphaScore}
                                    entryLow={item.entryLow}
                                    entryHigh={item.entryHigh}
                                    targetPrice={item.targetPrice}
                                    cutPrice={item.cutPrice}
                                    whaleNetM={item.whaleNetM}
                                    callWall={item.callWall}
                                    putFloor={item.putFloor}
                                    isLive={item.isLive}
                                    onClick={() => onItemClick?.(item)}
                                />
                            </motion.div>
                        ))
                    )}
                </div>
            </section>

            {/* MOONSHOT ZONE (Ranks 11+) */}
            {moonshot.length > 0 && (
                <section>
                    <SectionHeader
                        icon={AlertTriangle}
                        title="MOONSHOT ZONE"
                        subtitle="High Risk • Gamma Play"
                        count={moonshot.length}
                        variant="warning"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {moonshot.map((item) => (
                            <motion.div
                                key={item.ticker}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: item.rank * 0.1 }}
                            >
                                <AlphaCard
                                    ticker={item.ticker}
                                    rank={item.rank}
                                    price={item.price}
                                    changePct={item.changePct}
                                    volume={item.volume}
                                    alphaScore={item.alphaScore}
                                    entryLow={item.entryLow}
                                    entryHigh={item.entryHigh}
                                    targetPrice={item.targetPrice}
                                    cutPrice={item.cutPrice}
                                    whaleNetM={item.whaleNetM}
                                    callWall={item.callWall}
                                    putFloor={item.putFloor}
                                    isLive={item.isLive}
                                    isHighRisk={true}
                                    variant="compact"
                                    onClick={() => onItemClick?.(item)}
                                />
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}

            {/* Empty State */}
            {!isLoading && items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                        <Shield className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-300 mb-2">No Alpha Detected</h3>
                    <p className="text-sm text-slate-500 max-w-md">
                        The engine is scanning the market. Alpha signals will appear when high-probability setups are identified.
                    </p>
                </div>
            )}

        </div>
    );
}
