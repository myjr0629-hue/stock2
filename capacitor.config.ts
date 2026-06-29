import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const useLiveReload = process.env.CAPACITOR_LIVE_RELOAD === 'true';

const config: CapacitorConfig = {
  appId: 'com.signumhq.app',
  appName: 'SIGNUM HQ',
  webDir: 'out',

  // Production: WebView → signumhq.com
  // 개발용: CAPACITOR_LIVE_RELOAD=true → 로컬 Next.js 개발 서버
  server: useLiveReload
    ? {
        url: 'http://10.0.2.2:3000',
        cleartext: true,
        allowNavigation: ['10.0.2.2:3000'],
      }
    : {
        // No locale prefix: next-intl middleware detects the device language
        // (NEXT_LOCALE cookie → Accept-Language) and redirects to /{ko|en|ja}/app-view/dash.
        // This makes the app start in the device's language and persist the user's choice
        // across cold launches, instead of always forcing English.
        url: 'https://www.signumhq.com/app-view/dash',
        cleartext: false,
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
