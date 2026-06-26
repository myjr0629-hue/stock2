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

  // Block pull-to-refresh at JavaScript level (belt-and-suspenders with CSS)
  useEffect(() => {
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      const scrollEl = document.querySelector('.app-main');
      // If at top of scroll and pulling down → block refresh
      if (scrollEl && scrollEl.scrollTop <= 0 && y > startY) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
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
