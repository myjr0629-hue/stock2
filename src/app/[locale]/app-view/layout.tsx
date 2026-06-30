'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppBottomNav } from '@/components/app/AppBottomNav';
import { NetworkStatus } from '@/components/app/NetworkStatus';
import { AppFirstRunOnboarding } from '@/components/app/AppFirstRunOnboarding';
import { AppAnchorAd } from '@/components/app/AppAnchorAd';
import { usePathname } from '@/i18n/routing';
import '@/styles/app-tokens.css';
import '@/styles/app-view.css';

export default function AppViewLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isDocumentRoute = pathname?.includes('/app-view/terms') ||
    pathname?.includes('/app-view/privacy') ||
    pathname?.includes('/app-view/onboarding');
  const isSettingsRoute = pathname?.includes('/app-view/settings');
  const hideAd = isDocumentRoute || isSettingsRoute;

  // ── Native-only: start in the device's language (or the user's saved choice). ──
  // IMPORTANT: this performs only a SAME-ORIGIN client navigation. It never makes the
  // WebView's initial server.url load return a redirect, so the in-app browser / Safari
  // can never be triggered (that was the failure mode of a server-side 307). Web is
  // untouched (guarded by isNativePlatform). Loop-safe: after redirecting, current===desired.
  useEffect(() => {
    let isNative = false;
    try { isNative = require('@capacitor/core').Capacitor.isNativePlatform(); } catch { /* web */ }
    if (!isNative) return;

    const SUPPORTED = ['ko', 'en', 'ja'];
    const path = window.location.pathname;
    const seg = path.split('/')[1];
    const current = SUPPORTED.includes(seg) ? seg : 'en';

    // The user's EXPLICIT in-app choice wins; otherwise use the device language.
    // We deliberately IGNORE the NEXT_LOCALE cookie: next-intl auto-sets it to the
    // loaded /en/ locale, which would otherwise pin the app to English forever.
    let desired = '';
    try {
      const saved = localStorage.getItem('signumhq.app.locale');
      if (saved && SUPPORTED.includes(saved)) desired = saved;
    } catch { /* storage unavailable */ }
    if (!desired) {
      const dev = (navigator.language || 'en').slice(0, 2).toLowerCase();
      desired = SUPPORTED.includes(dev) ? dev : 'en';
    }

    if (desired !== current) {
      const rest = path.replace(/^\/(ko|en|ja)(?=\/|$)/, '') || '/app-view/dash';
      // Use the Next.js router (client-side SPA navigation) — NOT window.location,
      // which Capacitor treats as a top-level navigation and opens in an in-app
      // Safari. A router push/replace stays inside the WebView (same mechanism the
      // in-app language switcher uses).
      router.replace(`/${desired}${rest}`);
    }
  }, [router]);

  // ── Native-only: deep-link when a push notification is tapped. ──
  // closing report → Intel page, morning brief → Guardian page.
  useEffect(() => {
    let isNative = false;
    try { isNative = require('@capacitor/core').Capacitor.isNativePlatform(); } catch { /* web */ }
    if (!isNative) return;

    let remove: (() => void) | undefined;
    (async () => {
      try {
        // @ts-ignore — native-only plugin
        const PushMod: any = await import('@capacitor/push-notifications');
        const handle = await PushMod.PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action: { notification?: { data?: Record<string, string> } }) => {
            const type = action?.notification?.data?.type;
            const target = type === 'morning' ? 'guardian' : type === 'closing' ? 'intel' : null;
            if (!target) return;
            const seg = window.location.pathname.split('/')[1];
            const loc = ['ko', 'en', 'ja'].includes(seg) ? seg : 'en';
            router.push(`/${loc}/app-view/${target}`);
          },
        );
        remove = () => { try { handle.remove(); } catch {} };
      } catch { /* plugin unavailable (web) */ }
    })();
    return () => { remove?.(); };
  }, [router]);

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
