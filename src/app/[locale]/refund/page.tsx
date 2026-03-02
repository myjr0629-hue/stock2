'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ArrowLeft, RotateCcw, Shield, Mail } from 'lucide-react';

const content = {
    en: {
        title: 'Refund Policy',
        lastUpdated: 'Last Updated: March 3, 2026',
        headline: '14-Day Unconditional Money-Back Guarantee',
        body: 'We offer a 14-day unconditional money-back guarantee. If you are not satisfied with our service, you can request a full refund within 14 days of your initial purchase. No questions asked.',
        howTo: 'How to Request a Refund',
        howToBody: 'Simply send an email to the address below with your account email and order details. Your refund will be processed within 7 business days.',
        contact: 'Contact Us',
        back: '← Back to Pricing',
        company: '© 2026 eunhoonmaster (DBA SIGNUM HQ). All rights reserved.',
    },
    ko: {
        title: '환불 정책',
        lastUpdated: '최종 수정일: 2026년 3월 3일',
        headline: '14일 무조건 전액 환불 보장',
        body: '최초 구매일로부터 14일 이내에 환불을 요청하시면 조건 없이 전액 환불해 드립니다. 사유를 묻지 않습니다.',
        howTo: '환불 요청 방법',
        howToBody: '아래 이메일 주소로 계정 이메일과 주문 내역을 보내주시면, 7 영업일 이내에 환불이 처리됩니다.',
        contact: '문의하기',
        back: '← 가격 페이지로 돌아가기',
        company: '© 2026 은훈마스터 (DBA SIGNUM HQ). All rights reserved.',
    },
    ja: {
        title: '返金ポリシー',
        lastUpdated: '最終更新日: 2026年3月3日',
        headline: '14日間無条件返金保証',
        body: '初回購入から14日以内であれば、無条件で全額返金いたします。理由は問いません。',
        howTo: '返金リクエスト方法',
        howToBody: '下記のメールアドレスにアカウントメールと注文詳細をお送りください。7営業日以内に返金処理いたします。',
        contact: 'お問い合わせ',
        back: '← 料金ページに戻る',
        company: '© 2026 eunhoonmaster (DBA SIGNUM HQ). All rights reserved.',
    },
};

export default function RefundPage() {
    const locale = useLocale() as keyof typeof content;
    const t = content[locale] || content.en;

    return (
        <div className="min-h-screen bg-[#030712] flex flex-col overflow-hidden antialiased">
            <div className="flex-1 py-16 px-4 relative">
                {/* Background Auras */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div
                        className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-emerald-600/15 rounded-full blur-[140px] animate-pulse"
                        style={{ animationDuration: '8s' }}
                    />
                    <div
                        className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-cyan-600/20 rounded-full blur-[150px] animate-pulse"
                        style={{ animationDuration: '10s', animationDelay: '2s' }}
                    />
                </div>

                <div className="max-w-3xl mx-auto relative z-10">
                    <div className="backdrop-blur-xl bg-white/[0.02] border-t border-l border-white/[0.08] border-b border-r border-white/[0.03] rounded-3xl p-10 md:p-14 shadow-2xl shadow-black/40">

                        {/* Header */}
                        <header className="mb-12">
                            <div className="flex items-center gap-4 mb-6">
                                <RotateCcw className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
                                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                                    {t.title}
                                </h1>
                            </div>
                            <p className="text-slate-400 text-sm font-medium tracking-wide">
                                {t.lastUpdated}
                            </p>
                        </header>

                        {/* Main Guarantee Section */}
                        <section className="rounded-2xl p-8 md:p-10 bg-emerald-500/[0.04] border border-emerald-500/20 mb-8">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/10">
                                    <Shield className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_8px_currentColor]" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-2xl md:text-3xl font-black text-white mb-4 tracking-wide leading-tight">
                                        {t.headline}
                                    </h2>
                                    <p className="text-slate-300 text-lg leading-[1.85]">
                                        {t.body}
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* How to Request */}
                        <section className="rounded-2xl p-6 md:p-8 bg-white/[0.015] border border-white/[0.04] mb-8">
                            <div className="flex items-start gap-4">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/[0.04]">
                                    <Mail className="w-4.5 h-4.5 text-cyan-400 drop-shadow-[0_0_8px_currentColor]" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-bold text-white mb-3 tracking-wide">
                                        {t.howTo}
                                    </h2>
                                    <p className="text-slate-300 text-[15px] leading-[1.85] mb-4">
                                        {t.howToBody}
                                    </p>
                                    <a
                                        href="mailto:contact@signumhq.com"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all text-sm font-bold"
                                    >
                                        <Mail className="w-4 h-4" />
                                        contact@signumhq.com
                                    </a>
                                </div>
                            </div>
                        </section>

                        {/* Company */}
                        <div className="mt-10 py-6 border-t border-white/[0.08] text-center">
                            <p className="text-slate-400 text-sm">{t.company}</p>
                        </div>

                        {/* Back Link */}
                        <footer className="mt-4 pt-6 border-t border-white/[0.04]">
                            <Link
                                href={`/${locale}/pricing`}
                                className="group inline-flex items-center gap-2 text-sm font-medium text-cyan-400 transition-all duration-300 hover:text-cyan-300"
                            >
                                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                                <span className="relative">
                                    {t.back}
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
