'use client';

import { AppBottomNav } from '@/components/app/AppBottomNav';
import '@/styles/app-tokens.css';
import '@/styles/app-view.css';

export default function AppViewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-viewport">
      <main className="app-main">
        {children}
      </main>
      <AppBottomNav />
    </div>
  );
}
