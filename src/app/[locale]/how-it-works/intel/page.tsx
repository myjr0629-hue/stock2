import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

import { getTranslations } from 'next-intl/server';

export default async function IntelGuidePage() {
    const t = await getTranslations('intelGuide');

    return (
        <HowItWorksLayout
            title="INTEL"
            subtitle={t('subtitle')}
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AI Rumor */}
                <IndicatorCard
                    title="AI Rumor"
                    badge={t('cards.aiRumor.badge')}
                    badgeColor="purple"
                    meaning={t('cards.aiRumor.meaning')}
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">✓ Clean</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.aiRumor.clean')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <span className="text-amber-400 font-bold">⚠ Unverified</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.aiRumor.unverified')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">✗ False</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.aiRumor.false')}</p>
                            </div>
                        </div>
                    }
                />

                {/* Intel Feed */}
                <IndicatorCard
                    title="Intel Feed"
                    badge={t('cards.intelFeed.badge')}
                    badgeColor="cyan"
                    meaning={t('cards.intelFeed.meaning')}
                    interpretation={
                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm">
                                {t('cards.intelFeed.descIntro')}
                            </p>
                            <ul className="space-y-2 text-sm text-slate-400">
                                <li className="flex items-start gap-2">
                                    <span className="text-cyan-400">•</span>
                                    <span><strong className="text-white">{t('cards.intelFeed.source')}</strong> - {t('cards.intelFeed.sourceDesc')}</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-cyan-400">•</span>
                                    <span><strong className="text-white">{t('cards.intelFeed.summary')}</strong> - {t('cards.intelFeed.summaryDesc')}</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-cyan-400">•</span>
                                    <span><strong className="text-white">{t('cards.intelFeed.related')}</strong> - {t('cards.intelFeed.relatedDesc')}</span>
                                </li>
                            </ul>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
