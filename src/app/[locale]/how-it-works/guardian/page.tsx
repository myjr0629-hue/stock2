import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import {
    Gauge, Activity, TrendingUp, TrendingDown, Shield, Globe, BarChart3,
    Lightbulb, AlertTriangle, Calendar, Eye, Compass, Target, Layers,
    ArrowUpDown, Radio, Zap, Brain, MapPin, Info, ChevronRight
} from 'lucide-react';

export default async function GuardianGuidePage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations('guardianGuide');
    const guardianFullImg = locale === 'ko' ? '/guide/guardian-full.png' : `/guide/guardian-full-${locale}.png`;

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
        emerald: (chunks: React.ReactNode) => <span className="text-emerald-400 font-semibold">{chunks}</span>,
        purple: (chunks: React.ReactNode) => <span className="text-purple-400 font-semibold">{chunks}</span>,
    };

    /* ── reusable glass card ── */
    const glassCard = "relative overflow-hidden rounded-2xl border border-white/[0.12] p-5 backdrop-blur-2xl";
    const glassBg = "bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent";

    return (
        <HowItWorksLayout
            title="GUARDIAN"
            subtitle={t('subtitle')}
        >
            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 1: Overview + Full Screenshot                     */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-[13px] text-emerald-400 font-medium uppercase tracking-wider">Macro-Tactical Command Center</p>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t.rich('overviewDesc', richTags)}
                </p>

                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.04] via-transparent to-cyan-500/[0.03] pointer-events-none" />
                    <Image
                        src={guardianFullImg}
                        alt="Guardian Full View"
                        width={2048}
                        height={1200}
                        quality={100}
                        unoptimized
                        className="w-full h-auto relative"
                    />
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 2: Top Status Bar                                 */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('topBar.title')}</h3>
                        <p className="text-[13px] text-cyan-400 font-medium uppercase tracking-wider">Real-Time Market Pulse</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30">
                        <span className="text-xs font-bold text-cyan-300">Live</span>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t.rich('topBar.desc', richTags)}
                </p>

                {/* Top Bar Live Mockup */}
                <div className="relative overflow-hidden rounded-2xl bg-[#0c1222] border border-white/[0.08] p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-bold text-emerald-400 tracking-wider">GUARDIAN EYE : ONLINE</span>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] text-slate-300">Fear & Greed</span>
                                <span className="text-sm font-black text-amber-400">42.6</span>
                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200">FEAR</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] text-slate-300">VIX</span>
                                <span className="text-sm font-black text-white">19.1</span>
                                <span className="text-[11px] text-rose-400">5.6%</span>
                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">NORMAL</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] text-slate-300">DXY</span>
                                <span className="text-sm font-black text-white">98.3</span>
                                <span className="text-[11px] text-rose-400">0.11</span>
                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">NEUTRAL</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3-Column Indicator Explanation Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Fear & Greed */}
                    <div className={`${glassCard} ${glassBg}`}>
                        {/* Infographic BG */}
                        <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-amber-500/[0.06] blur-2xl pointer-events-none" />
                        <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full border border-amber-500/10 pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                                    <Gauge size={16} className="text-white" />
                                </div>
                                <h4 className="text-sm font-black text-white">{t('topBar.fearGreed.title')}</h4>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed">{t.rich('topBar.fearGreed.desc', richTags)}</p>
                            <div className="space-y-1.5">
                                {[
                                    { range: '0-25', color: 'bg-rose-500', text: 'text-rose-400', label: t('topBar.fearGreed.extremeFear') },
                                    { range: '25-50', color: 'bg-amber-500', text: 'text-amber-400', label: t('topBar.fearGreed.fear') },
                                    { range: '50', color: 'bg-slate-400', text: 'text-slate-300', label: t('topBar.fearGreed.neutral') },
                                    { range: '50-75', color: 'bg-emerald-500', text: 'text-emerald-400', label: t('topBar.fearGreed.greed') },
                                    { range: '75-100', color: 'bg-emerald-300', text: 'text-emerald-300', label: t('topBar.fearGreed.extremeGreed') },
                                ].map((item) => (
                                    <div key={item.range} className="flex items-center gap-2 text-xs">
                                        <div className={`w-2 h-2 rounded-full ${item.color}`} />
                                        <span className={`${item.text} font-bold`}>{item.range}</span>
                                        <span className="text-slate-400">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* VIX */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-rose-500/[0.06] blur-2xl pointer-events-none" />
                        <div className="absolute -left-3 -top-3 w-20 h-20 rounded-full border border-rose-500/10 pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
                                    <Activity size={16} className="text-white" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white">{t('topBar.vix.title')}</h4>
                                    <p className="text-xs text-slate-400">CBOE Volatility Index</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed">{t.rich('topBar.vix.desc', richTags)}</p>
                            <div className="space-y-1.5">
                                {[
                                    { range: '<15', color: 'bg-emerald-500', text: 'text-emerald-400', label: t('topBar.vix.low') },
                                    { range: '15-25', color: 'bg-amber-500', text: 'text-amber-400', label: t('topBar.vix.normal') },
                                    { range: '>25', color: 'bg-rose-500', text: 'text-rose-400', label: t('topBar.vix.high') },
                                ].map((item) => (
                                    <div key={item.range} className="flex items-center gap-2 text-xs">
                                        <div className={`w-2 h-2 rounded-full ${item.color}`} />
                                        <span className={`${item.text} font-bold`}>{item.range}</span>
                                        <span className="text-slate-400">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* DXY */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -left-6 -bottom-6 w-28 h-28 rounded-full bg-cyan-500/[0.06] blur-2xl pointer-events-none" />
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full border border-cyan-500/10 pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                                    <Globe size={16} className="text-white" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white">{t('topBar.dxy.title')}</h4>
                                    <p className="text-xs text-slate-400">US Dollar Index</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed">{t.rich('topBar.dxy.desc', richTags)}</p>
                            <div className="p-2.5 rounded-lg bg-amber-900/20 border border-amber-500/20">
                                <div className="flex items-start gap-1.5">
                                    <Lightbulb size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                    <span className="text-[13px] text-amber-200/90">{t('topBar.dxy.tip')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Trading Tip */}
                <div className="p-4 rounded-xl bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                    <span className="text-sm font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('topBar.tradingGuide')}</span>
                    <div className="text-sm text-slate-300 leading-relaxed space-y-1">
                        <p>• {t.rich('topBar.guide1', richTags)}</p>
                        <p>• {t.rich('topBar.guide2', richTags)}</p>
                        <p>• {t.rich('topBar.guide3', richTags)}</p>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 3 & 4: Gravity Gauge + Reality Check (2-col)      */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* ─── Gravity Gauge Card ─── */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-amber-500/[0.05] blur-3xl pointer-events-none" />
                        <div className="absolute right-4 top-4 w-20 h-20 rounded-full border border-amber-400/10 pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
                                        <Gauge size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{t('gravityGauge.title')}</h3>
                                        <p className="text-xs text-amber-400 font-medium uppercase tracking-wider">Market Strength Score</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-300">Core</span>
                            </div>

                            <p className="text-sm text-slate-300 leading-relaxed">{t.rich('gravityGauge.desc', richTags)}</p>

                            {/* Gauge Visual */}
                            <div className="flex flex-col items-center py-3">
                                <div className="text-5xl font-black text-slate-300">59</div>
                                <div className="text-xs font-bold text-slate-400 mt-1">NEUTRAL</div>
                                <div className="w-full max-w-[200px] h-2.5 rounded-full mt-3 bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 relative">
                                    <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-slate-700 shadow-lg" style={{ left: '59%' }} />
                                </div>
                            </div>

                            {/* Interpretation Scale */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-2.5 rounded-xl bg-rose-900/20 border border-rose-500/15 text-center">
                                    <div className="text-lg font-black text-rose-400">0-40</div>
                                    <div className="text-xs font-bold text-rose-400">{t('gravityGauge.weak')}</div>
                                </div>
                                <div className="p-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-center">
                                    <div className="text-lg font-black text-slate-300">40-60</div>
                                    <div className="text-xs font-bold text-slate-400">{t('gravityGauge.neutral')}</div>
                                </div>
                                <div className="p-2.5 rounded-xl bg-emerald-900/20 border border-emerald-500/15 text-center">
                                    <div className="text-lg font-black text-emerald-400">60-100</div>
                                    <div className="text-xs font-bold text-emerald-400">{t('gravityGauge.strong')}</div>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={13} />{t('gravityGauge.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-0.5">
                                    <p>• {t.rich('gravityGauge.guide1', richTags)}</p>
                                    <p>• {t.rich('gravityGauge.guide2', richTags)}</p>
                                    <p>• {t.rich('gravityGauge.guide3', richTags)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Reality Check Card ─── */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-purple-500/[0.05] blur-3xl pointer-events-none" />
                        <div className="absolute left-6 bottom-6 w-16 h-16 rounded-full border border-purple-400/10 pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                                        <Shield size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{t('realityCheck.title')}</h3>
                                        <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">Macro Environment Scanner</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-xs font-bold text-purple-300">Macro</span>
                            </div>

                            <p className="text-sm text-slate-300 leading-relaxed">{t.rich('realityCheck.desc', richTags)}</p>

                            {/* 6 Macro Cards — 3x2 grid */}
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: 'PRICE FLOW', value: '+0.9%', sub: 'Nasdaq Daily Momentum', positive: true },
                                    { label: 'NDX 20D', value: '100%', sub: 'Nasdaq 20-Day Health', positive: true },
                                    { label: 'DOW 20D', value: '100%', sub: 'Dow Jones 20-Day Health', positive: true },
                                    { label: 'US10Y', value: '4.09%', sub: '10-Year Treasury Yield', positive: false },
                                    { label: '2S10S', value: '+0.62%', sub: 'Yield Curve Spread', positive: true },
                                    { label: 'REAL', value: '+1.79%', sub: 'Real Interest Rate', positive: false },
                                ].map((item) => (
                                    <div key={item.label} className="rounded-xl bg-slate-800/60 border border-white/[0.06] p-2.5 text-center group hover:bg-slate-800/80 transition-colors">
                                        <div className="text-xs text-slate-300 mb-0.5 font-bold tracking-wider">{item.label}</div>
                                        <div className={`text-base font-black ${item.positive ? 'text-emerald-400' : 'text-white'}`}>{item.value}</div>
                                        <div className="text-xs text-slate-400 mt-0.5 leading-tight">{item.sub}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Indicator Explanation */}
                            <div className="p-3 rounded-lg bg-slate-800/40 border border-white/5 space-y-2">
                                <div className="flex items-center gap-1.5">
                                    <Info size={12} className="text-cyan-400" />
                                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Indicator Guide</span>
                                </div>
                                <div className="text-[13px] text-slate-400 leading-relaxed space-y-1">
                                    <p><span className="text-white font-bold">NDX 20D / DOW 20D</span> — {t.rich('realityCheck.priceFlow.desc', richTags)}</p>
                                    <p><span className="text-white font-bold">2S10S</span> — {t.rich('realityCheck.bonds.desc', richTags)}</p>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><Compass size={13} />{t('realityCheck.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-0.5">
                                    <p>• {t.rich('realityCheck.guide1', richTags)}</p>
                                    <p>• {t.rich('realityCheck.guide2', richTags)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 5 & 6: RLSI + Market Breadth (2-col)              */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* ─── RLSI Insight ─── */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-cyan-500/[0.05] blur-3xl pointer-events-none" />
                        <div className="absolute right-2 bottom-2 w-24 h-24 rounded-full border border-cyan-500/8 pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                                        <Eye size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{t('rlsi.title')}</h3>
                                        <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider">Real-time Liquidity & Sentiment</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-xs font-bold text-cyan-300">AI</span>
                            </div>

                            <p className="text-sm text-slate-300 leading-relaxed">{t.rich('rlsi.desc', richTags)}</p>

                            {/* Sample Insight Box */}
                            <div className="p-3 rounded-lg bg-slate-800/50 border border-white/5">
                                <div className="text-xs font-bold text-white mb-1.5">TACTICAL INSIGHT</div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">{t('rlsi.sampleInsight')}</p>
                            </div>

                            {/* Alignment States */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-2 rounded-lg bg-emerald-900/20 border border-emerald-500/15 text-center">
                                    <div className="text-xs font-bold text-emerald-400">ALIGNMENT OK</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">{t('rlsi.alignOk')}</div>
                                </div>
                                <div className="p-2 rounded-lg bg-amber-900/20 border border-amber-500/15 text-center">
                                    <div className="text-xs font-bold text-amber-400">PARTIAL</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">{t('rlsi.alignPartial')}</div>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-800/50 border border-white/5 text-center">
                                    <div className="text-xs font-bold text-slate-400">OFFLINE</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">{t('rlsi.alignOffline')}</div>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><Brain size={13} />{t('rlsi.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-0.5">
                                    <p>• {t.rich('rlsi.guide1', richTags)}</p>
                                    <p>• {t.rich('rlsi.guide2', richTags)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Market Breadth ─── */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -left-8 -bottom-8 w-36 h-36 rounded-full bg-emerald-500/[0.05] blur-3xl pointer-events-none" />
                        <div className="absolute right-4 top-8 w-20 h-20 rounded-full border border-emerald-400/10 pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                        <BarChart3 size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{t('breadth.title')}</h3>
                                        <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Advance/Decline Analysis</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs font-bold text-emerald-300">Health</span>
                            </div>

                            <p className="text-sm text-slate-300 leading-relaxed">{t.rich('breadth.desc', richTags)}</p>

                            {/* Breadth Visual */}
                            <div className="flex items-center gap-4 py-2">
                                <div>
                                    <div className="text-4xl font-black text-emerald-400">61<span className="text-lg text-slate-400">%</span></div>
                                    <div className="text-xs text-slate-300">{t('breadth.advanceRatio')}</div>
                                </div>
                                <div className="flex-1 space-y-2">
                                    {/* A/D Bar */}
                                    <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden flex">
                                        <div className="h-full bg-emerald-500 rounded-l-full" style={{ width: '61%' }} />
                                        <div className="h-full bg-rose-500 rounded-r-full" style={{ width: '39%' }} />
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-emerald-400">▲ 상승 61%</span>
                                        <span className="text-rose-400">▼ 하락 39%</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-white/5">
                                    <div className="text-xs text-slate-300 mb-0.5">A/D {t('breadth.adRatio')}</div>
                                    <div className="text-base font-black text-emerald-400">1.75 : 1</div>
                                </div>
                                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-white/5">
                                    <div className="text-xs text-slate-300 mb-0.5">{t('breadth.volumeAnalysis')}</div>
                                    <div className="text-base font-black text-white">54.6<span className="text-sm text-slate-400">%</span></div>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={13} />{t('breadth.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-0.5">
                                    <p>• {t.rich('breadth.guide1', richTags)}</p>
                                    <p>• {t.rich('breadth.guide2', richTags)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 7 & 8: Economic Calendar + Tactical Verdict (2-col)*/}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* ─── Economic Calendar ─── */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-amber-500/[0.05] blur-3xl pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
                                        <Calendar size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{t('calendar.title')}</h3>
                                        <p className="text-xs text-amber-400 font-medium uppercase tracking-wider">Event-Driven Trading</p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm text-slate-300 leading-relaxed">{t.rich('calendar.desc', richTags)}</p>

                            {/* Calendar Mockup */}
                            <div className="rounded-lg bg-slate-800/50 border border-white/5 p-3 space-y-3">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle size={14} className="text-amber-400" />
                                    <span className="text-xs text-slate-300">Next Impact:</span>
                                    <span className="text-sm font-bold text-amber-400">6d 11h</span>
                                </div>
                                <div className="space-y-2">
                                    {[
                                        { date: '2/27 금', tag: 'CPI', event: 'PPI / Core PPI (Jan)', tagColor: 'bg-amber-500/30 text-amber-300' },
                                        { date: '3/2 월', tag: 'PMI', event: 'ISM Manufacturing PMI', tagColor: 'bg-rose-500/30 text-rose-300' },
                                        { date: '3/5 수', tag: 'PMI', event: 'ISM Services PMI', tagColor: 'bg-rose-500/30 text-rose-300' },
                                    ].map((e) => (
                                        <div key={e.date} className="flex items-center gap-3 text-xs">
                                            <span className="text-slate-400 w-10">{e.date}</span>
                                            <span className={`text-[11px] font-bold px-1 py-0.5 rounded ${e.tagColor}`}>{e.tag}</span>
                                            <span className="text-slate-300">{e.event}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-amber-900/15 border border-amber-500/20 space-y-1">
                                <span className="text-[13px] font-bold text-amber-400 flex items-center gap-1.5"><Lightbulb size={13} />{t('calendar.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-0.5">
                                    <p>• {t.rich('calendar.guide1', richTags)}</p>
                                    <p>• {t.rich('calendar.guide2', richTags)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Tactical Verdict ─── */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-emerald-500/[0.05] blur-3xl pointer-events-none" />
                        <div className="absolute right-6 bottom-10 w-16 h-16 rounded-full border border-emerald-400/10 pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                        <Compass size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{t('tactical.title')}</h3>
                                        <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">AI Tactical Analysis</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs font-bold text-emerald-300">V2.5 FLASH</span>
                            </div>

                            <p className="text-sm text-slate-300 leading-relaxed">{t.rich('tactical.desc', richTags)}</p>

                            {/* Verdict Sections */}
                            <div className="space-y-2">
                                <div className="p-2.5 rounded-lg bg-amber-900/10 border-l-2 border-amber-400">
                                    <span className="text-xs font-bold text-amber-400">[{t('tactical.currentLabel')}]</span>
                                    <p className="text-[13px] text-slate-300 mt-0.5">{t('tactical.sampleCurrent')}</p>
                                </div>
                                <div className="p-2.5 rounded-lg bg-purple-900/10 border-l-2 border-purple-400">
                                    <span className="text-xs font-bold text-purple-400">[{t('tactical.analysisLabel')}]</span>
                                    <p className="text-[13px] text-slate-300 mt-0.5">{t('tactical.sampleAnalysis')}</p>
                                </div>
                                <div className="p-2.5 rounded-lg bg-emerald-900/10 border-l-2 border-emerald-400">
                                    <span className="text-xs font-bold text-emerald-400">[{t('tactical.actionLabel')}]</span>
                                    <p className="text-[13px] text-slate-300 mt-0.5">{t('tactical.sampleAction')}</p>
                                </div>
                            </div>

                            {/* Regime Tags */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-2 rounded-lg bg-emerald-900/20 border border-emerald-500/15 text-center">
                                    <div className="text-xs font-bold text-emerald-400">BULLISH</div>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-800/50 border border-white/5 text-center">
                                    <div className="text-xs font-bold text-slate-400">NEUTRAL</div>
                                </div>
                                <div className="p-2 rounded-lg bg-rose-900/20 border border-rose-500/15 text-center">
                                    <div className="text-xs font-bold text-rose-400">BEARISH</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 9: Flow Topography Map (full-width hero)           */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-400 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                            <Radio size={18} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">{t('flowMap.title')}</h3>
                            <p className="text-[13px] text-purple-400 font-medium uppercase tracking-wider">Sector Network Visualization</p>
                        </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-xs font-bold text-purple-300">Premium</span>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('flowMap.desc', richTags)}</p>

                {/* Flow Map Screenshot */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.04] via-transparent to-cyan-500/[0.03] pointer-events-none" />
                    <Image
                        src="/guide/guardian-flow-map.png"
                        alt="Flow Topography Map"
                        width={2048}
                        height={1200}
                        quality={100}
                        unoptimized
                        className="w-full h-auto relative"
                    />
                </div>

                {/* Legend + Guide side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5 space-y-3">
                        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">{t('flowMap.legendTitle')}</div>
                        <div className="grid grid-cols-2 gap-3 text-[13px]">
                            <div className="flex items-center gap-2.5">
                                <div className="w-5 h-5 rounded-full border-2 border-dashed border-emerald-400" />
                                <span className="text-slate-300">{t('flowMap.nodeUp')}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="w-5 h-5 rounded-full border-2 border-dashed border-rose-400" />
                                <span className="text-slate-300">{t('flowMap.nodeDown')}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="w-6 h-[3px] rounded-full bg-gradient-to-r from-rose-400 via-purple-400 to-indigo-400" />
                                <span className="text-slate-300">{t('flowMap.flowLine')}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="w-3 h-3 rounded-full bg-rose-400 animate-pulse" />
                                <span className="text-slate-300">{t('flowMap.activeFlow')}</span>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                        <span className="text-sm font-bold text-emerald-400 flex items-center gap-1.5"><Radio size={14} />{t('flowMap.tradingGuide')}</span>
                        <div className="text-sm text-slate-300 leading-relaxed space-y-1">
                            <p>• {t.rich('flowMap.guide1', richTags)}</p>
                            <p>• {t.rich('flowMap.guide2', richTags)}</p>
                            <p>• {t.rich('flowMap.guide3', richTags)}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 10: Sector Intel                                   */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className={`${glassCard} ${glassBg}`}>
                    <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-teal-500/[0.05] blur-3xl pointer-events-none" />
                    <div className="absolute left-8 bottom-4 w-20 h-20 rounded-full border border-teal-400/10 pointer-events-none" />
                    <div className="relative space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/25">
                                    <Layers size={18} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">{t('sectorIntel.title')}</h3>
                                    <p className="text-xs text-teal-400 font-medium uppercase tracking-wider">Sector Deep Dive</p>
                                </div>
                            </div>
                            <span className="px-2.5 py-1 rounded-full bg-teal-500/20 border border-teal-500/30 text-xs font-bold text-teal-300">Intel</span>
                        </div>

                        <p className="text-sm text-slate-300 leading-relaxed">{t.rich('sectorIntel.desc', richTags)}</p>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Sector Mockup */}
                            <div className="rounded-xl bg-slate-800/40 border border-white/5 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-base font-black text-white">커뮤니케이션</div>
                                    <span className="text-sm font-bold text-emerald-400">+1.44%</span>
                                </div>
                                <div className="space-y-1.5">
                                    {['D-4', 'D-3', 'D-2', 'D-1', 'D-0'].map((day, i) => (
                                        <div key={day} className="flex items-center gap-2">
                                            <span className="text-xs text-slate-400 w-6">{day}</span>
                                            <div className="flex-1 h-2.5 rounded-full bg-slate-800 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${i < 2 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                                    style={{ width: `${[30, 20, 45, 60, 80][i]}%` }}
                                                />
                                            </div>
                                            <span className={`text-xs font-bold ${i < 2 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                {['-0.8%', '-0.3%', '+0.7%', '+0.5%', '+1.4%'][i]}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Constituents */}
                            <div className="rounded-xl bg-slate-800/40 border border-white/5 p-4 space-y-3">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Top Constituents</div>
                                <div className="space-y-2.5">
                                    {[
                                        { ticker: 'GOOGL', price: '$184.38', change: '+4.01%', up: true },
                                        { ticker: 'NFLX', price: '$76.67', change: '+2.17%', up: true },
                                        { ticker: 'VZ', price: '$49.25', change: '+1.25%', up: true },
                                        { ticker: 'T', price: '$27.98', change: '+0.36%', up: true },
                                    ].map((stock) => (
                                        <div key={stock.ticker} className="flex items-center justify-between text-xs">
                                            <span className="text-white font-bold">{stock.ticker}</span>
                                            <div className="text-right">
                                                <span className="text-slate-300">{stock.price}</span>
                                                <span className={`ml-2 font-bold ${stock.up ? 'text-emerald-400' : 'text-rose-400'}`}>{stock.change}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1">
                            <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><Target size={13} />{t('sectorIntel.tradingGuide')}</span>
                            <div className="text-[13px] text-slate-300 leading-relaxed space-y-0.5">
                                <p>• {t.rich('sectorIntel.guide1', richTags)}</p>
                                <p>• {t.rich('sectorIntel.guide2', richTags)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 11: Practical Trading Strategy                     */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-rose-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
                        <Zap size={18} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('strategy.title')}</h3>
                        <p className="text-[13px] text-amber-400 font-medium uppercase tracking-wider">How to Use Guardian for Trading</p>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('strategy.desc', richTags)}</p>

                {/* 4 Steps — 2x2 Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {[
                        { step: '1', title: t('strategy.step1.title'), desc: t.rich('strategy.step1.desc', richTags), gradient: 'from-cyan-400 to-cyan-600', glow: 'shadow-cyan-500/20', bg: 'from-cyan-500/[0.04]' },
                        { step: '2', title: t('strategy.step2.title'), desc: t.rich('strategy.step2.desc', richTags), gradient: 'from-purple-400 to-purple-600', glow: 'shadow-purple-500/20', bg: 'from-purple-500/[0.04]' },
                        { step: '3', title: t('strategy.step3.title'), desc: t.rich('strategy.step3.desc', richTags), gradient: 'from-emerald-400 to-emerald-600', glow: 'shadow-emerald-500/20', bg: 'from-emerald-500/[0.04]' },
                        { step: '4', title: t('strategy.step4.title'), desc: t.rich('strategy.step4.desc', richTags), gradient: 'from-amber-400 to-amber-600', glow: 'shadow-amber-500/20', bg: 'from-amber-500/[0.04]' },
                    ].map((s) => (
                        <div key={s.step} className={`${glassCard} ${glassBg}`}>
                            <div className={`absolute inset-0 bg-gradient-to-br ${s.bg} via-transparent to-transparent pointer-events-none`} />
                            <div className="relative flex items-start gap-4">
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center flex-shrink-0 shadow-lg ${s.glow}`}>
                                    <span className="text-sm font-black text-white">{s.step}</span>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-white">{s.title}</h4>
                                    <p className="text-sm text-slate-300 mt-1 leading-relaxed">{s.desc}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Warning Box */}
                <div className={`${glassCard} bg-gradient-to-br from-rose-500/[0.08] via-rose-500/[0.03] to-transparent`}>
                    <div className="relative flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle size={16} className="text-rose-400" />
                        </div>
                        <div>
                            <span className="text-sm font-bold text-rose-400">{t('strategy.warningTitle')}</span>
                            <p className="text-sm text-slate-300 mt-1">{t.rich('strategy.warningDesc', richTags)}</p>
                        </div>
                    </div>
                </div>
            </section>
        </HowItWorksLayout>
    );
}
