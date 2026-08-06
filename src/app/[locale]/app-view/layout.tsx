'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppBottomNav } from '@/components/app/AppBottomNav';
import { NetworkStatus } from '@/components/app/NetworkStatus';
import { AppFirstRunOnboarding } from '@/components/app/AppFirstRunOnboarding';
import { AppAnchorAd } from '@/components/app/AppAnchorAd';
import { usePathname } from '@/i18n/routing';
import { resolveAppLocale } from '@/lib/appLocale';
import { watchBottomSafe } from '@/utils/androidBottomInset';
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

    // The user's EXPLICIT in-app choice wins; otherwise device language, else 'en'.
    // Single source of truth (resolveAppLocale) — same resolution the push deep-link
    // uses, so the app never disagrees with itself about which locale to be in.
    const desired = resolveAppLocale();

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
            // Resolve the deep-link locale from the SAVED choice, NEVER from
            // window.location: on a cold-start push tap the path is still the shell's
            // boot /en (server.url), so reading it opened the report in English even
            // for Korean users. This was the market-close-report language bug.
            const loc = resolveAppLocale();
            const target = type === 'morning'
              // Guardian overview → auto-open the AI morning-briefing report overlay.
              ? `/${loc}/app-view/guardian?tab=overview&brief=1`
              : type === 'closing'
                ? `/${loc}/app-view/intel`
                : null;
            if (!target) return;
            // Persist the target so a COLD-start tap survives the root→/dash launch
            // redirect that would otherwise clobber this navigation. The plugin buffers
            // this action (retainUntilConsumed:true), so on cold start it fires only once
            // the app-view layout has mounted — i.e. right after the dash redirect. The
            // consumer in NativeAppProvider (alive since the root) re-applies the target.
            try { sessionStorage.setItem('signumhq.pendingDeepLink', target); } catch { /* storage off */ }
            router.push(target);
          },
        );
        remove = () => { try { handle.remove(); } catch {} };
      } catch { /* plugin unavailable (web) */ }
    })();
    return () => { remove?.(); };
  }, [router]);

  // ── Native-only: tactile feedback on every interactive tap (iOS + Android). ──
  // iOS has no Web Vibration API (navigator.vibrate is a no-op), so taps felt
  // "dead" vs Android. Capacitor Haptics works on both. One delegated listener
  // covers all buttons/tabs/links/ⓘ — fires a Light impact on each genuine tap.
  useEffect(() => {
    let isNative = false;
    try { isNative = require('@capacitor/core').Capacitor.isNativePlatform(); } catch { /* web */ }
    if (!isNative) return;

    let impact: ((opts: { style: unknown }) => Promise<void>) | null = null;
    let lightStyle: unknown = undefined;
    let disposed = false;
    (async () => {
      try {
        // @ts-ignore — native-only plugin
        const m: any = await import('@capacitor/haptics');
        if (disposed) return;
        impact = (opts) => m.Haptics.impact(opts);
        lightStyle = m.ImpactStyle.Light;
      } catch { /* plugin unavailable */ }
    })();

    const onTap = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest('button, a, [role="button"], [role="tab"], .info-btn')) return;
      impact?.({ style: lightStyle }).catch(() => {});
    };
    document.addEventListener('click', onTap, true);
    return () => { disposed = true; document.removeEventListener('click', onTap, true); };
  }, []);

  // ── 안드로이드: 이미 인셋된 웹뷰에 내비바 높이를 «또» 더하는 것을 막는다 ──────
  // --sig-bottom-floor 는 네이티브 셸이 게시하는데, «웹뷰가 시스템 바 아래까지
  // 그릴 때만» 더해야 맞는 값이다. 셸 버전에 따라 이미 인셋된 웹뷰에도 내비바
  // 높이를 실어 보내면 이중 인셋이 되어 탭바가 화면 중간에 뜬 것처럼 보인다.
  // (같은 폰에서 WIM(최신 셸)은 정상인데 SIGNUM 만 떠 보인 정황 — 2026-08-06)
  //
  // ⚠️ 판단이 안 서면 «건드리지 않는다». 화면보다 웹뷰가 확실히 작을 때만 0 으로
  //    눌러쓴다. screen.height 가 실제보다 작게 보고되는 기기에서는 조건이 성립하지
  //    않아 아무 일도 일어나지 않는다(= 지금 동작 유지). 반대로 잘못 0 을 넣어
  //    탭바가 내비바 밑으로 숨는 일은 생기지 않는다.
  //
  // ★ 2026-08-06 실기기 실측(UC 진단 표시)로 원인이 하나 더 나왔다:
  //   셸이 --*-bottom-floor 를 **물리 픽셀**로 게시하는 빌드가 있다(126px = 48dp×2.625).
  //   같은 화면에서 env() 는 48px 로 정확했다. 그래서 «env() 우선 + 셸 값은 단위 보정»
  //   규칙을 utils/androidBottomInset 으로 뽑아 UC 와 공유한다.
  useEffect(() => {
    if (!document.documentElement.classList.contains('native-android')) return;
    return watchBottomSafe('--sig-bottom-floor', (px) => {
      const vp = document.querySelector('.app-viewport') as HTMLElement | null;
      if (vp) vp.style.setProperty('--app-bottom-safe', `${px}px`);
    });
  }, []);

  // Tag html element for app-only CSS (fallback for :has() on older WebViews)
  // + block pull-to-refresh at JS level
  useEffect(() => {
    document.documentElement.classList.add('is-app-view');

    let startY = 0;
    let startedOnControl = false;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      // Remember if the touch began on an interactive control. We must NEVER
      // preventDefault during a tap on a control: on iOS that cancels the
      // synthesized click, which made the bottom nav, page tabs and ⓘ buttons
      // tap unreliably ("works off-centre, not dead-centre"). Android is unaffected.
      const t = e.target as HTMLElement | null;
      startedOnControl = !!t?.closest('button, a, [role="button"], [role="tab"], input, select, label, .info-btn');
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startedOnControl) return; // taps on controls are sacred — never block them
      const y = e.touches[0].clientY;
      if (y - startY <= 10) return; // ignore tiny wobble of a tap; only act on a real drag
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
