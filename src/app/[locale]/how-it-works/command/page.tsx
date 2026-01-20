import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';

import { getTranslations } from 'next-intl/server';

export default async function CommandGuidePage() {
    const t = await getTranslations('commandGuide');

    return (
        <HowItWorksLayout
            title="COMMAND"
            subtitle={t('subtitle')}
        >
            {/* Grid of Indicator Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Gamma Flip Level */}
                <IndicatorCard
                    title="Gamma Flip Level"
                    badge={t('cards.gammaFlip.badge')}
                    badgeColor="cyan"
                    meaning={t('cards.gammaFlip.meaning')}
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">{t('cards.gammaFlip.longGammaTitle')}</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.gammaFlip.longGammaDesc')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <span className="text-rose-400 font-bold">{t('cards.gammaFlip.shortGammaTitle')}</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.gammaFlip.shortGammaDesc')}</p>
                            </div>
                        </div>
                    }
                    signals={[
                        { label: 'READY', description: t('cards.gammaFlip.signals.ready'), color: 'bg-emerald-500' },
                        { label: 'SHORT', description: t('cards.gammaFlip.signals.short'), color: 'bg-rose-500' },
                        { label: 'LONG', description: t('cards.gammaFlip.signals.long'), color: 'bg-emerald-500' },
                        { label: 'N/A', description: t('cards.gammaFlip.signals.na'), color: 'bg-slate-500' },
                    ]}
                />

                {/* Net GEX Engine */}
                <IndicatorCard
                    title="Net GEX Engine"
                    badge={t('cards.netGex.badge')}
                    badgeColor="amber"
                    meaning={t('cards.netGex.meaning')}
                    interpretation={
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-emerald-400 font-bold">{t('cards.netGex.stableTitle')}</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.netGex.stableDesc')}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <span className="text-amber-400 font-bold">{t('cards.netGex.volatileTitle')}</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.netGex.volatileDesc')}</p>
                            </div>
                        </div>
                    }
                />

                {/* Tactical Range */}
                <IndicatorCard
                    title="Tactical Range"
                    badge={t('cards.tacticalRange.badge')}
                    badgeColor="emerald"
                    meaning={t('cards.tacticalRange.meaning')}
                    interpretation={
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="w-20 text-rose-400 font-bold text-sm">RESIST</span>
                                <span className="text-slate-400 text-sm">{t('cards.tacticalRange.resist')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-20 text-cyan-400 font-bold text-sm">MAX PAIN</span>
                                <span className="text-slate-400 text-sm">{t('cards.tacticalRange.maxPain')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="w-20 text-emerald-400 font-bold text-sm">SUPPORT</span>
                                <span className="text-slate-400 text-sm">{t('cards.tacticalRange.support')}</span>
                            </div>
                        </div>
                    }
                />

                {/* 0DTE Impact & Squeeze Risk */}
                <IndicatorCard
                    title="0DTE Impact & Squeeze Risk"
                    badge={t('cards.risk.badge')}
                    badgeColor="rose"
                    meaning={t('cards.risk.meaning')}
                    interpretation={
                        <div className="space-y-3">
                            <div>
                                <span className="text-amber-400 font-bold text-sm">0DTE Impact</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.risk.impactDesc')}</p>
                            </div>
                            <div>
                                <span className="text-rose-400 font-bold text-sm">Squeeze Risk</span>
                                <p className="text-sm text-slate-400 mt-1">{t('cards.risk.squeezeDesc')}</p>
                            </div>
                        </div>
                    }
                />
            </div>
        </HowItWorksLayout>
    );
}
