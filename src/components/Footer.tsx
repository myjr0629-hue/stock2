'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

export function Footer() {
    const t = useTranslations('footer');
    const pathname = usePathname();

    // Hide footer on landing page only
    const isLanding = pathname === '/' || /^\/(ko|en|ja)\/?$/.test(pathname);
    if (isLanding) return null;

    // Guide pages have a fixed sidebar — offset footer to match
    const isGuide = pathname.includes('/how-it-works');
    // Intel page has a side nav — offset footer to avoid overlap
    const isIntel = pathname.includes('/intel') && !pathname.includes('/intel-guardian');
    const needsOffset = isGuide || isIntel;

    const isKorean = pathname.startsWith('/ko');

    return (
        <footer className={`border-t border-white/[0.03] bg-[#080d18] ${needsOffset ? 'lg:pl-56' : ''}`}>
            <div className="px-4 sm:px-6 py-4 lg:px-8 max-w-[1400px] mx-auto">
                {isKorean && (
                    <div className="text-[12px] text-slate-400 text-center mb-4 space-y-1">
                        <p>
                            상호명: 은훈마스터 &nbsp;|&nbsp; 대표자: 김지영 &nbsp;|&nbsp; 사업자등록번호: 473-15-01443 &nbsp;|&nbsp; 통신판매업 신고번호: 제 2024-경기안산-2779호
                        </p>
                        <p>
                            사업장 소재지: 경기도 안산시 단원구 선부로 286, 3층 302호 G4 &nbsp;|&nbsp; 고객센터: 070-000-000 &nbsp;|&nbsp; 이메일: contact@signumhq.com
                        </p>
                    </div>
                )}
                <p className="text-[12px] leading-relaxed text-slate-400/70 text-center">
                    {t('disclaimer')}
                </p>
            </div>
        </footer>
    );
}
