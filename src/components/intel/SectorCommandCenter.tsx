'use client';
// ============================================================================
// SectorCommandCenter — Premium 10-Sector Dashboard (Built from Scratch)
// All-in-one sector overview + macro snapshot + momentum ranking
// Glassmorphic design, animated gradients, micro-interactions
// ============================================================================

import React, { useMemo, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
    TrendingUp, TrendingDown, Activity, Zap, Shield, ShieldAlert,
    Rocket, Bot, Orbit, Cpu, CreditCard, Cloud,
    BarChart3, Eye, ChevronRight, Flame, Snowflake
} from 'lucide-react';
import type { IntelQuote, IntelSharedData } from '@/hooks/useIntelSharedData';

// ── Sector Definitions (inline for self-contained component) ──
interface SectorDef {
    key: keyof IntelSharedData;
    tabKey: string;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    accent: string;      // tailwind text color
    accentBg: string;    // tailwind bg color
    accentBorder: string; // tailwind border color
    accentHex: string;   // hex for glow
    emoji: string;
}

const SECTORS: SectorDef[] = [
    { key: 'm7', tabKey: 'M7', label: 'Magnificent 7', shortLabel: 'M7', icon: <Orbit className="w-4 h-4" />, accent: 'text-cyan-400', accentBg: 'bg-cyan-500/10', accentBorder: 'border-cyan-500/25', accentHex: '#06b6d4', emoji: '⚡' },
    { key: 'physicalAI', tabKey: 'PHYSICAL_AI', label: 'Physical AI', shortLabel: 'PHYS AI', icon: <Bot className="w-4 h-4" />, accent: 'text-amber-400', accentBg: 'bg-amber-500/10', accentBorder: 'border-amber-500/25', accentHex: '#f59e0b', emoji: '🤖' },
    { key: 'siliconCore', tabKey: 'SILICON_CORE', label: 'Silicon Core', shortLabel: 'SILICON', icon: <Zap className="w-4 h-4" />, accent: 'text-amber-300', accentBg: 'bg-amber-400/10', accentBorder: 'border-amber-400/25', accentHex: '#fbbf24', emoji: '⚡' },
    { key: 'powerMatrix', tabKey: 'POWER_MATRIX', label: 'Power Matrix', shortLabel: 'POWER', icon: <Activity className="w-4 h-4" />, accent: 'text-emerald-400', accentBg: 'bg-emerald-500/10', accentBorder: 'border-emerald-500/25', accentHex: '#10b981', emoji: '🟢' },
    { key: 'bioPulse', tabKey: 'BIO_PULSE', label: 'Bio Pulse', shortLabel: 'BIO', icon: <ShieldAlert className="w-4 h-4" />, accent: 'text-rose-400', accentBg: 'bg-rose-500/10', accentBorder: 'border-rose-500/25', accentHex: '#f43f5e', emoji: '🧬' },
    { key: 'cyberShield', tabKey: 'CYBER_SHIELD', label: 'Cyber Shield', shortLabel: 'CYBER', icon: <Shield className="w-4 h-4" />, accent: 'text-cyan-300', accentBg: 'bg-cyan-400/10', accentBorder: 'border-cyan-400/25', accentHex: '#22d3ee', emoji: '🛡️' },
    { key: 'orbitDefense', tabKey: 'ORBIT_DEFENSE', label: 'Orbit Defense', shortLabel: 'ORBIT', icon: <Rocket className="w-4 h-4" />, accent: 'text-sky-400', accentBg: 'bg-sky-500/10', accentBorder: 'border-sky-500/25', accentHex: '#0ea5e9', emoji: '🚀' },
    { key: 'quantumEdge', tabKey: 'QUANTUM_EDGE', label: 'Quantum Edge', shortLabel: 'QUANTUM', icon: <Cpu className="w-4 h-4" />, accent: 'text-fuchsia-400', accentBg: 'bg-fuchsia-500/10', accentBorder: 'border-fuchsia-500/25', accentHex: '#d946ef', emoji: '🔮' },
    { key: 'fintechPulse', tabKey: 'FINTECH_PULSE', label: 'Fintech Pulse', shortLabel: 'FINTECH', icon: <CreditCard className="w-4 h-4" />, accent: 'text-lime-400', accentBg: 'bg-lime-500/10', accentBorder: 'border-lime-500/25', accentHex: '#84cc16', emoji: '💳' },
    { key: 'cloudFortress', tabKey: 'CLOUD_FORTRESS', label: 'Cloud Fortress', shortLabel: 'CLOUD', icon: <Cloud className="w-4 h-4" />, accent: 'text-sky-300', accentBg: 'bg-sky-400/10', accentBorder: 'border-sky-400/25', accentHex: '#38bdf8', emoji: '☁️' },
];

// ── Helpers ──
function calcSectorStats(quotes: IntelQuote[]) {
    if (!quotes || quotes.length === 0) return { avgChange: 0, upCount: 0, downCount: 0, totalTickers: 0, leader: null as IntelQuote | null, laggard: null as IntelQuote | null, avgWhale: 0, avgDarkPool: 0, avgAlpha: 0, totalGex: 0 };

    const valid = quotes.filter(q => q.price > 0);
    if (valid.length === 0) return { avgChange: 0, upCount: 0, downCount: 0, totalTickers: quotes.length, leader: null, laggard: null, avgWhale: 0, avgDarkPool: 0, avgAlpha: 0, totalGex: 0 };

    const sorted = [...valid].sort((a, b) => b.changePct - a.changePct);
    const avgChange = valid.reduce((s, q) => s + q.changePct, 0) / valid.length;
    const upCount = valid.filter(q => q.changePct > 0).length;
    const downCount = valid.filter(q => q.changePct < 0).length;
    const avgWhale = valid.reduce((s, q) => s + (q.whaleIndex || 0), 0) / valid.length;
    const avgDarkPool = valid.reduce((s, q) => s + (q.darkPoolPct || 0), 0) / valid.length;
    const avgAlpha = valid.reduce((s, q) => s + (q.alphaScore || 0), 0) / valid.length;
    const totalGex = valid.reduce((s, q) => s + (q.gex || 0), 0);

    return { avgChange, upCount, downCount, totalTickers: valid.length, leader: sorted[0], laggard: sorted[sorted.length - 1], avgWhale, avgDarkPool, avgAlpha, totalGex };
}

function getMomentumColor(pct: number): string {
    if (pct >= 2) return 'text-emerald-300';
    if (pct >= 0.5) return 'text-emerald-400';
    if (pct > -0.5) return 'text-slate-200';
    if (pct > -2) return 'text-rose-400';
    return 'text-rose-300';
}

function getMomentumBg(pct: number): string {
    if (pct >= 1) return 'bg-emerald-500/8';
    if (pct > -1) return 'bg-white/[0.02]';
    return 'bg-rose-500/8';
}

function formatGexCompact(gex: number): string {
    const abs = Math.abs(gex);
    if (abs >= 1e9) return `${(gex / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(gex / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(gex / 1e3).toFixed(0)}K`;
    return gex.toFixed(0);
}

// ── Component ──
interface SectorCommandCenterProps {
    sectorData: IntelSharedData;
    onNavigate: (tab: string) => void;
}

export function SectorCommandCenter({ sectorData, onNavigate }: SectorCommandCenterProps) {
    const [hoveredSector, setHoveredSector] = useState<string | null>(null);
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Calculate all sector stats
    const sectorStats = useMemo(() => {
        return SECTORS.map(s => ({
            def: s,
            stats: calcSectorStats((sectorData as any)[s.key] || []),
            quotes: ((sectorData as any)[s.key] || []) as IntelQuote[],
        }));
    }, [sectorData]);

    // Market-wide aggregates
    const marketOverview = useMemo(() => {
        const allQuotes = sectorStats.flatMap(s => s.quotes);
        const totalUp = allQuotes.filter(q => q.changePct > 0).length;
        const totalDown = allQuotes.filter(q => q.changePct < 0).length;
        const avgChange = allQuotes.length > 0 ? allQuotes.reduce((s, q) => s + q.changePct, 0) / allQuotes.length : 0;
        const topSector = [...sectorStats].sort((a, b) => b.stats.avgChange - a.stats.avgChange)[0];
        const bottomSector = [...sectorStats].sort((a, b) => a.stats.avgChange - b.stats.avgChange)[0];
        const hotWhale = [...sectorStats].sort((a, b) => b.stats.avgWhale - a.stats.avgWhale)[0];
        return { totalUp, totalDown, totalTickers: allQuotes.length, avgChange, topSector, bottomSector, hotWhale };
    }, [sectorStats]);

    const marketSentiment = marketOverview.avgChange >= 0.5 ? 'BULLISH' : marketOverview.avgChange <= -0.5 ? 'BEARISH' : 'NEUTRAL';
    const sentimentColor = marketSentiment === 'BULLISH' ? 'text-emerald-400' : marketSentiment === 'BEARISH' ? 'text-rose-400' : 'text-amber-400';
    const sentimentIcon = marketSentiment === 'BULLISH' ? <Flame className="w-4 h-4" /> : marketSentiment === 'BEARISH' ? <Snowflake className="w-4 h-4" /> : <Activity className="w-4 h-4" />;

    return (
        <div className="space-y-6">

            {/* ═══ HERO HEADER ═══ */}
            <section className="relative p-6 rounded-2xl border border-white/[0.08] bg-[#0a0f1c]/60 backdrop-blur-xl shadow-2xl overflow-hidden">
                {/* Animated gradient background */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute -top-20 -right-20 w-80 h-80 bg-gradient-radial from-cyan-500/8 to-transparent rounded-full blur-3xl animate-pulse" />
                    <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-gradient-radial from-indigo-500/8 to-transparent rounded-full blur-3xl" />
                </div>

                <div className="relative z-10 flex items-start justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-cyan-400 tracking-[0.2em] uppercase flex items-center gap-1.5">
                                <Eye className="w-3.5 h-3.5" />
                                SECTOR COMMAND CENTER
                            </span>
                            <span className="text-xs text-slate-300 font-mono">
                                {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                            SECTOR <span className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">COMMAND</span>
                        </h1>
                        <p className="text-slate-300 text-sm mt-1 font-mono">
                            10 SECTORS • {marketOverview.totalTickers} ASSETS • REAL-TIME INTELLIGENCE
                        </p>
                    </div>

                    {/* Market Pulse Badge */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${marketSentiment === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/30' :
                                marketSentiment === 'BEARISH' ? 'bg-rose-500/10 border-rose-500/30' :
                                    'bg-amber-500/10 border-amber-500/30'
                            }`}>
                            {sentimentIcon}
                            <span className={`text-sm font-black tracking-wider ${sentimentColor}`}>
                                {marketSentiment}
                            </span>
                            <span className={`text-lg font-mono font-black ${getMomentumColor(marketOverview.avgChange)}`}>
                                {marketOverview.avgChange > 0 ? '+' : ''}{marketOverview.avgChange.toFixed(2)}%
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono">
                            <span className="text-emerald-400 flex items-center gap-1">
                                <TrendingUp className="w-3.5 h-3.5" /> {marketOverview.totalUp}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="text-rose-400 flex items-center gap-1">
                                <TrendingDown className="w-3.5 h-3.5" /> {marketOverview.totalDown}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Macro Quick Strip ── */}
                <div className="relative z-10 mt-4 grid grid-cols-3 gap-3">
                    {marketOverview.topSector && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                            <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">🔥 TOP</span>
                            <span className={`text-sm font-bold ${marketOverview.topSector.def.accent}`}>
                                {marketOverview.topSector.def.emoji} {marketOverview.topSector.def.shortLabel}
                            </span>
                            <span className="text-xs font-mono text-emerald-400 ml-auto">
                                +{marketOverview.topSector.stats.avgChange.toFixed(2)}%
                            </span>
                        </div>
                    )}
                    {marketOverview.bottomSector && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-500/15">
                            <span className="text-xs text-rose-400 font-bold uppercase tracking-wider">❄️ BOT</span>
                            <span className={`text-sm font-bold ${marketOverview.bottomSector.def.accent}`}>
                                {marketOverview.bottomSector.def.emoji} {marketOverview.bottomSector.def.shortLabel}
                            </span>
                            <span className="text-xs font-mono text-rose-400 ml-auto">
                                {marketOverview.bottomSector.stats.avgChange.toFixed(2)}%
                            </span>
                        </div>
                    )}
                    {marketOverview.hotWhale && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/5 border border-violet-500/15">
                            <span className="text-xs text-violet-400 font-bold uppercase tracking-wider">🐋 WHALE</span>
                            <span className={`text-sm font-bold ${marketOverview.hotWhale.def.accent}`}>
                                {marketOverview.hotWhale.def.emoji} {marketOverview.hotWhale.def.shortLabel}
                            </span>
                            <span className="text-xs font-mono text-violet-400 ml-auto">
                                IDX {marketOverview.hotWhale.stats.avgWhale.toFixed(0)}
                            </span>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ SECTOR GRID (5×2) ═══ */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {sectorStats.map(({ def, stats, quotes }) => (
                    <div
                        key={def.key}
                        onClick={() => onNavigate(def.tabKey)}
                        onMouseEnter={() => setHoveredSector(def.key)}
                        onMouseLeave={() => setHoveredSector(null)}
                        className={`group relative cursor-pointer rounded-xl border transition-all duration-300 overflow-hidden
                            ${hoveredSector === def.key
                                ? `${def.accentBorder} ${def.accentBg} shadow-lg`
                                : 'border-white/[0.06] bg-[#0a0f1c]/40 hover:border-white/[0.12]'}
                            ${getMomentumBg(stats.avgChange)}
                        `}
                        style={hoveredSector === def.key ? { boxShadow: `0 0 30px ${def.accentHex}15` } : undefined}
                    >
                        {/* Card Content */}
                        <div className="p-4">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className={`${def.accent} opacity-90`}>{def.icon}</span>
                                    <span className={`text-xs font-extrabold tracking-wider ${def.accent}`}>
                                        {def.emoji} {def.shortLabel}
                                    </span>
                                </div>
                                <ChevronRight className={`w-3.5 h-3.5 transition-all duration-200 ${hoveredSector === def.key ? `${def.accent} translate-x-0.5` : 'text-slate-300/30'
                                    }`} />
                            </div>

                            {/* Main Metric: Avg Change */}
                            <div className="mb-3">
                                <div className={`text-2xl font-black font-mono tracking-tight ${getMomentumColor(stats.avgChange)}`}>
                                    {stats.avgChange > 0 ? '+' : ''}{stats.avgChange.toFixed(2)}%
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-emerald-400 text-xs font-bold">{stats.upCount}↑</span>
                                    <span className="text-slate-300 text-xs">/</span>
                                    <span className="text-rose-400 text-xs font-bold">{stats.downCount}↓</span>
                                    <span className="text-slate-300 text-xs ml-1">of {stats.totalTickers}</span>
                                </div>
                            </div>

                            {/* Leader/Laggard Row */}
                            {stats.leader && stats.laggard && (
                                <div className="grid grid-cols-2 gap-1.5 mb-3">
                                    <div className="px-2 py-1.5 rounded bg-emerald-500/8 border border-emerald-500/10">
                                        <div className="text-xs text-emerald-400 font-bold">LEAD</div>
                                        <div className="text-xs font-black text-emerald-300">{stats.leader.ticker}</div>
                                        <div className="text-xs font-mono text-emerald-400">
                                            +{stats.leader.changePct.toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="px-2 py-1.5 rounded bg-rose-500/8 border border-rose-500/10">
                                        <div className="text-xs text-rose-400 font-bold">LAG</div>
                                        <div className="text-xs font-black text-rose-300">{stats.laggard.ticker}</div>
                                        <div className="text-xs font-mono text-rose-400">
                                            {stats.laggard.changePct.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Intelligence Row: Whale + Dark Pool + GEX */}
                            <div className="grid grid-cols-3 gap-1">
                                <div className="text-center">
                                    <div className="text-xs text-slate-300 font-bold">🐋</div>
                                    <div className={`text-xs font-bold font-mono ${stats.avgWhale >= 50 ? 'text-violet-300' : 'text-slate-300'
                                        }`}>
                                        {stats.avgWhale > 0 ? stats.avgWhale.toFixed(0) : '-'}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-slate-300 font-bold">D.P</div>
                                    <div className={`text-xs font-bold font-mono ${stats.avgDarkPool >= 35 ? 'text-slate-100' : 'text-slate-300'
                                        }`}>
                                        {stats.avgDarkPool > 0 ? `${stats.avgDarkPool.toFixed(0)}%` : '-'}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-slate-300 font-bold">GEX</div>
                                    <div className={`text-xs font-bold font-mono ${stats.totalGex > 0 ? 'text-emerald-400' : stats.totalGex < 0 ? 'text-rose-400' : 'text-slate-300'
                                        }`}>
                                        {stats.totalGex !== 0 ? formatGexCompact(stats.totalGex) : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Accent Line */}
                        <div className={`h-[2px] w-full transition-opacity duration-300 ${hoveredSector === def.key ? 'opacity-100' : 'opacity-30'
                            }`} style={{ background: `linear-gradient(90deg, transparent, ${def.accentHex}, transparent)` }} />
                    </div>
                ))}
            </section>

            {/* ═══ SECTOR HEAT RANKING ═══ */}
            <section className="p-4 rounded-xl border border-white/[0.06] bg-[#0a0f1c]/40 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-extrabold text-slate-200 tracking-wider uppercase">SECTOR MOMENTUM RANKING</span>
                </div>

                <div className="space-y-1.5">
                    {[...sectorStats]
                        .sort((a, b) => b.stats.avgChange - a.stats.avgChange)
                        .map((s, idx) => {
                            const pct = s.stats.avgChange;
                            const maxAbs = Math.max(...sectorStats.map(x => Math.abs(x.stats.avgChange)), 0.01);
                            const barWidth = Math.min(100, (Math.abs(pct) / maxAbs) * 100);
                            const isPositive = pct >= 0;

                            return (
                                <div
                                    key={s.def.key}
                                    className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors group"
                                    onClick={() => onNavigate(s.def.tabKey)}
                                >
                                    {/* Rank */}
                                    <span className={`w-5 text-xs font-black font-mono ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-200' : idx === 2 ? 'text-amber-600' : 'text-slate-300'
                                        }`}>
                                        {idx + 1}
                                    </span>

                                    {/* Sector Name */}
                                    <div className="flex items-center gap-1.5 w-24 flex-shrink-0">
                                        <span className={`${s.def.accent} opacity-80`}>{s.def.icon}</span>
                                        <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                                            {s.def.shortLabel}
                                        </span>
                                    </div>

                                    {/* Bar */}
                                    <div className="flex-1 h-4 bg-white/[0.03] rounded-full overflow-hidden relative">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${isPositive ? 'bg-gradient-to-r from-emerald-600/60 to-emerald-400/40' : 'bg-gradient-to-r from-rose-600/60 to-rose-400/40'
                                                }`}
                                            style={{ width: `${barWidth}%` }}
                                        />
                                    </div>

                                    {/* Value */}
                                    <span className={`w-16 text-right text-xs font-black font-mono ${getMomentumColor(pct)}`}>
                                        {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
                                    </span>

                                    {/* Leader ticker */}
                                    <span className="w-12 text-xs font-bold text-slate-300 text-right">
                                        {s.stats.leader?.ticker || '-'}
                                    </span>

                                    <ChevronRight className="w-3.5 h-3.5 text-slate-300/30 group-hover:text-slate-200 transition-colors" />
                                </div>
                            );
                        })}
                </div>
            </section>
        </div>
    );
}
