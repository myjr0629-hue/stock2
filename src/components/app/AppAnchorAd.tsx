'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { usePathname } from '@/i18n/routing';

const COPY: Record<string, { sponsor: string; title: string; sub: string; cta: string }> = {
  ko: {
    sponsor: 'SPONSOR',
    title: 'Apex Clearing Intelligence Feed',
    sub: '\uae30\uad00\uae09 \uccb4\uacb0 \ub370\uc774\ud130\uc640 \uc635\uc158 \uccb4\uc778 \ud50c\ub85c\uc6b0',
    cta: '\uc5f0\uacb0',
  },
  en: {
    sponsor: 'SPONSOR',
    title: 'Apex Clearing Intelligence Feed',
    sub: 'Institutional execution data and options chain flow',
    cta: 'Open',
  },
  ja: {
    sponsor: 'SPONSOR',
    title: 'Apex Clearing Intelligence Feed',
    sub: '\u6a5f\u95a2\u306e\u7d04\u5b9a\u30c7\u30fc\u30bf\u3068\u30aa\u30d7\u30b7\u30e7\u30f3\u30c1\u30a7\u30fc\u30f3\u30d5\u30ed\u30fc',
    cta: '\u63a5\u7d9a',
  },
};

export function AppAnchorAd() {
  const locale = useLocale();
  const pathname = usePathname();
  const copy = COPY[locale] || COPY.en;
  const [isNative, setIsNative] = useState(false);
  const isDocumentRoute = pathname?.includes('/app-view/terms') ||
    pathname?.includes('/app-view/privacy') ||
    pathname?.includes('/app-view/onboarding') ||
    pathname?.includes('/app-view/settings');

  useEffect(() => {
    let mounted = true;

    import('@capacitor/core')
      .then(({ Capacitor }) => {
        if (mounted) setIsNative(Capacitor.isNativePlatform());
      })
      .catch(() => {
        if (mounted) setIsNative(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (isNative || isDocumentRoute) {
    return null;
  }

  return (
    <aside className="app-anchor-ad" aria-label="Sponsored">
      <span className="app-anchor-ad-flag">{copy.sponsor}</span>
      <span className="app-anchor-ad-icon" aria-hidden="true">$</span>
      <span className="app-anchor-ad-copy">
        <strong>{copy.title}</strong>
        <small>{copy.sub}</small>
      </span>
      <span className="app-anchor-ad-cta">{copy.cta}</span>
    </aside>
  );
}
