import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const locales = ['ko', 'en', 'ja'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ko';

export const routing = defineRouting({
    locales,
    defaultLocale,
    localePrefix: 'always'
});

// Navigation helpers
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
