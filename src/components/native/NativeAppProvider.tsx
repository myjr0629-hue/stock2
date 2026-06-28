// ============================================================================
// NativeAppProvider — Capacitor 앱 전용 초기화 + 네이티브 기능 통합
// 웹/모바일웹에서는 완전 투명 (no-op)
// ============================================================================

'use client';

import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { usePathname, useRouter } from 'next/navigation';

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

  // --- 앱 첫 진입 시 모바일 전용 뷰(/app-view/dash)로 리다이렉트 ---
  useEffect(() => {
    if (!_isNative || !mounted) return;

    if (pathname === '/' || pathname === '/ko' || pathname === '/en' || pathname === '/ja') {
      const targetLocale = pathname === '/' ? 'en' : pathname.split('/')[1] || 'en';
      router.replace(`/${targetLocale}/app-view/dash`);
    }
  }, [pathname, mounted, router]);

  // --- 앱 초기화 (한 번만) ---
  useEffect(() => {
    setMounted(true);
    if (!_isNative) return;

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

      // --- AdManager 초기화 + 배너 광고 시작 ---
      try {
        const { adManager } = await import('@/services/adManager');
        await adManager.init();
        await adManager.showBanner();
      } catch (e) {
        console.warn('[NativeAppProvider] AdManager init skipped:', e);
      }
    })();
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

    // 햅틱 피드백
    (async () => {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {}
    })();

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
