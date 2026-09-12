// ============================================================================
// NativeAppProvider — Capacitor 앱 전용 초기화 + 네이티브 기능 통합
// 웹/모바일웹에서는 완전 투명 (no-op)
// ============================================================================

'use client';

import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useProStatus } from '@/hooks/useProStatus';
import { resolveAppLocale } from '@/lib/appLocale';

// ---------------------------------------------------------------------------
// Native Detection (SSR-safe)
// ---------------------------------------------------------------------------
let _isNative = false;
let _platform: 'ios' | 'android' | 'web' = 'web';

if (typeof window !== 'undefined') {
  try {
    const { Capacitor } = require('@capacitor/core');
    _isNative = Capacitor.isNativePlatform();
    _platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  } catch { /* web mode */ }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface NativeAppState {
  isNative: boolean;
  platform: 'ios' | 'android' | 'web';
  isTransitioning: boolean;
  transitionDirection: 'forward' | 'back';
}

const NativeAppContext = createContext<NativeAppState>({
  isNative: false,
  platform: 'web',
  isTransitioning: false,
  transitionDirection: 'forward',
});

export const useNativeApp = () => useContext(NativeAppContext);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function NativeAppProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'back'>('forward');
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [mounted, setMounted] = useState(false);
  // Pro (ad-free) status — inert while IAP_LIVE=false (isPro=false, ready=true instantly).
  const { isPro, ready: proReady } = useProStatus();

  // Single driver of banner visibility: only once Pro status is KNOWN (proReady) do we
  // decide show (non-Pro) vs hide (Pro). This is why init() no longer shows the banner
  // itself — it defers to setPro so a subscriber never sees a cold-start banner flash.
  // Also gates interstitials. setPro is safe before adManager.init() completes.
  useEffect(() => {
    if (!_isNative || !proReady) return;
    import('@/services/adManager').then(({ adManager }) => adManager.setPro(isPro)).catch(() => {});
  }, [isPro, proReady]);

  // --- 앱 첫 진입 시 모바일 전용 뷰(/app-view/dash)로 리다이렉트 ---
  useEffect(() => {
    if (!_isNative || !mounted) return;

    if (pathname === '/' || pathname === '/ko' || pathname === '/en' || pathname === '/ja') {
      // Go straight to the user's saved locale (not the boot /en) — avoids an
      // English flash and keeps every native nav target on one source of truth.
      router.replace(`/${resolveAppLocale()}/app-view/dash`);
    }
  }, [pathname, mounted, router]);

  // --- Cold-start push deep-link: honor a tapped notification even when the
  // root→/dash launch redirect pre-empts the in-view listener's navigation. The
  // push handler (app-view/layout) persists the target; this provider lives since
  // the root, so we briefly poll for it after launch and replace to it if we aren't
  // already there. Fully inert unless a push was tapped (no key → nothing happens);
  // warm taps already navigated, so the path matches and we just clear the key. ---
  useEffect(() => {
    if (!_isNative || !mounted) return;
    const KEY = 'signumhq.pendingDeepLink';
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      let target: string | null = null;
      try { target = sessionStorage.getItem(KEY); } catch { /* storage off */ }
      if (target) {
        try { sessionStorage.removeItem(KEY); } catch {}
        const targetPath = target.split('?')[0];
        if (!window.location.pathname.startsWith(targetPath)) router.replace(target);
        clearInterval(id);
      } else if (tries >= 16) {
        clearInterval(id); // ~2.4s window, then stop polling
      }
    }, 150);
    return () => clearInterval(id);
  }, [mounted, router]);

  // --- 앱 초기화 (한 번만) ---
  useEffect(() => {
    setMounted(true);
    if (!_isNative) return;

    // Mark this session as the native SIGNUM app so the SERVER root layout keeps
    // the app chrome hidden across EVERY render — including a cross-locale client
    // (RSC) re-render triggered by a cold-start push deep-link (e.g. boot /en →
    // saved /ko). The iOS WKWebView UA does NOT contain "Capacitor" (no
    // appendUserAgent), so isAppView otherwise leans on request headers that can be
    // ambiguous on an RSC re-render — which flashed the WEB site chrome ("웹페이지")
    // when a market-close push opened /ko/app-view/intel. The cookie is a stable,
    // header-independent signal sent with every same-origin request incl. RSC fetches.
    // Web users never run this branch (isNativePlatform=false), so they are unaffected.
    try { document.cookie = 'sig_native=1; path=/; max-age=31536000; samesite=lax'; } catch {}

    (async () => {
      try {
        // 상태바 설정
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Dark });
        if (_platform === 'android') {
          await StatusBar.setBackgroundColor({ color: '#050a14' });
          await StatusBar.setOverlaysWebView({ overlay: false });
        }
      } catch {}

      try {
        // 스플래시 스크린 숨기기
        const { SplashScreen } = await import('@capacitor/splash-screen');
        if (_platform === 'ios') {
          // iOS: 흰 로딩 화면은 "다크 테마 CSS 적용 전 body 기본 흰 배경" 단계다.
          // 따라서 ① 앱 셸(.app-viewport)이 존재하고 ② 루트 배경이 더 이상 흰색이 아닐 때
          // (= 다크 CSS 적용 완료) 비로소 네이티브 다크 스플래시를 내린다 → 흰 깜빡임 제거.
          const hideSplash = () => { SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {}); };
          const start = Date.now();
          const isReady = () => {
            const hasShell = !!document.querySelector('.app-viewport');
            const bg = getComputedStyle(document.documentElement).backgroundColor || '';
            const notWhite = bg !== '' && bg !== 'rgba(0, 0, 0, 0)' && !/255,\s*255,\s*255/.test(bg);
            return (hasShell && notWhite) || Date.now() - start > 6000;
          };
          const tick = () => {
            if (isReady()) requestAnimationFrame(() => requestAnimationFrame(hideSplash));
            else setTimeout(tick, 80);
          };
          tick();
        } else {
          // 안드로이드: 기존 동작 그대로
          await SplashScreen.hide({ fadeOutDuration: 500 });
        }
      } catch {}

      try {
        // 키보드 설정 (iOS)
        if (_platform === 'ios') {
          const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
          await Keyboard.setResizeMode({ mode: KeyboardResize.Ionic });
          await Keyboard.setScroll({ isDisabled: false });
        }
      } catch {}

      try {
        // 앱 상태 변화 감지 (백그라운드 → 포그라운드)
        const { App } = await import('@capacitor/app');
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            // 포그라운드 복귀 시 데이터 리프레시
            document.dispatchEvent(new CustomEvent('app:resume'));
          }
        });

        // 하드웨어 뒤로가기 (Android)
        if (_platform === 'android') {
          App.addListener('backButton', ({ canGoBack }) => {
            if (canGoBack) {
              window.history.back();
            } else {
              App.minimizeApp();
            }
          });
        }
      } catch {}

      // 앱 전용 CSS 클래스 추가
      document.documentElement.classList.add('native-app');
      document.documentElement.classList.add(`native-${_platform}`);

      // --- AdManager 초기화 (배너 노출은 setPro 이펙트가 Pro 확정 후 결정) ---
      try {
        const { adManager } = await import('@/services/adManager');
        await adManager.init();
        // NOTE: no showBanner() here — the setPro(isPro) effect above owns banner
        // visibility so a Pro subscriber never sees a cold-start flash. init() applies
        // the pending wantBanner state itself if setPro already ran.
      } catch (e) {
        console.warn('[NativeAppProvider] AdManager init skipped:', e);
      }
    })();
  }, []);

  // --- ★ 아펙스 도메인 탈출 차단 (네이티브 전용) --------------------------
  //
  // [왜 있는가] 2026-09-13 대표 보고: 앱을 켜둔 채 다른 일을 하다 «전환»해서
  //   돌아오거나 전면광고를 닫았을 때, 앱은 그대로인데 크롬 창이 따로 뜬다.
  //   스크린샷의 주소창이 «www 없는» signumhq.com 이었다.
  //
  // [원인] 기기에 설치된 네이티브 설정에 `server.allowNavigation` 이 없다
  //   (android/app/src/main/assets/capacitor.config.json 실측 — 릴리스 자산도 동일).
  //   그 상태에서 Capacitor 는 `server.url` 호스트(www.signumhq.com) «이외의 모든
  //   호스트»를 시스템 브라우저로 넘긴다. 우리 아펙스 도메인도 «다른 호스트»다.
  //   → 앱은 WebView 에 남고 크롬만 따로 뜨는, 정확히 그 증상이 된다.
  //
  // [왜 여기서 막는가] capacitor.config.ts 쪽 허용목록 수정은 **네이티브 리빌드가
  //   있어야** 기기에 닿는다. 이 가드는 웹 배포만으로 «오늘» 닿는다.
  //   둘 다 필요하다 — 이건 리빌드 전까지의 방어선이자, 리빌드 후에도
  //   아펙스로 새는 링크를 www 로 정규화해 주는 안전망이다.
  //
  // [무엇을 막고 무엇을 통과시키는가] 우리 «아펙스»로 가는 이동만 www 로 되돌린다.
  //   진짜 외부 도메인(뉴스 원문 등)은 건드리지 않는다 — 그건 밖에서 열리는 게 맞다.
  useEffect(() => {
    if (!_isNative) return;

    const APEX = 'signumhq.com';
    const CANON = 'www.signumhq.com';

    const toCanonical = (raw: string): string | null => {
      try {
        const u = new URL(raw, window.location.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        if (u.hostname !== APEX) return null;   // 아펙스일 때만 손댄다
        u.hostname = CANON;
        u.protocol = 'https:';
        return u.toString();
      } catch { return null; }
    };

    // 1) 링크 클릭 — 캡처 단계에서 아펙스를 www 로 바꿔 «앱 안에서» 연다.
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!el) return;
      const fixed = toCanonical(el.getAttribute('href') || '');
      if (!fixed) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.assign(fixed);
    };
    document.addEventListener('click', onClick, true);

    // 2) window.open — 아펙스면 새 창 대신 현재 WebView 에서 연다.
    const nativeOpen = window.open;
    window.open = function (url?: string | URL, target?: string, features?: string) {
      const fixed = typeof url === 'string' ? toCanonical(url) : null;
      if (fixed) { window.location.assign(fixed); return null; }
      return nativeOpen.call(window, url as never, target as never, features as never);
    } as typeof window.open;

    return () => {
      document.removeEventListener('click', onClick, true);
      window.open = nativeOpen;
    };
  }, []);

  // --- 페이지 전환 애니메이션 ---
  useEffect(() => {
    if (!_isNative || !mounted) return;
    if (pathname === prevPathname) return;

    // 네비게이션 히스토리 기반 방향 결정
    const navStack = JSON.parse(sessionStorage.getItem('__nav_stack') || '[]');
    const lastIdx = navStack.lastIndexOf(pathname);

    if (lastIdx !== -1) {
      // 이전에 방문한 페이지 → 뒤로가기
      setTransitionDirection('back');
      navStack.splice(lastIdx + 1);
    } else {
      // 새 페이지 → 앞으로가기
      setTransitionDirection('forward');
      navStack.push(pathname);
    }
    sessionStorage.setItem('__nav_stack', JSON.stringify(navStack.slice(-20)));

    // 전환 애니메이션 트리거
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 350);
    setPrevPathname(pathname);

    // (Tap haptics are handled globally in the app-view layout for every
    // interactive tap — iOS + Android. A per-navigation buzz here would
    // double up with that on bottom-nav taps, so it's intentionally gone.)

    return () => clearTimeout(timer);
  }, [pathname, prevPathname, mounted]);

  // SSR 및 첫 클라이언트 렌더 시점(마운트 전)에는 서버와 동일하게 children만 렌더링 (Hydration mismatch 방지)
  if (!mounted) {
    return <>{children}</>;
  }

  // 웹 모드에서는 투명하게 children만 렌더링
  if (!_isNative) {
    return <>{children}</>;
  }

  return (
    <NativeAppContext.Provider value={{
      isNative: _isNative,
      platform: _platform,
      isTransitioning,
      transitionDirection,
    }}>
      {/* Safe Area Wrapper */}
      <div
        className="native-app-root"
        style={{
          minHeight: '100dvh',
          // 상단 세이프영역은 네이티브 contentInset:'always'가 처리한다.
          // 여기서 env(safe-area-inset-top)을 또 주면 이중 인셋(상단 갭)이 되므로 제거.
          overflow: 'hidden',
        }}
      >
        {/* Page Transition Wrapper */}
        <div
          className={`native-page-content ${isTransitioning ? `native-transition-${transitionDirection}` : 'native-transition-idle'}`}
        >
          {children}
        </div>
      </div>
    </NativeAppContext.Provider>
  );
}
