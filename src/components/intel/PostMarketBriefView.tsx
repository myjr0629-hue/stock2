'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    ChevronDown, Sparkles, Loader2, FileText, Orbit, Bot, Zap, Activity,
    ShieldAlert, Shield, Rocket, Cpu, CreditCard, Cloud,
    TrendingUp, TrendingDown, AlertTriangle, Target, Newspaper, BarChart3,
    ArrowUpRight, ArrowDownRight, Minus, Eye, ArrowRight, Calendar, Flame
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { m7Config } from '@/configs/m7.config';
import { physicalAIConfig } from '@/configs/physicalai.config';
import { siliconCoreConfig } from '@/configs/siliconcore.config';
import { powerMatrixConfig } from '@/configs/powermatrix.config';
import { bioPulseConfig } from '@/configs/biopulse.config';
import { cyberShieldConfig } from '@/configs/cybershield.config';
import { orbitDefenseConfig } from '@/configs/orbitdefense.config';
import { quantumEdgeConfig } from '@/configs/quantumedge.config';
import { fintechPulseConfig } from '@/configs/fintechpulse.config';
import { cloudFortressConfig } from '@/configs/cloudfortress.config';
import type { SectorConfig } from '@/types/sector';
import dynamic from 'next/dynamic';

const TacticalReportDeck = dynamic(
    () => import('@/components/intel/TacticalReportDeck').then(m => m.TacticalReportDeck),
    { ssr: false }
);

const ALL_SECTORS: { config: SectorConfig; icon: React.ReactNode; accentColor: string }[] = [
    { config: m7Config, icon: <Orbit className="w-4 h-4" />, accentColor: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/25' },
    { config: physicalAIConfig, icon: <Bot className="w-4 h-4" />, accentColor: 'text-amber-500 bg-amber-500/15 border-amber-500/25' },
    { config: siliconCoreConfig, icon: <Zap className="w-4 h-4" />, accentColor: 'text-amber-400 bg-amber-400/15 border-amber-400/25' },
    { config: powerMatrixConfig, icon: <Activity className="w-4 h-4" />, accentColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25' },
    { config: bioPulseConfig, icon: <ShieldAlert className="w-4 h-4" />, accentColor: 'text-rose-400 bg-rose-500/15 border-rose-500/25' },
    { config: cyberShieldConfig, icon: <Shield className="w-4 h-4" />, accentColor: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/25' },
    { config: orbitDefenseConfig, icon: <Rocket className="w-4 h-4" />, accentColor: 'text-sky-400 bg-sky-500/15 border-sky-500/25' },
    { config: quantumEdgeConfig, icon: <Cpu className="w-4 h-4" />, accentColor: 'text-fuchsia-400 bg-fuchsia-500/15 border-fuchsia-500/25' },
    { config: fintechPulseConfig, icon: <CreditCard className="w-4 h-4" />, accentColor: 'text-lime-400 bg-lime-500/15 border-lime-500/25' },
    { config: cloudFortressConfig, icon: <Cloud className="w-4 h-4" />, accentColor: 'text-sky-300 bg-sky-400/15 border-sky-400/25' },
];

// ── Localized text helper ──
type L10n = { ko: string; en: string; ja: string };
type L10nArr = { ko: string[]; en: string[]; ja: string[] };

function lt(obj: L10n | undefined, locale: string): string {
    if (!obj) return '';
    return (obj as any)[locale] || obj.en || obj.ko || '';
}

function la(obj: L10nArr | undefined, locale: string): string[] {
    if (!obj) return [];
    return (obj as any)[locale] || obj.en || obj.ko || [];
}

// ── Section titles per locale ──
const SECTION_TITLES: Record<string, { ko: string; en: string; ja: string }> = {
    marketOverview: { ko: 'MARKET PULSE', en: 'MARKET PULSE', ja: 'MARKET PULSE' },
    sectorRotation: { ko: 'SECTOR FLOW MAP', en: 'SECTOR FLOW MAP', ja: 'SECTOR FLOW MAP' },
    newsImpact: { ko: 'MARKET CATALYST', en: 'MARKET CATALYST', ja: 'MARKET CATALYST' },
    gammaOptions: { ko: 'OPTIONS STRUCTURE', en: 'OPTIONS STRUCTURE', ja: 'OPTIONS STRUCTURE' },
    outlook: { ko: 'SCENARIO MAP', en: 'SCENARIO MAP', ja: 'SCENARIO MAP' },
};

// ── Indicator Metadata: Logos & Category Colors ──
const INDICATOR_META: Record<string, { logoUrl: string; category: string; color: string; borderColor: string; bgColor: string }> = {
    'VIX':        { logoUrl: 'https://s3-symbol-logo.tradingview.com/cboe-global-markets.svg',  category: 'volatility', color: 'text-orange-400', borderColor: 'border-orange-500/20', bgColor: 'rgba(249,115,22,0.06)' },
    'VIX3M':      { logoUrl: 'https://s3-symbol-logo.tradingview.com/cboe-global-markets.svg',  category: 'volatility', color: 'text-orange-400', borderColor: 'border-orange-500/20', bgColor: 'rgba(249,115,22,0.06)' },
    'S&P 500':    { logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/s-and-p-500.svg',  category: 'equity',     color: 'text-cyan-400',   borderColor: 'border-cyan-500/20',   bgColor: 'rgba(6,182,212,0.06)' },
    'NASDAQ':     { logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/nasdaq-100.svg',   category: 'equity',     color: 'text-cyan-400',   borderColor: 'border-cyan-500/20',   bgColor: 'rgba(6,182,212,0.06)' },
    'Russell 2K': { logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/russell-2000.svg', category: 'equity',     color: 'text-cyan-400',   borderColor: 'border-cyan-500/20',   bgColor: 'rgba(6,182,212,0.06)' },
    'US 10Y':     { logoUrl: 'https://s3-symbol-logo.tradingview.com/country/US.svg',           category: 'bond',       color: 'text-amber-400',  borderColor: 'border-amber-500/20',  bgColor: 'rgba(245,158,11,0.06)' },
    'TLT':        { logoUrl: 'https://s3-symbol-logo.tradingview.com/ishares.svg',              category: 'bond',       color: 'text-amber-400',  borderColor: 'border-amber-500/20',  bgColor: 'rgba(245,158,11,0.06)' },
    'Gold':       { logoUrl: 'https://s3-symbol-logo.tradingview.com/metal/gold.svg',           category: 'commodity',  color: 'text-yellow-400', borderColor: 'border-yellow-500/20', bgColor: 'rgba(234,179,8,0.06)' },
    'WTI Oil':    { logoUrl: 'https://s3-symbol-logo.tradingview.com/crude-oil.svg',            category: 'commodity',  color: 'text-yellow-400', borderColor: 'border-yellow-500/20', bgColor: 'rgba(234,179,8,0.06)' },
    'BTC':        { logoUrl: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg',       category: 'crypto',     color: 'text-purple-400', borderColor: 'border-purple-500/20', bgColor: 'rgba(168,85,247,0.06)' },
    'USD/KRW':    { logoUrl: 'https://s3-symbol-logo.tradingview.com/country/KR.svg',           category: 'fx',         color: 'text-sky-400',    borderColor: 'border-sky-500/20',    bgColor: 'rgba(14,165,233,0.06)' },
    'USD/JPY':    { logoUrl: 'https://s3-symbol-logo.tradingview.com/country/JP.svg',           category: 'fx',         color: 'text-sky-400',    borderColor: 'border-sky-500/20',    bgColor: 'rgba(14,165,233,0.06)' },
};

// ── Glass Card Style ──
const GLASS = 'rounded-xl border border-white/10 p-5';
const GLASS_BG = { background: 'rgba(11,15,23,0.6)', backdropFilter: 'blur(12px)' };
const GLASS_ACCENT_BG = { background: 'rgba(11,15,23,0.4)', backdropFilter: 'blur(16px)' };

// ── Stagger animation CSS ──
const staggerStyle = (i: number) => ({
    animation: 'fadeSlideUp 0.5s ease-out both',
    animationDelay: `${i * 100}ms`,
});

// ── Animated Number Hook ──
function useAnimatedNumber(target: number, duration = 800) {
    const [val, setVal] = useState(0);
    const ref = useRef<number>(0);
    useEffect(() => {
        const start = ref.current;
        const diff = target - start;
        if (Math.abs(diff) < 0.01) { setVal(target); return; }
        const startTime = performance.now();
        const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = start + diff * eased;
            setVal(current);
            ref.current = current;
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [target, duration]);
    return val;
}

// ── Fear & Greed Semicircle Gauge ──
function FearGreedGauge({ value }: { value: number }) {
    const animVal = useAnimatedNumber(value);
    const angle = -90 + (animVal / 100) * 180;
    const getColor = (v: number) => {
        if (v <= 25) return '#ef4444';
        if (v <= 45) return '#f97316';
        if (v <= 55) return '#eab308';
        if (v <= 75) return '#84cc16';
        return '#22c55e';
    };
    const getLabel = (v: number) => {
        if (v <= 25) return 'Extreme Fear';
        if (v <= 45) return 'Fear';
        if (v <= 55) return 'Neutral';
        if (v <= 75) return 'Greed';
        return 'Extreme Greed';
    };
    return (
        <div className="flex flex-col items-center">
            <svg width="100" height="58" viewBox="0 0 100 58">
                <defs>
                    <linearGradient id="fgGrad" x1="0%" y1="0%" x2="100%">
                        <stop offset="0%" stopColor="#ef4444" />
                        <stop offset="25%" stopColor="#f97316" />
                        <stop offset="50%" stopColor="#eab308" />
                        <stop offset="75%" stopColor="#84cc16" />
                        <stop offset="100%" stopColor="#22c55e" />
                    </linearGradient>
                </defs>
                <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" strokeLinecap="round" />
                <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="url(#fgGrad)" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${(animVal / 100) * 125.6} 125.6`} />
                <line x1="50" y1="52" x2="50" y2="18" stroke={getColor(animVal)} strokeWidth="2" strokeLinecap="round"
                    transform={`rotate(${angle}, 50, 52)`} style={{ transition: 'transform 0.8s ease-out' }} />
                <circle cx="50" cy="52" r="3" fill={getColor(animVal)} />
            </svg>
            <span className="text-[20px] font-black font-mono mt-1" style={{ color: getColor(animVal) }}>{Math.round(animVal)}</span>
            <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider">{getLabel(animVal)}</span>
        </div>
    );
}

// ── GEX Semicircle Gauge (SVG) ──
function GexSemiGauge({ regime, label }: { regime: string; label: string }) {
    const pos = regime === 'LONG' ? 85 : regime === 'SHORT' ? 15 : 50;
    const animPos = useAnimatedNumber(pos);
    const angle = -90 + (animPos / 100) * 180;
    const color = regime === 'LONG' ? '#22c55e' : regime === 'SHORT' ? '#ef4444' : '#eab308';
    return (
        <div className="flex flex-col items-center">
            <svg width="100" height="58" viewBox="0 0 100 58">
                <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" strokeLinecap="round" />
                <defs><linearGradient id="gexGrad" x1="0%" x2="100%"><stop offset="0%" stopColor="#ef4444" /><stop offset="50%" stopColor="#eab308" /><stop offset="100%" stopColor="#22c55e" /></linearGradient></defs>
                <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="url(#gexGrad)" strokeWidth="6" strokeLinecap="round" opacity="0.4" />
                <line x1="50" y1="52" x2="50" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round"
                    transform={`rotate(${angle}, 50, 52)`} />
                <circle cx="50" cy="52" r="3" fill={color} />
            </svg>
            <span className="text-[13px] font-black font-mono mt-1 text-white">{label}</span>
        </div>
    );
}

// ── PCR Donut Chart ──
function PcrDonut({ pcr }: { pcr: number }) {
    const putPct = Math.min((pcr / (1 + pcr)) * 100, 100);
    const animPut = useAnimatedNumber(putPct);
    const circumference = 2 * Math.PI * 32;
    const putArc = (animPut / 100) * circumference;
    return (
        <div className="flex flex-col items-center">
            <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(34,197,94,0.3)" strokeWidth="8" />
                <circle cx="40" cy="40" r="32" fill="none" stroke="#ef4444" strokeWidth="8"
                    strokeDasharray={`${putArc} ${circumference}`} strokeDashoffset="0"
                    transform="rotate(-90 40 40)" strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease-out' }} />
                <text x="40" y="38" textAnchor="middle" className="fill-white text-[14px] font-black font-mono">{pcr.toFixed(2)}</text>
                <text x="40" y="50" textAnchor="middle" className="fill-slate-300 text-[12px] font-bold">PCR</text>
            </svg>
            <div className="flex gap-3 mt-1">
                <span className="text-[12px] font-bold text-rose-400">PUT {Math.round(animPut)}%</span>
                <span className="text-[12px] font-bold text-emerald-400">CALL {Math.round(100 - animPut)}%</span>
            </div>
        </div>
    );
}

// ── Tone/Bias Badge Component ──
function ToneBadge({ tone }: { tone: string }) {
    const config: Record<string, { color: string; icon: React.ReactNode }> = {
        BULLISH: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <TrendingUp className="w-3.5 h-3.5" /> },
        BEARISH: { color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <TrendingDown className="w-3.5 h-3.5" /> },
        MIXED: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <Minus className="w-3.5 h-3.5" /> },
        CAUTIOUS: { color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
        NEUTRAL: { color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', icon: <Minus className="w-3.5 h-3.5" /> },
    };
    const c = config[tone] || config.NEUTRAL;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[12px] font-bold tracking-wide border rounded-full ${c.color}`}>
            {c.icon} {tone}
        </span>
    );
}

// ── Sector Change Bar (Infographic) ──
function ChangeBar({ change, isPositive, maxVal }: { change: string; isPositive: boolean; maxVal: number }) {
    const numVal = Math.abs(parseFloat(change.replace(/[^0-9.\-]/g, '')) || 0);
    const widthPct = maxVal > 0 ? Math.min((numVal / maxVal) * 100, 100) : 0;
    return (
        <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[14px] font-black font-mono min-w-[60px] text-right ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {change}
            </span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${isPositive ? 'bg-gradient-to-r from-emerald-500/40 to-emerald-400' : 'bg-gradient-to-r from-rose-500/40 to-rose-400'}`}
                    style={{ width: `${widthPct}%` }}
                />
            </div>
        </div>
    );
}

// ── GEX Gauge Bar (SVG Infographic) ──
function GexGauge({ regime }: { regime: string }) {
    const pos = regime === 'LONG' ? 80 : regime === 'SHORT' ? 20 : 50;
    return (
        <div className="mt-2">
            <div className="relative h-3 rounded-full bg-white/5 overflow-hidden">
                {/* Gradient background: red → yellow → green */}
                <div className="absolute inset-0 bg-gradient-to-r from-rose-500/30 via-amber-500/30 to-emerald-500/30" />
                {/* Position marker */}
                <div
                    className="absolute top-0 h-full w-3 rounded-full bg-white shadow-lg shadow-white/20 border border-white/50 transition-all duration-500"
                    style={{ left: `calc(${pos}% - 6px)` }}
                />
            </div>
            <div className="flex justify-between mt-1">
                <span className="text-[12px] text-rose-400 font-mono">SHORT</span>
                <span className="text-[12px] text-slate-300 font-mono">NEUTRAL</span>
                <span className="text-[12px] text-emerald-400 font-mono">LONG</span>
            </div>
        </div>
    );
}

// ── PCR Ratio Bar ──
function PcrBar({ pcr }: { pcr: number }) {
    const putPct = Math.min((pcr / 2) * 100, 100);
    return (
        <div className="mt-2">
            <div className="h-2.5 rounded-full bg-white/5 overflow-hidden flex">
                <div className="h-full bg-gradient-to-r from-rose-500/60 to-rose-400/80 transition-all duration-500" style={{ width: `${putPct}%` }} />
                <div className="h-full bg-gradient-to-r from-emerald-400/80 to-emerald-500/60 flex-1" />
            </div>
            <div className="flex justify-between mt-1">
                <span className="text-[12px] text-rose-400/70 font-mono">PUT</span>
                <span className="text-[12px] text-emerald-400/70 font-mono">CALL</span>
            </div>
        </div>
    );
}

export function PostMarketBriefView() {
    const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
    const [brief, setBrief] = useState<any>(null);
    const [briefLoading, setBriefLoading] = useState(true);
    const t = useTranslations('intel.postMarketUI');
    const locale = useLocale();

    useEffect(() => {
        async function fetchBrief() {
            try {
                const res = await fetch('/api/intel/cross-sector-brief', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.structured) {
                        setBrief(data);
                    }
                }
            } catch (e) {
                console.error('[PostMarketBrief] Fetch failed:', e);
            } finally {
                setBriefLoading(false);
            }
        }
        fetchBrief();
    }, []);

    const toggleSector = (id: string) => {
        setExpandedSectors(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const expandAll = () => setExpandedSectors(new Set(ALL_SECTORS.map(s => s.config.id)));
    const collapseAll = () => setExpandedSectors(new Set());

    const d = brief?.structured;
    const macroIndicators = brief?.macroIndicators || [];
    const vixTS = brief?.vixTermStructure;
    const upcomingEvents = brief?.upcomingEvents || [];

    // Calculate max change for bar normalization
    const allChanges = [
        ...(d?.sectorRotation?.winners || []).map((w: any) => Math.abs(parseFloat(w.change?.replace(/[^0-9.\-]/g, '')) || 0)),
        ...(d?.sectorRotation?.losers || []).map((l: any) => Math.abs(parseFloat(l.change?.replace(/[^0-9.\-]/g, '')) || 0)),
    ];
    const maxChange = Math.max(...allChanges, 1);

    // Sector color map for related sector tags
    const SECTOR_COLORS: Record<string, string> = {
        m7: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
        physical_ai: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
        silicon_core: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
        power_matrix: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
        bio_pulse: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
        cyber_shield: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
        orbit_defense: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
        quantum_edge: 'text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10',
        fintech_pulse: 'text-lime-400 border-lime-500/30 bg-lime-500/10',
        cloud_fortress: 'text-sky-300 border-sky-400/30 bg-sky-400/10',
    };

    return (
        <div className="space-y-6">
            {/* CSS Keyframes for animations */}
            <style jsx global>{`
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulseGlow {
                    0%, 100% { box-shadow: 0 0 8px rgba(245,158,11,0.2); }
                    50% { box-shadow: 0 0 20px rgba(245,158,11,0.4); }
                }
                @keyframes regimePulse {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 1; }
                }
            `}</style>

            {/* ═══ Header ═══ */}
            <section className="relative p-6 rounded-xl border border-amber-500/[0.15] overflow-hidden"
                style={{ background: 'rgba(13,17,23,0.7)', backdropFilter: 'blur(16px)', ...staggerStyle(0) }}>
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute -top-20 -right-20 w-80 h-80 bg-gradient-radial from-amber-500/8 to-transparent rounded-full blur-3xl" />
                    <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-gradient-radial from-orange-500/5 to-transparent rounded-full blur-3xl" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4 text-amber-400" />
                        <span className="text-[13px] font-bold text-amber-400 tracking-[0.2em] uppercase">
                            POST-MARKET BRIEF
                        </span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                        ALL SECTOR <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">REPORTS</span>
                    </h1>
                    <p className="text-slate-300 text-[13px] mt-1 font-mono">
                        10 SECTORS &bull; DAILY CLOSE ANALYSIS &bull; AI-GENERATED INSIGHTS
                    </p>
                </div>
            </section>

            {/* ═══ AI Cross-Sector Intelligence ═══ */}
            <section className="relative rounded-xl border border-amber-500/[0.12] overflow-hidden"
                style={{ background: 'rgba(12,16,24,0.7)', backdropFilter: 'blur(16px)', ...staggerStyle(1) }}>
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

                <div className="p-6">
                    {/* Card header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">CROSS-SECTOR INTELLIGENCE</h2>
                            <p className="text-[13px] text-slate-300 font-mono">
                                {brief ? `Generated ${new Date(brief.generatedAt).toLocaleString(locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US', { timeZone: 'America/New_York' })} ET` : 'AI-POWERED DAILY ANALYSIS'}
                            </p>
                        </div>
                        {brief && (
                            <span className="ml-auto px-2.5 py-1 text-[12px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3" />
                                AI ANALYSIS
                            </span>
                        )}
                    </div>

                    {briefLoading ? (
                        <div className="flex items-center gap-3 py-12 justify-center">
                            <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                            <span className="text-slate-300 text-[13px]">{t('analysisLoading')}</span>
                        </div>
                    ) : d ? (
                        <div className="space-y-6">

                            {/* ── 0. MACRO INDICATORS DASHBOARD (Bloomberg-Grade) ── */}
                            {macroIndicators.length > 0 && (
                                <div style={staggerStyle(2)}>
                                    <div className="flex flex-wrap gap-3 mb-4">
                                        {(() => {
                                            const filtered = macroIndicators
                                                .filter((m: any) => m.key !== 'Fear & Greed')
                                                .filter((m: any) => {
                                                    if (m.key === 'USD/KRW') return locale === 'ko';
                                                    if (m.key === 'USD/JPY') return locale === 'ja';
                                                    return true;
                                                });

                                            // Group by contiguous categories
                                            const grouped: { cat: string; items: any[] }[] = [];
                                            let currentCat = '';
                                            filtered.forEach((m: any) => {
                                                const cat = INDICATOR_META[m.key]?.category || 'market';
                                                if (cat !== currentCat) {
                                                    currentCat = cat;
                                                    grouped.push({ cat, items: [m] });
                                                } else {
                                                    grouped[grouped.length - 1].items.push(m);
                                                }
                                            });

                                            return grouped.map((g, gi) => (
                                                <div key={gi} className="flex flex-wrap gap-2 p-1.5 rounded-xl border border-white/5 bg-white/[0.02]">
                                                    {g.items.map((m: any) => {
                                                        const isNeg = m.changePct < 0;
                                                        const meta = INDICATOR_META[m.key];
                                                        const catColor = meta?.color || 'text-slate-300';
                                                        const borderCol = meta?.borderColor || 'border-white/10';
                                                        const bgCol = meta?.bgColor || 'rgba(255,255,255,0.03)';
                                                        const glowColor = isNeg ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)';
                                                        return (
                                                            <div key={m.key} className={`p-2.5 rounded-lg border ${borderCol} text-center transition-all hover:border-white/25 hover:scale-[1.02] w-[calc(50vw-1.5rem)] sm:w-auto min-w-[100px] flex-1 sm:flex-none`}
                                                                style={{ background: bgCol, boxShadow: `0 0 10px ${glowColor}` }}>
                                                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                                                    {meta?.logoUrl && (
                                                                        <img loading="lazy" decoding="async"
                                                                            src={meta.logoUrl}
                                                                            alt="" className="w-4 h-4 rounded-full object-cover"
                                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                                    )}
                                                                    <span className={`text-[12px] font-bold uppercase tracking-wider ${catColor}`}>{m.key}</span>
                                                                </div>
                                                                <span className="text-[14px] font-black text-white font-mono block">
                                                                    {m.value > 1000 ? m.value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : m.value.toFixed(2)}
                                                                </span>
                                                                <span className={`text-[12px] font-bold font-mono ${isNeg ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                                    {isNeg ? '' : '+'}{m.changePct.toFixed(2)}%
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                    {/* Fear & Greed + VIX Term Structure row */}
                                    <div className="flex flex-wrap gap-3 items-center justify-center">
                                        {macroIndicators.find((m: any) => m.key === 'Fear & Greed') && (
                                            <div className="p-3 rounded-lg border border-white/10 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                                <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider block mb-1">FEAR &amp; GREED</span>
                                                <FearGreedGauge value={macroIndicators.find((m: any) => m.key === 'Fear & Greed')?.value || 50} />
                                            </div>
                                        )}
                                        {vixTS && (
                                            <div className={`p-3 rounded-lg border text-center ${vixTS.state === 'BACKWARDATION' ? 'border-red-500/25' : 'border-emerald-500/25'}`}
                                                style={{ background: vixTS.state === 'BACKWARDATION' ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)' }}>
                                                <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider block mb-1">VIX TERM STRUCTURE</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[13px] font-mono text-white">VIX <span className="font-black">{vixTS.vix.toFixed(1)}</span></span>
                                                    <span className="text-slate-500">/</span>
                                                    <span className="text-[13px] font-mono text-white">3M <span className="font-black">{vixTS.vix3m.toFixed(1)}</span></span>
                                                </div>
                                                <span className={`text-[12px] font-black mt-1 block ${vixTS.state === 'BACKWARDATION' ? 'text-red-400' : 'text-emerald-400'}`}
                                                    style={vixTS.state === 'BACKWARDATION' ? { animation: 'regimePulse 2s ease-in-out infinite' } : {}}>
                                                    {vixTS.state} ({vixTS.ratio})
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── EDGE ALERTS ── */}
                            {d.edgeAlerts?.length > 0 && (
                                <div className="space-y-2" style={staggerStyle(3)}>
                                    {d.edgeAlerts.map((alert: any, i: number) => {
                                        const typeConfig: Record<string, { icon: React.ReactNode; border: string; bg: string }> = {
                                            DIVERGENCE: { icon: <Activity className="w-4 h-4" />, border: 'border-amber-500/30', bg: 'rgba(245,158,11,0.08)' },
                                            ANOMALY: { icon: <AlertTriangle className="w-4 h-4" />, border: 'border-purple-500/30', bg: 'rgba(168,85,247,0.08)' },
                                            EXTREME: { icon: <Flame className="w-4 h-4" />, border: 'border-red-500/30', bg: 'rgba(239,68,68,0.08)' },
                                        };
                                        const tc = typeConfig[alert.type] || typeConfig.DIVERGENCE;
                                        return (
                                            <div key={i} className={`p-3 rounded-lg border ${tc.border} flex items-start gap-3`}
                                                style={{ background: tc.bg, animation: 'pulseGlow 3s ease-in-out infinite' }}>
                                                <div className="text-amber-400 mt-0.5 shrink-0">{tc.icon}</div>
                                                <div>
                                                    <span className="text-[12px] font-black text-amber-400 tracking-widest uppercase">⚡ EDGE — {alert.type}</span>
                                                    <h4 className="text-[14px] font-bold text-white mt-0.5">{lt(alert.title, locale)}</h4>
                                                    <p className="text-[13px] text-slate-300 mt-0.5 leading-snug">{lt(alert.detail, locale)}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ── 1. MARKET PULSE ── */}
                            <div className={GLASS} style={{ ...GLASS_ACCENT_BG, ...staggerStyle(4) }}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <BarChart3 className="w-4.5 h-4.5 text-cyan-400" style={{ animation: 'regimePulse 3s ease-in-out infinite' }} />
                                        <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                            {(SECTION_TITLES.marketOverview as any)[locale] || SECTION_TITLES.marketOverview.en}
                                        </h3>
                                    </div>
                                    <ToneBadge tone={d.marketOverview?.tone || 'NEUTRAL'} />
                                </div>

                                {/* S&P 500 / NASDAQ Index Cards */}
                                {(() => {
                                    const spx = macroIndicators.find((m: any) => m.key === 'S&P500');
                                    const ndx = macroIndicators.find((m: any) => m.key === 'NASDAQ');
                                    if (!spx && !ndx) return null;
                                    return (
                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                            {[spx, ndx].filter(Boolean).map((idx: any) => {
                                                const isNeg = idx.changePct < 0;
                                                const pctAbs = Math.abs(idx.changePct);
                                                const barWidth = Math.min(pctAbs * 20, 100);
                                                return (
                                                    <div key={idx.key} className={`p-4 rounded-xl border ${isNeg ? 'border-rose-500/20' : 'border-emerald-500/20'}`}
                                                        style={{ background: isNeg ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)' }}>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider">{idx.key === 'S&P500' ? 'S&P 500' : 'NASDAQ 100'}</span>
                                                            {isNeg ? <TrendingDown className="w-4 h-4 text-rose-400" /> : <TrendingUp className="w-4 h-4 text-emerald-400" />}
                                                        </div>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-[22px] font-black text-white font-mono">
                                                                {idx.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                            </span>
                                                            <span className={`text-[14px] font-bold font-mono ${isNeg ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                                {isNeg ? '' : '+'}{idx.changePct.toFixed(2)}%
                                                            </span>
                                                        </div>
                                                        {/* Mini change bar */}
                                                        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                                            <div className={`h-full rounded-full transition-all duration-700 ${isNeg ? 'bg-gradient-to-r from-rose-500/60 to-rose-400' : 'bg-gradient-to-r from-emerald-500/60 to-emerald-400'}`}
                                                                style={{ width: `${barWidth}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                <p className="text-slate-200 text-[14px] leading-[1.7] mb-3">
                                    {lt(d.marketOverview?.summary, locale)}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {la(d.marketOverview?.keyDrivers, locale).map((driver: string, i: number) => (
                                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg border border-white/10"
                                            style={{ background: 'rgba(255,255,255,0.03)' }}>
                                            <Target className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                                            <span className="text-[13px] text-slate-300 leading-snug">{driver}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── 2. SECTOR FLOW MAP ── */}
                            <div className={GLASS} style={{ ...GLASS_BG, ...staggerStyle(5) }}>
                                <div className="flex items-center gap-2 mb-3">
                                    <Activity className="w-4.5 h-4.5 text-purple-400" />
                                    <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                        {(SECTION_TITLES.sectorRotation as any)[locale] || SECTION_TITLES.sectorRotation.en}
                                    </h3>
                                </div>

                                {/* Sector Heatbar — all 10 sectors in one row */}
                                {(d.sectorRotation?.winners?.length > 0 || d.sectorRotation?.losers?.length > 0) && (
                                    <div className="flex gap-0.5 mb-4 h-8 rounded-lg overflow-hidden">
                                        {[...(d.sectorRotation?.winners || []), ...(d.sectorRotation?.losers || [])]
                                            .sort((a: any, b: any) => parseFloat(b.change) - parseFloat(a.change))
                                            .map((s: any, i: number) => {
                                                const val = parseFloat(s.change?.replace(/[^0-9.\-]/g, '') || '0');
                                                const isPos = val >= 0;
                                                const width = Math.max(Math.abs(val) / maxChange * 100, 8);
                                                return (
                                                    <div key={i} className="relative group cursor-pointer transition-all hover:opacity-80"
                                                        style={{
                                                            flex: `${width} 0 0`,
                                                            background: isPos
                                                                ? `linear-gradient(135deg, rgba(34,197,94,${0.2 + Math.abs(val) / maxChange * 0.4}), rgba(34,197,94,${0.1 + Math.abs(val) / maxChange * 0.3}))`
                                                                : `linear-gradient(135deg, rgba(239,68,68,${0.2 + Math.abs(val) / maxChange * 0.4}), rgba(239,68,68,${0.1 + Math.abs(val) / maxChange * 0.3}))`,
                                                        }}>
                                                        <span className="absolute inset-0 flex items-center justify-center text-[12px] font-black text-white/80 truncate px-0.5">
                                                            {s.sector?.split(' ')[0]}
                                                        </span>
                                                        {/* Tooltip */}
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md border border-white/20 text-[12px] font-mono text-white whitespace-nowrap hidden group-hover:block z-50"
                                                            style={{ background: 'rgba(11,15,23,0.95)' }}>
                                                            {s.sector} <span className={isPos ? 'text-emerald-400' : 'text-rose-400'}>{s.change}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                    {/* Winners */}
                                    <div className="space-y-2">
                                        <span className="text-[12px] font-bold text-emerald-400 tracking-widest uppercase flex items-center gap-1.5">
                                            <ArrowUpRight className="w-3.5 h-3.5" /> {locale === 'ko' ? '강세 섹터' : locale === 'ja' ? '上昇セクター' : 'OUTPERFORMERS'}
                                        </span>
                                        {(d.sectorRotation?.winners || []).map((w: any, i: number) => (
                                            <div key={i} className="p-2.5 rounded-lg border border-emerald-500/15"
                                                style={{ background: 'rgba(16,185,129,0.06)' }}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[13px] font-bold text-white">{w.sector}</span>
                                                    <span className="text-[13px] font-black text-emerald-400 font-mono">{w.change}</span>
                                                </div>
                                                <p className="text-[12px] text-slate-300 leading-snug">{lt(w.reason, locale)}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Losers */}
                                    <div className="space-y-2">
                                        <span className="text-[12px] font-bold text-red-400 tracking-widest uppercase flex items-center gap-1.5">
                                            <ArrowDownRight className="w-3.5 h-3.5" /> {locale === 'ko' ? '약세 섹터' : locale === 'ja' ? '下落セクター' : 'UNDERPERFORMERS'}
                                        </span>
                                        {(d.sectorRotation?.losers || []).map((l: any, i: number) => (
                                            <div key={i} className="p-2.5 rounded-lg border border-red-500/15"
                                                style={{ background: 'rgba(239,68,68,0.06)' }}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[13px] font-bold text-white">{l.sector}</span>
                                                    <span className="text-[13px] font-black text-rose-400 font-mono">{l.change}</span>
                                                </div>
                                                <p className="text-[12px] text-slate-300 leading-snug">{lt(l.reason, locale)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {d.sectorRotation?.rotationInsight && (
                                    <div className="p-2.5 rounded-lg border border-purple-500/15"
                                        style={{ background: 'rgba(168,85,247,0.06)' }}>
                                        <div className="flex items-start gap-2">
                                            <Eye className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                                            <p className="text-[13px] text-slate-300 leading-relaxed">{lt(d.sectorRotation.rotationInsight, locale)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── 3. MARKET CATALYST (with Impact Chain) ── */}
                            {d.newsImpact?.items?.length > 0 && (
                                <div className={GLASS} style={{ ...GLASS_BG, ...staggerStyle(6) }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Newspaper className="w-4.5 h-4.5 text-sky-400" />
                                        <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                            {(SECTION_TITLES.newsImpact as any)[locale] || SECTION_TITLES.newsImpact.en}
                                        </h3>
                                    </div>
                                    <div className="space-y-3">
                                        {d.newsImpact.items.map((item: any, i: number) => {
                                            const sentimentColor = item.sentiment === 'positive' ? 'bg-emerald-400' : item.sentiment === 'negative' ? 'bg-rose-400' : 'bg-slate-500';
                                            const impactDots = item.impactLevel === 'HIGH' ? '🔴🔴🔴' : item.impactLevel === 'MED' ? '🟡🟡' : '🟢';
                                            return (
                                                <div key={i} className={`flex gap-3 p-3 rounded-lg border ${i === 0 && item.impactLevel === 'HIGH' ? 'border-amber-500/25' : 'border-white/8'} hover:border-white/15 transition-colors`}
                                                    style={{ background: i === 0 && item.impactLevel === 'HIGH' ? 'rgba(245,158,11,0.05)' : 'rgba(255,255,255,0.02)' }}>
                                                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${sentimentColor}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <h4 className="text-[14px] font-bold text-white leading-snug flex-1">{lt(item.headline, locale)}</h4>
                                                            <span className="text-[12px] shrink-0">{impactDots}</span>
                                                        </div>
                                                        <p className="text-[13px] text-slate-300 leading-snug mb-2">{lt(item.impact, locale)}</p>

                                                        {/* Impact Chain visualization */}
                                                        {item.impactChain?.length > 0 && (
                                                            <div className="flex flex-wrap items-center gap-1 mb-2">
                                                                {item.impactChain.map((chain: any, ci: number) => (
                                                                    <React.Fragment key={ci}>
                                                                        {ci > 0 && <ArrowRight className="w-3 h-3 text-slate-500" />}
                                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-bold border ${chain.direction === '↑' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-rose-400 border-rose-500/30 bg-rose-500/10'}`}>
                                                                            {chain.indicator} {chain.direction}
                                                                        </span>
                                                                    </React.Fragment>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {item.relatedSectors?.length > 0 && (
                                                            <div className="flex gap-1.5 flex-wrap">
                                                                {item.relatedSectors.map((s: string) => (
                                                                    <span key={s} className={`px-2 py-0.5 text-[12px] font-bold border rounded-md uppercase tracking-wide ${SECTOR_COLORS[s] || 'text-slate-300 border-white/10 bg-white/5'}`}>
                                                                        {s.replace(/_/g, ' ')}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── 4. OPTIONS STRUCTURE (SVG Gauges) ── */}
                            {d.gammaOptions && (
                                <div className={GLASS} style={{ ...GLASS_BG, ...staggerStyle(7) }}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Zap className="w-4.5 h-4.5 text-yellow-400" />
                                        <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                            {(SECTION_TITLES.gammaOptions as any)[locale] || SECTION_TITLES.gammaOptions.en}
                                        </h3>
                                    </div>
                                    <div className="flex flex-wrap items-start justify-center gap-6 mb-3">
                                        {/* GEX Gauge */}
                                        <div className="text-center">
                                            <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider block mb-2">TOTAL GEX</span>
                                            <GexSemiGauge regime={d.gammaOptions.regime || 'NEUTRAL'} label={d.gammaOptions.totalGexLabel || '-'} />
                                        </div>
                                        {/* PCR Donut */}
                                        <div className="text-center">
                                            <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider block mb-2">AVG PCR</span>
                                            <PcrDonut pcr={d.gammaOptions.avgPcr || 1} />
                                        </div>
                                        {/* Regime Badge */}
                                        <div className="text-center">
                                            <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider block mb-2">REGIME</span>
                                            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-[18px] font-black font-mono
                                                ${d.gammaOptions.regime === 'LONG' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
                                                    d.gammaOptions.regime === 'SHORT' ? 'text-red-400 border-red-500/30 bg-red-500/10' :
                                                        'text-amber-400 border-amber-500/30 bg-amber-500/10'}`}
                                                style={{ animation: 'regimePulse 2s ease-in-out infinite' }}>
                                                {d.gammaOptions.regime || 'NEUTRAL'}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[13px] text-slate-300 leading-[1.7] text-center">{lt(d.gammaOptions.insight, locale)}</p>
                                </div>
                            )}

                            {/* ── 5. SCENARIO MAP ── */}
                            {d.outlook && (
                                <div className="rounded-xl border border-amber-500/15 p-5"
                                    style={{
                                        background: d.outlook.bias === 'BULLISH' ? 'rgba(34,197,94,0.03)' :
                                            d.outlook.bias === 'BEARISH' ? 'rgba(239,68,68,0.03)' : 'rgba(11,15,23,0.5)',
                                        backdropFilter: 'blur(16px)', ...staggerStyle(8)
                                    }}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <Target className="w-4.5 h-4.5 text-amber-400" />
                                            <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                                {(SECTION_TITLES.outlook as any)[locale] || SECTION_TITLES.outlook.en}
                                            </h3>
                                        </div>
                                        <ToneBadge tone={d.outlook.bias || 'NEUTRAL'} />
                                    </div>

                                    {/* Price Range Bar — with current price position */}
                                    {d.outlook.keyLevels?.length >= 2 && (
                                        <div className="mb-4">
                                            <div className="flex justify-between text-[12px] font-bold mb-1">
                                                <span className="text-emerald-400">{d.outlook.keyLevels[0]?.label}</span>
                                                <span className="text-red-400">{d.outlook.keyLevels[1]?.label}</span>
                                            </div>
                                            {(() => {
                                                const supportVal = parseFloat(d.outlook.keyLevels[0]?.value?.replace(/[^0-9.]/g, '') || '0');
                                                const resistVal = parseFloat(d.outlook.keyLevels[1]?.value?.replace(/[^0-9.]/g, '') || '0');
                                                const spxData = macroIndicators.find((m: any) => m.key === 'S&P 500');
                                                const currentPrice = spxData?.value || 0;
                                                const range = resistVal - supportVal;
                                                const pricePct = range > 0 ? Math.max(2, Math.min(98, ((currentPrice - supportVal) / range) * 100)) : 50;
                                                return (
                                                    <div className="relative h-5 rounded-full overflow-visible bg-gradient-to-r from-emerald-500/20 via-amber-500/20 to-rose-500/20 border border-white/10">
                                                        {/* Current price marker */}
                                                        {currentPrice > 0 && (
                                                            <div className="absolute top-1/2 -translate-y-1/2 z-10" style={{ left: `${pricePct}%` }}>
                                                                <div className="relative">
                                                                    <div className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-white shadow-lg shadow-cyan-400/50"
                                                                        style={{ animation: 'regimePulse 2s ease-in-out infinite', transform: 'translateX(-50%)' }} />
                                                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 whitespace-nowrap">
                                                                        <span className="text-[12px] font-black text-slate-300 font-mono">{currentPrice.toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            <div className="flex justify-between text-[13px] font-black font-mono mt-1">
                                                <span className="text-emerald-400">{d.outlook.keyLevels[0]?.value}</span>
                                                <span className="text-red-400">{d.outlook.keyLevels[1]?.value}</span>
                                            </div>
                                            {d.outlook.keyLevels.length > 2 && (
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {d.outlook.keyLevels.slice(2).map((level: any, i: number) => (
                                                        <div key={i} className="px-2.5 py-1 rounded-md border border-amber-500/15 text-center"
                                                            style={{ background: 'rgba(245,158,11,0.05)' }}>
                                                            <span className="text-[12px] font-bold text-amber-300 uppercase block">{level.label}</span>
                                                            <span className="text-[13px] font-black text-white font-mono">{level.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Catalysts / Risks / Observations */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="p-3 rounded-lg border border-cyan-500/15" style={{ background: 'rgba(6,182,212,0.05)' }}>
                                            <span className="text-[12px] font-bold text-cyan-400 tracking-widest uppercase block mb-2">
                                                {locale === 'ko' ? '촉매' : locale === 'ja' ? '触媒' : 'CATALYSTS'}
                                            </span>
                                            <ul className="space-y-1.5">
                                                {la(d.outlook.catalysts, locale).map((c: string, i: number) => (
                                                    <li key={i} className="text-[12px] text-slate-300 flex items-start gap-1.5">
                                                        <Zap className="w-3 h-3 text-cyan-400 mt-0.5 shrink-0" />
                                                        <span>{c}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="p-3 rounded-lg border border-red-500/15" style={{ background: 'rgba(239,68,68,0.05)' }}>
                                            <span className="text-[12px] font-bold text-red-400 tracking-widest uppercase block mb-2">
                                                {locale === 'ko' ? '리스크' : locale === 'ja' ? 'リスク' : 'RISKS'}
                                            </span>
                                            <ul className="space-y-1.5">
                                                {la(d.outlook.risks, locale).map((r: string, i: number) => (
                                                    <li key={i} className="text-[12px] text-slate-300 flex items-start gap-1.5">
                                                        <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                                                        <span>{r}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="p-3 rounded-lg border border-emerald-500/15" style={{ background: 'rgba(16,185,129,0.05)' }}>
                                            <span className="text-[12px] font-bold text-emerald-400 tracking-widest uppercase block mb-2">
                                                {locale === 'ko' ? '관찰' : locale === 'ja' ? '観察' : 'OBSERVATIONS'}
                                            </span>
                                            <ul className="space-y-1.5">
                                                {la(d.outlook.opportunities, locale).map((o: string, i: number) => (
                                                    <li key={i} className="text-[12px] text-slate-300 flex items-start gap-1.5">
                                                        <TrendingUp className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                                                        <span>{o}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    {/* Economic Calendar Timeline */}
                                    {upcomingEvents.length > 0 && (
                                        <div className="mt-4 p-3 rounded-lg border border-white/8" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider">
                                                    {locale === 'ko' ? '경제 캘린더' : locale === 'ja' ? '経済カレンダー' : 'ECONOMIC CALENDAR'}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {upcomingEvents.slice(0, 4).map((evt: any, i: number) => (
                                                    <div key={i} className={`px-2.5 py-1.5 rounded-md border text-center ${evt.impact === 'HIGH' ? 'border-red-500/25 bg-red-500/5' : 'border-white/10 bg-white/3'}`}>
                                                        <span className={`text-[12px] font-black font-mono block ${evt.daysUntil <= 3 ? 'text-red-400' : 'text-slate-300'}`}>
                                                            D-{evt.daysUntil}
                                                        </span>
                                                        <span className="text-[12px] text-slate-300 block mt-0.5 max-w-[140px] truncate">{evt.event}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    ) : (
                        <div className="text-center py-10">
                            <p className="text-slate-300 text-[14px]">{t('noAnalysis')}</p>
                            <p className="text-slate-300 text-[13px] mt-1 font-mono">{t('autoGenerate')}</p>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ Expand/Collapse Controls ═══ */}
            <div className="flex items-center justify-between px-1">
                <span className="text-[13px] font-bold text-slate-300 uppercase tracking-wider">SECTOR REPORTS</span>
                <div className="flex gap-2">
                    <button
                        onClick={expandAll}
                        className="px-3 py-1.5 text-[12px] font-bold text-slate-300 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                    >
                        {t('expandAll')}
                    </button>
                    <button
                        onClick={collapseAll}
                        className="px-3 py-1.5 text-[12px] font-bold text-slate-300 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                    >
                        {t('collapseAll')}
                    </button>
                </div>
            </div>

            {/* ═══ Accordion Sector Reports ═══ */}
            {ALL_SECTORS.map(({ config, icon, accentColor }) => {
                const isExpanded = expandedSectors.has(config.id);
                const [textColor, bgColor, borderColor] = accentColor.split(' ');
                return (
                    <section key={config.id} className="rounded-xl border border-white/10 overflow-hidden transition-all duration-300"
                        style={GLASS_BG}>
                        <button
                            onClick={() => toggleSector(config.id)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg ${bgColor} border ${borderColor} flex items-center justify-center ${textColor}`}>
                                    {icon}
                                </div>
                                <div className="text-left">
                                    <span className="text-[15px] font-bold text-white group-hover:text-amber-300 transition-colors">
                                        {config.shortName || config.name}
                                    </span>
                                    <span className="text-[13px] text-slate-300 ml-2 font-mono">POST-MARKET REPORT</span>
                                </div>
                            </div>
                            <ChevronDown
                                className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                            />
                        </button>
                        {isExpanded && (
                            <div className="border-t border-white/[0.06] animate-in slide-in-from-top-2 duration-300">
                                <TacticalReportDeck config={config} />
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
