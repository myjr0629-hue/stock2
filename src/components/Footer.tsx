'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

export function Footer() {
    const t = useTranslations('footer');
    const pathname = usePathname();

    // Hide footer on landing page
    const isLanding = pathname === '/' || /^\/(ko|en|ja)\/?$/.test(pathname);
    if (isLanding) return null;

    return (
        <footer className="border-t border-white/[0.04] bg-[#080d18]">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
                <p className="text-[12px] leading-relaxed text-slate-400 text-center">
                    {t('disclaimer')}
                </p>
            </div>
        </footer>
    );
}
