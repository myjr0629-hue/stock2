// ============================================================================
// Capacitor Native Bridge — 앱 전용 네이티브 기능 헬퍼
// 웹에서 호출해도 안전 (isNative=false이면 no-op)
// ============================================================================

'use client';

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------
let _isNative = false;
let _platform: 'ios' | 'android' | 'web' = 'web';

try {
  // Dynamic import to avoid SSR issues
  if (typeof window !== 'undefined') {
    const { Capacitor } = require('@capacitor/core');
    _isNative = Capacitor.isNativePlatform();
    _platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  }
} catch {
  // Not in Capacitor context — web mode
}

export const isNativeApp = _isNative;
export const platform = _platform;

// ---------------------------------------------------------------------------
// Status Bar (앱에서만)
// ---------------------------------------------------------------------------
export async function configureStatusBar() {
  if (!isNativeApp) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#080c14' });
  } catch (e) {
    console.warn('[NativeBridge] StatusBar error:', e);
  }
}

// ---------------------------------------------------------------------------
// Splash Screen
// ---------------------------------------------------------------------------
export async function hideSplashScreen() {
  if (!isNativeApp) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch (e) {
    console.warn('[NativeBridge] SplashScreen error:', e);
  }
}

// ---------------------------------------------------------------------------
// Haptics (앱에서 더 정밀한 진동)
// ---------------------------------------------------------------------------
export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'medium') {
  if (!isNativeApp) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const styleMap = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    };
    await Haptics.impact({ style: styleMap[style] });
  } catch {
    // Fallback: web vibration API
    if (navigator.vibrate) navigator.vibrate(10);
  }
}

export async function hapticNotification(type: 'success' | 'warning' | 'error' = 'success') {
  if (!isNativeApp) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    const typeMap = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    };
    await Haptics.notification({ type: typeMap[type] });
  } catch {}
}

// ---------------------------------------------------------------------------
// Keyboard (앱에서 키보드 제어)
// ---------------------------------------------------------------------------
export async function hideKeyboard() {
  if (!isNativeApp) return;
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.hide();
  } catch {}
}

// ---------------------------------------------------------------------------
// App State (앱 포그라운드/백그라운드 감지)
// ---------------------------------------------------------------------------
export async function onAppStateChange(callback: (isActive: boolean) => void) {
  if (!isNativeApp) return;
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('appStateChange', ({ isActive }) => {
      callback(isActive);
    });
  } catch {}
}

// ---------------------------------------------------------------------------
// Deep Link 처리
// ---------------------------------------------------------------------------
export async function onDeepLink(callback: (url: string) => void) {
  if (!isNativeApp) return;
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('appUrlOpen', ({ url }) => {
      callback(url);
    });
  } catch {}
}

// ---------------------------------------------------------------------------
// Safe Area Insets (노치/홈바 영역)
// ---------------------------------------------------------------------------
export function getSafeAreaInsets(): { top: number; bottom: number } {
  if (!isNativeApp) return { top: 0, bottom: 0 };

  // CSS env() 값 읽기
  const style = getComputedStyle(document.documentElement);
  const top = parseInt(style.getPropertyValue('--sat') || '0', 10);
  const bottom = parseInt(style.getPropertyValue('--sab') || '0', 10);

  return {
    top: top || (platform === 'ios' ? 47 : 24),
    bottom: bottom || (platform === 'ios' ? 34 : 0),
  };
}

// ---------------------------------------------------------------------------
// Open External URL (앱 내 브라우저)
// ---------------------------------------------------------------------------
export async function openExternalUrl(url: string) {
  if (!isNativeApp) {
    window.open(url, '_blank');
    return;
  }
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } catch {
    window.open(url, '_blank');
  }
}
