import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { LayoutDashboard, Shield, Command, Radio, Brain, PieChart, Star } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

export default async function HowItWorksPage() {
    const t = await getTranslations('howItWorks');

    const sections = [
        {
            title: 'DASHBOARD',
            descKey: 'dashboardDesc' as const,
            icon: LayoutDashboard,
            href: '/how-it-works/dashboard',
            gradient: 'from-indigo-500 to-indigo-700',
            glow: 'shadow-indigo-500/20',
            color: '#818cf8',
            // Bar chart pattern
            bgSvg: (c: string) => (
                <svg className="absolute bottom-2 right-2 w-24 h-20 opacity-[0.12] group-hover:opacity-[0.22] transition-opacity duration-500" viewBox="0 0 96 80" fill="none">
                    <rect x="4" y="50" width="10" height="26" rx="2" fill={c} /><rect x="20" y="35" width="10" height="41" rx="2" fill={c} /><rect x="36" y="20" width="10" height="56" rx="2" fill={c} /><rect x="52" y="40" width="10" height="36" rx="2" fill={c} /><rect x="68" y="10" width="10" height="66" rx="2" fill={c} /><rect x="84" y="28" width="10" height="48" rx="2" fill={c} />
                    <path d="M8 48 L24 33 L40 18 L56 38 L72 8 L88 26" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
            ),
        },
        {
            title: 'GUARDIAN',
            descKey: 'guardianDesc' as const,
            icon: Shield,
            href: '/how-it-works/guardian',
            gradient: 'from-emerald-500 to-teal-700',
            glow: 'shadow-emerald-500/20',
            color: '#34d399',
            // Radar rings pattern
            bgSvg: (c: string) => (
                <svg className="absolute bottom-2 right-2 w-24 h-24 opacity-[0.12] group-hover:opacity-[0.22] transition-opacity duration-500" viewBox="0 0 96 96" fill="none">
                    <circle cx="48" cy="48" r="40" stroke={c} strokeWidth="1" /><circle cx="48" cy="48" r="28" stroke={c} strokeWidth="1" /><circle cx="48" cy="48" r="16" stroke={c} strokeWidth="1" />
                    <line x1="48" y1="8" x2="48" y2="88" stroke={c} strokeWidth="0.5" /><line x1="8" y1="48" x2="88" y2="48" stroke={c} strokeWidth="0.5" />
                    <line x1="48" y1="48" x2="78" y2="24" stroke={c} strokeWidth="1.5" strokeLinecap="round" /><circle cx="78" cy="24" r="3" fill={c} />
                </svg>
            ),
        },
        {
            title: 'COMMAND',
            descKey: 'commandDesc' as const,
            icon: Command,
            href: '/how-it-works/command',
            gradient: 'from-cyan-500 to-blue-700',
            glow: 'shadow-cyan-500/20',
            color: '#22d3ee',
            // Crosshair + levels pattern
            bgSvg: (c: string) => (
                <svg className="absolute bottom-2 right-2 w-24 h-20 opacity-[0.12] group-hover:opacity-[0.22] transition-opacity duration-500" viewBox="0 0 96 80" fill="none">
                    <line x1="0" y1="20" x2="96" y2="20" stroke={c} strokeWidth="0.5" strokeDasharray="4 4" /><line x1="0" y1="40" x2="96" y2="40" stroke={c} strokeWidth="1" /><line x1="0" y1="60" x2="96" y2="60" stroke={c} strokeWidth="0.5" strokeDasharray="4 4" />
                    <path d="M4 55 L20 45 L32 50 L48 30 L60 35 L76 15 L92 25" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    <circle cx="48" cy="30" r="4" stroke={c} strokeWidth="1" fill="none" /><line x1="48" y1="24" x2="48" y2="36" stroke={c} strokeWidth="0.5" /><line x1="42" y1="30" x2="54" y2="30" stroke={c} strokeWidth="0.5" />
                </svg>
            ),
        },
        {
            title: 'FLOW',
            descKey: 'flowDesc' as const,
            icon: Radio,
            href: '/how-it-works/flow',
            gradient: 'from-sky-500 to-cyan-700',
            glow: 'shadow-sky-500/20',
            color: '#38bdf8',
            // Wave + arrows pattern
            bgSvg: (c: string) => (
                <svg className="absolute bottom-2 right-2 w-24 h-20 opacity-[0.12] group-hover:opacity-[0.22] transition-opacity duration-500" viewBox="0 0 96 80" fill="none">
                    <path d="M0 40 Q12 20 24 40 Q36 60 48 40 Q60 20 72 40 Q84 60 96 40" stroke={c} strokeWidth="1.5" fill="none" />
                    <path d="M0 50 Q12 30 24 50 Q36 70 48 50 Q60 30 72 50 Q84 70 96 50" stroke={c} strokeWidth="1" fill="none" opacity="0.5" />
                    <polygon points="80,16 92,22 80,28" fill={c} /><polygon points="16,52 4,58 16,64" fill={c} opacity="0.6" />
                </svg>
            ),
        },
        {
            title: 'INTEL',
            descKey: 'intelDesc' as const,
            icon: Brain,
            href: '/how-it-works/intel',
            gradient: 'from-purple-500 to-pink-700',
            glow: 'shadow-purple-500/20',
            color: '#a78bfa',
            // Neural network pattern
            bgSvg: (c: string) => (
                <svg className="absolute bottom-2 right-2 w-24 h-24 opacity-[0.12] group-hover:opacity-[0.22] transition-opacity duration-500" viewBox="0 0 96 96" fill="none">
                    <circle cx="20" cy="20" r="4" fill={c} /><circle cx="48" cy="14" r="4" fill={c} /><circle cx="76" cy="20" r="4" fill={c} />
                    <circle cx="14" cy="48" r="4" fill={c} /><circle cx="48" cy="48" r="6" fill={c} /><circle cx="82" cy="48" r="4" fill={c} />
                    <circle cx="20" cy="76" r="4" fill={c} /><circle cx="48" cy="82" r="4" fill={c} /><circle cx="76" cy="76" r="4" fill={c} />
                    <line x1="20" y1="20" x2="48" y2="48" stroke={c} strokeWidth="0.8" /><line x1="48" y1="14" x2="48" y2="48" stroke={c} strokeWidth="0.8" /><line x1="76" y1="20" x2="48" y2="48" stroke={c} strokeWidth="0.8" />
                    <line x1="14" y1="48" x2="48" y2="48" stroke={c} strokeWidth="0.8" /><line x1="82" y1="48" x2="48" y2="48" stroke={c} strokeWidth="0.8" />
                    <line x1="20" y1="76" x2="48" y2="48" stroke={c} strokeWidth="0.8" /><line x1="48" y1="82" x2="48" y2="48" stroke={c} strokeWidth="0.8" /><line x1="76" y1="76" x2="48" y2="48" stroke={c} strokeWidth="0.8" />
                </svg>
            ),
        },
        {
            title: 'PORTFOLIO',
            descKey: 'portfolioDesc' as const,
            icon: PieChart,
            href: '/how-it-works/portfolio',
            gradient: 'from-amber-500 to-orange-700',
            glow: 'shadow-amber-500/20',
            color: '#fbbf24',
            // Donut chart pattern
            bgSvg: (c: string) => (
                <svg className="absolute bottom-2 right-2 w-24 h-24 opacity-[0.12] group-hover:opacity-[0.22] transition-opacity duration-500" viewBox="0 0 96 96" fill="none">
                    <circle cx="48" cy="48" r="36" stroke={c} strokeWidth="8" strokeDasharray="60 30 40 30 56" strokeLinecap="round" />
                    <circle cx="48" cy="48" r="20" stroke={c} strokeWidth="1" strokeDasharray="3 3" />
                    <text x="48" y="52" textAnchor="middle" fill={c} fontSize="12" fontWeight="bold">%</text>
                </svg>
            ),
        },
        {
            title: 'WATCHLIST',
            descKey: 'watchlistDesc' as const,
            icon: Star,
            href: '/how-it-works/watchlist',
            gradient: 'from-rose-500 to-red-700',
            glow: 'shadow-rose-500/20',
            color: '#fb7185',
            // Grid + pulse pattern
            bgSvg: (c: string) => (
                <svg className="absolute bottom-2 right-2 w-24 h-20 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500" viewBox="0 0 96 80" fill="none">
                    <rect x="4" y="4" width="26" height="14" rx="3" stroke={c} strokeWidth="1" /><rect x="4" y="22" width="26" height="14" rx="3" stroke={c} strokeWidth="1" /><rect x="4" y="40" width="26" height="14" rx="3" stroke={c} strokeWidth="1" />
                    <rect x="35" y="4" width="26" height="14" rx="3" stroke={c} strokeWidth="1" /><rect x="35" y="22" width="26" height="14" rx="3" stroke={c} strokeWidth="1" /><rect x="35" y="40" width="26" height="14" rx="3" stroke={c} strokeWidth="1" />
                    <rect x="66" y="4" width="26" height="14" rx="3" stroke={c} strokeWidth="1" /><rect x="66" y="22" width="26" height="14" rx="3" stroke={c} strokeWidth="1" /><rect x="66" y="40" width="26" height="14" rx="3" stroke={c} strokeWidth="1" />
                    <path d="M4 65 L16 60 L28 68 L40 55 L52 62 L64 58 L76 70 L88 56" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
            ),
        },
    ];

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
    };

    return (
        <HowItWorksLayout
            title={<><img src="/signum-sg-vectorized.svg" alt="" width="28" height="28" className="inline-block mr-2 align-middle -mt-1" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.4))' }} /><span className="font-black tracking-tight">SIGNUM</span><span className="font-black tracking-tight text-cyan-400">HQ</span> <span className="font-bold">{t('guideSuffix')}</span></>}
            subtitle={t('guideSubtitle')}
        >
            {/* Hero Section — Premium Glassmorphism */}
            <div className="relative overflow-hidden rounded-2xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-8 sm:p-10">
                {/* Decorative gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.08] via-transparent to-purple-500/[0.06] pointer-events-none" />
                <div className="absolute -top-20 -right-20 w-60 h-60 bg-cyan-400/[0.08] rounded-full blur-3xl" />
                <div className="absolute -bottom-20 -left-10 w-40 h-40 bg-purple-400/[0.06] rounded-full blur-3xl" />

                {/* Hero infographic — stock chart + option walls */}
                <svg className="absolute right-4 bottom-4 w-48 h-36 sm:w-64 sm:h-44 opacity-[0.08]" viewBox="0 0 260 180" fill="none">
                    {/* Grid lines */}
                    <line x1="0" y1="40" x2="260" y2="40" stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="4 4" />
                    <line x1="0" y1="80" x2="260" y2="80" stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="4 4" />
                    <line x1="0" y1="120" x2="260" y2="120" stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="4 4" />
                    {/* Call Wall line */}
                    <line x1="0" y1="50" x2="260" y2="50" stroke="#fbbf24" strokeWidth="1.5" />
                    <text x="248" y="46" fill="#fbbf24" fontSize="8" textAnchor="end">CALL WALL</text>
                    {/* Put Floor line */}
                    <line x1="0" y1="140" x2="260" y2="140" stroke="#fb7185" strokeWidth="1.5" />
                    <text x="248" y="136" fill="#fb7185" fontSize="8" textAnchor="end">PUT FLOOR</text>
                    {/* Max Pain line */}
                    <line x1="0" y1="95" x2="260" y2="95" stroke="#a78bfa" strokeWidth="1" strokeDasharray="6 3" />
                    <text x="248" y="91" fill="#a78bfa" fontSize="7" textAnchor="end">MAX PAIN</text>
                    {/* Candlestick-like price path */}
                    <path d="M10 130 L30 115 L50 120 L70 100 L90 105 L110 85 L130 90 L150 70 L170 75 L190 60 L210 65 L230 55 L250 58" stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" />
                    {/* Volume bars */}
                    <rect x="8" y="155" width="8" height="18" rx="1" fill="#22d3ee" opacity="0.4" /><rect x="28" y="160" width="8" height="13" rx="1" fill="#22d3ee" opacity="0.3" /><rect x="48" y="150" width="8" height="23" rx="1" fill="#22d3ee" opacity="0.5" /><rect x="68" y="158" width="8" height="15" rx="1" fill="#fb7185" opacity="0.3" /><rect x="88" y="152" width="8" height="21" rx="1" fill="#22d3ee" opacity="0.4" /><rect x="108" y="148" width="8" height="25" rx="1" fill="#22d3ee" opacity="0.6" /><rect x="128" y="155" width="8" height="18" rx="1" fill="#fb7185" opacity="0.3" /><rect x="148" y="145" width="8" height="28" rx="1" fill="#22d3ee" opacity="0.5" /><rect x="168" y="153" width="8" height="20" rx="1" fill="#22d3ee" opacity="0.4" /><rect x="188" y="140" width="8" height="33" rx="1" fill="#22d3ee" opacity="0.7" /><rect x="208" y="150" width="8" height="23" rx="1" fill="#fb7185" opacity="0.4" /><rect x="228" y="148" width="8" height="25" rx="1" fill="#22d3ee" opacity="0.5" />
                    {/* GEX dots */}
                    <circle cx="110" cy="85" r="4" fill="#fbbf24" opacity="0.6" /><circle cx="190" cy="60" r="5" fill="#22d3ee" opacity="0.6" /><circle cx="250" cy="58" r="3" fill="#a78bfa" opacity="0.6" />
                </svg>

                <div className="relative">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-4">
                        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                        <span className="text-[12px] font-bold text-cyan-400 tracking-wider uppercase">
                            Options Intelligence Platform
                        </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white mb-3 tracking-tight">
                        {t('heroTitle')}
                    </h2>
                    <p className="text-slate-300 text-[14px] max-w-2xl leading-[1.8]">
                        {t.rich('heroDescription', richTags)}
                    </p>
                </div>
            </div>

            {/* ═══ Context Score — FOMO Section ═══ */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/[0.06] via-white/[0.03] to-cyan-500/[0.04] backdrop-blur-2xl border border-amber-400/[0.12] p-6 sm:p-8">
                {/* Decorative elements */}
                <div className="absolute -top-16 -right-16 w-48 h-48 bg-amber-400/[0.06] rounded-full blur-3xl" />
                <div className="absolute -bottom-12 -left-8 w-36 h-36 bg-cyan-400/[0.04] rounded-full blur-3xl" />

                {/* Score gauge SVG decoration */}
                <svg className="absolute right-6 top-1/2 -translate-y-1/2 w-32 h-32 sm:w-40 sm:h-40 opacity-[0.06]" viewBox="0 0 120 120" fill="none">
                    <circle cx="60" cy="60" r="52" stroke="#fbbf24" strokeWidth="4" strokeDasharray="200 127" strokeLinecap="round" transform="rotate(-90 60 60)" />
                    <circle cx="60" cy="60" r="40" stroke="#22d3ee" strokeWidth="2" strokeDasharray="150 102" strokeLinecap="round" transform="rotate(-120 60 60)" />
                    <text x="60" y="58" textAnchor="middle" fill="#fbbf24" fontSize="18" fontWeight="900">A+</text>
                    <text x="60" y="74" textAnchor="middle" fill="#94a3b8" fontSize="9">SCORE</text>
                </svg>

                <div className="relative z-10 flex flex-col lg:flex-row gap-6 lg:gap-12 xl:gap-20 justify-between items-center lg:items-start">
                    <div className="w-full max-w-xl">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
                            <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                            <span className="text-[12px] font-bold text-amber-400 tracking-wider uppercase">
                                Context Score
                            </span>
                        </div>

                        {/* Title */}
                        <h3 className="text-lg sm:text-xl font-black text-white mb-3 tracking-tight leading-tight">
                            {t('contextScoreTitle')}
                        </h3>

                        {/* Description */}
                        <p className="text-slate-300 text-[13px] sm:text-[14px] leading-[1.8] mb-5">
                            {t.rich('contextScoreDesc', richTags)}
                        </p>

                        {/* 5-Axis Indicator Grid — subtle value showcase */}
                        <div className="grid grid-cols-5 gap-2 sm:gap-3 mb-5">
                            {[
                                { label: t('csAxisMomentum'), color: '#22d3ee', icon: 'M2 12l5 5L20 4' },
                                { label: t('csAxisOptions'), color: '#a78bfa', icon: 'M12 2v20M2 12h20' },
                                { label: t('csAxisFlow'), color: '#fbbf24', icon: 'M4 12h16M12 4l8 8-8 8' },
                                { label: t('csAxisFundamental'), color: '#34d399', icon: 'M3 3v18h18M7 14l4-4 4 4 4-8' },
                                { label: t('csAxisSentiment'), color: '#fb7185', icon: 'M12 4C7 4 3 8 3 12s4 8 9 8 9-4 9-8-4-8-9-8z' },
                            ].map((axis, i) => (
                                <div key={i} className="flex flex-col items-center gap-1.5 py-2 px-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={axis.color} strokeWidth="2" strokeLinecap="round"><path d={axis.icon} /></svg>
                                    <span className="text-[12px] text-slate-300 font-medium text-center leading-tight">{axis.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Compliance disclaimer */}
                        <p className="text-[12px] text-slate-500 leading-relaxed">
                            {t('contextScoreDisclaimer')}
                        </p>
                    </div>

                    {/* Scale Map Infographic */}
                    <div className="w-full lg:w-64 xl:w-72 shrink-0 flex flex-col gap-2 p-4 rounded-xl lg:rounded-2xl bg-black/20 lg:bg-black/30 border border-white/5 backdrop-blur-md shadow-2xl relative">
                        <div className="text-[12px] font-bold text-slate-400 tracking-widest uppercase mb-1">{t('csLabelTitle')}</div>
                        {[
                            { range: '80—100', color: 'text-amber-400', bg: 'bg-amber-400/40', label: t('csScaleA'), desc: t('csDescA') },
                            { range: '60—79', color: 'text-emerald-400', bg: 'bg-emerald-400/40', label: t('csScaleB'), desc: t('csDescB') },
                            { range: '40—59', color: 'text-slate-300', bg: 'bg-slate-400/40', label: t('csScaleC'), desc: t('csDescC') },
                            { range: '20—39', color: 'text-orange-400', bg: 'bg-orange-400/40', label: t('csScaleD'), desc: t('csDescD') },
                            { range: '0—19', color: 'text-rose-400', bg: 'bg-rose-400/40', label: t('csScaleF'), desc: t('csDescF') },
                        ].map((row, i) => (
                            <div key={i} className="flex flex-col gap-0.5 relative pl-3 group">
                                <div className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-full ${row.bg} transition-transform`} />
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className={`text-[13px] font-black tracking-tight ${row.color}`}>{row.range}</span>
                                    <span className={`text-[12px] font-bold uppercase tracking-wide text-right flex-1 ${row.color}`}>{row.label}</span>
                                </div>
                                <div className="text-[12px] text-slate-300 leading-snug">{row.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══ Smart Flow — FOMO Section ═══ */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/[0.05] via-white/[0.02] to-emerald-500/[0.04] backdrop-blur-2xl border border-purple-400/[0.12] p-6 sm:p-8 mt-4">
                {/* Decorative elements */}
                <div className="absolute -top-16 -right-16 w-48 h-48 bg-purple-400/[0.06] rounded-full blur-3xl" />
                <div className="absolute -bottom-12 -left-8 w-36 h-36 bg-emerald-400/[0.04] rounded-full blur-3xl" />

                {/* Radar/Sonar SVG decoration for Smart Flow */}
                <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-40 h-40 sm:w-48 sm:h-48 opacity-[0.08]" viewBox="0 0 120 120" fill="none">
                    <circle cx="60" cy="60" r="50" stroke="#a78bfa" strokeWidth="1" strokeDasharray="4 4" />
                    <circle cx="60" cy="60" r="35" stroke="#34d399" strokeWidth="1" opacity="0.6" />
                    <circle cx="60" cy="60" r="20" stroke="#22d3ee" strokeWidth="2" />
                    {/* Sonar sweep effect */}
                    <path d="M60 60 L10 60 A50 50 0 0 1 60 10 Z" fill="#a78bfa" opacity="0.1" />
                    {/* Data hits (whales) */}
                    <circle cx="80" cy="30" r="3" fill="#fbbf24" /><circle cx="80" cy="30" r="6" stroke="#fbbf24" strokeWidth="0.5" className="animate-ping" style={{ animationDuration: '3s' }} />
                    <circle cx="40" cy="85" r="2" fill="#34d399" />
                    <circle cx="95" cy="70" r="2.5" fill="#22d3ee" />
                </svg>

                <div className="relative z-10 flex flex-col lg:flex-row gap-6 lg:gap-12 xl:gap-20 justify-between items-center lg:items-start">
                    <div className="w-full max-w-xl">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
                            <Radio className="w-3 h-3 text-purple-400" />
                            <span className="text-[12px] font-bold text-purple-400 tracking-wider uppercase">
                                Institutional Whale Radar
                            </span>
                        </div>

                        {/* Title */}
                        <h3 className="text-lg sm:text-xl font-black text-white mb-3 tracking-tight leading-tight">
                            {t('smartFlowTitle')}
                        </h3>

                        {/* Description */}
                        <p className="text-slate-300 text-[13px] sm:text-[14px] leading-[1.8] mb-5">
                            {t.rich('smartFlowDesc', richTags)}
                        </p>

                        {/* 4-Axis Indicator Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
                            {[
                                { label: t('sfAxisGEX'), color: '#22d3ee', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
                                { label: t('sfAxisDarkPool'), color: '#a78bfa', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z' },
                                { label: t('sfAxisBlock'), color: '#fb7185', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
                                { label: t('sfAxisPremium'), color: '#34d399', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' }
                            ].map((axis, i) => (
                                <div key={i} className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                                    <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke={axis.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={axis.icon} /></svg>
                                    <span className="text-[11px] sm:text-[12px] text-slate-300 font-medium text-center leading-tight whitespace-nowrap">{axis.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Compliance disclaimer */}
                        <p className="text-[12px] text-slate-500 leading-relaxed">
                            {t('smartFlowDisclaimer')}
                        </p>
                    </div>

                    {/* Flow Intensity Infographic */}
                    <div className="w-full lg:w-64 xl:w-72 shrink-0 flex flex-col gap-2 p-4 rounded-xl lg:rounded-2xl bg-black/20 lg:bg-black/30 border border-white/5 backdrop-blur-md shadow-2xl relative">
                        <div className="text-[12px] font-bold text-slate-400 tracking-widest uppercase mb-1">{t('sfLabelTitle')}</div>
                        {[
                            { range: '75—100', color: 'text-emerald-400', bg: 'bg-emerald-400/40', label: t('sfScaleExIn'), desc: t('sfDescExIn') },
                            { range: '50—74', color: 'text-cyan-400', bg: 'bg-cyan-400/40', label: t('sfScaleIn'), desc: t('sfDescIn') },
                            { range: '25—49', color: 'text-orange-400', bg: 'bg-orange-400/40', label: t('sfScaleOut'), desc: t('sfDescOut') },
                            { range: '0—24', color: 'text-rose-400', bg: 'bg-rose-400/40', label: t('sfScaleExOut'), desc: t('sfDescExOut') },
                        ].map((row, i) => (
                            <div key={i} className="flex flex-col gap-0.5 relative pl-3 group">
                                <div className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-full ${row.bg} transition-transform`} />
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className={`text-[13px] font-black tracking-tight ${row.color}`}>{row.range}</span>
                                    <span className={`text-[12px] font-bold uppercase tracking-wide text-right flex-1 ${row.color}`}>{row.label}</span>
                                </div>
                                <div className="text-[12px] text-slate-300 leading-snug">{row.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Section Cards — Premium Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sections.map((section) => (
                    <Link
                        key={section.title}
                        href={section.href}
                        className="group"
                    >
                        <div className={`relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.07] p-5 h-full transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.15] hover:shadow-xl ${section.glow}`}>
                            {/* Hover glow */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                <div className={`absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br ${section.gradient} opacity-[0.08] rounded-full blur-2xl`} />
                            </div>

                            {/* Infographic background */}
                            {section.bgSvg(section.color)}

                            <div className="relative">
                                {/* Icon */}
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${section.gradient} flex items-center justify-center mb-4 shadow-lg ${section.glow} group-hover:scale-110 transition-transform duration-300`}>
                                    <section.icon className="w-5 h-5 text-white" />
                                </div>

                                {/* Title */}
                                <h3 className="text-[15px] font-black text-white mb-1.5 group-hover:text-cyan-300 transition-colors tracking-tight">
                                    {section.title}
                                </h3>

                                {/* Description */}
                                <p className="text-slate-300 text-[14px] leading-relaxed group-hover:text-slate-200 transition-colors">
                                    {t.rich(section.descKey, richTags)}
                                </p>
                            </div>

                            {/* Arrow indicator */}
                            <div className="absolute bottom-5 right-5 w-7 h-7 rounded-full bg-white/[0.05] flex items-center justify-center opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                                <span className="text-sm text-cyan-400">→</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </HowItWorksLayout>
    );
}
