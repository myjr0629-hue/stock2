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
        url: 'https://www.signumhq.com/en/app-view/dash',
        cleartext: false,
      },

  // iOS 설정
  ios: {
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
      launchShowDuration: 2000,
      launchAutoHide: false, // NativeAppProvider에서 수동 hide
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
