import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ArrowLeft, Shield, Database, Target, Clock, Lock, Mail, UserCheck } from 'lucide-react';

export default function PrivacyPage() {
    const t = useTranslations('legal');

    const sections = [
        { icon: Database, titleKey: 'privacy.collectTitle', contentKey: 'privacy.collectContent', color: 'text-cyan-400' },
        { icon: Target, titleKey: 'privacy.purposeTitle', contentKey: 'privacy.purposeContent', color: 'text-amber-400' },
        { icon: Clock, titleKey: 'privacy.retentionTitle', contentKey: 'privacy.retentionContent', color: 'text-emerald-400' },
        { icon: UserCheck, titleKey: 'privacy.gdprTitle', contentKey: 'privacy.gdprContent', color: 'text-indigo-400' },
        { icon: Lock, titleKey: 'privacy.securityTitle', contentKey: 'privacy.securityContent', color: 'text-rose-400' },
        { icon: Mail, titleKey: 'privacy.contactTitle', contentKey: 'privacy.contactContent', color: 'text-slate-400' },
    ];

    return (
        <div className="min-h-screen bg-[#030712] flex flex-col overflow-hidden">
            <LandingHeader />

            <div className="flex-1 py-16 px-4 relative">
                {/* Animated Background Auras */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Emerald Aura - Top Left */}
                    <div
                        className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-emerald-600/15 rounded-full blur-[140px] animate-pulse"
                        style={{ animationDuration: '9s' }}
                    />
                    {/* Indigo Aura - Bottom Right */}
                    <div
                        className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[150px] animate-pulse"
                        style={{ animationDuration: '11s', animationDelay: '3s' }}
                    />
                    {/* Center Subtle Glow */}
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-teal-600/5 rounded-full blur-[160px]"
                    />
                </div>

                {/* Main Glass Container */}
                <div className="max-w-3xl mx-auto relative z-10">
                    <div className="backdrop-blur-xl bg-white/[0.02] border-t border-l border-white/[0.08] border-b border-r border-white/[0.03] rounded-3xl p-10 md:p-14 shadow-2xl shadow-black/40">

                        {/* Header */}
                        <header className="mb-12">
                            <div className="flex items-center gap-4 mb-6">
                                <Shield className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
                                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                                    {t('privacyTitle')}
                                </h1>
                            </div>
                            <p className="text-slate-500 text-sm tracking-wide">
                                {t('lastUpdated')}: 2026-01-30
                            </p>
                            <p className="text-slate-300/90 text-base leading-[1.75] tracking-[-0.025em] mt-6">
                                {t('privacy.intro')}
                            </p>
                        </header>

                        {/* Content Sections */}
                        <div className="space-y-0">
                            {sections.map(({ icon: Icon, titleKey, contentKey, color }, index) => (
                                <section
                                    key={index}
                                    className={`py-8 ${index !== sections.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
                                >
                                    <div className="flex items-start gap-4">
                                        <Icon className={`w-5 h-5 ${color} shrink-0 mt-1 drop-shadow-[0_0_8px_currentColor]`} />
                                        <div>
                                            <h2 className="text-lg font-bold text-white mb-3 tracking-wide">
                                                {t(titleKey)}
                                            </h2>
                                            <p className="text-slate-400 text-sm leading-[1.75] tracking-[-0.025em]">
                                                {t(contentKey)}
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            ))}
                        </div>

                        {/* Footer with Neon Hover */}
                        <footer className="mt-12 pt-8 border-t border-white/[0.04]">
                            <Link
                                href="/login"
                                className="group inline-flex items-center gap-2 text-sm font-medium text-cyan-400 transition-all duration-300 hover:text-cyan-300 relative"
                            >
                                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                                <span className="relative">
                                    {t('backToLogin')}
                                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] transition-all duration-300 group-hover:w-full" />
                                </span>
                            </Link>
                        </footer>
                    </div>
                </div>
            </div>
        </div>
    );
}
