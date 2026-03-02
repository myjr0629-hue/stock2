'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, Sparkles, Loader2, FileText, Orbit, Bot, Zap, Activity, ShieldAlert, Shield, Rocket, Cpu, CreditCard, Cloud } from 'lucide-react';
import { useTranslations } from 'next-intl';
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

interface CrossSectorBrief {
    analysis: string;
    generatedAt: string;
    date: string;
    sectorCount: number;
}

export function PostMarketBriefView() {
    const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
    const [brief, setBrief] = useState<CrossSectorBrief | null>(null);
    const [briefLoading, setBriefLoading] = useState(true);
    const t = useTranslations('intel.postMarketUI');

    // Fetch AI cross-sector brief
    useEffect(() => {
        async function fetchBrief() {
            try {
                const res = await fetch('/api/intel/cross-sector-brief', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.analysis) {
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
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const expandAll = () => {
        setExpandedSectors(new Set(ALL_SECTORS.map(s => s.config.id)));
    };

    const collapseAll = () => {
        setExpandedSectors(new Set());
    };

    // Parse markdown-like analysis into sections
    const renderAnalysis = (text: string) => {
        return text.split('\n').map((line, i) => {
            // Section headers (### 📊 ...)
            if (line.startsWith('### ')) {
                return (
                    <h3 key={i} className="text-lg font-bold text-amber-300 mt-6 mb-3 flex items-center gap-2">
                        {line.replace('### ', '')}
                    </h3>
                );
            }
            // Bold text processing
            if (line.startsWith('- ') || line.startsWith('• ')) {
                return (
                    <p key={i} className="text-slate-200 text-[15px] leading-relaxed ml-4 mb-1.5"
                        dangerouslySetInnerHTML={{
                            __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
                        }}
                    />
                );
            }
            if (line.trim() === '') return <div key={i} className="h-2" />;
            return (
                <p key={i} className="text-slate-300 text-[15px] leading-relaxed mb-1.5"
                    dangerouslySetInnerHTML={{
                        __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
                    }}
                />
            );
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
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

            {/* AI Cross-Sector Analysis Card */}
            <section className="relative rounded-2xl border border-amber-500/[0.12] bg-[#0c1018]/90 backdrop-blur-sm overflow-hidden">
                {/* Top glow bar */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

                <div className="p-6">
                    {/* Card header */}
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">CROSS-SECTOR INTELLIGENCE</h2>
                            <p className="text-[13px] text-slate-300 font-mono">
                                {brief ? `Generated ${new Date(brief.generatedAt).toLocaleString('ko-KR', { timeZone: 'America/New_York' })} ET` : 'AI-POWERED DAILY ANALYSIS'}
                            </p>
                        </div>
                        {brief && (
                            <span className="ml-auto px-2.5 py-1 text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full">
                                GEMINI AI
                            </span>
                        )}
                    </div>

                    {/* Analysis content */}
                    {briefLoading ? (
                        <div className="flex items-center gap-3 py-12 justify-center">
                            <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                            <span className="text-slate-300 text-[13px]">{t('analysisLoading')}</span>
                        </div>
                    ) : brief ? (
                        <div className="prose prose-invert max-w-none">
                            {renderAnalysis(brief.analysis)}
                        </div>
                    ) : (
                        <div className="text-center py-10">
                            <p className="text-slate-300 text-[14px]">{t('noAnalysis')}</p>
                            <p className="text-slate-300 text-[13px] mt-1 font-mono">{t('autoGenerate')}</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Expand/Collapse Controls */}
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

            {/* Accordion Sector Reports */}
            {ALL_SECTORS.map(({ config, icon, accentColor }) => {
                const isExpanded = expandedSectors.has(config.id);
                const [textColor, bgColor, borderColor] = accentColor.split(' ');
                return (
                    <section key={config.id} className="rounded-xl border border-white/[0.08] bg-[#0b0f17]/70 overflow-hidden transition-all duration-300">
                        {/* Accordion Header */}
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

                        {/* Accordion Content */}
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
