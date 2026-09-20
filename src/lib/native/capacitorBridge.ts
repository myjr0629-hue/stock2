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
// ★2026-09-20 대표 실기기 보고로 두 결함을 같이 고쳤다.
//   ① 스토어 식별자가 **SIGNUM 것으로 하드코딩**돼 있었다 → UC·WIM 이 이 함수를 쓰면
//      «남의 앱» 리뷰 페이지로 간다. 그래서 두 앱은 아예 이 함수를 못 쓰고 조용한 API 를
//      직접 부르고 있었고, 그게 「눌러도 아무 일도 안 일어난다」의 원인이었다.
//   ② `openExternalUrl` 은 @capacitor/browser(= iOS SFSafariViewController)로 연다.
//      앱스토어 딥링크를 «인앱 브라우저»로 열면 네이티브 리뷰 시트가 뜨지 않는다.
//      스토어로 넘기려면 **시스템 핸들러**로 보내야 한다(App.openUrl).
export type ReviewApp = 'signum' | 'uc' | 'wim';

const STORE_IDS: Record<ReviewApp, { ios: string; android: string }> = {
  signum: { ios: '6783130444', android: 'com.signumhq.app' },
  uc:     { ios: '6788779895', android: 'com.signumhq.undercurrent' },
  wim:    { ios: '6794356135', android: 'com.signumhq.wim' },
};

// 시스템 핸들러로 연다(인앱 브라우저가 아니라 «앱 밖»).
// ⚠️ `@capacitor/app` 에는 openUrl 이 **없다**(Capacitor 3 에서 제거됐고, 이 저장소의
//    8.x 정의 파일에도 없음을 확인했다). `@capacitor/browser` 는 «인앱» 브라우저라
//    스토어 앱을 깨우지 못한다 — 리뷰 버튼이 죽어 보이던 두 번째 원인이 이것이다.
//    쓸 수 있는 성질은 하나다: **Capacitor 는 http(s) 가 아닌 스킴으로의 내비게이션을
//    가로채 시스템으로 넘긴다**(iOS UIApplication.open · Android Intent).
//    그래서 itms-apps:// · market:// 로 «이동»시킨다.
// 스킴이 안 먹으면 화면에 아무 일도 안 일어나므로, 앱이 백그라운드로 가지 않았을 때만
// https 로 폴백한다(사용자가 최소한 «보이는 결과»를 얻게 한다 — 이 함수의 원래 목적).
function openSystemUrl(schemeUrl: string, httpsFallback: string): void {
  if (!isNativeApp) { window.open(httpsFallback, '_blank'); return; }
  let left = false;
  const onVis = () => { if (document.visibilityState === 'hidden') left = true; };
  try { document.addEventListener('visibilitychange', onVis); } catch { /* noop */ }
  try {
    window.location.href = schemeUrl;
  } catch {
    try { document.removeEventListener('visibilitychange', onVis); } catch { /* noop */ }
    openExternalUrl(httpsFallback);
    return;
  }
  window.setTimeout(() => {
    try { document.removeEventListener('visibilitychange', onVis); } catch { /* noop */ }
    if (!left) openExternalUrl(httpsFallback);
  }, 1500);
}

export async function openStoreReview(app: ReviewApp = 'signum'): Promise<void> {
  const id = STORE_IDS[app] || STORE_IDS.signum;
  const iosHttps = `https://apps.apple.com/app/id${id.ios}?action=write-review`;
  const iosScheme = `itms-apps://apps.apple.com/app/id${id.ios}?action=write-review`;
  const playHttps = `https://play.google.com/store/apps/details?id=${id.android}`;
  const playScheme = `market://details?id=${id.android}`;

  if (platform === 'ios') {
    openSystemUrl(iosScheme, iosHttps);
    return;
  }
  if (platform === 'android') {
    // ★2026-09-21 대표 실기기(Android 13) 보고 수리: 「눌러도 이동하지 않는다」.
    //   원인: 여기서 먼저 부르던 `requestAppReview()` 는 **예외가 안 나면 무조건 true** 를 준다.
    //   그런데 Play 인앱 리뷰 API 는 **아무것도 띄우지 않아도 정상 resolve** 한다
    //   (할당량 소진·이미 리뷰함·기기 조건 불충족 등 — 구글이 표시를 통제한다).
    //   그래서 `shown === true` 가 되어 **스토어로 보내는 폴백을 영영 안 탔다** → 화면상 무반응.
    //   iOS 는 같은 이유로 이미 조용한 API 를 건너뛰고 있었는데(SKStoreReviewController)
    //   **안드로이드만 옛 경로로 남아 있었다** — 한쪽만 고친 불일치였다.
    //   수동 버튼은 «항상 눈에 보이는 결과»가 원칙이다 → iOS 와 똑같이 스토어로 직접 보낸다.
    //   (조용한 인앱 시트는 자동 프롬프트 `maybePromptReview` 의 몫으로 남긴다 — 그게 원래 용도다.)
    openSystemUrl(playScheme, playHttps);
    return;
  }
  // 웹(개발 확인용) — 스토어 페이지로
  openExternalUrl(iosHttps);
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

// 유지된(retained) 사용자에게만 노출한다. 첫 실행/온보딩 중에는 절대 뜨지 않는다.
//
// ★ 2026-09-19 실측으로 기준을 내렸다 — 예전 기준(3일째·8일째)은 «도달 불가»였다.
//   Play 콘솔 28일: 노출 2,190 → 등록정보 열람 약 11 → 설치 7 → 첫 실행 6 → **7일 잔존 1대**.
//   「서로 다른 날 3일째」에 닿는 사용자가 사실상 없어 **리뷰 요청이 뜬 적이 없다.**
//   그 결과 세 앱 모두 Play 별점 0개·리뷰 0건이고, 별 없는 줄은 검색 결과에서 건너뛰어진다
//   (노출→열람 0.5%). 별점 없음 → 안 눌림 → 설치 적음 → 잔존 적음 → 평점 없음 의 «닫힌 고리».
//
//   그래서 두 갈래로 연다:
//     ① 서로 다른 사용일 2일째·7일째  ② 누적 앱 실행 4회째 (같은 날 여러 번 여는 사용자)
//   둘 중 먼저 닿는 쪽에서 한 번. 구글·애플이 자체적으로 추가 throttle 하므로 과노출되지 않는다.
//   ⚠️ 첫 세션에는 여전히 뜨지 않는다 — 온보딩 중 요청은 낮은 별점을 부른다.
const REVIEW_DAYS_KEY = 'signumhq.review.days';
const REVIEW_DONE_KEY = 'signumhq.review.prompted';
const REVIEW_SESSIONS_KEY = 'signumhq.review.sessions';
const REVIEW_LAST_KEY = 'signumhq.review.lastAsked';
const REVIEW_MILESTONES = [2, 7];
const REVIEW_SESSION_MILESTONE = 4;

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
    // 누적 «앱 실행» 횟수도 센다 — 같은 날 여러 번 여는 사용자는 «사용일» 기준에 영영 안 걸린다.
    // ⚠️ 이 함수는 대시보드 마운트마다 불린다. SPA 안에서 화면을 오가며 재마운트되면
    //    한 번 연 것을 여러 번으로 셀 수 있다 → sessionStorage 로 «앱 실행당 1회»만 센다
    //    (sessionStorage 는 WebView 를 새로 열 때 비워진다).
    let sessions = Number(localStorage.getItem(REVIEW_SESSIONS_KEY)) || 0;
    try {
      if (!sessionStorage.getItem(REVIEW_SESSIONS_KEY)) {
        sessions += 1;
        localStorage.setItem(REVIEW_SESSIONS_KEY, String(sessions));
        sessionStorage.setItem(REVIEW_SESSIONS_KEY, '1');
      }
    } catch { /* sessionStorage 불가 → 세션 경로만 건너뛴다 */ }

    const prompted: number[] = JSON.parse(localStorage.getItem(REVIEW_DONE_KEY) || '[]');

    // ⚠️ 2026-09-19 자체 결함 수리. 기준을 [3,8]→[2,7] 로 내리면서 생긴 문제다:
    //    이미 7일 넘게 쓴 «기존» 사용자는 prompted 가 비어 있으므로 다음 실행에 2 가 걸리고,
    //    그다음 실행에 7 이 «바로» 걸린다 → 연속 두 번 요청. 스토어가 자체 throttle 하더라도
    //    같은 사람에게 이틀 연속 묻는 모양은 낮은 별점을 부른다.
    //    → 한 번 요청했으면 그날은 더 묻지 않는다.
    const lastAsked = localStorage.getItem(REVIEW_LAST_KEY);
    if (lastAsked === today) return;

    let hit = REVIEW_MILESTONES.find(m => days.length >= m && !prompted.includes(m));
    // 세션 경로(0 으로 표시): 앱을 4번째 여는 사람이면 «사용일»이 하루여도 충분히 관여한 것이다.
    // 첫 세션·둘째 세션에는 절대 뜨지 않는다 — 온보딩 중 요청은 낮은 별점을 부른다.
    if (hit == null && sessions >= REVIEW_SESSION_MILESTONE && !prompted.includes(0)) hit = 0;
    if (hit == null) return;
    prompted.push(hit);
    localStorage.setItem(REVIEW_DONE_KEY, JSON.stringify(prompted));
    localStorage.setItem(REVIEW_LAST_KEY, today);
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
