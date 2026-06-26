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
      const scrollEl = document.querySelector('.app-main');
      if (scrollEl && scrollEl.scrollTop <= 0 && y > startY) {
        e.preventDefault();
      }
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
