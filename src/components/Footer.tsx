'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export function Footer() {
    const t = useTranslations('footer');
    const pathname = usePathname();

    // V8: Use useEffect to avoid hydration mismatch (SSR vs CSR pathname can differ)
    const [needsOffset, setNeedsOffset] = useState(false);
    useEffect(() => {
        const isGuide = pathname.includes('/how-it-works');
        const isIntel = pathname.includes('/intel') && !pathname.includes('/intel-guardian');
        setNeedsOffset(isGuide || isIntel);
    }, [pathname]);

    const isKorean = pathname.startsWith('/ko');
    const locale = pathname.startsWith('/ja') ? 'ja' : pathname.startsWith('/ko') ? 'ko' : 'en';

    return (
        <footer className={`border-t border-white/[0.03] bg-[#080d18] pb-20 md:pb-0 ${needsOffset ? 'lg:pl-56' : ''}`}>
            <div className="px-4 sm:px-6 pt-8 pb-4 lg:px-8 max-w-[1400px] mx-auto" suppressHydrationWarning>

                {/* ── Legal Links Row ── */}
                <div className="text-[12px] text-slate-400 text-center mb-3 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                    <span className="text-slate-500">© 2026 SIGNUM HQ, LLC. All rights reserved.</span>
                    <span className="text-slate-600 mx-1 hidden sm:inline">|</span>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                        <Link href={`/${locale}/terms`} className="underline hover:text-white transition-colors">
                            {isKorean ? '이용약관' : locale === 'ja' ? '利用規約' : 'Terms of Service'}
                        </Link>
                        <span className="text-slate-600">|</span>
                        <Link href={`/${locale}/privacy`} className="underline hover:text-white transition-colors">
                            {isKorean ? '개인정보처리방침' : locale === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy'}
                        </Link>
                        <span className="text-slate-600">|</span>
                        <Link href={`/${locale}/refund`} className="underline hover:text-white transition-colors">
                            {isKorean ? '환불정책' : locale === 'ja' ? '返金ポリシー' : 'Refund Policy'}
                        </Link>
                    </div>
                    <span className="text-slate-600 mx-1 hidden sm:inline">|</span>
                    <span>{isKorean ? '연락처' : locale === 'ja' ? 'お問い合わせ' : 'Contact'}: <a href="mailto:contact@signumhq.com" className="underline hover:text-white transition-colors">contact@signumhq.com</a></span>
                </div>

                {/* ── Disclaimer ── */}
                <p className="text-[12px] leading-relaxed text-slate-400/70 text-center">
                    {t('disclaimer')}
                </p>
            </div>
        </footer>
    );
}
