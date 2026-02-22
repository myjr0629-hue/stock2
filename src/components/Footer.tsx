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

    return (
        <footer className={`border-t border-white/[0.04] bg-[#080d18] ${isGuide ? 'lg:ml-56' : ''}`}>
            <div className={`px-4 sm:px-6 py-4 ${isGuide ? 'lg:px-10 max-w-5xl' : 'lg:px-8 max-w-[1400px] mx-auto'}`}>
                <p className={`text-[12px] leading-relaxed text-slate-400 ${isGuide ? 'text-left' : 'text-center'}`}>
                    {t('disclaimer')}
                </p>
            </div>
        </footer>
    );
}
