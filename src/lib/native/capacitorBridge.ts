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

// 설정 화면의 «앱 평가하기» 행 전용 — 항상 «눈에 보이는» 결과를 낸다.
// iOS 의 SKStoreReviewController(위 requestAppReview)는 애플이 노출을 통제해
// 프로덕션에서 조용히 무시되는 경우가 대부분(≤3회/년) → 사용자가 눌러도
// 아무 일도 안 일어난 것처럼 보인다(2026-08-08 실기기 보고). 그래서:
//   iOS      → App Store 리뷰 작성 딥링크 (항상 스토어 리뷰 시트가 뜬다)
//   Android  → Google Play 인앱 리뷰 시트 (실기기 동작 확인됨) → 실패 시 Play 상세로
// 자동 마일스톤 프롬프트(maybePromptReview)는 조용한 API 를 그대로 쓴다 — 그게 원래 용도.
const IOS_WRITE_REVIEW_URL =
  'https://apps.apple.com/app/id6783130444?action=write-review';
const PLAY_DETAILS_URL =
  'https://play.google.com/store/apps/details?id=com.signumhq.app';

export async function openStoreReview(): Promise<void> {
  if (platform === 'ios') {
    openExternalUrl(IOS_WRITE_REVIEW_URL);
    return;
  }
  if (platform === 'android') {
    const shown = await requestAppReview();
    if (!shown) openExternalUrl(PLAY_DETAILS_URL);
    return;
  }
  // 웹(개발 확인용) — 스토어 페이지로
  openExternalUrl(IOS_WRITE_REVIEW_URL);
}

// 네이티브 바이너리의 실제 버전 (@capacitor/app App.getInfo). 플러그인이 바이너리에
// 없으면 null → 호출부가 폴백 문자열을 쓴다. 웹 하드코딩(v1.0.0) 표기가 v1.1 바이너리와
// 어긋났던 문제(2026-08-08)의 근본 해결.
export async function getNativeAppVersion(): Promise<string | null> {
  if (!isNativeApp) return null;
  try {
    const info = await (window as any).Capacitor?.Plugins?.App?.getInfo?.();
    return info?.version || null;
  } catch {
    return null;
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
    // Local calendar date (NOT toISOString, which is UTC — that would split one
    // KST/JST day into two across the UTC-midnight boundary and over-count "days").
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
