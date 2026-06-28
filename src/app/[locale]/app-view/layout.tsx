'use client';

import { useEffect } from 'react';
import { AppBottomNav } from '@/components/app/AppBottomNav';
import { NetworkStatus } from '@/components/app/NetworkStatus';
import { AppFirstRunOnboarding } from '@/components/app/AppFirstRunOnboarding';
import { AppAnchorAd } from '@/components/app/AppAnchorAd';
import { usePathname } from '@/i18n/routing';
import '@/styles/app-tokens.css';
import '@/styles/app-view.css';

export default function AppViewLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDocumentRoute = pathname?.includes('/app-view/terms') ||
    pathname?.includes('/app-view/privacy') ||
    pathname?.includes('/app-view/onboarding');
  const isSettingsRoute = pathname?.includes('/app-view/settings');
  const hideAd = isDocumentRoute || isSettingsRoute;

  // Tag html element for app-only CSS (fallback for :has() on older WebViews)
  // + block pull-to-refresh at JS level
  useEffect(() => {
    document.documentElement.classList.add('is-app-view');

    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      if (y <= startY) return; // only guard downward pulls (pull-to-refresh direction)
      // Block the pull only when the ACTUAL scroller under the finger is at its top.
      // Walk up to the nearest vertically-scrollable ancestor so custom scrollers that are
      // decoupled from .app-main (e.g. the market-movers list .viewport/.scroll) keep working.
      let el = e.target as HTMLElement | null;
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.scrollHeight > el.clientHeight) {
          const oy = getComputedStyle(el).overflowY;
          if (oy === 'auto' || oy === 'scroll') {
            if (el.scrollTop <= 0) e.preventDefault();
            return;
          }
        }
        el = el.parentElement;
      }
      // No scrollable ancestor → block to prevent document-level rubber-band/refresh.
      e.preventDefault();
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.documentElement.classList.remove('is-app-view');
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return (
    <div className={`app-viewport ${isDocumentRoute ? 'app-document-route' : ''}`}>
      <main className="app-main">
        {children}
      </main>
      {!hideAd && <AppAnchorAd />}
      <AppBottomNav />
      <NetworkStatus />
      <AppFirstRunOnboarding />
    </div>
  );
}
