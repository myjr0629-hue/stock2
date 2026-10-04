/**
 * «우리 앱(SIGNUM·UC·WIM 셸) 웹뷰에서 온 요청인가» + 루트 진입 → /app-view 이동 판정 (미들웨어 전용, Edge 호환 순수 함수)
 *
 * ★ 2026-10-04 수리: 예전 판정 `ua.includes('wv')` 는 «안드로이드 WebView 공통 표식»이었다.
 *   카카오톡·인스타그램·네이버·라인·페이스북·스레드의 안드로이드 인앱 브라우저(사람)도 전부 `; wv)` 를 단다.
 *   그래서 그 사람들이 /ko 를 열면 307 로 /ko/app-view/dash(앱 화면)로 넘어가 홈과 설치 버튼을 아예 못 봤다
 *   (운영 실측: 안드 인앱 6종 전부 307, iOS 인앱은 'wv' 가 없어 200).
 *
 * 그래서 «우리 앱만 가진 표식»으로만 판단한다:
 *   1) sig_native=1 쿠키: SIGNUM 셸이 첫 화면에서 심는다(NativeAppProvider, isNativePlatform 일 때만).
 *      앱마다 쿠키 저장소가 따로라 카카오톡 등 «다른 앱»의 인앱 브라우저에는 절대 없다.
 *   2) X-Requested-With: com.signumhq.*: 안드로이드 WebView 가 «자기 앱 패키지 이름»을 싣는 헤더
 *      (카카오톡은 com.kakao.talk). 최신 WebView 는 안 보낼 수 있어서, 있으면 쓰는 보조 표식이다.
 *   3) UA 의 `com.signumhq.`: 셸이 appendUserAgent 를 쓰면 생길 자리(지금 3앱 모두 UA 를 바꾸지 않는다).
 *
 * 'wv'·'Version/4.0'·'Mobile/15E148' 같은 «WebView 공통» 표식은 절대 쓰지 않는다.
 *
 * 앱이 깨지지 않는 근거:
 *   · 셸의 시작 주소가 이미 /en/app-view/dash 다(capacitor.config.ts, 2026-06-26~). 첫 실행은 이 판정을 거치지 않는다.
 *   · 그 첫 화면에서 쿠키가 심기므로, 이후 앱 안에서 / · /{locale} 에 닿으면 쿠키로 지금처럼 이동한다.
 *   · 쿠키도 헤더도 없는 드문 루트 진입은 NativeAppProvider 의 클라이언트 이동(root → /{locale}/app-view/dash)이 받쳐 준다.
 */
export type NativeSignals = {
  userAgent?: string | null;
  /** X-Requested-With 요청 헤더 */
  requestedWith?: string | null;
  /** sig_native 쿠키 값 */
  nativeCookie?: string | null;
};

const OUR_PACKAGE_PREFIX = 'com.signumhq.';

export function isOurNativeAppRequest(s: NativeSignals): boolean {
  if (s.nativeCookie === '1') return true;
  if ((s.requestedWith || '').trim().toLowerCase().startsWith(OUR_PACKAGE_PREFIX)) return true;
  return (s.userAgent || '').toLowerCase().includes(OUR_PACKAGE_PREFIX);
}

/** 루트(/)·언어만 있는 주소(/ko·/en·/ja)에 우리 앱이 닿으면 앱 첫 화면 경로, 아니면 null. */
export function nativeRootRedirectPath(pathname: string, s: NativeSignals): string | null {
  const isRootOrLocaleOnly = pathname === '/' || /^\/(ko|en|ja)$/.test(pathname);
  if (!isRootOrLocaleOnly || !isOurNativeAppRequest(s)) return null;
  const locale = pathname === '/' ? 'en' : pathname.slice(1);
  return `/${locale}/app-view/dash`;
}
