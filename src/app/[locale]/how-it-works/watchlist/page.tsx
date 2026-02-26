import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';
import Image from 'next/image';
import { getTranslations, getLocale } from 'next-intl/server';
import {
    Star, TrendingUp, Activity, BarChart3, Target,
    Zap, Layers, Eye, ChevronRight, Lightbulb, AlertTriangle
} from 'lucide-react';

export default async function WatchlistGuidePage() {
    const t = await getTranslations('watchlistGuide');
    const locale = await getLocale();

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
        emerald: (chunks: React.ReactNode) => <span className="text-emerald-400 font-semibold">{chunks}</span>,
        green: (chunks: React.ReactNode) => <span className="text-emerald-400 font-bold">{chunks}</span>,
        red: (chunks: React.ReactNode) => <span className="text-rose-400 font-bold">{chunks}</span>,
    };

    // Language-specific screenshot
    const mainImg = `/guide/watchlist-main-${locale}.png`;

    return (
        <HowItWorksLayout
            title="WATCHLIST"
            subtitle={t('subtitle')}
        >
            {/* ═══ 1. Overview Section with Screenshot ═══ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-[12px] text-cyan-400 font-medium uppercase tracking-wider">Premium Monitoring Center</p>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t.rich('overviewDesc', richTags)}
                </p>

                {/* Watchlist Main Screenshot */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.04] via-transparent to-cyan-500/[0.03] pointer-events-none" />
                    <Image
                        src={mainImg}
                        alt="Watchlist Overview"
                        width={1470}
                        height={1068}
                        className="w-full h-auto relative"
                    />
                </div>
            </section>

            {/* ═══ 2. Summary Cards Row ═══ */}
            <section className="space-y-5 mt-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20">
                        <Layers className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('summaryTitle')}</h3>
                        <p className="text-[12px] text-slate-300">{t('summarySubtitle')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Count Card */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-white/[0.06] backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Star className="w-4 h-4 text-amber-400" />
                            <span className="text-[13px] font-semibold text-white">{t('summaryCards.count.title')}</span>
                        </div>
                        <p className="text-[13px] text-slate-300 leading-relaxed">{t('summaryCards.count.desc')}</p>
                    </div>
                    {/* Gainers/Losers Card */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-white/[0.06] backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                            <span className="text-[13px] font-semibold text-white">{t('summaryCards.gainers.title')}</span>
                        </div>
                        <p className="text-[13px] text-slate-300 leading-relaxed">{t('summaryCards.gainers.desc')}</p>
                    </div>
                    {/* Avg Alpha Card */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-white/[0.06] backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Target className="w-4 h-4 text-cyan-400" />
                            <span className="text-[13px] font-semibold text-white">{t('summaryCards.avgAlpha.title')}</span>
                        </div>
                        <p className="text-[13px] text-slate-300 leading-relaxed">{t('summaryCards.avgAlpha.desc')}</p>
                    </div>
                    {/* Session Card */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-white/[0.06] backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-purple-400" />
                            <span className="text-[13px] font-semibold text-white">{t('summaryCards.session.title')}</span>
                        </div>
                        <p className="text-[13px] text-slate-300 leading-relaxed">{t('summaryCards.session.desc')}</p>
                    </div>
                </div>
            </section>

            {/* ═══ 3. Column Indicators ═══ */}
            <section className="space-y-5 mt-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
                        <BarChart3 className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('columnTitle')}</h3>
                        <p className="text-[12px] text-slate-300">{t('columnSubtitle')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Alpha Column */}
                    <IndicatorCard
                        title={t('cards.alphaColumn.title')}
                        badge={t('cards.alphaColumn.badge')}
                        badgeColor="cyan"
                        meaning={t('cards.alphaColumn.meaning')}
                        interpretation={
                            <p className="text-[13px] text-slate-300">
                                {t.rich('cards.alphaColumn.desc', richTags)}
                            </p>
                        }
                    />

                    {/* Whale Index */}
                    <IndicatorCard
                        title={t('cards.whaleIndex.title')}
                        badge={t('cards.whaleIndex.badge')}
                        badgeColor="amber"
                        meaning={t('cards.whaleIndex.meaning')}
                        interpretation={
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-emerald-400 font-bold text-[13px]">60+</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.whaleIndex.high')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-amber-400 font-bold text-[13px]">40-59</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.whaleIndex.mid')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-rose-400 font-bold text-[13px]">0-39</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.whaleIndex.low')}</span>
                                </div>
                            </div>
                        }
                    />

                    {/* Signal Column */}
                    <IndicatorCard
                        title={t('cards.signal.title')}
                        badge={t('cards.signal.badge')}
                        badgeColor="emerald"
                        meaning={t('cards.signal.meaning')}
                        interpretation={
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[12px]">BUY</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.signal.buy')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold text-[12px]">STRONG_BUY</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.signal.strongBuy')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold text-[12px]">HOLD</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.signal.hold')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold text-[12px]">WATCH</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.signal.watch')}</span>
                                </div>
                            </div>
                        }
                    />

                    {/* IV Column */}
                    <IndicatorCard
                        title={t('cards.iv.title')}
                        badge={t('cards.iv.badge')}
                        badgeColor="purple"
                        meaning={t('cards.iv.meaning')}
                        interpretation={
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-rose-400 font-bold text-[13px]">60%+</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.iv.high')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-amber-400 font-bold text-[13px]">30-60%</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.iv.mid')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-emerald-400 font-bold text-[13px]">30%-</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.iv.low')}</span>
                                </div>
                            </div>
                        }
                    />

                    {/* RSI */}
                    <IndicatorCard
                        title={t('cards.rsi.title')}
                        badge={t('cards.rsi.badge')}
                        badgeColor="emerald"
                        meaning={t('cards.rsi.meaning')}
                        interpretation={
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-rose-400 font-bold text-[13px]">70+</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.rsi.overbought')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-white font-bold text-[13px]">30-70</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.rsi.neutral')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-16 text-emerald-400 font-bold text-[13px]">30-</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.rsi.oversold')}</span>
                                </div>
                            </div>
                        }
                    />

                    {/* GammaFlip Column */}
                    <IndicatorCard
                        title={t('cards.gammaFlip.title')}
                        badge={t('cards.gammaFlip.badge')}
                        badgeColor="rose"
                        meaning={t('cards.gammaFlip.meaning')}
                        interpretation={
                            <div className="space-y-3">
                                <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                                    <span className="text-white font-bold text-[13px]">$XXX</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('cards.gammaFlip.flipDesc')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                    <span className="text-rose-400 font-bold text-[13px]">SHORT</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('cards.gammaFlip.shortDesc')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <span className="text-emerald-400 font-bold text-[13px]">LONG</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('cards.gammaFlip.longDesc')}</p>
                                </div>
                            </div>
                        }
                    />

                    {/* 3D Return */}
                    <IndicatorCard
                        title={t('cards.return3d.title')}
                        badge={t('cards.return3d.badge')}
                        badgeColor="cyan"
                        meaning={t('cards.return3d.meaning')}
                        interpretation={
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-emerald-400 font-bold text-[13px]">+3.0% 3D</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.return3d.positive')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-rose-400 font-bold text-[13px]">-2.1% 3D</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.return3d.negative')}</span>
                                </div>
                            </div>
                        }
                    />

                    {/* MaxPain */}
                    <IndicatorCard
                        title={t('cards.maxPain.title')}
                        badge={t('cards.maxPain.badge')}
                        badgeColor="cyan"
                        meaning={t('cards.maxPain.meaning')}
                        interpretation={
                            <div className="space-y-2">
                                <p className="text-slate-300 text-[13px]">
                                    {t('cards.maxPain.descIntro')}
                                </p>
                                <div className="flex items-center gap-3">
                                    <span className="text-emerald-400 font-bold text-[13px]">↑ +2.5%</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.maxPain.upside')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-rose-400 font-bold text-[13px]">↓ -1.8%</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.maxPain.downside')}</span>
                                </div>
                            </div>
                        }
                    />

                    {/* GEX Column */}
                    <IndicatorCard
                        title={t('cards.gex.title')}
                        badge={t('cards.gex.badge')}
                        badgeColor="amber"
                        meaning={t('cards.gex.meaning')}
                        interpretation={
                            <div className="space-y-3">
                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <span className="text-emerald-400 font-bold text-[13px]">LONG (+$X.XM)</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('cards.gex.longDesc')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                    <span className="text-rose-400 font-bold text-[13px]">SHORT (-$X.XM)</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('cards.gex.shortDesc')}</p>
                                </div>
                            </div>
                        }
                    />

                    {/* Sort Modes */}
                    <IndicatorCard
                        title={t('cards.sort.title')}
                        badge={t('cards.sort.badge')}
                        badgeColor="purple"
                        meaning={t('cards.sort.meaning')}
                        interpretation={
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold text-[12px]">Default</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.sort.default')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold text-[12px]">Alpha</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.sort.alpha')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[12px]">Change%</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.sort.change')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold text-[12px]">Whale</span>
                                    <span className="text-slate-300 text-[13px]">{t('cards.sort.whale')}</span>
                                </div>
                            </div>
                        }
                    />
                </div>
            </section>

            {/* ═══ 4. Pro Tip ═══ */}
            <section className="mt-10">
                <div className="relative p-6 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-600/5 to-transparent border border-amber-500/20 backdrop-blur-md overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
                            <Lightbulb className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h4 className="text-[14px] font-bold text-amber-300 mb-2">PRO TIP</h4>
                            <p className="text-[14px] text-slate-300 leading-relaxed">
                                {t('proTip')}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ 5. Investment Risk Disclaimer ═══ */}
            <section className="mt-10">
                <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-500/25 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <h4 className="text-[14px] font-bold text-amber-300 mb-1">{t('warningTitle')}</h4>
                        <p className="text-[14px] text-amber-200/80 leading-relaxed">{t('warningDesc')}</p>
                    </div>
                </div>
            </section>
        </HowItWorksLayout>
    );
}
