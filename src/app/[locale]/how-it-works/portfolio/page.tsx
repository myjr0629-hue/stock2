import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import {
    Wallet, DollarSign, TrendingUp, Target, BarChart3,
    ArrowRightLeft, Lightbulb, AlertTriangle, Zap, Clock,
    Layers, Activity, ChevronRight, PieChart, Gauge, TreePine,
    ArrowUpDown, Plus, Pencil, Trash2, Shield, Brain, Crosshair
} from 'lucide-react';

export default async function PortfolioGuidePage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations('portfolioGuide');

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
        emerald: (chunks: React.ReactNode) => <span className="text-emerald-400 font-semibold">{chunks}</span>,
        purple: (chunks: React.ReactNode) => <span className="text-purple-400 font-semibold">{chunks}</span>,
    };

    const glassCard = "relative overflow-hidden rounded-2xl border border-white/[0.12] p-5 bg-slate-900/60";
    const glassBg = "bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent";

    const mainImg = locale === 'ko' ? '/guide/portfolio-main-crop.png' : `/guide/portfolio-main-crop-${locale}.png`;

    return (
        <HowItWorksLayout title="PORTFOLIO" subtitle={t('subtitle')}>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 1: Overview + Hero Screenshot                     */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-[13px] text-cyan-400 font-medium uppercase tracking-wider">{t('overviewTagline')}</p>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t.rich('overviewDesc', richTags)}
                </p>

                {/* Feature Pills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <div className="w-5 h-5 rounded-md bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-[11px] font-black text-cyan-400">{i}</span>
                            </div>
                            <span className="text-[13px] text-slate-300 leading-relaxed">{t(`overviewFeature${i}` as any)}</span>
                        </div>
                    ))}
                </div>

                {/* Hero Screenshot */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-cyan-500/[0.03] pointer-events-none" />
                    <Image
                        src={mainImg}
                        alt="Portfolio Full View"
                        width={2048}
                        height={1200}
                        quality={85}
                        className="w-full h-auto relative"
                        loading="lazy"
                    />
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 2: Stats Dashboard                                */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('statsTitle')}</h3>
                        <p className="text-[13px] text-emerald-400 font-medium uppercase tracking-wider">{t('statsTagline')}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                        <span className="text-[12px] font-bold text-emerald-300">5 KPIs</span>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t('statsDesc')}</p>

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
                                <div><h4 className="text-base font-black text-white">{t('stats.totalValue')}</h4></div>
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
                                <div><h4 className="text-base font-black text-white">{t('stats.totalCost')}</h4></div>
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
                                <div><h4 className="text-base font-black text-white">{t('stats.returnRate')}</h4></div>
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
                                <div><h4 className="text-base font-black text-white">{t('stats.portfolioScore')}</h4></div>
                            </div>
                            <p className="text-[14px] text-slate-300 leading-relaxed">{t('stats.portfolioScoreDesc')}</p>
                        </div>
                    </div>
                </div>

                {/* Market Status */}
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

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 3: Analytics Dashboard (NEW)                      */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                            <BarChart3 size={18} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">{t('analyticsTitle')}</h3>
                            <p className="text-[13px] text-indigo-400 font-medium uppercase tracking-wider">{t('analyticsTagline')}</p>
                        </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-xs font-bold text-indigo-300">NEW</span>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('analyticsDesc', richTags)}</p>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Sector Donut */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-cyan-500/[0.05] blur-3xl pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                                    <PieChart size={14} className="text-white" />
                                </div>
                                <h4 className="text-sm font-bold text-white">{t('analytics.sectorTitle')}</h4>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30 text-cyan-300">{t('analytics.sectorBadge')}</span>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('analytics.sectorDesc', richTags)}</p>
                            {/* Mini Donut Mockup */}
                            <div className="flex justify-center py-2">
                                <svg width="90" height="90" viewBox="0 0 90 90">
                                    <circle cx="45" cy="45" r="35" fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth="12" />
                                    <circle cx="45" cy="45" r="35" fill="none" stroke="#06b6d4" strokeWidth="12" strokeDasharray="88 132" strokeDashoffset="0" transform="rotate(-90 45 45)" />
                                    <circle cx="45" cy="45" r="35" fill="none" stroke="#8b5cf6" strokeWidth="12" strokeDasharray="44 176" strokeDashoffset="-88" transform="rotate(-90 45 45)" />
                                    <circle cx="45" cy="45" r="35" fill="none" stroke="#f59e0b" strokeWidth="12" strokeDasharray="33 187" strokeDashoffset="-132" transform="rotate(-90 45 45)" />
                                    <circle cx="45" cy="45" r="35" fill="none" stroke="#10b981" strokeWidth="12" strokeDasharray="55 165" strokeDashoffset="-165" transform="rotate(-90 45 45)" />
                                </svg>
                            </div>
                            <div className="p-2 rounded-lg bg-amber-900/15 border border-amber-500/15">
                                <p className="text-[11px] text-amber-200/80 leading-relaxed">💡 {t('analytics.sectorTip')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Risk Gauge */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -left-6 -bottom-6 w-28 h-28 rounded-full bg-emerald-500/[0.05] blur-3xl pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
                                    <Gauge size={14} className="text-white" />
                                </div>
                                <h4 className="text-sm font-bold text-white">{t('analytics.riskTitle')}</h4>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">{t('analytics.riskBadge')}</span>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('analytics.riskDesc', richTags)}</p>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-emerald-900/20 border border-emerald-500/15">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                                    <span className="text-[11px] text-slate-300">{t('analytics.riskHealthy')}</span>
                                </div>
                                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-amber-900/20 border border-amber-500/15">
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                                    <span className="text-[11px] text-slate-300">{t('analytics.riskCaution')}</span>
                                </div>
                                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-rose-900/20 border border-rose-500/15">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                                    <span className="text-[11px] text-slate-300">{t('analytics.riskWarning')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* P&L Treemap */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-amber-500/[0.05] blur-3xl pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
                                    <TreePine size={14} className="text-white" />
                                </div>
                                <h4 className="text-sm font-bold text-white">{t('analytics.treemapTitle')}</h4>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300">{t('analytics.treemapBadge')}</span>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('analytics.treemapDesc', richTags)}</p>
                            {/* Mini Treemap Mockup */}
                            <div className="grid grid-cols-4 grid-rows-3 gap-0.5 h-[80px] rounded-lg overflow-hidden">
                                <div className="col-span-2 row-span-2 bg-emerald-600/60 flex items-center justify-center"><span className="text-[10px] font-bold text-white/90">AAPL +8%</span></div>
                                <div className="col-span-1 row-span-1 bg-emerald-500/40 flex items-center justify-center"><span className="text-[9px] font-bold text-white/80">NVDA</span></div>
                                <div className="col-span-1 row-span-2 bg-rose-500/50 flex items-center justify-center"><span className="text-[9px] font-bold text-white/80">TSLA -3%</span></div>
                                <div className="col-span-1 row-span-1 bg-emerald-400/30 flex items-center justify-center"><span className="text-[9px] font-bold text-white/70">MSFT</span></div>
                                <div className="col-span-2 row-span-1 bg-rose-400/30 flex items-center justify-center"><span className="text-[9px] font-bold text-white/70">AMZN -1%</span></div>
                                <div className="col-span-2 row-span-1 bg-emerald-500/25 flex items-center justify-center"><span className="text-[9px] font-bold text-white/70">GOOGL +2%</span></div>
                            </div>
                            <div className="p-2 rounded-lg bg-amber-900/15 border border-amber-500/15">
                                <p className="text-[11px] text-amber-200/80 leading-relaxed">💡 {t('analytics.treemapTip')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 4: Holdings Table                                 */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('holdingsTitle')}</h3>
                        <p className="text-[13px] text-amber-400 font-medium uppercase tracking-wider">{t('holdingsTagline')}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                        <span className="text-[12px] font-bold text-amber-300">Premium</span>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('holdingsDesc', richTags)}</p>

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
                        { key: 'alpha', icon: <Brain size={14} className="text-cyan-400" />, color: 'cyan' },
                        { key: 'signal', icon: <Crosshair size={14} className="text-emerald-400" />, color: 'emerald' },
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

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 5: Context Score Engine (NEW)                     */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
                            <Brain size={18} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">{t('contextScoreTitle')}</h3>
                            <p className="text-[13px] text-amber-400 font-medium uppercase tracking-wider">{t('contextScoreTagline')}</p>
                        </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-300">CORE</span>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('contextScoreDesc', richTags)}</p>

                {/* 5-Pillar Cards */}
                <div className="space-y-3">
                    <h4 className="text-sm font-bold text-white tracking-wider">{t('contextScore.pillarTitle')}</h4>
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                        {([
                            { key: 'momentum', color: 'cyan', pts: '25' },
                            { key: 'structure', color: 'purple', pts: '25' },
                            { key: 'flow', color: 'emerald', pts: '25' },
                            { key: 'regime', color: 'amber', pts: '15' },
                            { key: 'catalyst', color: 'rose', pts: '10' },
                        ] as const).map(({ key, color, pts }) => (
                            <div key={key} className={`p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-[12px] font-black text-${color}-400 tracking-wider`}>
                                        {t(`contextScore.${key}` as any)}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                    {t(`contextScore.${key}Desc` as any)}
                                </p>
                                <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                                    <div className={`h-full rounded-full bg-${color}-500`} style={{ width: `${parseInt(pts)}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Grade Scale */}
                <div className="space-y-3">
                    <h4 className="text-sm font-bold text-white tracking-wider">{t('contextScore.gradeTitle')}</h4>
                    <div className="space-y-2">
                        {([
                            { grade: 'S', key: 'gradeS', bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/20' },
                            { grade: 'A', key: 'gradeA', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/20' },
                            { grade: 'B', key: 'gradeB', bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/20' },
                            { grade: 'C', key: 'gradeC', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/20' },
                            { grade: 'D', key: 'gradeD', bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/20' },
                            { grade: 'F', key: 'gradeF', bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/20' },
                        ] as const).map(({ grade, key, bg, text, border }) => (
                            <div key={grade} className="flex items-center gap-3">
                                <span className={`w-10 px-2 py-1 ${bg} ${text} font-bold text-[12px] rounded text-center border ${border}`}>{grade}</span>
                                <span className="text-slate-300 text-[13px]">{t(`contextScore.${key}` as any)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Safety Gates */}
                <div className={`${glassCard} ${glassBg}`}>
                    <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-rose-500/[0.05] blur-3xl pointer-events-none" />
                    <div className="relative space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-400 to-red-600 flex items-center justify-center">
                                <Shield size={14} className="text-white" />
                            </div>
                            <h4 className="text-sm font-bold text-white">{t('contextScore.gatesTitle')}</h4>
                        </div>
                        <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('contextScore.gatesDesc', richTags)}</p>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 6: Status Indicator & Action Protocol (NEW)       */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                            <Crosshair size={18} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">{t('signalActionTitle')}</h3>
                            <p className="text-[13px] text-emerald-400 font-medium uppercase tracking-wider">{t('signalActionTagline')}</p>
                        </div>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('signalActionDesc', richTags)}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Signal Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-2">
                                <h4 className="text-base font-black text-white">{t('signal.title')}</h4>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[12px] font-bold text-emerald-300">{t('signal.badge')}</span>
                            </div>
                            <p className="text-[14px] text-slate-300 leading-relaxed">{t('signal.desc')}</p>
                            <div className="space-y-3">
                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <span className="text-emerald-400 font-bold text-[14px]">BULLISH</span>
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

                    {/* Action Protocol Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-4">
                            <div className="flex items-center gap-2">
                                <h4 className="text-base font-black text-white">{t('action.title')}</h4>
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-[12px] font-bold text-amber-300">{t('action.badge')}</span>
                            </div>
                            <p className="text-[14px] text-slate-300 leading-relaxed">{t.rich('action.desc', richTags)}</p>
                            <div className="space-y-3">
                                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                    <span className="text-cyan-400 font-bold text-[14px]">▶ RUN</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('action.run')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                                    <span className="text-slate-300 font-bold text-[14px]">⏸ HOLD</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('action.hold')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <span className="text-amber-400 font-bold text-[14px]">💰 TAKE</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('action.take')}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                    <span className="text-rose-400 font-bold text-[14px]">⚠ EXIT</span>
                                    <p className="text-[13px] text-slate-300 mt-1">{t('action.exit')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 7: Currency Conversion                            */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{t('currencyTitle')}</h3>
                        <p className="text-[13px] text-cyan-400 font-medium uppercase tracking-wider">{t('currencyTagline')}</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30">
                        <span className="text-[12px] font-bold text-cyan-300">Locale-Aware</span>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('currencyDesc', richTags)}</p>



                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft size={16} className="text-amber-400" />
                                <h4 className="text-[14px] font-black text-white">{t('currency.toggle')}</h4>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-white/10 flex items-center gap-3">
                                <div><div className="text-[13px] font-bold text-emerald-400">+$1,422</div><div className="text-[12px] text-slate-500">USD</div></div>
                                <ArrowRightLeft size={14} className="text-cyan-400" />
                                <div><div className="text-[13px] font-bold text-emerald-400">+₩2,029,094</div><div className="text-[12px] text-slate-500">KRW</div></div>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed">{t('currency.toggleDesc')}</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                    <div className="grid grid-cols-3 gap-4 text-[13px]">
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-cyan-500" /><span className="text-slate-300 font-bold">{t('currency.koLabel')}</span></div>
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-rose-500" /><span className="text-slate-300 font-bold">{t('currency.jaLabel')}</span></div>
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-500" /><span className="text-slate-300 font-bold">{t('currency.enLabel')}</span></div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 8: Sort & Portfolio Management (NEW)              */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                            <ArrowUpDown size={18} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">{t('sortTitle')}</h3>
                            <p className="text-[13px] text-violet-400 font-medium uppercase tracking-wider">{t('sortTagline')}</p>
                        </div>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('sortDesc', richTags)}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Sort Modes */}
                    <div className={`${glassCard} ${glassBg}`}>
                        <div className="relative space-y-3">
                            <h4 className="text-sm font-bold text-white">{t('sort.sortTitle')}</h4>
                            <div className="space-y-1.5">
                                {(['default', 'alpha', 'change', 'profit', 'weight'] as const).map((key) => (
                                    <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                                        <ArrowUpDown size={12} className="text-violet-400" />
                                        <span className="text-[13px] text-slate-300">{t(`sort.${key}` as any)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* CRUD Operations */}
                    <div className="space-y-3">
                        <div className={`${glassCard} ${glassBg}`}>
                            <div className="relative space-y-2">
                                <div className="flex items-center gap-2">
                                    <Plus size={14} className="text-emerald-400" />
                                    <h4 className="text-sm font-bold text-white">{t('sort.addTitle')}</h4>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">{t('sort.addDesc')}</p>
                            </div>
                        </div>
                        <div className={`${glassCard} ${glassBg}`}>
                            <div className="relative space-y-2">
                                <div className="flex items-center gap-2">
                                    <Pencil size={14} className="text-amber-400" />
                                    <h4 className="text-sm font-bold text-white">{t('sort.editTitle')}</h4>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">{t('sort.editDesc')}</p>
                            </div>
                        </div>
                        <div className={`${glassCard} ${glassBg}`}>
                            <div className="relative space-y-2">
                                <div className="flex items-center gap-2">
                                    <Trash2 size={14} className="text-rose-400" />
                                    <h4 className="text-sm font-bold text-white">{t('sort.deleteTitle')}</h4>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">{t('sort.deleteDesc')}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-3 rounded-lg bg-cyan-900/20 border border-cyan-500/20 flex items-start gap-2">
                    <ChevronRight size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    <span className="text-[13px] text-cyan-200/90 leading-relaxed">{t('dashboardLink')}</span>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 9: Why This Portfolio Terminal (NEW)               */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('whyTitle')}</h3>
                    <p className="text-[13px] text-amber-400 font-medium uppercase tracking-wider">{t('whyTagline')}</p>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t('whyDesc')}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {([
                        { key: 1, icon: <Brain size={16} className="text-emerald-400" />, gradient: 'from-emerald-500/[0.06]' },
                        { key: 2, icon: <Gauge size={16} className="text-rose-400" />, gradient: 'from-rose-500/[0.06]' },
                        { key: 3, icon: <TreePine size={16} className="text-amber-400" />, gradient: 'from-amber-500/[0.06]' },
                        { key: 4, icon: <Crosshair size={16} className="text-cyan-400" />, gradient: 'from-cyan-500/[0.06]' },
                    ] as const).map(({ key, icon, gradient }) => (
                        <div key={key} className="relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5">
                            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} via-transparent to-transparent pointer-events-none`} />
                            <div className="relative space-y-3">
                                <div className="flex items-center gap-2">
                                    {icon}
                                    <h4 className="text-[14px] font-black text-white">{t(`why.point${key}Title` as any)}</h4>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich(`why.point${key}Desc` as any, richTags)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 9.5: Analysis Workflow (NEW)                      */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                        <Lightbulb size={18} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('strategy.title')}</h3>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('strategy.desc', richTags)}</p>

                <div className="space-y-3">
                    {([1, 2, 3, 4] as const).map((step) => (
                        <div key={step} className="relative overflow-hidden rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[13px] font-black text-white">{step}</span>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-[14px] font-bold text-white">{t(`strategy.step${step}.title` as any)}</h4>
                                    <p className="text-[13px] text-slate-300 leading-relaxed">{t(`strategy.step${step}.desc` as any)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Pro Tip */}
                <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <span className="text-[13px] text-amber-200/90 leading-relaxed">{t('proTip')}</span>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 10: Risk Disclaimer                               */}
            {/* ═══════════════════════════════════════════════════════════ */}
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
