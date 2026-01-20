import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

import { getTranslations } from 'next-intl/server';

export default async function WatchlistGuidePage() {
    const t = await getTranslations('watchlistGuide');

    return (
        <HowItWorksLayout
            title="WATCHLIST"
            subtitle={t('subtitle')}
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Alpha Column */}
                <IndicatorCard
                    title="Alpha 컬럼"
                    badge={t('cards.alphaColumn.badge')}
                    badgeColor="cyan"
                    meaning={t('cards.alphaColumn.meaning')}
                    interpretation={
                        <p className="text-slate-300">
                            {t.rich('cards.alphaColumn.desc', {
                                green: (chunks) => <span className="text-emerald-400 font-bold">{chunks}</span>,
                                red: (chunks) => <span className="text-rose-400 font-bold">{chunks}</span>
                            })}
                        </p>
                    }
                />

                {/* Whale Index */}
                <IndicatorCard
                    title="Whale Index"
                    badge={t('cards.whaleIndex.badge')}
                    badgeColor="amber"
                    meaning={t('cards.whaleIndex.meaning')}
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-emerald-400 font-bold text-sm">60+</span>
                                <span className="text-slate-400 text-sm">{t('cards.whaleIndex.high')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-amber-400 font-bold text-sm">40-59</span>
                                <span className="text-slate-400 text-sm">{t('cards.whaleIndex.mid')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-rose-400 font-bold text-sm">0-39</span>
                                <span className="text-slate-400 text-sm">{t('cards.whaleIndex.low')}</span>
                            </div>
                        </div>
                    }
                />

                {/* RSI */}
                <IndicatorCard
                    title="RSI (14)"
                    badge={t('cards.rsi.badge')}
                    badgeColor="emerald"
                    meaning={t('cards.rsi.meaning')}
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-rose-400 font-bold text-sm">70+</span>
                                <span className="text-slate-400 text-sm">{t('cards.rsi.overbought')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-white font-bold text-sm">30-70</span>
                                <span className="text-slate-400 text-sm">{t('cards.rsi.neutral')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-emerald-400 font-bold text-sm">30-</span>
                                <span className="text-slate-400 text-sm">{t('cards.rsi.oversold')}</span>
                            </div>
                        </div>
                    }
                />

                {/* GammaFlip Column */}
                <IndicatorCard
                    title="GammaFlip 컬럼"
                    badge={t('cards.gammaFlip.badge')}
                    badgeColor="rose"
                    meaning={t('cards.gammaFlip.meaning')}
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                                <span className="text-white font-bold">$XXX</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.gammaFlip.flipDesc')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">SHORT</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.gammaFlip.shortDesc')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">LONG</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.gammaFlip.longDesc')}</p>
                            </div>
                        </div>
                    }
                />

                {/* MaxPain */}
                <IndicatorCard
                    title="MaxPain 컬럼"
                    badge={t('cards.maxPain.badge')}
                    badgeColor="cyan"
                    meaning={t('cards.maxPain.meaning')}
                    interpretation={
                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm">
                                {t('cards.maxPain.descIntro')}
                            </p>
                            <div className="flex items-center gap-3">
                                <span className="text-emerald-400 font-bold text-sm">↑ +2.5%</span>
                                <span className="text-slate-400 text-sm">{t('cards.maxPain.upside')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-rose-400 font-bold text-sm">↓ -1.8%</span>
                                <span className="text-slate-400 text-sm">{t('cards.maxPain.downside')}</span>
                            </div>
                        </div>
                    }
                />

                {/* GEX Column */}
                <IndicatorCard
                    title="GEX 컬럼"
                    badge={t('cards.gex.badge')}
                    badgeColor="amber"
                    meaning={t('cards.gex.meaning')}
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">LONG (+$X.XM)</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.gex.longDesc')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">SHORT (-$X.XM)</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.gex.shortDesc')}</p>
                            </div>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
