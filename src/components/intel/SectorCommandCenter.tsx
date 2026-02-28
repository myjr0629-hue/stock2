'use client';
// ============================================================================
// SectorCommandCenter — Premium 10-Sector Dashboard
// v2.0: Brighter, richer, premium redesign
// ============================================================================

import React, { useMemo, useState, useEffect } from 'react';
import {
    TrendingUp, TrendingDown, Activity, Zap, Shield, ShieldAlert,
    Rocket, Bot, Orbit, Cpu, CreditCard, Cloud,
    BarChart3, Eye, ChevronRight, Flame, Snowflake
} from 'lucide-react';
import type { IntelQuote, IntelSharedData } from '@/hooks/useIntelSharedData';

// ── Sector Definitions ──
interface SectorDef {
    key: keyof IntelSharedData;
    tabKey: string;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    accent: string;
    accentBg: string;
    accentBorder: string;
    accentHex: string;
    emoji: string;
}

const SECTORS: SectorDef[] = [
    { key: 'm7', tabKey: 'M7', label: 'Magnificent 7', shortLabel: 'M7', icon: <Orbit className="w-4 h-4" />, accent: 'text-cyan-400', accentBg: 'bg-cyan-500/10', accentBorder: 'border-cyan-500/30', accentHex: '#06b6d4', emoji: '⚡' },
    { key: 'physicalAI', tabKey: 'PHYSICAL_AI', label: 'Physical AI', shortLabel: 'PHYS AI', icon: <Bot className="w-4 h-4" />, accent: 'text-amber-400', accentBg: 'bg-amber-500/10', accentBorder: 'border-amber-500/30', accentHex: '#f59e0b', emoji: '🤖' },
    { key: 'siliconCore', tabKey: 'SILICON_CORE', label: 'Silicon Core', shortLabel: 'SILICON', icon: <Zap className="w-4 h-4" />, accent: 'text-amber-300', accentBg: 'bg-amber-400/10', accentBorder: 'border-amber-400/30', accentHex: '#fbbf24', emoji: '⚡' },
    { key: 'powerMatrix', tabKey: 'POWER_MATRIX', label: 'Power Matrix', shortLabel: 'POWER', icon: <Activity className="w-4 h-4" />, accent: 'text-emerald-400', accentBg: 'bg-emerald-500/10', accentBorder: 'border-emerald-500/30', accentHex: '#10b981', emoji: '🟢' },
    { key: 'bioPulse', tabKey: 'BIO_PULSE', label: 'Bio Pulse', shortLabel: 'BIO', icon: <ShieldAlert className="w-4 h-4" />, accent: 'text-rose-400', accentBg: 'bg-rose-500/10', accentBorder: 'border-rose-500/30', accentHex: '#f43f5e', emoji: '🧬' },
    { key: 'cyberShield', tabKey: 'CYBER_SHIELD', label: 'Cyber Shield', shortLabel: 'CYBER', icon: <Shield className="w-4 h-4" />, accent: 'text-cyan-300', accentBg: 'bg-cyan-400/10', accentBorder: 'border-cyan-400/30', accentHex: '#22d3ee', emoji: '🛡️' },
    { key: 'orbitDefense', tabKey: 'ORBIT_DEFENSE', label: 'Orbit Defense', shortLabel: 'ORBIT', icon: <Rocket className="w-4 h-4" />, accent: 'text-sky-400', accentBg: 'bg-sky-500/10', accentBorder: 'border-sky-500/30', accentHex: '#0ea5e9', emoji: '🚀' },
    { key: 'quantumEdge', tabKey: 'QUANTUM_EDGE', label: 'Quantum Edge', shortLabel: 'QUANTUM', icon: <Cpu className="w-4 h-4" />, accent: 'text-fuchsia-400', accentBg: 'bg-fuchsia-500/10', accentBorder: 'border-fuchsia-500/30', accentHex: '#d946ef', emoji: '🔮' },
    { key: 'fintechPulse', tabKey: 'FINTECH_PULSE', label: 'Fintech Pulse', shortLabel: 'FINTECH', icon: <CreditCard className="w-4 h-4" />, accent: 'text-lime-400', accentBg: 'bg-lime-500/10', accentBorder: 'border-lime-500/30', accentHex: '#84cc16', emoji: '💳' },
    { key: 'cloudFortress', tabKey: 'CLOUD_FORTRESS', label: 'Cloud Fortress', shortLabel: 'CLOUD', icon: <Cloud className="w-4 h-4" />, accent: 'text-sky-300', accentBg: 'bg-sky-400/10', accentBorder: 'border-sky-400/30', accentHex: '#38bdf8', emoji: '☁️' },
];

// ── Helpers ──
function calcSectorStats(quotes: IntelQuote[]) {
    if (!quotes || quotes.length === 0) return { avgChange: 0, upCount: 0, downCount: 0, totalTickers: 0, leader: null as IntelQuote | null, laggard: null as IntelQuote | null, avgWhale: 0, avgDarkPool: 0, avgAlpha: 0, totalGex: 0, avgSqueeze: 0, avgPcr: 0, totalNetPrem: 0 };

    const valid = quotes.filter(q => q.price > 0);
    if (valid.length === 0) return { avgChange: 0, upCount: 0, downCount: 0, totalTickers: quotes.length, leader: null, laggard: null, avgWhale: 0, avgDarkPool: 0, avgAlpha: 0, totalGex: 0, avgSqueeze: 0, avgPcr: 0, totalNetPrem: 0 };

    const sorted = [...valid].sort((a, b) => b.changePct - a.changePct);
    const avgChange = valid.reduce((s, q) => s + q.changePct, 0) / valid.length;
    const upCount = valid.filter(q => q.changePct > 0).length;
    const downCount = valid.filter(q => q.changePct < 0).length;
    const avgWhale = valid.reduce((s, q) => s + (q.whaleIndex || 0), 0) / valid.length;
    const avgDarkPool = valid.reduce((s, q) => s + (q.darkPoolPct || 0), 0) / valid.length;
    const avgAlpha = valid.reduce((s, q) => s + (q.alphaScore || 0), 0) / valid.length;
    const totalGex = valid.reduce((s, q) => s + (q.gex || 0), 0);
    const avgSqueeze = valid.reduce((s, q) => s + ((q as any).squeezeScore || 0), 0) / valid.length;
    const avgPcr = valid.filter(q => q.pcr > 0).length > 0 ? valid.filter(q => q.pcr > 0).reduce((s, q) => s + q.pcr, 0) / valid.filter(q => q.pcr > 0).length : 0;
    const totalNetPrem = valid.reduce((s, q) => s + (q.netPremium || 0), 0);

    return { avgChange, upCount, downCount, totalTickers: valid.length, leader: sorted[0], laggard: sorted[sorted.length - 1], avgWhale, avgDarkPool, avgAlpha, totalGex, avgSqueeze, avgPcr, totalNetPrem };
}

function getMomentumColor(pct: number): string {
    if (pct >= 2) return 'text-emerald-300';
    if (pct >= 0.5) return 'text-emerald-400';
    if (pct > -0.5) return 'text-white';
    if (pct > -2) return 'text-rose-400';
    return 'text-rose-300';
}

function formatGexCompact(gex: number): string {
    const abs = Math.abs(gex);
    if (abs >= 1e9) return `${(gex / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(gex / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(gex / 1e3).toFixed(0)}K`;
    return gex.toFixed(0);
}

function formatNetPremCompact(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${v > 0 ? '+' : ''}${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${v > 0 ? '+' : ''}${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${v > 0 ? '+' : ''}${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}

// Grid column template for ranking table — shared by header & data rows
const RANKING_GRID = '28px 96px 1fr 70px 62px 50px 60px 52px 92px 18px';

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

    const sectorStats = useMemo(() => {
        return SECTORS.map(s => ({
            def: s,
            stats: calcSectorStats((sectorData as any)[s.key] || []),
            quotes: ((sectorData as any)[s.key] || []) as IntelQuote[],
        }));
    }, [sectorData]);

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

    const sortedSectors = useMemo(() => [...sectorStats].sort((a, b) => b.stats.avgChange - a.stats.avgChange), [sectorStats]);

    return (
        <div className="space-y-6 relative">
            {/* Ambient Glow Effects — strong enough to show through card backgrounds */}
            <div className="absolute top-[-10%] left-[0%] w-[60%] h-[600px] bg-indigo-500/[0.12] blur-[180px] rounded-full pointer-events-none z-0" />
            <div className="absolute top-[35%] right-[-5%] w-[50%] h-[500px] bg-cyan-500/[0.08] blur-[160px] rounded-full pointer-events-none z-0" />
            <div className="absolute bottom-[0%] left-[10%] w-[50%] h-[500px] bg-violet-500/[0.08] blur-[160px] rounded-full pointer-events-none z-0" />

            {/* ═══ HERO HEADER ═══ */}
            <section className="relative z-10 p-6 rounded-2xl border border-white/[0.12] bg-slate-900/60 backdrop-blur-sm shadow-2xl overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute -top-20 -right-20 w-80 h-80 bg-gradient-radial from-cyan-500/8 to-transparent rounded-full blur-3xl animate-pulse" />
                    <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-gradient-radial from-indigo-500/6 to-transparent rounded-full blur-3xl" />
                </div>

                <div className="relative z-10 flex items-start justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[13px] font-bold text-cyan-400 tracking-[0.2em] uppercase flex items-center gap-1.5">
                                <Eye className="w-3.5 h-3.5" />
                                SECTOR COMMAND CENTER
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                            SECTOR <span className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">COMMAND</span>
                        </h1>
                        <p className="text-slate-300 text-sm mt-1 font-mono">
                            10 SECTORS • {marketOverview.totalTickers} ASSETS • REAL-TIME INTELLIGENCE
                        </p>
                    </div>

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
                        <div className="flex items-center gap-3 text-[13px] font-mono">
                            <span className="text-emerald-400 flex items-center gap-1">
                                <TrendingUp className="w-3.5 h-3.5" /> {marketOverview.totalUp}
                            </span>
                            <span className="text-slate-400">|</span>
                            <span className="text-rose-400 flex items-center gap-1">
                                <TrendingDown className="w-3.5 h-3.5" /> {marketOverview.totalDown}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Macro Quick Strip */}
                <div className="relative z-10 mt-4 grid grid-cols-3 gap-3">
                    {marketOverview.topSector && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
                            <span className="text-[13px] text-emerald-300 font-bold uppercase tracking-wider">🔥 TOP</span>
                            <span className={`text-sm font-bold ${marketOverview.topSector.def.accent}`}>
                                {marketOverview.topSector.def.emoji} {marketOverview.topSector.def.shortLabel}
                            </span>
                            <span className="text-[13px] font-mono font-bold text-emerald-300 ml-auto">
                                +{marketOverview.topSector.stats.avgChange.toFixed(2)}%
                            </span>
                        </div>
                    )}
                    {marketOverview.bottomSector && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-500/8 border border-rose-500/20">
                            <span className="text-[13px] text-rose-300 font-bold uppercase tracking-wider">❄️ BOT</span>
                            <span className={`text-sm font-bold ${marketOverview.bottomSector.def.accent}`}>
                                {marketOverview.bottomSector.def.emoji} {marketOverview.bottomSector.def.shortLabel}
                            </span>
                            <span className="text-[13px] font-mono font-bold text-rose-300 ml-auto">
                                {marketOverview.bottomSector.stats.avgChange.toFixed(2)}%
                            </span>
                        </div>
                    )}
                    {marketOverview.hotWhale && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-violet-500/8 border border-violet-500/20">
                            <span className="text-[13px] text-violet-300 font-bold uppercase tracking-wider">🐋 WHALE</span>
                            <span className={`text-sm font-bold ${marketOverview.hotWhale.def.accent}`}>
                                {marketOverview.hotWhale.def.emoji} {marketOverview.hotWhale.def.shortLabel}
                            </span>
                            <span className="text-[13px] font-mono font-bold text-violet-300 ml-auto">
                                IDX {marketOverview.hotWhale.stats.avgWhale.toFixed(0)}
                            </span>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ SECTOR GRID (5×2) ═══ */}
            <section className="relative z-10 grid grid-cols-2 lg:grid-cols-5 gap-3">
                {sectorStats.map(({ def, stats }) => (
                    <div
                        key={def.key}
                        onClick={() => onNavigate(def.tabKey)}
                        onMouseEnter={() => setHoveredSector(def.key)}
                        onMouseLeave={() => setHoveredSector(null)}
                        className={`group relative cursor-pointer rounded-xl border transition-all duration-300 overflow-hidden
                            ${hoveredSector === def.key
                                ? `${def.accentBorder} ${def.accentBg} shadow-lg`
                                : 'border-white/[0.12] bg-slate-900/50 hover:border-white/[0.20]'}
                        `}
                        style={hoveredSector === def.key ? { boxShadow: `0 0 30px ${def.accentHex}20` } : undefined}
                    >
                        <div className="p-4">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className={def.accent}>{def.icon}</span>
                                    <span className={`text-[13px] font-extrabold tracking-wider ${def.accent}`}>
                                        {def.emoji} {def.shortLabel}
                                    </span>
                                </div>
                                <ChevronRight className={`w-3.5 h-3.5 transition-all duration-200 ${hoveredSector === def.key ? `${def.accent} translate-x-0.5` : 'text-slate-400'
                                    }`} />
                            </div>

                            {/* Main Metric: Avg Change */}
                            <div className="mb-3">
                                <div className={`text-2xl font-black font-mono tracking-tight ${getMomentumColor(stats.avgChange)}`}>
                                    {stats.avgChange > 0 ? '+' : ''}{stats.avgChange.toFixed(2)}%
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-emerald-400 text-[13px] font-bold">{stats.upCount}↑</span>
                                    <span className="text-slate-400 text-[13px]">/</span>
                                    <span className="text-rose-400 text-[13px] font-bold">{stats.downCount}↓</span>
                                    <span className="text-slate-300 text-[13px] ml-1">of {stats.totalTickers}</span>
                                </div>
                            </div>

                            {/* Leader/Laggard Row */}
                            {stats.leader && stats.laggard && (
                                <div className="grid grid-cols-2 gap-1.5 mb-3">
                                    <div className="px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/15">
                                        <div className="text-[13px] text-emerald-300 font-bold">LEAD</div>
                                        <div className="flex items-center gap-1">
                                            <img src={`https://assets.parqet.com/logos/symbol/${stats.leader.ticker}`} alt="" className="w-3.5 h-3.5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            <span className="text-[13px] font-black text-emerald-200">{stats.leader.ticker}</span>
                                        </div>
                                        <div className="text-[13px] font-mono font-bold text-emerald-400">
                                            {stats.leader.changePct > 0 ? '+' : ''}{stats.leader.changePct.toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/15">
                                        <div className="text-[13px] text-rose-300 font-bold">LAG</div>
                                        <div className="flex items-center gap-1">
                                            <img src={`https://assets.parqet.com/logos/symbol/${stats.laggard.ticker}`} alt="" className="w-3.5 h-3.5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            <span className="text-[13px] font-black text-rose-200">{stats.laggard.ticker}</span>
                                        </div>
                                        <div className="text-[13px] font-mono font-bold text-rose-400">
                                            {stats.laggard.changePct.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Intelligence Row: 4 metrics */}
                            <div className="grid grid-cols-4 gap-1 bg-white/[0.03] rounded-lg p-1.5 border border-white/[0.06]">
                                <div className="text-center">
                                    <div className="text-[13px] text-white/70 font-bold">GEX</div>
                                    <div className={`text-[13px] font-bold font-mono ${stats.totalGex > 0 ? 'text-emerald-400' : stats.totalGex < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                                        {stats.totalGex !== 0 ? formatGexCompact(stats.totalGex) : '-'}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[13px] text-white/70 font-bold">D.P</div>
                                    <div className={`text-[13px] font-bold font-mono ${stats.avgDarkPool >= 40 ? 'text-white' : 'text-slate-300'}`}>
                                        {stats.avgDarkPool > 0 ? `${stats.avgDarkPool.toFixed(0)}%` : '-'}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[13px] text-white/70 font-bold">🐋</div>
                                    <div className={`text-[13px] font-bold font-mono ${stats.avgWhale >= 50 ? 'text-violet-300' : 'text-slate-300'}`}>
                                        {stats.avgWhale > 0 ? stats.avgWhale.toFixed(0) : '-'}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[13px] text-white/70 font-bold">α</div>
                                    <div className={`text-[13px] font-bold font-mono ${stats.avgAlpha >= 65 ? 'text-amber-300' : stats.avgAlpha >= 50 ? 'text-white' : 'text-slate-300'}`}>
                                        {stats.avgAlpha > 0 ? stats.avgAlpha.toFixed(0) : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Accent Line */}
                        <div className={`h-[2px] w-full transition-opacity duration-300 ${hoveredSector === def.key ? 'opacity-100' : 'opacity-40'
                            }`} style={{ background: `linear-gradient(90deg, transparent, ${def.accentHex}, transparent)` }} />
                    </div>
                ))}
            </section>

            {/* ═══ SECTOR MOMENTUM RANKING — Premium Table ═══ */}
            <section className="relative z-10 rounded-xl border border-white/[0.12] bg-slate-900/50 backdrop-blur-sm overflow-hidden">
                {/* Header Row */}
                <div className="grid items-center px-5 py-3 border-b border-white/[0.10]"
                    style={{ gridTemplateColumns: RANKING_GRID }}>
                    <span />
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-400" />
                        <span className="text-[13px] font-extrabold text-white tracking-wider uppercase">RANKING</span>
                    </div>
                    <span />
                    <span className="text-[13px] font-bold text-slate-300 text-center">AVG Δ</span>
                    <span className="text-[13px] font-bold text-slate-300 text-center">GEX</span>
                    <span className="text-[13px] font-bold text-slate-300 text-center">PCR</span>
                    <span className="text-[13px] font-bold text-slate-300 text-center">D.POOL</span>
                    <span className="text-[13px] font-bold text-slate-300 text-center">ALPHA</span>
                    <span className="text-[13px] font-bold text-slate-300 text-right">LEADER</span>
                    <span />
                </div>

                {/* Data Rows */}
                <div>
                    {sortedSectors.map((s, idx) => {
                        const pct = s.stats.avgChange;
                        const maxAbs = Math.max(...sectorStats.map(x => Math.abs(x.stats.avgChange)), 0.01);
                        const barWidth = Math.min(100, (Math.abs(pct) / maxAbs) * 100);
                        const isPositive = pct >= 0;
                        const leaderTicker = s.stats.leader?.ticker;

                        return (
                            <div
                                key={s.def.key}
                                className={`grid items-center px-5 py-2.5 cursor-pointer transition-colors group
                                    ${idx % 2 === 0 ? 'bg-white/[0.025]' : 'bg-transparent'}
                                    hover:bg-white/[0.06]`}
                                style={{ gridTemplateColumns: RANKING_GRID }}
                                onClick={() => onNavigate(s.def.tabKey)}
                            >
                                {/* Rank */}
                                <span className={`text-[13px] font-black font-mono ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-200' : idx === 2 ? 'text-amber-600' : 'text-slate-400'}`}>
                                    {idx + 1}
                                </span>

                                {/* Sector Name */}
                                <div className="flex items-center gap-1.5">
                                    <span className={`${s.def.accent} opacity-90`}>{s.def.icon}</span>
                                    <span className="text-[13px] font-bold text-white">
                                        {s.def.shortLabel}
                                    </span>
                                </div>

                                {/* Momentum Bar */}
                                <div className="h-5 bg-white/[0.05] rounded-full overflow-hidden relative border border-white/[0.08] mx-2">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${isPositive ? 'bg-gradient-to-r from-emerald-600/70 to-emerald-400/50' : 'bg-gradient-to-r from-rose-600/70 to-rose-400/50'}`}
                                        style={{ width: `${barWidth}%` }}
                                    />
                                </div>

                                {/* Avg Change */}
                                <span className={`text-center text-[13px] font-black font-mono ${getMomentumColor(pct)}`}>
                                    {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
                                </span>

                                {/* GEX */}
                                <span className={`text-center text-[13px] font-bold font-mono ${s.stats.totalGex > 0 ? 'text-emerald-400' : s.stats.totalGex < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                    {s.stats.totalGex !== 0 ? formatGexCompact(s.stats.totalGex) : '-'}
                                </span>

                                {/* PCR */}
                                <span className={`text-center text-[13px] font-bold font-mono ${s.stats.avgPcr < 0.8 ? 'text-emerald-400' : s.stats.avgPcr > 1.1 ? 'text-rose-400' : 'text-white'}`}>
                                    {s.stats.avgPcr > 0 ? s.stats.avgPcr.toFixed(2) : '-'}
                                </span>

                                {/* Dark Pool */}
                                <span className={`text-center text-[13px] font-bold font-mono ${s.stats.avgDarkPool >= 40 ? 'text-white' : 'text-slate-300'}`}>
                                    {s.stats.avgDarkPool > 0 ? `${s.stats.avgDarkPool.toFixed(0)}%` : '-'}
                                </span>

                                {/* Alpha */}
                                <span className={`text-center text-[13px] font-bold font-mono ${s.stats.avgAlpha >= 65 ? 'text-amber-300' : s.stats.avgAlpha >= 50 ? 'text-white' : 'text-slate-400'}`}>
                                    {s.stats.avgAlpha > 0 ? s.stats.avgAlpha.toFixed(0) : '-'}
                                </span>

                                {/* Leader Ticker + Logo */}
                                <div className="flex items-center gap-1.5 justify-end">
                                    {leaderTicker && (
                                        <img
                                            src={`https://assets.parqet.com/logos/symbol/${leaderTicker}`}
                                            alt={leaderTicker}
                                            className="w-4 h-4 rounded-full"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    )}
                                    <span className="text-[13px] font-bold text-slate-200">
                                        {leaderTicker || '-'}
                                    </span>
                                </div>

                                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors" />
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
