import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.signumhq.app',
  appName: 'SIGNUM HQ',
  webDir: 'out',

  // 프로덕션: signumhq.com 직접 로드 (SSR/API 라우트 전부 사용)
  server: {
    url: 'https://signumhq.com',
    cleartext: false,
  },

  // iOS 설정
  ios: {
    contentInset: 'always',
    backgroundColor: '#080c14',
    scheme: 'signumhq',
    preferredContentMode: 'mobile',
  },

  // Android 설정
  android: {
    backgroundColor: '#080c14',
    allowMixedContent: false,
    captureInput: true,
  },

  // 플러그인 설정 (추후 추가)
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#080c14',
      showSpinner: false,
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#080c14',
    },
  },
};

export default config;
