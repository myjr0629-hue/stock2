'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { usePathname } from '@/i18n/routing';

// \uc6f9 \uc804\uc6a9 \ud558\ub2e8 \uad11\uace0 \uc790\ub9ac. \ub124\uc774\ud2f0\ube0c\ub294 AdMob \ubc30\ub108\uac00 \uac19\uc740 \uc790\ub9ac\ub97c \uc4f0\ubbc0\ub85c \uc5ec\uae30\uc120 \uadf8\ub9ac\uc9c0 \uc54a\ub294\ub2e4.
// \u26052026-09-27: 6/25\ubd80\ud130 \uc774 \uc790\ub9ac\uc5d0 \uc2e4\uc874 \ud68c\uc0ac \uc774\ub984\uc744 \u00abSPONSOR\u00bb \ub85c \ub2e8 \uac00\uc9dc \uce74\ub4dc\uac00 \uc788\uc5c8\ub2e4(\uc6b0\ub9ac \uc2a4\ud3f0\uc11c\uac00 \uc544\ub2c8\ub2e4).
//   \uc571 \ud654\uba74 \ucea1\ucc98\ub9c8\ub2e4 \uadf8\ub300\ub85c \ucc0d\ud614\ub2e4. \uc774\uc81c \uc6b0\ub9ac \uc571(Undercurrent \u00b7 Why'd It Move?) \uc548\ub0b4\ub9cc \ud55c\ub2e4 \u2014 \ud0c0\uc0ac \uc774\ub984\uc744 \ub123\uc9c0 \uc54a\ub294\ub2e4.
//   \ub192\uc774\u00b7\ud074\ub798\uc2a4\ub294 \uadf8\ub300\ub85c\ub2e4: \ubcf8\ubb38 \uc5ec\ubc31\u00b7\ud0ed\ubc14 \uac04\uaca9\uc774 --app-anchor-ad-height \ub85c \uc774 \uc790\ub9ac\ub97c \uc608\uc57d\ud558\uace0,
//   \ucea1\ucc98 \uc2a4\ud06c\ub9bd\ud2b8\ub4e4\uc774 `aside.app-anchor-ad` \ub85c \uc774 \uc790\ub9ac\ub97c \uc9c0\uc6b4\ub2e4(\ud0dc\uadf8\u00b7\ud074\ub798\uc2a4\ub97c \ubc14\uafb8\uc9c0 \ub9d0 \uac83).

type HouseApp = 'uc' | 'wim';

const APPS: Record<HouseApp, { name: string; icon: string; href: string }> = {
  uc: {
    name: 'Undercurrent',
    icon: '/app-icons/uc.png',
    href: 'https://www.signumhq.com/app-uc?from=signum_web_slot',
  },
  wim: {
    name: "Why'd It Move?",
    icon: '/app-icons/wim.png',
    href: 'https://www.signumhq.com/app-wim?from=signum_web_slot',
  },
};

// \ubd80\uc81c\ub294 \uc124\uc815 \ud654\uba74\uc758 \ud615\uc81c \uc571 \uce74\ub4dc\uc640 \uac19\uc740 \ubb38\uad6c\ub2e4.
const COPY: Record<string, { flag: string; label: string; cta: string; sub: Record<HouseApp, string> }> = {
  ko: {
    flag: 'SIGNUM HQ',
    label: 'SIGNUM HQ\uc758 \ubb34\ub8cc \uc571',
    cta: '\ubc1b\uae30',
    sub: { uc: '\ub274\uc2a4 \ub4a4\uc758 \ub3c8 \u00b7 \ubb34\ub8cc', wim: '\uc624\ub298 \uc65c \uc6c0\uc9c1\uc600\ub294\uc9c0 \ud034\uc988\ub85c \u00b7 \ubb34\ub8cc' },
  },
  en: {
    flag: 'SIGNUM HQ',
    label: 'Free apps from SIGNUM HQ',
    cta: 'Get',
    sub: { uc: 'The news behind the money \u00b7 Free', wim: 'Daily market-move quiz \u00b7 Free' },
  },
  ja: {
    flag: 'SIGNUM HQ',
    label: 'SIGNUM HQ\u306e\u7121\u6599\u30a2\u30d7\u30ea',
    cta: '\u5165\u624b',
    sub: { uc: '\u30cb\u30e5\u30fc\u30b9\u306e\u88cf\u5074\u306e\u304a\u91d1 \u00b7 \u7121\u6599', wim: '\u5024\u52d5\u304d\u306e\u7406\u7531\u3092\u30af\u30a4\u30ba\u3067 \u00b7 \u7121\u6599' },
  },
};

// \uc885\ubaa9\u00b7\ub4f1\ub77d \ud654\uba74\uc740 \u00ab\uc65c \uc6c0\uc9c1\uc600\ub098\u00bb \ud034\uc988 \uc571, \ub098\uba38\uc9c0(\uc2dc\uc7a5\u00b7\ub274\uc2a4)\ub294 Undercurrent.
// \uacbd\ub85c\ub85c \uace0\ub974\ubbc0\ub85c \uc11c\ubc84\uc640 \ud074\ub77c\uc774\uc5b8\ud2b8\uac00 \uac19\uc740 \uce74\ub4dc\ub97c \uadf8\ub9b0\ub2e4(\ud558\uc774\ub4dc\ub808\uc774\uc158 \ubd88\uc77c\uce58 \uc5c6\uc74c, \ucea1\ucc98\ub9c8\ub2e4 \uac19\uc740 \uce74\ub4dc).
const WIM_ROUTE = /\/app-view\/(cmd|flow|movers)(\/|$)/;

export function AppAnchorAd() {
  const locale = useLocale();
  const pathname = usePathname();
  const copy = COPY[locale] || COPY.en;
  const appKey: HouseApp = pathname && WIM_ROUTE.test(pathname) ? 'wim' : 'uc';
  const app = APPS[appKey];
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
    <aside className="app-anchor-ad" aria-label={copy.label}>
      <span className="app-anchor-ad-flag">{copy.flag}</span>
      <span className="app-anchor-ad-icon app-anchor-ad-icon--app" aria-hidden="true">
        <img src={app.icon} alt="" width={28} height={28} />
      </span>
      <span className="app-anchor-ad-copy">
        <strong>{app.name}</strong>
        <small>{copy.sub[appKey]}</small>
      </span>
      <span className="app-anchor-ad-cta" aria-hidden="true">{copy.cta}</span>
      {/* 카드 전체를 덮는 링크 — 격자 칸을 차지하지 않도록 절대 위치(app-view.css) */}
      <a
        className="app-anchor-ad-link"
        href={app.href}
        target="_blank"
        rel="noopener"
        aria-label={`${app.name} — ${copy.cta}`}
      />
    </aside>
  );
}
