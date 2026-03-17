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
            title={<><span className="font-black tracking-tight">SIGNUM</span><span className="font-black tracking-tight text-cyan-400">HQ</span> <span className="font-bold">{t('guideSuffix')}</span></>}
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
                        <span className="text-[11px] font-bold text-cyan-400 tracking-wider uppercase">
                            Options Intelligence Platform
                        </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white mb-3 tracking-tight">
                        {t('heroTitle')}
                    </h2>
                    <p className="text-slate-200 text-[15px] max-w-2xl leading-[1.8]">
                        {t.rich('heroDescription', richTags)}
                    </p>
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
