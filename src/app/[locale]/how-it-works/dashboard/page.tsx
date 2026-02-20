import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import {
    Zap, Diamond, Target, Shield, Layers, TrendingDown, TrendingUp,
    Activity, ArrowUpDown, Lightbulb, BarChart3, MapPin
} from 'lucide-react';

export default async function DashboardGuidePage() {
    const t = await getTranslations('dashboardGuide');

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
    };

    return (
        <HowItWorksLayout
            title="DASHBOARD"
            subtitle={t('subtitle')}
        >
            {/* Overview Section with Full Screenshot */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider">Command Center Overview</p>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">
                    {t.rich('overviewDesc', richTags)}
                </p>

                {/* Full Dashboard Screenshot */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-cyan-500/[0.03] pointer-events-none" />
                    <Image
                        src="/guide/dashboard/dashboard-full.png"
                        alt="Dashboard Full View"
                        width={1024}
                        height={600}
                        className="w-full h-auto relative"
                    />
                </div>
            </section>

            {/* Premium Indicator Cards Section */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('indicatorsTitle')}</h3>
                        <p className="text-xs text-amber-400 font-medium uppercase tracking-wider">12 Premium Indicators</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                        <span className="text-xs font-bold text-amber-300">Premium</span>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">
                    {t('indicatorsDesc')}
                </p>

                {/* NET GEX + GAMMA FLIP Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* NET GEX Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-rose-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Zap size={12} className="text-rose-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">NET GEX</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-rose-400 tracking-tight">-0.34B</span>
                                        <span className="text-xs text-rose-300">변동성 ↑</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('netGex.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-xs font-bold text-rose-300">{t('netGex.badge')}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('netGex.desc', richTags)}
                            </p>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    <span className="text-slate-300">{t('netGex.positive')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                                    <span className="text-slate-300">{t('netGex.negative')}</span>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 flex items-start gap-2">
                                <Lightbulb size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                <span className="text-[13px] text-amber-200/90 leading-relaxed">{t('netGex.tip')}</span>
                            </div>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('netGex.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('netGex.guide1')}</p>
                                    <p>• {t('netGex.guide2')}</p>
                                    <p>• {t('netGex.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* GAMMA FLIP Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-purple-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Diamond size={12} className="text-purple-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">GAMMA FLIP</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black text-emerald-400 tracking-tight">$190</span>
                                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300">SHORT</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('gammaFlip.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-xs font-bold text-purple-300">{t('gammaFlip.badge')}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('gammaFlip.desc', richTags)}
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2.5 rounded-lg bg-emerald-900/20 border border-emerald-500/20">
                                    <div className="text-xs font-bold text-emerald-400 mb-1">LONG γ</div>
                                    <div className="text-[13px] text-slate-300">{t('gammaFlip.longLabel')}</div>
                                </div>
                                <div className="p-2.5 rounded-lg bg-rose-900/20 border border-rose-500/20">
                                    <div className="text-xs font-bold text-rose-400 mb-1">SHORT γ</div>
                                    <div className="text-[13px] text-slate-300">{t('gammaFlip.shortLabel')}</div>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 flex items-start gap-2">
                                <Zap size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                <span className="text-[13px] text-amber-200/90 leading-relaxed">{t('gammaFlip.tip')}</span>
                            </div>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('gammaFlip.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('gammaFlip.guide1')}</p>
                                    <p>• {t('gammaFlip.guide2')}</p>
                                    <p>• {t('gammaFlip.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SQUEEZE + VWAP Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* SQUEEZE Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-amber-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Zap size={12} className="text-amber-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">SQUEEZE</span>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/40 text-rose-200 ml-auto">HIGH</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-rose-400 tracking-tight">59%</span>
                                        <span className="text-xs text-amber-300">변동성 주의</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('squeeze.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-300">{t('squeeze.badge')}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('squeeze.desc', richTags)}
                            </p>

                            <div className="p-3 rounded-lg bg-slate-800/50 border border-white/5 space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                                    <span className="text-rose-400 font-bold">HIGH</span>
                                    <span className="text-slate-300">{t('squeeze.high')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                    <span className="text-amber-400 font-bold">MED</span>
                                    <span className="text-slate-300">{t('squeeze.med')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    <span className="text-emerald-400 font-bold">LOW</span>
                                    <span className="text-slate-300">{t('squeeze.low')}</span>
                                </div>
                            </div>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('squeeze.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('squeeze.guide1')}</p>
                                    <p>• {t('squeeze.guide2')}</p>
                                    <p>• {t('squeeze.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* VWAP Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-cyan-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <BarChart3 size={12} className="text-cyan-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">VWAP 거리</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black text-emerald-400 tracking-tight">+0.7%</span>
                                        <span className="text-xs text-slate-400">$187.7</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('vwap.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-xs font-bold text-cyan-300">{t('vwap.badge')}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('vwap.desc', richTags)}
                            </p>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    <span className="text-slate-300">{t('vwap.above')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                                    <span className="text-slate-300">{t('vwap.below')}</span>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 flex items-start gap-2">
                                <MapPin size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                <span className="text-[13px] text-amber-200/90 leading-relaxed">{t('vwap.tip')}</span>
                            </div>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('vwap.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('vwap.guide1')}</p>
                                    <p>• {t('vwap.guide2')}</p>
                                    <p>• {t('vwap.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* P/C RATIO + GEX REGIME Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* P/C RATIO Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-emerald-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Zap size={12} className="text-emerald-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">P/C RATIO</span>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-200 ml-auto">VOLUME</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-emerald-400 tracking-tight">1.91</span>
                                        <span className="text-xs text-emerald-300">콜 우위</span>
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">C 490K / P 257K</div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('pcRatio.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs font-bold text-emerald-300">{t('pcRatio.badge')}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('pcRatio.desc', richTags)}
                            </p>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('pcRatio.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('pcRatio.guide1')}</p>
                                    <p>• {t('pcRatio.guide2')}</p>
                                    <p>• {t('pcRatio.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* GEX REGIME Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-amber-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Zap size={12} className="text-amber-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">GEX REGIME</span>
                                        <span className="text-[10px] text-slate-500 ml-auto">02-20</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-amber-400 tracking-tight">23%</span>
                                        <span className="text-xs text-amber-300">플립 구간</span>
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">FLIP $190 (±0.4%)</div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('gexRegime.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-300">{t('gexRegime.badge')}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('gexRegime.desc', richTags)}
                            </p>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('gexRegime.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('gexRegime.guide1')}</p>
                                    <p>• {t('gexRegime.guide2')}</p>
                                    <p>• {t('gexRegime.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* IMPLIED MOVE + MAX PAIN Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* IMPLIED MOVE Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-teal-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <ArrowUpDown size={12} className="text-teal-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">IMPLIED MOVE</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-teal-400 tracking-tight">±1.4%</span>
                                        <span className="text-xs text-emerald-300">안정</span>
                                    </div>
                                    <div className="text-[11px] text-cyan-400 mt-0.5">↗ 콜 프리미엄 우위 → 상승 기대</div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('impliedMove.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-500/30 text-xs font-bold text-teal-300">{t('impliedMove.badge')}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('impliedMove.desc', richTags)}
                            </p>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('impliedMove.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('impliedMove.guide1')}</p>
                                    <p>• {t('impliedMove.guide2')}</p>
                                    <p>• {t('impliedMove.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* MAX PAIN Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-rose-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Target size={12} className="text-rose-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">MAX PAIN</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-white tracking-tight">$185</span>
                                        <span className="text-xs text-emerald-400">2.5%</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('maxPain.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-xs font-bold text-rose-300">수렴점</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t('maxPain.desc')}
                            </p>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('maxPain.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('maxPain.guide1')}</p>
                                    <p>• {t('maxPain.guide2')}</p>
                                    <p>• {t('maxPain.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CALL WALL + DARK POOL Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* CALL WALL / PUT FLOOR Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-amber-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Shield size={12} className="text-amber-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">CALL WALL</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">PUT FLOOR</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5 mt-1">
                                        <span className="text-lg font-black text-emerald-400">$195</span>
                                        <span className="text-slate-500">/</span>
                                        <span className="text-lg font-black text-rose-400">$175</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('callWall.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-300">저항/지지</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('callWall.desc', richTags)}
                            </p>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('callWall.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('callWall.guide1')}</p>
                                    <p>• {t('callWall.guide2')}</p>
                                    <p>• {t('callWall.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* DARK POOL Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-purple-500/30 shadow-lg shadow-purple-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Layers size={12} className="text-purple-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">DARK POOL %</span>
                                    </div>
                                    <div className="mb-1">
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/40 text-rose-200">HIGH</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-purple-300 tracking-tight">57.6%</span>
                                        <span className="text-xs text-purple-400">기관 집중</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('darkPool.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-xs font-bold text-purple-300">기관 추적</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('darkPool.desc', richTags)}
                            </p>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('darkPool.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('darkPool.guide1')}</p>
                                    <p>• {t('darkPool.guide2')}</p>
                                    <p>• {t('darkPool.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SHORT VOL + ATM IV Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* SHORT VOL Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-orange-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <TrendingDown size={12} className="text-orange-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">SHORT VOL %</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black text-orange-400 tracking-tight">45.2%</span>
                                        <span className="text-xs text-orange-300">공매도 활동</span>
                                    </div>
                                    <div className="text-[11px] text-emerald-400 mt-0.5">vs DP 58% → 기관 숏 구축</div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('shortVol.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/30 text-xs font-bold text-orange-300">공매도</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('shortVol.desc', richTags)}
                            </p>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('shortVol.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('shortVol.guide1')}</p>
                                    <p>• {t('shortVol.guide2')}</p>
                                    <p>• {t('shortVol.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ATM IV Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg shadow-indigo-500/10 flex-shrink-0 bg-slate-900/80 px-4 py-3 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Activity size={12} className="text-indigo-400" />
                                        <span className="text-xs font-bold text-slate-300 tracking-wider">ATM IV</span>
                                        <span className="text-[10px] text-slate-500 ml-auto">내재변동성</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black text-amber-400 tracking-tight">56%</span>
                                        <span className="text-xs text-amber-300">고변동</span>
                                        <span className="text-[10px] px-1 py-0.5 rounded bg-slate-700 text-slate-300 ml-auto">02/27</span>
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                        <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500" style={{ width: '56%' }} />
                                        </div>
                                    </div>
                                    <div className="flex justify-between mt-0.5">
                                        <span className="text-[9px] text-slate-500">0%</span>
                                        <span className="text-[9px] text-slate-500">50%</span>
                                        <span className="text-[9px] text-slate-500">100%</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-black text-white">{t('atmIv.title')}</h4>
                                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-xs font-bold text-indigo-300">내재변동성</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[15px] text-slate-300 leading-relaxed">
                                {t.rich('atmIv.desc', richTags)}
                            </p>

                            {/* Trading Guide */}
                            <div className="p-3 rounded-lg bg-emerald-900/15 border border-emerald-500/20 space-y-1.5">
                                <span className="text-[13px] font-bold text-emerald-400 flex items-center gap-1.5"><TrendingUp size={14} />{t('atmIv.tradingGuide')}</span>
                                <div className="text-[13px] text-slate-300 leading-relaxed space-y-1">
                                    <p>• {t('atmIv.guide1')}</p>
                                    <p>• {t('atmIv.guide2')}</p>
                                    <p>• {t('atmIv.guide3')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Options Overlay Chart Section */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('chartTitle')}</h3>
                        <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider">Price + Options Levels</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30">
                        <span className="text-xs font-bold text-cyan-300">Overlay</span>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">
                    {t.rich('chartDesc', richTags)}
                </p>

                {/* Chart Legend */}
                <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-amber-400" />
                            <span className="text-amber-400 font-bold">CALL WALL</span>
                            <span className="text-slate-300">저항</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-rose-400 border-dashed" style={{ borderTop: '2px dashed' }} />
                            <span className="text-rose-400 font-bold">MAX PAIN</span>
                            <span className="text-slate-300">수렴</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-cyan-400 border-dashed" style={{ borderTop: '2px dashed' }} />
                            <span className="text-cyan-400 font-bold">PREV CLOSE</span>
                            <span className="text-slate-300">전일 종가</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Signal Feed Section */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('signalTitle')}</h3>
                        <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Real-Time Intelligence</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">
                    {t.rich('signalDesc', richTags)}
                </p>

                {/* Signal Tag Legend */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-500/20 text-center">
                        <span className="text-sm font-black text-emerald-400">BUY</span>
                        <p className="text-sm text-slate-300 mt-1">매수 시그널</p>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-900/20 border border-rose-500/20 text-center">
                        <span className="text-sm font-black text-rose-400">SELL</span>
                        <p className="text-sm text-slate-300 mt-1">매도 시그널</p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-900/20 border border-amber-500/20 text-center">
                        <span className="text-sm font-black text-amber-400">ALERT</span>
                        <p className="text-sm text-slate-300 mt-1">다크풀 · 이상거래</p>
                    </div>
                    <div className="p-3 rounded-xl bg-cyan-900/20 border border-cyan-500/20 text-center">
                        <span className="text-sm font-black text-cyan-400">WHALE</span>
                        <p className="text-sm text-slate-300 mt-1">고래 매매 감지</p>
                    </div>
                </div>
            </section>
        </HowItWorksLayout>
    );
}
