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

  // --- ★ 「앱은 그대로인데 크롬 창이 따로 뜨는」 버그 차단 (네이티브 전용) -----
  //
  // [증상] 2026-09-13 대표 보고: 앱을 켜둔 채 다른 일을 하다 «전환»해 돌아오거나
  //   전면광고를 닫았을 때, 앱은 멀쩡한데 크롬 창이 따로 뜨고 거기에 «우리 앱이
  //   처음 실행된 것처럼» 고지 화면이 보인다. 매번은 아니고 시간이 지난 뒤에만.
  //
  // [진짜 원인 — Capacitor iOS 소스 실측]
  //   WebViewDelegationHandler.decidePolicyFor 의 판정은 두 단계다.
  //     1) config.shouldAllowNavigation(host)  ← allowNavigation 목록
  //     2) navURL.absoluteString.starts(with: config.serverURL.absoluteString)
  //   그런데 `serverURL` 은 호스트가 아니라 **전체 URL** 이다:
  //     https://www.signumhq.com/en/app-view/dash
  //   기기에 깔린 빌드에는 allowNavigation 이 «없어서» 1)이 항상 false 였고,
  //   그러면 **같은 도메인이라도 경로가 /en/app-view/dash 로 시작하지 않는 모든
  //   전체 페이지 로드가 UIApplication.open() 으로 시스템 브라우저에 넘어간다.**
  //   (앞서 나는 이걸 «아펙스 도메인» 문제로 잘못 짚었다. 크롬 주소창이 www 를
  //    떼고 보여준 것에 속았다. 호스트가 아니라 «경로»가 원인이다.)
  //
  // [왜 가끔, 왜 복귀할 때만] Next 의 클라이언트 라우팅은 pushState 라 이 판정을
  //   타지 않는다. 판정을 타는 건 «전체 페이지 로드»뿐이다 — WebView 가 메모리
  //   압박으로 폐기된 뒤 복귀 시 마지막 URL 을 다시 로드할 때가 대표적이다.
  //   그때 마지막 URL 이 /ko/app-view/intel 같은 다른 경로면 그대로 밖으로 튕긴다.
  //   전면광고는 메모리를 크게 쓰므로 폐기 확률을 올린다. 전부 들어맞는다.
  //
  // [이 가드가 할 수 있는 것 / 없는 것]
  //   할 수 있는 것: «우리 코드가 일으키는» 전체 로드를 클라이언트 라우팅으로
  //     바꿔 판정 자체를 타지 않게 한다. 이건 웹 배포로 오늘 적용된다.
  //   할 수 없는 것: WebView 폐기 후 «네이티브가 하는» 재로드. 이건 JS 가 못 막는다.
  //     → 그건 allowNavigation 을 넣은 **네이티브 리빌드**로만 닫힌다.
  useEffect(() => {
    if (!_isNative) return;

    const OURS = new Set(['www.signumhq.com', 'signumhq.com']);

    // 우리 사이트면 «앱 안에서» 열 경로를 돌려준다. 아니면 null(= 밖에서 열려야 함).
    const internalPathOf = (raw: string): string | null => {
      try {
        const u = new URL(raw, window.location.href);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
        if (!OURS.has(u.hostname)) return null;
        return `${u.pathname}${u.search}${u.hash}`;
      } catch { return null; }
    };

    // 1) 링크 클릭 — 우리 사이트로 가는 전체 로드를 클라이언트 라우팅으로 바꾼다.
    //    (Next <Link> 는 원래 pushState 라 안전하다. 문제는 평범한 <a> 다.)
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      if (a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#')) return;
      const path = internalPathOf(href);
      if (!path) return;                       // 진짜 외부 링크 → 밖에서 열리는 게 맞다
      e.preventDefault();
      e.stopPropagation();
      router.push(path);
    };
    document.addEventListener('click', onClick, true);

    // 2) window.open — 우리 사이트면 새 창 대신 앱 안에서 연다.
    //    (iOS 는 createWebViewWith 에서 호스트를 보지도 않고 밖으로 넘긴다.)
    const nativeOpen = window.open;
    window.open = function (url?: string | URL, target?: string, features?: string) {
      const path = typeof url === 'string' ? internalPathOf(url) : null;
      if (path) { router.push(path); return null; }
      return nativeOpen.call(window, url as never, target as never, features as never);
    } as typeof window.open;

    // 3) ★ 이미 설치된 «옛 바이너리»를 업데이트 없이 구해내는 장치.
    //
    //    [문제] iOS 는 앱이 백그라운드에 오래 있으면 웹뷰 내용을 폐기한다.
    //    복귀하면 웹뷰가 «현재 주소»를 전체 로드로 다시 읽는데, 그때 Capacitor 가
    //    판정한다(WebViewDelegationHandler.decidePolicyFor):
    //      ① allowNavigation 목록  ② 주소가 serverURL «문자열 전체»로 시작하는가
    //    옛 바이너리는 ①이 비어 있고 ②의 serverURL 이 `/en/app-view/dash` 까지라,
    //    **대시보드가 아닌 화면에 있다가 복귀하면 전부 탈락** →
    //    UIApplication.open(...) → 시스템 브라우저 창이 따로 뜬다.
    //    (13개 화면 중 12개가 해당. 그래서 「가끔」 처럼 보였다.)
    //
    //    [해법] 판정은 네이티브가 하지만, «무엇을 다시 읽을지»는 우리가 정한다.
    //    백그라운드로 갈 때 주소창만 안전한 접두사로 바꿔 두면, 복귀 시 리로드가
    //    ②를 통과해 앱 안에 머문다. 돌아오면 원래 화면으로 되돌린다.
    //    새 바이너리에는 ①이 있어 필요 없지만, 있어도 해롭지 않다.
    const SAFE = '/en/app-view/dash';
    const KEY = 'signum.nativeRestorePath';
    const MAX_AGE_MS = 2 * 60 * 60 * 1000;   // 2시간 — 다음 날 실행은 대시보드로

    const here = () => `${location.pathname}${location.search}${location.hash}`;

    const stash = () => {
      try {
        if (location.pathname.startsWith(SAFE)) return;   // 이미 안전하다
        localStorage.setItem(KEY, JSON.stringify({ p: here(), t: Date.now() }));
        history.replaceState(history.state, '', SAFE);
      } catch { /* 저장소가 막혀 있으면 그냥 둔다 — 최악이라도 지금과 같다 */ }
    };

    // 리로드가 «일어나지 않고» 그냥 돌아온 경우: 주소만 원래대로 되돌린다.
    const unstash = () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        localStorage.removeItem(KEY);
        const { p, t } = JSON.parse(raw);
        if (!p || Date.now() - t > MAX_AGE_MS) return;
        if (location.pathname.startsWith(SAFE)) history.replaceState(history.state, '', p);
      } catch { /* noop */ }
    };

    //    ※ pagehide 는 일부러 쓰지 않는다. 그건 «진짜 이동»에서도 발동해서,
    //      사용자가 다른 데로 가는 중인데 저장해 뒀다가 되돌려 버릴 수 있다.
    //      그리고 iOS 가 웹뷰를 폐기할 때는 통보 없이 죽이므로 pagehide 가 오지도 않는다.
    //      백그라운드 전환 신호는 visibilitychange 하나로 충분하다.
    const onVisibility = () => { document.visibilityState === 'hidden' ? stash() : unstash(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.open = nativeOpen;
    };
  }, [router]);

  // 리로드가 «실제로 일어난» 경우: SAFE 로 로드됐을 테니 원래 화면으로 되돌린다.
  // 위 이펙트의 unstash 는 주소만 고치고, 이건 화면까지 되돌린다(클라이언트 라우팅).
  useEffect(() => {
    if (!_isNative) return;
    try {
      const raw = localStorage.getItem('signum.nativeRestorePath');
      if (!raw) return;
      localStorage.removeItem('signum.nativeRestorePath');
      const { p, t } = JSON.parse(raw);
      if (!p || Date.now() - t > 2 * 60 * 60 * 1000) return;
      if (p !== `${location.pathname}${location.search}${location.hash}`) router.replace(p);
    } catch { /* noop */ }
    // 최초 1회만 — 의존성에 pathname 을 넣으면 매 전환마다 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
