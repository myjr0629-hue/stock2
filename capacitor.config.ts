import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const useLiveReload = process.env.CAPACITOR_LIVE_RELOAD === 'true';
/**
 * 프리뷰 배포를 «앱 안에서» 확인할 때 쓴다.
 *   CAPACITOR_PREVIEW_URL='https://stock2-xxx.vercel.app/en/app-view/dash?x-vercel-protection-bypass=…&x-vercel-set-bypass-cookie=true' npx cap sync ios
 * 값을 안 주면 항상 프로덕션이다 — 임시 URL 이 저장소에 남지 않는다.
 */
const previewUrl = process.env.CAPACITOR_PREVIEW_URL;

const config: CapacitorConfig = {
  appId: 'com.signumhq.app',
  appName: 'SIGNUM HQ',
  // ★ 원격 셸 앱이라 로컬 웹자산을 «쓰지 않는다» — 네트워크가 없을 때 뜨는
  //   오프라인 대체 화면 하나뿐이다. 예전엔 Next 정적 내보내기(out/)를 가리켰는데
  //   거기 마케팅 영상이 쌓이면서 앱 번들이 464MB 가 됐다(라이브는 15.4MB).
  //   webDir 은 «앱에 들어갈 것»이므로 전용 폴더로 분리한다.
  webDir: 'capacitor-shell',

  // Production: WebView → signumhq.com
  // 개발용: CAPACITOR_LIVE_RELOAD=true → 로컬 Next.js 개발 서버
  server: useLiveReload
    ? {
        url: 'http://10.0.2.2:3000',
        cleartext: true,
        allowNavigation: ['10.0.2.2:3000'],
      }
    : previewUrl
      ? {
          url: previewUrl,
          cleartext: false,
          allowNavigation: ['*.vercel.app', 'www.signumhq.com', 'signumhq.com'],
        }
      : {
          url: 'https://www.signumhq.com/en/app-view/dash',
          cleartext: false,
          // ★ 2026-09-12: 프로덕션에만 allowNavigation 이 «빠져 있었다».
          //   라이브리로드·프리뷰 분기엔 둘 다 있는데 여기만 없었다.
          //   Capacitor 는 허용 목록 밖 호스트로의 이동을 «시스템 브라우저»로 넘긴다
          //   → 앱은 그대로 있고 크롬 창만 따로 뜨는 증상이 된다(대표 관찰).
          //   실측: `signumhq.com` → `www.signumhq.com` 301. 아펙스는 «다른 호스트»라
          //   허용 목록에 없으면 그 리다이렉트 한 번에 밖으로 튕긴다.
          allowNavigation: ['www.signumhq.com', 'signumhq.com'],
        },

  // iOS 설정
  ios: {
    // 'always': WKWebView가 상·하단 세이프영역을 네이티브에서 일관되게 인셋한다.
    // (하단 AdMob 배너/탭바 정렬이 이 값 기준이라 'never'로 바꾸면 하단 정렬이 깨짐)
    // 상단 갭의 원인이던 CSS env(safe-area-inset-top) paddingTop은 제거하여 이중 인셋만 없앤다.
    contentInset: 'always',
    backgroundColor: '#050a14',
    scheme: 'signumhq',
    preferredContentMode: 'mobile',
  },

  // Android 설정
  android: {
    backgroundColor: '#050a14',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  // 플러그인 설정
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#050a14',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#050a14',
    },
    Keyboard: {
      resize: KeyboardResize.Ionic,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
