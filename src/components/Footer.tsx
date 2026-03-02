'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export function Footer() {
    const t = useTranslations('footer');
    const pathname = usePathname();

    // Guide pages have a fixed sidebar — offset footer to match
    const isGuide = pathname.includes('/how-it-works');
    const isIntel = pathname.includes('/intel') && !pathname.includes('/intel-guardian');
    const needsOffset = isGuide || isIntel;

    const isKorean = pathname.startsWith('/ko');
    const locale = pathname.startsWith('/ja') ? 'ja' : pathname.startsWith('/ko') ? 'ko' : 'en';

    return (
        <footer className={`border-t border-white/[0.03] bg-[#080d18] pb-20 md:pb-0 ${needsOffset ? 'lg:pl-56' : ''}`}>
            <div className="px-4 sm:px-6 py-4 lg:px-8 max-w-[1400px] mx-auto">

                {/* ── Legal Links Row ── */}
                <div className="text-[12px] text-slate-400 text-center mb-3 flex items-center justify-center gap-1 flex-wrap">
                    <span className="text-slate-500">© 2026 eunhoonmaster (DBA SIGNUM HQ). All rights reserved.</span>
                    <span className="text-slate-600 mx-1">|</span>
                    <Link href={`/${locale}/terms`} className="underline hover:text-white transition-colors">
                        {isKorean ? '이용약관' : locale === 'ja' ? '利用規約' : 'Terms of Service'}
                    </Link>
                    <span className="text-slate-600 mx-1">|</span>
                    <Link href={`/${locale}/privacy`} className="underline hover:text-white transition-colors">
                        {isKorean ? '개인정보처리방침' : locale === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy'}
                    </Link>
                    <span className="text-slate-600 mx-1">|</span>
                    <Link href={`/${locale}/refund`} className="underline hover:text-white transition-colors">
                        {isKorean ? '환불정책' : locale === 'ja' ? '返金ポリシー' : 'Refund Policy'}
                    </Link>
                    <span className="text-slate-600 mx-1">|</span>
                    <span>{isKorean ? '연락처' : locale === 'ja' ? 'お問い合わせ' : 'Contact'}: <a href="mailto:contact@signumhq.com" className="underline hover:text-white transition-colors">contact@signumhq.com</a></span>
                </div>

                {/* ── KO-only: Business Info ── */}
                {isKorean && (
                    <div className="text-[12px] text-slate-400 text-center mb-4 space-y-1">
                        <p>
                            상호명: 은훈마스터 &nbsp;|&nbsp; 대표자: 김지영 &nbsp;|&nbsp; 사업자등록번호: 473-15-01443 &nbsp;|&nbsp; 통신판매업 신고번호: 제 2024-경기안산-2779호
                        </p>
                        <p>
                            사업장 소재지: 경기도 안산시 단원구 선부로 286, 3층 302호 G4 &nbsp;|&nbsp; 고객센터: 070-8027-2912 &nbsp;|&nbsp; 이메일: contact@signumhq.com
                        </p>
                    </div>
                )}

                {/* ── Disclaimer ── */}
                <p className="text-[12px] leading-relaxed text-slate-400/70 text-center">
                    {t('disclaimer')}
                </p>
            </div>
        </footer>
    );
}
