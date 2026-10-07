/**
 * 아이폰 «앱 안 브라우저»(WKWebView) 판정 — 쿠폰 화면의 «적용» 단추가 App Store 로 못 넘어가는 경우를 재고 안내하려고 (2026-10-07, 브랜치 fix/coupon-ios-inapp-stuck)
 *
 * 왜:
 *   쿠폰 글이 가는 곳이 Threads·Instagram 앱 안이다. 아이폰 앱 안 브라우저(WKWebView)는 apps.apple.com 이동(= 애플 쿠폰 적용 주소)을
 *   시스템 App Store 로 넘기지 못해 «눌렀는데 아무 일도 안 일어난다/빈 화면»이 될 수 있다는 보고가 있다(Instagram 앱 안 브라우저 사례 — 우리 환경은 «미측정»).
 *   안드로이드 앱 안 브라우저는 같은 문제를 intent 로 풀었지만(lib/marketing/androidInApp.ts) 아이폰은 재지도 못 했다 → 먼저 «눌렀는데 화면이 그대로인가»를 잰다.
 *
 * 판정(순수 함수): 아이폰·아이팟 UA 이고, iOS 의 다른 «진짜 브라우저»(Chrome·Firefox·Edge·Opera·Google 앱)가 아니며,
 *   (알려진 앱 안 표지가 있거나 Safari 표지(`Safari/`)가 없다). 진짜 Safari·SFSafariViewController(X·텔레그램 등)는 UA 에 `Safari/` 가 있어 아니다.
 *   아이패드(데스크톱급 UA)는 PC 취급이라 여기 오지 않는다.
 * 가족 이름은 androidInApp.inAppFamily(닫힌 목록)를 그대로 쓴다 — 측정 필드가 무한히 늘지 않는다.
 */

const IOS_RE = /iPhone|iPod/i;
/** iOS 의 진짜 브라우저(자체 앱 안 브라우저가 아니다) — Safari 표지가 없어도(Chrome 은 CriOS) 앱 안으로 보지 않는다 */
const OTHER_BROWSER_RE = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Brave|SamsungBrowser/i;
/** 알려진 앱 안 브라우저 표지(있으면 Safari/ 가 있어도 앱 안으로 본다 — 예: LINE 은 `Safari/604.1 Line/14.5.0`) */
const IOS_IN_APP_TOKEN_RE = /\bBarcelona\b|\bInstagram\b|FBAN\/|FBAV\/|FB_IAB|KAKAOTALK|KAKAOSTORY|NAVER\(inapp|\bLine\/\d|DaumApps|\bBAND\/\d|musical_ly|BytedanceWebview|Twitter for iPhone|LinkedInApp|Telegram|MicroMessenger/i;

export function isIosInAppBrowser(ua: string): boolean {
  if (!IOS_RE.test(ua)) return false;
  if (OTHER_BROWSER_RE.test(ua)) return false;
  return IOS_IN_APP_TOKEN_RE.test(ua) || !/\bSafari\//.test(ua);
}

/** 적용 단추를 누른 뒤 이 시간(ms)이 지나도 화면이 «여전히 보이면» 안 넘어간 것으로 본다(앱 전환이 일어나면 문서가 숨는다). */
export const IOS_STAY_CHECK_MS = 2500;
