import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import Image from 'next/image';
import { getTranslations, getLocale } from 'next-intl/server';
import {
    Zap, Target, Activity, ShieldAlert, Crosshair, Radar, TrendingUp,
    BarChart3, Calendar, GitBranch, Lightbulb, LineChart, Signal,
    ArrowUpDown, Cpu, Newspaper, AlertTriangle, Layers, Brain, Briefcase, FileText, Building2, Scale, Clock, Lock
} from 'lucide-react';

export default async function CommandGuidePage() {
    const t = await getTranslations('commandGuide');
    const locale = await getLocale();

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
        emerald: (chunks: React.ReactNode) => <span className="text-emerald-400 font-semibold">{chunks}</span>,
        purple: (chunks: React.ReactNode) => <span className="text-purple-400 font-semibold">{chunks}</span>,
    };

    const screenshotSuffix = locale === 'ko' ? '' : `-${locale}`;

    /* ── Infographic SVG Backgrounds per card type ── */
    const InfographicBg = ({ type }: { type: 'radar' | 'grid' | 'pulse' | 'wave' | 'dots' | 'diagonal' | 'scanline' | 'crosshair' | 'bars' | 'circuit' }) => {
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
                    {[20, 40, 60, 80, 100, 120, 140, 160, 180].map((x, i) => `<rect x="${x}" y="${30 + (i % 3) * 15}" width="8" height="${40 - (i % 3) * 10}" rx="2" fill="currentColor" class="text-cyan-400" />`).join('')}
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
        icon: Icon, iconColor, gradientFrom, titleKey, descKey, infoBg
    }: {
        icon: any; iconColor: string; gradientFrom: string; titleKey: string; descKey: string; infoBg?: React.ReactNode;
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
            </div>
        </div>
    );

    return (
        <HowItWorksLayout
            title="COMMAND"
            subtitle={t('subtitle')}
        >
            {/* ═══ Overview Section ═══ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-[12px] text-cyan-400 font-medium uppercase tracking-wider">Ticker Analysis Center</p>
                </div>
                <p className="text-base text-slate-300 leading-relaxed">{t.rich('overviewDesc', richTags)}</p>
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-cyan-500/[0.03] pointer-events-none" />
                    <Image src={`/guide/command-full${screenshotSuffix}.png`} alt="Command Full View" width={1440} height={900} className="w-full h-auto relative object-cover object-top max-h-[950px]" />
                </div>
            </section>

            {/* ═══ Premium Indicator Cards ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('indicatorsTitle')}</h3>
                        <p className="text-[12px] text-amber-400 font-medium uppercase tracking-wider">{t('indicatorsSubtitle')}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                        <span className="text-[12px] font-bold text-amber-300">Premium</span>
                    </div>
                </div>
                <p className="text-base text-slate-300 leading-relaxed">{t('indicatorsDesc')}</p>

                {/* ── Row 1: Real-Time ── */}
                <div className="flex items-center gap-2 mt-4 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/30 to-transparent" />
                    <span className="text-[12px] font-bold text-cyan-400 uppercase tracking-widest whitespace-nowrap">{t('row1Title')}</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-cyan-500/30 to-transparent" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <IndicatorCard
                        icon={Zap} iconColor="text-amber-400" gradientFrom="from-amber-500/[0.06]"
                        badgeColor="border-amber-500/30" badgeBg="bg-amber-500/20 text-amber-300"
                        mockupLabel="VOL REGIME" mockupValue="72" mockupValueColor="text-amber-400" mockupSub="/100" mockupSubColor="text-white/60"
                        subMetrics={[{ label: 'GEX', value: 'SHORT', color: 'text-rose-400' }, { label: 'IV', value: '38%', color: 'text-white' }, { label: 'Flip', value: '+2.1%', color: 'text-white' }]}
                        titleKey="volRegime.title" badgeKey="volRegime.badge" descKey="volRegime.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'volRegime.stable' },
                            { color: 'bg-cyan-500', textKey: 'volRegime.coiling' },
                            { color: 'bg-amber-500', textKey: 'volRegime.loaded' },
                            { color: 'bg-rose-500', textKey: 'volRegime.erupting' },
                        ]}
                        tipKey="volRegime.tip"
                        tradingGuideKey="volRegime.tradingGuide" guide1Key="volRegime.guide1" guide2Key="volRegime.guide2" guide3Key="volRegime.guide3"
                        infoBg={<InfographicBg type="pulse" />}
                    />
                    <IndicatorCard
                        icon={Target} iconColor="text-amber-400" gradientFrom="from-emerald-500/[0.06]"
                        badgeColor="border-emerald-500/30" badgeBg="bg-emerald-500/20 text-emerald-300"
                        mockupLabel="CONVICTION" mockupValue="A" mockupValueColor="text-emerald-400" mockupSub="78/100" mockupSubColor="text-white/60"
                        titleKey="conviction.title" badgeKey="conviction.badge" descKey="conviction.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'conviction.bull' },
                            { color: 'bg-slate-400', textKey: 'conviction.neutral' },
                            { color: 'bg-rose-500', textKey: 'conviction.bear' },
                        ]}
                        tipKey="conviction.tip"
                        tradingGuideKey="conviction.tradingGuide" guide1Key="conviction.guide1" guide2Key="conviction.guide2" guide3Key="conviction.guide3"
                        infoBg={<InfographicBg type="crosshair" />}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <IndicatorCard
                        icon={Activity} iconColor="text-indigo-400" gradientFrom="from-indigo-500/[0.06]"
                        badgeColor="border-indigo-500/30" badgeBg="bg-indigo-500/20 text-indigo-300"
                        mockupLabel="VWAP" mockupValue="$138.52" mockupValueColor="text-emerald-400" mockupSub="+1.2%" mockupSubColor="text-emerald-400"
                        titleKey="vwapCard.title" badgeKey="vwapCard.badge" descKey="vwapCard.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'vwapCard.above' },
                            { color: 'bg-rose-500', textKey: 'vwapCard.below' },
                        ]}
                        tipKey="vwapCard.tip"
                        tradingGuideKey="vwapCard.tradingGuide" guide1Key="vwapCard.guide1" guide2Key="vwapCard.guide2" guide3Key="vwapCard.guide3"
                        infoBg={<InfographicBg type="wave" />}
                    />
                    <IndicatorCard
                        icon={ShieldAlert} iconColor="text-rose-400" gradientFrom="from-rose-500/[0.06]"
                        badgeColor="border-rose-500/30" badgeBg="bg-rose-500/20 text-rose-300"
                        mockupLabel="SHORT SQUEEZE" mockupValue="3.2%" mockupValueColor="text-emerald-400" mockupSub="LOW" mockupSubColor="text-emerald-400"
                        subMetrics={[{ label: 'DTC', value: '1.8d', color: 'text-white' }, { label: 'ShortVol', value: '24%', color: 'text-white' }]}
                        titleKey="shortSqueeze.title" badgeKey="shortSqueeze.badge" descKey="shortSqueeze.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'shortSqueeze.low' },
                            { color: 'bg-cyan-500', textKey: 'shortSqueeze.medium' },
                            { color: 'bg-amber-500', textKey: 'shortSqueeze.high' },
                            { color: 'bg-rose-500', textKey: 'shortSqueeze.critical' },
                        ]}
                        tipKey="shortSqueeze.tip"
                        tradingGuideKey="shortSqueeze.tradingGuide" guide1Key="shortSqueeze.guide1" guide2Key="shortSqueeze.guide2" guide3Key="shortSqueeze.guide3"
                        infoBg={<InfographicBg type="diagonal" />}
                    />
                </div>

                {/* ANALYST TARGET + RELATED (Row 1 pair) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <IndicatorCard
                        icon={Crosshair} iconColor="text-emerald-400" gradientFrom="from-emerald-500/[0.06]"
                        badgeColor="border-cyan-500/30" badgeBg="bg-cyan-500/20 text-cyan-300"
                        mockupLabel="ANALYST TARGET" mockupValue="88%" mockupValueColor="text-emerald-400" mockupSub="BULLISH" mockupSubColor="text-emerald-400"
                        subMetrics={[{ label: locale === 'ko' ? '12M 목표가' : locale === 'ja' ? '12M 目標株価' : '12M Target', value: '$218.50', color: 'text-amber-400' }, { label: locale === 'ko' ? '최고' : locale === 'ja' ? '最高' : 'High', value: '$255.00', color: 'text-white' }]}
                        titleKey="analystTarget.title" badgeKey="analystTarget.badge" descKey="analystTarget.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'analystTarget.strongBuy' },
                            { color: 'bg-emerald-400', textKey: 'analystTarget.buy' },
                            { color: 'bg-slate-400', textKey: 'analystTarget.hold' },
                            { color: 'bg-rose-400', textKey: 'analystTarget.sell' },
                        ]}
                        tipKey="analystTarget.tip"
                        tradingGuideKey="analystTarget.tradingGuide" guide1Key="analystTarget.guide1" guide2Key="analystTarget.guide2" guide3Key="analystTarget.guide3"
                        infoBg={<InfographicBg type="radar" />}
                    />
                    <IndicatorCard
                        icon={Layers} iconColor="text-violet-400" gradientFrom="from-violet-500/[0.06]"
                        badgeColor="border-violet-500/30" badgeBg="bg-violet-500/20 text-violet-300"
                        mockupLabel="RELATED" mockupValue="8" mockupValueColor="text-white" mockupSub="peers" mockupSubColor="text-slate-400"
                        titleKey="related.title" badgeKey="related.badge" descKey="related.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'related.positive' },
                            { color: 'bg-amber-500', textKey: 'related.divergent' },
                        ]}
                        tipKey="related.tip"
                        tradingGuideKey="related.tradingGuide" guide1Key="related.guide1" guide2Key="related.guide2" guide3Key="related.guide3"
                        infoBg={<InfographicBg type="dots" />}
                    />
                </div>

                {/* ── Row 2: Swing & Long-Term ── */}
                <div className="flex items-center gap-2 mt-6 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-purple-500/30 to-transparent" />
                    <span className="text-[12px] font-bold text-purple-400 uppercase tracking-widest whitespace-nowrap">{t('row2Title')}</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-purple-500/30 to-transparent" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <IndicatorCard
                        icon={Radar} iconColor="text-indigo-400" gradientFrom="from-indigo-500/[0.06]"
                        badgeColor="border-indigo-500/30" badgeBg="bg-indigo-500/20 text-indigo-300"
                        mockupLabel="INST RADAR" mockupValue="42%" mockupValueColor="text-emerald-400" mockupSub="ACCUM" mockupSubColor="text-emerald-400"
                        subMetrics={[{ label: 'Block', value: '5trades', color: 'text-white' }, { label: 'ShortVol', value: '24%', color: 'text-white' }]}
                        titleKey="instRadar.title" badgeKey="instRadar.badge" descKey="instRadar.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'instRadar.accum' },
                            { color: 'bg-slate-400', textKey: 'instRadar.neutral' },
                            { color: 'bg-rose-500', textKey: 'instRadar.dist' },
                        ]}
                        tipKey="instRadar.tip"
                        tradingGuideKey="instRadar.tradingGuide" guide1Key="instRadar.guide1" guide2Key="instRadar.guide2" guide3Key="instRadar.guide3"
                        infoBg={<InfographicBg type="dots" />}
                    />
                    <IndicatorCard
                        icon={GitBranch} iconColor="text-emerald-400" gradientFrom="from-emerald-500/[0.06]"
                        badgeColor="border-emerald-500/30" badgeBg="bg-emerald-500/20 text-emerald-300"
                        mockupLabel="TREND PHASE" mockupValue="GOLDEN" mockupValueColor="text-emerald-400" mockupSub="↑ 5.2%" mockupSubColor="text-emerald-400"
                        titleKey="trendPhase.title" badgeKey="trendPhase.badge" descKey="trendPhase.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'trendPhase.golden' },
                            { color: 'bg-rose-500', textKey: 'trendPhase.dead' },
                            { color: 'bg-slate-400', textKey: 'trendPhase.neutral' },
                        ]}
                        tipKey="trendPhase.tip"
                        tradingGuideKey="trendPhase.tradingGuide" guide1Key="trendPhase.guide1" guide2Key="trendPhase.guide2" guide3Key="trendPhase.guide3"
                        infoBg={<InfographicBg type="wave" />}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <IndicatorCard
                        icon={BarChart3} iconColor="text-cyan-400" gradientFrom="from-cyan-500/[0.06]"
                        badgeColor="border-cyan-500/30" badgeBg="bg-cyan-500/20 text-cyan-300"
                        mockupLabel="FUNDAMENTAL" mockupValue="B+" mockupValueColor="text-cyan-400" mockupSub="68/100" mockupSubColor="text-white/60"
                        subMetrics={[{ label: 'PE', value: '32', color: 'text-white' }, { label: 'ROE', value: '28%', color: 'text-white' }, { label: 'Rev', value: '+12%', color: 'text-emerald-400' }]}
                        titleKey="fundamental.title" badgeKey="fundamental.badge" descKey="fundamental.desc"
                        bullets={[
                            { color: 'bg-emerald-500', textKey: 'fundamental.aGrade' },
                            { color: 'bg-cyan-400', textKey: 'fundamental.bGrade' },
                            { color: 'bg-amber-400', textKey: 'fundamental.cGrade' },
                        ]}
                        tipKey="fundamental.tip"
                        tradingGuideKey="fundamental.tradingGuide" guide1Key="fundamental.guide1" guide2Key="fundamental.guide2" guide3Key="fundamental.guide3"
                        infoBg={<InfographicBg type="grid" />}
                    />
                    <IndicatorCard
                        icon={Calendar} iconColor="text-amber-400" gradientFrom="from-amber-500/[0.06]"
                        badgeColor="border-amber-500/30" badgeBg="bg-amber-500/20 text-amber-300"
                        mockupLabel="EARNINGS" mockupValue="D+0" mockupValueColor="text-emerald-400" mockupSub="Q1 Beat +5.2%" mockupSubColor="text-emerald-400"
                        subMetrics={[{ label: 'Actual EPS', value: '$1.62', color: 'text-white' }, { label: 'Time', value: locale === 'ko' ? 'AMC (장 마감 후)' : locale === 'ja' ? 'AMC (引け後)' : 'AMC (After Close)', color: 'text-amber-400' }]}
                        titleKey="earnings.title" badgeKey="earnings.badge" descKey="earnings.desc"
                        bullets={[
                            { color: 'bg-amber-500', textKey: 'earnings.upcoming' },
                            { color: 'bg-cyan-500', textKey: 'earnings.surprise' },
                        ]}
                        tipKey="earnings.tip"
                        tradingGuideKey="earnings.tradingGuide" guide1Key="earnings.guide1" guide2Key="earnings.guide2" guide3Key="earnings.guide3"
                        infoBg={<InfographicBg type="grid" />}
                    />
                    <IndicatorCard
                        icon={TrendingUp} iconColor="text-violet-400" gradientFrom="from-violet-500/[0.06]"
                        badgeColor="border-violet-500/30" badgeBg="bg-violet-500/20 text-violet-300"
                        mockupLabel="IV SKEW" mockupValue="PUT RICH" mockupValueColor="text-rose-400" mockupSub="+3.2%" mockupSubColor="text-rose-400"
                        titleKey="ivSkew.title" badgeKey="ivSkew.badge" descKey="ivSkew.desc"
                        bullets={[
                            { color: 'bg-rose-500', textKey: 'ivSkew.putRich' },
                            { color: 'bg-emerald-500', textKey: 'ivSkew.callRich' },
                            { color: 'bg-slate-400', textKey: 'ivSkew.neutral' },
                        ]}
                        tipKey="ivSkew.tip"
                        tradingGuideKey="ivSkew.tradingGuide" guide1Key="ivSkew.guide1" guide2Key="ivSkew.guide2" guide3Key="ivSkew.guide3"
                        infoBg={<InfographicBg type="wave" />}
                    />
                </div>
            </section>

            {/* ═══ GAMMA FLIP Deep Dive ═══ */}
            <section className="space-y-5">
                <div className="flex items-center gap-2 mt-2 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-purple-500/40 to-transparent" />
                    <span className="text-[12px] font-bold text-purple-400 uppercase tracking-widest whitespace-nowrap">⚡ GAMMA FLIP — Deep Dive</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-purple-500/40 to-transparent" />
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-purple-500/20 p-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.08] via-transparent to-indigo-500/[0.04] pointer-events-none" />
                    <InfographicBg type="scanline" />

                    {/* Corner Frames */}
                    <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-purple-500/30 pointer-events-none z-0" />
                    <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-purple-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-purple-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-purple-500/30 pointer-events-none z-0" />

                    <div className="relative z-10 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                                <Zap size={24} className="text-purple-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">GAMMA FLIP LEVEL</h3>
                                <p className="text-[13px] text-purple-300 font-medium">The Most Critical Options-Derived Price Level</p>
                            </div>
                        </div>

                        <p className="text-[15px] text-slate-300 leading-relaxed">
                            {t.rich('gammaFlipDesc', richTags)}
                        </p>

                        {/* SVG Infographic: Gamma Flip Visualization */}
                        <div className="relative rounded-xl overflow-hidden bg-slate-900/60 border border-white/10 p-4">
                            <svg viewBox="0 0 600 280" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                                {/* Grid */}
                                <defs>
                                    <linearGradient id="gfLong" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.3" /><stop offset="100%" stopColor="#10b981" stopOpacity="0" /></linearGradient>
                                    <linearGradient id="gfShort" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity="0.3" /><stop offset="100%" stopColor="#f43f5e" stopOpacity="0" /></linearGradient>
                                </defs>
                                {/* Background grid */}
                                <line x1="60" y1="40" x2="60" y2="240" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                                <line x1="180" y1="40" x2="180" y2="240" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                                <line x1="300" y1="40" x2="300" y2="240" stroke="rgba(168,85,247,0.3)" strokeWidth="1" strokeDasharray="4 3" />
                                <line x1="420" y1="40" x2="420" y2="240" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                                <line x1="540" y1="40" x2="540" y2="240" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                                {/* Zero line */}
                                <line x1="30" y1="140" x2="580" y2="140" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                                {/* GEX Bars - Left side (Positive/LONG γ) */}
                                <rect x="80" y="80" width="40" height="60" rx="4" fill="url(#gfLong)" stroke="#10b981" strokeWidth="1" />
                                <rect x="140" y="60" width="40" height="80" rx="4" fill="url(#gfLong)" stroke="#10b981" strokeWidth="1" />
                                <rect x="200" y="50" width="40" height="90" rx="4" fill="url(#gfLong)" stroke="#10b981" strokeWidth="1" />
                                <rect x="260" y="70" width="40" height="70" rx="4" fill="url(#gfLong)" stroke="#10b981" strokeWidth="1" />
                                {/* GEX Bars - Right side (Negative/SHORT γ) */}
                                <rect x="320" y="140" width="40" height="50" rx="4" fill="url(#gfShort)" stroke="#f43f5e" strokeWidth="1" />
                                <rect x="380" y="140" width="40" height="70" rx="4" fill="url(#gfShort)" stroke="#f43f5e" strokeWidth="1" />
                                <rect x="440" y="140" width="40" height="90" rx="4" fill="url(#gfShort)" stroke="#f43f5e" strokeWidth="1" />
                                <rect x="500" y="140" width="40" height="60" rx="4" fill="url(#gfShort)" stroke="#f43f5e" strokeWidth="1" />
                                {/* Flip Level Marker */}
                                <line x1="300" y1="30" x2="300" y2="250" stroke="#a855f7" strokeWidth="2" />
                                <rect x="270" y="10" width="60" height="22" rx="6" fill="#7c3aed" />
                                <text x="300" y="25" textAnchor="middle" fill="white" fontSize="11" fontWeight="900" fontFamily="monospace">FLIP</text>
                                {/* Labels */}
                                <text x="180" y="265" textAnchor="middle" fill="#10b981" fontSize="13" fontWeight="800">LONG γ</text>
                                <text x="180" y="278" textAnchor="middle" fill="#94a3b8" fontSize="10">Dealer Hedging = Stability</text>
                                <text x="420" y="265" textAnchor="middle" fill="#f43f5e" fontSize="13" fontWeight="800">SHORT γ</text>
                                <text x="420" y="278" textAnchor="middle" fill="#94a3b8" fontSize="10">Dealer Amplifying = Volatility</text>
                                {/* Price arrow */}
                                <text x="300" y="260" textAnchor="middle" fill="#a855f7" fontSize="11" fontWeight="700">← $138.50 →</text>
                                {/* GEX axis label */}
                                <text x="15" y="85" fill="#94a3b8" fontSize="9" fontWeight="600" transform="rotate(-90, 15, 140)">GEX Exposure</text>
                            </svg>
                        </div>

                        {/* Explanation Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                    <span className="text-[14px] font-black text-emerald-400">{t('gammaFlip.longTitle')}</span>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">
                                    {t.rich('gammaFlip.longDesc', richTags)}
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-rose-900/20 border border-rose-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-rose-500" />
                                    <span className="text-[14px] font-black text-rose-400">{t('gammaFlip.shortTitle')}</span>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">
                                    {t.rich('gammaFlip.shortDesc', richTags)}
                                </p>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-purple-900/20 border border-purple-500/20 flex items-start gap-2">
                            <Lightbulb size={14} className="text-purple-400 mt-0.5 flex-shrink-0" />
                            <span className="text-[13px] text-purple-200/90 leading-relaxed">
                                {t.rich('gammaFlip.tip', richTags)}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ Chart & Analysis Sections ═══ */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 mt-2 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/30 to-transparent" />
                    <span className="text-[12px] font-bold text-indigo-400 uppercase tracking-widest whitespace-nowrap">Analysis Sections</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-indigo-500/30 to-transparent" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SectionCard icon={LineChart} iconColor="text-indigo-400" gradientFrom="from-indigo-500/[0.06]" titleKey="chartTitle" descKey="chartDesc" infoBg={<InfographicBg type="wave" />} />
                    <SectionCard icon={Signal} iconColor="text-amber-400" gradientFrom="from-amber-500/[0.06]" titleKey="signalTitle" descKey="signalDesc" infoBg={<InfographicBg type="pulse" />} />
                    <SectionCard icon={ArrowUpDown} iconColor="text-emerald-400" gradientFrom="from-emerald-500/[0.06]" titleKey="flowTitle" descKey="flowDesc" infoBg={<InfographicBg type="crosshair" />} />
                    <SectionCard icon={Cpu} iconColor="text-rose-400" gradientFrom="from-rose-500/[0.06]" titleKey="gammaTitle" descKey="gammaDesc" infoBg={<InfographicBg type="circuit" />} />
                </div>
            </section>

            {/* ═══ GEX Timeline / Tech Levels / IV Skew Curve — 3-Tab Panel ═══ */}
            <section className="space-y-5">
                <div className="flex items-center gap-2 mt-2 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/40 to-transparent" />
                    <span className="text-[12px] font-bold text-cyan-400 uppercase tracking-widest whitespace-nowrap">4-Tab Intelligence Panel</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-cyan-500/40 to-transparent" />
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-cyan-500/20 p-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.08] via-transparent to-indigo-500/[0.04] pointer-events-none" />
                    <InfographicBg type="scanline" />

                    {/* Corner Frames */}
                    <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-cyan-500/30 pointer-events-none z-0" />
                    <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-cyan-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-cyan-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-cyan-500/30 pointer-events-none z-0" />

                    <div className="relative z-10 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                                <BarChart3 size={24} className="text-cyan-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">{t('gexTimelineSection.title')}</h3>
                                <p className="text-[13px] text-cyan-300 font-medium">{t('gexTimelineSection.subtitle')}</p>
                            </div>
                        </div>

                        <p className="text-[15px] text-slate-300 leading-relaxed">
                            {t.rich('gexTimelineSection.desc', richTags)}
                        </p>

                        {/* 4 Tab Cards — 2x2 Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    <span className="text-[13px] font-black text-emerald-400">{t('gexTimelineSection.gexTitle')}</span>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">
                                    {t.rich('gexTimelineSection.gexDesc', richTags)}
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-indigo-900/20 border border-indigo-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                                    <span className="text-[13px] font-black text-indigo-400">{t('gexTimelineSection.techTitle')}</span>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">
                                    {t.rich('gexTimelineSection.techDesc', richTags)}
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-violet-900/20 border border-violet-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                                    <span className="text-[13px] font-black text-violet-400">{t('gexTimelineSection.ivSkewTitle')}</span>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">
                                    {t.rich('gexTimelineSection.ivSkewDesc', richTags)}
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-cyan-900/20 border border-cyan-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                                    <span className="text-[13px] font-black text-cyan-400">{t('gexTimelineSection.inst13fTitle')}</span>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">
                                    {t.rich('gexTimelineSection.inst13fDesc', richTags)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ GEX TIMELINE 30D — Deep Dive ═══ */}
            <section className="space-y-5">
                <div className="flex items-center gap-2 mt-2 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-violet-500/40 to-transparent" />
                    <span className="text-[12px] font-bold text-violet-400 uppercase tracking-widest whitespace-nowrap">GEX Timeline Deep Dive</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-violet-500/40 to-transparent" />
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-violet-500/20 p-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.06] via-transparent to-cyan-500/[0.04] pointer-events-none" />
                    <InfographicBg type="wave" />

                    <div className="relative space-y-5">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-400 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                                    <Layers size={22} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">{t('gexTimelineSection.gexDeepDive.title')}</h3>
                                    <p className="text-[13px] text-violet-300 font-medium">{t('gexTimelineSection.gexDeepDive.subtitle')}</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/30 text-xs font-bold text-violet-300">V10.0</span>
                        </div>

                        <p className="text-[14px] text-slate-300 leading-relaxed">
                            {t.rich('gexTimelineSection.gexDeepDive.desc', richTags)}
                        </p>

                        {/* A. Percentile / Regime */}
                        <div className="rounded-xl border border-cyan-500/15 bg-cyan-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <BarChart3 size={16} className="text-cyan-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.gexDeepDive.percentileGauge.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.gexDeepDive.percentileGauge.desc', richTags)}</p>
                            
                            {/* Gradient gauge mockup */}
                            <div className="relative h-4 rounded-full bg-gradient-to-r from-rose-500/50 via-amber-500/40 via-50% to-emerald-500/50 overflow-hidden border border-white/10">
                                <div className="absolute top-0 left-[68%] w-1.5 h-full bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.7)]" />
                            </div>
                            <div className="flex justify-between px-1">
                                <span className="text-[12px] text-rose-400">Negative GEX</span>
                                <span className="text-[12px] text-white font-bold">68th Percentile</span>
                                <span className="text-[12px] text-emerald-400">Positive GEX</span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                                {[
                                    { label: '≤10th', text: t('gexTimelineSection.gexDeepDive.percentileGauge.extremeLow'), color: 'border-rose-500/20 text-rose-300' },
                                    { label: '≤25th', text: t('gexTimelineSection.gexDeepDive.percentileGauge.depressed'), color: 'border-amber-500/20 text-amber-300' },
                                    { label: '25-75th', text: t('gexTimelineSection.gexDeepDive.percentileGauge.normal'), color: 'border-slate-500/20 text-slate-300' },
                                    { label: '≥75th', text: t('gexTimelineSection.gexDeepDive.percentileGauge.elevated'), color: 'border-emerald-500/20 text-emerald-300' },
                                    { label: '≥90th', text: t('gexTimelineSection.gexDeepDive.percentileGauge.extremeHigh'), color: 'border-cyan-500/20 text-cyan-300' },
                                ].map((item) => (
                                    <div key={item.label} className={`px-2 py-1.5 rounded-lg border ${item.color} bg-slate-900/40`}>
                                        <div className="text-[12px] font-bold">{item.label}</div>
                                        <div className="text-[12px] text-slate-300 mt-0.5">{item.text}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* B. Regime Persistence */}
                        <div className="rounded-xl border border-emerald-500/15 bg-emerald-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Activity size={16} className="text-emerald-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.gexDeepDive.regimePersistence.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.gexDeepDive.regimePersistence.desc', richTags)}</p>
                            
                            {/* Persistence bars mockup */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-[12px] text-emerald-400 font-bold w-16">Current</span>
                                    <div className="flex-1 h-5 rounded bg-slate-800/60 relative overflow-hidden">
                                        <div className="absolute inset-y-0 left-0 w-[75%] bg-gradient-to-r from-emerald-500/50 to-emerald-400/20 rounded" />
                                        <span className="absolute right-2 top-0.5 text-[12px] text-white font-bold">15 sessions</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[12px] text-slate-300 font-bold w-16">Average</span>
                                    <div className="flex-1 h-5 rounded bg-slate-800/60 relative overflow-hidden">
                                        <div className="absolute inset-y-0 left-0 w-[50%] bg-gradient-to-r from-slate-500/40 to-slate-400/15 rounded" />
                                        <span className="absolute right-2 top-0.5 text-[12px] text-slate-300 font-bold">10 sessions</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-[12px] text-slate-300 space-y-0.5">
                                <p>• {t('gexTimelineSection.gexDeepDive.regimePersistence.aboveAvg')}</p>
                                <p>• {t('gexTimelineSection.gexDeepDive.regimePersistence.belowAvg')}</p>
                            </div>
                        </div>

                        {/* Key Levels */}
                        <div className="rounded-xl border border-rose-500/15 bg-rose-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Target size={16} className="text-rose-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.gexDeepDive.keyLevels.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.gexDeepDive.keyLevels.desc', richTags)}</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg border border-rose-500/20 bg-rose-900/15 p-3">
                                    <div className="text-[12px] font-bold text-rose-400">CALL WALL</div>
                                    <div className="text-[18px] font-black text-white mt-1">$235.00</div>
                                    <div className="text-[12px] text-slate-300 mt-1">Hit Rate: 87%</div>
                                </div>
                                <div className="rounded-lg border border-cyan-500/20 bg-cyan-900/15 p-3">
                                    <div className="text-[12px] font-bold text-cyan-400">GAMMA FLIP</div>
                                    <div className="text-[18px] font-black text-white mt-1">$228.50</div>
                                    <div className="text-[12px] text-slate-300 mt-1">+2.8% from current</div>
                                </div>
                            </div>
                            <div className="text-[12px] text-slate-300 space-y-0.5">
                                <p>• {t('gexTimelineSection.gexDeepDive.keyLevels.callWall')}</p>
                                <p>• {t('gexTimelineSection.gexDeepDive.keyLevels.gammaFlip')}</p>
                            </div>
                        </div>

                        {/* Flip Events */}
                        <div className="rounded-xl border border-amber-500/15 bg-amber-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <ArrowUpDown size={16} className="text-amber-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.gexDeepDive.flipEvents.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.gexDeepDive.flipEvents.desc', richTags)}</p>
                            {/* Event timeline mockup */}
                            <div className="space-y-1.5">
                                {[
                                    { date: 'Apr 28', dir: 'NEG→POS', price: '$222.10', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-900/20' },
                                    { date: 'Apr 15', dir: 'POS→NEG', price: '$218.50', color: 'text-rose-400 border-rose-500/30 bg-rose-900/20' },
                                ].map((ev) => (
                                    <div key={ev.date} className={`flex items-center justify-between px-3 py-1.5 rounded-lg border ${ev.color}`}>
                                        <span className="text-[12px] font-bold">{ev.date}</span>
                                        <span className="text-[12px] font-black">{ev.dir}</span>
                                        <span className="text-[12px] text-slate-300">{ev.price}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="text-[12px] text-slate-300 space-y-0.5">
                                <p>• {t('gexTimelineSection.gexDeepDive.flipEvents.toPositive')}</p>
                                <p>• {t('gexTimelineSection.gexDeepDive.flipEvents.toNegative')}</p>
                            </div>
                        </div>

                        {/* Dynamic Insight */}
                        <div className="rounded-xl border border-indigo-500/15 bg-indigo-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Lightbulb size={16} className="text-indigo-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.gexDeepDive.dynamicInsight.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.gexDeepDive.dynamicInsight.desc', richTags)}</p>
                            <div className="space-y-2 text-[12px] text-slate-300">
                                <p className="flex items-start gap-1.5"><BarChart3 size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.gexDeepDive.dynamicInsight.regimeLine')}</p>
                                <p className="flex items-start gap-1.5"><Target size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.gexDeepDive.dynamicInsight.wallLine')}</p>
                                <p className="flex items-start gap-1.5"><Zap size={14} className="text-violet-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.gexDeepDive.dynamicInsight.flipLine')}</p>
                            </div>
                        </div>

                        {/* Trading Guide */}
                        <div className="rounded-xl border border-violet-500/15 bg-violet-900/10 p-4 space-y-2">
                            <span className="text-[13px] font-bold text-violet-400 flex items-center gap-1.5"><Layers size={13} />{t('gexTimelineSection.gexDeepDive.tradingGuide')}</span>
                            <div className="text-[13px] text-slate-300 leading-relaxed space-y-0.5">
                                <p>• {t.rich('gexTimelineSection.gexDeepDive.guide1', richTags)}</p>
                                <p>• {t.rich('gexTimelineSection.gexDeepDive.guide2', richTags)}</p>
                                <p>• {t.rich('gexTimelineSection.gexDeepDive.guide3', richTags)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ 13-F INSTITUTIONAL HOLDINGS — Deep Dive ═══ */}
            <section className="space-y-5">
                <div className="flex items-center gap-2 mt-2 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/40 to-transparent" />
                    <span className="text-[12px] font-bold text-cyan-400 uppercase tracking-widest whitespace-nowrap">13-F Institutional Holdings Deep Dive</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-cyan-500/40 to-transparent" />
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-cyan-500/20 p-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-indigo-500/[0.04] pointer-events-none" />
                    <InfographicBg type="radar" />

                    {/* Corner Frames */}
                    <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-cyan-500/30 pointer-events-none z-0" />
                    <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-cyan-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-cyan-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-cyan-500/30 pointer-events-none z-0" />

                    <div className="relative z-10 space-y-5">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                                    <Building2 size={22} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">{t('gexTimelineSection.inst13fDeepDive.title')}</h3>
                                    <p className="text-[13px] text-cyan-300 font-medium">{t('gexTimelineSection.inst13fDeepDive.subtitle')}</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-xs font-bold text-cyan-300">SEC</span>
                        </div>

                        <p className="text-[14px] text-slate-300 leading-relaxed">
                            {t.rich('gexTimelineSection.inst13fDeepDive.desc', richTags)}
                        </p>

                        {/* A. What is 13-F */}
                        <div className="rounded-xl border border-cyan-500/15 bg-cyan-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-cyan-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.inst13fDeepDive.whatIs.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.inst13fDeepDive.whatIs.desc', richTags)}</p>
                            <div className="space-y-2 text-[12px] text-slate-300">
                                <p className="flex items-start gap-1.5"><FileText size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.whatIs.filing')}</p>
                                <p className="flex items-start gap-1.5"><Calendar size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.whatIs.deadline')}</p>
                                <p className="flex items-start gap-1.5"><BarChart3 size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.whatIs.content')}</p>
                            </div>
                        </div>

                        {/* B. Data Points */}
                        <div className="rounded-xl border border-indigo-500/15 bg-indigo-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <BarChart3 size={16} className="text-indigo-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.inst13fDeepDive.dataPoints.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.inst13fDeepDive.dataPoints.desc', richTags)}</p>

                            {/* Data point cards */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {[
                                    { key: 'holders', color: 'border-emerald-500/20 text-emerald-300' },
                                    { key: 'shares', color: 'border-cyan-500/20 text-cyan-300' },
                                    { key: 'value', color: 'border-amber-500/20 text-amber-300' },
                                    { key: 'weight', color: 'border-violet-500/20 text-violet-300' },
                                    { key: 'change', color: 'border-rose-500/20 text-rose-300' },
                                ].map((item) => (
                                    <div key={item.key} className={`px-2 py-1.5 rounded-lg border ${item.color} bg-slate-900/40`}>
                                        <div className="text-[12px] text-slate-300 mt-0.5">{t(`gexTimelineSection.inst13fDeepDive.dataPoints.${item.key}`)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* C. Interpretation Framework */}
                        <div className="rounded-xl border border-emerald-500/15 bg-emerald-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Scale size={16} className="text-emerald-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.inst13fDeepDive.interpretation.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.inst13fDeepDive.interpretation.desc', richTags)}</p>
                            <div className="space-y-2 text-[12px] text-slate-300">
                                <p className="flex items-start gap-1.5"><TrendingUp size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.interpretation.accumulation')}</p>
                                <p className="flex items-start gap-1.5"><Activity size={14} className="text-rose-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.interpretation.distribution')}</p>
                                <p className="flex items-start gap-1.5"><Target size={14} className="text-violet-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.interpretation.concentration')}</p>
                                <p className="flex items-start gap-1.5"><GitBranch size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.interpretation.crossRef')}</p>
                            </div>
                        </div>

                        {/* D. Important Limitations */}
                        <div className="rounded-xl border border-amber-500/15 bg-amber-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={16} className="text-amber-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.inst13fDeepDive.limitations.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t('gexTimelineSection.inst13fDeepDive.limitations.desc')}</p>
                            <div className="space-y-2 text-[12px] text-amber-200/80">
                                <p className="flex items-start gap-1.5"><Clock size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.limitations.delay')}</p>
                                <p className="flex items-start gap-1.5"><Layers size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.limitations.snapshot')}</p>
                                <p className="flex items-start gap-1.5"><AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.limitations.incomplete')}</p>
                                <p className="flex items-start gap-1.5"><Lock size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.inst13fDeepDive.limitations.confidential')}</p>
                            </div>
                        </div>

                        {/* Trading Guide */}
                        <div className="rounded-xl border border-cyan-500/15 bg-cyan-900/10 p-4 space-y-2">
                            <span className="text-[13px] font-bold text-cyan-400 flex items-center gap-1.5"><Briefcase size={13} />{t('gexTimelineSection.inst13fDeepDive.tradingGuide')}</span>
                            <div className="text-[13px] text-slate-300 leading-relaxed space-y-0.5">
                                <p>• {t.rich('gexTimelineSection.inst13fDeepDive.guide1', richTags)}</p>
                                <p>• {t.rich('gexTimelineSection.inst13fDeepDive.guide2', richTags)}</p>
                                <p>• {t.rich('gexTimelineSection.inst13fDeepDive.guide3', richTags)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ SEC Form 4 Insider Trading Deep Dive ═══ */}
            <section className="space-y-5">
                <div className="flex items-center gap-2 mt-2 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-rose-500/40 to-transparent" />
                    <span className="text-[12px] font-bold text-rose-400 uppercase tracking-widest whitespace-nowrap">SEC Form 4 Insider Trading Deep Dive</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-rose-500/40 to-transparent" />
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-rose-500/20 p-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-500/[0.06] via-transparent to-amber-500/[0.04] pointer-events-none" />
                    <InfographicBg type="circuit" />
                    <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-rose-500/30 pointer-events-none z-0" />
                    <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-rose-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-rose-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-rose-500/30 pointer-events-none z-0" />

                    <div className="relative z-10 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                                <FileText size={20} className="text-rose-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white">{t('gexTimelineSection.insiderDeepDive.title')}</h3>
                                <p className="text-[12px] text-rose-300 font-medium">{t('gexTimelineSection.insiderDeepDive.subtitle')}</p>
                            </div>
                            <span className="ml-auto px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-rose-500/30 bg-rose-500/20 text-rose-300 rounded-full">SEC</span>
                        </div>

                        <p className="text-[14px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.insiderDeepDive.desc', richTags)}</p>

                        {/* A. What is Form 4? */}
                        <div className="rounded-xl border border-rose-500/15 bg-rose-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-rose-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.insiderDeepDive.whatIs.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.insiderDeepDive.whatIs.desc', richTags)}</p>
                            <div className="space-y-2 text-[12px] text-slate-300">
                                <p className="flex items-start gap-1.5"><FileText size={14} className="text-rose-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.whatIs.obligation')}</p>
                                <p className="flex items-start gap-1.5"><Layers size={14} className="text-rose-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.whatIs.codes')}</p>
                                <p className="flex items-start gap-1.5"><ShieldAlert size={14} className="text-rose-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.whatIs.tenb51')}</p>
                            </div>
                        </div>

                        {/* B. Academic Research */}
                        <div className="rounded-xl border border-amber-500/15 bg-amber-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Scale size={16} className="text-amber-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.insiderDeepDive.research.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t('gexTimelineSection.insiderDeepDive.research.desc')}</p>
                            <div className="space-y-2 text-[12px] text-slate-300">
                                <p className="flex items-start gap-1.5"><FileText size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.research.seyhun')}</p>
                                <p className="flex items-start gap-1.5"><FileText size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.research.lakonishok')}</p>
                                <p className="flex items-start gap-1.5"><TrendingUp size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.research.cluster')}</p>
                            </div>
                        </div>

                        {/* C. SIGNUM Methodology */}
                        <div className="rounded-xl border border-cyan-500/15 bg-cyan-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <BarChart3 size={16} className="text-cyan-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.insiderDeepDive.signumMethod.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.insiderDeepDive.signumMethod.desc', richTags)}</p>
                            <div className="grid grid-cols-2 gap-2">
                                {(['bullish', 'cautious', 'bearish', 'neutral'] as const).map((key) => {
                                    const colors: Record<string, string> = { bullish: 'border-emerald-500/20 text-emerald-300', cautious: 'border-amber-500/20 text-amber-300', bearish: 'border-rose-500/20 text-rose-300', neutral: 'border-slate-500/20 text-slate-300' };
                                    return <div key={key} className={`px-2.5 py-2 rounded-lg border ${colors[key]} bg-slate-900/40 text-[12px]`}>{t(`gexTimelineSection.insiderDeepDive.signumMethod.${key}`)}</div>;
                                })}
                            </div>
                        </div>

                        {/* D. AI Integration */}
                        <div className="rounded-xl border border-violet-500/15 bg-violet-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Brain size={16} className="text-violet-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.insiderDeepDive.aiIntegration.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('gexTimelineSection.insiderDeepDive.aiIntegration.desc', richTags)}</p>
                        </div>

                        {/* E. Interpretation */}
                        <div className="rounded-xl border border-emerald-500/15 bg-emerald-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Scale size={16} className="text-emerald-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.insiderDeepDive.interpretation.title')}</h4>
                            </div>
                            <div className="space-y-2 text-[12px] text-slate-300">
                                <p className="flex items-start gap-1.5"><TrendingUp size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.interpretation.csuiteBuy')}</p>
                                <p className="flex items-start gap-1.5"><Target size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.interpretation.clusterBuy')}</p>
                                <p className="flex items-start gap-1.5"><Activity size={14} className="text-rose-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.interpretation.voluntarySell')}</p>
                                <p className="flex items-start gap-1.5"><Clock size={14} className="text-slate-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.interpretation.tenb51')}</p>
                            </div>
                        </div>

                        {/* F. Limitations */}
                        <div className="rounded-xl border border-amber-500/15 bg-amber-900/10 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={16} className="text-amber-400" />
                                <h4 className="text-sm font-bold text-white">{t('gexTimelineSection.insiderDeepDive.limitations.title')}</h4>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t('gexTimelineSection.insiderDeepDive.limitations.desc')}</p>
                            <div className="space-y-2 text-[12px] text-amber-200/80">
                                <p className="flex items-start gap-1.5"><Clock size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.limitations.delay')}</p>
                                <p className="flex items-start gap-1.5"><AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.limitations.sellNoise')}</p>
                                <p className="flex items-start gap-1.5"><Layers size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.limitations.largeCap')}</p>
                                <p className="flex items-start gap-1.5"><Lock size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> {t('gexTimelineSection.insiderDeepDive.limitations.disclaimer')}</p>
                            </div>
                        </div>

                        {/* Trading Guide */}
                        <div className="rounded-xl border border-cyan-500/15 bg-cyan-900/10 p-4 space-y-2">
                            <span className="text-[13px] font-bold text-cyan-400 flex items-center gap-1.5"><Briefcase size={13} />{t('gexTimelineSection.insiderDeepDive.tradingGuide')}</span>
                            <div className="text-[13px] text-slate-300 leading-relaxed space-y-0.5">
                                <p>{String.fromCharCode(8226)} {t.rich('gexTimelineSection.insiderDeepDive.guide1', richTags)}</p>
                                <p>{String.fromCharCode(8226)} {t.rich('gexTimelineSection.insiderDeepDive.guide2', richTags)}</p>
                                <p>{String.fromCharCode(8226)} {t.rich('gexTimelineSection.insiderDeepDive.guide3', richTags)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ AI Deep Analysis Section ═══ */}
            <section className="space-y-5">
                <div className="flex items-center gap-2 mt-2 mb-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-amber-500/40 to-transparent" />
                    <span className="text-[12px] font-bold text-amber-400 uppercase tracking-widest whitespace-nowrap">AI Deep Analysis</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-amber-500/40 to-transparent" />
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-amber-500/20 p-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.08] via-transparent to-rose-500/[0.04] pointer-events-none" />
                    <InfographicBg type="circuit" />

                    {/* Corner Frames */}
                    <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-amber-500/30 pointer-events-none z-0" />
                    <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-amber-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-amber-500/30 pointer-events-none z-0" />
                    <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-amber-500/30 pointer-events-none z-0" />

                    <div className="relative z-10 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                                <Brain size={24} className="text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">{t('aiDeepAnalysis.title')}</h3>
                                <p className="text-[13px] text-amber-300 font-medium">{t('aiDeepAnalysis.subtitle')}</p>
                            </div>
                        </div>

                        <p className="text-[15px] text-slate-300 leading-relaxed">
                            {t.rich('aiDeepAnalysis.desc', richTags)}
                        </p>

                        {/* AI Verdict Highlight */}
                        <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-500/20">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-amber-500" />
                                <span className="text-[14px] font-black text-amber-400">{t('aiDeepAnalysis.verdictTitle')}</span>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">
                                {t.rich('aiDeepAnalysis.verdictDesc', richTags)}
                            </p>
                        </div>

                        {/* 4 Analysis Axes */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="p-3 rounded-lg bg-indigo-900/20 border border-indigo-500/15">
                                <p className="text-[12px] text-indigo-300 leading-relaxed">
                                    {t('aiDeepAnalysis.techAnalysis')}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-cyan-900/20 border border-cyan-500/15">
                                <p className="text-[12px] text-cyan-300 leading-relaxed">
                                    {t('aiDeepAnalysis.optionsAnalysis')}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-rose-900/20 border border-rose-500/15">
                                <p className="text-[12px] text-rose-300 leading-relaxed">
                                    {t('aiDeepAnalysis.insiderAnalysis')}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-emerald-900/20 border border-emerald-500/15">
                                <p className="text-[12px] text-emerald-300 leading-relaxed">
                                    {t('aiDeepAnalysis.newsAnalysis')}
                                </p>
                            </div>
                        </div>

                        {/* Risk Tiers */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-500/20 text-center">
                                <span className="text-[12px] font-bold text-emerald-400">{t('aiDeepAnalysis.riskLow')}</span>
                            </div>
                            <div className="px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-500/20 text-center">
                                <span className="text-[12px] font-bold text-amber-400">{t('aiDeepAnalysis.riskMedium')}</span>
                            </div>
                            <div className="px-3 py-2 rounded-lg bg-rose-900/20 border border-rose-500/20 text-center">
                                <span className="text-[12px] font-bold text-rose-400">{t('aiDeepAnalysis.riskHigh')}</span>
                            </div>
                            <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/20 text-center">
                                <span className="text-[12px] font-bold text-red-400">{t('aiDeepAnalysis.riskCritical')}</span>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 flex items-start gap-2">
                            <Lightbulb size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                            <span className="text-[13px] text-amber-200/90 leading-relaxed">
                                {t('aiDeepAnalysis.tip')}
                            </span>
                        </div>
                    </div>
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
