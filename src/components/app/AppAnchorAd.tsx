'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';

const COPY: Record<string, { sponsor: string; title: string; sub: string; cta: string }> = {
  ko: {
    sponsor: 'SPONSOR',
    title: 'Apex Clearing Intelligence Feed',
    sub: '\uc2e4\uc2dc\uac04 \uae30\uad00 \ub2e4\ud06c\ud480 \ube14\ub85d \ubc0f \ub300\ud615 \uc635\uc158 \uccb4\uc778 \ud50c\ub85c\uc6b0',
    cta: '\uc5f0\uacb0',
  },
  en: {
    sponsor: 'SPONSOR',
    title: 'Apex Clearing Intelligence Feed',
    sub: 'Institutional dark-pool blocks and large options chain flow',
    cta: 'Open',
  },
  ja: {
    sponsor: 'SPONSOR',
    title: 'Apex Clearing Intelligence Feed',
    sub: '\u6a5f\u95a2\u30c0\u30fc\u30af\u30d7\u30fc\u30eb\u3001\u30d6\u30ed\u30c3\u30af\u3001\u5927\u53e3\u30aa\u30d7\u30b7\u30e7\u30f3\u30d5\u30ed\u30fc',
    cta: '\u63a5\u7d9a',
  },
};

export function AppAnchorAd() {
  const locale = useLocale();
  const copy = COPY[locale] || COPY.en;
  const [isNative, setIsNative] = useState(false);

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

  if (isNative) {
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
