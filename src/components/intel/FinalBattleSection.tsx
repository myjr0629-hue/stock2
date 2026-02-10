'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, Crosshair, Eye, Target, type LucideIcon } from 'lucide-react';
import { AlphaCard, AlphaCardCompact } from './AlphaCard';

// =============================================================================
// TYPES (Re-export from AlphaCard)
// =============================================================================

export type { AlphaCardProps as AlphaItem } from './AlphaCard';

// =============================================================================
// SECTION HEADER (Premium Glassmorphism)
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
    const isWarning = variant === 'warning';

    return (
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center border backdrop-blur-sm ${isWarning
                        ? 'bg-rose-500/[0.08] border-rose-500/20'
                        : 'bg-white/[0.06] border-white/[0.10]'
                    }`}>
                    <Icon className={`w-4.5 h-4.5 ${isWarning ? 'text-rose-400' : 'text-white/60'}`} />
                </div>
                <div>
                    <h2 className="text-sm font-black text-white/90 tracking-wide uppercase flex items-center gap-2">
                        {title}
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${isWarning
                                ? 'bg-rose-500/[0.08] text-rose-400/80 border border-rose-500/15'
                                : 'bg-white/[0.06] text-white/40 border border-white/[0.08]'
                            }`}>
                            {count}
                        </span>
                    </h2>
                    <p className="text-[10px] text-white/30 tracking-wider mt-0.5">{subtitle}</p>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// LOADING SKELETON (Glassmorphic)
// =============================================================================

function CardSkeleton({ variant = 'large' }: { variant?: 'large' | 'compact' }) {
    return (
        <div className={`rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-xl animate-pulse ${variant === 'large' ? 'h-[440px]' : 'h-[380px]'
            }`}>
            <div className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.06]" />
                        <div className="w-10 h-10 rounded-xl bg-white/[0.06]" />
                        <div className="space-y-2">
                            <div className="h-4 w-16 bg-white/[0.06] rounded" />
                            <div className="h-5 w-28 bg-white/[0.06] rounded" />
                        </div>
                    </div>
                    <div className="w-14 h-14 rounded-full bg-white/[0.06]" />
                </div>
                <div className="h-16 bg-white/[0.04] rounded-xl" />
                <div className="h-8 bg-white/[0.04] rounded-xl" />
                <div className="h-20 bg-white/[0.03] rounded-xl" />
                <div className="flex gap-2">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-5 w-14 bg-white/[0.04] rounded-md" />)}
                </div>
                <div className="h-8 bg-white/[0.03] rounded-xl" />
            </div>
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function FinalBattleSection({ items, isLoading = false, onItemClick }: {
    items: import('./AlphaCard').AlphaCardProps[];
    isLoading?: boolean;
    onItemClick?: (item: import('./AlphaCard').AlphaCardProps) => void;
}) {
    const mainCorps = items.filter(i => i.rank <= 3);
    const core12 = items.filter(i => i.rank >= 4 && i.rank <= 10);
    const moonshot = items.filter(i => i.rank >= 11);

    return (
        <div className="space-y-10">

            {/* TOP PICKS (Ranks 1-3) */}
            <section>
                <SectionHeader
                    icon={Crosshair}
                    title="TOP PICKS"
                    subtitle="HIGH CONVICTION — IMMEDIATE REVIEW"
                    count={mainCorps.length}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                    {isLoading ? (
                        [1, 2, 3].map(i => <CardSkeleton key={i} variant="large" />)
                    ) : (
                        mainCorps.map((item) => (
                            <motion.div
                                key={item.ticker}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: item.rank * 0.08, duration: 0.4, ease: 'easeOut' }}
                            >
                                <AlphaCard
                                    {...item}
                                    variant="hero"
                                    onClick={() => onItemClick?.(item)}
                                />
                            </motion.div>
                        ))
                    )}
                </div>
            </section>

            {/* ACTIONABLE (Ranks 4-10) */}
            <section>
                <SectionHeader
                    icon={Target}
                    title="ACTIONABLE"
                    subtitle="CONDITIONAL ENTRY — TRIGGER STANDBY"
                    count={core12.length}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {isLoading ? (
                        [1, 2, 3, 4, 5, 6, 7].map(i => <CardSkeleton key={i} variant="compact" />)
                    ) : (
                        core12.map((item) => (
                            <motion.div
                                key={item.ticker}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: item.rank * 0.04, duration: 0.35, ease: 'easeOut' }}
                            >
                                <AlphaCardCompact
                                    {...item}
                                    onClick={() => onItemClick?.(item)}
                                />
                            </motion.div>
                        ))
                    )}
                </div>
            </section>

            {/* SPECULATIVE (Ranks 11+) */}
            {moonshot.length > 0 && (
                <section>
                    <SectionHeader
                        icon={AlertTriangle}
                        title="SPECULATIVE"
                        subtitle="HIGH RISK — SMALL POSITION ONLY"
                        count={moonshot.length}
                        variant="warning"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {moonshot.map((item) => (
                            <motion.div
                                key={item.ticker}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: item.rank * 0.08, duration: 0.4 }}
                            >
                                <AlphaCard
                                    {...item}
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
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4 backdrop-blur-sm">
                        <Shield className="w-7 h-7 text-white/20" />
                    </div>
                    <h3 className="text-lg font-bold text-white/40 mb-1">No Alpha Detected</h3>
                    <p className="text-xs text-white/20 max-w-sm">
                        The engine is scanning the market. Alpha signals will appear when high-probability setups are identified.
                    </p>
                </div>
            )}

        </div>
    );
}
