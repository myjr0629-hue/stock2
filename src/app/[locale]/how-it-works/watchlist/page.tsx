import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { IndicatorCard } from '@/components/IndicatorCard';
import Image from 'next/image';
import { getTranslations, getLocale } from 'next-intl/server';
import {
    Star, TrendingUp, TrendingDown, Activity, BarChart3, Target,
    Zap, Layers, Eye, ChevronRight, Lightbulb, AlertTriangle,
    Shield, Lock, Crown, Tag, FolderPlus, ArrowUpRight, ArrowDownRight,
    Search, LayoutDashboard, Gauge, Grid3X3, Brain,
} from 'lucide-react';

export default async function WatchlistGuidePage() {
    const t = await getTranslations('watchlistGuide');
    const locale = await getLocale();

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
        emerald: (chunks: React.ReactNode) => <span className="text-emerald-400 font-semibold">{chunks}</span>,
        purple: (chunks: React.ReactNode) => <span className="text-purple-400 font-semibold">{chunks}</span>,
        green: (chunks: React.ReactNode) => <span className="text-emerald-400 font-bold">{chunks}</span>,
        red: (chunks: React.ReactNode) => <span className="text-rose-400 font-bold">{chunks}</span>,
    };

    const mainImg = `/guide/watchlist-main-${locale}.png`;
    const glassCard = "relative overflow-hidden rounded-2xl border border-white/[0.12] p-5 bg-slate-900/60";

    return (
        <HowItWorksLayout
            title="WATCHLIST"
            subtitle={t('subtitle')}
        >
            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 1: Overview + Full Screenshot                     */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-[13px] text-amber-400 font-medium uppercase tracking-wider">Premium Intelligence Monitoring</p>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">
                    {t.rich('overviewDesc', richTags)}
                </p>

                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.04] via-transparent to-cyan-500/[0.03] pointer-events-none" />
                    <Image
                        src={mainImg}
                        alt="Watchlist Overview"
                        width={1470}
                        height={1068}
                        className="w-full h-auto relative"
                        loading="lazy"
                    />
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 2: Stats Dashboard — Inline SVG Mockup            */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5 mt-12">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/25 to-orange-600/15 flex items-center justify-center border border-amber-500/25 shadow-lg shadow-amber-500/10">
                            <Gauge size={18} className="text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">{t('statsTitle')}</h3>
                            <p className="text-[13px] text-slate-400 font-medium">{t('statsSubtitle')}</p>
                        </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-xs font-bold text-cyan-300">REAL-TIME</span>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('statsDesc', richTags)}</p>

                {/* ── StatsBar SVG Mockup ── */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-slate-800/30 border border-slate-700/30 overflow-hidden">
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4">
                        {/* Total + Avg Change */}
                        <div className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-3xl font-black text-white tabular-nums tracking-tight">27</span>
                                <Activity className="w-4 h-4 text-amber-400/60" />
                            </div>
                            <div className="text-[11px] text-slate-400 uppercase tracking-[0.15em] font-bold mt-1">WATCHLIST</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">AVG CHANGE</span>
                                <span className="text-lg font-black tabular-nums text-emerald-400">+1.24%</span>
                            </div>
                            <svg className="absolute right-0 top-0 w-28 h-full opacity-[0.07]" viewBox="0 0 100 60" preserveAspectRatio="none">
                                <polyline points="0,30 15,30 20,10 25,50 30,20 35,40 40,30 55,30 60,15 65,45 70,25 75,35 80,30 100,30" fill="none" stroke="#f59e0b" strokeWidth="2" />
                            </svg>
                        </div>

                        {/* Gainers / Losers */}
                        <div className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /><span className="text-xl font-black text-emerald-400 tabular-nums">18</span></div>
                                <div className="w-px h-5 bg-white/[0.06]" />
                                <div className="flex items-center gap-1"><ArrowDownRight className="w-3.5 h-3.5 text-rose-400" /><span className="text-xl font-black text-rose-400 tabular-nums">9</span></div>
                            </div>
                            <div className="text-[11px] text-slate-400 uppercase tracking-[0.15em] font-bold mt-1.5">GAINERS / LOSERS</div>
                            <div className="mt-2 h-1.5 rounded-full bg-slate-800/80 overflow-hidden flex">
                                <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-full" style={{ width: '67%' }} />
                                <div className="bg-gradient-to-r from-rose-400 to-rose-500 rounded-r-full ml-auto" style={{ width: '33%' }} />
                            </div>
                        </div>

                        {/* Avg Alpha Score */}
                        <div className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4">
                            <div className="flex items-center gap-3">
                                <div className="relative w-11 h-11 flex-shrink-0">
                                    <svg className="w-11 h-11 -rotate-90">
                                        <circle cx="22" cy="22" r="15" fill="none" stroke="#1e293b" strokeWidth="3" />
                                        <circle cx="22" cy="22" r="15" fill="none" stroke="#22d3ee" strokeWidth="3"
                                            strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="26.39" />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-cyan-400">B</div>
                                </div>
                                <div>
                                    <div className="text-xl font-black text-white tabular-nums">72</div>
                                    <div className="text-[11px] text-slate-400 uppercase tracking-[0.15em] font-bold">AVG SCORE</div>
                                </div>
                            </div>
                            <div className="mt-3 h-1.5 rounded-full bg-slate-800/80 overflow-hidden flex">
                                <div className="bg-emerald-400" style={{ width: '20%' }} />
                                <div className="bg-cyan-400" style={{ width: '40%' }} />
                                <div className="bg-amber-400" style={{ width: '25%' }} />
                                <div className="bg-rose-400" style={{ width: '15%' }} />
                            </div>
                            <div className="flex items-center justify-between mt-1.5 gap-1">
                                {(['A', 'B', 'C', 'D'] as const).map((g) => {
                                    const colors = { A: 'text-emerald-400', B: 'text-cyan-400', C: 'text-amber-400', D: 'text-rose-400' };
                                    const counts = { A: 5, B: 11, C: 7, D: 4 };
                                    return (
                                        <div key={g} className="flex items-center gap-1">
                                            <span className={`text-[11px] font-black ${colors[g]}`}>{g}</span>
                                            <span className="text-[11px] font-bold tabular-nums text-slate-500">{counts[g]}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Session Status */}
                        <div className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/40 animate-pulse" />
                                <span className="text-sm font-black text-white uppercase tracking-wide">REGULAR</span>
                            </div>
                            <div className="text-[13px] font-bold tabular-nums text-white/90 mt-1.5">10:34:21 <span className="text-xs text-slate-400 font-bold">ET</span></div>
                            <div className="text-xs text-white tabular-nums">Tue, Mar 25</div>
                            <div className="mt-1 flex items-center gap-1.5">
                                <span className="text-xs font-bold text-emerald-400">Market closes</span>
                                <span className="text-xs font-black tabular-nums text-white/90">5h 26m</span>
                            </div>
                        </div>

                        {/* Risk Summary */}
                        <div className="hidden lg:block relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-4">
                            <div className="text-[11px] text-slate-400 uppercase tracking-[0.15em] font-bold mb-2.5">RISK SUMMARY</div>
                            <div className="space-y-2">
                                {[{ label: 'IV Avg', value: '38%', pct: 38, color: 'bg-amber-400 text-amber-400' },
                                  { label: 'GEX Long', value: '72%', pct: 72, color: 'bg-emerald-400 text-emerald-400' },
                                  { label: 'MP ±3%', value: '45%', pct: 45, color: 'bg-cyan-400 text-cyan-400' }].map(r => (
                                    <div key={r.label} className="flex items-center justify-between">
                                        <span className="text-[11px] text-slate-400">{r.label}</span>
                                        <div className="flex items-center gap-2">
                                            <div className="w-14 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                                <div className={`h-full rounded-full ${r.color.split(' ')[0]}`} style={{ width: `${r.pct}%` }} />
                                            </div>
                                            <span className={`text-[11px] font-black tabular-nums ${r.color.split(' ')[1]}`}>{r.value}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 3: Treemap Heatmap — Inline SVG Mockup             */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5 mt-12">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-600/10 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
                            <Grid3X3 size={18} className="text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">{t('treemapTitle')}</h3>
                            <p className="text-[13px] text-slate-400 font-medium">{t('treemapSubtitle')}</p>
                        </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs font-bold text-emerald-300">INTERACTIVE</span>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('treemapDesc', richTags)}</p>

                {/* Treemap SVG Mockup */}
                <div className="rounded-2xl bg-[#0d1424] border border-slate-700/30 p-1 overflow-hidden">
                    <svg viewBox="0 0 600 180" className="w-full h-auto">
                        {/* Row 1 — Large tiles */}
                        <rect x="2" y="2" width="148" height="88" rx="4" fill="#1e5230" />
                        <text x="76" y="38" textAnchor="middle" fill="white" fontWeight="900" fontSize="14" fontFamily="system-ui">NVDA</text>
                        <text x="76" y="58" textAnchor="middle" fill="#4ade80" fontWeight="800" fontSize="12" fontFamily="monospace">+1.8%</text>

                        <rect x="152" y="2" width="148" height="88" rx="4" fill="#216e3e" />
                        <text x="226" y="38" textAnchor="middle" fill="white" fontWeight="900" fontSize="14" fontFamily="system-ui">TSLA</text>
                        <text x="226" y="58" textAnchor="middle" fill="#4ade80" fontWeight="800" fontSize="12" fontFamily="monospace">+2.3%</text>

                        <rect x="302" y="2" width="108" height="88" rx="4" fill="#4d1919" />
                        <text x="356" y="38" textAnchor="middle" fill="white" fontWeight="900" fontSize="14" fontFamily="system-ui">AMZN</text>
                        <text x="356" y="58" textAnchor="middle" fill="#fb7185" fontWeight="800" fontSize="12" fontFamily="monospace">-0.9%</text>

                        <rect x="412" y="2" width="90" height="88" rx="4" fill="#1a4129" />
                        <text x="457" y="38" textAnchor="middle" fill="white" fontWeight="900" fontSize="13" fontFamily="system-ui">AAPL</text>
                        <text x="457" y="58" textAnchor="middle" fill="#4ade80" fontWeight="800" fontSize="11" fontFamily="monospace">+0.7%</text>

                        <rect x="504" y="2" width="94" height="88" rx="4" fill="#7d1a1a" />
                        <text x="551" y="38" textAnchor="middle" fill="white" fontWeight="900" fontSize="13" fontFamily="system-ui">AMD</text>
                        <text x="551" y="58" textAnchor="middle" fill="#fb7185" fontWeight="800" fontSize="11" fontFamily="monospace">-1.7%</text>

                        {/* Row 2 — Smaller tiles */}
                        <rect x="2" y="92" width="100" height="86" rx="4" fill="#183520" />
                        <text x="52" y="128" textAnchor="middle" fill="white" fontWeight="900" fontSize="12" fontFamily="system-ui">GOOG</text>
                        <text x="52" y="148" textAnchor="middle" fill="#4ade80" fontWeight="800" fontSize="10" fontFamily="monospace">+0.3%</text>

                        <rect x="104" y="92" width="100" height="86" rx="4" fill="#1e2430" />
                        <text x="154" y="128" textAnchor="middle" fill="white" fontWeight="900" fontSize="12" fontFamily="system-ui">META</text>
                        <text x="154" y="148" textAnchor="middle" fill="#94a3b8" fontWeight="800" fontSize="10" fontFamily="monospace">0.0%</text>

                        <rect x="206" y="92" width="100" height="86" rx="4" fill="#351a1a" />
                        <text x="256" y="128" textAnchor="middle" fill="white" fontWeight="900" fontSize="12" fontFamily="system-ui">MSFT</text>
                        <text x="256" y="148" textAnchor="middle" fill="#fb7185" fontWeight="800" fontSize="10" fontFamily="monospace">-0.2%</text>

                        <rect x="308" y="92" width="96" height="86" rx="4" fill="#1a8a4a" />
                        <text x="356" y="128" textAnchor="middle" fill="white" fontWeight="900" fontSize="12" fontFamily="system-ui">PLTR</text>
                        <text x="356" y="148" textAnchor="middle" fill="#4ade80" fontWeight="800" fontSize="10" fontFamily="monospace">+4.1%</text>

                        <rect x="406" y="92" width="96" height="86" rx="4" fill="#c02424" />
                        <text x="454" y="128" textAnchor="middle" fill="white" fontWeight="900" fontSize="12" fontFamily="system-ui">RIVN</text>
                        <text x="454" y="148" textAnchor="middle" fill="#fb7185" fontWeight="800" fontSize="10" fontFamily="monospace">-4.8%</text>

                        <rect x="504" y="92" width="94" height="86" rx="4" fill="#1e5230" />
                        <text x="551" y="128" textAnchor="middle" fill="white" fontWeight="900" fontSize="12" fontFamily="system-ui">SPY</text>
                        <text x="551" y="148" textAnchor="middle" fill="#4ade80" fontWeight="800" fontSize="10" fontFamily="monospace">+1.2%</text>
                    </svg>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                        <span className="text-[13px] text-emerald-400 font-bold">{t('treemapFeature1')}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-center">
                        <span className="text-[13px] text-cyan-400 font-bold">{t('treemapFeature2')}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                        <span className="text-[13px] text-amber-400 font-bold">{t('treemapFeature3')}</span>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 4: Analytics Row — Signal + Top Movers             */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5 mt-12">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-600/10 flex items-center justify-center border border-purple-500/20 shadow-lg shadow-purple-500/10">
                        <BarChart3 size={18} className="text-purple-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('analyticsTitle')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium">{t('analyticsSubtitle')}</p>
                    </div>
                </div>

                <p className="text-[15px] text-slate-300 leading-relaxed">{t.rich('analyticsDesc', richTags)}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Signal Distribution Mockup */}
                    <div className={glassCard}>
                        <div className="text-[12px] text-slate-400 uppercase tracking-[0.15em] font-bold mb-3">SIGNAL DISTRIBUTION</div>
                        <div className="flex items-center gap-5">
                            <svg width="72" height="72" className="-rotate-90 flex-shrink-0">
                                <circle cx="36" cy="36" r="27" fill="none" stroke="#34d399" strokeWidth="7" strokeDasharray="67.86 101.79" strokeDashoffset="0" opacity="0.85" />
                                <circle cx="36" cy="36" r="27" fill="none" stroke="#22d3ee" strokeWidth="7" strokeDasharray="50.89 118.75" strokeDashoffset="-67.86" opacity="0.85" />
                                <circle cx="36" cy="36" r="27" fill="none" stroke="#fbbf24" strokeWidth="7" strokeDasharray="33.93 135.72" strokeDashoffset="-118.75" opacity="0.85" />
                                <circle cx="36" cy="36" r="27" fill="none" stroke="#f87171" strokeWidth="7" strokeDasharray="16.96 152.68" strokeDashoffset="-152.68" opacity="0.85" />
                                <circle cx="36" cy="36" r="18" fill="#0b1120" />
                                <text x="36" y="36" textAnchor="middle" dominantBaseline="central" className="rotate-90 origin-center" fill="#94a3b8" fontSize="13" fontWeight="800">27</text>
                            </svg>
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
                                {[{ name: 'HOLD', count: 10, color: '#34d399' }, { name: 'ADD', count: 8, color: '#22d3ee' },
                                  { name: 'WATCH', count: 5, color: '#fbbf24' }, { name: 'TRIM', count: 4, color: '#f87171' }].map(s => (
                                    <div key={s.name} className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                                        <span className="text-[12px] font-bold text-slate-400">{s.name}</span>
                                        <span className="text-[13px] font-black tabular-nums text-white ml-auto">{s.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <p className="text-[13px] text-slate-400 mt-3 leading-relaxed">{t('signalDonutDesc')}</p>
                    </div>

                    {/* Top Movers Mockup */}
                    <div className={glassCard}>
                        <div className="text-[12px] text-slate-400 uppercase tracking-[0.15em] font-bold mb-3">TOP MOVERS</div>
                        <div className="space-y-2.5">
                            {[{ ticker: 'PLTR', pct: 4.1, positive: true }, { ticker: 'TSLA', pct: 2.3, positive: true }, { ticker: 'RIVN', pct: -4.8, positive: false }].map(m => (
                                <div key={m.ticker} className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                                        <span className="text-[9px] font-black text-slate-400">{m.ticker.slice(0, 2)}</span>
                                    </div>
                                    <span className="text-[13px] font-bold text-white w-12">{m.ticker}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${m.positive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                            style={{ width: `${Math.min(Math.abs(m.pct) / 5 * 100, 100)}%` }} />
                                    </div>
                                    <span className={`text-[13px] font-black tabular-nums ${m.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {m.positive ? '+' : ''}{m.pct.toFixed(1)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p className="text-[13px] text-slate-400 mt-3 leading-relaxed">{t('topMoversDesc')}</p>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 5: Table Column Indicators                        */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5 mt-12">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center border border-cyan-500/20 shadow-lg shadow-cyan-500/10">
                        <Layers size={18} className="text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('columnTitle')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium">{t('columnSubtitle')}</p>
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
                            <div className="space-y-2">
                                <p className="text-[13px] text-slate-300">
                                    {t.rich('cards.alphaColumn.desc', richTags)}
                                </p>
                                {/* Inline score gauge mockup */}
                                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/50 border border-white/5">
                                    <div className="relative w-10 h-10 flex-shrink-0">
                                        <svg className="w-10 h-10 -rotate-90">
                                            <circle cx="20" cy="20" r="14" fill="none" stroke="#1e293b" strokeWidth="3" />
                                            <circle cx="20" cy="20" r="14" fill="none" stroke="#34d399" strokeWidth="3"
                                                strokeLinecap="round" strokeDasharray="87.96" strokeDashoffset="17.59" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-emerald-400">A</div>
                                    </div>
                                    <div>
                                        <span className="text-lg font-black text-white tabular-nums">82</span>
                                        <span className="text-[11px] text-slate-400 ml-1.5">/ 100</span>
                                    </div>
                                </div>
                            </div>
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
                                {[{ label: 'HOLD', color: 'bg-emerald-500/20 text-emerald-400', desc: t('cards.signal.buy') },
                                  { label: 'ADD', color: 'bg-cyan-500/20 text-cyan-400', desc: t('cards.signal.strongBuy') },
                                  { label: 'WATCH', color: 'bg-amber-500/20 text-amber-400', desc: t('cards.signal.hold') },
                                  { label: 'TRIM', color: 'bg-rose-500/20 text-rose-400', desc: t('cards.signal.watch') }].map(s => (
                                    <div key={s.label} className="flex items-center gap-3">
                                        <span className={`px-2 py-0.5 rounded font-bold text-[12px] ${s.color}`}>{s.label}</span>
                                        <span className="text-slate-300 text-[13px]">{s.desc}</span>
                                    </div>
                                ))}
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

                    {/* GammaFlip */}
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
                                <p className="text-slate-300 text-[13px]">{t('cards.maxPain.descIntro')}</p>
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
                                {[{ label: 'Default', color: 'bg-amber-500/20 text-amber-400', desc: t('cards.sort.default') },
                                  { label: 'Score', color: 'bg-cyan-500/20 text-cyan-400', desc: t('cards.sort.alpha') },
                                  { label: 'Change%', color: 'bg-emerald-500/20 text-emerald-400', desc: t('cards.sort.change') },
                                  { label: 'Whale', color: 'bg-purple-500/20 text-purple-400', desc: t('cards.sort.whale') }].map(s => (
                                    <div key={s.label} className="flex items-center gap-3">
                                        <span className={`px-2 py-0.5 rounded font-bold text-[12px] ${s.color}`}>{s.label}</span>
                                        <span className="text-slate-300 text-[13px]">{s.desc}</span>
                                    </div>
                                ))}
                            </div>
                        }
                    />
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 6: Tier Comparison — FOMO Driver                  */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <section className="space-y-5 mt-12">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
                        <Crown size={18} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('tierTitle')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium">{t('tierSubtitle')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* FREE */}
                    <div className="rounded-2xl border border-white/[0.08] p-5 bg-gradient-to-br from-slate-800/40 to-slate-900/60">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-[14px] font-black text-slate-300 tracking-wider">FREE</span>
                        </div>
                        <div className="text-3xl font-black text-white mb-1">5</div>
                        <p className="text-[13px] text-slate-400 mb-4">{t('tierFree')}</p>
                        <div className="space-y-2">
                            {[t('tierFeature1'), t('tierFeature2')].map((f, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                        <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" fill="none" stroke="#34d399" strokeWidth="1.5" /></svg>
                                    </div>
                                    <span className="text-[12px] text-slate-300">{f}</span>
                                </div>
                            ))}
                            {[t('tierFeature3'), t('tierFeature4'), t('tierFeature5')].map((f, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-slate-600 flex-shrink-0" />
                                    <span className="text-[12px] text-slate-500 line-through">{f}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* PRO */}
                    <div className="rounded-2xl border border-cyan-500/30 p-5 bg-gradient-to-br from-cyan-500/10 to-slate-900/60 shadow-lg shadow-cyan-500/10 relative">
                        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-[10px] font-bold text-cyan-300">POPULAR</div>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-[14px] font-black text-cyan-400 tracking-wider">PRO</span>
                        </div>
                        <div className="text-3xl font-black text-white mb-1">50</div>
                        <p className="text-[13px] text-slate-400 mb-4">{t('tierPro')}</p>
                        <div className="space-y-2">
                            {[t('tierFeature1'), t('tierFeature2'), t('tierFeature3'), t('tierFeature4')].map((f, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                        <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" fill="none" stroke="#34d399" strokeWidth="1.5" /></svg>
                                    </div>
                                    <span className="text-[12px] text-slate-300">{f}</span>
                                </div>
                            ))}
                            <div className="flex items-center gap-2">
                                <Lock className="w-4 h-4 text-slate-600 flex-shrink-0" />
                                <span className="text-[12px] text-slate-500 line-through">{t('tierFeature5')}</span>
                            </div>
                        </div>
                    </div>

                    {/* ELITE */}
                    <div className="rounded-2xl border border-amber-500/30 p-5 bg-gradient-to-br from-amber-500/10 to-slate-900/60 shadow-lg shadow-amber-500/10 relative">
                        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-[10px] font-bold text-amber-300">UNLIMITED</div>
                        <div className="flex items-center gap-2 mb-3">
                            <Crown className="w-4 h-4 text-amber-400" />
                            <span className="text-[14px] font-black text-amber-400 tracking-wider">ELITE</span>
                        </div>
                        <div className="text-3xl font-black text-white mb-1">∞</div>
                        <p className="text-[13px] text-slate-400 mb-4">{t('tierElite')}</p>
                        <div className="space-y-2">
                            {[t('tierFeature1'), t('tierFeature2'), t('tierFeature3'), t('tierFeature4'), t('tierFeature5')].map((f, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                        <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" fill="none" stroke="#34d399" strokeWidth="1.5" /></svg>
                                    </div>
                                    <span className="text-[12px] text-slate-300">{f}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 7: Pro Tip                                        */}
            {/* ═══════════════════════════════════════════════════════════ */}
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

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Section 8: Investment Risk Disclaimer                     */}
            {/* ═══════════════════════════════════════════════════════════ */}
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
