'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ArrowLeft, RotateCcw, Shield, Mail, Clock, CheckCircle, AlertTriangle, FileText } from 'lucide-react';

const content = {
    en: {
        title: 'Refund Policy',
        lastUpdated: 'Last Updated: March 7, 2026',
        headline: '7-Day Satisfaction Guarantee',
        headlineDesc: 'We stand behind the quality of our platform. If the service does not meet your expectations, we offer a clear and fair refund process.',
        eligibility: 'Eligibility',
        eligibilityItems: [
            'Refund requests must be made within 7 calendar days of initial purchase',
            'Available for dissatisfaction with service quality or functionality',
            'Limited to one refund per account',
            'Applies to both monthly and annual plans',
        ],
        exclusions: 'Exclusions',
        exclusionItems: [
            'Requests made after the 7-day window',
            'Promotional or discounted purchases',
            'Accounts that have previously received a refund',
        ],
        process: 'Refund Process',
        processSteps: [
            { step: '01', title: 'Submit Request', desc: 'Send an email with your account email and order details.' },
            { step: '02', title: 'Review', desc: 'Our team reviews your request within 1-2 business days.' },
            { step: '03', title: 'Processing', desc: 'Approved refunds are processed within 5-7 business days to the original payment method.' },
        ],
        contact: 'Contact',
        contactDesc: 'For refund requests or questions:',
        back: 'Back to Pricing',
        company: '© 2026 SIGNUM HQ, LLC. All rights reserved.',
        cancellation: 'Cancellation',
        cancellationDesc: 'You may cancel your subscription at any time from your account settings. Cancellation stops future renewals but access continues until the end of your current billing period.',
    },
    ko: {
        title: '환불 정책',
        lastUpdated: '최종 수정일: 2026년 3월 7일',
        headline: '7일 만족 보장',
        headlineDesc: '서비스 품질에 자신이 있습니다. 기대에 부합하지 않을 경우, 명확하고 공정한 환불 절차를 제공합니다.',
        eligibility: '환불 대상',
        eligibilityItems: [
            '최초 결제일로부터 7일 이내 요청',
            '서비스 품질 또는 기능에 대한 불만족 사유',
            '계정당 1회 환불 제한',
            '월간 및 연간 플랜 모두 적용',
        ],
        exclusions: '제외 사항',
        exclusionItems: [
            '7일 이후 요청',
            '프로모션 또는 할인 구매 건',
            '이전에 환불을 받은 계정',
        ],
        process: '환불 절차',
        processSteps: [
            { step: '01', title: '요청 제출', desc: '계정 이메일과 주문 내역을 이메일로 보내주세요.' },
            { step: '02', title: '검토', desc: '1-2 영업일 이내에 검토합니다.' },
            { step: '03', title: '처리', desc: '승인된 환불은 5-7 영업일 이내에 원래 결제 수단으로 처리됩니다.' },
        ],
        contact: '문의',
        contactDesc: '환불 요청 또는 문의사항:',
        back: '가격 페이지로 돌아가기',
        company: '© 2026 SIGNUM HQ, LLC. All rights reserved.',
        cancellation: '구독 취소',
        cancellationDesc: '계정 설정에서 언제든지 구독을 취소할 수 있습니다. 취소 시 다음 갱신이 중지되며, 현재 결제 기간 종료 시까지 서비스를 이용할 수 있습니다.',
    },
    ja: {
        title: '返金ポリシー',
        lastUpdated: '最終更新日: 2026年3月7日',
        headline: '7日間満足保証',
        headlineDesc: 'プラットフォームの品質に自信を持っています。ご期待に沿えない場合、明確で公正な返金プロセスをご用意しています。',
        eligibility: '返金対象',
        eligibilityItems: [
            '初回決済から7日以内のリクエスト',
            'サービス品質または機能に対するご不満',
            'アカウントにつき1回限り',
            '月額・年額プランともに対象',
        ],
        exclusions: '対象外',
        exclusionItems: [
            '7日経過後のリクエスト',
            'プロモーションまたは割引購入',
            '以前に返金を受けたアカウント',
        ],
        process: '返金プロセス',
        processSteps: [
            { step: '01', title: 'リクエスト送信', desc: 'アカウントメールと注文詳細をメールでお送りください。' },
            { step: '02', title: '審査', desc: '1〜2営業日以内に審査いたします。' },
            { step: '03', title: '処理', desc: '承認された返金は5〜7営業日以内に元の決済方法で処理されます。' },
        ],
        contact: 'お問い合わせ',
        contactDesc: '返金リクエストまたはご質問:',
        back: '料金ページに戻る',
        company: '© 2026 SIGNUM HQ, LLC. All rights reserved.',
        cancellation: 'サブスクリプション解約',
        cancellationDesc: 'アカウント設定からいつでもサブスクリプションを解約できます。解約により次回更新が停止されますが、現在の請求期間終了までサービスをご利用いただけます。',
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
                        className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-emerald-600/10 rounded-full blur-[140px] animate-pulse"
                        style={{ animationDuration: '8s' }}
                    />
                    <div
                        className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[150px] animate-pulse"
                        style={{ animationDuration: '10s', animationDelay: '2s' }}
                    />
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-amber-600/5 rounded-full blur-[120px]"
                    />
                </div>

                <div className="max-w-3xl mx-auto relative z-10 space-y-6">
                    {/* Header Card */}
                    <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 md:p-10 shadow-2xl shadow-black/40">
                        <header className="mb-8">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                    <Shield className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_10px_currentColor]" />
                                </div>
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight font-jakarta">
                                        {t.title}
                                    </h1>
                                    <p className="text-slate-500 text-xs font-medium tracking-wide mt-1">
                                        {t.lastUpdated}
                                    </p>
                                </div>
                            </div>
                        </header>

                        {/* Main Guarantee */}
                        <div className="rounded-xl p-6 md:p-8 bg-gradient-to-br from-emerald-500/[0.06] to-cyan-500/[0.03] border border-emerald-500/15">
                            <div className="flex items-start gap-4">
                                <Clock className="w-8 h-8 text-emerald-400 shrink-0 mt-0.5 drop-shadow-[0_0_8px_currentColor]" />
                                <div>
                                    <h2 className="text-xl md:text-2xl font-black text-white mb-3 tracking-tight font-jakarta">
                                        {t.headline}
                                    </h2>
                                    <p className="text-slate-300 text-[15px] leading-[1.85]">
                                        {t.headlineDesc}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Eligibility & Exclusions — Side by Side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Eligibility */}
                        <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 shadow-xl shadow-black/30">
                            <div className="flex items-center gap-2.5 mb-5">
                                <CheckCircle className="w-5 h-5 text-emerald-400" />
                                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-[0.15em] font-jakarta">
                                    {t.eligibility}
                                </h3>
                            </div>
                            <ul className="space-y-3">
                                {t.eligibilityItems.map((item, i) => (
                                    <li key={i} className="flex items-start gap-3 text-[13px] text-slate-300 leading-relaxed">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 mt-1.5 shrink-0" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Exclusions */}
                        <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 shadow-xl shadow-black/30">
                            <div className="flex items-center gap-2.5 mb-5">
                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-[0.15em] font-jakarta">
                                    {t.exclusions}
                                </h3>
                            </div>
                            <ul className="space-y-3">
                                {t.exclusionItems.map((item, i) => (
                                    <li key={i} className="flex items-start gap-3 text-[13px] text-slate-400 leading-relaxed">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 mt-1.5 shrink-0" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Process Steps */}
                    <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 md:p-8 shadow-xl shadow-black/30">
                        <div className="flex items-center gap-2.5 mb-6">
                            <RotateCcw className="w-5 h-5 text-cyan-400" />
                            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-[0.15em] font-jakarta">
                                {t.process}
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {t.processSteps.map((step, i) => (
                                <div key={i} className="relative p-5 rounded-xl bg-white/[0.02] border border-white/[0.04] group hover:border-cyan-500/20 transition-all duration-300">
                                    {/* Step Number */}
                                    <div className="text-3xl font-black text-cyan-500/15 font-jakarta mb-3 select-none">
                                        {step.step}
                                    </div>
                                    <h4 className="text-sm font-bold text-white mb-2 font-jakarta">
                                        {step.title}
                                    </h4>
                                    <p className="text-[12px] text-slate-400 leading-relaxed">
                                        {step.desc}
                                    </p>
                                    {/* Connector Line */}
                                    {i < 2 && (
                                        <div className="hidden md:block absolute top-1/2 -right-2 w-4 h-px bg-gradient-to-r from-white/10 to-transparent" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Cancellation */}
                    <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 shadow-xl shadow-black/30">
                        <div className="flex items-center gap-2.5 mb-4">
                            <FileText className="w-5 h-5 text-slate-400" />
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-[0.15em] font-jakarta">
                                {t.cancellation}
                            </h3>
                        </div>
                        <p className="text-[13px] text-slate-400 leading-[1.85]">
                            {t.cancellationDesc}
                        </p>
                    </div>

                    {/* Contact */}
                    <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 shadow-xl shadow-black/30">
                        <div className="flex items-center gap-2.5 mb-4">
                            <Mail className="w-5 h-5 text-cyan-400" />
                            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-[0.15em] font-jakarta">
                                {t.contact}
                            </h3>
                        </div>
                        <p className="text-[13px] text-slate-400 mb-4">
                            {t.contactDesc}
                        </p>
                        <a
                            href="mailto:contact@signumhq.com"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all text-sm font-bold font-jakarta"
                        >
                            <Mail className="w-4 h-4" />
                            contact@signumhq.com
                        </a>
                    </div>

                    {/* Company & Back */}
                    <div className="text-center space-y-4 pt-4">
                        <p className="text-slate-500 text-[12px]">{t.company}</p>
                        <Link
                            href={`/${locale}/pricing`}
                            className="group inline-flex items-center gap-2 text-sm font-medium text-cyan-400 transition-all duration-300 hover:text-cyan-300 font-jakarta"
                        >
                            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                            <span className="relative">
                                {t.back}
                                <span className="absolute -bottom-1 left-0 w-0 h-px bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] transition-all duration-300 group-hover:w-full" />
                            </span>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
