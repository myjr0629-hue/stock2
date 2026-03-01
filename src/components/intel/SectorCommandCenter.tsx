'use client';
// ============================================================================
// SectorCommandCenter — Premium 10-Sector Dashboard
// v2.0: Brighter, richer, premium redesign
// ============================================================================

import React, { useMemo, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
    TrendingUp, TrendingDown, Activity, Zap, Shield, ShieldAlert,
    Rocket, Bot, Orbit, Cpu, CreditCard, Cloud,
    BarChart3, Eye, ChevronRight, Flame, Snowflake
} from 'lucide-react';
import { ProGate } from '@/components/gate/FeatureGate';
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
    { key: 'm7', tabKey: 'M7', label: 'Magnificent 7', shortLabel: 'M7', icon: <Orbit className="w-4 h-4" />, accent: 'text-cyan-400', accentBg: 'bg-cyan-500/10', accentBorder: 'border-cyan-500/30', accentHex: '#06b6d4', emoji: '' },
    { key: 'physicalAI', tabKey: 'PHYSICAL_AI', label: 'Physical AI', shortLabel: 'PHYS AI', icon: <Bot className="w-4 h-4" />, accent: 'text-amber-400', accentBg: 'bg-amber-500/10', accentBorder: 'border-amber-500/30', accentHex: '#f59e0b', emoji: '' },
    { key: 'siliconCore', tabKey: 'SILICON_CORE', label: 'Silicon Core', shortLabel: 'SILICON', icon: <Zap className="w-4 h-4" />, accent: 'text-amber-300', accentBg: 'bg-amber-400/10', accentBorder: 'border-amber-400/30', accentHex: '#fbbf24', emoji: '' },
    { key: 'powerMatrix', tabKey: 'POWER_MATRIX', label: 'Power Matrix', shortLabel: 'POWER', icon: <Activity className="w-4 h-4" />, accent: 'text-emerald-400', accentBg: 'bg-emerald-500/10', accentBorder: 'border-emerald-500/30', accentHex: '#10b981', emoji: '' },
    { key: 'bioPulse', tabKey: 'BIO_PULSE', label: 'Bio Pulse', shortLabel: 'BIO', icon: <ShieldAlert className="w-4 h-4" />, accent: 'text-rose-400', accentBg: 'bg-rose-500/10', accentBorder: 'border-rose-500/30', accentHex: '#f43f5e', emoji: '' },
    { key: 'cyberShield', tabKey: 'CYBER_SHIELD', label: 'Cyber Shield', shortLabel: 'CYBER', icon: <Shield className="w-4 h-4" />, accent: 'text-cyan-300', accentBg: 'bg-cyan-400/10', accentBorder: 'border-cyan-400/30', accentHex: '#22d3ee', emoji: '' },
    { key: 'orbitDefense', tabKey: 'ORBIT_DEFENSE', label: 'Orbit Defense', shortLabel: 'ORBIT', icon: <Rocket className="w-4 h-4" />, accent: 'text-sky-400', accentBg: 'bg-sky-500/10', accentBorder: 'border-sky-500/30', accentHex: '#0ea5e9', emoji: '' },
    { key: 'quantumEdge', tabKey: 'QUANTUM_EDGE', label: 'Quantum Edge', shortLabel: 'QUANTUM', icon: <Cpu className="w-4 h-4" />, accent: 'text-fuchsia-400', accentBg: 'bg-fuchsia-500/10', accentBorder: 'border-fuchsia-500/30', accentHex: '#d946ef', emoji: '' },
    { key: 'fintechPulse', tabKey: 'FINTECH_PULSE', label: 'Fintech Pulse', shortLabel: 'FINTECH', icon: <CreditCard className="w-4 h-4" />, accent: 'text-lime-400', accentBg: 'bg-lime-500/10', accentBorder: 'border-lime-500/30', accentHex: '#84cc16', emoji: '' },
    { key: 'cloudFortress', tabKey: 'CLOUD_FORTRESS', label: 'Cloud Fortress', shortLabel: 'CLOUD', icon: <Cloud className="w-4 h-4" />, accent: 'text-sky-300', accentBg: 'bg-sky-400/10', accentBorder: 'border-sky-400/30', accentHex: '#38bdf8', emoji: '' },
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
    const gt = useTranslations('gate');
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
            {/* Ambient Glow Effects — emerald tone for premium feel */}
            <div className="absolute top-[-10%] left-[0%] w-[60%] h-[600px] bg-emerald-400/[0.14] blur-[180px] rounded-full pointer-events-none z-0" />
            <div className="absolute top-[35%] right-[-5%] w-[50%] h-[500px] bg-teal-400/[0.10] blur-[160px] rounded-full pointer-events-none z-0" />
            <div className="absolute bottom-[0%] left-[10%] w-[50%] h-[500px] bg-emerald-500/[0.09] blur-[160px] rounded-full pointer-events-none z-0" />

            {/* ═══ HERO HEADER ═══ */}
            <section className="relative z-10 p-6 rounded-2xl border border-emerald-500/[0.12] bg-[#0d1117]/80 backdrop-blur-sm shadow-2xl overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute -top-20 -right-20 w-80 h-80 bg-gradient-radial from-emerald-400/10 to-transparent rounded-full blur-3xl animate-pulse" />
                    <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-gradient-radial from-teal-400/8 to-transparent rounded-full blur-3xl" />
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

                    <div className="flex-shrink-0">
                        <div className={`relative rounded-2xl border backdrop-blur-md px-5 py-3 ${marketSentiment === 'BULLISH' ? 'bg-emerald-500/20 border-emerald-400/40' :
                            marketSentiment === 'BEARISH' ? 'bg-rose-400/15 border-rose-300/30' :
                                'bg-amber-500/20 border-amber-400/40'
                            }`} style={{
                                boxShadow: marketSentiment === 'BULLISH' ? '0 0 30px rgba(16,185,129,0.15)' :
                                    marketSentiment === 'BEARISH' ? '0 0 30px rgba(251,113,133,0.10)' :
                                        '0 0 30px rgba(245,158,11,0.15)'
                            }}>
                            {/* Sentiment Row */}
                            <div className="flex items-center gap-2.5 mb-2">
                                <div className={`p-1.5 rounded-lg ${marketSentiment === 'BULLISH' ? 'bg-emerald-500/25' :
                                    marketSentiment === 'BEARISH' ? 'bg-rose-500/25' : 'bg-amber-500/25'
                                    }`}>
                                    {sentimentIcon}
                                </div>
                                <span className={`text-sm font-black tracking-[0.15em] ${sentimentColor}`}>
                                    {marketSentiment}
                                </span>
                                <span className={`text-xl font-mono font-black ${getMomentumColor(marketOverview.avgChange)}`}>
                                    {marketOverview.avgChange > 0 ? '+' : ''}{marketOverview.avgChange.toFixed(2)}%
                                </span>
                            </div>
                            {/* Up/Down Pills */}
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[13px] font-bold text-emerald-300 font-mono">{marketOverview.totalUp}</span>
                                </div>
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/30">
                                    <TrendingDown className="w-3 h-3 text-rose-400" />
                                    <span className="text-[13px] font-bold text-rose-300 font-mono">{marketOverview.totalDown}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Macro Quick Strip */}
                <div className="relative z-10 mt-4 grid grid-cols-3 gap-3">
                    {marketOverview.topSector && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
                            <span className="text-[13px] text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> TOP</span>
                            <span className={`text-base font-bold ${marketOverview.topSector.def.accent} flex items-center gap-1`}>
                                {marketOverview.topSector.def.icon} {marketOverview.topSector.def.shortLabel}
                            </span>
                            <span className="text-[13px] font-mono font-bold text-emerald-300 ml-auto">
                                +{marketOverview.topSector.stats.avgChange.toFixed(2)}%
                            </span>
                        </div>
                    )}
                    {marketOverview.bottomSector && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-500/8 border border-rose-500/20">
                            <span className="text-[13px] text-rose-300 font-bold uppercase tracking-wider flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> BOT</span>
                            <span className={`text-base font-bold ${marketOverview.bottomSector.def.accent} flex items-center gap-1`}>
                                {marketOverview.bottomSector.def.icon} {marketOverview.bottomSector.def.shortLabel}
                            </span>
                            <span className="text-[13px] font-mono font-bold text-rose-300 ml-auto">
                                {marketOverview.bottomSector.stats.avgChange.toFixed(2)}%
                            </span>
                        </div>
                    )}
                    {marketOverview.hotWhale && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-violet-500/8 border border-violet-500/20">
                            <span className="text-[13px] text-violet-300 font-bold uppercase tracking-wider flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" /> WHALE</span>
                            <span className={`text-base font-bold ${marketOverview.hotWhale.def.accent} flex items-center gap-1`}>
                                {marketOverview.hotWhale.def.icon} {marketOverview.hotWhale.def.shortLabel}
                            </span>
                            <span className="text-[13px] font-mono font-bold text-violet-300 ml-auto">
                                IDX {marketOverview.hotWhale.stats.avgWhale.toFixed(0)}
                            </span>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ ALPHA LEADERS / LAGGARDS ═══ */}
            {(() => {
                // Aggregate all 70 tickers with sector info
                const allWithSector = sectorStats.flatMap(s =>
                    s.quotes.filter(q => q.price > 0 && q.alphaScore > 0).map(q => ({
                        ...q,
                        sectorLabel: s.def.shortLabel,
                        sectorTabKey: s.def.tabKey,
                        sectorIcon: s.def.icon,
                        sectorAccent: s.def.accent,
                    }))
                );
                const sorted = [...allWithSector].sort((a, b) => b.alphaScore - a.alphaScore);
                const top3 = sorted.slice(0, 3);
                const bottom3 = sorted.slice(-3).reverse();

                const getLogoUrl = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

                const getGradeColor = (score: number) => {
                    if (score >= 70) return { stroke: '#34d399', text: 'text-emerald-400', label: 'A' };
                    if (score >= 55) return { stroke: '#60a5fa', text: 'text-blue-400', label: 'B' };
                    if (score >= 40) return { stroke: '#fbbf24', text: 'text-amber-400', label: 'C' };
                    return { stroke: '#f87171', text: 'text-rose-400', label: 'D' };
                };

                const CircularGauge = ({ score, size = 56 }: { score: number; size?: number }) => {
                    const { stroke, text, label } = getGradeColor(score);
                    const radius = (size - 6) / 2;
                    const circumference = 2 * Math.PI * radius;
                    const progress = (score / 100) * circumference;
                    return (
                        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
                            <svg width={size} height={size} className="transform -rotate-90">
                                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
                                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={stroke} strokeWidth={3}
                                    strokeDasharray={circumference} strokeDashoffset={circumference - progress}
                                    strokeLinecap="round" className="transition-all duration-700" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className={`text-[14px] font-black ${text} leading-none`}>{label}</span>
                                <span className="text-[13px] font-mono text-slate-200">{Math.round(score)}</span>
                            </div>
                        </div>
                    );
                };

                const AlphaCard = ({ ticker, alphaScore, changePct, sectorLabel, sectorTabKey, sectorIcon, sectorAccent, rank, isTop }: any) => (
                    <div
                        onClick={() => onNavigate(sectorTabKey)}
                        className={`group relative cursor-pointer rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02]
                            border backdrop-blur-md
                            ${isTop
                                ? 'border-emerald-500/20 bg-emerald-500/[0.08] hover:border-emerald-400/40 hover:bg-emerald-500/[0.14]'
                                : 'border-rose-500/20 bg-rose-500/[0.08] hover:border-rose-400/40 hover:bg-rose-500/[0.14]'
                            }`}
                    >
                        {/* Glassmorphism inner glow */}
                        <div className="absolute inset-0 pointer-events-none">
                            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl ${isTop ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`} />
                        </div>

                        <div className="relative z-10 py-2.5 px-4 flex items-center gap-3">
                            {/* Rank Badge */}
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[13px] font-black
                                ${isTop ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>
                                {rank}
                            </div>

                            {/* Logo with fallback initial */}
                            <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 border border-white/10 flex-shrink-0 relative flex items-center justify-center">
                                <span className="text-[13px] font-bold text-slate-200 absolute">{ticker.slice(0, 2)}</span>
                                <img src={getLogoUrl(ticker)} alt={ticker} className="w-full h-full object-cover absolute inset-0"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>

                            {/* Ticker → Change% → Sector (한줄) */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-[17px] font-bold text-white">{ticker}</span>
                                <span className={`text-[15px] ${changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono font-bold`}>
                                    {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                                </span>
                                <span className="text-slate-200/40">|</span>
                                <span className={`${sectorAccent}`}>{sectorIcon}</span>
                                <span className="text-[17px] text-slate-200 font-mono">{sectorLabel}</span>
                            </div>

                            {/* Alpha Gauge */}
                            <CircularGauge score={alphaScore} />

                            {/* Navigate arrow */}
                            <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-white transition-colors flex-shrink-0" />
                        </div>
                    </div>
                );

                return allWithSector.length > 0 ? (
                    <section className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* TOP 3 */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1 mb-3">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                <span className="text-[13px] font-bold text-emerald-400 uppercase tracking-wider">ALPHA LEADERS</span>
                                <span className="text-[13px] text-slate-200 font-mono ml-auto">TOP 3 / {allWithSector.length}</span>
                            </div>
                            {top3.map((q, i) => (
                                i < 2 ? (
                                    <ProGate key={q.ticker} title={`Alpha #${i + 1}`} fomoMessage={gt('fomoAlphaLeaders')} mode="blur" compact>
                                        <AlphaCard {...q} rank={i + 1} isTop={true} />
                                    </ProGate>
                                ) : (
                                    <AlphaCard key={q.ticker} {...q} rank={i + 1} isTop={true} />
                                )
                            ))}
                        </div>

                        {/* BOTTOM 3 */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1 mb-3">
                                <TrendingDown className="w-4 h-4 text-rose-400" />
                                <span className="text-[13px] font-bold text-rose-400 uppercase tracking-wider">ALPHA LAGGARDS</span>
                                <span className="text-[13px] text-slate-200 font-mono ml-auto">BOTTOM 3 / {allWithSector.length}</span>
                            </div>
                            {bottom3.map((q, i) => (
                                <AlphaCard key={q.ticker} {...q} rank={allWithSector.length - 2 + i} isTop={false} />
                            ))}
                        </div>
                    </section>
                ) : null;
            })()}

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
                                : 'border-white/[0.10] bg-[#0d1117]/70 hover:border-emerald-400/[0.18]'}
                        `}
                        style={hoveredSector === def.key ? { boxShadow: `0 0 30px ${def.accentHex}20` } : undefined}
                    >
                        {/* Infographic Background */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            {/* Accent radial glow */}
                            <div className="absolute -top-6 -right-6 w-36 h-36 rounded-full opacity-[0.08]"
                                style={{ background: `radial-gradient(circle, ${def.accentHex}, transparent 70%)` }} />
                            {/* Grid dots */}
                            <div className="absolute inset-0 opacity-[0.05]"
                                style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                            {/* Dynamic chart line — reflects sector momentum */}
                            <svg className="absolute bottom-0 right-0 w-28 h-20 opacity-[0.25]" viewBox="0 0 96 64" fill="none">
                                <polyline
                                    points={stats.avgChange >= 0
                                        ? '0,52 16,48 32,44 48,36 64,30 80,22 96,16'
                                        : '0,16 16,22 32,28 48,36 64,42 80,50 96,54'}
                                    stroke={stats.avgChange >= 0 ? '#10b981' : '#fb7185'}
                                    strokeWidth="2.5" fill="none" strokeLinecap="round" />
                                <polyline
                                    points={stats.avgChange >= 0
                                        ? '0,56 16,54 32,50 48,46 64,42 80,38 96,34'
                                        : '0,34 16,38 32,42 48,46 64,50 80,54 96,56'}
                                    stroke="white" strokeWidth="1.5" fill="none" opacity="0.4" />
                            </svg>
                        </div>
                        <div className="relative z-10 p-4">
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
            <section className="relative z-10 rounded-xl border border-emerald-500/[0.12] bg-[#0d1117]/70 backdrop-blur-sm overflow-hidden">
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
