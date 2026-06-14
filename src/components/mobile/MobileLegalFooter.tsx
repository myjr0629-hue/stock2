'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

/**
 * MobileLegalFooter — Compact legal footer for all mobile pages.
 * Rendered via layout.tsx SSR bifurcation (above MobileBottomNav).
 * Displays: © copyright, Terms/Privacy/Refund links, disclaimer text.
 * All text is fully i18n via next-intl (en/ko/ja).
 */
export function MobileLegalFooter() {
    const pathname = usePathname();
    const t = useTranslations('footer');
    const isKorean = pathname?.startsWith('/ko') || false;
    const isJapanese = pathname?.startsWith('/ja') || false;

    if (pathname.includes('/app-view')) return null;

    return (
        <footer className="border-t border-white/[0.04] bg-[#050a14] px-4 pt-4 pb-6">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-slate-400 mb-3">
                <span className="text-slate-500">© 2026 SIGNUM HQ, LLC</span>
                <span className="text-slate-700">·</span>
                <Link href="/terms" className="underline hover:text-white transition-colors">
                    {isKorean ? '이용약관' : isJapanese ? '利用規約' : 'Terms of Service'}
                </Link>
                <span className="text-slate-700">·</span>
                <Link href="/privacy" className="underline hover:text-white transition-colors">
                    {isKorean ? '개인정보처리방침' : isJapanese ? 'プライバシーポリシー' : 'Privacy Policy'}
                </Link>
                <span className="text-slate-700">·</span>
                <Link href="/refund" className="underline hover:text-white transition-colors">
                    {isKorean ? '환불정책' : isJapanese ? '返金ポリシー' : 'Refund Policy'}
                </Link>
                <span className="text-slate-700">·</span>
                <span>
                    {isKorean ? '연락처' : isJapanese ? 'お問い合わせ' : 'Contact'}:{' '}
                    <a href="mailto:contact@signumhq.com" className="underline hover:text-white transition-colors">
                        contact@signumhq.com
                    </a>
                </span>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500/70 text-center">
                {t('disclaimer')}
            </p>
        </footer>
    );
}
