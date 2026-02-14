'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ArrowLeft, AlertTriangle, Shield } from 'lucide-react';
import { sections as koSections, meta as koMeta } from './_content-ko';
import { sections as enSections, meta as enMeta } from './_content-en';
import { sections as jaSections, meta as jaMeta } from './_content-ja';

const contentMap = {
    ko: { sections: koSections, meta: koMeta },
    en: { sections: enSections, meta: enMeta },
    ja: { sections: jaSections, meta: jaMeta },
};

export default function TermsPage() {
    const locale = useLocale();
    const { sections, meta } = contentMap[locale as keyof typeof contentMap] || contentMap.en;

    return (
        <div className="min-h-screen bg-[#030712] flex flex-col overflow-hidden antialiased">
            <div className="flex-1 py-16 px-4 relative">
                {/* Animated Background Auras */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div
                        className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-cyan-600/15 rounded-full blur-[140px] animate-pulse"
                        style={{ animationDuration: '8s' }}
                    />
                    <div
                        className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[150px] animate-pulse"
                        style={{ animationDuration: '10s', animationDelay: '2s' }}
                    />
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-violet-600/5 rounded-full blur-[160px]"
                    />
                </div>

                {/* Main Glass Container */}
                <div className="max-w-3xl mx-auto relative z-10">
                    <div className="backdrop-blur-xl bg-white/[0.02] border-t border-l border-white/[0.08] border-b border-r border-white/[0.03] rounded-3xl p-10 md:p-14 shadow-2xl shadow-black/40">

                        {/* Header */}
                        <header className="mb-12">
                            <div className="flex items-center gap-4 mb-6">
                                <Shield className="w-8 h-8 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
                                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                                    {meta.pageTitle}
                                </h1>
                            </div>
                            <p className="text-slate-400 text-sm font-medium tracking-wide">
                                {meta.lastUpdated}
                            </p>
                            <p className="text-slate-300 text-base leading-[1.75] mt-6">
                                {meta.intro}
                            </p>
                        </header>

                        {/* Content Sections */}
                        <div className="space-y-4">
                            {sections.map(({ icon: Icon, color, title, content, highlight }, index) => (
                                <section
                                    key={index}
                                    className={`rounded-2xl p-6 md:p-8 transition-colors ${highlight
                                            ? 'bg-amber-500/[0.03] border border-amber-500/10'
                                            : 'bg-white/[0.015] border border-white/[0.04] hover:border-white/[0.08]'
                                        }`}
                                >
                                    {highlight && (
                                        <div className="mb-4">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25 shadow-[0_0_12px_rgba(245,158,11,0.1)]">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                {locale === 'ko' ? '중요 조항' : locale === 'ja' ? '重要条項' : 'IMPORTANT'}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-start gap-4">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${highlight ? 'bg-amber-500/10' : 'bg-white/[0.04]'}`}>
                                            <Icon className={`w-4.5 h-4.5 ${color} drop-shadow-[0_0_8px_currentColor]`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h2 className="text-[15px] font-bold text-white mb-3 tracking-wide">
                                                {title}
                                            </h2>
                                            <div className="text-slate-300 text-sm leading-[1.9] [&_strong]:text-white [&_strong]:font-semibold [&_li]:mb-1">
                                                {content}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            ))}
                        </div>

                        {/* Effective Date */}
                        <div className="mt-10 py-6 border-t border-white/[0.08] text-center">
                            <p className="text-slate-300 text-sm">
                                {meta.effectiveDate}<strong className="text-white">{meta.effectiveDateBold}</strong>
                                {locale === 'ko' ? '부터 시행됩니다.' : locale === 'ja' ? 'より施行されます。' : '.'}
                            </p>
                        </div>

                        {/* Footer */}
                        <footer className="mt-4 pt-6 border-t border-white/[0.04]">
                            <Link
                                href="/login"
                                className="group inline-flex items-center gap-2 text-sm font-medium text-cyan-400 transition-all duration-300 hover:text-cyan-300 relative"
                            >
                                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                                <span className="relative">
                                    {meta.backLink}
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
