'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, Crosshair, Eye, Target, Radar, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
    variant = 'default',
    rightContent
}: {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    count: number;
    variant?: 'default' | 'warning';
    rightContent?: React.ReactNode;
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
                    <h2 className="text-sm font-black text-white tracking-wide uppercase flex items-center gap-2">
                        {title}
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${isWarning
                            ? 'bg-rose-500/[0.08] text-rose-400 border border-rose-500/20'
                            : 'bg-white/[0.08] text-white/60 border border-white/[0.10]'
                            }`}>
                            {count}
                        </span>
                    </h2>
                    <p className="text-xs text-white/50 tracking-wider mt-0.5 font-semibold">{subtitle}</p>
                </div>
            </div>
            {rightContent && (
                <div className="hidden md:block">
                    {rightContent}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// LIVE SNIPER PLACEHOLDER (Intraday)
// =============================================================================

function LiveSniperPlaceholder({ index }: { index: number }) {
    const t = useTranslations('alphaReport');

    return (
        <div className="relative rounded-2xl border border-fuchsia-500/30 bg-[#160a1c]/80 backdrop-blur-xl h-[180px] overflow-hidden group flex flex-col items-center justify-center text-center p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(217,70,239,0.08)_0%,transparent_70%)]" />

            {/* Top-to-Bottom Data Scan Animation */}
            <div className="absolute inset-0 pointer-events-none opacity-40">
                <div className="absolute top-0 left-0 w-full h-[200%] bg-gradient-to-b from-transparent via-fuchsia-400/[0.2] to-transparent"
                    style={{ animation: `scanVertical ${3 + index * 0.5}s linear infinite` }} />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100%_4px]" />
            </div>

            <div className="relative z-10 w-12 h-12 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/20 flex items-center justify-center mb-3 group-hover:bg-fuchsia-500/30 transition-colors duration-500 shadow-[0_0_15px_rgba(217,70,239,0.3)]">
                <Radar className="w-5 h-5 text-fuchsia-300 drop-shadow-[0_0_10px_rgba(217,70,239,0.9)] animate-[spin_4s_linear_infinite]" />
            </div>

            <h3 className="relative z-10 text-sm font-black text-white tracking-widest uppercase font-jakarta mb-1 drop-shadow-md">
                {t('awaitingProtocol')}
            </h3>
            <p className="relative z-10 text-xs text-slate-300 font-semibold font-jakarta max-w-[200px]">
                {t('liveSniperChecking')}<br />
                <span className="text-fuchsia-300 font-bold block mt-1 drop-shadow-[0_0_6px_rgba(217,70,239,0.8)]">{t('liveSniperOpenTime')}</span>
            </p>
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

export default function FinalBattleSection({ items, liveItems, isLoading = false, onItemClick }: {
    items: import('./AlphaCard').AlphaCardProps[];
    liveItems?: import('./AlphaCard').AlphaCardProps[];
    isLoading?: boolean;
    onItemClick?: (item: import('./AlphaCard').AlphaCardProps) => void;
}) {
    const t = useTranslations('alphaReport');

    // New Split Strategy: Top 3 (PreMkt), Actionable 4-7 (PreMkt).
    const mainCorps = items.filter(i => i.rank <= 3);
    const coreActionable = items.filter(i => i.rank >= 4 && i.rank <= 7);

    return (
        <div className="space-y-12">

            {/* TOP PICKS (Ranks 1-3) */}
            <section>
                <SectionHeader
                    icon={Radar}
                    title={t('topPicks')}
                    subtitle={t('topPicksSubtitle')}
                    count={mainCorps.length}
                    variant="warning"
                    rightContent={
                        <span className="text-xs text-slate-300 font-medium font-jakarta tracking-wide">
                            {t('disclaimer')}
                        </span>
                    }
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

            {/* LIVE TACTICAL (Intraday Slots 1-3) */}
            <section className="relative p-6 md:p-8 rounded-3xl bg-fuchsia-950/20 border border-fuchsia-500/20 shadow-[0_0_40px_rgba(217,70,239,0.06)] overflow-hidden my-12">
                {/* Background Glow for container */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-fuchsia-400/60 to-transparent" />

                <div className="flex items-center justify-between mb-8 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center border backdrop-blur-sm bg-fuchsia-500/[0.15] border-fuchsia-400/40 shadow-[0_0_20px_rgba(217,70,239,0.25)]">
                            <Target className="w-5 h-5 text-fuchsia-300" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-fuchsia-300 tracking-widest uppercase flex items-center gap-2 font-jakarta text-shadow-sm">
                                {t('liveTactical')}
                                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-fuchsia-500/[0.15] text-fuchsia-200 border border-fuchsia-400/40">
                                    3
                                </span>
                            </h2>
                            <p className="text-xs text-fuchsia-200/70 tracking-wider mt-0.5 font-semibold font-jakarta">
                                {t('liveTacticalSubtitle')}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 relative z-10">
                    {liveItems && liveItems.length > 0 ? (
                        liveItems.slice(0, 3).map((item) => (
                            <motion.div
                                key={item.ticker}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: item.rank * 0.1, duration: 0.5, ease: 'easeOut' }}
                            >
                                <AlphaCardCompact
                                    {...item}
                                    onClick={() => onItemClick?.(item)}
                                />
                            </motion.div>
                        ))
                    ) : (
                        [1, 2, 3].map((idx) => (
                            <LiveSniperPlaceholder key={idx} index={idx} />
                        ))
                    )}
                </div>
            </section>

            {/* ACTIONABLE (Ranks 4-7) */}
            {coreActionable.length > 0 && (
                <section>
                    <SectionHeader
                        icon={Shield}
                        title={t('actionable')}
                        subtitle={t('actionableSubtitle')}
                        count={coreActionable.length}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {isLoading ? (
                            [1, 2, 3, 4].map(i => <CardSkeleton key={i} variant="compact" />)
                        ) : (
                            coreActionable.map((item) => (
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
            )}

            {/* Empty State */}
            {!isLoading && items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center border border-white/5 rounded-2xl bg-[#0a0f1c]/50">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4 backdrop-blur-sm">
                        <Shield className="w-7 h-7 text-white/20" />
                    </div>
                    <h3 className="text-lg font-black text-white/40 mb-1 font-jakarta uppercase tracking-wider">No Alpha Detected</h3>
                    <p className="text-sm text-white/30 max-w-sm font-medium font-jakarta">
                        시장을 스캔 중입니다. 확률이 높은 셋업이 발견되면 신호가 발생합니다.
                    </p>
                </div>
            )}

        </div>
    );
}
