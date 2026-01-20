import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

import { getTranslations } from 'next-intl/server';

export default async function FlowRadarGuidePage() {
    const t = await getTranslations('flowRadarGuide');

    return (
        <HowItWorksLayout
            title="Flow Radar"
            subtitle={t('subtitle')}
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Flow Sniper */}
                <IndicatorCard
                    title="Flow Sniper"
                    badge={t('cards.flowSniper.badge')}
                    badgeColor="cyan"
                    meaning={t('cards.flowSniper.meaning')}
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">BULLISH Flow</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.flowSniper.bullishDesc')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">BEARISH Flow</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.flowSniper.bearishDesc')}</p>
                            </div>
                        </div>
                    }
                    signals={[
                        { label: 'BULLISH', description: t('cards.flowSniper.signals.bullish'), color: 'bg-emerald-500' },
                        { label: 'BEARISH', description: t('cards.flowSniper.signals.bearish'), color: 'bg-rose-500' },
                        { label: 'NEUTRAL', description: t('cards.flowSniper.signals.neutral'), color: 'bg-slate-500' },
                    ]}
                />

                {/* Net Premium Flow */}
                <IndicatorCard
                    title="Net Premium Flow"
                    badge={t('cards.netPremium.badge')}
                    badgeColor="amber"
                    meaning={t('cards.netPremium.meaning')}
                    interpretation={
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold text-lg">+$2.5M</span>
                                <span className="text-sm text-slate-400">{t('cards.netPremium.callDesc')}</span>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold text-lg">-$1.8M</span>
                                <span className="text-sm text-slate-400">{t('cards.netPremium.putDesc')}</span>
                            </div>
                        </div>
                    }
                />

                {/* Volume Strength */}
                <IndicatorCard
                    title="Volume Strength"
                    badge={t('cards.volumeStrength.badge')}
                    badgeColor="emerald"
                    meaning={t('cards.volumeStrength.meaning')}
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-24 text-emerald-400 font-bold text-sm">ACTIVE</span>
                                <span className="text-slate-400 text-sm">{t('cards.volumeStrength.activeDesc')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-24 text-slate-400 font-bold text-sm">NORMAL</span>
                                <span className="text-slate-400 text-sm">{t('cards.volumeStrength.normalDesc')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-24 text-rose-400 font-bold text-sm">LOW</span>
                                <span className="text-slate-400 text-sm">{t('cards.volumeStrength.lowDesc')}</span>
                            </div>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
