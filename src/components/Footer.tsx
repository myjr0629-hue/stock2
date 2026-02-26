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

    return (
        <footer className={`border-t border-white/[0.03] bg-[#080d18] ${needsOffset ? 'lg:pl-56' : ''}`}>
            <div className="px-4 sm:px-6 py-4 lg:px-8 max-w-[1400px] mx-auto">
                <p className="text-[12px] leading-relaxed text-slate-400/70 text-center">
                    {t('disclaimer')}
                </p>
            </div>
        </footer>
    );
}
