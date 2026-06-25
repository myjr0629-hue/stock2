'use client';

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

  return (
    <div className={`app-viewport ${isDocumentRoute ? 'app-document-route' : ''}`}>
      <main className="app-main">
        {children}
      </main>
      <AppAnchorAd />
      <AppBottomNav />
      <NetworkStatus />
      <AppFirstRunOnboarding />
    </div>
  );
}
