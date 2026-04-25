'use client';

// ============================================================================
// MobileSectorDetail — Full-Screen Sector View (Depth 2)
// iOS push/pop navigation pattern: tap sector → full detail → back
// ============================================================================

import React, { useState } from 'react';
import { type SectorDefBase } from '@/configs/intelSectors';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { ChevronLeft } from 'lucide-react';
import { SectorIcon } from './SectorIcon';
import { MobileSectorReport } from './MobileSectorReport';

interface SectorStats {
    avgChange: number;
    upCount: number;
    downCount: number;
    totalTickers: number;
    avgWhale: number;
    avgAlpha: number;
    totalGex: number;
    avgDarkPool: number;
    avgPcr: number;
    leader: IntelQuote | null;
    laggard: IntelQuote | null;
    totalVolume: number;
    totalNetPrem: number;
}

interface MobileSectorDetailProps {
    sector: SectorDefBase;
    stats: SectorStats;
    quotes: IntelQuote[];
    onBack: () => void;
    onTickerTap: (ticker: IntelQuote) => void;
}

function formatCompact(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}

function getGradeInfo(score: number) {
    if (score >= 70) return { label: 'A', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' };
    if (score >= 55) return { label: 'B', color: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30' };
    if (score >= 40) return { label: 'C', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' };
    return { label: 'D', color: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/30' };
}

const LOGO_URL = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

export function MobileSectorDetail({ sector, stats, quotes, onBack, onTickerTap }: MobileSectorDetailProps) {
    const isUp = stats.avgChange >= 0;
    const sortedQuotes = [...quotes].filter(q => q.price > 0).sort((a, b) => b.changePct - a.changePct);
    const [activeTab, setActiveTab] = useState<'live' | 'report'>('live');

    return (
        <div className="w-full flex flex-col min-h-screen bg-[#050a14] pb-6 relative z-10">

            {/* ═══ HEADER BAR (with back button + toggle tabs) — fixed to viewport, below MobileHeader ═══ */}
            <div className="fixed top-14 left-0 right-0 z-30 bg-[#050a14] border-b border-white/[0.06]"
                style={{ WebkitBackdropFilter: 'blur(20px)' }}>
                <div className="px-4 py-2 flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1 text-slate-400 active:text-white transition-colors touch-manipulation"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                        <ChevronLeft className="w-5 h-5" />
                        <span className="text-[15px] font-bold text-white">{sector.shortLabel}</span>
                    </button>

                    {/* LIVE / REPORT Toggle */}
                    <div className="flex items-center">
                        <button
                            onClick={() => setActiveTab('live')}
                            className={`flex items-center gap-1 px-2 text-[12px] font-bold tracking-wide transition-colors touch-manipulation ${
                                activeTab === 'live' ? 'text-white' : 'text-white/30'
                            }`}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            <span className={`w-[5px] h-[5px] rounded-full ${activeTab === 'live' ? 'bg-emerald-400' : 'bg-white/15'}`} />
                            LIVE
                        </button>
                        <span className="text-white/10">|</span>
                        <button
                            onClick={() => setActiveTab('report')}
                            className={`flex items-center gap-1 px-2 text-[12px] font-bold tracking-wide transition-colors touch-manipulation ${
                                activeTab === 'report' ? 'text-white' : 'text-white/30'
                            }`}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            <span className={`w-[5px] h-[5px] rounded-full ${activeTab === 'report' ? 'bg-amber-400' : 'bg-white/15'}`} />
                            REPORT
                        </button>
                    </div>
                </div>
            </div>

            {/* Spacer for fixed header bar */}
            <div className="h-12" />

            {/* ═══ CONTENT — Tab-switched ═══ */}
            <div className="px-4 pt-4 space-y-4">

                {activeTab === 'report' ? (
                    <MobileSectorReport sector={sector} />
                ) : (
                    <>
                {/* ── FEATURED SECTOR CARD ── */}
                <div className="rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-500/[0.12] to-blue-500/[0.02] p-5 relative overflow-hidden">
                    {/* Ambient glow */}
                    <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl bg-blue-400/10" />

                    <div className="relative z-10">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${sector.accentHex}15`, border: `1px solid ${sector.accentHex}30` }}>
                                    <SectorIcon sectorKey={sector.key} color={sector.accentHex} size={18} />
                                </div>
                                <span className="text-[15px] font-semibold text-white">{sector.label.toUpperCase()}</span>
                            </div>
                            <span className="text-[12px] text-slate-400">{stats.upCount}/{stats.totalTickers} UP</span>
                        </div>

                        {/* Large Change + Up/Down Counts */}
                        <div className="flex items-baseline justify-between mb-1">
                            <div className={`text-[26px] font-bold tracking-tight ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isUp ? '+' : ''}{stats.avgChange.toFixed(2)}%
                            </div>
                            <div className="flex items-center gap-2 text-[18px] font-bold font-mono">
                                <span className="text-emerald-400">▲{stats.upCount}</span>
                                <span className="text-rose-400">▼{stats.downCount}</span>
                            </div>
                        </div>
                        <div className="text-[11px] text-slate-400 mb-4">
                            Lead: {stats.leader?.ticker || '-'} {stats.leader ? `${stats.leader.changePct > 0 ? '+' : ''}${stats.leader.changePct.toFixed(1)}%` : ''} · {stats.totalTickers} assets tracked
                        </div>

                        {/* 4 Metrics — Clean Horizontal Row */}
                        <div className="flex gap-0 rounded-xl overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <div className="flex-1 py-3 px-2.5 text-center">
                                <div className="text-[12px] text-slate-400 uppercase tracking-wider mb-1">GEX</div>
                                <div className={`text-[17px] font-bold font-mono ${stats.totalGex > 0 ? 'text-emerald-400' : stats.totalGex < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                    {stats.totalGex !== 0 ? `${stats.totalGex > 0 ? '+' : ''}${formatCompact(stats.totalGex)}` : '-'}
                                </div>
                            </div>
                            <div className="w-px bg-white/[0.06]" />
                            <div className="flex-1 py-3 px-2.5 text-center">
                                <div className="text-[12px] text-slate-400 uppercase tracking-wider mb-1">D.Pool</div>
                                <div className="text-[17px] font-bold font-mono text-white">
                                    {stats.avgDarkPool > 0 ? `${stats.avgDarkPool.toFixed(0)}%` : '-'}
                                </div>
                            </div>
                            <div className="w-px bg-white/[0.06]" />
                            <div className="flex-1 py-3 px-2.5 text-center">
                                <div className="text-[12px] text-slate-400 uppercase tracking-wider mb-1">PCR</div>
                                <div className="text-[17px] font-bold font-mono text-white">
                                    {stats.avgPcr > 0 ? stats.avgPcr.toFixed(2) : '-'}
                                </div>
                            </div>
                            <div className="w-px bg-white/[0.06]" />
                            <div className="flex-1 py-3 px-2.5 text-center">
                                <div className="text-[12px] text-slate-400 uppercase tracking-wider mb-1">Score</div>
                                <div className={`text-[17px] font-bold font-mono ${stats.avgAlpha >= 60 ? 'text-emerald-400' : stats.avgAlpha >= 45 ? 'text-amber-400' : 'text-slate-400'}`}>
                                    {stats.avgAlpha > 0 ? Math.round(stats.avgAlpha) : '-'}
                                </div>
                            </div>
                        </div>

                        {/* Lead / Lag / Volume */}
                        <div className="flex items-stretch gap-2 pt-3.5 border-t border-white/[0.06]">
                            <div className="flex-1 text-center">
                                <div className="text-[12px] text-slate-400 uppercase tracking-wider mb-1.5">Lead</div>
                                <div className="text-[16px] font-bold text-emerald-400">{stats.leader?.ticker || '-'}</div>
                            </div>
                            <div className="w-px bg-white/[0.06]" />
                            <div className="flex-1 text-center">
                                <div className="text-[12px] text-slate-400 uppercase tracking-wider mb-1.5">Lag</div>
                                <div className="text-[16px] font-bold text-rose-400">{stats.laggard?.ticker || '-'}</div>
                            </div>
                            <div className="w-px bg-white/[0.06]" />
                            <div className="flex-1 text-center">
                                <div className="text-[12px] text-slate-400 uppercase tracking-wider mb-1.5">Volume</div>
                                <div className="text-[16px] font-bold text-white">{formatCompact(stats.totalVolume)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── HOLDINGS LIST ── */}
                <div>
                    <div className="flex items-center justify-between mb-2.5 px-0.5">
                        <span className="text-[13px] font-semibold text-white">Holdings ({sortedQuotes.length})</span>
                    </div>

                    <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 overflow-hidden">
                        {sortedQuotes.map((quote) => {
                            const grade = getGradeInfo(quote.alphaScore);
                            const isTickerUp = quote.changePct >= 0;
                            const isLeader = quote.ticker === stats.leader?.ticker;
                            const isLaggard = quote.ticker === stats.laggard?.ticker;

                            return (
                                <button
                                    key={quote.ticker}
                                    onClick={() => onTickerTap(quote)}
                                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-b-0 active:bg-white/[0.04] transition-colors touch-manipulation"
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                >
                                    {/* Logo */}
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold relative overflow-hidden ${grade.bg} ${grade.border} border`}>
                                        <span className={`absolute ${grade.color}`}>{quote.ticker.slice(0, 3)}</span>
                                        <img
                                            src={LOGO_URL(quote.ticker)}
                                            alt=""
                                            className="w-full h-full object-cover absolute inset-0 rounded-lg"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    </div>

                                    {/* Name + Score */}
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="text-[14px] font-semibold text-white">{quote.ticker}</div>
                                        <div className="text-[12px] text-slate-400 mt-0.5">
                                            Score {Math.round(quote.alphaScore)}{isLeader ? ' · Lead' : isLaggard ? ' · Lag' : ''}
                                        </div>
                                    </div>

                                    {/* Price + Change — single line */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[14px] font-semibold text-white font-mono">${quote.price.toFixed(2)}</span>
                                        <span className={`text-[13px] font-semibold font-mono ${isTickerUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {isTickerUp ? '+' : ''}{quote.changePct.toFixed(2)}%
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
                    </>
                )}

            </div>
        </div>
    );
}
