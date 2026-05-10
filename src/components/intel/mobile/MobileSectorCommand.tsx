'use client';

// ============================================================================
// MobileSectorCommand — Premium Mobile-Native Intel Experience
// v2.0: 3-Depth Architecture (Overview → Sector Detail → Ticker Sheet)
// Design: iOS-native patterns with Bloomberg data density
// ============================================================================

import React, { useMemo, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { MobileSectorDetail } from './MobileSectorDetail';
import { MobileTickerDetail } from './MobileTickerDetail';
import { SECTORS, type SectorDefBase } from '@/configs/intelSectors';
import { type IntelSharedData, type IntelQuote } from '@/hooks/useIntelSharedData';
import { TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { SectorIcon } from './SectorIcon';
import { ProGate } from '@/components/gate/FeatureGate';

interface MobileSectorCommandProps {
    sectorData: IntelSharedData;
    onNavigate: (tab: string) => void;
}

// ── Helpers ──
function calcSectorStats(quotes: IntelQuote[]) {
    const valid = quotes.filter(q => q.price > 0);
    if (valid.length === 0) return {
        avgChange: 0, upCount: 0, downCount: 0, totalTickers: quotes.length,
        avgWhale: 0, avgAlpha: 0, totalGex: 0, avgDarkPool: 0, avgPcr: 0,
        leader: null as IntelQuote | null, laggard: null as IntelQuote | null,
        totalVolume: 0, totalNetPrem: 0,
    };
    const sorted = [...valid].sort((a, b) => b.changePct - a.changePct);
    return {
        avgChange: valid.reduce((s, q) => s + q.changePct, 0) / valid.length,
        upCount: valid.filter(q => q.changePct > 0).length,
        downCount: valid.filter(q => q.changePct < 0).length,
        totalTickers: valid.length,
        avgWhale: valid.reduce((s, q) => s + (q.whaleIndex || 0), 0) / valid.length,
        avgAlpha: valid.reduce((s, q) => s + (q.alphaScore || 0), 0) / valid.length,
        totalGex: valid.reduce((s, q) => s + (q.gex || 0), 0),
        avgDarkPool: valid.reduce((s, q) => s + (q.darkPoolPct || 0), 0) / valid.length,
        avgPcr: valid.filter(q => q.pcr > 0).length > 0 ? valid.filter(q => q.pcr > 0).reduce((s, q) => s + q.pcr, 0) / valid.filter(q => q.pcr > 0).length : 0,
        leader: sorted[0],
        laggard: sorted[sorted.length - 1],
        totalVolume: valid.reduce((s, q) => s + (q.volume || 0), 0),
        totalNetPrem: valid.reduce((s, q) => s + (q.netPremium || 0), 0),
    };
}

function formatCompact(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}

// ── Mini Sparkline SVG ──
function MiniSparkline({ data, color, width = 48, height = 20 }: { data: number[]; color: string; width?: number; height?: number }) {
    if (!data || data.length < 2) {
        // Fallback: simple trend line based on direction
        return null;
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" className="shrink-0">
            <polyline points={points} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ── Decorative Trend Line (when no sparkline data) ──
function TrendLine({ isUp, width = 48, height = 20 }: { isUp: boolean; width?: number; height?: number }) {
    const points = isUp
        ? `0,${height - 3} ${width * 0.2},${height * 0.7} ${width * 0.4},${height * 0.6} ${width * 0.6},${height * 0.4} ${width * 0.8},${height * 0.25} ${width},3`
        : `0,3 ${width * 0.2},${height * 0.3} ${width * 0.4},${height * 0.4} ${width * 0.6},${height * 0.6} ${width * 0.8},${height * 0.75} ${width},${height - 3}`;
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" className="shrink-0 opacity-60">
            <polyline points={points} stroke={isUp ? '#4ade80' : '#f87171'} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
    );
}

export function MobileSectorCommand({ sectorData, onNavigate }: MobileSectorCommandProps) {
    const t = useTranslations('alphaReport');
    const gt = useTranslations('gate');

    // ── State ──
    const [selectedSector, setSelectedSector] = useState<string | null>(null);
    const [selectedTicker, setSelectedTicker] = useState<IntelQuote | null>(null);
    const [showAllLeaders, setShowAllLeaders] = useState(false);

    // ── Computed ──
    const sectorStats = useMemo(() => {
        return SECTORS.map(s => ({
            def: s,
            stats: calcSectorStats((sectorData as any)[s.key] || []),
            quotes: ((sectorData as any)[s.key] || []) as IntelQuote[],
        }));
    }, [sectorData]);

    const sortedSectors = useMemo(() =>
        [...sectorStats].sort((a, b) => b.stats.avgChange - a.stats.avgChange),
        [sectorStats]
    );

    const marketOverview = useMemo(() => {
        const allQuotes = sectorStats.flatMap(s => s.quotes);
        const totalUp = allQuotes.filter(q => q.changePct > 0).length;
        const totalDown = allQuotes.filter(q => q.changePct < 0).length;
        const avgChange = allQuotes.length > 0 ? allQuotes.reduce((s, q) => s + q.changePct, 0) / allQuotes.length : 0;
        const topSector = sortedSectors[0];
        const bottomSector = sortedSectors[sortedSectors.length - 1];
        const hotWhale = [...sectorStats].sort((a, b) => b.stats.avgWhale - a.stats.avgWhale)[0];
        return { totalUp, totalDown, totalTickers: allQuotes.length, avgChange, topSector, bottomSector, hotWhale };
    }, [sectorStats, sortedSectors]);

    // Context Leaders: all tickers ranked by alphaScore
    const allLeadersSorted = useMemo(() => {
        const all = sectorStats.flatMap(s =>
            s.quotes.filter(q => q.price > 0 && q.alphaScore > 0).map(q => ({
                ...q,
                sectorLabel: s.def.shortLabel,
                sectorIcon: s.def.icon,
                sectorAccent: s.def.accent,
            }))
        );
        return [...all].sort((a, b) => b.alphaScore - a.alphaScore);
    }, [sectorStats]);

    const contextLeaders = useMemo(() => {
        if (showAllLeaders) return allLeadersSorted.slice(0, 10);
        const top3 = allLeadersSorted.slice(0, 3);
        const bottom1 = allLeadersSorted.length > 3 ? [allLeadersSorted[allLeadersSorted.length - 1]] : [];
        return [...top3, ...bottom1];
    }, [allLeadersSorted, showAllLeaders]);

    const isBullish = marketOverview.avgChange >= 0;

    // ── Handlers ──
    const handleSectorTap = useCallback((sectorKey: string) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
        setSelectedSector(sectorKey);
    }, []);

    const handleBackToOverview = useCallback(() => {
        setSelectedSector(null);
    }, []);

    const handleTickerTap = useCallback((ticker: IntelQuote) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
        setSelectedTicker(ticker);
    }, []);

    // ── DEPTH 3: Ticker Detail View (push navigation) ──
    if (selectedTicker) {
        // Find sector label — from selectedSector or by searching which sector has this ticker
        let sLabel = 'INTEL';
        if (selectedSector) {
            const ss = sectorStats.find(s => s.def.key === selectedSector);
            if (ss) sLabel = ss.def.shortLabel;
        } else {
            const found = sectorStats.find(s => s.quotes.some(q => q.ticker === selectedTicker.ticker));
            if (found) sLabel = found.def.shortLabel;
        }
        return (
            <MobileTickerDetail
                quote={selectedTicker}
                sectorLabel={sLabel}
                onBack={() => setSelectedTicker(null)}
            />
        );
    }

    // ── DEPTH 2: Sector Detail View ──
    if (selectedSector) {
        const sectorStat = sectorStats.find(s => s.def.key === selectedSector);
        if (sectorStat) {
            return (
                <MobileSectorDetail
                    sector={sectorStat.def}
                    stats={sectorStat.stats}
                    quotes={sectorStat.quotes}
                    onBack={handleBackToOverview}
                    onTickerTap={handleTickerTap}
                />
            );
        }
    }

    // ── DEPTH 1: Overview ──
    return (
        <div className="w-full flex flex-col min-h-screen bg-[#050a14] pb-6 relative z-10">

            {/* ═══ SCROLLABLE CONTENT ═══ */}
            <div className="px-4 pt-3 space-y-5">

                {/* ── HERO CARD ── */}
                <div className={`relative overflow-hidden rounded-2xl border p-5 ${isBullish
                    ? 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.02]'
                    : 'border-rose-500/20 bg-gradient-to-br from-rose-500/[0.12] to-rose-500/[0.02]'
                    }`}>
                    {/* Ambient glow */}
                    <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20 ${isBullish ? 'bg-emerald-400' : 'bg-rose-400'}`} />

                    <div className="relative z-10">
                        <div className="text-[12px] font-medium text-emerald-400/80 uppercase tracking-[0.12em] mb-1">Sector Command</div>
                        <div className="text-[13px] text-slate-300 mb-3">10 Sectors · {marketOverview.totalTickers} Assets · Live</div>

                        {/* Large Number + Up/Down Counts */}
                        <div className="flex items-baseline justify-between mb-1">
                            <div className={`text-[44px] font-bold leading-none tracking-tight ${isBullish ? 'text-white' : 'text-white'}`}>
                                {marketOverview.avgChange > 0 ? '+' : ''}{marketOverview.avgChange.toFixed(2)}%
                            </div>
                            <div className="flex items-center gap-2 text-[20px] font-bold font-mono">
                                <span className="text-emerald-400">▲{marketOverview.totalUp}</span>
                                <span className="text-rose-400">▼{marketOverview.totalDown}</span>
                            </div>
                        </div>
                        <div className={`text-[15px] font-semibold mb-4 ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isBullish ? 'BULLISH' : 'BEARISH'} · Market Wide
                        </div>

                        {/* TOP / BOT / WHALE 3-split */}
                        <div className="flex items-stretch gap-2 pt-4 border-t border-white/[0.08]">
                            <div className="flex-1 text-center">
                                <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">TOP</div>
                                <div className="text-[15px] font-bold text-emerald-400">
                                    {marketOverview.topSector?.def.shortLabel || '-'}
                                </div>
                            </div>
                            <div className="w-px bg-white/[0.08]" />
                            <div className="flex-1 text-center">
                                <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">BOT</div>
                                <div className="text-[15px] font-bold text-rose-400">
                                    {marketOverview.bottomSector?.def.shortLabel || '-'}
                                </div>
                            </div>
                            <div className="w-px bg-white/[0.08]" />
                            <div className="flex-1 text-center">
                                <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">WHALE</div>
                                <div className="text-[15px] font-bold text-violet-300">
                                    {marketOverview.hotWhale?.def.shortLabel || '-'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── CONTEXT LEADERS — Horizontal Swipe ── */}
                {contextLeaders.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-2.5 px-0.5">
                            <span className="text-[13px] font-semibold text-white">Context Leaders</span>
                            <button
                                onClick={() => setShowAllLeaders(prev => !prev)}
                                className="text-[11px] text-blue-400 font-medium active:text-blue-300 transition-colors"
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                                {showAllLeaders ? '← Less' : 'All →'}
                            </button>
                        </div>
                        <div className="flex gap-2.5 overflow-x-auto pb-2"
                            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                            {contextLeaders.map((q, i) => {
                                const isTop = i < 3;
                                const card = (
                                    <button
                                        key={q.ticker}
                                        onClick={() => handleTickerTap(q)}
                                        className={`shrink-0 min-w-[140px] rounded-2xl p-3.5 border transition-colors active:scale-[0.97] touch-manipulation ${isTop
                                            ? 'border-emerald-500/25 bg-emerald-500/[0.05]'
                                            : 'border-rose-500/25 bg-rose-500/[0.05]'
                                            }`}
                                        style={{ scrollSnapAlign: 'start', WebkitTapHighlightColor: 'transparent' }}
                                    >
                                        <div className="text-[12px] text-slate-400 uppercase tracking-wider mb-1.5 text-left">
                                            {isTop ? `▲ LEAD #${i + 1}` : `▼ LAG`}
                                        </div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <img
                                                src={`https://assets.parqet.com/logos/symbol/${q.ticker}?format=png`}
                                                alt={q.ticker}
                                                className="w-6 h-6 rounded-full object-contain bg-white/10"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                            <span className="text-[18px] font-bold text-white tracking-tight">{q.ticker}</span>
                                        </div>
                                        <div className={`text-[14px] font-semibold text-left ${q.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
                                        </div>
                                        <div className="text-[11px] text-slate-400 mt-1.5 text-left">
                                            {(q as any).sectorLabel} · Score {Math.round(q.alphaScore)}
                                        </div>
                                    </button>
                                );
                                // Gate #1, #2 behind ProGate — matches desktop SectorCommandCenter
                                return i < 2 ? (
                                    <ProGate key={q.ticker} title={`Alpha #${i + 1}`} fomoMessage={gt('fomoAlphaLeaders')} mode="blur" compact description={gt('descAiDeep')}>
                                        {card}
                                    </ProGate>
                                ) : (
                                    <React.Fragment key={q.ticker}>{card}</React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── SECTOR LIST ── */}
                <div>
                    <div className="flex items-center justify-between mb-2.5 px-0.5">
                        <span className="text-[13px] font-semibold text-white">Sectors ({SECTORS.length})</span>
                    </div>

                    {/* Filter Pills — Horizontal Scroll */}
                    <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4"
                        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                        {/* "All" pill — always stays on overview */}
                        <button
                            className="shrink-0 px-4 py-1.5 rounded-full text-[12px] font-semibold bg-cyan-500 text-slate-900 transition-colors"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            All
                        </button>
                        {sectorStats.map(sector => (
                            <button
                                key={sector.def.key}
                                onClick={() => handleSectorTap(sector.def.key)}
                                className="shrink-0 px-4 py-1.5 rounded-full text-[12px] font-semibold bg-white/[0.06] text-slate-300 border border-white/[0.08] active:bg-white/[0.12] transition-colors"
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                                {sector.def.shortLabel}
                            </button>
                        ))}
                    </div>

                    <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 overflow-hidden">
                        {sortedSectors.map((sector, idx) => {
                            const pct = sector.stats.avgChange;
                            const isUp = pct >= 0;
                            const leaderTicker = sector.stats.leader?.ticker;
                            // Try to get an aggregated sparkline from the sector's leader
                            const leaderSparkline = sector.stats.leader?.sparkline;

                            return (
                                <button
                                    key={sector.def.key}
                                    onClick={() => handleSectorTap(sector.def.key)}
                                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.04] last:border-b-0 active:bg-white/[0.04] transition-colors touch-manipulation"
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                >
                                    {/* Rank */}
                                    <span className={`text-[13px] font-medium w-5 shrink-0 ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-slate-500'}`}>
                                        {idx + 1}
                                    </span>

                                    {/* Icon + Name + Lead */}
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <SectorIcon sectorKey={sector.def.key} color={sector.def.accentHex} size={20} />
                                            <span className="text-[15px] font-semibold text-white">{sector.def.shortLabel}</span>
                                        </div>
                                        {leaderTicker && (
                                            <div className="text-[12px] text-slate-400">
                                                Lead {leaderTicker} {sector.stats.leader && sector.stats.leader.changePct > 0 ? '+' : ''}{sector.stats.leader?.changePct.toFixed(1)}%
                                            </div>
                                        )}
                                    </div>

                                    {/* Sparkline or Trend */}
                                    {leaderSparkline && leaderSparkline.length >= 3 ? (
                                        <MiniSparkline data={leaderSparkline} color={isUp ? '#4ade80' : '#f87171'} />
                                    ) : (
                                        <TrendLine isUp={isUp} />
                                    )}

                                    {/* Change % */}
                                    <span className={`text-[15px] font-bold font-mono min-w-[64px] text-right ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isUp ? '+' : ''}{pct.toFixed(2)}%
                                    </span>

                                    {/* Chevron */}
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                </button>
                            );
                        })}
                    </div>
                </div>

            </div>

            {/* Ticker detail handled by Depth 3 push navigation above */}
        </div>
    );
}
