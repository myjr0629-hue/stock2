import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

import { getTranslations } from 'next-intl/server';

export default async function PortfolioGuidePage() {
    const t = await getTranslations('portfolioGuide');

    return (
        <HowItWorksLayout
            title="PORTFOLIO"
            subtitle={t('subtitle')}
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Alpha Score */}
                <IndicatorCard
                    title="Alpha Score"
                    badge="0-100"
                    badgeColor="cyan"
                    meaning={t('cards.alphaScore.meaning')}
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-emerald-500/20 text-emerald-400 font-bold text-xs rounded text-center">A</span>
                                <span className="text-slate-400 text-sm">{t('cards.alphaScore.desc.a')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-cyan-500/20 text-cyan-400 font-bold text-xs rounded text-center">B</span>
                                <span className="text-slate-400 text-sm">{t('cards.alphaScore.desc.b')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-amber-500/20 text-amber-400 font-bold text-xs rounded text-center">C</span>
                                <span className="text-slate-400 text-sm">{t('cards.alphaScore.desc.c')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-orange-500/20 text-orange-400 font-bold text-xs rounded text-center">D</span>
                                <span className="text-slate-400 text-sm">{t('cards.alphaScore.desc.d')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-12 px-2 py-1 bg-rose-500/20 text-rose-400 font-bold text-xs rounded text-center">F</span>
                                <span className="text-slate-400 text-sm">{t('cards.alphaScore.desc.f')}</span>
                            </div>
                        </div>
                    }
                />

                {/* Signal Badge */}
                <IndicatorCard
                    title="Signal Badge"
                    badge={t('cards.signalBadge.badge')}
                    badgeColor="amber"
                    meaning={t('cards.signalBadge.meaning')}
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">ADD</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.signalBadge.add')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                <span className="text-cyan-400 font-bold">HOLD</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.signalBadge.hold')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <span className="text-amber-400 font-bold">WATCH</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.signalBadge.watch')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">TRIM</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.signalBadge.trim')}</p>
                            </div>
                        </div>
                    }
                />

                {/* Confidence */}
                <IndicatorCard
                    title="Confidence %"
                    badge={t('cards.confidence.badge')}
                    badgeColor="emerald"
                    meaning={t('cards.confidence.meaning')}
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-emerald-400 font-bold text-sm">80-100%</span>
                                <span className="text-slate-400 text-sm">{t('cards.confidence.high')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-amber-400 font-bold text-sm">60-79%</span>
                                <span className="text-slate-400 text-sm">{t('cards.confidence.mid')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-16 text-rose-400 font-bold text-sm">50-59%</span>
                                <span className="text-slate-400 text-sm">{t('cards.confidence.low')}</span>
                            </div>
                        </div>
                    }
                />

                {/* Sparkline */}
                <IndicatorCard
                    title="Sparkline Chart"
                    badge={t('cards.sparkline.badge')}
                    badgeColor="cyan"
                    meaning={t('cards.sparkline.meaning')}
                    interpretation={
                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm">
                                {t('cards.sparkline.descIntro')}
                            </p>
                            <ul className="space-y-1 text-sm text-slate-400">
                                <li>{t('cards.sparkline.uptrend')}</li>
                                <li>{t('cards.sparkline.downtrend')}</li>
                                <li>{t('cards.sparkline.sideways')}</li>
                            </ul>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
