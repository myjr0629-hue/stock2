import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import { Shield, Command, Brain, PieChart, Star } from 'lucide-react';
import Link from 'next/link';

const sections = [
    {
        title: 'GUARDIAN',
        description: '시장 전체의 GEX 포지셔닝과 마켓 페이즈 분석',
        icon: Shield,
        href: '/how-it-works/guardian',
        color: 'from-emerald-500 to-teal-600'
    },
    {
        title: 'COMMAND',
        description: '개별 종목의 감마 레벨, GEX 엔진, 전술적 레인지 분석',
        icon: Command,
        href: '/how-it-works/command',
        color: 'from-cyan-500 to-blue-600'
    },
    {
        title: 'INTEL',
        description: 'AI 루머 분석과 실시간 인텔리전스 피드',
        icon: Brain,
        href: '/how-it-works/intel',
        color: 'from-purple-500 to-pink-600'
    },
    {
        title: 'PORTFOLIO',
        description: 'Alpha Score, Signal Badge로 포트폴리오 관리',
        icon: PieChart,
        href: '/how-it-works/portfolio',
        color: 'from-amber-500 to-orange-600'
    },
    {
        title: 'WATCHLIST',
        description: '관심 종목 모니터링 지표 및 컬럼 설명',
        icon: Star,
        href: '/how-it-works/watchlist',
        color: 'from-rose-500 to-red-600'
    },
];

export default function HowItWorksPage() {
    return (
        <HowItWorksLayout
            title="SIGNUM HQ 가이드"
            subtitle="각 지표의 의미와 활용법을 알아보세요"
        >
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-white/10 p-8 mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10" />
                <div className="relative">
                    <h2 className="text-2xl font-bold text-white mb-4">
                        옵션 기반 시장 분석 플랫폼
                    </h2>
                    <p className="text-slate-300 max-w-2xl leading-relaxed">
                        SIGNUM HQ는 <span className="text-cyan-400 font-semibold">Gamma Exposure (GEX)</span>,
                        <span className="text-emerald-400 font-semibold"> Max Pain</span>,
                        <span className="text-amber-400 font-semibold"> Options Flow</span> 등
                        옵션 시장 데이터를 분석하여 주가의 지지/저항 레벨과 변동성 전환점을 제공합니다.
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
