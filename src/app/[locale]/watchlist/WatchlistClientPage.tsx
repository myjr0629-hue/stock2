// Watchlist Premium v2 — 2026-03-15T00:50
'use client';

import React, { useState, useMemo, useEffect, memo, useRef, useCallback } from 'react';
import { useWatchlist, type EnrichedWatchlistItem } from '@/hooks/useWatchlist';
import { usePriceFlash, getFlashStyle, tickerDelay } from '@/components/ui/PriceDisplay';
import { useTranslations, useLocale } from 'next-intl';
import {
    Star, Plus, RefreshCw, Trash2, X, Loader2, Activity, Fish, Zap,
    Target, Shield, RefreshCcw, Crosshair, LayoutDashboard,
    ArrowUpRight, ArrowDownRight, TrendingUp, Search, BookOpen, Lock, ChevronRight,
    FolderPlus, Tag, MoreHorizontal, Edit3, ChevronDown as ChevronDownIcon
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/routing';
import { useDashboardStore } from '@/stores/dashboardStore';
import { ProGate } from '@/components/gate/FeatureGate';
import { CardTooltip, WATCHLIST_TOOLTIPS } from '@/components/ui/CardTooltip';
import { useTier } from '@/contexts/TierContext';
// [PERF] ECharts removed — CSS treemap replaces 800KB echarts bundle

// ─── TREEMAP COLOR PALETTE (Finviz-grade) ─────────────────────────────
function getTreemapColor(pct: number): string {
    if (pct >= 4)    return '#1a8a4a';
    if (pct >= 3)    return '#1e7b44';
    if (pct >= 2)    return '#216e3e';
    if (pct >= 1.5)  return '#235f37';
    if (pct >= 1)    return '#1e5230';
    if (pct >= 0.5)  return '#1a4129';
    if (pct > 0)     return '#183520';
    if (pct === 0)   return '#1e2430';
    if (pct > -0.5)  return '#351a1a';
    if (pct > -1)    return '#4d1919';
    if (pct > -1.5)  return '#621919';
    if (pct > -2)    return '#7d1a1a';
    if (pct > -3)    return '#961c1c';
    if (pct > -4)    return '#ab2020';
    return '#c02424';
}

// ─── Sort Types ──────────────────────────────────────────────────────────
type SortKey = 'default' | 'alpha' | 'change' | 'whale' | 'iv' | 'gex' | 'return3d';

// ─── MAIN PAGE ───────────────────────────────────────────────────────────
export default function WatchlistClientPage({
    locale = 'en',
    initialWatchlist,
    initialFullData
}: {
    locale?: string;
    initialWatchlist?: any[];
    initialFullData?: any[];
}) {
    const { items, loading, isRefreshing, refresh, addItem, removeItem, updateItemCategory, getCategories, addCategory, deleteCategory, customCategories: hookCategories } = useWatchlist(initialWatchlist, initialFullData);
    const [showAddModal, setShowAddModal] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('default');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const t = useTranslations('watchlist');
    const tCommon = useTranslations('common');
    const currentLocale = useLocale();
    const { tier, hasAccess } = useTier();

    // Tier-based watchlist limit: FREE=5, PRO=50, ELITE=unlimited
    const maxItems = tier === 'elite' ? 999 : tier === 'pro' ? 50 : 5;
    const isAtLimit = items.length >= maxItems;

    // ── ELITE Category System ──
    const isElite = hasAccess('elite');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [categoryMenuTicker, setCategoryMenuTicker] = useState<string | null>(null);

    const categories = useMemo(() => {
        const cats = new Set<string>();
        // From items (normalize to lowercase)
        items.forEach(item => {
            const cat = ((item as any).category || 'default').toLowerCase();
            if (cat !== 'default') {
                cats.add(cat);
            }
        });
        // From Supabase-backed custom categories (already lowercase)
        (hookCategories || []).forEach(c => cats.add(c.toLowerCase()));
        return ['all', 'default', ...Array.from(cats).sort()];
    }, [items, hookCategories]);

    const filteredItems = useMemo(() => {
        if (!isElite || activeCategory === 'all') return items;
        return items.filter(item => {
            const cat = ((item as any).category || 'default').toLowerCase();
            return cat === activeCategory.toLowerCase();
        });
    }, [items, activeCategory, isElite]);

    const sortedItems = useMemo(() => {
        if (sortKey === 'default') return filteredItems;
        const sorted = [...filteredItems].sort((a, b) => {
            switch (sortKey) {
                case 'alpha': return (b.alphaScore ?? 0) - (a.alphaScore ?? 0);
                case 'change': return b.changePct - a.changePct;
                case 'whale': return (b.whaleIndex ?? 0) - (a.whaleIndex ?? 0);
                case 'iv': return (b.iv ?? 0) - (a.iv ?? 0);
                case 'gex': return (b.gexM ?? 0) - (a.gexM ?? 0);
                case 'return3d': return (b.return3d ?? 0) - (a.return3d ?? 0);
                default: return 0;
            }
        });
        return sortDir === 'asc' ? sorted.reverse() : sorted;
    }, [filteredItems, sortKey, sortDir]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#0b1120] via-[#0d1424] to-[#0b1120] text-slate-100" data-watchlist>
            <GlobalStyles />
            {/* ── Gradient Accent Line ── */}
            <div className="h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

            {/* ── Page Header ── */}
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center shadow-lg shadow-amber-500/5">
                            <Star className="w-4.5 h-4.5 text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-wider text-white">WATCHLIST</h1>
                            <p className="text-[12px] text-amber-400/50 tracking-[0.25em] font-semibold -mt-0.5">{t('premiumMonitoring').toUpperCase()}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Link href="/how-it-works" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/25 text-xs font-bold text-slate-300 hover:text-cyan-400 hover:border-cyan-400/50 transition-all backdrop-blur-sm" style={{ boxShadow: '0 0 12px rgba(34,211,238,0.08), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                            <BookOpen className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">GUIDE</span>
                        </Link>
                        <button
                            onClick={() => !isAtLimit && setShowAddModal(true)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-bold transition-all duration-200 ${isAtLimit
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-amber-500/15 to-orange-500/10 border-amber-500/20 text-amber-400 hover:from-amber-500/25 hover:to-orange-500/20 hover:border-amber-500/30'
                                }`}
                            title={isAtLimit ? `Max ${maxItems} (${tier?.toUpperCase()})` : ''}
                            style={isAtLimit ? { boxShadow: '0 0 12px rgba(244,63,94,0.2)' } : {}}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isAtLimit ? '' : tCommon('add')}</span>
                            <span className={`tabular-nums font-black ${isAtLimit ? 'text-rose-300' : 'text-slate-300'}`}>{items.length}/{maxItems >= 999 ? '∞' : maxItems}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── ELITE Category Tabs ── */}
            {isElite && !loading && items.length > 0 && (
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                        {categories.map(cat => {
                            const count = cat === 'all' ? items.length : items.filter(i => ((i as any).category || 'default').toLowerCase() === cat.toLowerCase()).length;
                            const isActive = activeCategory === cat;
                            const label = cat === 'all'
                                ? t('categoryAll')
                                : cat === 'default'
                                    ? t('categoryDefault')
                                    : cat.toUpperCase();
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-[12px] font-bold tracking-wider uppercase transition-all duration-200 whitespace-nowrap ${
                                        isActive
                                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                                            : 'border-white/[0.06] bg-white/[0.03] text-slate-300 hover:text-white hover:border-white/[0.12]'
                                    }`}
                                >
                                    {cat !== 'all' && cat !== 'default' && <Tag className="w-3 h-3" />}
                                    {label}
                                    <span className={`tabular-nums text-[12px] ${isActive ? 'text-cyan-400/70' : 'text-slate-500'}`}>{count}</span>
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setShowCategoryModal(true)}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-dashed border-white/[0.08] text-[12px] font-bold text-slate-500 hover:text-cyan-400 hover:border-cyan-500/20 transition-all duration-200 whitespace-nowrap"
                        >
                            <FolderPlus className="w-3.5 h-3.5" />
                            {t('newCategory')}
                        </button>
                    </div>
                </div>
            )}

            <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-10 space-y-5">
                {/* ── Stats Dashboard (Mockup 1) ── */}
                {!loading && items.length > 0 && <StatsBar items={items} />}

                {/* ── Analytics Row (Sector + Signal + Risk) ── */}
                {!loading && items.length > 0 && <AnalyticsRow items={items} />}

                {/* ── Sort Chips ── */}
                {!loading && items.length > 1 && (
                    <div className="flex items-center gap-2 text-[12px] flex-wrap">
                        <span className="text-slate-300 font-semibold uppercase tracking-wider">SORT</span>
                        {(['default', 'alpha', 'change', 'whale', 'iv', 'gex', 'return3d'] as SortKey[]).map(key => (
                            <button
                                key={key}
                                onClick={() => handleSort(key)}
                                className={`px-2.5 py-1 rounded-lg border transition-all duration-200 font-bold ${sortKey === key
                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                    : 'border-white/[0.06] bg-white/[0.03] text-slate-300 hover:text-white hover:border-white/[0.12]'
                                    }`}
                            >
                                {key === 'default' ? 'Default' : key === 'alpha' ? 'Score' : key === 'change' ? 'Change%'
                                    : key === 'whale' ? 'Whale' : key === 'iv' ? 'IV' : key === 'gex' ? 'GEX' : '3D'}
                                {sortKey === key && key !== 'default' && (
                                    <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Column Headers + Card List (Mockup 1 Table Layout + Mockup 2 Glass) ── */}
                {loading ? (
                    <div className="space-y-2">
                        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} index={i} />)}
                    </div>
                ) : items.length === 0 ? (
                    <EmptyState onAdd={() => setShowAddModal(true)} />
                ) : (
                    <div className="space-y-2">
                        {/* Column Headers (glassmorphism bar) — hidden on mobile */}
                        <div className="hidden md:flex items-center rounded-lg border border-white/[0.04] bg-white/[0.03] backdrop-blur-sm">
                            <div className="w-11 flex-shrink-0" />
                            <div className={`flex-1 ${GRID_COLS} px-3 py-2.5 text-[12px] font-bold text-slate-300 uppercase tracking-wider`}>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.SYMBOL.tooltip}>{t('symbol')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.PRICE.tooltip}>{t('price')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.CHART.tooltip}>{t('chart')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.SCORE.tooltip} badge={WATCHLIST_TOOLTIPS.SCORE.badge}>{t('score')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.SIGNAL.tooltip} badge={WATCHLIST_TOOLTIPS.SIGNAL.badge}>{t('signal')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.WHALE.tooltip} badge={WATCHLIST_TOOLTIPS.WHALE.badge}>{t('whaleCol')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.IV.tooltip}>{t('ivCol')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.GAMMA_FLIP.tooltip}>{t('gammaFlip')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.RETURN_3D.tooltip}>{t('return3d')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.MAX_PAIN.tooltip}>{t('maxPainCol')}</CardTooltip></div>
                                <div className="text-center"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.GEX.tooltip} badge={WATCHLIST_TOOLTIPS.GEX.badge}>{t('gex')}</CardTooltip></div>
                            </div>
                            <div className="w-[40px] flex-shrink-0" />
                        </div>
                        {/* Cards — all render immediately (no lazy loading for Sort consistency) */}
                        {sortedItems.map((item, i) => (
                            <WatchlistCard
                                key={item.ticker}
                                item={item}
                                onRemove={() => removeItem(item.ticker)}
                                locale={locale}
                                index={i}
                                isElite={isElite}
                                categories={categories.filter(c => c !== 'all')}
                                onCategoryChange={(cat) => updateItemCategory(item.ticker, cat)}
                                currentLocale={currentLocale}
                            />
                        ))}
                    </div>
                )}

                {/* ── Last Updated Footer ── */}
                {!loading && items.length > 0 && (
                    <div className="text-center text-[12px] text-slate-300 pt-2">
                        {t('autoRefresh')}
                    </div>
                )}
            </main>

            {/* ── Add Modal ── */}
            {showAddModal && (
                <AddWatchlistModal
                    onClose={() => setShowAddModal(false)}
                    onAdd={addItem}
                    existingTickers={items.map(i => i.ticker)}
                    isElite={isElite}
                    categories={categories.filter(c => c !== 'all')}
                    currentLocale={currentLocale}
                />
            )}
            {showCategoryModal && (
                <CategoryModal
                    onClose={() => setShowCategoryModal(false)}
                    categories={categories.filter(c => c !== 'all' && c !== 'default')}
                    onCreateCategory={async (name) => {
                        await addCategory(name);
                        setActiveCategory(name.toLowerCase().trim());
                        setShowCategoryModal(false);
                    }}
                    onDeleteCategory={async (name) => {
                        await deleteCategory(name);
                        if (activeCategory.toLowerCase() === name.toLowerCase()) setActiveCategory('all');
                    }}
                />
            )}
        </div>
    );
}

// ─── STATS DASHBOARD BAR (Mockup 1) ─────────────────────────────────────
function StatsBar({ items }: { items: EnrichedWatchlistItem[] }) {
    const gt = useTranslations('gate');
    const t = useTranslations('watchlist');

    const stats = useMemo(() => {
        const gainers = items.filter(i => i.changePct > 0);
        const losers = items.filter(i => i.changePct < 0);
        const alphaItems = items.filter(i => i.alphaScore !== undefined && i.alphaScore > 0);
        const avgAlpha = alphaItems.length > 0
            ? Math.round(alphaItems.reduce((s, i) => s + (i.alphaScore || 0), 0) / alphaItems.length)
            : 0;
        const avgGrade = avgAlpha >= 80 ? 'A' : avgAlpha >= 65 ? 'B' : avgAlpha >= 50 ? 'C' : 'D';
        const avgChange = items.length > 0
            ? items.reduce((s, i) => s + i.changePct, 0) / items.length
            : 0;
        // Grade distribution
        const grades = { A: 0, B: 0, C: 0, D: 0 };
        alphaItems.forEach(i => {
            const s = i.alphaScore || 0;
            if (s >= 80) grades.A++;
            else if (s >= 65) grades.B++;
            else if (s >= 50) grades.C++;
            else grades.D++;
        });
        return { total: items.length, gainers: gainers.length, losers: losers.length, avgAlpha, avgGrade, avgChange, grades, alphaCount: alphaItems.length };
    }, [items]);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* ── Total Items (Pulse Wave BG) ── */}
            <div className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4 group hover:border-white/[0.18] transition-all duration-300 shadow-lg shadow-black/10">
                <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-white tabular-nums tracking-tight">{stats.total}</span>
                    <Activity className="w-4 h-4 text-amber-400/60 -translate-y-0.5" />
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px] text-slate-300 uppercase tracking-[0.15em] font-bold">WATCHLIST</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[12px] text-slate-300 uppercase tracking-wider font-bold">AVG CHANGE</span>
                    <span className={`text-lg font-black tabular-nums ${stats.avgChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats.avgChange >= 0 ? '+' : ''}{stats.avgChange.toFixed(2)}%
                    </span>
                </div>
                <svg className="absolute right-0 top-0 w-28 h-full opacity-[0.07]" viewBox="0 0 100 60" preserveAspectRatio="none">
                    <polyline points="0,30 15,30 20,10 25,50 30,20 35,40 40,30 55,30 60,15 65,45 70,25 75,35 80,30 100,30" fill="none" stroke="#f59e0b" strokeWidth="2" />
                </svg>
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-500/[0.08] to-transparent rounded-bl-[2rem]" />
            </div>

            {/* ── Gainers / Losers (Bar Chart BG) ── */}
            <div className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4 hover:border-white/[0.18] transition-all duration-300 shadow-lg shadow-black/10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /><span className="text-xl font-black text-emerald-400 tabular-nums">{stats.gainers}</span></div>
                    <div className="w-px h-5 bg-white/[0.06]" />
                    <div className="flex items-center gap-1"><ArrowDownRight className="w-3.5 h-3.5 text-rose-400" /><span className="text-xl font-black text-rose-400 tabular-nums">{stats.losers}</span></div>
                </div>
                <div className="text-[12px] text-slate-300 uppercase tracking-[0.15em] font-bold mt-1.5">GAINERS / LOSERS</div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-800/80 overflow-hidden flex">
                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 ease-out rounded-l-full" style={{ width: `${(stats.gainers / Math.max(stats.total, 1)) * 100}%` }} />
                    <div className="bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-700 ease-out rounded-r-full ml-auto" style={{ width: `${(stats.losers / Math.max(stats.total, 1)) * 100}%` }} />
                </div>
                <svg className="absolute right-1 top-1 w-20 h-full opacity-[0.06]" viewBox="0 0 80 60">
                    <rect x="5" y="30" width="8" height="25" rx="2" fill="#34d399" />
                    <rect x="18" y="20" width="8" height="35" rx="2" fill="#34d399" />
                    <rect x="31" y="35" width="8" height="20" rx="2" fill="#fb7185" />
                    <rect x="44" y="15" width="8" height="40" rx="2" fill="#34d399" />
                    <rect x="57" y="25" width="8" height="30" rx="2" fill="#fb7185" />
                    <rect x="70" y="10" width="8" height="45" rx="2" fill="#34d399" />
                </svg>
            </div>

            {/* ── Avg Alpha (Radar Rings BG) — PRO gate ── */}
            <div className="relative rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4 hover:border-white/[0.18] transition-all duration-300 shadow-lg shadow-black/10">
                <ProGate mode="blur" compact tooltipPosition="above" fomoMessage="AVG SCORE" description={gt('descAiDeep')}>
                    <div className="flex items-center gap-3">
                        <StatsAlphaGauge score={stats.avgAlpha} grade={stats.avgGrade} />
                        <div>
                            <div className="text-xl font-black text-white tabular-nums">{stats.avgAlpha}</div>
                            <div className="text-[12px] text-slate-300 uppercase tracking-[0.15em] font-bold"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.AVG_SCORE.tooltip} badge={WATCHLIST_TOOLTIPS.AVG_SCORE.badge}>{t('avgScore').toUpperCase()}</CardTooltip></div>
                        </div>
                    </div>
                    {/* Grade Distribution */}
                    {stats.alphaCount > 0 && (
                        <div className="mt-3">
                            <div className="h-1.5 rounded-full bg-slate-800/80 overflow-hidden flex">
                                {stats.grades.A > 0 && <div className="bg-emerald-400 transition-all duration-700" style={{ width: `${(stats.grades.A / stats.alphaCount) * 100}%` }} />}
                                {stats.grades.B > 0 && <div className="bg-cyan-400 transition-all duration-700" style={{ width: `${(stats.grades.B / stats.alphaCount) * 100}%` }} />}
                                {stats.grades.C > 0 && <div className="bg-amber-400 transition-all duration-700" style={{ width: `${(stats.grades.C / stats.alphaCount) * 100}%` }} />}
                                {stats.grades.D > 0 && <div className="bg-rose-400 transition-all duration-700" style={{ width: `${(stats.grades.D / stats.alphaCount) * 100}%` }} />}
                            </div>
                            <div className="flex items-center justify-between mt-1.5 gap-1">
                                {([['A', 'text-emerald-400'], ['B', 'text-cyan-400'], ['C', 'text-amber-400'], ['D', 'text-rose-400']] as const).map(([g, c]) => (
                                    <div key={g} className="flex items-center gap-1">
                                        <span className={`text-[11px] font-black ${c}`}>{g}</span>
                                        <span className="text-[11px] font-bold tabular-nums text-slate-400">{stats.grades[g]}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </ProGate>
                <svg className="absolute right-0 top-0 w-24 h-full opacity-[0.05]" viewBox="0 0 80 80">
                    <circle cx="60" cy="40" r="12" fill="none" stroke="#22d3ee" strokeWidth="1" />
                    <circle cx="60" cy="40" r="22" fill="none" stroke="#22d3ee" strokeWidth="0.8" />
                    <circle cx="60" cy="40" r="32" fill="none" stroke="#22d3ee" strokeWidth="0.5" />
                    <line x1="60" y1="8" x2="60" y2="72" stroke="#22d3ee" strokeWidth="0.3" />
                    <line x1="28" y1="40" x2="92" y2="40" stroke="#22d3ee" strokeWidth="0.3" />
                </svg>
            </div>

            {/* ── Session Status (Clock + ET Time + Countdown) ── */}
            <SessionStatusCard />

            {/* ── Risk Summary (compact) ── */}
            <div className="hidden lg:block relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4 hover:border-white/[0.18] transition-all duration-300 shadow-lg shadow-black/10">
                <div className="text-[12px] text-slate-300 uppercase tracking-[0.15em] font-bold mb-2.5"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.RISK_SUMMARY.tooltip}>{t('riskSummary')}</CardTooltip></div>
                <RiskSummaryCompact items={items} />
            </div>
        </div>
    );
}

// [PERF] SessionStatusCard — isolated 1s timer, won't cascade re-render to StatsBar/parent
function SessionStatusCard() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const etInfo = useMemo(() => {
        const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const etDateStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
        const etParts = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
        const h = parseInt(etParts[0]), m = parseInt(etParts[1]);
        const mins = h * 60 + m;
        const etDow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
        const isWeekend = etDow === 0 || etDow === 6;
        let session: string, nextLabel: string, countdown: string;
        if (isWeekend) {
            session = 'closed'; nextLabel = 'Pre-Market opens';
            const daysToMon = etDow === 0 ? 1 : 2;
            const minsToOpen = daysToMon * 24 * 60 + (240 - mins);
            const dH = Math.floor(minsToOpen / 60);
            countdown = dH > 24 ? `${Math.floor(dH / 24)}d ${dH % 24}h` : `${dH}h ${minsToOpen % 60}m`;
        } else if (mins < 240) {
            session = 'closed'; nextLabel = 'Pre-Market opens';
            const diff = 240 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        } else if (mins < 570) {
            session = 'pre'; nextLabel = 'Regular opens';
            const diff = 570 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        } else if (mins < 960) {
            session = 'reg'; nextLabel = 'Market closes';
            const diff = 960 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        } else if (mins < 1200) {
            session = 'post'; nextLabel = 'Post closes';
            const diff = 1200 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        } else {
            session = 'closed'; nextLabel = 'Pre-Market opens';
            const diff = 24 * 60 + 240 - mins; countdown = `${Math.floor(diff / 60)}h ${diff % 60}m`;
        }
        return { etStr, etDateStr, session, nextLabel, countdown };
    }, [now]);

    const sc = etInfo.session === 'reg' ? 'emerald' : etInfo.session === 'pre' ? 'cyan' : etInfo.session === 'post' ? 'amber' : 'slate';

    return (
        <div className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4 hover:border-white/[0.18] transition-all duration-300 shadow-lg shadow-black/10">
            <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full shadow-lg flex-shrink-0 ${sc === 'emerald' ? 'bg-emerald-400 shadow-emerald-400/40 animate-pulse' :
                    sc === 'cyan' ? 'bg-cyan-400 shadow-cyan-400/40 animate-pulse' :
                        sc === 'amber' ? 'bg-amber-400 shadow-amber-400/40 animate-pulse' : 'bg-slate-600'
                    }`} />
                <span className="text-sm font-black text-white uppercase tracking-wide leading-none">
                    {etInfo.session === 'reg' ? 'REGULAR' : etInfo.session === 'pre' ? 'PRE-MARKET' : etInfo.session === 'post' ? 'POST-MARKET' : 'CLOSED'}
                </span>
            </div>
            <div className="text-[13px] font-bold tabular-nums text-white/90 mt-1.5">{etInfo.etStr} <span className="text-xs text-slate-300 font-bold">ET</span></div>
            <div className="text-xs text-white tabular-nums">{etInfo.etDateStr}</div>
            <div className="mt-1 flex items-center gap-1.5">
                <span className={`text-xs font-bold ${sc === 'emerald' ? 'text-emerald-400' : sc === 'cyan' ? 'text-cyan-400' : sc === 'amber' ? 'text-amber-400' : 'text-slate-400'
                    }`}>{etInfo.nextLabel}</span>
                <span className="text-xs font-black tabular-nums text-white/90">{etInfo.countdown}</span>
            </div>
            <svg className="absolute right-1 top-1 w-16 h-16 opacity-[0.05] text-white" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="25" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <line x1="30" y1="30" x2="30" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="30" y1="30" x2="42" y2="30" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <circle cx="30" cy="30" r="2" fill="currentColor" />
            </svg>
        </div>
    );
}

function StatsAlphaGauge({ score, grade }: { score: number; grade: string }) {
    const circumference = 2 * Math.PI * 15;
    const offset = circumference - (score / 100) * circumference;
    const color = grade === 'A' ? 'stroke-emerald-400 text-emerald-400' :
        grade === 'B' ? 'stroke-cyan-400 text-cyan-400' :
            grade === 'C' ? 'stroke-amber-400 text-amber-400' : 'stroke-rose-400 text-rose-400';

    return (
        <div className="relative w-11 h-11 flex-shrink-0">
            <svg className="w-11 h-11 -rotate-90">
                <circle cx="22" cy="22" r="15" fill="none" stroke="#1e293b" strokeWidth="3" />
                <circle cx="22" cy="22" r="15" fill="none" className={color} strokeWidth="3"
                    strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
            </svg>
            <div className={`absolute inset-0 flex items-center justify-center text-xs font-black ${color}`}>
                {grade}
            </div>
        </div>
    );
}

function RiskSummaryCompact({ items }: { items: EnrichedWatchlistItem[] }) {
    const analytics = useMemo(() => {
        const ivItems = items.filter(i => i.iv !== undefined && i.iv !== null);
        const avgIV = ivItems.length > 0 ? ivItems.reduce((s, i) => s + (i.iv || 0), 0) / ivItems.length : 0;
        const gexItems = items.filter(i => i.gexM !== undefined && i.gexM !== null);
        const longGammaRatio = gexItems.length > 0 ? gexItems.filter(i => (i.gexM || 0) > 0).length / gexItems.length : 0;
        const mpItems = items.filter(i => i.maxPainDist !== undefined && i.maxPainDist !== null);
        const nearMPRatio = mpItems.length > 0 ? mpItems.filter(i => Math.abs(i.maxPainDist || 0) < 3).length / mpItems.length : 0;
        return { avgIV, longGammaRatio, nearMPRatio };
    }, [items]);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-300">IV Avg</span>
                <div className="flex items-center gap-2">
                    <div className="w-14 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${analytics.avgIV >= 50 ? 'bg-rose-400' : analytics.avgIV >= 30 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.min(analytics.avgIV, 100)}%` }} />
                    </div>
                    <span className={`text-[12px] font-black tabular-nums ${analytics.avgIV >= 50 ? 'text-rose-400' : analytics.avgIV >= 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {analytics.avgIV.toFixed(0)}%
                    </span>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-300">GEX Long</span>
                <div className="flex items-center gap-2">
                    <div className="w-14 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                            style={{ width: `${analytics.longGammaRatio * 100}%` }} />
                    </div>
                    <span className="text-[12px] font-black tabular-nums text-emerald-400">
                        {(analytics.longGammaRatio * 100).toFixed(0)}%
                    </span>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-300">MP ±3%</span>
                <div className="flex items-center gap-2">
                    <div className="w-14 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-400 transition-all duration-700"
                            style={{ width: `${analytics.nearMPRatio * 100}%` }} />
                    </div>
                    <span className="text-[12px] font-black tabular-nums text-cyan-400">
                        {(analytics.nearMPRatio * 100).toFixed(0)}%
                    </span>
                </div>
            </div>
        </div>
    );
}

// ─── SQUARIFY TREEMAP (Pure CSS — replaces 800KB ECharts) ────────────────
interface SquarifyRect {
    x: number; y: number; w: number; h: number;
    ticker: string; changePct: number; price: number;
}

function squarifyLayout(
    items: { ticker: string; value: number; changePct: number; price: number }[],
    W: number, H: number
): SquarifyRect[] {
    if (items.length === 0 || W <= 0 || H <= 0) return [];
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const totalValue = sorted.reduce((s, i) => s + i.value, 0);
    if (totalValue <= 0) return [];
    const totalArea = W * H;
    const nodes = sorted.map(i => ({ ...i, area: (i.value / totalValue) * totalArea }));
    return _layoutStrip(nodes, { x: 0, y: 0, w: W, h: H });
}

function _layoutStrip(items: any[], rect: { x: number; y: number; w: number; h: number }): SquarifyRect[] {
    if (items.length === 0) return [];
    if (items.length === 1) {
        return [{ x: rect.x, y: rect.y, w: rect.w, h: rect.h, ticker: items[0].ticker, changePct: items[0].changePct, price: items[0].price }];
    }
    const isWide = rect.w >= rect.h;
    const side = isWide ? rect.h : rect.w;
    let row: any[] = [];
    let rowArea = 0;
    let best = Infinity;
    let splitIdx = 1;
    for (let i = 0; i < items.length; i++) {
        row.push(items[i]);
        rowArea += items[i].area;
        const worst = _worstAspect(row, rowArea, side);
        if (worst <= best) { best = worst; splitIdx = i + 1; } else break;
    }
    const rowItems = items.slice(0, splitIdx);
    const remaining = items.slice(splitIdx);
    const rowTotalArea = rowItems.reduce((s, i) => s + i.area, 0);
    const rects: SquarifyRect[] = [];
    if (isWide) {
        const rowW = rowTotalArea / rect.h;
        let y = rect.y;
        for (const item of rowItems) {
            const h = item.area / rowW;
            rects.push({ x: rect.x, y, w: rowW, h, ticker: item.ticker, changePct: item.changePct, price: item.price });
            y += h;
        }
        if (remaining.length > 0) rects.push(..._layoutStrip(remaining, { x: rect.x + rowW, y: rect.y, w: rect.w - rowW, h: rect.h }));
    } else {
        const rowH = rowTotalArea / rect.w;
        let x = rect.x;
        for (const item of rowItems) {
            const w = item.area / rowH;
            rects.push({ x, y: rect.y, w, h: rowH, ticker: item.ticker, changePct: item.changePct, price: item.price });
            x += w;
        }
        if (remaining.length > 0) rects.push(..._layoutStrip(remaining, { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH }));
    }
    return rects;
}

function _worstAspect(row: any[], rowArea: number, side: number): number {
    const rowW = rowArea / side;
    let worst = 0;
    for (const item of row) {
        const h = item.area / rowW;
        worst = Math.max(worst, Math.max(rowW / h, h / rowW));
    }
    return worst;
}

const TickerHeatmap = memo(function TickerHeatmap({ items }: { items: EnrichedWatchlistItem[] }) {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 400, h: 130 });
    const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) setDims({ w: width, h: height });
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    const rects = useMemo(() => {
        if (items.length === 0) return [];
        const data = items.map(item => ({
            ticker: item.ticker,
            value: Math.max(Math.abs(item.changePct), 0.3),
            changePct: item.changePct,
            price: item.currentPrice,
        }));
        return squarifyLayout(data, dims.w, dims.h);
    }, [items, dims.w, dims.h]);

    const handleMouseMove = useCallback((e: React.MouseEvent, ticker: string) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        setHoveredTicker(ticker);
    }, []);

    const hoveredData = useMemo(() => {
        if (!hoveredTicker) return null;
        return rects.find(r => r.ticker === hoveredTicker) || null;
    }, [hoveredTicker, rects]);

    if (items.length === 0) return null;

    return (
        <div ref={containerRef} className="w-full h-full relative" style={{ minHeight: 130 }} onMouseLeave={() => setHoveredTicker(null)}>
            {rects.map(r => {
                const pct = r.changePct;
                const isHovered = hoveredTicker === r.ticker;
                // Adaptive text sizing based on tile dimensions
                const isMicro = r.w < 28 || r.h < 20;   // Too small for any text
                const isTiny = r.w < 42 || r.h < 25;     // Only ticker abbreviation
                const isSmall = r.w < 60 || r.h < 32;    // Ticker only, no %
                const tickerFontSize = r.w < 50 ? 9 : r.w < 70 ? 10 : 11;
                const pctFontSize = r.w < 70 ? 9 : 10;
                return (
                    <div
                        key={r.ticker}
                        onClick={() => router.push(`/ticker?ticker=${r.ticker}`)}
                        onMouseMove={(e) => handleMouseMove(e, r.ticker)}
                        onMouseLeave={() => setHoveredTicker(null)}
                        className="absolute cursor-pointer flex flex-col items-center justify-center overflow-hidden"
                        style={{
                            left: r.x, top: r.y, width: r.w, height: r.h,
                            backgroundColor: getTreemapColor(pct),
                            border: isHovered ? '1.5px solid rgba(148, 163, 184, 0.5)' : '1.5px solid #0d1424',
                            filter: isHovered ? 'brightness(1.35)' : 'brightness(1)',
                            transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                            zIndex: isHovered ? 20 : 1,
                            transition: 'filter 0.15s ease, transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                            boxShadow: isHovered ? '0 0 16px rgba(148, 163, 184, 0.25), 0 4px 12px rgba(0,0,0,0.4)' : 'none',
                            padding: '1px',
                        }}
                    >
                        {!isMicro && (
                            <span
                                className="text-white font-black leading-none tracking-wide pointer-events-none text-center truncate"
                                style={{
                                    fontSize: tickerFontSize,
                                    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                                    maxWidth: Math.max(r.w - 4, 0),
                                }}
                            >
                                {isTiny ? r.ticker.slice(0, 2) : isSmall ? r.ticker.slice(0, 4) : r.ticker}
                            </span>
                        )}
                        {!isSmall && (
                            <span
                                className="text-white/90 font-bold tabular-nums leading-tight mt-0.5 pointer-events-none text-center truncate"
                                style={{
                                    fontSize: pctFontSize,
                                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                    maxWidth: Math.max(r.w - 4, 0),
                                }}
                            >
                                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                            </span>
                        )}
                    </div>
                );
            })}

            {/* Premium Glassmorphism Tooltip */}
            {hoveredData && (
                <div
                    className="absolute pointer-events-none z-50"
                    style={{
                        left: Math.min(tooltipPos.x + 14, dims.w - 150),
                        top: tooltipPos.y < 60 ? tooltipPos.y + 18 : tooltipPos.y - 76,
                        animation: 'fadeSlideIn 0.1s ease-out',
                    }}
                >
                    <div className="px-3 py-2.5 rounded-xl border border-white/[0.12] shadow-2xl"
                        style={{
                            background: 'rgba(10, 14, 28, 0.92)',
                            backdropFilter: 'blur(16px)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-slate-700 to-slate-800 border border-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
                                <img loading="lazy" src={`/api/logo/${hoveredData.ticker}`} alt="" className="w-3.5 h-3.5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                            <span className="text-[13px] font-black text-white tracking-wider">{hoveredData.ticker}</span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1.5">
                            <span className="text-[13px] font-bold tabular-nums text-white/90" style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}>
                                ${hoveredData.price.toFixed(2)}
                            </span>
                            <span className={`text-[12px] font-black tabular-nums ${hoveredData.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                                style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}
                            >
                                {hoveredData.changePct >= 0 ? '+' : ''}{hoveredData.changePct.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

// ─── ANALYTICS ROW (Signal + Risk + Top Movers) ─────────────────────────
function AnalyticsRow({ items }: { items: EnrichedWatchlistItem[] }) {
    const t = useTranslations('watchlist');

    const analytics = useMemo(() => {
        // Signal distribution
        const signals: Record<string, number> = { HOLD: 0, ADD: 0, WATCH: 0, TRIM: 0 };
        items.forEach(i => { if (i.action && signals[i.action] !== undefined) signals[i.action]++; });
        const totalSignals = Object.values(signals).reduce((a, b) => a + b, 0);

        // Risk metrics
        const ivItems = items.filter(i => i.iv !== undefined && i.iv !== null);
        const avgIV = ivItems.length > 0 ? ivItems.reduce((s, i) => s + (i.iv || 0), 0) / ivItems.length : 0;
        const gexItems = items.filter(i => i.gexM !== undefined && i.gexM !== null);
        const longGammaRatio = gexItems.length > 0 ? gexItems.filter(i => (i.gexM || 0) > 0).length / gexItems.length : 0;
        const mpItems = items.filter(i => i.maxPainDist !== undefined && i.maxPainDist !== null);
        const nearMPRatio = mpItems.length > 0 ? mpItems.filter(i => Math.abs(i.maxPainDist || 0) < 3).length / mpItems.length : 0;

        // Top movers
        const sorted = [...items].filter(i => i.changePct !== 0).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
        const topMovers = sorted.slice(0, 3);

        return { signals, totalSignals, avgIV, longGammaRatio, nearMPRatio, topMovers };
    }, [items]);

    const signalColors: Record<string, string> = {
        HOLD: '#34d399', ADD: '#22d3ee', WATCH: '#fbbf24', TRIM: '#f87171',
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* ── Signal Distribution ── */}
            <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.02] backdrop-blur-xl p-4 hover:border-white/[0.12] transition-all duration-300">
                <div className="text-[12px] text-slate-300 uppercase tracking-[0.15em] font-bold mb-3"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.SIGNAL_DISTRIBUTION.tooltip}>{t('signalSummary')}</CardTooltip></div>
                <div className="flex items-center gap-5">
                    {/* Mini donut — larger */}
                    <svg width="64" height="64" className="flex-shrink-0 -rotate-90">
                        {analytics.totalSignals > 0 && (() => {
                            let offset = 0;
                            const r = 25, circ = 2 * Math.PI * r;
                            return Object.entries(analytics.signals).map(([key, val]) => {
                                const pct = val / analytics.totalSignals;
                                const dash = pct * circ;
                                const el = (
                                    <circle key={key} cx="32" cy="32" r={r} fill="none"
                                        stroke={signalColors[key]} strokeWidth="6"
                                        strokeDasharray={`${dash} ${circ - dash}`}
                                        strokeDashoffset={-offset}
                                        strokeLinecap="butt" opacity={0.85} />
                                );
                                offset += dash;
                                return el;
                            });
                        })()}
                        <circle cx="32" cy="32" r="16" fill="#0b1120" />
                        <text x="32" y="32" textAnchor="middle" dominantBaseline="central" className="rotate-90 origin-center" fill="#94a3b8" fontSize="12" fontWeight="800">{analytics.totalSignals}</text>
                    </svg>
                    {/* Labels — right side compact */}
                    <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {Object.entries(analytics.signals).map(([key, val]) => (
                            <div key={key} className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: signalColors[key] }} />
                                <span className="text-[12px] font-bold text-slate-300">{key}</span>
                                <span className="text-[13px] font-black tabular-nums text-white ml-auto">{val}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Ticker Treemap ── */}
            <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d1424] hover:border-white/[0.12] transition-all duration-300" style={{ minHeight: 130 }}>
                <TickerHeatmap items={items} />
            </div>

            {/* ── Top Movers ── */}
            <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.02] backdrop-blur-xl p-4 hover:border-white/[0.12] transition-all duration-300">
                <div className="text-[12px] text-slate-300 uppercase tracking-[0.15em] font-bold mb-3"><CardTooltip tooltip={WATCHLIST_TOOLTIPS.TOP_MOVERS.tooltip}>TOP MOVERS</CardTooltip></div>
                <div className="space-y-2">
                    {analytics.topMovers.map(item => (
                        <div key={item.ticker} className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-slate-800 to-slate-900 border border-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0">
                                <img loading="lazy" decoding="async" src={`/api/logo/${item.ticker}`} alt="" className="w-4 h-4 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                            <span className="text-[12px] font-bold text-white flex-shrink-0 w-12">{item.ticker}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${item.changePct >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                    style={{ width: `${Math.min(Math.abs(item.changePct) / 5 * 100, 100)}%` }} />
                            </div>
                            <span className={`text-[12px] font-black tabular-nums ${item.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── GRID TEMPLATE (shared between header & cards) ──────────────────────
const GRID_COLS = 'grid grid-cols-[1fr_1.4fr_0.7fr_0.9fr_1fr_0.8fr_0.8fr_1.2fr_0.7fr_1.3fr_1.3fr]';


// ─── GLASSMORPHISM TABLE-ROW CARD (Mockup 1 Layout + Mockup 2 Glass) ─────
const WatchlistCard = memo(function WatchlistCard({ item, onRemove, locale, index, isElite, categories, onCategoryChange, currentLocale }: {
    item: EnrichedWatchlistItem;
    onRemove: () => void;
    locale: string;
    index: number;
    isElite?: boolean;
    categories?: string[];
    onCategoryChange?: (category: string) => void;
    currentLocale?: string;
}) {
    const isPositive = item.changePct >= 0;
    const t = useTranslations('watchlist');
    const tCommon = useTranslations('common');
    const { hasAccess } = useTier();
    const router = useRouter();
    const [showCatMenu, setShowCatMenu] = useState(false);
    const catMenuRef = useRef<HTMLDivElement>(null);
    const toggleDashboardTicker = useDashboardStore((s) => s.toggleDashboardTicker);
    const dashboardTickers = useDashboardStore((s) => s.dashboardTickers);
    const [isInDashboard, setIsInDashboard] = useState(false);
    const pFlash = usePriceFlash(item.currentPrice, tickerDelay(item.ticker));
    const pf = getFlashStyle(pFlash);

    useEffect(() => {
        setIsInDashboard(dashboardTickers.includes(item.ticker));
    }, [dashboardTickers, item.ticker]);

    const accentBorder = isPositive ? 'border-l-emerald-500/40' : 'border-l-rose-500/40';

    return (
        <div
            className={`
                group relative rounded-2xl md:rounded-xl
                bg-gradient-to-r from-white/[0.045] via-white/[0.03] to-white/[0.02]
                backdrop-blur-xl
                border border-white/[0.08] border-l-[3px] ${accentBorder}
                hover:from-white/[0.07] hover:via-white/[0.05] hover:to-white/[0.035]
                hover:border-white/[0.12]
                hover:shadow-lg hover:shadow-black/25
                transition-all duration-300 ease-out
                shadow-md shadow-black/10
                md:m-0 m-card-stagger
            `}
            style={{ animation: `fadeSlideIn 0.4s ease-out ${index * 60}ms both`, animationDelay: `${index * 50}ms` }}
        >
            <div className="flex items-center">
                {/* BOARD Toggle */}
                <CardTooltip text={isInDashboard ? tCommon('removeFromDashboard') : tCommon('addToDashboard')}>
                <button
                    type="button"
                    onClick={() => toggleDashboardTicker(item.ticker)}
                    className={`flex-shrink-0 w-11 h-full py-4 flex items-center justify-center transition-all duration-200 border-r border-white/[0.03] ${isInDashboard
                        ? 'text-cyan-400 bg-cyan-400/[0.04]'
                        : 'text-slate-700 hover:text-cyan-400 hover:bg-cyan-400/[0.02]'
                        }`}
                >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                </button>
                </CardTooltip>

                {/* === MOBILE CARD LAYOUT (below md:) — Glassmorphism Premium === */}
                <Link
                    href={`/ticker?ticker=${item.ticker}`}
                    className="flex md:hidden flex-col gap-2.5 flex-1 px-4 py-3"
                >
                    {/* Row 1: Logo + Ticker + Price */}
                    <div className="flex items-center gap-3">
                        <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/80 border border-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0"
                            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                            <img loading="lazy" decoding="async" src={`/api/logo/${item.ticker}`} alt={item.ticker} className="w-7 h-7 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            <span className="text-[9px] font-bold text-slate-600 absolute">{item.ticker.slice(0, 2)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-black text-[17px] text-white tracking-wide leading-tight truncate">{item.ticker}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <div className={`font-black tabular-nums text-[20px] tracking-tight ${pf.color}`} style={pf.style}>
                                ${item.currentPrice.toFixed(2)}
                            </div>
                            <div className={`text-[14px] font-bold tabular-nums flex items-center justify-end gap-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? <TrendingUp className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {isPositive ? '+' : ''}{item.changePct.toFixed(2)}%
                            </div>
                        </div>
                    </div>
                    {/* Row 2: Quick Metric Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                        {/* Score pill */}
                        {item.alphaScore !== undefined && item.alphaGrade && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-black tabular-nums border whitespace-nowrap ${
                                item.alphaGrade === 'A' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                item.alphaGrade === 'B' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' :
                                item.alphaGrade === 'C' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            }`}>{item.alphaScore} {item.alphaGrade}</span>
                        )}
                        {/* Signal pill */}
                        {item.action && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-black tracking-wider border whitespace-nowrap ${
                                item.action === 'ADD' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' :
                                item.action === 'TRIM' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                item.action === 'HOLD' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            }`}>{item.action}</span>
                        )}
                        {/* 3D Return pill */}
                        {item.return3d !== undefined && item.return3d !== null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold tabular-nums border whitespace-nowrap ${
                                item.return3d >= 0 ? 'border-emerald-500/15 bg-emerald-500/5 text-emerald-400' : 'border-rose-500/15 bg-rose-500/5 text-rose-400'
                            }`}>
                                <span className="text-[9px] text-slate-500 mr-0.5">3D</span>
                                {item.return3d >= 0 ? '+' : ''}{item.return3d.toFixed(1)}%
                            </span>
                        )}
                        {/* Session pill */}
                        {(() => {
                            const etParts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
                            const etMins = parseInt(etParts[0]) * 60 + parseInt(etParts[1]);
                            const etDow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
                            const isWeekend = etDow === 0 || etDow === 6;
                            const realSession = isWeekend ? 'closed' : etMins < 240 ? 'closed' : etMins < 570 ? 'pre' : etMins < 960 ? 'reg' : etMins < 1200 ? 'post' : 'closed';
                            if (realSession === 'pre') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 whitespace-nowrap">PRE</span>;
                            if (realSession === 'post') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/20 whitespace-nowrap">POST</span>;
                            return null;
                        })()}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0 ml-auto" />
                    </div>
                </Link>

                {/* === DESKTOP GRID LAYOUT (md: and above) === */}
                <Link
                    href={`/ticker?ticker=${item.ticker}`}
                    className={`hidden md:grid flex-1 ${GRID_COLS} items-center px-3 py-3`}
                >
                    {/* Symbol */}
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img
                                loading="lazy"
                                decoding="async"
                                src={`/api/logo/${item.ticker}`}
                                alt={item.ticker}
                                className="w-6 h-6 object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <span className="text-[12px] font-bold text-slate-600 absolute">{item.ticker.slice(0, 2)}</span>
                        </div>
                        <div className="min-w-0">
                            <span className="font-black text-[13px] text-white tracking-wide truncate block">{item.ticker}</span>
                        </div>
                    </div>

                    {/* Price / Change */}
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                            <span className={`font-bold tabular-nums text-sm ${pf.color}`} style={pf.style}>${item.currentPrice.toFixed(2)}</span>
                            {(() => {
                                const etParts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
                                const etMins = parseInt(etParts[0]) * 60 + parseInt(etParts[1]);
                                const etDow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
                                const isWeekend = etDow === 0 || etDow === 6;
                                const realSession = isWeekend ? 'closed' : etMins < 240 ? 'closed' : etMins < 570 ? 'pre' : etMins < 960 ? 'reg' : etMins < 1200 ? 'post' : 'closed';
                                if (realSession === 'pre') return <span className="text-[12px] font-bold px-1 py-0.5 rounded bg-cyan-500/25 text-cyan-400">PRE</span>;
                                if (realSession === 'post') return <span className="text-[12px] font-bold px-1 py-0.5 rounded bg-amber-500/25 text-amber-400">POST</span>;
                                if (realSession === 'closed') return <span className="text-[12px] font-bold px-1 py-0.5 rounded bg-slate-500/25 text-slate-400">CLOSED</span>;
                                return null;
                            })()}
                        </div>
                        {/* Session-aware change row: REG shows changePct+VWAP, PRE/POST shows regChange+extChange */}
                        {item.extLabel && item.extChangePct !== undefined ? (
                            <div className="flex items-center justify-center gap-1 text-[13px] tabular-nums font-bold">
                                <span className={item.regChangePct !== undefined && item.regChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                    {item.regChangePct !== undefined && item.regChangePct >= 0 ? '+' : ''}{(item.regChangePct ?? 0).toFixed(2)}%
                                </span>
                                <span className={`text-[12px] font-bold ${item.extChangePct >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                                    {item.extLabel} {item.extChangePct >= 0 ? '+' : ''}{item.extChangePct.toFixed(2)}%
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-1.5 text-[13px] tabular-nums font-bold">
                                <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                                    {isPositive ? '+' : ''}{item.changePct.toFixed(2)}%
                                </span>
                                {item.vwapDist !== undefined && item.vwapDist !== null && (
                                    <span className={`opacity-90 ${item.vwapDist > 0 ? 'text-amber-400' : 'text-cyan-400'}`}>V{item.vwapDist > 0 ? '+' : ''}{item.vwapDist.toFixed(1)}%</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sparkline */}
                    <div className="flex items-center justify-center">
                        {item.sparkline && item.sparkline.length > 2 ? (
                            <Sparkline data={item.sparkline} isPositive={isPositive} />
                        ) : (
                            <div className="w-[55px] h-4 rounded bg-slate-800/30" />
                        )}
                    </div>

                    {/* Alpha — PRO gate */}
                    <div className="flex items-center justify-center">
                        {hasAccess('pro') ? (
                            <CircularAlphaGauge score={item.alphaScore} grade={item.alphaGrade} />
                        ) : (
                            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push('/pricing'); }} className="relative w-full h-10 cursor-pointer group/lock">
                                <div className="absolute inset-0 flex items-center justify-center blur-[6px] opacity-60 select-none pointer-events-none">
                                    <CircularAlphaGauge score={item.alphaScore} grade={item.alphaGrade} />
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <Lock className="w-3.5 h-3.5 text-amber-500/80 group-hover/lock:text-amber-400 transition-colors" />
                                    <span className="text-[12px] font-black tracking-wider text-amber-500/70 group-hover/lock:text-amber-400 transition-colors">PRO</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Signal — PRO gate */}
                    <div className="flex items-center justify-center">
                        {hasAccess('pro') ? (
                            <SignalBadge action={item.action} confidence={item.confidence} />
                        ) : (
                            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push('/pricing'); }} className="relative w-full h-10 cursor-pointer group/lock">
                                <div className="absolute inset-0 flex items-center justify-center blur-[6px] opacity-60 select-none pointer-events-none">
                                    <SignalBadge action={item.action} confidence={item.confidence} />
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <Lock className="w-3.5 h-3.5 text-amber-500/80 group-hover/lock:text-amber-400 transition-colors" />
                                    <span className="text-[12px] font-black tracking-wider text-amber-500/70 group-hover/lock:text-amber-400 transition-colors">PRO</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Whale — ELITE gate */}
                    <div className="flex items-center justify-center">
                        {hasAccess('elite') ? (
                            <WhaleIndicator index={item.whaleIndex} confidence={item.whaleConfidence} />
                        ) : (
                            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push('/pricing'); }} className="relative w-full h-10 cursor-pointer group/lock">
                                <div className="absolute inset-0 flex items-center justify-center blur-[6px] opacity-60 select-none pointer-events-none">
                                    <WhaleIndicator index={item.whaleIndex} confidence={item.whaleConfidence} />
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <Lock className="w-3.5 h-3.5 text-emerald-500/80 group-hover/lock:text-emerald-400 transition-colors" />
                                    <span className="text-[12px] font-black tracking-wider text-emerald-500/70 group-hover/lock:text-emerald-400 transition-colors">ELITE</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* IV — ELITE gate */}
                    <div className="flex items-center justify-center">
                        {hasAccess('elite') ? (
                            <IVIndicator value={item.iv} />
                        ) : (
                            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push('/pricing'); }} className="relative w-full h-10 cursor-pointer group/lock">
                                <div className="absolute inset-0 flex items-center justify-center blur-[6px] opacity-60 select-none pointer-events-none">
                                    <IVIndicator value={item.iv} />
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <Lock className="w-3.5 h-3.5 text-emerald-500/80 group-hover/lock:text-emerald-400 transition-colors" />
                                    <span className="text-[12px] font-black tracking-wider text-emerald-500/70 group-hover/lock:text-emerald-400 transition-colors">ELITE</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Gamma Flip — ELITE gate */}
                    <div className="flex items-center justify-center">
                        {hasAccess('elite') ? (
                            <GammaFlipIndicator value={item.gammaFlipLevel} price={item.currentPrice} gexM={item.gexM} />
                        ) : (
                            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push('/pricing'); }} className="relative w-full h-10 cursor-pointer group/lock">
                                <div className="absolute inset-0 flex items-center justify-center blur-[6px] opacity-60 select-none pointer-events-none">
                                    <GammaFlipIndicator value={item.gammaFlipLevel} price={item.currentPrice} gexM={item.gexM} />
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <Lock className="w-3.5 h-3.5 text-emerald-500/80 group-hover/lock:text-emerald-400 transition-colors" />
                                    <span className="text-[12px] font-black tracking-wider text-emerald-500/70 group-hover/lock:text-emerald-400 transition-colors">ELITE</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 3D Return — FREE (no gate) */}
                    <div className="flex items-center justify-center">
                        <Return3DIndicator value={item.return3d} />
                    </div>

                    {/* MaxPain — ELITE gate */}
                    <div className="flex items-center justify-center">
                        {hasAccess('elite') ? (
                            <MaxPainIndicator maxPain={item.maxPain} dist={item.maxPainDist} />
                        ) : (
                            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push('/pricing'); }} className="relative w-full h-10 cursor-pointer group/lock">
                                <div className="absolute inset-0 flex items-center justify-center blur-[6px] opacity-60 select-none pointer-events-none">
                                    <MaxPainIndicator maxPain={item.maxPain} dist={item.maxPainDist} />
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <Lock className="w-3.5 h-3.5 text-emerald-500/80 group-hover/lock:text-emerald-400 transition-colors" />
                                    <span className="text-[12px] font-black tracking-wider text-emerald-500/70 group-hover/lock:text-emerald-400 transition-colors">ELITE</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* GEX — ELITE gate */}
                    <div className="flex items-center justify-center">
                        {hasAccess('elite') ? (
                            <GexIndicator gexM={item.gexM} />
                        ) : (
                            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push('/pricing'); }} className="relative w-full h-10 cursor-pointer group/lock">
                                <div className="absolute inset-0 flex items-center justify-center blur-[6px] opacity-60 select-none pointer-events-none">
                                    <GexIndicator gexM={item.gexM} />
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <Lock className="w-3.5 h-3.5 text-emerald-500/80 group-hover/lock:text-emerald-400 transition-colors" />
                                    <span className="text-[12px] font-black tracking-wider text-emerald-500/70 group-hover/lock:text-emerald-400 transition-colors">ELITE</span>
                                </div>
                            </div>
                        )}
                    </div>
                </Link>

                {/* Actions — fixed width column */}
                <div className="flex-shrink-0 w-[40px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 relative" ref={catMenuRef}>
                    {isElite && categories && categories.length > 0 ? (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowCatMenu(!showCatMenu); }}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-white transition-colors"
                            >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                            {showCatMenu && (
                                <div className="absolute right-0 bottom-full mb-1 w-40 rounded-xl bg-[#0d1424]/98 backdrop-blur-2xl border border-white/10 shadow-2xl z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onCategoryChange?.(cat); setShowCatMenu(false); }}
                                            className={`w-full text-left px-3 py-2 text-[12px] font-bold transition-colors flex items-center gap-2 ${
                                                ((item as any).category || 'default').toLowerCase() === cat.toLowerCase()
                                                    ? 'text-cyan-400 bg-cyan-500/10'
                                                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                                            }`}
                                        >
                                            <Tag className="w-3 h-3" />
                                            {cat === 'default'
                                                ? t('categoryDefault')
                                                : cat.toUpperCase()}
                                        </button>
                                    ))}
                                    <div className="border-t border-white/[0.06] my-1" />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); setShowCatMenu(false); }}
                                        className="w-full text-left px-3 py-2 text-[12px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                        {tCommon('delete')}
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 transition-colors"
                            title={tCommon('delete')}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
})

// ─── SPARKLINE ───────────────────────────────────────────────────────────
const Sparkline = memo(function Sparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
    if (!data || data.length < 2) return null;
    const w = 60, h = 20, pad = 1;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
        const y = h - pad - ((v - min) / range) * (h - 2 * pad);
        return `${x},${y}`;
    }).join(' ');

    const fillPoints = `${pad},${h} ${points} ${w - pad},${h}`;
    const color = isPositive ? '#34d399' : '#f87171';

    return (
        <svg width={w} height={h} className="flex-shrink-0">
            {/* Gradient fill under the line */}
            <defs>
                <linearGradient id={`grad-${isPositive ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={fillPoints} fill={`url(#grad-${isPositive ? 'up' : 'down'})`} />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
});

// ─── INDICATOR COMPONENTS ────────────────────────────────────────────────
const CircularAlphaGauge = memo(function CircularAlphaGauge({ score, grade }: { score?: number; grade?: string }) {
    if (score === undefined) {
        return (
            <div className="w-9 h-9 rounded-full border-2 border-slate-800 flex items-center justify-center">
                <span className="text-[12px] text-slate-600 animate-pulse">—</span>
            </div>
        );
    }
    const pct = Math.min(Math.max(score, 0), 100);
    const circ = 2 * Math.PI * 13;
    const offset = circ - (pct / 100) * circ;
    const g = grade || (score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D');
    const c = g === 'A' ? 'text-emerald-400 stroke-emerald-400' :
        g === 'B' ? 'text-cyan-400 stroke-cyan-400' :
            g === 'C' ? 'text-amber-400 stroke-amber-400' : 'text-rose-400 stroke-rose-400';

    return (
        <div className="flex items-center justify-center gap-1.5">
            <div className="relative w-9 h-9">
                <svg className="w-9 h-9 -rotate-90">
                    <circle cx="18" cy="18" r="13" fill="none" stroke="#1e293b" strokeWidth="2.5" />
                    <circle cx="18" cy="18" r="13" fill="none" className={c} strokeWidth="2.5"
                        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center text-[12px] font-black ${c}`}>{g}</div>
            </div>
            <span className="text-sm font-bold tabular-nums text-white/95">{score}</span>
        </div>
    );
});

const SignalBadge = memo(function SignalBadge({ action, confidence }: { action?: string; confidence?: number }) {
    if (!action) return <span className="text-[12px] text-slate-600">—</span>;
    const cfg: Record<string, { bg: string; text: string; border: string; label: string }> = {
        'HOLD': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/25', label: 'HOLD' },
        'ADD': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/25', label: 'ADD' },
        'WATCH': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/25', label: 'WATCH' },
        'TRIM': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/25', label: 'TRIM' },
        // Compliance-safe labels from alphaEngine
        'STRONG_BULLISH': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'BULLISH' },
        'BULLISH': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/25', label: 'BULLISH' },
        'CAUTION': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/25', label: 'CAUTION' },
        'AVOID': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/25', label: 'AVOID' },
        // Backward compat for data still using old labels
        'BUY': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/25', label: 'BULLISH' },
        'STRONG_BUY': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'BULLISH' },
        'REDUCE': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/25', label: 'CAUTION' },
        'EXIT': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/25', label: 'AVOID' },
    };
    const s = cfg[action] || cfg['HOLD'];
    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${s.bg} border ${s.border}`}>
            <span className={`text-[13px] font-black ${s.text}`}>{s.label}</span>
            {confidence !== undefined && (
                <span className="text-xs font-bold tabular-nums text-slate-200">{confidence}%</span>
            )}
        </div>
    );
});

const WhaleIndicator = memo(function WhaleIndicator({ index, confidence }: { index?: number; confidence?: string }) {
    const t = useTranslations('watchlist');
    if (index === undefined || index === null) {
        return <span className="text-[12px] text-slate-600">—</span>;
    }
    const level = index >= 70 ? t('strongAccumulation') : index >= 40 ? t('attention') : t('normal');
    const color = index >= 70 ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' :
        index >= 40 ? 'text-slate-300 bg-slate-400/10 border-slate-400/20' :
            'text-slate-500 bg-slate-600/10 border-slate-600/20';

    const whaleTooltip = {
        ko: `기관 지수: ${index} — ${level}\n$150K+ 옵션 프리미엄 기반 기관 매집/분배 감지`,
        en: `Whale Index: ${index} — ${level}\nInstitutional accumulation/distribution via $150K+ option premium`,
        ja: `機関指数: ${index} — ${level}\n$150K+オプションプレミアムに基づく機関集積/分配検出`,
    };
    const whaleBadge = index >= 70 ? { ko: '★ 강한 매집', en: '★ Strong Signal', ja: '★ 強い買い集め' } : null;

    return (
        <CardTooltip tooltip={whaleTooltip} badge={whaleBadge}>
            <div className="flex items-center justify-center gap-1.5 cursor-help">
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border ${color}`}>
                    <Fish className="w-3 h-3" />
                    <span className="text-[13px] font-bold tabular-nums">{index}</span>
                </div>
            </div>
        </CardTooltip>
    );
});

const IVIndicator = memo(function IVIndicator({ value }: { value?: number }) {
    if (value === undefined || value === null) return <span className="text-[12px] text-slate-600">—</span>;
    const color = value >= 50 ? 'text-rose-400' : value <= 20 ? 'text-emerald-400' : 'text-amber-400';
    const label = value >= 50 ? 'HIGH' : value <= 20 ? 'LOW' : '';
    return (
        <div className="flex items-center justify-center gap-1" title={`IV: ${value.toFixed(0)}%`}>
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span className={`text-[13px] font-bold tabular-nums ${color}`}>{value.toFixed(0)}%</span>
            {label && <span className="text-[12px] text-white/70 font-bold">{label}</span>}
        </div>
    );
});

const GammaFlipIndicator = memo(function GammaFlipIndicator({ value, price, gexM }: { value?: number; price?: number; gexM?: number }) {
    const tInd = useTranslations('indicators');
    if (value !== undefined && value !== null && value > 0) {
        const isAbove = price ? price > value : false;
        const color = isAbove ? 'text-emerald-400' : 'text-rose-400';
        const label = isAbove ? tInd('longGamma') : tInd('shortGamma');
        const flipTooltip = {
            ko: `감마 플립: $${value.toFixed(0)} — ${label}\n현재가가 플립 레벨 ${isAbove ? '위' : '아래'}에 위치`,
            en: `Gamma Flip: $${value.toFixed(0)} — ${label}\nPrice is ${isAbove ? 'above' : 'below'} the flip level`,
            ja: `ガンマフリップ: $${value.toFixed(0)} — ${label}\n現在価格がフリップレベル${isAbove ? '上' : '下'}に位置`,
        };
        const flipBadge = isAbove
            ? { ko: '🛡️ 딜러 헤지 안정', en: '🛡️ Dealer Hedge Stable', ja: '🛡️ ディーラーヘッジ安定' }
            : { ko: '⚡ 변동성 증폭 구간', en: '⚡ Volatility Amplified', ja: '⚡ ボラティリティ増幅区間' };
        return (
            <CardTooltip tooltip={flipTooltip} badge={flipBadge}>
                <div className="flex items-center justify-center gap-1 cursor-help">
                    <RefreshCcw className="w-3 h-3 text-slate-400" />
                    <span className={`text-[13px] font-bold tabular-nums ${color}`}>${value.toFixed(0)}</span>
                </div>
            </CardTooltip>
        );
    }
    if (gexM !== undefined && gexM !== null) {
        const gexTooltip = gexM < 0
            ? { ko: 'GEX 숏 감마 — 변동성 증폭 구간', en: 'GEX Short Gamma — Volatility amplified zone', ja: 'GEXショートガンマ — ボラティリティ増幅区間' }
            : { ko: 'GEX 롱 감마 — 딜러 헤지가 시장 안정화', en: 'GEX Long Gamma — Dealer hedging stabilizes market', ja: 'GEXロングガンマ — ディーラーヘッジが市場安定化' };
        const gexBadge = gexM < 0
            ? { ko: '⚡ 숏 감마', en: '⚡ Short Gamma', ja: '⚡ ショートガンマ' }
            : { ko: '🛡️ 롱 감마', en: '🛡️ Long Gamma', ja: '🛡️ ロングガンマ' };
        const badge = gexM < 0
            ? <span className="text-[12px] font-bold px-1.5 py-0.5 rounded bg-rose-600/70 text-white">SHORT</span>
            : <span className="text-[12px] font-bold px-1.5 py-0.5 rounded bg-emerald-600/70 text-white">LONG</span>;
        return (
            <CardTooltip tooltip={gexTooltip} badge={gexBadge}>
                <div className="flex items-center justify-center gap-1 cursor-help">
                    <RefreshCcw className="w-3 h-3 text-slate-600" />
                    {badge}
                </div>
            </CardTooltip>
        );
    }
    return <span className="text-[12px] text-slate-600">—</span>;
});

const Return3DIndicator = memo(function Return3DIndicator({ value }: { value?: number }) {
    if (value === undefined || value === null) return <span className="text-[12px] text-slate-600">—</span>;
    const color = value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-white/60';
    return (
        <div className="flex items-center justify-center gap-1" title="3D Return">
            <TrendingUp className="w-3 h-3 text-slate-400" />
            <span className={`text-[13px] font-bold tabular-nums ${color}`}>
                {value > 0 ? '+' : ''}{value.toFixed(1)}%
            </span>
            <span className="text-[12px] text-white/70 font-bold">3D</span>
        </div>
    );
});

const MaxPainIndicator = memo(function MaxPainIndicator({ maxPain, dist }: { maxPain?: number; dist?: number }) {
    if (dist === undefined || dist === null) return <span className="text-[12px] text-slate-600">—</span>;
    const color = dist > 0 ? 'text-emerald-400' : dist < 0 ? 'text-rose-400' : 'text-white/60';
    const arrow = dist > 0 ? '↑' : dist < 0 ? '↓' : '→';
    return (
        <div className="flex items-center justify-center gap-1" title={`Max Pain: $${maxPain?.toFixed(0)}`}>
            <Crosshair className="w-3 h-3 text-slate-400" />
            {maxPain && <span className="text-[13px] tabular-nums font-bold text-white/90">${maxPain.toFixed(0)}</span>}
            <span className={`text-xs font-bold ${color}`}>{arrow}{dist > 0 ? '+' : ''}{dist.toFixed(1)}%</span>
        </div>
    );
});

const GexIndicator = memo(function GexIndicator({ gexM }: { gexM?: number }) {
    if (gexM === undefined || gexM === null) {
        return (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md border text-[12px] font-bold text-slate-500 bg-slate-600/10 border-slate-700/30">
                <span>FLAT</span>
            </div>
        );
    }
    const color = gexM > 0
        ? 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20'
        : gexM < 0
            ? 'text-rose-400 bg-rose-400/10 border-rose-500/20'
            : 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    const label = gexM > 0 ? 'LONG' : gexM < 0 ? 'SHORT' : 'FLAT';
    const val = Math.abs(gexM) >= 1 ? `${gexM.toFixed(1)}M` : `${Math.abs(gexM * 1000).toFixed(0)}K`;
    return (
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold ${color}`} title={`GEX: ${gexM}M`}>
            {gexM > 0 ? <Shield className="w-3 h-3" /> : gexM < 0 ? <Zap className="w-3 h-3" /> : null}
            <span>{label}</span>
            <span className="tabular-nums opacity-90">{val}</span>
        </div>
    );
});

// ─── SKELETON CARD ───────────────────────────────────────────────────────
function SkeletonCard({ index }: { index: number }) {
    return (
        <div
            className="flex items-center rounded-xl border border-white/[0.06] bg-gradient-to-r from-white/[0.04] to-white/[0.02] backdrop-blur-xl animate-pulse shadow-md shadow-black/10"
            style={{ animationDelay: `${index * 100}ms` }}
        >
            <div className="w-11 flex-shrink-0 py-4 flex justify-center">
                <div className="w-4 h-4 rounded bg-slate-800/40" />
            </div>
            <div className={`flex-1 ${GRID_COLS} items-center px-3 py-3`}>
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-slate-800/50" />
                    <div className="space-y-1.5">
                        <div className="h-3.5 w-12 bg-slate-800/50 rounded" />
                        <div className="h-2.5 w-16 bg-slate-800/30 rounded" />
                    </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <div className="h-3.5 w-14 bg-slate-800/50 rounded" />
                    <div className="h-2.5 w-10 bg-slate-800/30 rounded" />
                </div>
                <div className="flex justify-center"><div className="w-[55px] h-4 bg-slate-800/30 rounded" /></div>
                <div className="flex justify-center"><div className="w-9 h-9 rounded-full bg-slate-800/40" /></div>
                <div className="flex justify-center"><div className="h-6 w-16 bg-slate-800/40 rounded-lg" /></div>
                <div className="flex justify-center"><div className="h-5 w-12 bg-slate-800/30 rounded" /></div>
                <div className="flex justify-center"><div className="h-4 w-8 bg-slate-800/30 rounded" /></div>
                <div className="flex justify-center"><div className="h-5 w-14 bg-slate-800/30 rounded" /></div>
                <div className="flex justify-center"><div className="h-4 w-10 bg-slate-800/30 rounded" /></div>
                <div className="flex justify-center"><div className="h-4 w-12 bg-slate-800/30 rounded" /></div>
                <div className="flex justify-center"><div className="h-5 w-14 bg-slate-800/30 rounded-md" /></div>
            </div>
        </div>
    );
}

// ─── EMPTY STATE ─────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
    const t = useTranslations('watchlist');
    return (
        <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl py-20 text-center shadow-lg shadow-black/10">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/10 flex items-center justify-center">
                <Star className="w-7 h-7 text-slate-600" />
            </div>
            <p className="text-slate-400 font-semibold mb-1">{t('noWatchlist')}</p>
            <p className="text-slate-600 text-xs mb-5">{t('startMonitoring')}</p>
            <button
                onClick={onAdd}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/15 border border-amber-500/20 text-amber-400 font-bold text-sm hover:from-amber-500/30 hover:to-orange-500/25 transition-all duration-200"
            >
                <Plus className="w-4 h-4" />
                {t('addFirstItem')}
            </button>
        </div>
    );
}

// ─── ADD MODAL ───────────────────────────────────────────────────────────
function AddWatchlistModal({ onClose, onAdd, existingTickers = [], isElite, categories, currentLocale }: {
    onClose: () => void;
    onAdd: (ticker: string, name: string, category?: string) => Promise<void>;
    existingTickers?: string[];
    isElite?: boolean;
    categories?: string[];
    currentLocale?: string;
}) {
    const [ticker, setTicker] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [validated, setValidated] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('default');
    const t = useTranslations('watchlist');
    const tCommon = useTranslations('common');
    const gt = useTranslations('gate');

    const isDuplicate = ticker.length > 0 && existingTickers.includes(ticker.toUpperCase());

    const fetchTickerInfo = async (tickerInput: string) => {
        if (!tickerInput || tickerInput.length < 1) {
            setCompanyName(''); setValidated(false); setError(''); return;
        }
        setLoading(true); setError('');
        try {
            const res = await fetch(`/api/stock?symbol=${tickerInput.toUpperCase()}`);
            if (!res.ok) throw new Error('Ticker not found');
            const data = await res.json();
            setCompanyName(data.name || data.shortName || tickerInput.toUpperCase());
            setValidated(true);
        } catch {
            setError(t('invalidTicker')); setCompanyName(''); setValidated(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (ticker.length >= 1) fetchTickerInfo(ticker);
        }, 500);
        return () => clearTimeout(timeout);
    }, [ticker]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ticker || !validated || loading) return;
        setLoading(true);
        try {
            await onAdd(ticker.toUpperCase(), companyName || ticker.toUpperCase(), isElite ? selectedCategory : undefined);
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const popularTickers = ['AAPL', 'TSLA', 'NVDA', 'GOOGL', 'MSFT', 'AMZN', 'META'];

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="relative rounded-2xl overflow-hidden max-w-[380px] w-full"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'modalIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}
            >
                {/* Background layers */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#111827] via-[#0f1521] to-[#0b1018] rounded-2xl" />
                <div className="absolute inset-0 rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset' }} />
                <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/[0.07] rounded-full blur-[60px] pointer-events-none" />

                <div className="relative p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(234,88,12,0.08))', border: '1px solid rgba(245,158,11,0.2)', boxShadow: '0 0 20px rgba(245,158,11,0.08)' }}>
                                <Crosshair className="w-4.5 h-4.5 text-amber-400" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-black text-white tracking-wide">{t('addToWatchlist')}</h2>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5">{t('addToWatchlistDesc')}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-white transition-all duration-200"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Input */}
                        <div>
                            <div className="relative">
                                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600">
                                    <Search className="w-4 h-4" />
                                </div>
                                <input
                                    type="text"
                                    value={ticker}
                                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                    placeholder="NVDA, AAPL, TSLA..."
                                    className="w-full rounded-xl pl-10 pr-10 py-3 text-white text-sm font-bold uppercase tracking-widest placeholder:text-slate-600 placeholder:font-normal placeholder:tracking-normal placeholder:normal-case focus:outline-none transition-all duration-200"
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: error ? '1px solid rgba(244,63,94,0.4)' : validated ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
                                        boxShadow: error ? '0 0 16px rgba(244,63,94,0.08) inset' : validated ? '0 0 16px rgba(16,185,129,0.06) inset' : '0 0 12px rgba(0,0,0,0.2) inset',
                                    }}
                                    autoFocus
                                />
                                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                                    {loading && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
                                    {validated && !loading && (
                                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                                            <span className="text-emerald-400 text-[12px] font-black">✓</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {error && <p className="text-rose-400 text-[11px] mt-1.5 flex items-center gap-1.5 font-medium"><span className="w-1 h-1 rounded-full bg-rose-400" /> {error}</p>}
                            {isDuplicate && !error && (
                                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                                    <div className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                                    <span className="text-amber-400/90 text-[11px] font-semibold">{t('duplicateWarning', { ticker: ticker.toUpperCase() })}</span>
                                </div>
                            )}
                        </div>

                        {/* Company preview card */}
                        {companyName && !error && (
                            <div className="flex items-center gap-3 p-3.5 rounded-xl transition-all duration-300" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                                    <img loading="lazy" decoding="async" src={`/api/logo/${ticker}`} alt={ticker} className="w-6 h-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[13px] text-white font-bold truncate">{companyName}</div>
                                    <div className="text-[11px] text-slate-500 font-bold tracking-[0.15em]">{ticker.toUpperCase()}</div>
                                </div>
                                <div className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ color: 'rgba(52,211,153,0.9)', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.12)' }}>{t('ready')}</div>
                            </div>
                        )}

                        {/* Quick picks */}
                        {!validated && (
                            <div>
                                <div className="text-[12px] text-slate-300 uppercase tracking-widest font-bold mb-2">{t('popular')}</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {popularTickers.map(tk => (
                                        <button
                                            key={tk}
                                            type="button"
                                            onClick={() => setTicker(tk)}
                                            className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[12px] text-slate-400 font-bold hover:bg-white/[0.08] hover:text-white hover:border-white/[0.12] transition-all duration-200 tracking-wide"
                                        >
                                            {tk}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Category selector (ELITE only) */}
                        {isElite && categories && categories.length > 1 && validated && (
                            <div>
                                <div className="text-[12px] text-slate-300 uppercase tracking-widest font-bold mb-2">
                                    {t('category')}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => setSelectedCategory(cat)}
                                            className={`px-2.5 py-1 rounded-lg border text-[12px] font-bold transition-all duration-200 ${
                                                selectedCategory === cat
                                                    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                                                    : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.08] hover:text-white hover:border-white/[0.12]'
                                            }`}
                                        >
                                            {cat === 'default'
                                                ? t('categoryDefault')
                                                : cat.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 text-slate-400 hover:text-slate-200"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                                {tCommon('cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={!validated || loading || isDuplicate}
                                className="flex-[1.4] px-4 py-2.5 rounded-xl text-[13px] font-black text-white flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed"
                                style={{
                                    background: (!validated || loading || isDuplicate) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, rgba(245,158,11,0.9), rgba(234,88,12,0.85))',
                                    border: '1px solid rgba(245,158,11,0.25)',
                                    boxShadow: (!validated || loading || isDuplicate) ? 'none' : '0 4px 20px rgba(245,158,11,0.2), 0 0 0 1px rgba(245,158,11,0.1) inset',
                                }}
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4" />
                                        {tCommon('add')}
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

// ─── CONDITION BADGE (HOT / WHALE / SHIELD) ──────────────────────────────
const ConditionBadge = memo(function ConditionBadge({ item }: { item: EnrichedWatchlistItem }) {
    const badges: { label: string; color: string; bg: string }[] = [];
    if (item.return3d !== undefined && item.return3d > 5) {
        badges.push({ label: '🔥', color: 'text-orange-300', bg: 'bg-orange-500/15' });
    }
    if (item.whaleIndex !== undefined && item.whaleIndex >= 70) {
        badges.push({ label: '🐋', color: 'text-amber-300', bg: 'bg-amber-500/15' });
    }
    if (item.gexM !== undefined && item.gexM > 0) {
        badges.push({ label: '🛡️', color: 'text-emerald-300', bg: 'bg-emerald-500/15' });
    }
    if (badges.length === 0) return null;
    return (
        <div className="flex items-center gap-0.5">
            {badges.map((b, i) => (
                <span key={i} className={`text-[12px] leading-none ${b.color} ${b.bg} rounded px-0.5`}>{b.label}</span>
            ))}
        </div>
    );
});

// ─── CATEGORY MODAL ──────────────────────────────────────────────────────
function CategoryModal({ onClose, categories: initialCategories, onCreateCategory, onDeleteCategory }: {
    onClose: () => void;
    categories: string[];
    onCreateCategory: (name: string) => void;
    onDeleteCategory: (name: string) => void;
}) {
    const [newCatName, setNewCatName] = useState('');
    const [localCategories, setLocalCategories] = useState(initialCategories);
    const [deletingCat, setDeletingCat] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const t = useTranslations('watchlist');
    const tCommon = useTranslations('common');

    // Sync with parent
    useEffect(() => { setLocalCategories(initialCategories); }, [initialCategories]);

    const handleCreate = () => {
        const name = newCatName.trim().toLowerCase().replace(/\s+/g, '-');
        if (name && !localCategories.includes(name)) {
            setLocalCategories(prev => [...prev, name]);
            onCreateCategory(name);
            setNewCatName('');
            setMessage(t('categoryCreated', { name: name.toUpperCase() }));
            setTimeout(() => setMessage(null), 2000);
        }
    };

    const handleDelete = async (cat: string) => {
        setDeletingCat(cat);
        setLocalCategories(prev => prev.filter(c => c !== cat));
        await onDeleteCategory(cat);
        setDeletingCat(null);
        setMessage(t('categoryDeleted', { name: cat.toUpperCase() }));
        setTimeout(() => setMessage(null), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="relative rounded-2xl overflow-hidden max-w-sm w-full animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="absolute inset-0 bg-gradient-to-b from-[#0f1629] via-[#0d1220] to-[#0b0f1a] rounded-2xl" />
                <div className="absolute inset-0 rounded-2xl border border-white/[0.12]" />
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/[0.06] rounded-full blur-3xl pointer-events-none" />

                <div className="relative p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-indigo-500/10 border border-cyan-500/20 flex items-center justify-center">
                                <FolderPlus className="w-4 h-4 text-cyan-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-white">
                                    {t('manageCategories')}
                                </h2>
                                <p className="text-[12px] text-slate-300 mt-0.5">
                                    {t('organizeWatchlist')}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-white transition-all duration-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Existing categories */}
                    {localCategories.length > 0 && (
                        <div className="mb-4">
                            <div className="text-[12px] text-slate-300 uppercase tracking-widest font-bold mb-2">
                                {t('currentCategories')}
                            </div>
                            <div className="space-y-1.5">
                                {localCategories.map((cat: string) => (
                                    <div key={cat} className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] group/cat transition-all duration-200 ${deletingCat === cat ? 'opacity-50 scale-95' : ''}`}>
                                        <Tag className="w-3.5 h-3.5 text-cyan-400" />
                                        <span className="text-[13px] font-bold text-white flex-1">{cat.toUpperCase()}</span>
                                        <button
                                            onClick={() => handleDelete(cat)}
                                            disabled={!!deletingCat}
                                            className="p-1 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/15 transition-all duration-200 disabled:opacity-30"
                                            title={tCommon('delete')}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[12px] text-slate-500 mt-2">
                                {t('deleteMovesToDefault')}
                            </p>
                        </div>
                    )}

                    {/* Status message */}
                    {message && (
                        <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-bold animate-in fade-in duration-200">
                            {message}
                        </div>
                    )}

                    {/* Create new */}
                    <div>
                        <div className="text-[12px] text-slate-300 uppercase tracking-widest font-bold mb-2">
                            {t('createNew')}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newCatName}
                                onChange={(e) => setNewCatName(e.target.value)}
                                placeholder={t('categoryNamePlaceholder')}
                                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-[13px] font-bold focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 placeholder:text-slate-600 transition-all duration-200"
                                maxLength={20}
                            />
                            <button
                                onClick={handleCreate}
                                disabled={!newCatName.trim()}
                                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-black text-[13px] font-black hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-[12px] text-slate-500 mt-2">
                            {t('assignCategoryHint')}
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-4 px-4 py-2.5 bg-white/[0.03] text-slate-300 rounded-xl text-[13px] font-bold hover:bg-white/[0.06] hover:text-white transition-all duration-200 border border-white/[0.06]"
                    >
                        {tCommon('close')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── GLOBAL STYLES (injected) ────────────────────────────────────────────
const GlobalStyles = () => (
    <style jsx global>{`
        @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
    `}</style>
);
