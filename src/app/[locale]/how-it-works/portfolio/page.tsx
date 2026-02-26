import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import {
    Wallet, DollarSign, TrendingUp, Target, BarChart3,
    ArrowRightLeft, Lightbulb, AlertTriangle, Zap, Clock,
    Layers, Activity, ChevronRight
} from 'lucide-react';

export default async function PortfolioGuidePage() {
    const t = await getTranslations('portfolioGuide');

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
        emerald: (chunks: React.ReactNode) => <span className="text-emerald-400 font-semibold">{chunks}</span>,
        purple: (chunks: React.ReactNode) => <span className="text-purple-400 font-semibold">{chunks}</span>,
    };

    return (
        <HowItWorksLayout
            title="PORTFOLIO"
            subtitle={t('subtitle')}
        >
            {/* ═══ 1. Overview Section with Full Screenshot ═══ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-[12px] text-cyan-400 font-medium uppercase tracking-wider">Portfolio Management Center</p>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t.rich('overviewDesc', richTags)}
                </p>

                {/* Full Portfolio Screenshot */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-cyan-500/[0.03] pointer-events-none" />
                    <Image
                        src="/guide/portfolio-main-crop.png"
                        alt="Portfolio Full View"
                        width={1200}
                        height={740}
                        className="w-full h-auto relative"
                    />
                </div>
            </section>

            {/* ═══ 2. Stats Dashboard Section ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('statsTitle')}</h3>
                        <p className="text-[12px] text-emerald-400 font-medium uppercase tracking-wider">Real-Time Metrics</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                        <span className="text-[12px] font-bold text-emerald-300">5 Indicators</span>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t('statsDesc')}
                </p>

                {/* Stats Cards Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Total Value */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl bg-slate-900/80 px-4 py-3 border border-white/15 shadow-lg shadow-cyan-500/10 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Wallet size={12} className="text-cyan-400" />
                                        <span className="text-[12px] font-bold text-slate-300 tracking-wider">{t('stats.totalValue')}</span>
                                    </div>
                                    <div className="text-2xl font-black text-white tracking-tight">$132,464</div>
                                    <div className="text-[12px] font-bold text-slate-200 mt-0.5">≈ ₩188,745,304</div>
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white">{t('stats.totalValue')}</h4>
                                </div>
                            </div>
                            <p className="text-[14px] text-slate-300 leading-relaxed">{t('stats.totalValueDesc')}</p>
                        </div>
                    </div>

                    {/* Total Cost */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl bg-slate-900/80 px-4 py-3 border border-white/15 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <DollarSign size={12} className="text-slate-300" />
                                        <span className="text-[12px] font-bold text-slate-300 tracking-wider">{t('stats.totalCost')}</span>
                                    </div>
                                    <div className="text-2xl font-black text-white tracking-tight">$130,931</div>
                                    <div className="text-[12px] font-bold text-slate-200 mt-0.5">≈ ₩186,560,963</div>
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white">{t('stats.totalCost')}</h4>
                                </div>
                            </div>
                            <p className="text-[14px] text-slate-300 leading-relaxed">{t('stats.totalCostDesc')}</p>
                        </div>
                    </div>

                    {/* Return Rate */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl bg-slate-900/80 px-4 py-3 border border-white/15 shadow-lg shadow-emerald-500/10 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <TrendingUp size={12} className="text-emerald-400" />
                                        <span className="text-[12px] font-bold text-slate-300 tracking-wider">{t('stats.returnRate')}</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-emerald-400 tracking-tight">+1.17%</span>
                                        <span className="text-[13px] font-bold text-emerald-400">↗ $1,533</span>
                                    </div>
                                    <div className="text-[12px] font-bold text-slate-200 mt-0.5">≈ +₩2,184,341</div>
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white">{t('stats.returnRate')}</h4>
                                </div>
                            </div>
                            <p className="text-[14px] text-slate-300 leading-relaxed">{t('stats.returnRateDesc')}</p>
                        </div>
                    </div>

                    {/* Portfolio Score */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl bg-slate-900/80 px-4 py-3 border border-white/15 shadow-lg shadow-amber-500/10 min-w-[160px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Target size={12} className="text-amber-400" />
                                        <span className="text-[12px] font-bold text-slate-300 tracking-wider">{t('stats.portfolioScore')}</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <div className="w-10 h-10 rounded-full border-2 border-cyan-400 flex items-center justify-center">
                                            <span className="text-[12px] font-black text-cyan-400">B</span>
                                        </div>
                                        <span className="text-2xl font-black text-white tracking-tight">70</span>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white">{t('stats.portfolioScore')}</h4>
                                </div>
                            </div>
                            <p className="text-[14px] text-slate-300 leading-relaxed">{t('stats.portfolioScoreDesc')}</p>
                        </div>
                    </div>
                </div>

                {/* Market Status Mini Card */}
                <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500/[0.04] via-transparent to-transparent pointer-events-none" />
                    <div className="relative flex items-center gap-4">
                        <div className="rounded-xl bg-slate-900/80 px-4 py-3 border border-white/15 min-w-[160px]">
                            <div className="flex items-center gap-1.5 mb-1">
                                <Clock size={12} className="text-emerald-400" />
                                <span className="text-[12px] font-bold text-slate-300 tracking-wider">{t('stats.marketStatus')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-lg font-black text-white">PRE-MARKET</span>
                            </div>
                            <div className="text-[12px] text-slate-400 mt-0.5">07:44 ET · Regular opens 1h 46m</div>
                        </div>
                        <p className="text-[14px] text-slate-300 leading-relaxed">{t('stats.marketStatusDesc')}</p>
                    </div>
                </div>
            </section>

            {/* ═══ 3. Holdings Card Columns ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('holdingsTitle')}</h3>
                        <p className="text-[12px] text-amber-400 font-medium uppercase tracking-wider">12 Data Columns</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                        <span className="text-[12px] font-bold text-amber-300">Premium</span>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t('holdingsDesc')}
                </p>

                {/* Column Grid — 3 columns layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                        { key: 'ticker', icon: <Layers size={14} className="text-cyan-400" />, color: 'cyan' },
                        { key: 'chart', icon: <Activity size={14} className="text-emerald-400" />, color: 'emerald' },
                        { key: 'avgPrice', icon: <DollarSign size={14} className="text-slate-300" />, color: 'slate' },
                        { key: 'currentPrice', icon: <TrendingUp size={14} className="text-cyan-400" />, color: 'cyan' },
                        { key: 'quantity', icon: <BarChart3 size={14} className="text-slate-300" />, color: 'slate' },
                        { key: 'profitLoss', icon: <Zap size={14} className="text-emerald-400" />, color: 'emerald' },
                        { key: 'today', icon: <Clock size={14} className="text-amber-400" />, color: 'amber' },
                        { key: 'weight', icon: <Target size={14} className="text-purple-400" />, color: 'purple' },
                        { key: 'daysHeld', icon: <Clock size={14} className="text-slate-300" />, color: 'slate' },
                        { key: 'alpha', icon: <Zap size={14} className="text-cyan-400" />, color: 'cyan' },
                        { key: 'signal', icon: <Target size={14} className="text-emerald-400" />, color: 'emerald' },
                        { key: 'action', icon: <ChevronRight size={14} className="text-amber-400" />, color: 'amber' },
                    ].map(({ key, icon, color }) => (
                        <div key={key} className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-1.5">
                            <div className="flex items-center gap-2">
                                {icon}
                                <span className={`text-[13px] font-bold text-${color === 'slate' ? 'slate-300' : `${color}-400`}`}>
                                    {t(`columns.${key}` as any)}
                                </span>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">
                                {t(`columns.${key}Desc` as any)}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ═══ 4. Currency Conversion Section ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('currencyTitle')}</h3>
                        <p className="text-[12px] text-cyan-400 font-medium uppercase tracking-wider">KRW · JPY · USD</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30">
                        <span className="text-[12px] font-bold text-cyan-300">Locale-Aware</span>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t('currencyDesc')}
                </p>

                {/* Currency Screenshot — KRW mode */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.04] via-transparent to-emerald-500/[0.03] pointer-events-none" />
                    <Image
                        src="/guide/portfolio-krw-crop.png"
                        alt="Portfolio KRW Conversion Mode"
                        width={1200}
                        height={740}
                        className="w-full h-auto relative"
                    />
                </div>

                {/* Currency Features Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Exchange Rate Badge */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft size={16} className="text-cyan-400" />
                                <h4 className="text-[14px] font-black text-white">{t('currency.badge')}</h4>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-white/10 flex items-center gap-2">
                                <ArrowRightLeft size={12} className="text-slate-300" />
                                <span className="text-[13px] font-bold text-white">$1 = ₩1,427</span>
                                <span className="text-[13px] font-bold text-rose-400">-0.06%</span>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t('currency.badgeDesc')}</p>
                        </div>
                    </div>

                    {/* Converted Amount */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <DollarSign size={16} className="text-emerald-400" />
                                <h4 className="text-[14px] font-black text-white">{t('currency.subText')}</h4>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-white/10">
                                <div className="text-lg font-black text-white">$132,464</div>
                                <div className="text-[13px] font-bold text-slate-200">≈ ₩188,745,304</div>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t('currency.subTextDesc')}</p>
                        </div>
                    </div>

                    {/* Currency Toggle */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft size={16} className="text-amber-400" />
                                <h4 className="text-[14px] font-black text-white">{t('currency.toggle')}</h4>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-white/10 flex items-center gap-3">
                                <div>
                                    <div className="text-[13px] font-bold text-emerald-400">+$1,422</div>
                                    <div className="text-[12px] text-slate-500">USD</div>
                                </div>
                                <ArrowRightLeft size={14} className="text-cyan-400" />
                                <div>
                                    <div className="text-[13px] font-bold text-emerald-400">+₩2,029,094</div>
                                    <div className="text-[12px] text-slate-500">KRW</div>
                                </div>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t('currency.toggleDesc')}</p>
                        </div>
                    </div>
                </div>

                {/* Locale Availability */}
                <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                    <div className="grid grid-cols-3 gap-4 text-[13px]">
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                            <span className="text-slate-300 font-bold">{t('currency.koLabel')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                            <span className="text-slate-300 font-bold">{t('currency.jaLabel')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                            <span className="text-slate-300 font-bold">{t('currency.enLabel')}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ 5. Alpha Score & Signal Section ═══ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('alphaTitle')}</h3>
                        <p className="text-[12px] text-amber-400 font-medium uppercase tracking-wider">AI-Powered Analysis</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                        <span className="text-[12px] font-bold text-amber-300">Premium</span>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t('alphaDesc')}
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Alpha Score Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-2">
                                <h4 className="text-base font-black text-white">{t('alpha.scoreTitle')}</h4>
                                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-[12px] font-bold text-cyan-300">{t('alpha.scoreBadge')}</span>
                            </div>
                            <p className="text-[14px] text-slate-300 leading-relaxed">{t('alpha.scoreDesc')}</p>
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="w-12 px-2 py-1 bg-emerald-500/20 text-emerald-400 font-bold text-[12px] rounded text-center">A</span>
                                    <span className="text-slate-300 text-[13px]">{t('alpha.a')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-12 px-2 py-1 bg-cyan-500/20 text-cyan-400 font-bold text-[12px] rounded text-center">B</span>
                                    <span className="text-slate-300 text-[13px]">{t('alpha.b')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-12 px-2 py-1 bg-amber-500/20 text-amber-400 font-bold text-[12px] rounded text-center">C</span>
                                    <span className="text-slate-300 text-[13px]">{t('alpha.c')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-12 px-2 py-1 bg-orange-500/20 text-orange-400 font-bold text-[12px] rounded text-center">D</span>
                                    <span className="text-slate-300 text-[13px]">{t('alpha.d')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-12 px-2 py-1 bg-rose-500/20 text-rose-400 font-bold text-[12px] rounded text-center">F</span>
                                    <span className="text-slate-300 text-[13px]">{t('alpha.f')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Signal Badge Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-2">
                                <h4 className="text-base font-black text-white">{t('signal.title')}</h4>
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-[12px] font-bold text-amber-300">{t('signal.badge')}</span>
                            </div>
                            <p className="text-[14px] text-slate-300 leading-relaxed">{t('signal.desc')}</p>
                            <div className="space-y-3">
                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <span className="text-emerald-400 font-bold text-[14px]">BUY</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('signal.buy')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                    <span className="text-cyan-400 font-bold text-[14px]">HOLD</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('signal.hold')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <span className="text-amber-400 font-bold text-[14px]">WATCH</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('signal.watch')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                    <span className="text-rose-400 font-bold text-[14px]">TRIM</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('signal.trim')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pro Tip */}
                <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <span className="text-[13px] text-amber-200/90 leading-relaxed">
                        {t('proTip')}
                    </span>
                </div>
            </section>

            {/* ═══ 6. Investment Risk Disclaimer ═══ */}
            <section>
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
