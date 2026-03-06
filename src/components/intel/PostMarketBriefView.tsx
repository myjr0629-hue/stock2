'use client';

import React, { useState, useEffect } from 'react';
import {
    ChevronDown, Sparkles, Loader2, FileText, Orbit, Bot, Zap, Activity,
    ShieldAlert, Shield, Rocket, Cpu, CreditCard, Cloud,
    TrendingUp, TrendingDown, AlertTriangle, Target, Newspaper, BarChart3,
    ArrowUpRight, ArrowDownRight, Minus, Eye
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

// ── Glass Card Style ──
const GLASS = 'rounded-xl border border-white/10 p-5';
const GLASS_BG = { background: 'rgba(11,15,23,0.6)', backdropFilter: 'blur(12px)' };
const GLASS_ACCENT_BG = { background: 'rgba(11,15,23,0.4)', backdropFilter: 'blur(16px)' };

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
                <span className="text-[12px] text-rose-400/70 font-mono">SHORT</span>
                <span className="text-[12px] text-slate-500 font-mono">NEUTRAL</span>
                <span className="text-[12px] text-emerald-400/70 font-mono">LONG</span>
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

    // Calculate max change for bar normalization
    const allChanges = [
        ...(d?.sectorRotation?.winners || []).map((w: any) => Math.abs(parseFloat(w.change?.replace(/[^0-9.\-]/g, '')) || 0)),
        ...(d?.sectorRotation?.losers || []).map((l: any) => Math.abs(parseFloat(l.change?.replace(/[^0-9.\-]/g, '')) || 0)),
    ];
    const maxChange = Math.max(...allChanges, 1);

    return (
        <div className="space-y-6">
            {/* ═══ Header ═══ */}
            <section className="relative p-6 rounded-2xl border border-amber-500/[0.15] overflow-hidden"
                style={{ background: 'rgba(13,17,23,0.7)', backdropFilter: 'blur(16px)' }}>
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
            <section className="relative rounded-2xl border border-amber-500/[0.12] overflow-hidden"
                style={{ background: 'rgba(12,16,24,0.7)', backdropFilter: 'blur(16px)' }}>
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
                            <span className="ml-auto px-2.5 py-1 text-[12px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full">
                                GEMINI AI
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

                            {/* ── 1. MARKET PULSE ── */}
                            <div className={GLASS} style={GLASS_ACCENT_BG}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <BarChart3 className="w-4.5 h-4.5 text-cyan-400" />
                                        <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                            {(SECTION_TITLES.marketOverview as any)[locale] || SECTION_TITLES.marketOverview.en}
                                        </h3>
                                    </div>
                                    <ToneBadge tone={d.marketOverview?.tone || 'NEUTRAL'} />
                                </div>
                                <p className="text-slate-200 text-[15px] leading-[1.75] mb-4">
                                    {lt(d.marketOverview?.summary, locale)}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {la(d.marketOverview?.keyDrivers, locale).map((driver: string, i: number) => (
                                        <div key={i} className="flex items-start gap-2 p-3 rounded-lg border border-white/10"
                                            style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(8px)' }}>
                                            <Target className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                                            <span className="text-[13px] text-slate-300 leading-snug">{driver}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── 2. SECTOR FLOW MAP ── */}
                            <div className={GLASS} style={GLASS_BG}>
                                <div className="flex items-center gap-2 mb-4">
                                    <Activity className="w-4.5 h-4.5 text-purple-400" />
                                    <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                        {(SECTION_TITLES.sectorRotation as any)[locale] || SECTION_TITLES.sectorRotation.en}
                                    </h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    {/* Winners */}
                                    <div className="space-y-2">
                                        <span className="text-[12px] font-bold text-emerald-400 tracking-widest uppercase flex items-center gap-1.5">
                                            <ArrowUpRight className="w-3.5 h-3.5" /> {locale === 'ko' ? '강세 섹터' : locale === 'ja' ? '上昇セクター' : 'OUTPERFORMERS'}
                                        </span>
                                        {(d.sectorRotation?.winners || []).map((w: any, i: number) => (
                                            <div key={i} className="p-3 rounded-lg border border-emerald-500/15"
                                                style={{ background: 'rgba(16,185,129,0.06)', backdropFilter: 'blur(8px)' }}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[13px] font-bold text-white">{w.sector}</span>
                                                </div>
                                                <ChangeBar change={w.change} isPositive={true} maxVal={maxChange} />
                                                <p className="text-[13px] text-slate-300 mt-1.5 leading-snug">{lt(w.reason, locale)}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Losers */}
                                    <div className="space-y-2">
                                        <span className="text-[12px] font-bold text-red-400 tracking-widest uppercase flex items-center gap-1.5">
                                            <ArrowDownRight className="w-3.5 h-3.5" /> {locale === 'ko' ? '약세 섹터' : locale === 'ja' ? '下落セクター' : 'UNDERPERFORMERS'}
                                        </span>
                                        {(d.sectorRotation?.losers || []).map((l: any, i: number) => (
                                            <div key={i} className="p-3 rounded-lg border border-red-500/15"
                                                style={{ background: 'rgba(239,68,68,0.06)', backdropFilter: 'blur(8px)' }}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[13px] font-bold text-white">{l.sector}</span>
                                                </div>
                                                <ChangeBar change={l.change} isPositive={false} maxVal={maxChange} />
                                                <p className="text-[13px] text-slate-300 mt-1.5 leading-snug">{lt(l.reason, locale)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {d.sectorRotation?.rotationInsight && (
                                    <div className="p-3 rounded-lg border border-purple-500/15"
                                        style={{ background: 'rgba(168,85,247,0.06)', backdropFilter: 'blur(8px)' }}>
                                        <div className="flex items-start gap-2">
                                            <Eye className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                                            <p className="text-[14px] text-slate-300 leading-relaxed">{lt(d.sectorRotation.rotationInsight, locale)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── 3. MARKET CATALYST ── */}
                            {d.newsImpact?.items?.length > 0 && (
                                <div className={GLASS} style={GLASS_BG}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Newspaper className="w-4.5 h-4.5 text-sky-400" />
                                        <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                            {(SECTION_TITLES.newsImpact as any)[locale] || SECTION_TITLES.newsImpact.en}
                                        </h3>
                                    </div>
                                    <div className="space-y-3">
                                        {d.newsImpact.items.map((item: any, i: number) => {
                                            const sentimentColor = item.sentiment === 'positive' ? 'bg-emerald-400' : item.sentiment === 'negative' ? 'bg-rose-400' : 'bg-slate-500';
                                            return (
                                                <div key={i} className="flex gap-3 p-4 rounded-lg border border-white/8 hover:border-white/15 transition-colors"
                                                    style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(8px)' }}>
                                                    {/* Sentiment color bar */}
                                                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${sentimentColor}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-[15px] font-bold text-white leading-snug mb-1">
                                                            {lt(item.headline, locale)}
                                                        </h4>
                                                        <p className="text-[14px] text-slate-300 leading-[1.7]">
                                                            {lt(item.impact, locale)}
                                                        </p>
                                                        {item.relatedSectors?.length > 0 && (
                                                            <div className="flex gap-1.5 mt-2 flex-wrap">
                                                                {item.relatedSectors.map((s: string) => (
                                                                    <span key={s} className="px-2 py-0.5 text-[12px] font-bold text-slate-300 border border-white/10 rounded-md uppercase tracking-wide"
                                                                        style={{ background: 'rgba(255,255,255,0.05)' }}>
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

                            {/* ── 4. OPTIONS STRUCTURE ── */}
                            {d.gammaOptions && (
                                <div className={GLASS} style={GLASS_BG}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Zap className="w-4.5 h-4.5 text-yellow-400" />
                                        <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                            {(SECTION_TITLES.gammaOptions as any)[locale] || SECTION_TITLES.gammaOptions.en}
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                        <div className="p-3 rounded-lg border border-white/10 text-center" style={GLASS_ACCENT_BG}>
                                            <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total GEX</span>
                                            <span className="text-[18px] font-black text-white font-mono">{d.gammaOptions.totalGexLabel || '-'}</span>
                                            <GexGauge regime={d.gammaOptions.regime || 'NEUTRAL'} />
                                        </div>
                                        <div className="p-3 rounded-lg border border-white/10 text-center" style={GLASS_ACCENT_BG}>
                                            <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider block mb-1">AVG PCR</span>
                                            <span className={`text-[18px] font-black font-mono ${(d.gammaOptions.avgPcr || 1) < 0.8 ? 'text-emerald-400' : (d.gammaOptions.avgPcr || 1) > 1.2 ? 'text-red-400' : 'text-amber-400'}`}>
                                                {(d.gammaOptions.avgPcr || 0).toFixed(2)}
                                            </span>
                                            <PcrBar pcr={d.gammaOptions.avgPcr || 1} />
                                        </div>
                                        <div className="p-3 rounded-lg border border-white/10 text-center" style={GLASS_ACCENT_BG}>
                                            <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider block mb-1">REGIME</span>
                                            <span className={`text-[18px] font-black font-mono ${d.gammaOptions.regime === 'LONG' ? 'text-emerald-400' : d.gammaOptions.regime === 'SHORT' ? 'text-red-400' : 'text-amber-400'}`}>
                                                {d.gammaOptions.regime || 'NEUTRAL'}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-[14px] text-slate-300 leading-[1.7]">
                                        {lt(d.gammaOptions.insight, locale)}
                                    </p>
                                </div>
                            )}

                            {/* ── 5. SCENARIO MAP ── */}
                            {d.outlook && (
                                <div className="rounded-xl border border-amber-500/15 p-5" style={{ background: 'rgba(11,15,23,0.5)', backdropFilter: 'blur(16px)' }}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <Target className="w-4.5 h-4.5 text-amber-400" />
                                            <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                                {(SECTION_TITLES.outlook as any)[locale] || SECTION_TITLES.outlook.en}
                                            </h3>
                                        </div>
                                        <ToneBadge tone={d.outlook.bias || 'NEUTRAL'} />
                                    </div>

                                    {/* Key Levels */}
                                    {d.outlook.keyLevels?.length > 0 && (
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                                            {d.outlook.keyLevels.map((level: any, i: number) => (
                                                <div key={i} className="p-2.5 rounded-lg border border-amber-500/15 text-center"
                                                    style={{ background: 'rgba(245,158,11,0.05)', backdropFilter: 'blur(8px)' }}>
                                                    <span className="text-[12px] font-bold text-amber-300/70 uppercase tracking-wider block mb-0.5">{level.label}</span>
                                                    <span className="text-[16px] font-black text-white font-mono">{level.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Catalysts / Risks / Opportunities — 3 column glass cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {/* Catalysts */}
                                        <div className="p-3 rounded-lg border border-cyan-500/15"
                                            style={{ background: 'rgba(6,182,212,0.05)', backdropFilter: 'blur(8px)' }}>
                                            <span className="text-[12px] font-bold text-cyan-400 tracking-widest uppercase block mb-2">
                                                {locale === 'ko' ? '촉매' : locale === 'ja' ? '触媒' : 'CATALYSTS'}
                                            </span>
                                            <ul className="space-y-1.5">
                                                {la(d.outlook.catalysts, locale).map((c: string, i: number) => (
                                                    <li key={i} className="text-[13px] text-slate-300 flex items-start gap-1.5">
                                                        <Zap className="w-3 h-3 text-cyan-400 mt-0.5 shrink-0" />
                                                        <span>{c}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        {/* Risks */}
                                        <div className="p-3 rounded-lg border border-red-500/15"
                                            style={{ background: 'rgba(239,68,68,0.05)', backdropFilter: 'blur(8px)' }}>
                                            <span className="text-[12px] font-bold text-red-400 tracking-widest uppercase block mb-2">
                                                {locale === 'ko' ? '리스크' : locale === 'ja' ? 'リスク' : 'RISKS'}
                                            </span>
                                            <ul className="space-y-1.5">
                                                {la(d.outlook.risks, locale).map((r: string, i: number) => (
                                                    <li key={i} className="text-[13px] text-slate-300 flex items-start gap-1.5">
                                                        <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                                                        <span>{r}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        {/* Observations (was Opportunities) */}
                                        <div className="p-3 rounded-lg border border-emerald-500/15"
                                            style={{ background: 'rgba(16,185,129,0.05)', backdropFilter: 'blur(8px)' }}>
                                            <span className="text-[12px] font-bold text-emerald-400 tracking-widest uppercase block mb-2">
                                                {locale === 'ko' ? '관찰' : locale === 'ja' ? '観察' : 'OBSERVATIONS'}
                                            </span>
                                            <ul className="space-y-1.5">
                                                {la(d.outlook.opportunities, locale).map((o: string, i: number) => (
                                                    <li key={i} className="text-[13px] text-slate-300 flex items-start gap-1.5">
                                                        <TrendingUp className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                                                        <span>{o}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
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
