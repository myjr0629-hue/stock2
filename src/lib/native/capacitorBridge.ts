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
// In-App Review (네이티브 별점) — @capacitor-community/in-app-review
// 런타임 브리지로만 호출하므로, 플러그인이 바이너리에 없으면(=현재 v1.0 셸)
// 자동 no-op. v1.1 바이너리(플러그인 포함)에서만 프롬프트가 뜬다.
// 애플/구글이 자체적으로 노출 빈도를 제한한다(StoreKit ≤3회/년).
// ---------------------------------------------------------------------------
export function canRequestReview(): boolean {
  if (!isNativeApp) return false;
  try {
    return !!(window as any).Capacitor?.Plugins?.InAppReview?.requestReview;
  } catch {
    return false;
  }
}

export async function requestAppReview(): Promise<boolean> {
  if (!canRequestReview()) return false;
  try {
    await (window as any).Capacitor.Plugins.InAppReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

// 진짜로 유지된(retained) 사용자에게만 노출: 앱을 사용한 "서로 다른 날"이
// 3일째·8일째 될 때 한 번씩. 네이티브가 추가로 throttle하므로 천장 아래로 조용히 유지된다.
// 첫 실행/온보딩 중에는 절대 뜨지 않는다(누적 사용일 기준이므로).
const REVIEW_DAYS_KEY = 'signumhq.review.days';
const REVIEW_DONE_KEY = 'signumhq.review.prompted';
const REVIEW_MILESTONES = [3, 8];

export function maybePromptReview(delayMs = 2500): void {
  if (!canRequestReview()) return;
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (local-agnostic key)
    const days: string[] = JSON.parse(localStorage.getItem(REVIEW_DAYS_KEY) || '[]');
    if (!days.includes(today)) {
      days.push(today);
      localStorage.setItem(REVIEW_DAYS_KEY, JSON.stringify(days.slice(-30)));
    }
    const prompted: number[] = JSON.parse(localStorage.getItem(REVIEW_DONE_KEY) || '[]');
    const hit = REVIEW_MILESTONES.find(m => days.length >= m && !prompted.includes(m));
    if (hit == null) return;
    prompted.push(hit);
    localStorage.setItem(REVIEW_DONE_KEY, JSON.stringify(prompted));
    // Delay so the prompt lands after the user is settled on the dashboard, not mid-transition.
    setTimeout(() => { requestAppReview(); }, delayMs);
  } catch { /* storage unavailable → skip */ }
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
