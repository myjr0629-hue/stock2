import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { Shield, Command, Brain, PieChart, Star } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

export default async function HowItWorksPage() {
    const t = await getTranslations('howItWorks');

    const sections = [
        {
            title: 'GUARDIAN',
            description: t('guardianDesc'),
            icon: Shield,
            href: '/how-it-works/guardian',
            color: 'from-emerald-500 to-teal-600'
        },
        {
            title: 'COMMAND',
            description: t('commandDesc'),
            icon: Command,
            href: '/how-it-works/command',
            color: 'from-cyan-500 to-blue-600'
        },
        {
            title: 'INTEL',
            description: t('intelDesc'),
            icon: Brain,
            href: '/how-it-works/intel',
            color: 'from-purple-500 to-pink-600'
        },
        {
            title: 'PORTFOLIO',
            description: t('portfolioDesc'),
            icon: PieChart,
            href: '/how-it-works/portfolio',
            color: 'from-amber-500 to-orange-600'
        },
        {
            title: 'WATCHLIST',
            description: t('watchlistDesc'),
            icon: Star,
            href: '/how-it-works/watchlist',
            color: 'from-rose-500 to-red-600'
        },
    ];

    return (
        <HowItWorksLayout
            title={t('guideTitle')}
            subtitle={t('guideSubtitle')}
        >
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-white/10 p-8 mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10" />
                <div className="relative">
                    <h2 className="text-2xl font-bold text-white mb-4">
                        {t('heroTitle')}
                    </h2>
                    <p className="text-slate-300 max-w-2xl leading-relaxed">
                        {t('heroDescription')}
                    </p>
                </div>
            </div>

            {/* Section Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sections.map((section) => (
                    <Link
                        key={section.title}
                        href={section.href}
                        className="group"
                    >
                        <div className="relative overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 h-full transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:shadow-2xl hover:shadow-cyan-500/10">
                            {/* Icon */}
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                <section.icon className="w-6 h-6 text-white" />
                            </div>

                            {/* Title */}
                            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                                {section.title}
                            </h3>

                            {/* Description */}
                            <p className="text-slate-400 text-sm leading-relaxed">
                                {section.description}
                            </p>

                            {/* Arrow */}
                            <div className="absolute bottom-6 right-6 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-cyan-400">→</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </HowItWorksLayout>
    );
}
