import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import Image from 'next/image';
import { getTranslations, getLocale } from 'next-intl/server';
import {
    Radio, Target, Activity, Zap, Crosshair, Radar, TrendingUp,
    BarChart3, Lightbulb, Shield, AlertTriangle, Layers,
    Percent, Lock, Eye, ArrowUpDown, Cpu, Banknote, Signal
} from 'lucide-react';

export default async function FlowGuidePage() {
    const t = await getTranslations('flowGuide');
    const locale = await getLocale();

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
        emerald: (chunks: React.ReactNode) => <span className="text-emerald-400 font-semibold">{chunks}</span>,
        purple: (chunks: React.ReactNode) => <span className="text-purple-400 font-semibold">{chunks}</span>,
        indigo: (chunks: React.ReactNode) => <span className="text-indigo-400 font-semibold">{chunks}</span>,
    };

    const screenshotSuffix = locale === 'ko' ? '' : `-${locale}`;

    /* ── Infographic SVG Backgrounds per card type ── */
    const InfographicBg = ({ type }: { type: 'radar' | 'grid' | 'pulse' | 'wave' | 'dots' | 'diagonal' | 'scanline' | 'crosshair' | 'bars' | 'circuit' | 'shield' | 'flow' }) => {
        const svgs: Record<string, React.ReactNode> = {
            radar: (
                <svg className="absolute inset-0 w-full h-full opacity-[0.06]" viewBox="0 0 200 200">
                    <circle cx="170" cy="100" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-cyan-400" />
                    <circle cx="170" cy="100" r="55" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-cyan-400" />
                    <circle cx="170" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="0.2" className="text-cyan-400" />
                    <line x1="170" y1="20" x2="170" y2="180" stroke="currentColor" strokeWidth="0.3" className="text-cyan-400" />
                    <line x1="90" y1="100" x2="200" y2="100" stroke="currentColor" strokeWidth="0.3" className="text-cyan-400" />
                </svg>
            ),
            grid: (
                <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(251,191,36,0.4) 24px, rgba(251,191,36,0.4) 25px), repeating-linear-gradient(90deg, transparent, transparent 24px, rgba(251,191,36,0.4) 24px, rgba(251,191,36,0.4) 25px)" }} />
            ),
            pulse: (
                <svg className="absolute inset-0 w-full h-full opacity-[0.05]" viewBox="0 0 300 100" preserveAspectRatio="none">
                    <path d="M0,50 L40,50 L50,20 L60,80 L70,30 L80,70 L90,50 L300,50" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400" />
                    <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(251,191,36)" stopOpacity="0.15" /><stop offset="100%" stopColor="rgb(251,191,36)" stopOpacity="0" /></linearGradient>
                    <path d="M0,50 L40,50 L50,20 L60,80 L70,30 L80,70 L90,50 L300,50 L300,100 L0,100 Z" fill="url(#pulseFill)" />
                </svg>
            ),
            wave: (
                <svg className="absolute inset-0 w-full h-full opacity-[0.05]" viewBox="0 0 400 100" preserveAspectRatio="none">
                    <path d="M0,60 Q50,30 100,50 T200,40 T300,55 T400,30" fill="none" stroke="currentColor" strokeWidth="1" className="text-indigo-400" />
                    <path d="M0,70 Q50,45 100,60 T200,55 T300,65 T400,45" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-indigo-400" />
                </svg>
            ),
            dots: (
                <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle, rgba(139,92,246,0.6) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
            ),
            diagonal: (
                <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 8px, rgba(244,63,94,0.4) 8px, rgba(244,63,94,0.4) 9px)" }} />
            ),
            scanline: (
                <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(168,85,247,0.3) 3px, rgba(168,85,247,0.3) 4px)" }} />
            ),
            crosshair: (
                <svg className="absolute inset-0 w-full h-full opacity-[0.05]" viewBox="0 0 200 200">
                    <circle cx="160" cy="100" r="40" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" className="text-emerald-400" />
                    <line x1="160" y1="55" x2="160" y2="145" stroke="currentColor" strokeWidth="0.3" className="text-emerald-400" />
                    <line x1="115" y1="100" x2="200" y2="100" stroke="currentColor" strokeWidth="0.3" className="text-emerald-400" />
                </svg>
            ),
            bars: (
                <svg className="absolute inset-0 w-full h-full opacity-[0.05]" viewBox="0 0 200 100" preserveAspectRatio="none">
                    <rect x="20" y="30" width="8" height="40" rx="2" fill="currentColor" className="text-cyan-400" />
                    <rect x="40" y="45" width="8" height="25" rx="2" fill="currentColor" className="text-cyan-400" />
                    <rect x="60" y="20" width="8" height="50" rx="2" fill="currentColor" className="text-cyan-400" />
                    <rect x="80" y="35" width="8" height="35" rx="2" fill="currentColor" className="text-cyan-400" />
                    <rect x="100" y="50" width="8" height="20" rx="2" fill="currentColor" className="text-cyan-400" />
                </svg>
            ),
            circuit: (
                <svg className="absolute inset-0 w-full h-full opacity-[0.04]" viewBox="0 0 200 200">
                    <path d="M10,100 H60 L70,80 H130 L140,100 H190" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-rose-400" />
                    <path d="M10,130 H40 L50,150 H100 L110,130 H190" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-rose-400" />
                    <circle cx="70" cy="80" r="3" fill="currentColor" className="text-rose-400" />
                    <circle cx="140" cy="100" r="3" fill="currentColor" className="text-rose-400" />
                </svg>
            ),
            shield: (
                <svg className="absolute inset-0 w-full h-full opacity-[0.04]" viewBox="0 0 200 200">
                    <path d="M100,20 L170,50 L170,120 Q170,170 100,190 Q30,170 30,120 L30,50 Z" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-purple-400" />
                    <path d="M100,40 L150,60 L150,110 Q150,150 100,170 Q50,150 50,110 L50,60 Z" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-purple-400" />
                </svg>
            ),
            flow: (
                <svg className="absolute inset-0 w-full h-full opacity-[0.05]" viewBox="0 0 300 100" preserveAspectRatio="none">
                    <path d="M0,50 C50,30 100,70 150,50 S250,30 300,50" fill="none" stroke="currentColor" strokeWidth="1" className="text-sky-400" />
                    <path d="M0,60 C50,40 100,80 150,60 S250,40 300,60" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-sky-400" />
                    <circle cx="150" cy="50" r="3" fill="currentColor" className="text-sky-400" />
                </svg>
            ),
        };
        return <>{svgs[type]}</>;
    };

    /* ── Reusable Card Component ── */
    const IndicatorCard = ({
        icon: Icon, iconColor, gradientFrom, badgeColor, badgeBg,
        mockupLabel, mockupValue, mockupValueColor, mockupSub, mockupSubColor,
        titleKey, badgeKey, descKey, bullets, tipKey,
        tradingGuideKey, guide1Key, guide2Key, guide3Key,
        infoBg, subMetrics,
    }: {
        icon: any; iconColor: string; gradientFrom: string;
        badgeColor: string; badgeBg: string;
        mockupLabel: string; mockupValue: string; mockupValueColor: string; mockupSub?: string; mockupSubColor?: string;
        titleKey: string; badgeKey: string; descKey: string;
        bullets: { color: string; textKey: string }[];
        tipKey: string;
        tradingGuideKey: string; guide1Key: string; guide2Key: string; guide3Key: string;
        infoBg: React.ReactNode;
        subMetrics?: { label: string; value: string; color: string }[];
    }) => (
        <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
            <div className={`absolute inset-0 bg-gradient-to-br ${gradientFrom} via-transparent to-transparent pointer-events-none`} />
            {infoBg}
            <div className="relative z-10 space-y-4">
                {/* Mockup + Title */}
                <div className="flex items-center gap-3">
                    <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Icon size={12} className={iconColor} />
                            <span className="text-[12px] font-bold text-slate-300 tracking-wider">{mockupLabel}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-2xl font-black ${mockupValueColor} tracking-tight`}>{mockupValue}</span>
                            {mockupSub && <span className={`text-[12px] ${mockupSubColor || 'text-slate-400'}`}>{mockupSub}</span>}
                        </div>
                        {subMetrics && (
                            <div className="flex gap-3 mt-1 text-[11px] tabular-nums">
                                {subMetrics.map((m, i) => (
                                    <span key={i} className="text-white/60">{m.label} <span className={`font-bold ${m.color}`}>{m.value}</span></span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-base font-black text-white">{t(titleKey)}</h4>
                            <span className={`px-2 py-0.5 rounded-full ${badgeBg} border ${badgeColor} text-[12px] font-bold`}>{t(badgeKey)}</span>
                        </div>
                    </div>
                </div>

                {/* Description */}
                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t.rich(descKey, richTags)}
                </p>

                {/* Bullet Explanations */}
                <div className="space-y-2">
                    {bullets.map((b, i) => (
                        <div key={i} className="flex items-start gap-2 text-[14px]">
                            <div className={`w-2.5 h-2.5 rounded-full ${b.color} mt-1 flex-shrink-0`} />
                            <span className="text-slate-300">{t(b.textKey)}</span>
                        </div>
                    ))}
                </div>

                {/* Tip */}
                <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <span className="text-[13px] text-amber-200/90 leading-relaxed">{t(tipKey)}</span>
                </div>

                {/* Trading Guide */}
                <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                    <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t(tradingGuideKey)}</span>
                    <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                        <p>• {t(guide1Key)}</p>
                        <p>• {t(guide2Key)}</p>
                        <p>• {t(guide3Key)}</p>
                    </div>
                </div>
            </div>
        </div>
    );

    /* ── Section Component ── */
    const SectionCard = ({
        icon: Icon, iconColor, gradientFrom, titleKey, descKey, infoBg, children
    }: {
        icon: any; iconColor: string; gradientFrom: string; titleKey: string; descKey: string; infoBg?: React.ReactNode; children?: React.ReactNode;
    }) => (
        <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
            <div className={`absolute inset-0 bg-gradient-to-br ${gradientFrom} via-transparent to-transparent pointer-events-none`} />
            {infoBg}
            <div className="relative z-10 space-y-3">
                <div className="flex items-center gap-2">
                    <Icon size={18} className={iconColor} />
                    <h4 className="text-base font-black text-white">{t(titleKey)}</h4>
                </div>
                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t.rich(descKey, richTags)}
                </p>
                {children}
            </div>
        </div>
    );

    return (
        <HowItWorksLayout
            title="FLOW RADAR"
            subtitle={t('subtitle')}
        >
            {/* ═══ Overview Section ═══ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-[12px] text-sky-400 font-medium uppercase tracking-wider">Options Intelligence Center</p>
                </div>
                <p className="text-base text-slate-300 leading-relaxed">{t.rich('overviewDesc', richTags)}</p>
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-500/[0.04] via-transparent to-indigo-500/[0.03] pointer-events-none" />
                    <Image src={`/guide/flow-full${screenshotSuffix}.png`} alt="Flow Radar Full View" width={1440} height={900} className="w-full h-auto relative object-cover object-top max-h-[950px]" />
                </div>
            </section>

            {/* ═══ LEVEL 1: AI VERDICT ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('level1Title')}</h3>
                        <p className="text-[12px] text-cyan-400 font-medium uppercase tracking-wider">AI VERDICT — {t('level1Subtitle')}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30">
                        <span className="text-[12px] font-bold text-cyan-300">Level 1</span>
                    </div>
                </div>
                <p className="text-base text-slate-300 leading-relaxed">{t.rich('level1Desc', richTags)}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* OPI */}
                    <IndicatorCard
                        icon={Radar} iconColor="text-cyan-400" gradientFrom="from-cyan-500/[0.06]"
                        badgeColor="border-cyan-500/30" badgeBg="bg-cyan-500/20 text-cyan-300"
                        mockupLabel="OPI" mockupValue="+52" mockupValueColor="text-emerald-400" mockupSub={t('opi.mockSub')} mockupSubColor="text-emerald-300"
                        titleKey="opi.title" badgeKey="opi.badge" descKey="opi.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'opi.strongCall' },
                            { color: 'bg-cyan-500', textKey: 'opi.call' },
                            { color: 'bg-slate-500', textKey: 'opi.neutral' },
                            { color: 'bg-rose-500', textKey: 'opi.put' },
                        ]}
                        tipKey="opi.tip"
                        tradingGuideKey="opi.tradingGuide" guide1Key="opi.guide1" guide2Key="opi.guide2" guide3Key="opi.guide3"
                        infoBg={<InfographicBg type="radar" />}
                    />
                    {/* ATM IV */}
                    <IndicatorCard
                        icon={Activity} iconColor="text-amber-400" gradientFrom="from-amber-500/[0.06]"
                        badgeColor="border-amber-500/30" badgeBg="bg-amber-500/20 text-amber-300"
                        mockupLabel="ATM IV" mockupValue="60%" mockupValueColor="text-rose-400" mockupSub={t('atmIv.mockSub')} mockupSubColor="text-rose-300"
                        titleKey="atmIv.title" badgeKey="atmIv.badge" descKey="atmIv.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'atmIv.veryLow' },
                            { color: 'bg-cyan-500', textKey: 'atmIv.low' },
                            { color: 'bg-amber-500', textKey: 'atmIv.high' },
                            { color: 'bg-rose-500', textKey: 'atmIv.veryHigh' },
                        ]}
                        tipKey="atmIv.tip"
                        tradingGuideKey="atmIv.tradingGuide" guide1Key="atmIv.guide1" guide2Key="atmIv.guide2" guide3Key="atmIv.guide3"
                        infoBg={<InfographicBg type="pulse" />}
                    />
                    {/* COMPOSITE INDEX */}
                    <IndicatorCard
                        icon={Layers} iconColor="text-indigo-400" gradientFrom="from-indigo-500/[0.06]"
                        badgeColor="border-indigo-500/30" badgeBg="bg-indigo-500/20 text-indigo-300"
                        mockupLabel="COMPOSITE" mockupValue="53%" mockupValueColor="text-white" mockupSub={t('composite.mockSub')} mockupSubColor="text-slate-400"
                        titleKey="composite.title" badgeKey="composite.badge" descKey="composite.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'composite.bullish' },
                            { color: 'bg-cyan-500', textKey: 'composite.leanBull' },
                            { color: 'bg-amber-500', textKey: 'composite.leanBear' },
                            { color: 'bg-rose-500', textKey: 'composite.bearish' },
                        ]}
                        tipKey="composite.tip"
                        tradingGuideKey="composite.tradingGuide" guide1Key="composite.guide1" guide2Key="composite.guide2" guide3Key="composite.guide3"
                        infoBg={<InfographicBg type="wave" />}
                    />
                    {/* WHALE POSITION */}
                    <IndicatorCard
                        icon={Target} iconColor="text-emerald-400" gradientFrom="from-emerald-500/[0.06]"
                        badgeColor="border-emerald-500/30" badgeBg="bg-emerald-500/20 text-emerald-300"
                        mockupLabel="WHALE" mockupValue="LONG" mockupValueColor="text-emerald-400" mockupSub="+$718K" mockupSubColor="text-emerald-300"
                        subMetrics={[{ label: 'C', value: '$1,016K', color: 'text-emerald-400' }, { label: 'P', value: '$298K', color: 'text-rose-400' }]}
                        titleKey="whale.title" badgeKey="whale.badge" descKey="whale.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'whale.long' },
                            { color: 'bg-rose-500', textKey: 'whale.short' },
                            { color: 'bg-slate-500', textKey: 'whale.neutral' },
                        ]}
                        tipKey="whale.tip"
                        tradingGuideKey="whale.tradingGuide" guide1Key="whale.guide1" guide2Key="whale.guide2" guide3Key="whale.guide3"
                        infoBg={<InfographicBg type="bars" />}
                    />
                </div>
            </section>

            {/* ═══ LEVEL 2: Market Structure ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('level2Title')}</h3>
                        <p className="text-[12px] text-amber-400 font-medium uppercase tracking-wider">{t('level2Subtitle')}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                        <span className="text-[12px] font-bold text-amber-300">Level 2</span>
                    </div>
                </div>
                <p className="text-base text-slate-300 leading-relaxed">{t.rich('level2Desc', richTags)}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* DARK POOL % */}
                    <IndicatorCard
                        icon={Lock} iconColor="text-purple-400" gradientFrom="from-purple-500/[0.06]"
                        badgeColor="border-purple-500/30" badgeBg="bg-purple-500/20 text-purple-300"
                        mockupLabel="DARK POOL %" mockupValue="58.7%" mockupValueColor="text-rose-400" mockupSub="POST" mockupSubColor="text-rose-300"
                        subMetrics={[{ label: 'DP', value: '177.4K', color: 'text-white' }, { label: 'Total', value: '302.4K', color: 'text-white' }]}
                        titleKey="darkPool.title" badgeKey="darkPool.badge" descKey="darkPool.desc"
                        bullets={[
                            { color: 'bg-rose-500', textKey: 'darkPool.high' },
                            { color: 'bg-amber-500', textKey: 'darkPool.elevated' },
                            { color: 'bg-emerald-500', textKey: 'darkPool.normal' },
                        ]}
                        tipKey="darkPool.tip"
                        tradingGuideKey="darkPool.tradingGuide" guide1Key="darkPool.guide1" guide2Key="darkPool.guide2" guide3Key="darkPool.guide3"
                        infoBg={<InfographicBg type="shield" />}
                    />
                    {/* SHORT VOL % */}
                    <IndicatorCard
                        icon={ArrowUpDown} iconColor="text-rose-400" gradientFrom="from-rose-500/[0.06]"
                        badgeColor="border-rose-500/30" badgeBg="bg-rose-500/20 text-rose-300"
                        mockupLabel="SHORT VOL %" mockupValue="45.2%" mockupValueColor="text-amber-400" mockupSub={t('shortVol.mockSub')} mockupSubColor="text-amber-300"
                        subMetrics={[{ label: 'Short', value: '17.8M', color: 'text-rose-400' }, { label: 'Total', value: '39.5M', color: 'text-white' }]}
                        titleKey="shortVol.title" badgeKey="shortVol.badge" descKey="shortVol.desc"
                        bullets={[
                            { color: 'bg-rose-500', textKey: 'shortVol.high' },
                            { color: 'bg-amber-500', textKey: 'shortVol.elevated' },
                            { color: 'bg-emerald-500', textKey: 'shortVol.normal' },
                        ]}
                        tipKey="shortVol.tip"
                        tradingGuideKey="shortVol.tradingGuide" guide1Key="shortVol.guide1" guide2Key="shortVol.guide2" guide3Key="shortVol.guide3"
                        infoBg={<InfographicBg type="diagonal" />}
                    />
                    {/* P/C RATIO */}
                    <IndicatorCard
                        icon={BarChart3} iconColor="text-sky-400" gradientFrom="from-sky-500/[0.06]"
                        badgeColor="border-sky-500/30" badgeBg="bg-sky-500/20 text-sky-300"
                        mockupLabel="P/C RATIO" mockupValue="0.89" mockupValueColor="text-white" mockupSub={t('pcRatio.mockSub')} mockupSubColor="text-slate-400"
                        subMetrics={[{ label: 'C', value: '268K', color: 'text-emerald-400' }, { label: 'P', value: '292K', color: 'text-rose-400' }]}
                        titleKey="pcRatio.title" badgeKey="pcRatio.badge" descKey="pcRatio.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'pcRatio.callDom' },
                            { color: 'bg-slate-500', textKey: 'pcRatio.balanced' },
                            { color: 'bg-rose-500', textKey: 'pcRatio.putDom' },
                        ]}
                        tipKey="pcRatio.tip"
                        tradingGuideKey="pcRatio.tradingGuide" guide1Key="pcRatio.guide1" guide2Key="pcRatio.guide2" guide3Key="pcRatio.guide3"
                        infoBg={<InfographicBg type="grid" />}
                    />
                    {/* GEX REGIME */}
                    <IndicatorCard
                        icon={Zap} iconColor="text-rose-400" gradientFrom="from-rose-500/[0.06]"
                        badgeColor="border-rose-500/30" badgeBg="bg-rose-500/20 text-rose-300"
                        mockupLabel="GEX REGIME" mockupValue="EXPLODE" mockupValueColor="text-rose-400" mockupSub="" mockupSubColor=""
                        subMetrics={[{ label: 'Flip', value: '+2.7%', color: 'text-emerald-400' }, { label: 'DTE', value: '1', color: 'text-white' }]}
                        titleKey="gexRegime.title" badgeKey="gexRegime.badge" descKey="gexRegime.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'gexRegime.stable' },
                            { color: 'bg-amber-500', textKey: 'gexRegime.transition' },
                            { color: 'bg-orange-500', textKey: 'gexRegime.flipZone' },
                            { color: 'bg-rose-500', textKey: 'gexRegime.explosive' },
                        ]}
                        tipKey="gexRegime.tip"
                        tradingGuideKey="gexRegime.tradingGuide" guide1Key="gexRegime.guide1" guide2Key="gexRegime.guide2" guide3Key="gexRegime.guide3"
                        infoBg={<InfographicBg type="circuit" />}
                    />
                </div>

                {/* Price Position + Squeeze */}
                <div className="flex items-center gap-2 mt-4 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/30 to-transparent" />
                    <span className="text-[12px] font-bold text-emerald-400 uppercase tracking-widest whitespace-nowrap">{t('auxiliaryTitle')}</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-emerald-500/30 to-transparent" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SectionCard icon={Crosshair} iconColor="text-emerald-400" gradientFrom="from-emerald-500/[0.06]" titleKey="pricePosition.title" descKey="pricePosition.desc" infoBg={<InfographicBg type="crosshair" />} />
                    <SectionCard icon={Zap} iconColor="text-purple-400" gradientFrom="from-purple-500/[0.06]" titleKey="squeeze.title" descKey="squeeze.desc" infoBg={<InfographicBg type="scanline" />} />
                </div>
            </section>

            {/* ═══ LEVEL 3: Classified Order Flow ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('level3Title')}</h3>
                        <p className="text-[12px] text-rose-400 font-medium uppercase tracking-wider">{t('level3Subtitle')}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30">
                        <span className="text-[12px] font-bold text-rose-300">Level 3</span>
                    </div>
                </div>
                <p className="text-base text-slate-300 leading-relaxed">{t.rich('level3Desc', richTags)}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SectionCard icon={Eye} iconColor="text-emerald-400" gradientFrom="from-emerald-500/[0.06]" titleKey="classifiedWhale.title" descKey="classifiedWhale.desc" infoBg={<InfographicBg type="bars" />} />
                    <SectionCard icon={Shield} iconColor="text-purple-400" gradientFrom="from-purple-500/[0.06]" titleKey="classifiedDarkPool.title" descKey="classifiedDarkPool.desc" infoBg={<InfographicBg type="shield" />} />
                </div>

                {/* Options Flow Battlefield */}
                <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-transparent pointer-events-none" />
                    <div className="relative z-10 space-y-4">
                        <div className="flex items-center gap-2">
                            <BarChart3 size={18} className="text-indigo-400" />
                            <h4 className="text-base font-black text-white">{t('battlefield.title')}</h4>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[12px] font-bold">{t('battlefield.badge')}</span>
                        </div>
                        <p className="text-[15px] text-slate-300 leading-relaxed">
                            {t.rich('battlefield.desc', richTags)}
                        </p>
                        <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/30 shadow-lg">
                            <Image src="/guide/option flow battlefield.PNG" alt="Options Flow Battlefield" width={1440} height={700} className="w-full h-auto" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                            <div className="p-3 rounded-lg bg-emerald-900/20 border border-emerald-500/20">
                                <span className="text-[13px] font-bold text-emerald-400">{t('battlefield.callLabel')}</span>
                                <p className="text-[12px] text-slate-300 mt-1">{t('battlefield.callDesc')}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-rose-900/20 border border-rose-500/20">
                                <span className="text-[13px] font-bold text-rose-400">{t('battlefield.putLabel')}</span>
                                <p className="text-[12px] text-slate-300 mt-1">{t('battlefield.putDesc')}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-cyan-900/20 border border-cyan-500/20">
                                <span className="text-[13px] font-bold text-cyan-400">{t('battlefield.priceLabel')}</span>
                                <p className="text-[12px] text-slate-300 mt-1">{t('battlefield.priceDesc')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ Volume / OI Toggle — Battlefield Data Modes ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('volumeOi.sectionTitle')}</h3>
                        <p className="text-[12px] text-indigo-400 font-medium uppercase tracking-wider">{t('volumeOi.sectionSubtitle')}</p>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30">
                        <span className="text-[12px] font-bold text-indigo-300">Volume</span>
                        <span className="text-[10px] text-slate-500">/</span>
                        <span className="text-[12px] font-bold text-indigo-300">OI</span>
                    </div>
                </div>
                <p className="text-base text-slate-300 leading-relaxed">{t.rich('volumeOi.sectionDesc', richTags)}</p>

                {/* Toggle Visual Diagram — SVG Infographic */}
                <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-transparent pointer-events-none" />
                    <div className="relative z-10 space-y-4">
                        <div className="flex items-center gap-2">
                            <BarChart3 size={18} className="text-indigo-400" />
                            <h4 className="text-base font-black text-white">{t('volumeOi.diagramTitle')}</h4>
                        </div>

                        {/* SVG: Volume vs OI concept diagram */}
                        <div className="relative w-full rounded-xl overflow-hidden border border-white/10 bg-[#0c1322]" style={{ aspectRatio: '16/7' }}>
                            <svg viewBox="0 0 800 350" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                                {/* Background Grid */}
                                <defs>
                                    <pattern id="voGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" /></pattern>
                                    <linearGradient id="callBarGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(16,185,129,0.1)" /><stop offset="100%" stopColor="rgba(16,185,129,0.7)" /></linearGradient>
                                    <linearGradient id="putBarGrad" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stopColor="rgba(244,63,94,0.1)" /><stop offset="100%" stopColor="rgba(244,63,94,0.7)" /></linearGradient>
                                    <linearGradient id="volBtnGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#4f46e5" /></linearGradient>
                                </defs>
                                <rect width="800" height="350" fill="url(#voGrid)" />

                                {/* ── LEFT PANEL: VOLUME VIEW ── */}
                                <rect x="20" y="15" width="370" height="320" rx="12" fill="rgba(99,102,241,0.05)" stroke="rgba(99,102,241,0.15)" strokeWidth="1" />
                                <text x="205" y="45" textAnchor="middle" fill="#a5b4fc" fontSize="13" fontWeight="800" letterSpacing="2">VOLUME VIEW</text>
                                <rect x="155" y="52" width="100" height="18" rx="4" fill="url(#volBtnGrad)" />
                                <text x="205" y="65" textAnchor="middle" fill="white" fontSize="10" fontWeight="800">Volume</text>
                                {/* DTE Badge */}
                                <rect x="263" y="52" width="60" height="18" rx="4" fill="rgba(34,211,238,0.1)" stroke="rgba(34,211,238,0.3)" strokeWidth="0.5" />
                                <text x="293" y="65" textAnchor="middle" fill="#67e8f9" fontSize="9" fontWeight="700">0-7 DTE</text>

                                {/* Volume bars — 5 strike rows */}
                                {/* $200 ── Call dominant */}
                                <text x="205" y="100" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700" fontFamily="monospace">$200</text>
                                <rect x="220" y="91" width="120" height="14" rx="2" fill="url(#callBarGrad)" />
                                <rect x="65" y="91" width="140" height="14" rx="2" fill="url(#putBarGrad)" transform="translate(0,0)" />
                                <text x="345" y="102" fill="#34d399" fontSize="9" fontWeight="600">12.4K</text>
                                <text x="55" y="102" textAnchor="end" fill="#fb7185" fontSize="9" fontWeight="600">14.8K</text>

                                {/* $195 ── Balanced */}
                                <text x="205" y="130" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700" fontFamily="monospace">$195</text>
                                <rect x="220" y="121" width="90" height="14" rx="2" fill="url(#callBarGrad)" />
                                <rect x="115" y="121" width="90" height="14" rx="2" fill="url(#putBarGrad)" />
                                <text x="315" y="132" fill="#34d399" fontSize="9" fontWeight="600">8.2K</text>
                                <text x="110" y="132" textAnchor="end" fill="#fb7185" fontSize="9" fontWeight="600">9.1K</text>

                                {/* $190 ── Current price line */}
                                <line x1="40" y1="148" x2="380" y2="148" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                                <rect x="175" y="141" width="60" height="14" rx="7" fill="#0f172a" stroke="#38bdf8" strokeWidth="0.8" />
                                <text x="205" y="151" textAnchor="middle" fill="#38bdf8" fontSize="8" fontWeight="800">$189.50</text>

                                {/* $185 ── Put dominant */}
                                <text x="205" y="175" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700" fontFamily="monospace">$185</text>
                                <rect x="220" y="166" width="60" height="14" rx="2" fill="url(#callBarGrad)" />
                                <rect x="75" y="166" width="130" height="14" rx="2" fill="url(#putBarGrad)" />
                                <text x="285" y="177" fill="#34d399" fontSize="9" fontWeight="600">5.1K</text>
                                <text x="70" y="177" textAnchor="end" fill="#fb7185" fontSize="9" fontWeight="600">13.6K</text>

                                {/* $180 */}
                                <text x="205" y="205" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700" fontFamily="monospace">$180</text>
                                <rect x="220" y="196" width="40" height="14" rx="2" fill="url(#callBarGrad)" />
                                <rect x="105" y="196" width="100" height="14" rx="2" fill="url(#putBarGrad)" />

                                {/* Volume explanation box */}
                                <rect x="35" y="230" width="340" height="95" rx="8" fill="rgba(99,102,241,0.08)" stroke="rgba(99,102,241,0.15)" strokeWidth="0.5" />
                                <text x="55" y="250" fill="#c4b5fd" fontSize="10" fontWeight="700">⚡ {t('volumeOi.volumeBoxTitle')}</text>
                                <text x="55" y="268" fill="#94a3b8" fontSize="9">{t('volumeOi.volumeBoxLine1')}</text>
                                <text x="55" y="283" fill="#94a3b8" fontSize="9">{t('volumeOi.volumeBoxLine2')}</text>
                                <text x="55" y="298" fill="#94a3b8" fontSize="9">{t('volumeOi.volumeBoxLine3')}</text>
                                <text x="55" y="313" fill="#67e8f9" fontSize="9" fontWeight="600">{t('volumeOi.volumeBoxUse')}</text>

                                {/* ── RIGHT PANEL: OI VIEW ── */}
                                <rect x="410" y="15" width="370" height="320" rx="12" fill="rgba(168,85,247,0.05)" stroke="rgba(168,85,247,0.15)" strokeWidth="1" />
                                <text x="595" y="45" textAnchor="middle" fill="#c4b5fd" fontSize="13" fontWeight="800" letterSpacing="2">OI VIEW</text>
                                <rect x="555" y="52" width="80" height="18" rx="4" fill="rgba(168,85,247,0.3)" stroke="rgba(168,85,247,0.4)" strokeWidth="0.5" />
                                <text x="595" y="65" textAnchor="middle" fill="white" fontSize="10" fontWeight="800">OI</text>
                                {/* DTE Badge */}
                                <rect x="643" y="52" width="70" height="18" rx="4" fill="rgba(34,211,238,0.1)" stroke="rgba(34,211,238,0.3)" strokeWidth="0.5" />
                                <text x="678" y="65" textAnchor="middle" fill="#67e8f9" fontSize="9" fontWeight="700">0-35 DTE</text>

                                {/* OI bars — 5 strike rows (wider, more accumulated) */}
                                <text x="595" y="100" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700" fontFamily="monospace">$200</text>
                                <rect x="610" y="91" width="145" height="14" rx="2" fill="url(#callBarGrad)" />
                                <rect x="445" y="91" width="150" height="14" rx="2" fill="url(#putBarGrad)" />
                                <text x="760" y="102" fill="#34d399" fontSize="9" fontWeight="600">48.2K</text>
                                <text x="440" y="102" textAnchor="end" fill="#fb7185" fontSize="9" fontWeight="600">52.1K</text>

                                <text x="595" y="130" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700" fontFamily="monospace">$195</text>
                                <rect x="610" y="121" width="100" height="14" rx="2" fill="url(#callBarGrad)" />
                                <rect x="495" y="121" width="100" height="14" rx="2" fill="url(#putBarGrad)" />

                                <line x1="430" y1="148" x2="770" y2="148" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                                <rect x="565" y="141" width="60" height="14" rx="7" fill="#0f172a" stroke="#38bdf8" strokeWidth="0.8" />
                                <text x="595" y="151" textAnchor="middle" fill="#38bdf8" fontSize="8" fontWeight="800">$189.50</text>

                                <text x="595" y="175" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700" fontFamily="monospace">$185</text>
                                <rect x="610" y="166" width="70" height="14" rx="2" fill="url(#callBarGrad)" />
                                <rect x="435" y="166" width="160" height="14" rx="2" fill="url(#putBarGrad)" />

                                <text x="595" y="205" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700" fontFamily="monospace">$180</text>
                                <rect x="610" y="196" width="50" height="14" rx="2" fill="url(#callBarGrad)" />
                                <rect x="465" y="196" width="130" height="14" rx="2" fill="url(#putBarGrad)" />

                                {/* OI explanation box */}
                                <rect x="425" y="230" width="340" height="95" rx="8" fill="rgba(168,85,247,0.08)" stroke="rgba(168,85,247,0.15)" strokeWidth="0.5" />
                                <text x="445" y="250" fill="#c4b5fd" fontSize="10" fontWeight="700">🏗️ {t('volumeOi.oiBoxTitle')}</text>
                                <text x="445" y="268" fill="#94a3b8" fontSize="9">{t('volumeOi.oiBoxLine1')}</text>
                                <text x="445" y="283" fill="#94a3b8" fontSize="9">{t('volumeOi.oiBoxLine2')}</text>
                                <text x="445" y="298" fill="#94a3b8" fontSize="9">{t('volumeOi.oiBoxLine3')}</text>
                                <text x="445" y="313" fill="#a78bfa" fontSize="9" fontWeight="600">{t('volumeOi.oiBoxUse')}</text>
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Volume & OI Detail Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Volume Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <InfographicBg type="bars" />
                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-indigo-500/30 shadow-lg shadow-indigo-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[140px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <BarChart3 size={12} className="text-indigo-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">VOLUME</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-lg font-black text-indigo-400">0-7 DTE</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">{t('volumeOi.volumeMockHint')}</div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('volumeOi.volumeTitle')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-xs font-bold text-indigo-300">{t('volumeOi.volumeBadge')}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('volumeOi.volumeDesc', richTags)}
                            </p>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    <span className="text-slate-300">{t('volumeOi.volumeBullet1')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                                    <span className="text-slate-300">{t('volumeOi.volumeBullet2')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                                    <span className="text-slate-300">{t('volumeOi.volumeBullet3')}</span>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 flex items-start gap-2">
                                <Lightbulb size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                <span className="text-[13px] text-amber-200/90 leading-relaxed">{t('volumeOi.volumeTip')}</span>
                            </div>

                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('volumeOi.volumeGuideTitle')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('volumeOi.volumeGuide1')}</p>
                                    <p>• {t('volumeOi.volumeGuide2')}</p>
                                    <p>• {t('volumeOi.volumeGuide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* OI Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <InfographicBg type="grid" />
                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-purple-500/30 shadow-lg shadow-purple-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[140px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Layers size={12} className="text-purple-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">OI</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-lg font-black text-purple-400">0-35 DTE</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">{t('volumeOi.oiMockHint')}</div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('volumeOi.oiTitle')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-xs font-bold text-purple-300">{t('volumeOi.oiBadge')}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('volumeOi.oiDesc', richTags)}
                            </p>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    <span className="text-slate-300">{t('volumeOi.oiBullet1')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                                    <span className="text-slate-300">{t('volumeOi.oiBullet2')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                    <span className="text-slate-300">{t('volumeOi.oiBullet3')}</span>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 flex items-start gap-2">
                                <Lightbulb size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                <span className="text-[13px] text-amber-200/90 leading-relaxed">{t('volumeOi.oiTip')}</span>
                            </div>

                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('volumeOi.oiGuideTitle')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('volumeOi.oiGuide1')}</p>
                                    <p>• {t('volumeOi.oiGuide2')}</p>
                                    <p>• {t('volumeOi.oiGuide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Auto-Switch Explanation */}
                <div className="p-4 rounded-xl bg-cyan-900/15 border border-cyan-500/20 flex items-start gap-3">
                    <Radar size={18} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1.5">
                        <h4 className="text-[14px] font-bold text-cyan-300">{t('volumeOi.autoSwitchTitle')}</h4>
                        <p className="text-[14px] text-slate-300 leading-relaxed">{t.rich('volumeOi.autoSwitchDesc', richTags)}</p>
                    </div>
                </div>
            </section>

            {/* ═══ Sidebar Metrics ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('sidebarTitle')}</h3>
                        <p className="text-[12px] text-purple-400 font-medium uppercase tracking-wider">{t('sidebarSubtitle')}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30">
                        <span className="text-[12px] font-bold text-purple-300">Premium</span>
                    </div>
                </div>
                <p className="text-base text-slate-300 leading-relaxed">{t.rich('sidebarDesc', richTags)}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* IMPLIED MOVE */}
                    <IndicatorCard
                        icon={Activity} iconColor="text-purple-400" gradientFrom="from-purple-500/[0.06]"
                        badgeColor="border-purple-500/30" badgeBg="bg-purple-500/20 text-purple-300"
                        mockupLabel="IMPLIED MOVE" mockupValue="±6.3%" mockupValueColor="text-purple-400" mockupSub="$11.95" mockupSubColor="text-purple-300"
                        titleKey="impliedMove.title" badgeKey="impliedMove.badge" descKey="impliedMove.desc"
                        bullets={[
                            { color: 'bg-rose-500', textKey: 'impliedMove.high' },
                            { color: 'bg-amber-500', textKey: 'impliedMove.moderate' },
                            { color: 'bg-emerald-500', textKey: 'impliedMove.low' },
                        ]}
                        tipKey="impliedMove.tip"
                        tradingGuideKey="impliedMove.tradingGuide" guide1Key="impliedMove.guide1" guide2Key="impliedMove.guide2" guide3Key="impliedMove.guide3"
                        infoBg={<InfographicBg type="pulse" />}
                    />
                    {/* PUT FLOOR / CALL WALL */}
                    <IndicatorCard
                        icon={Shield} iconColor="text-sky-400" gradientFrom="from-sky-500/[0.06]"
                        badgeColor="border-sky-500/30" badgeBg="bg-sky-500/20 text-sky-300"
                        mockupLabel="FLOOR/WALL" mockupValue="$175/$200" mockupValueColor="text-white" mockupSub="" mockupSubColor=""
                        subMetrics={[{ label: 'PUT', value: '7.8%↑', color: 'text-emerald-400' }, { label: 'CALL', value: '5.4%↑', color: 'text-cyan-400' }]}
                        titleKey="floorWall.title" badgeKey="floorWall.badge" descKey="floorWall.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'floorWall.floor' },
                            { color: 'bg-rose-500', textKey: 'floorWall.wall' },
                            { color: 'bg-amber-500', textKey: 'floorWall.breakout' },
                        ]}
                        tipKey="floorWall.tip"
                        tradingGuideKey="floorWall.tradingGuide" guide1Key="floorWall.guide1" guide2Key="floorWall.guide2" guide3Key="floorWall.guide3"
                        infoBg={<InfographicBg type="crosshair" />}
                    />
                    {/* SMART MONEY */}
                    <IndicatorCard
                        icon={Banknote} iconColor="text-emerald-400" gradientFrom="from-emerald-500/[0.06]"
                        badgeColor="border-emerald-500/30" badgeBg="bg-emerald-500/20 text-emerald-300"
                        mockupLabel="SMART MONEY" mockupValue="72" mockupValueColor="text-amber-400" mockupSub={t('smartMoney.mockSub')} mockupSubColor="text-amber-300"
                        titleKey="smartMoney.title" badgeKey="smartMoney.badge" descKey="smartMoney.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'smartMoney.active' },
                            { color: 'bg-amber-500', textKey: 'smartMoney.moderate' },
                            { color: 'bg-rose-500', textKey: 'smartMoney.weak' },
                        ]}
                        tipKey="smartMoney.tip"
                        tradingGuideKey="smartMoney.tradingGuide" guide1Key="smartMoney.guide1" guide2Key="smartMoney.guide2" guide3Key="smartMoney.guide3"
                        infoBg={<InfographicBg type="dots" />}
                    />
                    {/* MAX PAIN */}
                    <IndicatorCard
                        icon={Target} iconColor="text-amber-400" gradientFrom="from-amber-500/[0.06]"
                        badgeColor="border-amber-500/30" badgeBg="bg-amber-500/20 text-amber-300"
                        mockupLabel="MAX PAIN" mockupValue="$185" mockupValueColor="text-amber-400" mockupSub="+2.5%" mockupSubColor="text-emerald-400"
                        titleKey="maxPain.title" badgeKey="maxPain.badge" descKey="maxPain.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'maxPain.below' },
                            { color: 'bg-amber-500', textKey: 'maxPain.near' },
                            { color: 'bg-rose-500', textKey: 'maxPain.above' },
                        ]}
                        tipKey="maxPain.tip"
                        tradingGuideKey="maxPain.tradingGuide" guide1Key="maxPain.guide1" guide2Key="maxPain.guide2" guide3Key="maxPain.guide3"
                        infoBg={<InfographicBg type="grid" />}
                    />
                    {/* IV SKEW */}
                    <IndicatorCard
                        icon={Signal} iconColor="text-sky-400" gradientFrom="from-sky-500/[0.06]"
                        badgeColor="border-sky-500/30" badgeBg="bg-sky-500/20 text-sky-300"
                        mockupLabel="IV SKEW" mockupValue="+4.5%" mockupValueColor="text-amber-400" mockupSub={t('ivSkew.mockSub')} mockupSubColor="text-amber-300"
                        subMetrics={[{ label: 'Put IV', value: '63%', color: 'text-rose-400' }, { label: 'Call IV', value: '58%', color: 'text-emerald-400' }]}
                        titleKey="ivSkew.title" badgeKey="ivSkew.badge" descKey="ivSkew.desc"
                        bullets={[
                            { color: 'bg-rose-500', textKey: 'ivSkew.fear' },
                            { color: 'bg-amber-500', textKey: 'ivSkew.caution' },
                            { color: 'bg-emerald-500', textKey: 'ivSkew.greed' },
                        ]}
                        tipKey="ivSkew.tip"
                        tradingGuideKey="ivSkew.tradingGuide" guide1Key="ivSkew.guide1" guide2Key="ivSkew.guide2" guide3Key="ivSkew.guide3"
                        infoBg={<InfographicBg type="wave" />}
                    />
                    {/* DEX */}
                    <IndicatorCard
                        icon={Cpu} iconColor="text-indigo-400" gradientFrom="from-indigo-500/[0.06]"
                        badgeColor="border-indigo-500/30" badgeBg="bg-indigo-500/20 text-indigo-300"
                        mockupLabel="DEX" mockupValue="+9.0M" mockupValueColor="text-rose-400" mockupSub={t('dex.mockSub')} mockupSubColor="text-rose-300"
                        subMetrics={[{ label: 'CallΔ', value: '13.3M', color: 'text-emerald-400' }, { label: 'PutΔ', value: '-4.2M', color: 'text-rose-400' }]}
                        titleKey="dex.title" badgeKey="dex.badge" descKey="dex.desc"
                        bullets={[
                            { color: 'bg-rose-500', textKey: 'dex.resistance' },
                            { color: 'bg-emerald-500', textKey: 'dex.support' },
                            { color: 'bg-slate-500', textKey: 'dex.neutral' },
                        ]}
                        tipKey="dex.tip"
                        tradingGuideKey="dex.tradingGuide" guide1Key="dex.guide1" guide2Key="dex.guide2" guide3Key="dex.guide3"
                        infoBg={<InfographicBg type="flow" />}
                    />
                    {/* UOA */}
                    <IndicatorCard
                        icon={AlertTriangle} iconColor="text-amber-400" gradientFrom="from-amber-500/[0.06]"
                        badgeColor="border-amber-500/30" badgeBg="bg-amber-500/20 text-amber-300"
                        mockupLabel="UOA" mockupValue="8x" mockupValueColor="text-rose-400" mockupSub={t('uoa.mockSub')} mockupSubColor="text-rose-300"
                        subMetrics={[{ label: 'Vol', value: '553K', color: 'text-white' }, { label: 'OI', value: '692K', color: 'text-white' }]}
                        titleKey="uoa.title" badgeKey="uoa.badge" descKey="uoa.desc"
                        bullets={[
                            { color: 'bg-rose-500', textKey: 'uoa.extreme' },
                            { color: 'bg-amber-500', textKey: 'uoa.abnormal' },
                            { color: 'bg-emerald-500', textKey: 'uoa.normal' },
                        ]}
                        tipKey="uoa.tip"
                        tradingGuideKey="uoa.tradingGuide" guide1Key="uoa.guide1" guide2Key="uoa.guide2" guide3Key="uoa.guide3"
                        infoBg={<InfographicBg type="scanline" />}
                    />
                </div>
            </section>

            {/* ═══ Trading Strategy Guide ═══ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('strategy.title')}</h3>
                    <p className="text-[12px] text-emerald-400 font-medium uppercase tracking-wider">4-Step Process</p>
                </div>
                <p className="text-base text-slate-300 leading-relaxed">{t.rich('strategy.desc', richTags)}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(['step1', 'step2', 'step3', 'step4'] as const).map((step, i) => (
                        <div key={step} className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-transparent pointer-events-none" />
                            <div className="relative space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                                        <span className="text-[14px] font-black text-indigo-300">{i + 1}</span>
                                    </div>
                                    <h4 className="text-[15px] font-bold text-white">{t(`strategy.${step}.title`)}</h4>
                                </div>
                                <p className="text-[14px] text-slate-300 leading-relaxed">{t(`strategy.${step}.desc`)}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-500/25 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <h4 className="text-[14px] font-bold text-amber-300 mb-1">{t('strategy.warningTitle')}</h4>
                        <p className="text-[14px] text-amber-200/80 leading-relaxed">{t('strategy.warningDesc')}</p>
                    </div>
                </div>
            </section>
        </HowItWorksLayout>
    );
}
