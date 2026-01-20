import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import Image from 'next/image';

import { getTranslations } from 'next-intl/server';

export default async function GuardianGuidePage() {
    const t = await getTranslations('guardianGuide');

    return (
        <HowItWorksLayout
            title="GUARDIAN"
            subtitle={t('subtitle')}
        >
            {/* Value Indicator Banner */}
            <div className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-r from-emerald-900/30 to-transparent border border-emerald-500/20">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">{t('strategicValue.title')}</span>
                </div>
                <span className="text-sm text-slate-300">{t('strategicValue.desc')}</span>
            </div>

            {/* Gravity Gauge Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Screenshot */}
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                    <Image
                        src="/guide/guardian-gravity-gauge.png"
                        alt="Gravity Gauge"
                        width={400}
                        height={280}
                        className="w-full h-auto"
                    />
                </div>

                {/* Explanation */}
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">{t('gravityGauge.title')}</h3>
                        <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider">{t('gravityGauge.subtitle')}</p>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                        {t.rich('gravityGauge.desc', {
                            weak: (chunks) => <span className="text-rose-400 font-semibold">{chunks}</span>,
                            neutral: (chunks) => <span className="text-slate-400 font-semibold">{chunks}</span>,
                            strong: (chunks) => <span className="text-emerald-400 font-semibold">{chunks}</span>
                        })}
                    </p>

                    {/* Interpretation Scale */}
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('gravityGauge.interpretation')}</div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm bg-rose-500" />
                                    <span className="text-xs text-slate-300">0-40</span>
                                </div>
                                <span className="text-xs text-rose-400 font-medium">{t('gravityGauge.weak')}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm bg-slate-500" />
                                    <span className="text-xs text-slate-300">40-60</span>
                                </div>
                                <span className="text-xs text-slate-400 font-medium">{t('gravityGauge.neutral')}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                                    <span className="text-xs text-slate-300">60-100</span>
                                </div>
                                <span className="text-xs text-emerald-400 font-medium">{t('gravityGauge.strong')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Price & Flow Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">{t('priceFlow.title')}</h3>
                        <p className="text-xs text-amber-400 font-medium uppercase tracking-wider">{t('priceFlow.subtitle')}</p>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                        {t.rich('priceFlow.desc', {
                            warning: (chunks) => <span className="text-amber-400 font-semibold">{chunks}</span>,
                            opportunity: (chunks) => <span className="text-emerald-400 font-semibold">{chunks}</span>
                        })}
                    </p>

                    {/* RVOL Indicator */}
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('priceFlow.rvol.title')}</div>
                        <p className="text-xs text-slate-400">
                            {t.rich('priceFlow.rvol.desc', {
                                highlight: (chunks) => <span className="text-cyan-400">{chunks}</span>
                            })}
                        </p>
                    </div>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                    <Image
                        src="/guide/guardian-price-flow.png"
                        alt="Price and Flow"
                        width={400}
                        height={200}
                        className="w-full h-auto"
                    />
                </div>
            </section>

            {/* Flow Topography Map */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">{t('flowMap.title')}</h3>
                        <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">{t('flowMap.subtitle')}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30">
                        <span className="text-xs font-bold text-purple-300">Premium Feature</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Screenshot - Larger */}
                    <div className="lg:col-span-2 relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                        <Image
                            src="/guide/guardian-flow-map.png"
                            alt="Flow Topography Map"
                            width={600}
                            height={400}
                            className="w-full h-auto"
                        />
                    </div>

                    {/* Explanation */}
                    <div className="space-y-4">
                        <p className="text-sm text-slate-300 leading-relaxed">
                            {t('flowMap.desc')}
                        </p>

                        {/* Legend */}
                        <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5 space-y-3">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('flowMap.legend')}</div>
                            <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full border-2 border-cyan-400" />
                                    <span className="text-slate-300">{t('flowMap.border')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-1 bg-gradient-to-r from-cyan-400 to-amber-400" />
                                    <span className="text-slate-300">{t('flowMap.link')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-slate-300">{t('flowMap.pulse')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20">
                            <span className="text-xs text-amber-300">
                                {t('flowMap.tip')}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tactical Verdict Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                    <Image
                        src="/guide/guardian-tactical.png"
                        alt="Tactical Verdict"
                        width={400}
                        height={200}
                        className="w-full h-auto"
                    />
                </div>

                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">{t('tactical.title')}</h3>
                        <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">{t('tactical.subtitle')}</p>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                        {t.rich('tactical.desc', {
                            highlight: (chunks) => <span className="text-white font-semibold">{chunks}</span>
                        })}
                    </p>

                    {/* Action Guide */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-emerald-900/20 border border-emerald-500/20">
                            <div className="text-xs font-bold text-emerald-400 mb-1">BULLISH REGIME</div>
                            <div className="text-[11px] text-slate-400">{t('tactical.bullish')}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-rose-900/20 border border-rose-500/20">
                            <div className="text-xs font-bold text-rose-400 mb-1">BEARISH REGIME</div>
                            <div className="text-[11px] text-slate-400">{t('tactical.bearish')}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-800/50 border border-white/5 col-span-2">
                            <div className="text-xs font-bold text-slate-400 mb-1">NEUTRAL REGIME</div>
                            <div className="text-[11px] text-slate-400">{t('tactical.neutral')}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* RLSI Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-1">{t('rlsi.title')}</h3>
                        <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider">{t('rlsi.subtitle')}</p>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                        {t('rlsi.desc')}
                    </p>

                    <div className="p-4 rounded-lg bg-slate-800/50 border border-white/5">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('rlsi.alignment')}</div>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-emerald-400 font-bold">ALIGNMENT OK</span>
                                <span className="text-slate-400">{t('rlsi.ok')}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-amber-400 font-bold">PARTIAL</span>
                                <span className="text-slate-400">{t('rlsi.partial')}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-rose-400 font-bold">OFFLINE</span>
                                <span className="text-slate-400">{t('rlsi.offline')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                    <Image
                        src="/guide/guardian-rlsi.png"
                        alt="RLSI Market Essence"
                        width={400}
                        height={150}
                        className="w-full h-auto"
                    />
                </div>
            </section>
        </HowItWorksLayout>
    );
}
