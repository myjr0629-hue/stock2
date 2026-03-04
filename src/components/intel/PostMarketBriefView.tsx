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
    marketOverview: { ko: '시장 개요', en: 'Market Overview', ja: '市場概要' },
    sectorRotation: { ko: '섹터 로테이션', en: 'Sector Rotation', ja: 'セクターローテーション' },
    newsImpact: { ko: '뉴스 영향', en: 'News Impact', ja: 'ニュースインパクト' },
    gammaOptions: { ko: '감마 & 옵션', en: 'Gamma & Options', ja: 'ガンマ＆オプション' },
    outlook: { ko: '전망 & 전략', en: 'Outlook & Strategy', ja: '見通し＆戦略' },
};

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

// ── Sentiment Dot Component ──
function SentimentDot({ sentiment }: { sentiment: string }) {
    const colors: Record<string, string> = {
        positive: 'bg-emerald-400',
        negative: 'bg-red-400',
        neutral: 'bg-slate-400',
    };
    return <span className={`w-2 h-2 rounded-full inline-block ${colors[sentiment] || colors.neutral}`} />;
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

    return (
        <div className="space-y-6">
            {/* ═══ Header ═══ */}
            <section className="relative p-6 rounded-2xl border border-amber-500/[0.15] bg-[#0d1117]/80 backdrop-blur-sm shadow-2xl overflow-hidden">
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
                        10 SECTORS • DAILY CLOSE ANALYSIS • AI-GENERATED INSIGHTS
                    </p>
                </div>
            </section>

            {/* ═══ AI Cross-Sector Intelligence ═══ */}
            <section className="relative rounded-2xl border border-amber-500/[0.12] bg-[#0c1018]/90 backdrop-blur-sm overflow-hidden">
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
                            <span className="ml-auto px-2.5 py-1 text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full">
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

                            {/* ── 1. MARKET OVERVIEW ── */}
                            <div className="rounded-xl border border-white/[0.08] bg-[#0b0f17]/70 p-5">
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
                                        <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                                            <Target className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                                            <span className="text-[14px] text-slate-200 leading-snug">{driver}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── 2. SECTOR ROTATION ── */}
                            <div className="rounded-xl border border-white/[0.08] bg-[#0b0f17]/70 p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <Activity className="w-4.5 h-4.5 text-purple-400" />
                                    <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                        {(SECTION_TITLES.sectorRotation as any)[locale] || SECTION_TITLES.sectorRotation.en}
                                    </h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    {/* Winners */}
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-bold text-emerald-400 tracking-widest uppercase flex items-center gap-1.5">
                                            <ArrowUpRight className="w-3.5 h-3.5" /> {locale === 'ko' ? '강세 섹터' : locale === 'ja' ? '上昇セクター' : 'OUTPERFORMERS'}
                                        </span>
                                        {(d.sectorRotation?.winners || []).map((w: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/[0.12]">
                                                <div>
                                                    <span className="text-[13px] font-bold text-white">{w.sector}</span>
                                                    <p className="text-[13px] text-slate-300 mt-0.5 leading-snug">{lt(w.reason, locale)}</p>
                                                </div>
                                                <span className="text-[14px] font-bold text-emerald-400 font-mono">{w.change}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Losers */}
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-bold text-red-400 tracking-widest uppercase flex items-center gap-1.5">
                                            <ArrowDownRight className="w-3.5 h-3.5" /> {locale === 'ko' ? '약세 섹터' : locale === 'ja' ? '下落セクター' : 'UNDERPERFORMERS'}
                                        </span>
                                        {(d.sectorRotation?.losers || []).map((l: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-red-500/[0.06] border border-red-500/[0.12]">
                                                <div>
                                                    <span className="text-[13px] font-bold text-white">{l.sector}</span>
                                                    <p className="text-[13px] text-slate-300 mt-0.5 leading-snug">{lt(l.reason, locale)}</p>
                                                </div>
                                                <span className="text-[14px] font-bold text-red-400 font-mono">{l.change}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {d.sectorRotation?.rotationInsight && (
                                    <div className="p-3 rounded-lg bg-purple-500/[0.06] border border-purple-500/[0.12]">
                                        <div className="flex items-start gap-2">
                                            <Eye className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                                            <p className="text-[14px] text-slate-200 leading-relaxed">{lt(d.sectorRotation.rotationInsight, locale)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── 3. NEWS IMPACT ── */}
                            {d.newsImpact?.items?.length > 0 && (
                                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f17]/70 p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Newspaper className="w-4.5 h-4.5 text-sky-400" />
                                        <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                            {(SECTION_TITLES.newsImpact as any)[locale] || SECTION_TITLES.newsImpact.en}
                                        </h3>
                                    </div>
                                    <div className="space-y-3">
                                        {d.newsImpact.items.map((item: any, i: number) => (
                                            <div key={i} className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-colors">
                                                <div className="flex items-start gap-3">
                                                    <SentimentDot sentiment={item.sentiment} />
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
                                                                    <span key={s} className="px-2 py-0.5 text-[11px] font-bold text-slate-300 bg-white/[0.05] border border-white/[0.08] rounded-md uppercase tracking-wide">
                                                                        {s.replace(/_/g, ' ')}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── 4. GAMMA & OPTIONS ── */}
                            {d.gammaOptions && (
                                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f17]/70 p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Zap className="w-4.5 h-4.5 text-yellow-400" />
                                        <h3 className="text-[15px] font-bold text-white tracking-tight uppercase">
                                            {(SECTION_TITLES.gammaOptions as any)[locale] || SECTION_TITLES.gammaOptions.en}
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total GEX</span>
                                            <span className="text-[18px] font-black text-white font-mono">{d.gammaOptions.totalGexLabel || '-'}</span>
                                        </div>
                                        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">AVG PCR</span>
                                            <span className={`text-[18px] font-black font-mono ${(d.gammaOptions.avgPcr || 1) < 0.8 ? 'text-emerald-400' : (d.gammaOptions.avgPcr || 1) > 1.2 ? 'text-red-400' : 'text-amber-400'}`}>
                                                {(d.gammaOptions.avgPcr || 0).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">REGIME</span>
                                            <span className={`text-[18px] font-black font-mono ${d.gammaOptions.regime === 'LONG' ? 'text-emerald-400' : d.gammaOptions.regime === 'SHORT' ? 'text-red-400' : 'text-amber-400'}`}>
                                                {d.gammaOptions.regime || 'NEUTRAL'}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-[14px] text-slate-200 leading-[1.7]">
                                        {lt(d.gammaOptions.insight, locale)}
                                    </p>
                                </div>
                            )}

                            {/* ── 5. OUTLOOK & STRATEGY ── */}
                            {d.outlook && (
                                <div className="rounded-xl border border-amber-500/[0.12] bg-[#0b0f17]/70 p-5">
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
                                                <div key={i} className="p-2.5 rounded-lg bg-amber-500/[0.05] border border-amber-500/[0.10] text-center">
                                                    <span className="text-[10px] font-bold text-amber-300/70 uppercase tracking-wider block mb-0.5">{level.label}</span>
                                                    <span className="text-[16px] font-black text-white font-mono">{level.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Catalysts / Risks / Opportunities — 3 column */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {/* Catalysts */}
                                        <div className="p-3 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/[0.10]">
                                            <span className="text-[11px] font-bold text-cyan-400 tracking-widest uppercase block mb-2">
                                                {locale === 'ko' ? '촉매' : locale === 'ja' ? '触媒' : 'CATALYSTS'}
                                            </span>
                                            <ul className="space-y-1.5">
                                                {la(d.outlook.catalysts, locale).map((c: string, i: number) => (
                                                    <li key={i} className="text-[13px] text-slate-200 flex items-start gap-1.5">
                                                        <Zap className="w-3 h-3 text-cyan-400 mt-0.5 shrink-0" />
                                                        <span>{c}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        {/* Risks */}
                                        <div className="p-3 rounded-lg bg-red-500/[0.05] border border-red-500/[0.10]">
                                            <span className="text-[11px] font-bold text-red-400 tracking-widest uppercase block mb-2">
                                                {locale === 'ko' ? '리스크' : locale === 'ja' ? 'リスク' : 'RISKS'}
                                            </span>
                                            <ul className="space-y-1.5">
                                                {la(d.outlook.risks, locale).map((r: string, i: number) => (
                                                    <li key={i} className="text-[13px] text-slate-200 flex items-start gap-1.5">
                                                        <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                                                        <span>{r}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        {/* Opportunities */}
                                        <div className="p-3 rounded-lg bg-emerald-500/[0.05] border border-emerald-500/[0.10]">
                                            <span className="text-[11px] font-bold text-emerald-400 tracking-widest uppercase block mb-2">
                                                {locale === 'ko' ? '기회' : locale === 'ja' ? '機会' : 'OPPORTUNITIES'}
                                            </span>
                                            <ul className="space-y-1.5">
                                                {la(d.outlook.opportunities, locale).map((o: string, i: number) => (
                                                    <li key={i} className="text-[13px] text-slate-200 flex items-start gap-1.5">
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
                        className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-white/[0.05] border border-white/[0.08] rounded-lg hover:bg-white/[0.10] transition-colors"
                    >
                        {t('expandAll')}
                    </button>
                    <button
                        onClick={collapseAll}
                        className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-white/[0.05] border border-white/[0.08] rounded-lg hover:bg-white/[0.10] transition-colors"
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
                    <section key={config.id} className="rounded-xl border border-white/[0.08] bg-[#0b0f17]/70 overflow-hidden transition-all duration-300">
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
