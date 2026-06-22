'use client';

import { AppBottomNav } from '@/components/app/AppBottomNav';
import { NativePullToRefresh } from '@/components/native/NativePullToRefresh';
import { NetworkStatus } from '@/components/app/NetworkStatus';
import { AppFirstRunOnboarding } from '@/components/app/AppFirstRunOnboarding';
import { AppAnchorAd } from '@/components/app/AppAnchorAd';
import '@/styles/app-tokens.css';
import '@/styles/app-view.css';

export default function AppViewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-viewport">
      <main className="app-main">
        <NativePullToRefresh>
          {children}
        </NativePullToRefresh>
      </main>
      <AppAnchorAd />
      <AppBottomNav />
      <NetworkStatus />
      <AppFirstRunOnboarding />
    </div>
  );
}
